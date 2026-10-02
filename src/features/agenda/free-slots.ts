/**
 * Free time between commitments, and a gentle way to fit untimed tasks into it.
 * Pure functions on TimeHM strings.
 */
import type { TimeHM } from '@/data/types'
import { hmToMinutes, minutesToHM } from '@/lib/date'
import { entryRange, type TimedLike } from './layout'

export interface FreeSlot {
  start: TimeHM
  end: TimeHM
  minutes: number
}

export interface FreeSlotOptions {
  from?: TimeHM
  to?: TimeHM
  /** Ignore gaps shorter than this. Default 30. */
  minMinutes?: number
  /** Treat every entry as at least this long (matches the timeline's minimum block height). Default 0. */
  minBlockMin?: number
}

/** Gaps between timed entries inside [from, to]. All-day and untimed entries don't block time. */
export function findFreeSlots(entries: TimedLike[], { from = '06:00', to = '21:00', minMinutes = 30, minBlockMin = 0 }: FreeSlotOptions = {}): FreeSlot[] {
  const lo = hmToMinutes(from)
  const hi = hmToMinutes(to)
  if (hi <= lo) return []
  const busy = entries
    .filter((e) => !e.allDay && !!e.time)
    .map((e) => entryRange(e))
    .map((r) => ({ start: r.start, end: Math.max(r.end, r.start + minBlockMin) }))
    .filter((r) => r.end > lo && r.start < hi)
    .sort((a, b) => a.start - b.start)

  const out: FreeSlot[] = []
  let cursor = lo
  const push = (s: number, e: number) => {
    if (e - s >= minMinutes) out.push({ start: minutesToHM(s), end: minutesToHM(e), minutes: e - s })
  }
  for (const b of busy) {
    if (b.start > cursor) push(cursor, Math.min(b.start, hi))
    cursor = Math.max(cursor, b.end)
    if (cursor >= hi) break
  }
  if (cursor < hi) push(cursor, hi)
  return out
}

/** "livre 14:00–16:00" */
export function freeLabel(s: FreeSlot): string {
  return `livre ${s.start}–${s.end}`
}

/** Rounds minutes-of-day up to the next quarter hour ("now" as a slot start). */
export function ceilQuarter(min: number): TimeHM {
  return minutesToHM(Math.min(24 * 60 - 1, Math.ceil(min / 15) * 15))
}

export interface FitResult<T> {
  /** slot index (in the given slots array) → items fitted there, in order. */
  placed: { slot: FreeSlot; items: T[] }[]
  /** Items that didn't fit anywhere — shown in the "para encaixar" rail. */
  rest: T[]
}

/**
 * Spread items into the largest free slots, ~`perItemMin` of room per item, biggest gaps first.
 * Only slots of at least `minSlot` minutes host tasks. Order of items is kept inside a slot;
 * slots in the result are in chronological order.
 */
export function fitIntoSlots<T>(items: T[], slots: FreeSlot[], perItemMin = 45, minSlot = 60): FitResult<T> {
  const usable = slots
    .map((slot, idx) => ({ slot, idx, cap: Math.max(1, Math.floor(slot.minutes / perItemMin)) }))
    .filter((s) => s.slot.minutes >= minSlot)
    .sort((a, b) => b.slot.minutes - a.slot.minutes || a.idx - b.idx)

  const buckets = new Map<number, T[]>()
  const queue = [...items]
  // Round-robin over slots biggest-first so tasks spread through the day instead of piling up.
  while (queue.length) {
    let placedAny = false
    for (const s of usable) {
      if (!queue.length) break
      const b = buckets.get(s.idx) ?? []
      if (b.length >= s.cap) continue
      b.push(queue.shift()!)
      buckets.set(s.idx, b)
      placedAny = true
    }
    if (!placedAny) break
  }
  const placed = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, list]) => ({ slot: slots[idx], items: list }))
  return { placed, rest: queue }
}
