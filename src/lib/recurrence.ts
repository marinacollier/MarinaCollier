/**
 * Recurrence rules are evaluated on DateKeys. A rule describes *when something should happen*;
 * whether it happened on a given day is an `Occurrence` record. Keep these two separate.
 */
import type { DateKey, Occurrence, OccurrenceParent, Recurrence, ID } from '@/data/types'
import { addDays, daysInMonth, diffDays, weekday } from './date'

/** Does a rule produce an occurrence on `date`? For `every_n_days` + `fromLastDone`, pass the last done date. */
export function occursOn(rule: Recurrence, date: DateKey, lastDone?: DateKey): boolean {
  switch (rule.kind) {
    case 'daily':
      return true
    case 'weekly':
      return rule.weekdays.includes(weekday(date))
    case 'monthly': {
      const day = Number(date.slice(8, 10))
      const dim = daysInMonth(date)
      const target = rule.dayOfMonth === 'last' ? dim : Math.min(rule.dayOfMonth, dim)
      return day === target
    }
    case 'every_n_days': {
      const base = rule.fromLastDone && lastDone ? lastDone : rule.anchor
      const d = diffDays(base, date)
      if (rule.fromLastDone && lastDone) return d >= rule.days
      return d >= 0 && d % Math.max(1, rule.days) === 0
    }
  }
}

/**
 * For `every_n_days` + `fromLastDone` rules something becomes *due* and stays due until done
 * (e.g. "banho da Luna a cada 15 dias"). For the other kinds this equals occursOn.
 */
export function isDue(rule: Recurrence, date: DateKey, lastDone?: DateKey): boolean {
  if (rule.kind === 'every_n_days' && rule.fromLastDone) {
    if (!lastDone) return date >= rule.anchor
    return diffDays(lastDone, date) >= rule.days
  }
  return occursOn(rule, date, lastDone)
}

/** Next date (>= from) on which the rule occurs, searching up to `horizon` days. */
export function nextOccurrence(
  rule: Recurrence,
  from: DateKey,
  lastDone?: DateKey,
  horizon = 400,
): DateKey | undefined {
  if (rule.kind === 'every_n_days' && rule.fromLastDone) {
    const base = lastDone ? addDays(lastDone, rule.days) : rule.anchor
    return base < from ? from : base
  }
  for (let i = 0; i <= horizon; i++) {
    const d = addDays(from, i)
    if (occursOn(rule, d, lastDone)) return d
  }
  return undefined
}

export function occurrenceFor(
  occurrences: Occurrence[],
  parentType: OccurrenceParent,
  parentId: ID,
  date: DateKey,
): Occurrence | undefined {
  return occurrences.find((o) => o.parentType === parentType && o.parentId === parentId && o.date === date)
}

export function lastDoneDate(
  occurrences: Occurrence[],
  parentType: OccurrenceParent,
  parentId: ID,
): DateKey | undefined {
  let last: DateKey | undefined
  for (const o of occurrences) {
    if (o.parentType === parentType && o.parentId === parentId && o.status === 'done') {
      if (!last || o.date > last) last = o.date
    }
  }
  return last
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Human label: "todo dia", "seg, qua, sex", "dias úteis", "a cada 15 dias", "todo dia 5", "último dia do mês". */
export function describeRecurrence(rule: Recurrence): string {
  switch (rule.kind) {
    case 'daily':
      return 'todo dia'
    case 'weekly': {
      const s = [...rule.weekdays].sort()
      if (s.length === 7) return 'todo dia'
      if (s.join() === '1,2,3,4,5') return 'dias úteis'
      if (s.join() === '0,6') return 'fins de semana'
      if (s.length === 0) return 'nenhum dia'
      // Show Monday first.
      const ordered = [...s.filter((d) => d !== 0), ...s.filter((d) => d === 0)]
      return ordered.map((d) => WD[d]).join(', ')
    }
    case 'monthly':
      return rule.dayOfMonth === 'last' ? 'último dia do mês' : `todo dia ${rule.dayOfMonth}`
    case 'every_n_days':
      return rule.days === 1 ? 'todo dia' : `a cada ${rule.days} dias`
  }
}
