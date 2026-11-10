/**
 * Capacidade do dia — how many minutes are really free for flexible things, from NOW until she goes to sleep.
 * Pure: (db, date, now, energy, entries?) → { freeMin, focusMin, windows }.
 *
 *   window   = max(now, wake) → profile.rhythm.sleepTime
 *   busy     = real timed calendar entries (events, meetings, classes, workouts, timed tasks, trip items),
 *              the work hours on work days (mode brasil) and the ESSENTIAL base-day blocks
 *              (ritual · luna · almoço · descanso). Suggested blocks and other base blocks are only
 *              suggestions → NOT busy. Cancelled / done / optional entries are not busy either.
 *   buffers  = 10 min before and after each busy entry (transitions are real life)
 *   reserve  = essentials that are not in the calendar (Luna, minimum routines, meals) — see sources.ts
 *   margin   = 15 % of what is left (the day never runs to the minute)
 *   focusMin = freeMin × energy factor (1: 0.4 · 2: 0.6 · 3: 0.8 · 4–5: 1.0). A ceiling, never a target.
 */
import { calendarEntries, isTimed, type CalendarEntry } from '../calendar/universal'
import { dayBlocksOn, modeHasWorkBase, routineModeOn } from '../routine-modes'
import { hmToMinutes, minutesToHM } from '@/lib/date'
import type { DateKey, DB, TimeHM } from '../types'
import type { Energy } from './contract'
import { ESSENTIAL_BLOCKS, essentialsFor } from './sources'

export const CAPACITY = {
  bufferMin: 10,
  margin: 0.15,
  minWindowMin: 10,
  energyFactor: { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1, 5: 1 } as Record<Energy, number>,
} as const

export interface CapacityWindow {
  start: TimeHM
  end: TimeHM
}

export interface Capacity {
  freeMin: number
  focusMin: number
  windows: CapacityWindow[]
  /** Minutes of the free windows before reserve and margin (for the "porquê"). */
  openMin: number
  reserveMin: number
}

interface Interval {
  start: number
  end: number
}

const round5 = (n: number) => Math.max(0, Math.floor(n / 5) * 5)

export const energyFactor = (e: Energy | undefined) => CAPACITY.energyFactor[e ?? 3]

function merge(list: Interval[]): Interval[] {
  const out: Interval[] = []
  for (const i of [...list].filter((x) => x.end > x.start).sort((a, b) => a.start - b.start)) {
    const last = out.at(-1)
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else out.push({ ...i })
  }
  return out
}

/** Sleep time in minutes of the day; a bedtime after midnight (00:30) caps at the end of the day. */
function sleepMinutes(db: Pick<DB, 'profile'>): number {
  const s = hmToMinutes(db.profile.rhythm?.sleepTime ?? '23:00')
  return s < 12 * 60 ? 24 * 60 : s
}

/** Is this entry busy time? (see the header) */
export function isBusy(e: CalendarEntry, date: DateKey, essentialBlockIds: ReadonlySet<string>, workDay: boolean): boolean {
  if (!isTimed(e) || e.startAt.date !== date) return false
  if (e.status === 'cancelado' || e.status === 'feito' || e.optional || e.suggested) return false
  if (e.sourceType === 'taskDeadline' || e.sourceType === 'tripDeadline') return false
  if (e.sourceType === 'work') return workDay
  if (e.sourceType === 'dayBlock') return essentialBlockIds.has(e.sourceId)
  return !e.base
}

export function busyIntervals(db: DB, date: DateKey, entries: CalendarEntry[]): Interval[] {
  const essentialIds = new Set(
    dayBlocksOn(db, date)
      .filter((b) => b.kind === 'base' && ESSENTIAL_BLOCKS.has(b.category))
      .map((b) => b.id),
  )
  const workDay = modeHasWorkBase(routineModeOn(db, date))
  const out: Interval[] = []
  for (const e of entries) {
    if (!isBusy(e, date, essentialIds, workDay)) continue
    const start = hmToMinutes(e.startAt.time!)
    let end = e.endAt.time ? hmToMinutes(e.endAt.time) : NaN
    if (!Number.isFinite(end) || end <= start) end = start + (e.sourceType === 'task' ? 30 : 60)
    out.push({
      start: start - CAPACITY.bufferMin,
      end: Math.min(24 * 60, end + CAPACITY.bufferMin),
    })
  }
  return merge(out)
}

/** Free flexible minutes today from `nowMin` until sleep. */
export function dayCapacity(db: DB, date: DateKey, nowMin: number, energy?: Energy, entries?: CalendarEntry[], extraBusy: CapacityWindow[] = []): Capacity {
  const list = entries ?? calendarEntries(db, date, date, { today: date })
  const wake = hmToMinutes(db.profile.rhythm?.wakeTime ?? '06:30')
  const from = Math.max(nowMin, wake)
  const to = sleepMinutes(db)
  const windows: Interval[] = []
  let cursor = from
  // Blocks already placed on the day (her plan) are busy too — a replan never stacks things on them.
  const placed = extraBusy.map((w) => ({ start: hmToMinutes(w.start), end: hmToMinutes(w.end) }))
  for (const b of merge([...busyIntervals(db, date, list), ...placed])) {
    if (b.end <= cursor) continue
    if (b.start >= to) break
    if (b.start > cursor) windows.push({ start: cursor, end: Math.min(b.start, to) })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < to) windows.push({ start: cursor, end: to })
  const usable = windows.filter((w) => w.end - w.start >= CAPACITY.minWindowMin)
  const openMin = usable.reduce((s, w) => s + (w.end - w.start), 0)
  const reserveMin = essentialsFor(db, date, nowMin).reserveMin
  const freeMin = round5(Math.max(0, openMin - reserveMin) * (1 - CAPACITY.margin))
  return {
    freeMin,
    focusMin: round5(freeMin * energyFactor(energy)),
    windows: usable.map((w) => ({
      start: minutesToHM(w.start),
      end: minutesToHM(Math.min(w.end, 24 * 60 - 1)),
    })),
    openMin,
    reserveMin,
  }
}
