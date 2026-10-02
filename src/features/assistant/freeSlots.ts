/**
 * Free-slot finder (local helper for Mari). Busy time = anything with a time on `agendaFor`
 * (events, timed tasks, workouts). Entries without an end time count as 60 minutes.
 */
import type { DateKey, DB } from '@/data/types'
import { agendaFor } from '@/data/selectors'
import { addDays, endOfWeek, hmToMinutes, minutesToHM } from '@/lib/date'

export interface FreeSlot {
  date: DateKey
  start: number
  end: number
}

export interface SlotOptions {
  /** Window of the day, minutes. Default 06:00–21:00. */
  from?: number
  to?: number
  minMinutes?: number
  /** Ignore time before this minute (used for today). */
  notBefore?: number
}

export function freeSlotsForDay(db: DB, date: DateKey, opts: SlotOptions = {}): FreeSlot[] {
  const from = Math.max(opts.from ?? 6 * 60, opts.notBefore ?? 0)
  const to = opts.to ?? 21 * 60
  const min = opts.minMinutes ?? 60
  const busy = agendaFor(db, date)
    .filter((e) => !e.allDay && e.time)
    .map((e) => {
      const start = hmToMinutes(e.time!)
      const end = e.endTime ? Math.max(hmToMinutes(e.endTime), start + 15) : start + 60
      return [start, end] as const
    })
    .sort((a, b) => a[0] - b[0])

  const slots: FreeSlot[] = []
  let cursor = from
  for (const [s, e] of busy) {
    if (e <= cursor) continue
    if (s >= to) break
    if (s - cursor >= min) slots.push({ date, start: cursor, end: s })
    cursor = Math.max(cursor, e)
  }
  if (to - cursor >= min) slots.push({ date, start: cursor, end: to })
  return slots
}

export interface DaySlots {
  date: DateKey
  slots: FreeSlot[]
}

export interface WorkoutFit {
  days: DaySlots[]
  /** Days left out because that modality is already planned/done there. */
  skipped: DateKey[]
  /** The window reaches into next week (few days left in this one). */
  extended: boolean
}

/**
 * Where a workout of `modality` fits: days from today to Sunday (extended to 7 days when fewer than
 * 3 days would be available), skipping days that already have that modality.
 */
export function findWorkoutSlots(db: DB, today: DateKey, nowMinutes: number, modality: string, opts: SlotOptions = {}): WorkoutFit {
  const scan = (until: DateKey) => {
    const days: DaySlots[] = []
    const skipped: DateKey[] = []
    for (let d = today; d <= until; d = addDays(d, 1)) {
      const already = db.workouts.some((w) => w.date === d && w.modality === modality && w.status !== 'pulado' && w.status !== 'descanso')
      if (already) {
        skipped.push(d)
        continue
      }
      // Today: start from the next half hour.
      const notBefore = d === today ? Math.ceil((nowMinutes + 1) / 30) * 30 : undefined
      const slots = freeSlotsForDay(db, d, { ...opts, notBefore })
      if (slots.length) days.push({ date: d, slots })
    }
    return { days, skipped }
  }
  const week = scan(endOfWeek(today))
  if (week.days.length >= 3) return { ...week, extended: false }
  return { ...scan(addDays(today, 6)), extended: true }
}

export function slotLabel(s: FreeSlot): string {
  return `${minutesToHM(s.start)}–${minutesToHM(s.end)}`
}

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
