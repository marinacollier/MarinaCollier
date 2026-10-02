import { beforeEach, describe, expect, it } from 'vitest'
import { defaultCategories, emptyDB } from '@/data/defaults'
import { getDB, useStore } from '@/data/store'
import type { CalendarEvent, CalendarSource, DB, Expense } from '@/data/types'
import {
  applyCalendarEvents,
  applyTransactions,
  eventFields,
  findPossibleDuplicate,
  mapCategoryId,
  planActionCandidates,
  planCalendarSync,
  planTransactions,
  reconcile,
  similarDescription,
  stableStringify,
  syncHash,
} from './sync'
import type { RemoteEvent, RemoteTransaction } from './types'

const NOW = '2026-10-02T12:00:00.000Z'
const T = { createdAt: NOW, updatedAt: NOW }

function source(id: string, provider: CalendarSource['provider']): CalendarSource {
  return { ...T, id, provider, name: id, syncDirection: 'read', color: 'ocean', enabled: true }
}

const remote = (over: Partial<RemoteEvent> = {}): RemoteEvent => ({
  externalId: 'r1',
  globalId: 'uid-1@x',
  title: 'Reunião',
  date: '2026-10-05',
  startTime: '10:00',
  endTime: '11:00',
  allDay: false,
  ...over,
})

function dbWith(events: CalendarEvent[] = []): Pick<DB, 'events' | 'calendarSources'> {
  return { events, calendarSources: [source('g', 'google'), source('m', 'microsoft'), source('t', 'ics')] }
}

/** Run a plan and materialize it like the store would (for multi-step scenarios). */
function materialize(db: Pick<DB, 'events' | 'calendarSources'>, sourceId: string, r: RemoteEvent[], opts = {}) {
  const plan = planCalendarSync(db, sourceId, r, { now: NOW, ...opts })
  const created = plan.creates.map((c, i) => ({ ...T, id: `${sourceId}-${i}-${c.external!.externalId}`, ...c }) as CalendarEvent)
  const byId = new Map(db.events.map((e) => [e.id, e]))
  for (const u of plan.upserts) byId.set(u.id, u)
  return { db: { ...db, events: [...byId.values(), ...created] }, report: plan.report, plan }
}

describe('hashing', () => {
  it('stableStringify ignores key order and undefined', () => {
    expect(stableStringify({ b: 1, a: undefined, c: [1, { y: 2, x: 1 }] })).toBe('{"b":1,"c":[1,{"x":1,"y":2}]}')
    expect(syncHash({ a: 1, b: 2 })).toBe(syncHash({ b: 2, a: 1 }))
    expect(syncHash({ a: 1 })).not.toBe(syncHash({ a: 2 }))
  })
})

describe('calendar reconcile', () => {
  it('creates new events with external ref', () => {
    const { report, plan } = materialize(dbWith(), 'g', [remote()])
    expect(report).toMatchObject({ created: 1, updated: 0 })
    expect(plan.creates[0]).toMatchObject({
      sourceId: 'g',
      title: 'Reunião',
      external: { provider: 'google', externalId: 'r1', globalId: 'uid-1@x', syncStatus: 'synced', lastSyncedAt: NOW },
    })
  })

  it('unchanged when the hash matches, updated when remote changes (keeping local-only fields)', () => {
    let s = materialize(dbWith(), 'g', [remote()])
    const tagged = { ...s.db.events[0], kind: 'trabalho' as const, projectId: 'proj-santander' }
    s.db = { ...s.db, events: [tagged] }
    expect(materialize(s.db, 'g', [remote()]).report).toMatchObject({ unchanged: 1, updated: 0 })
    s = materialize(s.db, 'g', [remote({ title: 'Reunião (sala 3)' })])
    expect(s.report.updated).toBe(1)
    expect(s.db.events[0]).toMatchObject({ title: 'Reunião (sala 3)', kind: 'trabalho', projectId: 'proj-santander' })
  })

  it('remote deletion → soft delete (deleted_remotely), restored if it comes back', () => {
    let s = materialize(dbWith(), 'g', [remote()])
    s = materialize(s.db, 'g', [remote({ deleted: true })])
    expect(s.report.deleted).toBe(1)
    expect(s.db.events).toHaveLength(1)
    expect(s.db.events[0].external?.syncStatus).toBe('deleted_remotely')
    // Deleting again is a no-op
    expect(materialize(s.db, 'g', [remote({ deleted: true })]).report).toMatchObject({ deleted: 0, unchanged: 1 })
    s = materialize(s.db, 'g', [remote()])
    expect(s.report.updated).toBe(1)
    expect(s.db.events[0].external?.syncStatus).toBe('synced')
  })

  it('full sync: missing events inside the range are deleted, outside the range kept', () => {
    let s = materialize(dbWith(), 'g', [remote(), remote({ externalId: 'r2', globalId: 'uid-2', date: '2026-12-01' })])
    s = materialize(s.db, 'g', [], { fullSync: true, range: { from: '2026-10-01', to: '2026-10-31' } })
    expect(s.report.deleted).toBe(1)
    expect(s.db.events.find((e) => e.external?.externalId === 'r2')?.external?.syncStatus).toBe('synced')
  })

  it('remote deleted and never seen → ignored', () => {
    expect(materialize(dbWith(), 'g', [remote({ deleted: true })]).report).toMatchObject({ created: 0, deleted: 0 })
  })

  it('local edit of a mirrored field + remote change → conflict, local kept', () => {
    let s = materialize(dbWith(), 'g', [remote()])
    s.db = { ...s.db, events: [{ ...s.db.events[0], title: 'Meu título' }] }
    s = materialize(s.db, 'g', [remote({ startTime: '10:30' })])
    expect(s.report.conflicts).toBe(1)
    expect(s.db.events[0]).toMatchObject({ title: 'Meu título', startTime: '10:00' })
    expect(s.db.events[0].external?.syncStatus).toBe('conflict')
  })

  it('same iCalUID from another provider (Google vs Outlook vs Toki) is not duplicated', () => {
    let s = materialize(dbWith(), 'g', [remote()])
    s = materialize(s.db, 'm', [remote({ externalId: 'AAMk-outlook-id', globalId: 'UID-1@X' })])
    expect(s.report).toMatchObject({ created: 0, unchanged: 1 })
    expect(s.db.events).toHaveLength(1)
  })

  it('globalId dedupe is per date (recurring instances share Google iCalUID)', () => {
    let s = materialize(dbWith(), 'g', [remote()])
    s = materialize(s.db, 'm', [remote({ externalId: 'x2', date: '2026-10-12' })])
    expect(s.report.created).toBe(1)
  })

  it('duplicates inside a single payload collapse', () => {
    const { report } = materialize(dbWith(), 'g', [remote(), remote({ externalId: 'r1-copy' })])
    expect(report).toMatchObject({ created: 1, unchanged: 1 })
  })

  it('events deleted remotely in another source do not block a create', () => {
    let s = materialize(dbWith(), 'g', [remote()])
    s = materialize(s.db, 'g', [remote({ deleted: true })])
    s = materialize(s.db, 'm', [remote({ externalId: 'ms' })])
    expect(s.report.created).toBe(1)
  })

  it('reconcile is provider-scoped: a local event of another provider with same externalId is not matched', () => {
    const d = reconcile({
      provider: 'google',
      owned: [{ id: 'a', external: { provider: 'microsoft', externalId: 'r1', syncStatus: 'synced' } }],
      remote: [{ externalId: 'r1' }],
      hash: () => 'h',
    })
    expect(d[0].kind).toBe('create')
  })

  it('eventFields drops times for all-day and same-day endDate', () => {
    expect(eventFields(remote({ allDay: true, endDate: '2026-10-05' }))).toMatchObject({ startTime: undefined, endTime: undefined, endDate: undefined })
  })
})

describe('applyCalendarEvents (store)', () => {
  beforeEach(() => {
    const db = emptyDB()
    db.calendarSources = [source('g', 'google')]
    useStore.setState({ db, hydrated: true })
  })

  it('writes creates/updates and stamps lastSync', () => {
    expect(applyCalendarEvents('g', [remote()], { now: NOW })).toMatchObject({ created: 1 })
    expect(applyCalendarEvents('g', [remote({ title: 'Nova' })], { now: NOW })).toMatchObject({ updated: 1 })
    const db = getDB()
    expect(db.events).toHaveLength(1)
    expect(db.events[0].title).toBe('Nova')
    expect(db.calendarSources[0].lastSync).toBe(NOW)
  })
})

// ─── Finance ────────────────────────────────────────────────────────────────

const tx = (over: Partial<RemoteTransaction> = {}): RemoteTransaction => ({
  externalId: '15',
  description: 'PAG*IFOOD',
  amountCents: -4590,
  date: '2026-10-01',
  paid: true,
  categoryExternalId: '21',
  accountExternalId: 'acc-3',
  ...over,
})

const manual = (over: Partial<Expense> = {}): Expense => ({
  ...T,
  id: 'm1',
  title: 'iFood almoço',
  amountCents: 4590,
  date: '2026-10-02',
  categoryId: 'cat-restaurante',
  status: 'paid',
  origin: 'manual',
  ...over,
})

function finDB(expenses: Expense[] = []): Pick<DB, 'expenses' | 'financialCategories' | 'financialAccounts'> {
  return {
    expenses,
    financialCategories: defaultCategories(NOW),
    financialAccounts: [
      { ...T, id: 'fa1', name: 'Nubank', kind: 'conta', archived: false, external: { provider: 'organizze', externalId: 'acc-3', syncStatus: 'synced' } },
    ],
  }
}

describe('transactions', () => {
  it('only paid expenses (negative amounts) are imported, as positive cents', () => {
    const plan = planTransactions(finDB(), [tx(), tx({ externalId: '16', amountCents: 500000, description: 'Salário' }), tx({ externalId: '17', paid: false })], { now: NOW })
    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0]).toMatchObject({
      title: 'PAG*IFOOD',
      amountCents: 4590,
      date: '2026-10-01',
      origin: 'organizze',
      status: 'paid',
      accountId: 'fa1',
      external: { provider: 'organizze', externalId: '15', syncStatus: 'synced' },
    })
  })

  it('maps categories by name, falls back to cat-outros', () => {
    const db = finDB()
    expect(mapCategoryId(db, '21', [{ externalId: '21', name: 'MERCADO' }])).toBe('cat-mercado')
    expect(mapCategoryId(db, '22', [{ externalId: '22', name: 'Educação' }])).toBe('cat-educacao')
    expect(mapCategoryId(db, '99', [{ externalId: '99', name: 'Pets & cia' }])).toBe('cat-outros')
    expect(mapCategoryId(db, undefined, [])).toBe('cat-outros')
  })

  it('flags a possible duplicate of a manual expense instead of merging', () => {
    const plan = planTransactions(finDB([manual()]), [tx()], { now: NOW })
    expect(plan.report).toMatchObject({ created: 0, conflicts: 1 })
    expect(plan.creates[0]).toMatchObject({ possibleDuplicateOf: 'm1', external: { syncStatus: 'conflict' } })
    expect(plan.upserts).toHaveLength(0) // manual one untouched
  })

  it('duplicate rules: amount equal, date ±2 days, similar description', () => {
    const list = [manual()]
    expect(findPossibleDuplicate(list, { amountCents: 4590, date: '2026-10-04', title: 'IFOOD *RESTAURANTE' })?.id).toBe('m1')
    expect(findPossibleDuplicate(list, { amountCents: 4590, date: '2026-10-05', title: 'IFOOD' })).toBeUndefined()
    expect(findPossibleDuplicate(list, { amountCents: 4591, date: '2026-10-02', title: 'IFOOD' })).toBeUndefined()
    expect(findPossibleDuplicate(list, { amountCents: 4590, date: '2026-10-02', title: 'Posto Shell' })).toBeUndefined()
    expect(findPossibleDuplicate([manual({ origin: 'organizze' })], { amountCents: 4590, date: '2026-10-02', title: 'ifood' })).toBeUndefined()
  })

  it('one manual expense is only claimed once', () => {
    const plan = planTransactions(finDB([manual()]), [tx(), tx({ externalId: '18' })], { now: NOW })
    expect(plan.creates.filter((c) => c.possibleDuplicateOf === 'm1')).toHaveLength(1)
  })

  it('similarDescription', () => {
    expect(similarDescription('Uber *trip', 'uber pra casa')).toBe(true)
    expect(similarDescription('MERCADO PAO DE ACUCAR', 'Pão de Açúcar')).toBe(true)
    expect(similarDescription('Farmácia', 'Academia')).toBe(false)
    expect(similarDescription('PIX 123', 'Pix')).toBe(true) // nothing meaningful → amount/date decide
  })

  it('re-sync: unchanged, updated keeps local category, vanished in range → deleted', () => {
    const first = planTransactions(finDB(), [tx()], { now: NOW })
    const imported: Expense = { ...T, id: 'x1', ...first.creates[0] } as Expense
    const recat = { ...imported, categoryId: 'cat-lazer' }
    expect(planTransactions(finDB([recat]), [tx()], { now: NOW }).report.unchanged).toBe(1)
    const upd = planTransactions(finDB([recat]), [tx({ amountCents: -5000 })], { now: NOW })
    expect(upd.upserts[0]).toMatchObject({ amountCents: 5000, categoryId: 'cat-lazer' })
    const del = planTransactions(finDB([recat]), [], { now: NOW, range: { from: '2026-10-01', to: '2026-10-31' } })
    expect(del.report.deleted).toBe(1)
    expect(del.upserts[0].external?.syncStatus).toBe('deleted_remotely')
  })

  it('applyTransactions writes to the store', () => {
    const db = emptyDB()
    db.financialCategories = defaultCategories(NOW)
    useStore.setState({ db, hydrated: true })
    expect(applyTransactions([tx()], { categories: [{ externalId: '21', name: 'Restaurante' }] }).created).toBe(1)
    expect(getDB().expenses[0]).toMatchObject({ categoryId: 'cat-restaurante', origin: 'organizze' })
    expect(applyTransactions([tx()]).unchanged).toBe(1)
    expect(getDB().expenses).toHaveLength(1)
  })
})

describe('work inbox candidates', () => {
  it('creates metadata-only items once and never overwrites triage', () => {
    const c = { externalId: 'm-1', source: 'outlook' as const, subject: 'Aprovação do contrato', sender: 'Ana', receivedAt: NOW, webUrl: 'https://outlook.office.com/x', suggestedKind: 'aprovacao' as const }
    const first = planActionCandidates({ workInbox: [] }, [c, c], NOW)
    expect(first.report).toMatchObject({ created: 1, unchanged: 1 })
    expect(first.creates[0]).toMatchObject({ status: 'novo', kind: 'aprovacao', link: c.webUrl, external: { provider: 'outlook', externalId: 'm-1' } })
    expect(Object.keys(first.creates[0])).not.toContain('body')
    const existing = { ...T, id: 'w', ...first.creates[0], status: 'ignorado' as const }
    expect(planActionCandidates({ workInbox: [existing] }, [c], NOW).creates).toHaveLength(0)
  })
})
