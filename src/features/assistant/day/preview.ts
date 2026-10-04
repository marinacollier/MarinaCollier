/**
 * How the day's line looks after a plan — computed by the real timeline on a simulated DB, so the
 * preview is exactly what Hoje/Agenda will show once she confirms.
 */
import type { ScheduleOp } from '@/data/schedule'
import { dayTimeline, refKey } from '@/data/timeline'
import type { DateKey, DB, TimelineEntry } from '@/data/types'
import type { DayRow } from '../adjust/types'

const MAX_ROWS = 7

function rows(entries: TimelineEntry[]): Map<string, TimelineEntry> {
  const out = new Map<string, TimelineEntry>()
  for (const e of entries) {
    out.set(e.key, e)
    // Steps only show on their own when their group didn't move (see below).
    for (const c of e.children ?? []) out.set(c.key, c)
  }
  return out
}

/**
 * Rows that changed on `date` between `before` and `after`: moved (time), cancelled (status or gone),
 * new. `skipWorkouts` when the plan's training changes are already shown as session cards.
 */
export function dayDiff(before: DB, after: DB, date: DateKey, opts: { skipWorkouts?: boolean; primary?: Set<string> } = {}): DayRow[] {
  const a = dayTimeline(before, date)
  const b = dayTimeline(after, date)
  const ra = rows(a)
  const rb = rows(b)
  const parentMoved = new Set<string>()
  const out: DayRow[] = []
  const skip = (e: TimelineEntry) => e.kind === 'work' || (opts.skipWorkouts && e.kind === 'workout')
  for (const e of a) {
    const x = rb.get(e.key)
    if (x && x.start !== e.start) for (const c of e.children ?? []) parentMoved.add(c.key)
  }
  for (const [key, e] of ra) {
    if (skip(e) || parentMoved.has(key)) continue
    const x = rb.get(key)
    const wasOn = e.status !== 'cancelled' && e.status !== 'skipped'
    if (!x) {
      if (wasOn) out.push({ key, title: e.title, emoji: e.emoji, state: 'cancelled', from: e.start, lumos: true })
      continue
    }
    const isOn = x.status !== 'cancelled' && x.status !== 'skipped'
    if (wasOn && !isOn) out.push({ key, title: e.title, emoji: e.emoji, state: 'cancelled', from: e.start, lumos: true })
    else if (isOn && x.start !== e.start) out.push({ key, title: x.title, emoji: x.emoji, state: 'moved', from: e.start, to: x.start, lumos: true })
  }
  for (const [key, x] of rb) {
    if (ra.has(key) || skip(x) || x.status === 'cancelled') continue
    out.push({ key, title: x.title, emoji: x.emoji, state: 'new', to: x.start, lumos: true })
  }
  const primary = opts.primary ?? new Set<string>()
  return sortRows(out.map((r) => (primary.has(r.key) ? { ...r, primary: true } : r)))
}

const TYPE_OF: Record<string, string> = { workouts: 'workout', tasks: 'task', events: 'event', routineItems: 'routineItem', weekTemplate: 'weekTemplate' }

/** Row keys the ops aim at directly. */
export function opKeys(ops: ScheduleOp[]): Set<string> {
  return new Set(ops.map((op) => (op.op === 'update' ? `${TYPE_OF[op.collection] ?? op.collection}:${op.id}` : refKey(op.ref))))
}

export function sortRows(list: DayRow[]): DayRow[] {
  const t = (r: DayRow) => (r.state === 'free' || r.state === 'cancelled' ? r.from : (r.to ?? r.from)) ?? '99:99'
  return [...list].sort((x, y) => t(x).localeCompare(t(y)))
}

/** Long lists (a whole morning sliding) are trimmed: the first rows + "e mais N vêm junto". */
export function compactRows(list: DayRow[]): DayRow[] {
  if (list.length <= MAX_ROWS) return list
  const must = list.filter((r) => r.primary || r.state !== 'moved')
  const others = list.filter((r) => !must.includes(r))
  const keep = sortRows([...must, ...others.slice(0, Math.max(0, MAX_ROWS - 1 - must.length))])
  const rest = list.length - keep.length
  if (!rest) return keep
  return [...keep, { key: 'more', title: `e mais ${rest} ${rest === 1 ? 'item vem' : 'itens vêm'} junto`, state: 'kept' }]
}

