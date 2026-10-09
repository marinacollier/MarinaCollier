/**
 * Recurring payments she controls with a check (Aluguel, Cartão C6, Plano de saúde, Hortifruti e carnes…).
 * A payment is a FinancialCategory with `bill`; "paid" is an Occurrence ('bill') dated at the start of the
 * period (month, or week for the weekly ones). No amount is ever assumed here — values come only from her
 * expenses. A due day exists only when she gave it; then the payment shows on Hoje that day.
 */
import type { DateKey, DB, FinancialCategory } from '../types'
import { daysInMonth, startOfMonth, startOfWeek } from '@/lib/date'

export type Bill = FinancialCategory & { bill: NonNullable<FinancialCategory['bill']> }

export const isBill = (c: FinancialCategory): c is Bill => !!c.bill && !c.archived

/** Period start the "paid" tick belongs to. */
export function billPeriod(c: FinancialCategory, date: DateKey): DateKey {
  return c.bill?.every === 'semana' ? startOfWeek(date) : startOfMonth(date)
}

/** Due date of a monthly bill in the month of `date` (day 31 → last day of a short month). */
export function billDueDate(c: FinancialCategory, date: DateKey): DateKey | undefined {
  const day = c.bill?.every === 'mes' ? c.bill.dueDay : undefined
  if (!day) return undefined
  const first = startOfMonth(date)
  const d = Math.min(Math.max(1, Math.round(day)), daysInMonth(first))
  return `${first.slice(0, 8)}${String(d).padStart(2, '0')}`
}

export function billPaid(db: DB, c: FinancialCategory, date: DateKey) {
  const period = billPeriod(c, date)
  return db.occurrences.find((o) => o.parentType === 'bill' && o.parentId === c.id && o.date === period && o.status === 'done')
}

/** Bills that belong on `date`: due that day — and, on today, still unpaid ones due earlier this month. */
export function billsDueOn(db: DB, date: DateKey, today: DateKey): { category: Bill; dueDate: DateKey }[] {
  const out: { category: Bill; dueDate: DateKey }[] = []
  for (const c of db.financialCategories) {
    if (!isBill(c)) continue
    const due = billDueDate(c, date)
    if (!due) continue
    if (due === date || (date === today && due < today)) out.push({ category: c, dueDate: due })
  }
  return out
}

export interface BillRow {
  category: Bill
  paid: boolean
  dueDate?: DateKey
  overdue: boolean
}

/** This period's checklist: open first (by due day), paid at the end. */
export function billRows(db: DB, today: DateKey): BillRow[] {
  return db.financialCategories
    .filter(isBill)
    .map((c) => {
      const dueDate = billDueDate(c, today)
      const paid = !!billPaid(db, c, today)
      return { category: c, paid, dueDate, overdue: !paid && !!dueDate && dueDate < today }
    })
    .sort((a, b) => Number(a.paid) - Number(b.paid) || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9') || a.category.order - b.category.order)
}
