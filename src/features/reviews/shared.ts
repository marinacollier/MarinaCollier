/** Small pure helpers shared by the weekly and monthly aggregations. */
import type { DateKey, DB, Expense, ISODateTime, Workout } from '@/data/types'
import { categoryOf, modalityOf, sumCents } from '@/data/selectors'
import { toDateKey } from '@/lib/date'

export function isoToKey(iso?: ISODateTime): DateKey | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : toDateKey(d)
}

export const inRange = (k: DateKey | undefined, from: DateKey, to: DateKey): boolean => !!k && k >= from && k <= to

export interface CategorySpend {
  id: string
  name: string
  emoji: string
  cents: number
}

export function spendBreakdown(
  db: DB,
  list: Expense[],
  top = 3,
): { total: number; count: number; top: CategorySpend[] } {
  const by = new Map<string, number>()
  for (const e of list) by.set(e.categoryId, (by.get(e.categoryId) ?? 0) + e.amountCents)
  const cats = [...by.entries()]
    .map(([id, cents]) => {
      const c = categoryOf(db, id)
      return { id, cents, name: c?.name ?? 'Outros', emoji: c?.emoji ?? '•' }
    })
    .sort((a, b) => b.cents - a.cents)
  return { total: sumCents(list), count: list.length, top: cats.slice(0, top) }
}

export const isWorkoutDone = (w: Workout) => w.status === 'feito' || w.status === 'adaptado'

export function workoutsByModality(
  db: DB,
  list: Workout[],
): { id: string; label: string; emoji: string; count: number }[] {
  const by = new Map<string, number>()
  for (const w of list) by.set(w.modality, (by.get(w.modality) ?? 0) + 1)
  return [...by.entries()]
    .map(([id, count]) => {
      const m = modalityOf(db, id)
      return { id, label: m.label, emoji: m.emoji, count }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
