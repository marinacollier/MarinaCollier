/**
 * Finance-local pure selectors. Inputs are plain arrays so they are easy to test and reuse.
 * Voice rule: everything here is awareness, never judgement — labels are neutral.
 */
import type {
  DateKey,
  Expense,
  FinancialCategory,
  ID,
  IntegrationConnection,
  PaymentMethod,
  Trip,
} from '@/data/types'
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  endOfWeek,
  formatShortDate,
  formatMonth,
  startOfMonth,
  startOfWeek,
} from '@/lib/date'
import { formatBRLShort } from '@/lib/money'
import { normalize } from '@/lib/text'

export type PeriodKind = 'week' | 'month'

export interface Range {
  from: DateKey
  to: DateKey
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  credito: 'crédito',
  debito: 'débito',
  pix: 'pix',
  dinheiro: 'dinheiro',
  boleto: 'boleto',
  vale: 'vale',
}
export const PAYMENT_METHODS: PaymentMethod[] = ['credito', 'debito', 'pix', 'dinheiro', 'boleto', 'vale']

export const CAT_OUTROS = 'cat-outros'
export const CAT_VIAGEM = 'cat-viagem'
export const CAT_ESPORTE = 'cat-esporte'
export const CAT_COMPRAS = 'cat-compras'

// ─── Periods ────────────────────────────────────────────────────────────────

export function periodRange(kind: PeriodKind, anchor: DateKey): Range {
  return kind === 'week'
    ? { from: startOfWeek(anchor), to: endOfWeek(anchor) }
    : { from: startOfMonth(anchor), to: endOfMonth(anchor) }
}

export function shiftPeriod(kind: PeriodKind, anchor: DateKey, dir: 1 | -1): DateKey {
  return kind === 'week' ? addDays(anchor, 7 * dir) : addMonths(startOfMonth(anchor), dir)
}

export function isCurrentPeriod(kind: PeriodKind, anchor: DateKey, today: DateKey): boolean {
  const r = periodRange(kind, anchor)
  return today >= r.from && today <= r.to
}

/** "Esta semana", "Semana passada", "22 – 28 de set." / "Este mês", "setembro de 2026". */
export function periodLabel(kind: PeriodKind, anchor: DateKey, today: DateKey): string {
  const r = periodRange(kind, anchor)
  if (kind === 'week') {
    if (isCurrentPeriod('week', anchor, today)) return 'Esta semana'
    if (isCurrentPeriod('week', addDays(anchor, 7), today)) return 'Semana passada'
    return `${formatShortDate(r.from)} – ${formatShortDate(r.to)}`
  }
  if (isCurrentPeriod('month', anchor, today)) return 'Este mês'
  const label = formatMonth(r.from)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// ─── Totals ─────────────────────────────────────────────────────────────────

export function isPaid(e: Expense): e is Expense & { date: DateKey } {
  return e.type !== 'income' && e.status === 'paid' && !!e.date
}

export function paidBetween(expenses: Expense[], from: DateKey, to: DateKey): Expense[] {
  return expenses
    .filter((e) => isPaid(e) && e.date >= from && e.date <= to)
    .sort((a, b) => b.date!.localeCompare(a.date!) || b.createdAt.localeCompare(a.createdAt))
}

export function total(list: Expense[]): number {
  return list.reduce((s, e) => s + e.amountCents, 0)
}

export function totalBetween(expenses: Expense[], from: DateKey, to: DateKey): number {
  return total(paidBetween(expenses, from, to))
}

export function topTotals(expenses: Expense[], today: DateKey) {
  return {
    today: totalBetween(expenses, today, today),
    week: totalBetween(expenses, startOfWeek(today), endOfWeek(today)),
    month: totalBetween(expenses, startOfMonth(today), endOfMonth(today)),
  }
}

// ─── Comparison with previous period ────────────────────────────────────────

export interface Comparison {
  kind: PeriodKind
  current: number
  previous: number
  /** True when the current period is still running and we compare "até hoje". */
  partial: boolean
  currentRange: Range
  previousRange: Range
}

/**
 * Compares a period with the previous one. While the period is running it compares like-for-like:
 * week-to-date vs the same weekdays last week; month-to-date vs the same days of last month.
 */
export function comparePeriods(expenses: Expense[], kind: PeriodKind, anchor: DateKey, today: DateKey): Comparison {
  const r = periodRange(kind, anchor)
  const partial = today >= r.from && today < r.to
  const cutoff = partial ? today : r.to
  const span = diffDays(r.from, cutoff)
  let prevFrom: DateKey
  let prevTo: DateKey
  if (kind === 'week') {
    prevFrom = addDays(r.from, -7)
    prevTo = addDays(prevFrom, span)
  } else {
    prevFrom = startOfMonth(addMonths(r.from, -1))
    const prevEnd = endOfMonth(prevFrom)
    const candidate = addDays(prevFrom, span)
    prevTo = partial ? (candidate > prevEnd ? prevEnd : candidate) : prevEnd
  }
  return {
    kind,
    current: totalBetween(expenses, r.from, cutoff),
    previous: totalBetween(expenses, prevFrom, prevTo),
    partial,
    currentRange: { from: r.from, to: cutoff },
    previousRange: { from: prevFrom, to: prevTo },
  }
}

/** Neutral one-liner. Undefined when there is nothing to compare. */
export function comparisonText(c: Comparison): string | undefined {
  if (c.current === 0 && c.previous === 0) return undefined
  const isWeek = c.kind === 'week'
  if (c.previous === 0) return isWeek ? 'sem registros na semana anterior pra comparar' : 'sem registros no mês anterior pra comparar'
  const diff = c.current - c.previous
  const threshold = Math.max(2000, Math.round(c.previous * 0.1))
  const suffix = c.partial ? ' até hoje' : ''
  if (Math.abs(diff) <= threshold) return (isWeek ? 'parecido com a semana passada' : 'parecido com o mês passado') + suffix
  const ref = isWeek ? 'na semana passada' : 'no mês passado'
  return `${formatBRLShort(Math.abs(diff))} a ${diff < 0 ? 'menos' : 'mais'} que ${ref}${suffix}`
}

// ─── Categories ─────────────────────────────────────────────────────────────

export interface CategoryTotal {
  categoryId: ID
  category?: FinancialCategory
  cents: number
  count: number
}

export function categoryBreakdown(list: Expense[], categories: FinancialCategory[]): CategoryTotal[] {
  const map = new Map<ID, CategoryTotal>()
  for (const e of list) {
    if (!isPaid(e)) continue
    const row = map.get(e.categoryId) ?? {
      categoryId: e.categoryId,
      category: categories.find((c) => c.id === e.categoryId),
      cents: 0,
      count: 0,
    }
    row.cents += e.amountCents
    row.count += 1
    map.set(e.categoryId, row)
  }
  return [...map.values()].filter((r) => r.cents > 0).sort((a, b) => b.cents - a.cents)
}

/** Neutral budget copy: "R$ 120 livres no orçamento de Mercado". */
export function budgetText(category: FinancialCategory, spentInMonth: number): string | undefined {
  if (!category.budgetCents) return undefined
  const left = category.budgetCents - spentInMonth
  if (left > 0) return `${formatBRLShort(left)} livres no orçamento de ${category.name}`
  if (left === 0) return `orçamento de ${category.name} certinho`
  return `${formatBRLShort(-left)} além do orçamento de ${category.name}`
}

/** Active categories, most used first (by count of past purchases), then by order. */
export function categoriesByUsage(categories: FinancialCategory[], expenses: Expense[]): FinancialCategory[] {
  const count = new Map<ID, number>()
  for (const e of expenses) count.set(e.categoryId, (count.get(e.categoryId) ?? 0) + 1)
  return categories
    .filter((c) => !c.archived)
    .sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || a.order - b.order)
}

export function lastPaymentMethod(expenses: Expense[]): PaymentMethod | undefined {
  let best: Expense | undefined
  for (const e of expenses) {
    if (e.origin !== 'manual' || !e.payment) continue
    if (!best || e.createdAt > best.createdAt) best = e
  }
  return best?.payment
}

// ─── Planned vs unplanned ───────────────────────────────────────────────────

export function plannedSplit(list: Expense[]) {
  let planned = 0
  let unplanned = 0
  let unmarked = 0
  for (const e of list) {
    if (!isPaid(e)) continue
    if (e.planned === true) planned += e.amountCents
    else if (e.planned === false) unplanned += e.amountCents
    else unmarked += e.amountCents
  }
  return { planned, unplanned, unmarked }
}

export function plannedText(split: ReturnType<typeof plannedSplit>): string | undefined {
  const { planned, unplanned } = split
  if (!planned && !unplanned) return undefined
  if (planned && !unplanned) return `${formatBRLShort(planned)} em compras planejadas`
  if (!planned && unplanned) return `${formatBRLShort(unplanned)} em compras do momento`
  return `${formatBRLShort(planned)} planejados · ${formatBRLShort(unplanned)} do momento`
}

// ─── Questions ──────────────────────────────────────────────────────────────

function categoryMatches(categories: FinancialCategory[], id: ID, fixedId: ID, word: string): boolean {
  if (id === fixedId) return true
  const c = categories.find((x) => x.id === id)
  return !!c && normalize(c.name).includes(word)
}

export function sportSpend(expenses: Expense[], categories: FinancialCategory[], range: Range): number {
  return total(paidBetween(expenses, range.from, range.to).filter((e) => categoryMatches(categories, e.categoryId, CAT_ESPORTE, 'esporte')))
}

export interface TripSpend {
  trip?: Trip
  cents: number
  count: number
}

/** Spend per trip (by tripId, any date) plus "Viagem" category purchases not linked to a trip. */
export function tripSpend(expenses: Expense[], trips: Trip[], categories: FinancialCategory[]): { byTrip: TripSpend[]; unlinked: TripSpend } {
  const byTrip = new Map<ID, TripSpend>()
  const unlinked: TripSpend = { cents: 0, count: 0 }
  for (const e of expenses) {
    if (!isPaid(e)) continue
    if (e.tripId) {
      const row = byTrip.get(e.tripId) ?? { trip: trips.find((t) => t.id === e.tripId), cents: 0, count: 0 }
      row.cents += e.amountCents
      row.count += 1
      byTrip.set(e.tripId, row)
    } else if (categoryMatches(categories, e.categoryId, CAT_VIAGEM, 'viagem')) {
      unlinked.cents += e.amountCents
      unlinked.count += 1
    }
  }
  return { byTrip: [...byTrip.values()].sort((a, b) => b.cents - a.cents), unlinked }
}

/** "Mercado · pix · planejada" */
export function expenseSubtitle(e: Expense, category?: FinancialCategory, extra?: string): string {
  const bits: string[] = []
  if (category && category.name !== e.title) bits.push(category.name)
  if (e.payment) bits.push(PAYMENT_LABEL[e.payment])
  if (e.planned === true) bits.push('planejada')
  if (e.origin === 'organizze') bits.push('Organizze')
  if (extra) bits.push(extra)
  return bits.join(' · ')
}

// ─── Grouping ───────────────────────────────────────────────────────────────

export function groupByDay(list: Expense[]): { date: DateKey; items: Expense[]; cents: number }[] {
  const out: { date: DateKey; items: Expense[]; cents: number }[] = []
  for (const e of list) {
    if (!e.date) continue
    const last = out[out.length - 1]
    if (last && last.date === e.date) {
      last.items.push(e)
      last.cents += e.amountCents
    } else out.push({ date: e.date, items: [e], cents: e.amountCents })
  }
  return out
}

export function plannedPurchases(expenses: Expense[]): Expense[] {
  return expenses
    .filter((e) => e.status === 'planned_purchase')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// ─── Duplicates ─────────────────────────────────────────────────────────────

export interface DuplicatePair {
  /** The record that carries the flag. */
  flagged: Expense
  other: Expense
  /** The one to keep when Marina says "é a mesma" (imported wins). */
  keep: Expense
  /** The one removed (with undo). */
  drop: Expense
}

export function duplicatePairs(expenses: Expense[]): DuplicatePair[] {
  const byId = new Map(expenses.map((e) => [e.id, e]))
  const seen = new Set<string>()
  const out: DuplicatePair[] = []
  for (const e of expenses) {
    if (!e.possibleDuplicateOf) continue
    const other = byId.get(e.possibleDuplicateOf)
    if (!other) continue
    const key = [e.id, other.id].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    let keep: Expense
    let drop: Expense
    if (e.origin === 'organizze' && other.origin !== 'organizze') [keep, drop] = [e, other]
    else if (other.origin === 'organizze' && e.origin !== 'organizze') [keep, drop] = [other, e]
    else [keep, drop] = [other, e]
    out.push({ flagged: e, other, keep, drop })
  }
  return out
}

// ─── Organizze status (read only) ───────────────────────────────────────────

export type OrganizzeState = 'off' | 'connected' | 'needs_setup' | 'error' | 'coming_soon'

export function organizzeState(integrations: IntegrationConnection[], flagEnabled: boolean): { state: OrganizzeState; conn?: IntegrationConnection } {
  const conn = integrations.find((i) => i.provider === 'organizze')
  if (conn?.status === 'connected' && flagEnabled) return { state: 'connected', conn }
  if (conn?.status === 'error') return { state: 'error', conn }
  if (conn?.status === 'needs_auth' || conn?.status === 'needs_config') return { state: 'needs_setup', conn }
  if (conn?.status === 'coming_soon') return { state: 'coming_soon', conn }
  return { state: 'off', conn }
}
