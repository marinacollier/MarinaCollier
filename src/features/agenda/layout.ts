/**
 * Pure timeline layout: turns timed entries into positioned blocks with side-by-side columns
 * for overlaps. No React, no store — easy to test.
 */
import type { TimeHM } from '@/data/types'
import { hmToMinutes } from '@/lib/date'

export const DEFAULT_DURATION_MIN = 30
export const DAY_START_HOUR = 6
export const DAY_END_HOUR = 23

export interface TimedLike {
  time?: TimeHM
  endTime?: TimeHM
  allDay?: boolean
}

/** Start/end in minutes since midnight. Missing or invalid end → default duration. */
export function entryRange(e: TimedLike, defaultMin = DEFAULT_DURATION_MIN): { start: number; end: number } {
  const start = hmToMinutes(e.time ?? '00:00')
  let end = e.endTime ? hmToMinutes(e.endTime) : NaN
  if (!Number.isFinite(end) || end <= start) end = start + defaultMin
  return { start, end: Math.min(end, 24 * 60) }
}

export interface Placed<T> {
  item: T
  /** Real start/end (minutes since midnight). */
  start: number
  end: number
  /** Column index inside its overlap cluster, 0-based. */
  col: number
  /** Number of columns in its overlap cluster. */
  cols: number
  /** How many columns this block may span to the right (free neighbours). */
  span: number
}

/**
 * Classic calendar layout:
 * 1. sort by start (longer first on ties),
 * 2. split into clusters of transitively overlapping blocks,
 * 3. greedy column assignment inside each cluster,
 * 4. let a block stretch into columns on its right that stay free during its time.
 *
 * `minVisualMin` makes very short blocks count as at least that long for collision purposes,
 * so a 5-minute event right before another doesn't render on top of it.
 */
export function layoutDay<T extends TimedLike>(items: T[], minVisualMin = DEFAULT_DURATION_MIN): Placed<T>[] {
  const ranged = items
    .filter((it) => !it.allDay && !!it.time)
    .map((item) => {
      const { start, end } = entryRange(item)
      return { item, start, end, vEnd: Math.max(end, start + minVisualMin) }
    })
    .sort((a, b) => a.start - b.start || b.vEnd - a.vEnd)

  const out: Placed<T>[] = []
  let cluster: typeof ranged = []
  let clusterEnd = -1

  const flush = () => {
    if (!cluster.length) return
    const colEnds: number[] = []
    const colOf: number[] = []
    for (const r of cluster) {
      let c = colEnds.findIndex((end) => end <= r.start)
      if (c === -1) {
        c = colEnds.length
        colEnds.push(r.vEnd)
      } else colEnds[c] = r.vEnd
      colOf.push(c)
    }
    const cols = colEnds.length
    cluster.forEach((r, i) => {
      const col = colOf[i]
      let span = 1
      for (let next = col + 1; next < cols; next++) {
        const blocked = cluster.some((o, j) => colOf[j] === next && o.start < r.vEnd && r.start < o.vEnd)
        if (blocked) break
        span++
      }
      out.push({ item: r.item, start: r.start, end: r.end, col, cols, span })
    })
    cluster = []
    clusterEnd = -1
  }

  for (const r of ranged) {
    if (cluster.length && r.start >= clusterEnd) flush()
    cluster.push(r)
    clusterEnd = Math.max(clusterEnd, r.vEnd)
  }
  flush()
  return out
}

/** Visible hour range: 06–23 by default, widened when entries fall outside. */
export function timelineBounds(
  items: TimedLike[],
  defaults: { from: number; to: number } = { from: DAY_START_HOUR, to: DAY_END_HOUR },
): { fromHour: number; toHour: number } {
  let from = defaults.from
  let to = defaults.to
  for (const it of items) {
    if (it.allDay || !it.time) continue
    const { start, end } = entryRange(it)
    from = Math.min(from, Math.floor(start / 60))
    to = Math.max(to, Math.ceil(end / 60))
  }
  return { fromHour: Math.max(0, from), toHour: Math.min(24, to) }
}
