/**
 * "Só nessa semana": change one occurrence of a recurring event without touching the series.
 * - cancel  → add the date to `exdates`
 * - move    → one-off copy on the new date/time + exdate on the original
 * Pure builders + tiny appliers (with undo), so the rules are easy to test.
 */
import { toast } from '@/app/ui-store'
import { actions, getDB } from '@/data/store'
import { eventOccursOn } from '@/data/planning'
import type { CalendarEvent, DateKey, DayPeriod, NewItem, TimeHM } from '@/data/types'
import { addDays } from '@/lib/date'
import { haptic } from '@/lib/haptics'

export function isRecurringEvent(e: Pick<CalendarEvent, 'recurrence'>): boolean {
  return !!e.recurrence
}

/** Exdates after cancelling `date` (sorted, no duplicates). */
export function withExdate(e: Pick<CalendarEvent, 'exdates'>, date: DateKey): DateKey[] {
  return [...new Set([...(e.exdates ?? []), date])].sort()
}

/** Exdates after restoring `date`. Undefined when nothing is left. */
export function withoutExdate(e: Pick<CalendarEvent, 'exdates'>, date: DateKey): DateKey[] | undefined {
  const rest = (e.exdates ?? []).filter((d) => d !== date)
  return rest.length ? rest : undefined
}

export interface OccurrenceTarget {
  date: DateKey
  /** Exact new time. When omitted, `period` (or the original's time/period) is kept. */
  startTime?: TimeHM
  endTime?: TimeHM
  period?: DayPeriod
}

/**
 * The one-off copy for a moved occurrence. Keeps title/kind/category/template/links; drops the
 * recurrence, exdates and external mirror (the copy is a local, editable event).
 */
export function occurrenceCopy(e: CalendarEvent, to: OccurrenceTarget, localSourceId: string): NewItem<'events'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, createdAt, updatedAt, recurrence, exdates, external, ...rest } = e
  const exact = to.startTime ?? (to.period ? undefined : e.startTime)
  return {
    ...rest,
    sourceId: external ? localSourceId : e.sourceId,
    date: to.date,
    endDate: undefined,
    startTime: exact,
    endTime: exact ? (to.startTime ? to.endTime : e.endTime) : undefined,
    period: exact ? undefined : (to.period ?? e.period),
  }
}

/** Next date (from `from`, inclusive) on which the event happens — for sheets opened without a day. */
export function nextOccurrenceOf(e: CalendarEvent, from: DateKey, horizon = 400): DateKey | undefined {
  const start = e.date > from ? e.date : from
  for (let i = 0; i < horizon; i++) {
    const d = addDays(start, i)
    if (eventOccursOn(e, d)) return d
  }
  return undefined
}

// ─── Appliers ───────────────────────────────────────────────────────────────

export function cancelOccurrence(eventId: string, date: DateKey, label = 'Fica de fora só nesse dia'): void {
  const ev = getDB().events.find((e) => e.id === eventId)
  if (!ev) return
  actions.update('events', ev.id, { exdates: withExdate(ev, date) })
  haptic('light')
  toast(`${label} 🌿`, {
    action: {
      label: 'Desfazer',
      run: () => {
        const cur = getDB().events.find((e) => e.id === eventId)
        if (cur) actions.update('events', cur.id, { exdates: withoutExdate(cur, date) })
      },
    },
  })
}

export function moveOccurrence(eventId: string, from: DateKey, to: OccurrenceTarget, localSourceId: string): void {
  const ev = getDB().events.find((e) => e.id === eventId)
  if (!ev) return
  const copy = actions.create('events', occurrenceCopy(ev, to, localSourceId))
  actions.update('events', ev.id, { exdates: withExdate(ev, from) })
  haptic('success')
  toast('Movido só dessa vez ✓', {
    action: {
      label: 'Desfazer',
      run: () => {
        actions.remove('events', copy.id)
        const cur = getDB().events.find((e) => e.id === eventId)
        if (cur) actions.update('events', cur.id, { exdates: withoutExdate(cur, from) })
      },
    },
  })
}
