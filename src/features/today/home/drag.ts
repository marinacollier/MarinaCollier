/**
 * Arrastar na linha do tempo de Hoje — the pure part: where a dropped line lands in time.
 *
 * The line goes right after its new previous neighbour (that one's end, rounded UP to 5 min) or, at the
 * top, right before its new next neighbour (that one's start minus the line's own length, rounded DOWN).
 * The line keeps its length (end − start); a line without an end keeps only its start.
 */

export interface DragRow {
  /** "HH:MM"; anything else (no time, "99:99") counts as "no time". */
  start?: string
  end?: string
}

export interface DropSlot {
  start: string
  end?: string
}

/** A neighbour with no end is taken as half an hour long. */
export const ASSUMED_MIN = 30
const STEP = 5
const DAY_END = 23 * 60 + 55

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function toMin(hm?: string): number | undefined {
  const m = hm ? HM.exec(hm) : null
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

export function toHM(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const up5 = (m: number) => Math.ceil(m / STEP) * STEP
const down5 = (m: number) => Math.floor(m / STEP) * STEP

/** Length of a row in minutes (undefined = unknown). */
export function durationOf(r: DragRow): number | undefined {
  const s = toMin(r.start)
  const e = toMin(r.end)
  if (s === undefined || e === undefined || e <= s) return undefined
  return e - s
}

/** Where the line would be if moved from `from` to final index `to` (array-move semantics). */
export function reorder<T>(rows: readonly T[], from: number, to: number): T[] {
  const out = rows.slice()
  const [it] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(out.length, to)), 0, it)
  return out
}

/**
 * New time of rows[from] once it sits at index `to` of the reordered list.
 * `undefined` = nothing changes (same place, or no timed neighbour to anchor on).
 */
export function dropTime(rows: readonly DragRow[], from: number, to: number): DropSlot | undefined {
  if (from === to || from < 0 || from >= rows.length) return undefined
  const moved = rows[from]
  const curStart = toMin(moved.start)
  if (curStart === undefined) return undefined
  const dur = durationOf(moved)
  const next = reorder(rows, from, to)
  const at = next.indexOf(moved)

  let start: number | undefined
  // After the nearest timed line above.
  for (let i = at - 1; i >= 0 && start === undefined; i--) {
    const s = toMin(next[i].start)
    if (s === undefined) continue
    start = up5(toMin(next[i].end) ?? s + ASSUMED_MIN)
    if (start <= s) start = up5(s + ASSUMED_MIN)
  }
  // At the top: before the nearest timed line below.
  if (start === undefined) {
    for (let i = at + 1; i < next.length && start === undefined; i++) {
      const s = toMin(next[i].start)
      if (s === undefined) continue
      start = down5(s - (dur ?? ASSUMED_MIN))
    }
  }
  if (start === undefined) return undefined
  start = Math.max(0, Math.min(DAY_END, start))
  if (start === curStart) return undefined
  return dur === undefined ? { start: toHM(start) } : { start: toHM(start), end: toHM(start + dur) }
}

/** Final index for a pointer at `y`, given the midpoints (same coordinates) of the OTHER rows, in order. */
export function indexAt(mids: readonly number[], y: number): number {
  let i = 0
  while (i < mids.length && mids[i] < y) i++
  return i
}
