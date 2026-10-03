/**
 * Presentation rules of the Linha do dia (pure + tested):
 * - the past folds into one calm line ("04:40–07:20 · 9 itens · 7 ✓"), so the list starts near now;
 * - "agora" sits right before the first thing that hasn't started;
 * - the "acordei agora" offer appears only when a morning routine clearly hasn't started yet.
 */
import { endMin, isAnytime, startMin } from '@/data/timeline'
import type { DB, TimelineEntry } from '@/data/types'

/** Past entries older than this fold even when unchecked (no guilt, just less noise). */
const FOLD_AFTER_MIN = 60

/** A later routine shown as one line until it gets close ("21:00–22:10 · 🌙 Encerrar o dia · 8 itens"). */
export interface RoutineRun {
  key: string
  routineId: string
  title: string
  emoji?: string
  start: string
  end?: string
  entries: TimelineEntry[]
}

export type ViewRow = { type: 'entry'; entry: TimelineEntry } | { type: 'run'; run: RoutineRun }

/** Routines further than this from now show as one line. */
const RUN_AHEAD_MIN = 180

export interface TimelineView {
  /** Leading past entries folded into one line. */
  folded: TimelineEntry[]
  visible: TimelineEntry[]
  /** `visible` with later routines grouped (what the widget renders). */
  rows: ViewRow[]
  anytime: TimelineEntry[]
  /** Index in `visible` before which the "agora" marker goes (undefined = not today). */
  nowAt?: number
  /** Something happening right now. */
  currentKey?: string
}

export interface RoutineInfo {
  id: string
  name: string
  emoji?: string
}

function groupRuns(visible: TimelineEntry[], nowMinutes: number | undefined, routineOf: ((e: TimelineEntry) => RoutineInfo | undefined) | undefined, open: Set<string>): ViewRow[] {
  const rows: ViewRow[] = []
  let i = 0
  while (i < visible.length) {
    const e = visible[i]
    const r = routineOf?.(e)
    if (r && nowMinutes !== undefined && (startMin(e) ?? 0) > nowMinutes + RUN_AHEAD_MIN && !open.has(`run:${r.id}`)) {
      let j = i
      while (j < visible.length && routineOf?.(visible[j])?.id === r.id) j++
      if (j - i >= 3) {
        const list = visible.slice(i, j)
        rows.push({ type: 'run', run: { key: `run:${r.id}`, routineId: r.id, title: r.name, emoji: r.emoji, start: list[0].start!, end: list.at(-1)!.end ?? list.at(-1)!.start, entries: list } })
        i = j
        continue
      }
    }
    rows.push({ type: 'entry', entry: e })
    i++
  }
  return rows
}

export function buildView(
  entries: TimelineEntry[],
  nowMinutes?: number,
  showAll = false,
  routineOf?: (e: TimelineEntry) => RoutineInfo | undefined,
  openRuns: Set<string> = new Set(),
): TimelineView {
  const timed = entries.filter((e) => !isAnytime(e))
  const anytime = entries.filter(isAnytime)
  let foldCount = 0
  if (nowMinutes !== undefined && !showAll) {
    for (const e of timed) {
      const end = endMin(e) ?? 0
      const settled = e.status !== 'pending' || !e.editable.check
      if (end <= nowMinutes - FOLD_AFTER_MIN || (settled && end <= nowMinutes)) foldCount++
      else break
    }
    if (foldCount < 3) foldCount = 0
  }
  const folded = timed.slice(0, foldCount)
  const visible = timed.slice(foldCount)
  const rows = groupRuns(visible, nowMinutes, routineOf, openRuns)
  if (nowMinutes === undefined) return { folded, visible, rows, anytime }
  const nowAt = visible.findIndex((e) => (startMin(e) ?? 0) > nowMinutes)
  const ongoing = visible.filter(
    (e) => e.kind !== 'work' && e.timeSource !== 'approx' && e.status === 'pending' && (startMin(e) ?? 0) <= nowMinutes && nowMinutes < (endMin(e) ?? 0),
  )
  return { folded, visible, rows, anytime, nowAt: nowAt === -1 ? visible.length : nowAt, currentKey: ongoing.at(-1)?.key }
}

export function foldSummary(folded: TimelineEntry[]): string {
  const done = folded.filter((e) => e.status === 'done').length
  const from = folded[0]?.start
  const to = folded.at(-1)?.end ?? folded.at(-1)?.start
  return `${from}–${to} · ${folded.length} ${folded.length === 1 ? 'item' : 'itens'}${done ? ` · ${done} ✓` : ''}`
}

/** routineOf for buildView, from the DB. */
export function routineLookup(db: DB): (e: TimelineEntry) => RoutineInfo | undefined {
  const itemRoutine = new Map(db.routineItems.map((i) => [i.id, i.routineId]))
  const routines = new Map(db.routines.map((r) => [r.id, r]))
  return (e) => {
    if (e.ref.type !== 'routineItem') return undefined
    const r = routines.get(itemRoutine.get(e.ref.id) ?? '')
    return r ? { id: r.id, name: r.name, emoji: r.emoji } : undefined
  }
}

/**
 * "Acordou agora?" — a morning routine whose first item started ≥ 15 min ago, nothing of it checked
 * yet, and part of it still ahead. Returns its id.
 */
export function lateMorning(db: DB, entries: TimelineEntry[], nowMinutes: number): string | undefined {
  const itemById = new Map(db.routineItems.map((i) => [i.id, i]))
  const morning = db.routines.filter((r) => r.active && r.period === 'manha').map((r) => r.id)
  for (const rid of morning) {
    const rows = entries.filter((e) => e.ref.type === 'routineItem' && itemById.get(e.ref.id)?.routineId === rid && !isAnytime(e))
    if (!rows.length || rows.some((e) => e.status !== 'pending' || e.timeSource === 'override')) continue
    const first = Math.min(...rows.map((e) => startMin(e) ?? 0))
    const last = Math.max(...rows.map((e) => endMin(e) ?? 0))
    if (first + 15 <= nowMinutes && nowMinutes < last) return rid
  }
  return undefined
}

/**
 * What the routine card shows: the routine's items plus the training / meals that fall inside its
 * time range (a training morning reads "05:00 pré-treino · 06:00 treino · 07:00 movimento").
 */
export function routineCardEntries(db: DB, entries: TimelineEntry[], routineId: string): TimelineEntry[] {
  const routineOf = routineLookup(db)
  const own = entries.filter((e) => routineOf(e)?.id === routineId)
  const timed = own.filter((e) => !isAnytime(e))
  if (!timed.length) return own
  const from = Math.min(...timed.map((e) => startMin(e) ?? 0))
  const to = Math.max(...timed.map((e) => endMin(e) ?? 0))
  const inside = entries.filter((e) => (e.kind === 'workout' || e.kind === 'meal') && !isAnytime(e) && (startMin(e) ?? 0) >= from && (startMin(e) ?? 0) < to)
  const merged = [...timed, ...inside].sort((a, b) => a.start!.localeCompare(b.start!))
  return [...merged, ...own.filter(isAnytime)]
}
