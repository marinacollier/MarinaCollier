/**
 * Contracts → monthly receivables (gross billing, as informed by Marina).
 *
 * Rules:
 * - A receivable is an Expense with type 'income'. One record per contract per month, with a deterministic
 *   id, so it can never be duplicated (not by re-running, not by restoring a backup).
 * - expected → received is the SAME record evolving (receivedAt + receivedAmountCents).
 * - Nothing ever becomes received because the date arrived. "Atrasado" is derived, never stored.
 * - No taxes, no net income, no assumed rates.
 * Pure helpers take the DB; the store wrappers return one Undo and log a LifeEvent.
 */
import { actions, getDB } from '../store'
import { logLife } from '../intel/log'
import type { DateKey, DB, Expense, FinancialContract, ID } from '../types'
import { addDays, daysInMonth, monthKey } from '@/lib/date'
import { nowISO } from '@/lib/id'

export type Undo = () => void

/** Income never uses a spending category; this marks it in the required field. */
export const INCOME_CATEGORY_ID = 'cat:receitas'

export type ReceivableStatus = 'expected' | 'received' | 'overdue' | 'cancelled'

export const isIncome = (e: Expense): boolean => e.type === 'income'

export function receivableId(contractId: ID, period: string): ID {
  return `rcv-${contractId}-${period}`
}

/** Next month key ('2026-12' → '2027-01'). */
export function nextPeriod(period: string): string {
  return monthKey(addDays(`${period}-28`, 7))
}

/** Payment day clamped to the month (day 30 in February → 28/29). */
export function expectedDateFor(contract: Pick<FinancialContract, 'paymentDay'>, period: string): DateKey {
  const day = Math.min(Math.max(1, Math.round(contract.paymentDay)), daysInMonth(`${period}-01`))
  return `${period}-${String(day).padStart(2, '0')}`
}

/** Contract is billing in that month (active and within start/end). */
export function contractCovers(c: FinancialContract, period: string): boolean {
  if (c.status !== 'ativo') return false
  if (c.startDate && monthKey(c.startDate) > period) return false
  if (c.endDate && monthKey(c.endDate) < period) return false
  return true
}

/** Status with "atrasado" derived from the date. */
export function receivableStatus(e: Expense, today: DateKey): ReceivableStatus {
  if (e.status === 'received') return 'received'
  if (e.status === 'cancelled') return 'cancelled'
  return (e.expectedDate ?? e.date ?? today) < today ? 'overdue' : 'expected'
}

/** The record a contract would have for a month (not stored). */
export function draftReceivable(c: FinancialContract, period: string): Expense {
  const at = nowISO()
  return {
    id: receivableId(c.id, period),
    createdAt: at,
    updatedAt: at,
    type: 'income',
    title: c.client,
    amountCents: c.amountCents,
    expectedAmountCents: c.amountCents,
    currency: c.currency,
    categoryId: INCOME_CATEGORY_ID,
    status: 'expected',
    contractId: c.id,
    period,
    expectedDate: expectedDateFor(c, period),
    date: expectedDateFor(c, period),
    origin: 'manual',
    source: 'contrato',
  }
}

/** Every income of a month: stored records + what active contracts still expect (virtual until touched). */
export function receivablesFor(db: DB, period: string): Expense[] {
  const stored = db.expenses.filter((e) => isIncome(e) && (e.period ?? monthKey(e.expectedDate ?? e.receivedAt?.slice(0, 10) ?? e.date ?? '')) === period)
  const have = new Set(stored.map((e) => e.id))
  const virtual = (db.contracts ?? []).filter((c) => contractCovers(c, period) && !have.has(receivableId(c.id, period))).map((c) => draftReceivable(c, period))
  return [...stored, ...virtual].sort((a, b) => (a.expectedDate ?? a.date ?? '').localeCompare(b.expectedDate ?? b.date ?? ''))
}

export interface MonthIncome {
  period: string
  items: (Expense & { effective: ReceivableStatus })[]
  /** Gross billing expected for the month (everything not cancelled), in cents. */
  grossCents: number
  receivedCents: number
  expectedCents: number
  overdueCents: number
  cancelledCents: number
  /** Extra income (no contract), received or expected. */
  extraCents: number
}

export function monthIncome(db: DB, period: string, today: DateKey): MonthIncome {
  const items = receivablesFor(db, period).map((e) => ({ ...e, effective: receivableStatus(e, today) }))
  const sum = (pred: (e: (typeof items)[number]) => boolean, field: 'expected' | 'received' = 'expected') =>
    items.filter(pred).reduce((s, e) => s + (field === 'received' ? (e.receivedAmountCents ?? e.amountCents) : (e.expectedAmountCents ?? e.amountCents)), 0)
  return {
    period,
    items,
    grossCents: sum((e) => e.effective !== 'cancelled'),
    receivedCents: sum((e) => e.effective === 'received', 'received'),
    expectedCents: sum((e) => e.effective === 'expected'),
    overdueCents: sum((e) => e.effective === 'overdue'),
    cancelledCents: sum((e) => e.effective === 'cancelled'),
    extraCents: sum((e) => !e.contractId && e.effective !== 'cancelled'),
  }
}

/** Contract by name/alias (accent-free, case-free). Undefined when none or more than one match. */
export function findContract(db: DB, text: string): FinancialContract | undefined {
  const n = fold(text)
  const hits = (db.contracts ?? []).filter((c) => [c.client, ...(c.aliases ?? [])].some((a) => n.includes(fold(a))))
  return hits.length === 1 ? hits[0] : undefined
}

export const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ─── Store wrappers ─────────────────────────────────────────────────────────

/** Creates this month's and next month's expected records for active contracts (idempotent). */
export function ensureReceivables(today: DateKey): void {
  const db = getDB()
  const periods = [monthKey(today), nextPeriod(monthKey(today))]
  const existing = new Set(db.expenses.map((e) => e.id))
  const missing = (db.contracts ?? []).flatMap((c) => periods.filter((p) => contractCovers(c, p) && !existing.has(receivableId(c.id, p))).map((p) => draftReceivable(c, p)))
  if (missing.length) actions.createMany('expenses', missing)
}

/** Stored record for an id, materializing a contract's virtual receivable when needed. */
function materialize(id: ID): Expense | undefined {
  const db = getDB()
  const found = db.expenses.find((e) => e.id === id)
  if (found) return found
  const m = /^rcv-(.+)-(\d{4}-\d{2})$/.exec(id)
  const c = m && db.contracts.find((x) => x.id === m[1])
  if (!c || !m) return undefined
  return actions.create('expenses', draftReceivable(c, m[2]) as Expense & { id: string })
}

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** expected → received on the SAME record. `amountCents` defaults to the expected amount. */
export function markReceived(id: ID, opts: { at?: string; amountCents?: number; notes?: string; by?: 'marina' | 'lumos' } = {}): Undo {
  const before = getDB().expenses.find((e) => e.id === id)
  const rec = materialize(id)
  if (!rec) return () => {}
  const amount = opts.amountCents ?? rec.expectedAmountCents ?? rec.amountCents
  const at = opts.at ?? nowISO()
  actions.update('expenses', rec.id, { status: 'received', receivedAt: at, receivedAmountCents: amount, amountCents: amount, date: at.slice(0, 10), ...(opts.notes !== undefined ? { notes: opts.notes } : {}) })
  const log = logLife({ kind: 'done', date: at.slice(0, 10), title: `Recebeu ${rec.title} (${money(amount)})`, area: 'financas', ref: { type: 'expense', id: rec.id }, by: opts.by ?? 'marina', provenance: 'user' })
  return () => {
    log.undo()
    if (before) actions.update('expenses', rec.id, before)
    else actions.remove('expenses', rec.id)
  }
}

/** Back to expected (wrong tap, or "ainda não pagou" after a mistaken mark). */
export function markExpected(id: ID, by: 'marina' | 'lumos' = 'marina'): Undo {
  const rec = materialize(id)
  if (!rec) return () => {}
  const before = { ...rec }
  actions.update('expenses', rec.id, { status: 'expected', receivedAt: undefined, receivedAmountCents: undefined, amountCents: rec.expectedAmountCents ?? rec.amountCents, date: rec.expectedDate ?? rec.date })
  const log = logLife({ kind: 'changed', date: rec.expectedDate, title: `${rec.title}: segue previsto`, area: 'financas', ref: { type: 'expense', id: rec.id }, by, provenance: 'user' })
  return () => {
    log.undo()
    actions.update('expenses', rec.id, before)
  }
}

export function cancelReceivable(id: ID, by: 'marina' | 'lumos' = 'marina'): Undo {
  const rec = materialize(id)
  if (!rec) return () => {}
  const before = { ...rec }
  actions.update('expenses', rec.id, { status: 'cancelled' })
  const log = logLife({ kind: 'cancelled', date: rec.expectedDate, title: `${rec.title} de ${rec.period ?? ''} cancelado`, area: 'financas', ref: { type: 'expense', id: rec.id }, by, provenance: 'user' })
  return () => {
    log.undo()
    actions.update('expenses', rec.id, before)
  }
}

/** Edit one month's receivable (value, date, notes) without touching the contract. */
export function updateReceivable(id: ID, patch: Partial<Pick<Expense, 'expectedAmountCents' | 'expectedDate' | 'notes' | 'title' | 'receivedAmountCents' | 'receivedAt'>>): Undo {
  const rec = materialize(id)
  if (!rec) return () => {}
  const before = { ...rec }
  const next: Partial<Expense> = { ...patch }
  if (patch.expectedDate) next.date = rec.status === 'received' ? rec.date : patch.expectedDate
  if (patch.expectedAmountCents !== undefined && rec.status !== 'received') next.amountCents = patch.expectedAmountCents
  if (patch.receivedAmountCents !== undefined && rec.status === 'received') next.amountCents = patch.receivedAmountCents
  actions.update('expenses', rec.id, next)
  return () => actions.update('expenses', rec.id, before)
}

/** Extra income (freela, variable project) — separate from contracts. */
export function addExtraIncome(input: { title: string; amountCents: number; date: DateKey; received: boolean; notes?: string; by?: 'marina' | 'lumos' }): { item: Expense; undo: Undo } {
  const at = nowISO()
  const item = actions.create('expenses', {
    type: 'income',
    title: input.title,
    amountCents: input.amountCents,
    expectedAmountCents: input.amountCents,
    categoryId: INCOME_CATEGORY_ID,
    status: input.received ? 'received' : 'expected',
    expectedDate: input.date,
    date: input.date,
    period: monthKey(input.date),
    receivedAt: input.received ? at : undefined,
    receivedAmountCents: input.received ? input.amountCents : undefined,
    notes: input.notes,
    origin: 'manual',
    source: input.by === 'lumos' ? 'lumos' : 'manual',
  })
  const log = logLife({ kind: 'logged', date: input.date, title: `Receita extra: ${input.title} (${money(input.amountCents)})`, area: 'financas', ref: { type: 'expense', id: item.id }, by: input.by ?? 'marina', provenance: 'user' })
  return {
    item,
    undo: () => {
      log.undo()
      actions.remove('expenses', item.id)
    },
  }
}

/**
 * Contract edits: value/day changes flow into receivables that are still expected (from this month on);
 * received/cancelled months keep their history.
 */
export function updateContract(id: ID, patch: Partial<Omit<FinancialContract, 'id' | 'createdAt' | 'updatedAt'>>, today: DateKey): Undo {
  const db = getDB()
  const c = db.contracts.find((x) => x.id === id)
  if (!c) return () => {}
  const beforeC = { ...c }
  actions.update('contracts', id, patch)
  const next = { ...c, ...patch }
  const touched = db.expenses.filter((e) => e.contractId === id && e.status === 'expected' && (e.period ?? '') >= monthKey(today))
  const beforeR = touched.map((e) => ({ ...e }))
  for (const e of touched) {
    const date = expectedDateFor(next, e.period!)
    actions.update('expenses', e.id, { amountCents: next.amountCents, expectedAmountCents: next.amountCents, expectedDate: date, date, title: next.client })
  }
  return () => {
    actions.update('contracts', id, beforeC)
    for (const e of beforeR) actions.update('expenses', e.id, e)
  }
}
