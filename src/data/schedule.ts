/**
 * Time edits for ONE day ("nesta quinta yoga às 20:00") + smart moves used by Hoje, Agenda and Lumos.
 *
 * Two layers:
 * - pure planners: (db, ...) → ScheduleOp[] / Proposal — deterministic, nothing written. Lumos can
 *   preview them ("Montei uma manhã curta pra você…") before anything changes;
 * - thin appliers: `applyOps(ops)` writes through `actions` and returns an Undo. Every write is
 *   undoable, and Lumos writes are marked `by: 'lumos'` on the ScheduleOverride.
 *
 * Rules
 * - Recurring things never change their default: a per-day change is a ScheduleOverride
 *   (one per date + ref, upserted). Only "mudar o padrão" (planSetDefault) edits the default.
 * - Dated one-off records that other screens read directly (a workout, a one-off task) get their
 *   own time updated — the record already belongs to that day only.
 * - Cancelling a recurring calendar event uses its `exdates` (the app-wide "só nessa semana").
 */
import type { CollectionKey, DateKey, DB, ID, LifeEvent, ScheduleOverride, TimeHM, TimelineEntry } from './types'
import { logLife } from './intel/log'
import { actions, getDB } from './store'
import { hmToMinutes, minutesToHM } from '@/lib/date'
import { nowISO, uid } from '@/lib/id'
import {
  dayTimeline,
  endMin,
  findEntry,
  isAnytime,
  itemDuration,
  overrideFor,
  refKey,
  startMin,
  type ScheduleRef,
} from './timeline'

export type { ScheduleRef }
export type Undo = () => void
type By = ScheduleOverride['by']

export interface OverridePatch {
  time?: TimeHM
  endTime?: TimeHM
  cancelled?: boolean
  anytime?: boolean
  reason?: string
}

type UpdatableKey = Extract<CollectionKey, 'workouts' | 'tasks' | 'routineItems' | 'events' | 'weekTemplate'>

export type ScheduleOp =
  | { op: 'override'; date: DateKey; ref: ScheduleRef; patch: OverridePatch; by: By }
  | { op: 'clear'; date: DateKey; ref: ScheduleRef }
  | { op: 'update'; collection: UpdatableKey; id: ID; patch: Record<string, unknown> }

export interface Proposal {
  ops: ScheduleOp[]
  /** One short human line ("Leitura vai pra 07:00"). */
  summary: string
  /** Applies the ops; returns the undo. */
  apply(): Undo
}

const clampHM = (min: number): TimeHM => minutesToHM(Math.max(0, Math.min(24 * 60 - 1, Math.round(min))))

/**
 * A proposal; when Lumos is the author (`by: 'lumos'`), applying it also writes a LifeEvent (life
 * timeline + "o que mudou?") that the same undo takes out.
 */
function proposal(ops: ScheduleOp[], summary: string, by?: By, kind: LifeEvent['kind'] = 'changed'): Proposal {
  return {
    ops,
    summary,
    apply: () => {
      const undo = applyOps(ops)
      if (by !== 'lumos' || !ops.length) return undo
      const date = ops.find((o): o is Exclude<ScheduleOp, { op: 'update' }> => o.op !== 'update')?.date ?? (ops[0].op === 'update' ? (ops[0].patch.date as DateKey | undefined) : undefined)
      const log = logLife({ kind, title: summary, ...(date ? { date } : {}), area: 'rotina', by: 'lumos', provenance: 'user' })
      return () => {
        log.undo()
        undo()
      }
    },
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export interface EffectiveTime {
  start?: TimeHM
  end?: TimeHM
  source: TimelineEntry['timeSource']
  status: TimelineEntry['status']
  entry: TimelineEntry
}

/** Where something sits on a day, after defaults, durations and overrides. */
export function effectiveTime(db: DB, date: DateKey, ref: ScheduleRef): EffectiveTime | undefined {
  const e = findEntry(dayTimeline(db, date), ref)
  if (!e) return undefined
  return { start: e.start, end: e.end, source: e.timeSource, status: e.status, entry: e }
}

// ─── Pure DB application (previews + tests) ─────────────────────────────────

/** Applies ops to a DB value without touching the store. */
export function applyOpsToDB(db: DB, ops: ScheduleOp[], stamp: string = nowISO()): DB {
  let out = { ...db, scheduleOverrides: [...(db.scheduleOverrides ?? [])] }
  for (const op of ops) {
    if (op.op === 'update') {
      const list = out[op.collection] as unknown as { id: ID }[]
      out = { ...out, [op.collection]: list.map((r) => (r.id === op.id ? { ...r, ...op.patch, updatedAt: stamp } : r)) }
      continue
    }
    const existing = overrideFor(out, op.date, op.ref.type, op.ref.id)
    if (op.op === 'clear') {
      if (existing) out.scheduleOverrides = out.scheduleOverrides.filter((o) => o.id !== existing.id)
      continue
    }
    if (existing) {
      out.scheduleOverrides = out.scheduleOverrides.map((o) => (o.id === existing.id ? { ...o, ...op.patch, by: op.by, updatedAt: stamp } : o))
    } else {
      out.scheduleOverrides.push({ id: uid(), createdAt: stamp, updatedAt: stamp, date: op.date, refType: op.ref.type, refId: op.ref.id, by: op.by, ...op.patch })
    }
  }
  return out
}

// ─── Store application (with undo) ──────────────────────────────────────────

/** Writes the ops through `actions` and returns a function that puts everything back. */
export function applyOps(ops: ScheduleOp[]): Undo {
  const undos: Undo[] = []
  for (const op of ops) {
    if (op.op === 'update') {
      const list = getDB()[op.collection] as unknown as Record<string, unknown>[]
      const before = list.find((r) => r.id === op.id)
      if (!before) continue
      const restore = Object.fromEntries(Object.keys(op.patch).map((k) => [k, before[k]]))
      actions.update(op.collection, op.id, op.patch as never)
      undos.push(() => actions.update(op.collection, op.id, restore as never))
      continue
    }
    const existing = overrideFor(getDB(), op.date, op.ref.type, op.ref.id)
    if (op.op === 'clear') {
      if (!existing) continue
      actions.remove('scheduleOverrides', existing.id)
      undos.push(() => actions.restore('scheduleOverrides', existing))
      continue
    }
    if (existing) {
      const keys = [...Object.keys(op.patch), 'by'] as (keyof ScheduleOverride)[]
      const restore = Object.fromEntries(keys.map((k) => [k, existing[k]]))
      actions.update('scheduleOverrides', existing.id, { ...op.patch, by: op.by })
      undos.push(() => actions.update('scheduleOverrides', existing.id, restore))
    } else {
      const created = actions.create('scheduleOverrides', { date: op.date, refType: op.ref.type, refId: op.ref.id, by: op.by, ...op.patch })
      undos.push(() => actions.remove('scheduleOverrides', created.id))
    }
  }
  return () => {
    for (const u of undos.reverse()) u()
  }
}

export function upsertOverride(date: DateKey, ref: ScheduleRef, patch: OverridePatch, by: By = 'marina'): Undo {
  return applyOps([{ op: 'override', date, ref, patch, by }])
}

export function clearOverride(date: DateKey, ref: ScheduleRef): Undo {
  return applyOps([{ op: 'clear', date, ref }])
}

// ─── Set a time ─────────────────────────────────────────────────────────────

/** Ops that put `ref` at `time` on `date` only. */
export function planSetTime(db: DB, date: DateKey, ref: ScheduleRef, time: TimeHM, by: By = 'marina'): ScheduleOp[] {
  if (ref.type === 'workout') {
    const w = db.workouts.find((x) => x.id === ref.id)
    if (w) return [{ op: 'update', collection: 'workouts', id: w.id, patch: { time, period: undefined } }]
  }
  if (ref.type === 'task') {
    const t = db.tasks.find((x) => x.id === ref.id)
    if (t && !t.recurrence) return [{ op: 'update', collection: 'tasks', id: t.id, patch: { time, date: t.date ?? date } }]
  }
  const patch: OverridePatch = { time, endTime: undefined, anytime: undefined, cancelled: undefined }
  if (ref.type === 'event') {
    // Keep the event's length when it moves.
    const cur = effectiveTime(db, date, ref)
    if (cur?.start && cur.end && cur.source !== 'approx') patch.endTime = clampHM(hmToMinutes(time) + (hmToMinutes(cur.end) - hmToMinutes(cur.start)))
  }
  return [{ op: 'override', date, ref, patch, by }]
}

export function setTimeOn(date: DateKey, ref: ScheduleRef, time: TimeHM, by: By = 'marina'): Undo {
  return applyOps(planSetTime(getDB(), date, ref, time, by))
}

/** "Qualquer momento" for that day only. */
export function setAnytimeOn(date: DateKey, ref: ScheduleRef, by: By = 'marina'): Undo {
  return applyOps([{ op: 'override', date, ref, patch: { anytime: true, time: undefined, endTime: undefined, cancelled: undefined }, by }])
}

/** Can "mudar o padrão também" change the recurring default of this ref? */
export function canSetDefault(db: DB, ref: ScheduleRef): boolean {
  if (ref.type === 'routineItem') return db.routineItems.some((i) => i.id === ref.id)
  if (ref.type === 'weekTemplate') return db.weekTemplate.some((t) => t.id === ref.id)
  if (ref.type === 'event') {
    const e = db.events.find((x) => x.id === ref.id)
    return !!e?.recurrence && !e.external
  }
  return false
}

/**
 * "Mudar o padrão também": the default time changes from now on, and that day's override goes away
 * (it would be redundant). A routine item becomes 'fixed' at that time.
 */
export function planSetDefault(db: DB, date: DateKey, ref: ScheduleRef, time: TimeHM): ScheduleOp[] {
  const ops: ScheduleOp[] = []
  if (ref.type === 'routineItem') {
    const it = db.routineItems.find((i) => i.id === ref.id)
    if (!it) return []
    ops.push({ op: 'update', collection: 'routineItems', id: it.id, patch: { time, timeMode: 'fixed', endTime: undefined, durationMin: itemDuration(it) } })
  } else if (ref.type === 'weekTemplate') {
    ops.push({ op: 'update', collection: 'weekTemplate', id: ref.id, patch: { time, period: undefined } })
  } else if (ref.type === 'event') {
    const e = db.events.find((x) => x.id === ref.id)
    if (!e) return []
    const dur = e.startTime && e.endTime ? hmToMinutes(e.endTime) - hmToMinutes(e.startTime) : undefined
    ops.push({ op: 'update', collection: 'events', id: e.id, patch: { startTime: time, endTime: dur ? clampHM(hmToMinutes(time) + dur) : e.endTime, period: undefined } })
  } else return []
  if (overrideFor(db, date, ref.type, ref.id)) ops.push({ op: 'clear', date, ref })
  return ops
}

// ─── Cancel ─────────────────────────────────────────────────────────────────

export interface CancelProposal extends Proposal {
  /** Everything that won't happen that day (the thing + its prep). */
  cancelled: ScheduleRef[]
  /** The time it frees up. */
  freed?: { start: TimeHM; end: TimeHM }
}

/**
 * "Amanhã cancelei meu inglês": cancels that day's occurrence AND what depends on it
 * (routine items with `dependsOn` pointing at it; 'workout' = the day's first training).
 */
export function cancelOn(db: DB, date: DateKey, ref: ScheduleRef, by: By = 'marina', reason?: string): CancelProposal {
  const timeline = dayTimeline(db, date)
  const target = findEntry(timeline, ref)
  const ops: ScheduleOp[] = []
  const cancelled: ScheduleRef[] = [ref]

  const w = ref.type === 'workout' ? db.workouts.find((x) => x.id === ref.id) : undefined
  const ev = ref.type === 'event' ? db.events.find((x) => x.id === ref.id) : undefined
  if (w) ops.push({ op: 'update', collection: 'workouts', id: w.id, patch: { status: 'pulado' } })
  else if (ev?.recurrence) ops.push({ op: 'update', collection: 'events', id: ev.id, patch: { exdates: [...new Set([...(ev.exdates ?? []), date])].sort() } })
  else ops.push({ op: 'override', date, ref, patch: { cancelled: true, reason }, by })

  const firstWorkout = timeline.find((e) => e.kind === 'workout' && e.status !== 'cancelled' && !isAnytime(e) && e.timeSource !== 'approx')
  const isFirstWorkout = !!firstWorkout && refKey(firstWorkout.ref) === refKey(ref)
  for (const it of db.routineItems) {
    const deps = it.dependsOn ?? []
    if (!deps.includes(ref.id) && !(isFirstWorkout && deps.includes('workout'))) continue
    const e = findEntry(timeline, { type: 'routineItem', id: it.id })
    if (!e || e.status === 'cancelled') continue
    const depRef = { type: 'routineItem' as const, id: it.id }
    ops.push({ op: 'override', date, ref: depRef, patch: { cancelled: true, reason: reason ?? 'depende do que foi cancelado' }, by })
    cancelled.push(depRef)
  }
  const freed = target?.start && target.end ? { start: target.start, end: target.end } : undefined
  const title = target?.title ?? 'Isso'
  const extra = cancelled.length > 1 ? ` (e o preparo junto)` : ''
  return { ...proposal(ops, `${title} fica de fora nesse dia${extra}`, by, 'cancelled'), cancelled, freed }
}

// ─── Move after / reorder / shift ───────────────────────────────────────────

/** "Joga meu banho pra depois da natação": new time = end of `afterRef`. */
export function moveAfter(db: DB, date: DateKey, ref: ScheduleRef, afterRef: ScheduleRef, by: By = 'marina'): Proposal {
  const timeline = dayTimeline(db, date)
  const after = findEntry(timeline, afterRef)
  const target = findEntry(timeline, ref)
  const at = after ? endMin(after) : undefined
  if (at === undefined || !target) return proposal([], 'Nada pra mudar')
  const time = clampHM(at)
  return proposal(planSetTime(db, date, ref, time, by), `${target.title} vai pra ${time}, depois de ${after!.title}`, by, 'moved')
}

/** The single key that moved between two orders (arrayMove), if exactly one did. */
function movedKey(before: string[], after: string[]): string | undefined {
  for (const k of after) {
    const a = before.filter((x) => x !== k)
    const b = after.filter((x) => x !== k)
    if (a.length === b.length && a.every((x, i) => x === b[i]) && before.indexOf(k) !== after.indexOf(k)) return k
  }
  return undefined
}

/**
 * After a drag in the day view: the moved item takes the time of its new slot (end of the item now
 * before it; or, at the top, just before the next one). Anchors (workouts, events, work) never move.
 */
export function reorderDay(db: DB, date: DateKey, orderedKeys: string[], by: By = 'marina'): Proposal {
  const timed = dayTimeline(db, date, { includeAnytime: false })
  const byKey = new Map(timed.map((e) => [e.key, e]))
  const keys = orderedKeys.filter((k) => byKey.has(k))
  const before = timed.map((e) => e.key).filter((k) => keys.includes(k))
  const moved = movedKey(before, keys)
  const candidates = moved ? [moved] : keys.filter((k, i) => before[i] !== k)
  const ops: ScheduleOp[] = []
  const lines: string[] = []
  let preview = db
  for (const k of candidates) {
    const e = byKey.get(k)
    if (!e?.editable.reorder) continue
    const i = keys.indexOf(k)
    const prev = i > 0 ? byKey.get(keys[i - 1]) : undefined
    const next = byKey.get(keys[i + 1])
    const dur = (endMin(e) ?? 0) - (startMin(e) ?? 0)
    const at = prev ? endMin(prev) : next ? (startMin(next) ?? 0) - Math.max(dur, 5) : undefined
    if (at === undefined) continue
    const time = clampHM(at)
    if (time === e.start) continue
    const step = planSetTime(preview, date, e.ref, time, by)
    preview = applyOpsToDB(preview, step)
    ops.push(...step)
    lines.push(`${e.title} → ${time}`)
  }
  return proposal(ops, lines.join(' · ') || 'Nada pra mudar', by, 'moved')
}

/** "Amanhã quero acordar 5h30": the routine's chain slides; fixed items move by the same delta. */
export function shiftRoutine(db: DB, date: DateKey, routineId: ID, newStart: TimeHM, by: By = 'marina'): Proposal {
  const items = new Map(db.routineItems.filter((i) => i.routineId === routineId).map((i) => [i.id, i]))
  const entries = dayTimeline(db, date, { includeAnytime: false }).filter((e) => e.ref.type === 'routineItem' && items.has(e.ref.id) && e.status !== 'cancelled')
  if (!entries.length) return proposal([], 'Nada pra mudar')
  const order = [...entries].sort((a, b) => items.get(a.ref.id)!.order - items.get(b.ref.id)!.order)
  const first = order[0]
  const delta = hmToMinutes(newStart) - (startMin(first) ?? 0)
  if (!delta) return proposal([], 'Já começa nesse horário')
  const ops: ScheduleOp[] = [{ op: 'override', date, ref: first.ref, patch: { time: newStart, endTime: undefined, anytime: undefined }, by }]
  for (const e of order.slice(1)) {
    if (e.timeSource !== 'fixed' && e.timeSource !== 'override' && e.timeSource !== 'window') continue
    ops.push({ op: 'override', date, ref: e.ref, patch: { time: clampHM((startMin(e) ?? 0) + delta), endTime: undefined, anytime: undefined }, by })
  }
  const routine = db.routines.find((r) => r.id === routineId)
  return proposal(ops, `${routine?.name ?? 'Rotina'} começa às ${newStart}`, by, 'moved')
}

// ─── "Acordei agora" ────────────────────────────────────────────────────────

export interface ReplanLine {
  time: TimeHM
  title: string
  emoji?: string
  ref: ScheduleRef
  /** Stays as it was (an anchor like the training, or a meal already at a good time). */
  kept?: boolean
}

export interface ReplanProposal extends Proposal {
  /** "São 05:12. Seu treino continua às 06:00. Montei uma manhã curta pra você:" */
  message: string
  lines: ReplanLine[]
  /** Routine items that don't fit before the next commitment (cancelled for that day on apply). */
  drops: { title: string; ref: ScheduleRef }[]
  anchor?: TimelineEntry
}

export interface ReplanOptions {
  routineId?: ID
  by?: By
}

const HARD = new Set<TimelineEntry['kind']>(['workout', 'event', 'work'])

/**
 * Proposal (nothing applied) for "acordei agora": keeps hard anchors (training, events, work), packs
 * what's left of the routine from now on, preferring Essential items when it doesn't fit.
 */
export function replanFrom(db: DB, date: DateKey, nowMinutes: number, opts: ReplanOptions = {}): ReplanProposal {
  const by = opts.by ?? 'marina'
  const timeline = dayTimeline(db, date)
  const itemById = new Map(db.routineItems.map((i) => [i.id, i]))
  const pendingRoutine = timeline.filter((e) => e.ref.type === 'routineItem' && e.status === 'pending' && !isAnytime(e))
  const routineId =
    opts.routineId ??
    [...pendingRoutine].sort((a, b) => (startMin(a) ?? 0) - (startMin(b) ?? 0)).map((e) => itemById.get(e.ref.id)?.routineId).find(Boolean)
  const routine = db.routines.find((r) => r.id === routineId)
  const now = Math.round(nowMinutes)
  const nowHM = clampHM(now)
  const empty: ReplanProposal = { ...proposal([], 'Nada pra reorganizar'), message: `São ${nowHM}. Tá tudo em dia por aqui ✨`, lines: [], drops: [] }
  if (!routine) return empty

  const anchor = timeline.find((e) => HARD.has(e.kind) && e.status === 'pending' && e.timeSource !== 'approx' && !isAnytime(e) && (startMin(e) ?? 0) >= now)
  const limit = anchor ? startMin(anchor)! : undefined

  const items = pendingRoutine
    .filter((e) => itemById.get(e.ref.id)?.routineId === routine.id)
    .filter((e) => !itemById.get(e.ref.id)?.dependsOn?.includes('workout'))
    .filter((e) => limit === undefined || (startMin(e) ?? 0) < limit)
    .sort((a, b) => itemById.get(a.ref.id)!.order - itemById.get(b.ref.id)!.order)
  const dur = (e: TimelineEntry) => Math.max(1, (endMin(e) ?? 0) - (startMin(e) ?? 0))

  // Prep meals before the anchor: on time → kept; already behind → must fit in the new sequence.
  const meals = timeline.filter((e) => e.kind === 'meal' && e.status === 'pending' && !isAnytime(e) && (limit === undefined || (startMin(e) ?? 0) < limit))
  const mealsLate = meals.filter((e) => (e.phase === 'pre' || e.phase === 'intra') && (startMin(e) ?? 0) < now)
  const mealsKept = meals.filter((e) => (startMin(e) ?? 0) >= now)

  let budget = limit === undefined ? Infinity : limit - now - mealsLate.reduce((s, e) => s + dur(e), 0)
  const total = items.reduce((s, e) => s + dur(e), 0)
  let chosen: TimelineEntry[]
  let short = false
  if (total <= budget) chosen = items
  else {
    short = true
    const pool = routine.hasEssential ? items.filter((e) => itemById.get(e.ref.id)?.essential) : items
    chosen = []
    for (const e of pool) {
      if (dur(e) <= budget) {
        chosen.push(e)
        budget -= dur(e)
      }
    }
  }
  const drops = items.filter((e) => !chosen.includes(e))
  const label = (e: TimelineEntry) => {
    const it = itemById.get(e.ref.id)
    return short && it?.essentialLabel ? it.essentialLabel : e.title
  }

  // New sequence from now, in the original order of the day (late prep meals keep their place).
  const seq = [...chosen, ...mealsLate].sort((a, b) => (startMin(a) ?? 0) - (startMin(b) ?? 0))
  const ops: ScheduleOp[] = []
  const lines: ReplanLine[] = []
  let cursor = now
  for (const e of seq) {
    const time = clampHM(cursor)
    ops.push({ op: 'override', date, ref: e.ref, patch: { time, endTime: undefined, anytime: undefined, cancelled: undefined, reason: 'acordei agora' }, by })
    lines.push({ time, title: e.kind === 'routineItem' ? label(e) : e.title, emoji: e.emoji, ref: e.ref })
    cursor += dur(e)
  }
  for (const e of mealsKept) lines.push({ time: e.start!, title: e.title, emoji: e.emoji, ref: e.ref, kept: true })
  for (const e of drops) ops.push({ op: 'override', date, ref: e.ref, patch: { cancelled: true, reason: 'manhã curta' }, by })
  if (anchor) lines.push({ time: anchor.start!, title: anchor.title, emoji: anchor.emoji, ref: anchor.ref, kept: true })
  lines.sort((a, b) => a.time.localeCompare(b.time))

  const anchorText = anchor
    ? anchor.kind === 'workout'
      ? `Seu treino continua às ${anchor.start}. `
      : anchor.kind === 'work'
        ? `O trabalho começa às ${anchor.start}. `
        : `${anchor.title} continua às ${anchor.start}. `
    : ''
  const message = `São ${nowHM}. ${anchorText}${short ? 'Montei uma manhã curta pra você:' : 'Reorganizei o resto da manhã:'}`
  const summary = lines.map((l) => `${l.time} ${l.title}`).join(' · ')
  return { ...proposal(ops, `Dia reorganizado a partir das ${nowHM}`, by, 'changed'), summary, message, lines, drops: drops.map((e) => ({ title: label(e), ref: e.ref })), anchor }
}

/** Every override written on a date (for "restaurar o dia"). */
export function overridesOn(db: DB, date: DateKey): ScheduleOverride[] {
  return (db.scheduleOverrides ?? []).filter((o) => o.date === date)
}
