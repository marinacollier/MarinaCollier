/**
 * Sync engine. Pure planning functions (heavily tested) + thin `apply*` wrappers that write to the store.
 *
 * Identity
 *  1. provider + externalId inside the sync scope (e.g. one calendar source).
 *  2. globalId (iCalUID) + start date across every other source/provider — the same meeting coming
 *     from Google, Outlook and Toki-written calendars is shown once. (Google keeps one iCalUID for all
 *     instances of a recurring series, so the date is part of the key.)
 *
 * Outcomes: created / updated / deleted (soft: external.syncStatus = 'deleted_remotely', the record is
 * kept and hidden) / unchanged / conflict (Marina edited a mirrored field locally, or an imported
 * expense looks like a manual one). Conflicts are never resolved silently.
 */
import { actions, getDB } from '@/data/store'
import type {
  CalendarEvent,
  DB,
  Expense,
  ExternalRef,
  FinancialAccount,
  ISODateTime,
  NewItem,
  ProviderId,
  WorkInboxItem,
} from '@/data/types'
import { diffDays, isBetween } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'
import type {
  RemoteAccount,
  RemoteActionCandidate,
  RemoteCategory,
  RemoteEvent,
  RemoteTransaction,
  SyncReport,
} from './types'
import { EMPTY_REPORT } from './types'

// ─── Hashing ────────────────────────────────────────────────────────────────

/** Deterministic JSON: sorted keys, undefined dropped. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/** FNV-1a 32-bit over the stable JSON — enough to detect "remote changed". */
export function syncHash(value: unknown): string {
  const s = stableStringify(value)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ─── Generic reconcile ──────────────────────────────────────────────────────

export interface RemoteKeyed {
  externalId: string
  globalId?: string
  deleted?: boolean
  date?: string
}

export interface LocalKeyed {
  id: string
  date?: string
  external?: ExternalRef
}

export type Decision<L, R> =
  | { kind: 'create'; remote: R; hash: string }
  | { kind: 'update'; local: L; remote: R; hash: string }
  | { kind: 'unchanged'; local: L; remote: R }
  | { kind: 'delete'; local: L }
  | { kind: 'conflict'; local: L; remote: R; hash: string }
  /** Same globalId+date already present from another source/provider (or earlier in this batch). Skipped. */
  | { kind: 'duplicate'; remote: R; of?: L }

export interface ReconcileInput<L extends LocalKeyed, R extends RemoteKeyed> {
  provider: ProviderId
  /** Local records belonging to this sync scope (e.g. events of this calendar source). */
  owned: L[]
  /** Other local records, only used to detect cross-provider duplicates by globalId. */
  others?: L[]
  remote: R[]
  /** Hash of the mirrored fields of a remote record. */
  hash: (r: R) => string
  /** Hash of the same mirrored fields as currently stored locally (detects local edits). */
  localHash?: (l: L) => string
  /** Remote list is complete for the scope: owned records missing from it were deleted remotely. */
  fullSync?: boolean
  /** Limits deletion-on-missing (e.g. only records inside the fetched date range). */
  inScope?: (l: L) => boolean
}

function globalKey(globalId: string | undefined, date: string | undefined): string | undefined {
  return globalId ? `${globalId.trim().toLowerCase()}|${date ?? ''}` : undefined
}

export function reconcile<L extends LocalKeyed, R extends RemoteKeyed>(input: ReconcileInput<L, R>): Decision<L, R>[] {
  const { provider, owned, others = [], remote, hash, localHash, fullSync, inScope } = input
  const byExternal = new Map<string, L>()
  for (const l of owned) if (l.external?.provider === provider) byExternal.set(l.external.externalId, l)

  const byGlobal = new Map<string, L>()
  for (const l of others) {
    if (l.external?.syncStatus === 'deleted_remotely') continue
    const k = globalKey(l.external?.globalId, l.date)
    if (k && !byGlobal.has(k)) byGlobal.set(k, l)
  }
  // Owned records also claim their globalId, so a remote item with a new externalId but the same
  // iCalUID (e.g. re-exported file) is not duplicated.
  for (const l of owned) {
    if (l.external?.syncStatus === 'deleted_remotely') continue
    const k = globalKey(l.external?.globalId, l.date)
    if (k && !byGlobal.has(k)) byGlobal.set(k, l)
  }

  const ownedIds = new Set(owned.map((l) => l.id))
  const out: Decision<L, R>[] = []
  const seen = new Set<string>()
  const batchKeys = new Set<string>()

  for (const r of remote) {
    const local = byExternal.get(r.externalId)
    if (local) {
      if (seen.has(local.id)) continue // same remote id twice in one payload
      seen.add(local.id)
      const ext = local.external!
      if (r.deleted) {
        out.push(ext.syncStatus === 'deleted_remotely' ? { kind: 'unchanged', local, remote: r } : { kind: 'delete', local })
        continue
      }
      const h = hash(r)
      if (ext.syncStatus === 'deleted_remotely') out.push({ kind: 'update', local, remote: r, hash: h })
      else if (ext.syncHash === h) out.push({ kind: 'unchanged', local, remote: r })
      else if (ext.syncStatus === 'conflict' || (localHash && ext.syncHash && localHash(local) !== ext.syncHash))
        out.push({ kind: 'conflict', local, remote: r, hash: h })
      else out.push({ kind: 'update', local, remote: r, hash: h })
      continue
    }
    if (r.deleted) continue
    const k = globalKey(r.globalId, r.date)
    if (k && byGlobal.has(k)) {
      const of = byGlobal.get(k)!
      if (ownedIds.has(of.id)) seen.add(of.id)
      out.push({ kind: 'duplicate', remote: r, of })
      continue
    }
    if (k && batchKeys.has(k)) {
      out.push({ kind: 'duplicate', remote: r })
      continue
    }
    if (k) batchKeys.add(k)
    out.push({ kind: 'create', remote: r, hash: hash(r) })
  }

  if (fullSync) {
    for (const l of owned) {
      if (seen.has(l.id) || l.external?.provider !== provider) continue
      if (l.external.syncStatus === 'deleted_remotely') continue
      if (inScope && !inScope(l)) continue
      out.push({ kind: 'delete', local: l })
    }
  }
  return out
}

export function summarize(decisions: { kind: Decision<LocalKeyed, RemoteKeyed>['kind'] }[]): SyncReport {
  const r = { ...EMPTY_REPORT }
  for (const d of decisions) {
    if (d.kind === 'create') r.created++
    else if (d.kind === 'update') r.updated++
    else if (d.kind === 'delete') r.deleted++
    else if (d.kind === 'conflict') r.conflicts++
    else r.unchanged++
  }
  return r
}

/** Hide records the provider deleted (they are kept so nothing disappears without a trace). */
export function isHiddenBySync(item: { external?: ExternalRef }): boolean {
  return item.external?.syncStatus === 'deleted_remotely'
}

// ─── Calendar ───────────────────────────────────────────────────────────────

type EventFields = Pick<
  CalendarEvent,
  'title' | 'date' | 'startTime' | 'endTime' | 'endDate' | 'allDay' | 'location' | 'url' | 'recurrence'
>

export function eventFields(e: RemoteEvent | CalendarEvent): EventFields {
  return {
    title: e.title,
    date: e.date,
    startTime: e.allDay ? undefined : e.startTime,
    endTime: e.allDay ? undefined : e.endTime,
    endDate: e.endDate && e.endDate !== e.date ? e.endDate : undefined,
    allDay: e.allDay,
    location: e.location || undefined,
    url: e.url || undefined,
    recurrence: e.recurrence,
  }
}

const eventHash = (e: RemoteEvent | CalendarEvent) => syncHash(eventFields(e))

export interface CalendarPlan {
  creates: NewItem<'events'>[]
  upserts: CalendarEvent[]
  report: SyncReport
}

export interface CalendarSyncOptions {
  /** The payload is the complete list for the source (ICS file) or for `range`. */
  fullSync?: boolean
  /** Fetched date range: only events inside it can be deleted-on-missing. */
  range?: { from: string; to: string }
  now?: ISODateTime
}

export function planCalendarSync(
  db: Pick<DB, 'events' | 'calendarSources'>,
  sourceId: string,
  remote: RemoteEvent[],
  opts: CalendarSyncOptions = {},
): CalendarPlan {
  const source = db.calendarSources.find((s) => s.id === sourceId)
  if (!source) throw new Error(`Calendar source not found: ${sourceId}`)
  const provider = source.provider
  const now = opts.now ?? nowISO()
  const owned = db.events.filter((e) => e.sourceId === sourceId)
  const others = db.events.filter((e) => e.sourceId !== sourceId)
  const range = opts.range
  const decisions = reconcile<CalendarEvent, RemoteEvent>({
    provider,
    owned,
    others,
    remote,
    hash: eventHash,
    localHash: eventHash,
    fullSync: opts.fullSync,
    inScope: range ? (e) => isBetween(e.date, range.from, range.to) : undefined,
  })

  const creates: NewItem<'events'>[] = []
  const upserts: CalendarEvent[] = []
  const ref = (r: RemoteEvent, hash: string, status: ExternalRef['syncStatus'] = 'synced'): ExternalRef => ({
    provider,
    externalId: r.externalId,
    accountId: source.externalAccountId,
    globalId: r.globalId,
    lastSyncedAt: now,
    syncStatus: status,
    syncHash: hash,
    webUrl: r.url,
  })

  for (const d of decisions) {
    if (d.kind === 'create') {
      creates.push({ sourceId, ...eventFields(d.remote), external: ref(d.remote, d.hash) })
    } else if (d.kind === 'update') {
      // Keep local-only fields (kind, notes, projectId, tripId); replace mirrored ones.
      upserts.push({ ...d.local, ...eventFields(d.remote), updatedAt: now, external: ref(d.remote, d.hash) })
    } else if (d.kind === 'delete') {
      upserts.push({ ...d.local, updatedAt: now, external: { ...d.local.external!, syncStatus: 'deleted_remotely', lastSyncedAt: now } })
    } else if (d.kind === 'conflict') {
      // Keep Marina's version; remember the remote hash is different.
      upserts.push({ ...d.local, external: { ...d.local.external!, syncStatus: 'conflict', lastSyncedAt: now } })
    }
  }
  return { creates, upserts, report: summarize(decisions) }
}

/** Reconcile remote events into a calendar source and write the result to the store. */
export function applyCalendarEvents(sourceId: string, remote: RemoteEvent[], opts: CalendarSyncOptions = {}): SyncReport {
  const now = opts.now ?? nowISO()
  const plan = planCalendarSync(getDB(), sourceId, remote, { ...opts, now })
  if (plan.creates.length) actions.createMany('events', plan.creates)
  if (plan.upserts.length) actions.upsertMany('events', plan.upserts)
  actions.update('calendarSources', sourceId, { lastSync: now })
  return plan.report
}

// ─── Finance (Organizze) ────────────────────────────────────────────────────

const STOP = new Set(['pag', 'pagto', 'pagamento', 'compra', 'compras', 'pix', 'deb', 'debito', 'cred', 'credito', 'com', 'para', 'dos', 'das', 'que', 'ltda', 'www'])

function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOP.has(t))
}

/** Loose "same purchase?" check between a bank-ish description and Marina's own title. */
export function similarDescription(a: string, b: string): boolean {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return true // nothing meaningful to compare: amount + date decide
  const sa = new Set(ta)
  const sb = new Set(tb)
  const inter = [...sa].filter((t) => sb.has(t)).length
  if (inter / Math.min(sa.size, sb.size) >= 0.5) return true
  const ca = normalize(a).replace(/[^a-z0-9]/g, '')
  const cb = normalize(b).replace(/[^a-z0-9]/g, '')
  return ta.some((t) => t.length >= 4 && cb.includes(t)) || tb.some((t) => t.length >= 4 && ca.includes(t))
}

/** Manual expense that looks like the same purchase (same amount, date ±2 days, similar text). */
export function findPossibleDuplicate(
  expenses: Expense[],
  tx: { amountCents: number; date: string; title: string },
  claimed: Set<string> = new Set(),
): Expense | undefined {
  return expenses.find(
    (e) =>
      e.origin === 'manual' &&
      e.status === 'paid' &&
      !!e.date &&
      !claimed.has(e.id) &&
      e.amountCents === tx.amountCents &&
      Math.abs(diffDays(e.date, tx.date)) <= 2 &&
      similarDescription(e.title, tx.title),
  )
}

export function mapCategoryId(
  db: Pick<DB, 'financialCategories'>,
  categoryExternalId: string | undefined,
  remoteCategories: RemoteCategory[],
): string {
  const remoteName = remoteCategories.find((c) => c.externalId === categoryExternalId)?.name
  if (remoteName) {
    const n = normalize(remoteName)
    const local = db.financialCategories.find((c) => !c.archived && normalize(c.name) === n)
    if (local) return local.id
  }
  return 'cat-outros'
}

type ExpenseFields = Pick<Expense, 'title' | 'amountCents' | 'date'>

function txFields(t: RemoteTransaction): ExpenseFields {
  return { title: t.description.trim() || 'Gasto do Organizze', amountCents: Math.abs(t.amountCents), date: t.date }
}
const expenseHash = (e: ExpenseFields) => syncHash({ title: e.title, amountCents: e.amountCents, date: e.date })

export interface TransactionPlan {
  creates: NewItem<'expenses'>[]
  upserts: Expense[]
  report: SyncReport
}

export interface TransactionSyncOptions {
  categories?: RemoteCategory[]
  /** Fetched range: imported expenses inside it that vanished remotely are marked deleted. */
  range?: { from: string; to: string }
  now?: ISODateTime
}

/**
 * Only paid expenses (amountCents < 0 and paid) become Expenses. Income and unpaid bills are ignored.
 * A transaction that looks like a manual expense is imported with possibleDuplicateOf + syncStatus
 * 'conflict' — Marina decides; nothing is merged.
 */
export function planTransactions(
  db: Pick<DB, 'expenses' | 'financialCategories' | 'financialAccounts'>,
  remote: RemoteTransaction[],
  opts: TransactionSyncOptions = {},
): TransactionPlan {
  const now = opts.now ?? nowISO()
  const relevant = remote.filter((t) => t.amountCents < 0 && (t.paid || isOwned(db.expenses, t.externalId)))
  const owned = db.expenses.filter((e) => e.external?.provider === 'organizze')
  const range = opts.range
  const decisions = reconcile<Expense, RemoteTransaction & { deleted?: boolean }>({
    provider: 'organizze',
    owned,
    remote: relevant.map((t) => (t.paid ? t : { ...t, deleted: true })),
    hash: (t) => expenseHash(txFields(t)),
    localHash: (e) => expenseHash({ title: e.title, amountCents: e.amountCents, date: e.date }),
    fullSync: !!range,
    inScope: range ? (e) => !!e.date && isBetween(e.date, range.from, range.to) : undefined,
  })

  const claimed = new Set(db.expenses.map((e) => e.possibleDuplicateOf).filter((x): x is string => !!x))
  const creates: NewItem<'expenses'>[] = []
  const upserts: Expense[] = []
  const report = { ...EMPTY_REPORT }
  const accountId = (t: RemoteTransaction) =>
    db.financialAccounts.find((a) => a.external?.provider === 'organizze' && a.external.externalId === t.accountExternalId)?.id
  const ref = (t: RemoteTransaction, hash: string, syncStatus: ExternalRef['syncStatus']): ExternalRef => ({
    provider: 'organizze',
    externalId: t.externalId,
    lastSyncedAt: now,
    syncStatus,
    syncHash: hash,
  })

  for (const d of decisions) {
    switch (d.kind) {
      case 'create': {
        const fields = txFields(d.remote)
        const dup = findPossibleDuplicate(db.expenses, { ...fields, date: fields.date! }, claimed)
        if (dup) claimed.add(dup.id)
        creates.push({
          ...fields,
          categoryId: mapCategoryId(db, d.remote.categoryExternalId, opts.categories ?? []),
          accountId: accountId(d.remote),
          status: 'paid',
          origin: 'organizze',
          external: ref(d.remote, d.hash, dup ? 'conflict' : 'synced'),
          possibleDuplicateOf: dup?.id,
        })
        if (dup) report.conflicts++
        else report.created++
        break
      }
      case 'update':
        // Category stays as Marina set it locally.
        upserts.push({ ...d.local, ...txFields(d.remote), updatedAt: now, external: ref(d.remote, d.hash, d.local.possibleDuplicateOf ? 'conflict' : 'synced') })
        report.updated++
        break
      case 'delete':
        upserts.push({ ...d.local, updatedAt: now, external: { ...d.local.external!, syncStatus: 'deleted_remotely', lastSyncedAt: now } })
        report.deleted++
        break
      case 'conflict':
        upserts.push({ ...d.local, external: { ...d.local.external!, syncStatus: 'conflict', lastSyncedAt: now } })
        report.conflicts++
        break
      default:
        report.unchanged++
    }
  }
  return { creates, upserts, report }
}

function isOwned(expenses: Expense[], externalId: string): boolean {
  return expenses.some((e) => e.external?.provider === 'organizze' && e.external.externalId === externalId)
}

export function applyTransactions(remote: RemoteTransaction[], opts: TransactionSyncOptions = {}): SyncReport {
  const plan = planTransactions(getDB(), remote, opts)
  if (plan.creates.length) actions.createMany('expenses', plan.creates)
  if (plan.upserts.length) actions.upsertMany('expenses', plan.upserts)
  return plan.report
}

/** Mirror Organizze accounts/cards into FinancialAccount (name/kind/days; archived flag stays local). */
export function applyAccounts(remote: RemoteAccount[], now: ISODateTime = nowISO()): SyncReport {
  const db = getDB()
  const report = { ...EMPTY_REPORT }
  const creates: NewItem<'financialAccounts'>[] = []
  const upserts: FinancialAccount[] = []
  for (const r of remote) {
    const hash = syncHash({ name: r.name, kind: r.kind, closingDay: r.closingDay, dueDay: r.dueDay, balanceCents: r.balanceCents })
    const local = db.financialAccounts.find((a) => a.external?.provider === 'organizze' && a.external.externalId === r.externalId)
    const external: ExternalRef = { provider: 'organizze', externalId: r.externalId, syncStatus: 'synced', syncHash: hash, lastSyncedAt: now }
    const fields = { name: r.name, kind: r.kind, closingDay: r.closingDay, dueDay: r.dueDay, balanceCents: r.balanceCents }
    if (!local) {
      creates.push({ ...fields, archived: false, external })
      report.created++
    } else if (local.external?.syncHash === hash) report.unchanged++
    else {
      upserts.push({ ...local, ...fields, updatedAt: now, external })
      report.updated++
    }
  }
  if (creates.length) actions.createMany('financialAccounts', creates)
  if (upserts.length) actions.upsertMany('financialAccounts', upserts)
  return report
}

// ─── Work Inbox (Outlook / Teams metadata) ──────────────────────────────────

/**
 * New candidates become Work Inbox items with status 'novo'. Existing ones are never touched:
 * Marina's triage (virou tarefa / ignorado...) wins. Only metadata is stored.
 */
export function planActionCandidates(
  db: Pick<DB, 'workInbox'>,
  candidates: RemoteActionCandidate[],
  now: ISODateTime = nowISO(),
): { creates: NewItem<'workInbox'>[]; report: SyncReport } {
  const known = new Set(
    db.workInbox.filter((w) => w.external).map((w) => `${w.external!.provider}|${w.external!.externalId}`),
  )
  const creates: NewItem<'workInbox'>[] = []
  const report = { ...EMPTY_REPORT }
  for (const c of candidates) {
    const provider: ProviderId = c.source === 'outlook' ? 'outlook' : 'teams'
    const key = `${provider}|${c.externalId}`
    if (known.has(key)) {
      report.unchanged++
      continue
    }
    known.add(key)
    const item: Omit<WorkInboxItem, 'id' | 'createdAt' | 'updatedAt'> = {
      source: c.source,
      subject: c.subject.slice(0, 300),
      sender: c.sender,
      receivedAt: c.receivedAt,
      kind: c.suggestedKind ?? 'action_item',
      summary: c.summary,
      link: c.webUrl,
      status: 'novo',
      external: { provider, externalId: c.externalId, syncStatus: 'synced', lastSyncedAt: now, webUrl: c.webUrl },
    }
    creates.push(item)
    report.created++
  }
  return { creates, report }
}

export function applyActionCandidates(candidates: RemoteActionCandidate[]): SyncReport {
  const plan = planActionCandidates(getDB(), candidates)
  if (plan.creates.length) actions.createMany('workInbox', plan.creates)
  return plan.report
}
