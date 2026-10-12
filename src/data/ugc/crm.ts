/**
 * CRM Marcas — the relationship side of UGC Business, pure (DB in → DB out, nothing written here).
 *
 * Relationship status (press kit, coupon, affiliate, negative, waiting) lives on the Brand (`crm`);
 * the paid-UGC pipeline stays in UgcOpportunity. Press kits, barter, affiliations and spontaneous content
 * are history — never UGC revenue.
 *
 * Reconciliation rules (paste/import and the seed share them):
 * - one brand per company: exact normalized name, or an EXPLICIT alias below — never a look-alike;
 * - a dated status only replaces an older or undated one (her newer status is never overwritten);
 *   an undated fact only fills what is empty;
 * - running it twice changes nothing (no duplicate, no updatedAt bump).
 */
import type { Brand, BrandCrm, DateKey, DB, Expense, ID, Task, UgcCrmStatus, UgcOpportunity } from '../types'
import { SEED_IDS } from '../seed/ids'
import { isDateKey } from '@/lib/date'
import { nowISO, uid } from '@/lib/id'
import { normalize } from '@/lib/text'

export const CRM_STATUS_LABEL: Record<UgcCrmStatus, string> = {
  prospect_pago: 'Prospect — UGC pago',
  aguardando_retorno: 'Aguardando retorno',
  aguardando_resposta: 'Aguardando resposta',
  negociacao: 'Em negociação',
  press_kit: 'Press kit recebido',
  afiliada_sem_vagas: 'Afiliada — sem vagas UGC/influencer',
  negativa: 'Negativa — removida da comunidade',
}
export const CRM_STATUSES = Object.keys(CRM_STATUS_LABEL) as UgcCrmStatus[]

/** Canonical name ← other spellings she confirmed (12/10/2026). Explicit only. */
export const BRAND_ALIASES: Record<string, string[]> = {
  Feelgomy: ['Feelgoomy'],
  'Snugg Wear': ['Snug'],
  'Z2 Performance': ['Z2'],
  Vitergyl: ['Vitergel'],
}

export const brandKey = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '')

export function canonicalName(name: string): string {
  const k = brandKey(name)
  for (const [canon, aliases] of Object.entries(BRAND_ALIASES)) if (brandKey(canon) === k || aliases.some((a) => brandKey(a) === k)) return canon
  return name.trim()
}

/** The same company: exact key of the name, its explicit aliases, or an alias stored on the brand. */
export function matchBrand(brands: Brand[], name: string): Brand | undefined {
  const canon = canonicalName(name)
  const keys = new Set([canon, ...(BRAND_ALIASES[canon] ?? [])].map(brandKey))
  keys.add(brandKey(name))
  return brands.find((b) => keys.has(brandKey(b.name)) || b.aliases?.some((a) => keys.has(brandKey(a))))
}

// ─── Rows ───────────────────────────────────────────────────────────────────

export interface CrmRow {
  name: string
  status?: UgcCrmStatus
  /** Day of the evidence (a dated row may replace an older status). */
  statusAt?: DateKey
  evidence?: string
  pressKit?: boolean
  pressKitAt?: DateKey
  /** A code, or true when the coupon is confirmed but its code wasn't given. */
  coupon?: string | true
  affiliate?: boolean
  paidProspect?: boolean
  proposalSentAt?: DateKey
  followUpFrom?: DateKey
  followUpTo?: DateKey
  category?: string
  notes?: string
}

export interface ReconcileReport {
  created: string[]
  updated: string[]
  unchanged: string[]
  skipped: { name: string; reason: string }[]
}

export interface ReconcileOptions {
  now: string
  /** Id for a brand the import creates (stable in the seed). */
  brandId?: (key: string) => ID
  oppId?: (key: string, kind: string) => ID
  /** False → that record was deleted by her (seed): never recreated. */
  mayCreate?: (id: ID) => boolean
}

const CLOSED: UgcOpportunity['status'][] = ['recusada', 'perdida', 'concluida', 'pausada']
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

function applyCrm(b: Brand, r: CrmRow): { brand: Brand; statusApplied: boolean } {
  const crm: BrandCrm = { ...(b.crm ?? {}) }
  let statusApplied = false
  if (r.status) {
    const may = !crm.status || (!!r.statusAt && (!crm.statusAt || crm.statusAt <= r.statusAt))
    if (may) {
      const before = JSON.stringify([crm.status, crm.statusAt, crm.evidence])
      if (crm.status !== r.status) crm.evidence = undefined
      crm.status = r.status
      if (r.statusAt) crm.statusAt = r.statusAt
      if (r.evidence) crm.evidence = r.evidence
      crm.noFollowUp = r.status === 'negativa' || r.status === 'afiliada_sem_vagas' ? true : undefined
      statusApplied = before !== JSON.stringify([crm.status, crm.statusAt, crm.evidence])
    }
  }
  if (r.affiliate || r.status === 'afiliada_sem_vagas') crm.affiliate = true
  if (r.paidProspect || r.status === 'prospect_pago') crm.paidProspect = true
  if (r.pressKit || r.pressKitAt) {
    const kits = crm.pressKits ?? []
    if (!kits.some((k) => !r.pressKitAt || !k.receivedAt || k.receivedAt === r.pressKitAt)) crm.pressKits = [...kits, clean({ receivedAt: r.pressKitAt })]
    else if (r.pressKitAt && !kits.some((k) => k.receivedAt)) crm.pressKits = kits.map((k, i) => (i === 0 ? { ...k, receivedAt: r.pressKitAt } : k))
    else crm.pressKits = kits
  }
  if (r.coupon) {
    const list = crm.coupons ?? []
    if (r.coupon === true) {
      if (!list.length) crm.coupons = [{}]
    } else {
      const code = r.coupon.trim()
      if (!list.some((c) => c.code && brandKey(c.code) === brandKey(code))) {
        // a confirmed coupon without code gets the code now (same coupon, not a second one)
        const i = list.findIndex((c) => !c.code)
        crm.coupons = i >= 0 ? list.map((c, j) => (j === i ? { ...c, code } : c)) : [...list, { code }]
      }
    }
  }
  const next: Brand = { ...b, crm: clean(crm) }
  if (r.category && !b.category) next.category = r.category
  if ((r.affiliate || r.status === 'afiliada_sem_vagas') && !b.relationshipStatus) next.relationshipStatus = 'afiliada'
  if (r.notes && !(b.notes ?? '').includes(r.notes)) next.notes = [b.notes, r.notes].filter(Boolean).join('\n')
  return { brand: next, statusApplied }
}

/** Apply rows to the database. Pure; returns the new DB and what happened per brand. */
export function reconcileCrm(db: DB, rows: CrmRow[], opts: ReconcileOptions): { db: DB; report: ReconcileReport } {
  const report: ReconcileReport = { created: [], updated: [], unchanged: [], skipped: [] }
  const brands = [...db.brands]
  const opps = [...db.ugcOpportunities]
  const mayCreate = opts.mayCreate ?? (() => true)
  const stamp = (r: Brand | UgcOpportunity, before?: Brand | UgcOpportunity) => (before && same({ ...before, updatedAt: '' }, { ...r, updatedAt: '' }) ? before : { ...r, updatedAt: opts.now })
  for (const r of rows) {
    const name = r.name?.trim()
    if (!name) continue
    const canon = canonicalName(name)
    const k = brandKey(canon)
    let b = matchBrand(brands, name)
    let created = false
    if (!b) {
      const id = opts.brandId?.(k) ?? uid()
      if (!mayCreate(id) || brands.some((x) => x.id === id)) {
        report.skipped.push({ name: canon, reason: 'removida por você — não recriada' })
        continue
      }
      b = { id, createdAt: opts.now, updatedAt: opts.now, name: canon }
      if (BRAND_ALIASES[canon]) b.aliases = [...BRAND_ALIASES[canon]]
      brands.push(b)
      created = true
    }
    const before = b
    let next: Brand = { ...b }
    if (brandKey(next.name) !== k) next = { ...next, name: canon, aliases: [...new Set([...(next.aliases ?? []), b.name])] }
    if (BRAND_ALIASES[canon]) {
      const missing = BRAND_ALIASES[canon].filter((a) => !(next.aliases ?? []).some((x) => brandKey(x) === brandKey(a)))
      if (missing.length) next = { ...next, aliases: [...(next.aliases ?? []), ...missing] }
    }
    const applied = applyCrm(next, r)
    next = applied.brand
    const finalBrand = stamp(next, before) as Brand
    brands[brands.findIndex((x) => x.id === b!.id)] = finalBrand

    // Opportunities (paid pipeline / waiting) — only what the row states.
    const mine = () => opps.filter((o) => o.brandId === finalBrand.id)
    const live = () => mine().filter((o) => !CLOSED.includes(o.status))
    const put = (o: UgcOpportunity, p: Partial<UgcOpportunity>) => {
      const i = opps.findIndex((x) => x.id === o.id)
      opps[i] = stamp(clean({ ...o, ...p }) as UgcOpportunity, o) as UgcOpportunity
    }
    const newOpp = (kind: string, data: Partial<UgcOpportunity>) => {
      const id = opts.oppId?.(k, kind) ?? uid()
      if (!mayCreate(id) || opps.some((x) => x.id === id)) return
      opps.push(clean({ id, createdAt: opts.now, updatedAt: opts.now, brandId: finalBrand.id, title: `${finalBrand.name} · ${kind}`, stage: 'prospectar', status: 'aberta', ...data }) as UgcOpportunity)
    }
    const status = finalBrand.crm?.status
    if (applied.statusApplied && (status === 'negativa' || status === 'afiliada_sem_vagas')) {
      // Nothing commercial to chase — unless she talked to them after the evidence.
      for (const o of live()) {
        if (r.statusAt && ((o.lastContactAt ?? '') > r.statusAt || (o.responseReceivedAt ?? '') > r.statusAt)) continue
        put(o, status === 'negativa' ? { status: 'recusada', nextFollowUpAt: undefined, followUpWindowEnd: undefined, lostReason: CRM_STATUS_LABEL.negativa } : { status: 'pausada', nextFollowUpAt: undefined, followUpWindowEnd: undefined, lostReason: CRM_STATUS_LABEL.afiliada_sem_vagas })
      }
    }
    if (applied.statusApplied && status === 'aguardando_retorno' && r.proposalSentAt) {
      const already = mine().find((o) => o.proposalSentAt === r.proposalSentAt)
      const p: Partial<UgcOpportunity> = { stage: 'contatada', status: 'aguardando_resposta', proposalSentAt: r.proposalSentAt, lastContactAt: r.proposalSentAt, cadenceFrom: r.proposalSentAt, followUpStep: 0, nextFollowUpAt: r.followUpFrom, followUpWindowEnd: r.followUpTo }
      if (!already) {
        const o = live().filter((x) => !['producao', 'entregue', 'fechada'].includes(x.stage)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        if (o && (o.lastContactAt ?? '') <= r.proposalSentAt) put(o, { ...p, stage: o.stage === 'prospectar' ? 'contatada' : o.stage })
        else if (!o) newOpp('proposta', { ...p, title: `${finalBrand.name} · proposta` })
      }
    }
    if (applied.statusApplied && status === 'aguardando_resposta' && !live().length) newOpp('contato', { stage: 'contatada', status: 'aguardando_resposta', title: `${finalBrand.name} · contato` })
    if (finalBrand.crm?.paidProspect && !live().length && !mine().some((o) => o.type === 'ugc')) newOpp('ugc-pago', { type: 'ugc', title: `${finalBrand.name} · UGC pago` })

    if (created) report.created.push(finalBrand.name)
    else if (finalBrand !== before || opps.some((o, i) => o !== db.ugcOpportunities[i] && o.brandId === finalBrand.id)) report.updated.push(finalBrand.name)
    else report.unchanged.push(finalBrand.name)
  }
  const changed = !same(brands, db.brands) || !same(opps, db.ugcOpportunities)
  return { db: changed ? { ...db, brands, ugcOpportunities: opps } : db, report: { ...report, updated: [...new Set(report.updated)].filter((n) => !report.created.includes(n)) } }
}

// ─── Paste (CSV / TSV / JSON) ───────────────────────────────────────────────

const COLS: Record<string, keyof CrmRow | 'followup'> = {
  marca: 'name', nome: 'name', name: 'name', brand: 'name', empresa: 'name',
  status: 'status', situacao: 'status', relacionamento: 'status',
  data: 'statusAt', date: 'statusAt', statusat: 'statusAt', dataevidencia: 'statusAt', ultimocontato: 'statusAt',
  evidencia: 'evidence', evidence: 'evidence',
  cupom: 'coupon', coupon: 'coupon', codigocupom: 'coupon', cupons: 'coupon',
  presskit: 'pressKit', presskitrecebido: 'pressKit',
  datapresskit: 'pressKitAt', presskitat: 'pressKitAt',
  afiliada: 'affiliate', affiliate: 'affiliate', afiliacao: 'affiliate',
  propostaenviada: 'proposalSentAt', proposalsentat: 'proposalSentAt', dataproposta: 'proposalSentAt',
  followupde: 'followUpFrom', followupfrom: 'followUpFrom', followupate: 'followUpTo', followupto: 'followUpTo',
  categoria: 'category', category: 'category', nicho: 'category',
  notas: 'notes', notes: 'notes', obs: 'notes', observacoes: 'notes',
  prospect: 'paidProspect', paidprospect: 'paidProspect', ugcpago: 'paidProspect',
}

const YES = /^(sim|s|x|yes|y|true|1|ok|confirmad[oa]|recebid[oa])$/i
const NO = /^(nao|não|n|no|false|0|-|)$/i

/** dd/mm/aaaa or aaaa-mm-dd. A date without year is NOT completed (never guessed). */
export function parseDate(v: string): DateKey | undefined {
  const s = v.trim()
  if (isDateKey(s)) return s
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (!m) return undefined
  const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return isDateKey(d) ? d : undefined
}

export function statusFromText(v: string): Pick<CrmRow, 'status' | 'affiliate' | 'pressKit' | 'paidProspect'> {
  const s = normalize(v)
  if (!s) return {}
  if (/negativ|recus|removid/.test(s)) return { status: 'negativa' }
  if (/afiliad/.test(s)) return /sem vaga/.test(s) ? { status: 'afiliada_sem_vagas', affiliate: true } : { affiliate: true }
  if (/press ?kit/.test(s)) return { status: 'press_kit', pressKit: true }
  if (/aguardando retorno|proposta/.test(s)) return { status: 'aguardando_retorno' }
  if (/aguardando/.test(s)) return { status: 'aguardando_resposta' }
  if (/negocia/.test(s)) return { status: 'negociacao' }
  if (/prospect/.test(s)) return { status: 'prospect_pago', paidProspect: true }
  return {}
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i++
      } else q = !q
    } else if (c === sep && !q) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

function rowFrom(rec: Record<string, unknown>, warnings: string[], line: number): CrmRow | undefined {
  const r: Partial<CrmRow> = {}
  for (const [rawKey, rawVal] of Object.entries(rec)) {
    const field = COLS[brandKey(rawKey)]
    if (!field || rawVal === undefined || rawVal === null) continue
    const v = typeof rawVal === 'string' ? rawVal.trim() : rawVal
    const str = String(v)
    switch (field) {
      case 'name':
        r.name = str
        break
      case 'status':
        if (CRM_STATUSES.includes(str as UgcCrmStatus)) r.status = str as UgcCrmStatus
        else Object.assign(r, { ...statusFromText(str), ...r })
        if (r.status === 'press_kit') r.pressKit = true
        if (r.status === 'afiliada_sem_vagas') r.affiliate = true
        if (r.status === 'prospect_pago') r.paidProspect = true
        break
      case 'statusAt':
      case 'pressKitAt':
      case 'proposalSentAt':
      case 'followUpFrom':
      case 'followUpTo': {
        if (!str) break
        const d = parseDate(str)
        if (d) r[field] = d
        else warnings.push(`Linha ${line}: data "${str}" não reconhecida (use dd/mm/aaaa) — ignorada.`)
        break
      }
      case 'coupon':
        if (v === true || YES.test(str)) r.coupon = true
        else if (!NO.test(normalize(str))) r.coupon = str
        break
      case 'pressKit':
      case 'affiliate':
      case 'paidProspect':
        if (v === true || YES.test(str)) r[field] = true
        else if (field === 'pressKit' && parseDate(str)) {
          r.pressKit = true
          r.pressKitAt = parseDate(str)
        }
        break
      case 'evidence':
      case 'category':
      case 'notes':
        if (str) r[field] = str
        break
    }
  }
  if (!r.name) {
    warnings.push(`Linha ${line}: sem nome de marca — ignorada.`)
    return undefined
  }
  if (r.status === 'aguardando_retorno' && !r.proposalSentAt && r.statusAt) r.proposalSentAt = r.statusAt
  return r as CrmRow
}

/** Her pasted sheet: CSV/TSV (first line = headers) or JSON (array of objects). */
export function parseCrmPaste(text: string): { rows: CrmRow[]; warnings: string[] } {
  const warnings: string[] = []
  const t = text.trim()
  if (!t) return { rows: [], warnings }
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const data = JSON.parse(t) as unknown
      const list = Array.isArray(data) ? data : ((data as Record<string, unknown>).brands ?? (data as Record<string, unknown>).marcas ?? (data as Record<string, unknown>).rows)
      if (!Array.isArray(list)) return { rows: [], warnings: ['JSON sem lista de marcas.'] }
      const rows = list.flatMap((rec, i) => (rec && typeof rec === 'object' ? [rowFrom(rec as Record<string, unknown>, warnings, i + 1)] : [])).filter((x): x is CrmRow => !!x)
      return { rows, warnings }
    } catch {
      return { rows: [], warnings: ['JSON inválido.'] }
    }
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim())
  const head = lines[0]
  const sep = ['\t', ';', ','].map((s) => [s, head.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const headers = splitLine(head, sep)
  if (!headers.some((h) => COLS[brandKey(h)] === 'name')) return { rows: [], warnings: ['A primeira linha precisa ter os títulos das colunas, com uma coluna "Marca".'] }
  const rows: CrmRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep)
    const rec = Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? '']))
    const r = rowFrom(rec, warnings, i + 1)
    if (r) rows.push(r)
  }
  return { rows, warnings }
}

// ─── Tasks of UGC Business (existing Tasks, never a parallel type) ──────────

export function isUgcTask(t: Task): boolean {
  return t.projectId === SEED_IDS.projUGC || !!t.brandId || !!t.contentItemId || !!t.tags?.includes('ugc')
}

export type UgcTaskState = 'a_fazer' | 'em_andamento' | 'concluido' | 'adiado' | 'cancelado' | 'bloqueado'
export const TASK_STATE_LABEL: Record<UgcTaskState, string> = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  adiado: 'Adiado',
  cancelado: 'Cancelado',
  bloqueado: 'Bloqueado',
}

export function taskState(t: Task): UgcTaskState {
  if (t.status === 'done') return 'concluido'
  if (t.status === 'archived') return 'cancelado'
  if (t.status === 'waiting') return 'bloqueado'
  if (t.status === 'doing') return 'em_andamento'
  if (t.postponedFrom) return 'adiado'
  return 'a_fazer'
}

/** The patch that puts a task in a state (Concluído stamps completedAt; reopening clears it). */
export function taskStatePatch(t: Task, s: UgcTaskState, today: DateKey): Partial<Task> {
  const open = { completedAt: undefined }
  switch (s) {
    case 'concluido':
      return { status: 'done', completedAt: t.completedAt ?? nowISO() }
    case 'cancelado':
      return { status: 'archived', ...open }
    case 'bloqueado':
      return { status: 'waiting', waiting: t.waiting ?? { who: 'marca / terceiro', since: today }, ...open }
    case 'em_andamento':
      return { status: 'doing', ...open }
    case 'adiado':
      return { status: 'todo', postponedFrom: t.postponedFrom ?? t.date ?? today, ...open }
    default:
      return { status: 'todo', postponedFrom: undefined, ...open }
  }
}

export const PRIORITY_P: Record<string, string> = { alta: 'P1', media: 'P2', baixa: 'P3' }

/** What's next on a task: the first open step, else what "done" means. */
export function nextActionOf(t: Task): string | undefined {
  return t.checklist?.find((s) => !s.done)?.title ?? t.doneCriteria
}

// ─── Commercial dashboard (every number from records; one kind per card) ────

export interface DashRecord {
  id: string
  title: string
  sub?: string
  brandId?: ID
}
export interface DashCard {
  id: string
  label: string
  value: string
  records: DashRecord[]
  note?: string
}

const BRL = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** A paid UGC deal: agreed, with money, not barter / press kit / affiliate. */
export function isPaidDeal(o: UgcOpportunity): boolean {
  return !!o.agreedAt && (o.agreedValueCents ?? 0) > 0 && !['permuta', 'press_kit', 'afiliado'].includes(o.type ?? '') && o.compensationType !== 'permuta' && o.compensationType !== 'comissao'
}

export function ugcMoney(db: DB): { paid: UgcOpportunity[]; received: Expense[]; receivable: Expense[]; receivedCents: number; receivableCents: number } {
  const paid = db.ugcOpportunities.filter(isPaidDeal)
  const ids = new Set(paid.map((o) => o.id))
  const income = db.expenses.filter((e) => e.type === 'income' && e.ugcOpportunityId && ids.has(e.ugcOpportunityId))
  const received = income.filter((e) => e.status === 'received')
  const receivable = income.filter((e) => e.status === 'expected')
  return {
    paid,
    received,
    receivable,
    receivedCents: received.reduce((s, e) => s + (e.receivedAmountCents ?? e.amountCents ?? 0), 0),
    receivableCents: receivable.reduce((s, e) => s + (e.expectedAmountCents ?? e.amountCents ?? 0), 0),
  }
}

/** Coupons she said the sheet confirms (12/10/2026) — shown next to what is really registered. */
export const COUPONS_CONFIRMED_IN_SHEET = 12

export function crmDashboard(db: DB): DashCard[] {
  const nameOf = (id: ID) => db.brands.find((b) => b.id === id)?.name ?? 'Marca'
  const brandRec = (b: Brand, sub?: string): DashRecord => ({ id: b.id, title: b.name, sub: sub ?? (b.crm?.status ? CRM_STATUS_LABEL[b.crm.status] : undefined), brandId: b.id })
  const oppRec = (o: UgcOpportunity, sub?: string): DashRecord => ({ id: o.id, title: nameOf(o.brandId), sub: sub ?? o.title, brandId: o.brandId })
  const live = (o: UgcOpportunity) => !CLOSED.includes(o.status) && !db.brands.find((b) => b.id === o.brandId)?.archived
  const brands = db.brands.filter((b) => !b.archived)
  const proposals = db.ugcOpportunities.filter((o) => o.proposalSentAt)
  const waiting = db.ugcOpportunities.filter((o) => live(o) && o.status === 'aguardando_resposta')
  const negotiating = db.ugcOpportunities.filter((o) => live(o) && o.status === 'negociando')
  const negatives = db.brands.filter((b) => b.crm?.status === 'negativa')
  const affiliates = db.brands.filter((b) => b.crm?.affiliate || b.relationshipStatus === 'afiliada')
  const coupons = db.brands.flatMap((b) => (b.crm?.coupons ?? []).map((c, i) => ({ id: `${b.id}:c${i}`, title: b.name, sub: c.code ? `cupom ${c.code}` : 'cupom confirmado · código não informado', brandId: b.id })))
  const kits = db.brands.filter((b) => b.crm?.pressKits?.length)
  const demos = db.contentItems.filter((c) => c.demo)
  const money = ugcMoney(db)
  const fmtDate = (d?: DateKey) => (d ? d.split('-').reverse().slice(0, 2).join('/') : undefined)
  return [
    { id: 'marcas', label: 'Total de marcas', value: String(brands.length), records: brands.map((b) => brandRec(b)) },
    { id: 'propostas', label: 'Propostas enviadas', value: String(proposals.length), records: proposals.map((o) => oppRec(o, `enviada ${fmtDate(o.proposalSentAt)}`)) },
    { id: 'aguardando', label: 'Aguardando resposta', value: String(waiting.length), records: waiting.map((o) => oppRec(o, [o.lastContactAt ? `último contato ${fmtDate(o.lastContactAt)}` : 'data do último contato a conferir', o.nextFollowUpAt ? `follow-up ${fmtDate(o.nextFollowUpAt)}${o.followUpWindowEnd ? `–${fmtDate(o.followUpWindowEnd)}` : ''} se não responder` : undefined].filter(Boolean).join(' · '))) },
    { id: 'negociacoes', label: 'Negociações', value: String(negotiating.length), records: negotiating.map((o) => oppRec(o)) },
    { id: 'negativas', label: 'Negativas', value: String(negatives.length), records: negatives.map((b) => brandRec(b, b.crm?.statusAt ? `negativa ${fmtDate(b.crm.statusAt)}` : undefined)) },
    { id: 'afiliadas', label: 'Afiliadas', value: String(affiliates.length), records: affiliates.map((b) => brandRec(b)) },
    { id: 'cupons', label: 'Cupons', value: String(coupons.length), records: coupons, note: coupons.length < COUPONS_CONFIRMED_IN_SHEET ? `A planilha tem ${COUPONS_CONFIRMED_IN_SHEET} confirmados; aqui estão os registrados. Cole a planilha em "Importar CRM" pra completar.` : undefined },
    { id: 'presskits', label: 'Press kits', value: String(kits.length), records: kits.map((b) => brandRec(b, 'press kit recebido · histórico, não pagamento')) },
    { id: 'demos', label: 'Projetos demonstrativos', value: String(demos.length), records: demos.map((c) => ({ id: c.id, title: c.title, sub: c.demo!.inPortfolio ? 'no portfólio' : c.demo!.editStatus === 'pronta' ? 'pronto' : 'em produção', brandId: c.brandId })), note: 'Portfólio — não são contratos pagos.' },
    { id: 'pagos', label: 'UGC pagos fechados', value: String(money.paid.length), records: money.paid.map((o) => oppRec(o, o.agreedValueCents ? BRL(o.agreedValueCents) : undefined)) },
    { id: 'receita', label: 'Receita UGC recebida', value: BRL(money.receivedCents), records: money.received.map((e) => ({ id: e.id, title: e.title, sub: BRL(e.receivedAmountCents ?? e.amountCents) })), note: 'Press kits, permutas, afiliações e conteúdo espontâneo não contam como receita.' },
    { id: 'receber', label: 'A receber', value: BRL(money.receivableCents), records: money.receivable.map((e) => ({ id: e.id, title: e.title, sub: BRL(e.expectedAmountCents ?? e.amountCents) })) },
  ]
}
