/**
 * LIFE TIMELINE — one day, one time-ordered list: rotina + treino + comida + agenda + trabalho + tarefas.
 *
 * `dayTimeline(db, date)` is a pure function of the DB (derived, never stored). Sources:
 * - routines/routineItems → times from `time` / `timeMode` / durations (steps get derived times too),
 * - workouts (real records, or the week template's fixed lines when the day has none — fuel.ts),
 * - the day's nutrition plan meals (fuel.ts `dayPlanFor`) + meals she logged,
 * - calendar events (selectors `eventsFor`, so recurrence/exdates/sources are honoured),
 * - BASE work hours (+ commute on presencial days, planning.ts `workBlocks`),
 * - dated tasks with a time and Luna's tasks due that day.
 * Per-day `ScheduleOverride`s (time / cancelled / anytime) are applied on top; the recurring default
 * never changes. Nothing here knows names of places, people or projects — only data.
 *
 * Routine time model (per day):
 * - the routine's FIRST item starts the chain (its override, its fixed time, or routine.startTime);
 * - 'sequence' items start when the previous chained item ends (durationMin / step durations);
 * - 'fixed' items sit at their time and restart the chain from their end;
 * - an item with a per-day override is placed at that time and taken out of the chain (so dragging
 *   "Leitura" after the treino doesn't drag the rest of the morning with it);
 * - chained items never overlap hard anchors (exact-time workouts/events) nor items placed by hand:
 *   they slide to right after them ("o resto vem depois do treino");
 * - 'window' items show their window; 'anytime' (explicit) items go to the "ao longo do dia" group.
 */
import type {
  DateKey,
  DB,
  FuelPhase,
  Meal,
  MealSlot,
  Routine,
  RoutineItem,
  ScheduleOverride,
  ScheduleRefType,
  TimeHM,
  TimelineEntry,
  TimelineKind,
  TimelineTimeSource,
  TimeWindow,
  Workout,
} from './types'
import { checkinFor, eventsFor, isTaskDoneOn, modalityOf, petTasksDue, routineItemsFor, tasksForDay } from './selectors'
import { contextWorkouts, dayPlanFor } from './fuel'
import { PERIOD_LABEL, PERIOD_RANGES, workBlocks } from './planning'
import { hmToMinutes, startOfWeek, toTimeHM } from '@/lib/date'
import { prepChecklistFor } from './mealprep'
import { occurrenceFor } from '@/lib/recurrence'

/** Minutes assumed for a routine item without durationMin / stepDurations. */
export const DEFAULT_ITEM_MIN = 10
const DEFAULT_WORKOUT_MIN = 60
const DEFAULT_MEAL_MIN = 15
const DEFAULT_TASK_MIN = 30
const DEFAULT_EVENT_MIN = 60
const DAY_END = 24 * 60 - 1

export type ScheduleRef = TimelineEntry['ref']

// ─── Refs & overrides ───────────────────────────────────────────────────────

export const refKey = (ref: ScheduleRef) => `${ref.type}:${ref.id}`
export const stepRefId = (itemId: string, index: number) => `${itemId}#${index}`
export const planMealRefId = (planId: string, index: number) => `${planId}#${index}`

export function overrideFor(db: DB, date: DateKey, type: ScheduleRefType, id: string): ScheduleOverride | undefined {
  // At most one per (date, refType, refId); if an import ever produced two, the latest write wins.
  let found: ScheduleOverride | undefined
  for (const o of db.scheduleOverrides ?? []) {
    if (o.date === date && o.refType === type && o.refId === id && (!found || o.updatedAt >= found.updatedAt)) found = o
  }
  return found
}

const hm = (min: number): TimeHM => {
  const m = Math.max(0, Math.min(DAY_END, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const isoToHM = (iso?: string): TimeHM | undefined => {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : toTimeHM(d)
}

// ─── Routine schedule ───────────────────────────────────────────────────────

export function itemDuration(item: RoutineItem): number {
  if (item.durationMin) return item.durationMin
  if (item.stepDurations?.length) return item.stepDurations.reduce((s, n) => s + (n || 0), 0) || DEFAULT_ITEM_MIN
  if (item.time && item.endTime) {
    const d = hmToMinutes(item.endTime) - hmToMinutes(item.time)
    if (d > 0) return d
  }
  return DEFAULT_ITEM_MIN
}

export function itemTimeMode(item: RoutineItem): NonNullable<RoutineItem['timeMode']> {
  return item.timeMode ?? (item.time ? 'fixed' : 'sequence')
}

interface Interval {
  start: number
  end: number
}

export interface RoutineSlot {
  item: RoutineItem
  start?: number
  end?: number
  source: TimelineTimeSource
  window?: TimeWindow
  cancelled: boolean
  /** In the "ao longo do dia" group. */
  anytime: boolean
}

const overlapsAny = (s: number, e: number, list: Interval[]) => list.find((r) => s < r.end && r.start < e)

/**
 * Times of a routine's items on a day (see the model in the header). `anchors` = hard commitments
 * (exact-time workouts/events) the chain slides around; `firstWorkoutEnd` serves dependsOn 'workout'.
 */
export function scheduleRoutine(
  db: DB,
  date: DateKey,
  routine: Routine,
  items: RoutineItem[],
  anchors: Interval[] = [],
  firstWorkoutEnd?: number,
): RoutineSlot[] {
  const ov = (it: RoutineItem) => overrideFor(db, date, 'routineItem', it.id)
  // Items placed by hand (override) or fixed by default: the chain never runs over them.
  const pinned: Interval[] = []
  let firstChained: RoutineItem | undefined
  for (const it of items) {
    const o = ov(it)
    if (o?.cancelled || o?.anytime || (!o?.time && itemTimeMode(it) === 'anytime')) continue
    firstChained ??= it
    const dur = itemDuration(it)
    if (o?.time) pinned.push({ start: hmToMinutes(o.time), end: o.endTime ? hmToMinutes(o.endTime) : hmToMinutes(o.time) + dur })
    else if (itemTimeMode(it) === 'fixed' && it.time) pinned.push({ start: hmToMinutes(it.time), end: hmToMinutes(it.time) + dur })
  }
  const obstacles = [...anchors, ...pinned]
  const ends = new Map<string, number>()
  let cursor: number | undefined
  const out: RoutineSlot[] = []

  for (const it of items) {
    const o = ov(it)
    const mode = itemTimeMode(it)
    const dur = itemDuration(it)
    const base = { item: it, cancelled: !!o?.cancelled, anytime: false }

    if (o?.anytime || (!o?.time && mode === 'anytime')) {
      out.push({ ...base, source: 'anytime', anytime: true })
      continue
    }
    if (o?.time) {
      const s = hmToMinutes(o.time)
      const e = o.endTime ? hmToMinutes(o.endTime) : s + dur
      out.push({ ...base, start: s, end: e, source: 'override' })
      if (o.cancelled) continue
      ends.set(it.id, e)
      // The first item anchors the chain ("amanhã quero acordar 5h30" slides the whole morning).
      if (it === firstChained) cursor = e
      continue
    }
    if (mode === 'fixed' && it.time) {
      const s = hmToMinutes(it.time)
      const e = s + dur
      out.push({ ...base, start: s, end: e, source: 'fixed' })
      if (o?.cancelled) continue
      ends.set(it.id, e)
      cursor = e
      continue
    }
    if (mode === 'window' && it.window) {
      const s = hmToMinutes(it.window.start)
      out.push({ ...base, start: s, end: hmToMinutes(it.window.end), source: 'window', window: it.window })
      if (o?.cancelled) continue
      ends.set(it.id, s + dur)
      if (cursor === undefined) cursor = s + dur
      continue
    }
    // sequence
    let start = cursor ?? (routine.startTime ? hmToMinutes(routine.startTime) : undefined)
    if (start === undefined) {
      // Nothing to chain from: keep it visible in "ao longo do dia" rather than inventing a time.
      out.push({ ...base, source: 'anytime', anytime: true })
      continue
    }
    for (const dep of it.dependsOn ?? []) {
      const after = dep === 'workout' ? firstWorkoutEnd : ends.get(dep)
      if (after !== undefined) start = Math.max(start, after)
    }
    for (let hit = overlapsAny(start, start + dur, obstacles); hit; hit = overlapsAny(start, start + dur, obstacles)) start = hit.end
    out.push({ ...base, start, end: start + dur, source: 'derived' })
    if (o?.cancelled) continue
    ends.set(it.id, start + dur)
    cursor = start + dur
  }
  return out
}

/** Items of a routine shown that day (Essential mode keeps only essential items). */
export function routineItemsInMode(db: DB, routine: Routine, date: DateKey): { items: RoutineItem[]; essential: boolean } {
  const all = routineItemsFor(db, routine.id, date)
  const essential = !!routine.hasEssential && checkinFor(db, date)?.routineModes?.[routine.id] === 'essential'
  return { items: essential ? all.filter((i) => i.essential) : all, essential }
}

function stepChildren(db: DB, date: DateKey, item: RoutineItem, start: number | undefined, done: Set<number>, itemDone: boolean): TimelineEntry[] {
  const steps = item.steps ?? []
  const even = item.durationMin && !item.stepDurations?.length ? Math.floor(item.durationMin / steps.length) : undefined
  let cursor = start
  return steps.map((title, i) => {
    const ref = { type: 'routineStep' as const, id: stepRefId(item.id, i) }
    const o = overrideFor(db, date, 'routineStep', ref.id)
    const dur = item.stepDurations?.[i] ?? even
    let s: number | undefined = cursor
    let source: TimelineTimeSource = 'derived'
    if (o?.time) {
      s = hmToMinutes(o.time)
      source = 'override'
    }
    cursor = s !== undefined && dur !== undefined ? s + dur : undefined
    return {
      key: refKey(ref),
      kind: 'routineItem' as const,
      ref,
      date,
      start: s !== undefined ? hm(s) : undefined,
      end: s !== undefined && dur !== undefined ? hm(s + dur) : undefined,
      timeSource: s === undefined ? 'anytime' : source,
      title,
      status: o?.cancelled ? 'cancelled' : itemDone || done.has(i) ? 'done' : 'pending',
      editable: { time: true, reorder: false, check: true },
    }
  })
}

// ─── Meals ──────────────────────────────────────────────────────────────────

/** Meal slot for a time of day (used to open the meal flow for a planned meal). */
export function slotForTime(t?: TimeHM, phase?: FuelPhase | 'refeicao'): MealSlot {
  if (phase && phase !== 'refeicao') return 'extra'
  const m = t ? hmToMinutes(t) : 12 * 60
  if (m < 10 * 60) return 'cafe'
  if (m < 11 * 60 + 30) return 'lanche_manha'
  if (m < 15 * 60) return 'almoco'
  if (m < 18 * 60 + 30) return 'lanche_tarde'
  return 'jantar'
}

const PHASE_EMOJI: Record<FuelPhase, string> = { ontem: '🌙', pre: '🍌', intra: '💧', pos: '🥣' }
const SLOT_EMOJI: Record<MealSlot, string> = { cafe: '☕', lanche_manha: '🍎', almoco: '🍽️', lanche_tarde: '🍎', jantar: '🍲', extra: '🍴' }

function mealEmoji(time?: TimeHM, phase?: FuelPhase | 'refeicao'): string {
  return phase && phase !== 'refeicao' ? PHASE_EMOJI[phase] : SLOT_EMOJI[slotForTime(time)]
}

function mealDoneAt(m: Meal): TimeHM | undefined {
  return isoToHM(m.consumedAt) ?? m.time
}

// ─── Day timeline ───────────────────────────────────────────────────────────

export interface DayTimelineOptions {
  /** Minute of day "now" (today only). Lets callers memoize on the minute; past items are never re-labelled. */
  nowMinutes?: number
  /** Include the "ao longo do dia" group at the end (default true). */
  includeAnytime?: boolean
}

const KIND_RANK: Record<TimelineKind, number> = { work: 0, event: 1, workout: 2, meal: 3, routine: 4, routineItem: 4, task: 5, petTask: 6, prep: 5 }

const WORKOUT_DONE = new Set<Workout['status']>(['feito', 'adaptado'])

function entry(e: Omit<TimelineEntry, 'start' | 'end'> & { startMin?: number; endMin?: number }): TimelineEntry {
  const { startMin, endMin, ...rest } = e
  return { ...rest, start: startMin !== undefined ? hm(startMin) : undefined, end: endMin !== undefined ? hm(endMin) : undefined }
}

export function dayTimeline(db: DB, date: DateKey, opts: DayTimelineOptions = {}): TimelineEntry[] {
  const out: TimelineEntry[] = []
  const anchors: Interval[] = []

  // 1. Workouts (real records, or the template's fixed lines standing in).
  let firstWorkoutEnd: number | undefined
  for (const w of contextWorkouts(db, date)) {
    const fromTemplate = w.id.startsWith('template:')
    const ref = fromTemplate ? { type: 'weekTemplate' as const, id: w.templateId! } : { type: 'workout' as const, id: w.id }
    const o = overrideFor(db, date, ref.type, ref.id)
    const m = modalityOf(db, w.modality)
    const dur = w.durationMin ?? w.plannedDurationMin ?? DEFAULT_WORKOUT_MIN
    const time = o?.time ?? w.time
    const durLabel = w.plannedDurationMin
      ? w.plannedDurationMaxMin && w.plannedDurationMaxMin > w.plannedDurationMin
        ? `${w.plannedDurationMin}–${w.plannedDurationMaxMin} min`
        : `${w.plannedDurationMin} min`
      : undefined
    const base = {
      kind: 'workout' as const,
      ref,
      key: refKey(ref),
      date,
      title: w.title || m.label,
      emoji: m.emoji,
      planType: w.planType,
      status: o?.cancelled ? ('cancelled' as const) : WORKOUT_DONE.has(w.status) ? ('done' as const) : ('pending' as const),
      editable: { time: true, reorder: false, check: false },
    }
    if (o?.anytime) {
      out.push(entry({ ...base, timeSource: 'anytime', subtitle: durLabel }))
    } else if (time) {
      const s = hmToMinutes(time)
      const e = o?.endTime ? hmToMinutes(o.endTime) : s + dur
      out.push(entry({ ...base, startMin: s, endMin: e, timeSource: o?.time ? 'override' : 'fixed', subtitle: [durLabel, w.goal].filter(Boolean).join(' · ') || undefined }))
      if (!o?.cancelled) {
        anchors.push({ start: s, end: e })
        firstWorkoutEnd ??= e
      }
    } else if (w.period) {
      const [a, b] = PERIOD_RANGES[w.period]
      out.push(entry({ ...base, startMin: hmToMinutes(a), endMin: hmToMinutes(b), timeSource: 'approx', window: { start: a, end: b }, subtitle: `${PERIOD_LABEL[w.period]} · horário a definir` }))
    } else {
      out.push(entry({ ...base, timeSource: 'anytime', subtitle: durLabel }))
    }
  }

  // 2. Calendar events.
  for (const e of eventsFor(db, date)) {
    const ref = { type: 'event' as const, id: e.id }
    const o = overrideFor(db, date, 'event', e.id)
    // "Fui / feito" on that day's occurrence of the event (recurring events too).
    const occ = occurrenceFor(db.occurrences, 'event', e.id, date)
    const done = occ?.status === 'done'
    const base = {
      kind: 'event' as const,
      ref,
      key: refKey(ref),
      date,
      title: e.title,
      emoji: e.kind === 'criatividade' ? '🏺' : e.kind === 'estudo' ? '📚' : e.kind === 'trabalho' ? '💼' : e.kind === 'saude' ? '🩺' : '📅',
      planType: e.planType,
      status: o?.cancelled ? ('cancelled' as const) : done ? ('done' as const) : ('pending' as const),
      doneAt: done ? isoToHM(occ?.completedAt) : undefined,
      editable: { time: !e.allDay, reorder: false, check: true },
    }
    const time = o?.time ?? e.startTime
    if (e.allDay || o?.anytime) {
      out.push(entry({ ...base, timeSource: 'anytime', subtitle: e.allDay ? 'dia todo' : e.location }))
    } else if (time) {
      const s = hmToMinutes(time)
      const origDur = e.startTime && e.endTime ? hmToMinutes(e.endTime) - hmToMinutes(e.startTime) : DEFAULT_EVENT_MIN
      const end = o?.endTime ? hmToMinutes(o.endTime) : o?.time ? s + Math.max(origDur, 15) : e.endTime ? hmToMinutes(e.endTime) : s + DEFAULT_EVENT_MIN
      out.push(entry({ ...base, startMin: s, endMin: Math.max(end, s), timeSource: o?.time ? 'override' : 'fixed', subtitle: e.location }))
      if (!o?.cancelled) anchors.push({ start: s, end: Math.max(end, s + 15) })
    } else if (e.period) {
      const [a, b] = PERIOD_RANGES[e.period]
      out.push(entry({ ...base, startMin: hmToMinutes(a), endMin: hmToMinutes(b), timeSource: 'approx', window: { start: a, end: b }, subtitle: `${PERIOD_LABEL[e.period]} · horário a definir` }))
    } else {
      out.push(entry({ ...base, timeSource: 'anytime' }))
    }
  }

  // 3. BASE work hours (+ commute on presencial days). Information, not editable here.
  for (const b of workBlocks(db, date)) {
    const ref = { type: 'event' as const, id: `work:${b.kind}:${b.start}` }
    out.push(
      entry({
        kind: 'work',
        ref,
        key: `work:${b.kind}:${b.start}`,
        date,
        startMin: hmToMinutes(b.start),
        endMin: hmToMinutes(b.end),
        timeSource: 'fixed',
        title: b.title,
        emoji: b.kind === 'commute' ? '🚗' : b.mode === 'presencial' ? '📍' : '💻',
        subtitle: b.kind === 'work' ? `até ${b.end} · base` : `até ${b.end}`,
        planType: 'base',
        status: 'pending',
        editable: { time: false, reorder: false, check: false },
      }),
    )
  }

  // 4. Routines.
  const routines = db.routines.filter((r) => r.active).sort((a, b) => a.order - b.order)
  for (const routine of routines) {
    const { items, essential } = routineItemsInMode(db, routine, date)
    for (const slot of scheduleRoutine(db, date, routine, items, anchors, firstWorkoutEnd)) {
      const it = slot.item
      const ref = { type: 'routineItem' as const, id: it.id }
      const occ = occurrenceFor(db.occurrences, 'routineItem', it.id, date)
      const done = occ?.status === 'done'
      const stepsDone = new Set(occ?.stepsDone ?? [])
      const showSteps = !essential && !!it.steps?.length
      out.push(
        entry({
          kind: 'routineItem',
          ref,
          key: refKey(ref),
          date,
          startMin: slot.start,
          endMin: slot.end,
          timeSource: slot.source,
          window: slot.window,
          title: essential && it.essentialLabel ? it.essentialLabel : it.title,
          subtitle: it.optional ? (it.hint ?? 'opcional') : undefined,
          emoji: it.emoji,
          planType: routine.planType,
          status: slot.cancelled ? 'cancelled' : done ? 'done' : 'pending',
          doneAt: done ? isoToHM(occ?.completedAt) : undefined,
          children: showSteps ? stepChildren(db, date, it, slot.anytime ? undefined : slot.start, stepsDone, done) : undefined,
          editable: { time: true, reorder: true, check: true },
        }),
      )
    }
  }

  // 5. Food: the day's prescribed plan + meals she logged.
  const plan = dayPlanFor(db, date)
  const dayMeals = db.meals.filter((m) => m.date === date)
  const linked = new Set<string>()
  plan?.meals.forEach((pm, i) => {
    const refId = planMealRefId(plan.id, i)
    const ref = { type: 'planMeal' as const, id: refId }
    const o = overrideFor(db, date, 'planMeal', refId)
    const eaten = dayMeals.find((m) => m.planMealRef === refId)
    if (eaten) linked.add(eaten.id)
    const adj = db.mealAdjustments?.find((a) => a.date === date && a.planMealRef === refId && a.status === 'applied')
    const time = o?.time ?? pm.time
    const foods = eaten?.foods?.length ? eaten.foods.map((f) => f.name) : (adj?.items ?? pm.items).map((f) => f.food)
    const badge = eaten?.contentSource && eaten.contentSource !== 'nutri' ? eaten.contentSource : adj ? (adj.items.some((x) => x.badge === 'lumos') ? 'lumos' : 'troca') : undefined
    const status = o?.cancelled ? 'cancelled' : eaten?.done ? 'done' : adj?.kind === 'pular' ? 'skipped' : 'pending'
    const base = {
      kind: 'meal' as const,
      ref,
      key: refKey(ref),
      date,
      title: pm.name,
      subtitle: foods.slice(0, 2).join(' · ') || undefined,
      emoji: mealEmoji(time, pm.phase),
      phase: pm.phase,
      badge,
      status: status as TimelineEntry['status'],
      doneAt: eaten?.done ? mealDoneAt(eaten) : undefined,
      editable: { time: true, reorder: true, check: false },
    }
    if (time && !o?.anytime) {
      const s = hmToMinutes(time)
      out.push(entry({ ...base, startMin: s, endMin: o?.endTime ? hmToMinutes(o.endTime) : s + DEFAULT_MEAL_MIN, timeSource: o?.time ? 'override' : 'fixed' }))
    } else out.push(entry({ ...base, timeSource: 'anytime' }))
  })
  for (const m of dayMeals) {
    if (linked.has(m.id) || (m.planMealRef && plan && m.planMealRef.startsWith(`${plan.id}#`))) continue
    const time = m.time ?? isoToHM(m.consumedAt) ?? m.plannedTime
    if (!time) continue
    const ref = { type: 'planMeal' as const, id: `meal:${m.id}` }
    const s = hmToMinutes(time)
    out.push(
      entry({
        kind: 'meal',
        ref,
        key: `meal:${m.id}`,
        date,
        startMin: s,
        endMin: s + DEFAULT_MEAL_MIN,
        timeSource: 'fixed',
        title: m.description || 'Refeição',
        emoji: mealEmoji(time),
        badge: m.contentSource && m.contentSource !== 'nutri' ? m.contentSource : undefined,
        status: m.done ? 'done' : 'pending',
        doneAt: m.done ? mealDoneAt(m) : undefined,
        editable: { time: false, reorder: false, check: false },
      }),
    )
  }

  // 6. Tasks with a time that day (or placed by an override).
  for (const t of tasksForDay(db, date)) {
    if (t.status === 'waiting' || t.status === 'archived') continue
    const ref = { type: 'task' as const, id: t.id }
    const o = overrideFor(db, date, 'task', t.id)
    const time = o?.time ?? t.time
    if (!time && !o?.anytime) continue
    const done = isTaskDoneOn(db, t, date)
    const occ = t.recurrence ? occurrenceFor(db.occurrences, 'task', t.id, date) : undefined
    const base = {
      kind: 'task' as const,
      ref,
      key: refKey(ref),
      date,
      title: t.title,
      emoji: t.context === 'trabalho' ? '💻' : undefined,
      planType: t.planType,
      status: o?.cancelled ? ('cancelled' as const) : done ? ('done' as const) : ('pending' as const),
      doneAt: done ? isoToHM(occ?.completedAt ?? t.completedAt) : undefined,
      editable: { time: true, reorder: true, check: true },
    }
    if (time && !o?.anytime) {
      const s = hmToMinutes(time)
      out.push(entry({ ...base, startMin: s, endMin: s + (t.durationMin ?? DEFAULT_TASK_MIN), timeSource: o?.time ? 'override' : 'fixed' }))
    } else out.push(entry({ ...base, timeSource: 'anytime' }))
  }

  // 7. Luna (pet tasks due). They have no default time: "ao longo do dia" until she gives one.
  for (const p of petTasksDue(db, date)) {
    const ref = { type: 'petTask' as const, id: p.id }
    const o = overrideFor(db, date, 'petTask', p.id)
    const occ = occurrenceFor(db.occurrences, 'petTask', p.id, date)
    const done = occ?.status === 'done'
    const base = {
      kind: 'petTask' as const,
      ref,
      key: refKey(ref),
      date,
      title: p.title,
      emoji: '🐾',
      status: o?.cancelled ? ('cancelled' as const) : done ? ('done' as const) : ('pending' as const),
      doneAt: done ? isoToHM(occ?.completedAt) : undefined,
      editable: { time: true, reorder: true, check: true },
    }
    if (o?.time && !o.anytime) {
      const s = hmToMinutes(o.time)
      out.push(entry({ ...base, startMin: s, endMin: s + DEFAULT_MEAL_MIN, timeSource: 'override' }))
    } else out.push(entry({ ...base, timeSource: 'anytime' }))
  }

  // 8. Meal prep checklist (kit dos dias presenciais, freezer → geladeira). Done-state lives in that week's MealPrepPlan.
  for (const p of prepChecklistFor(db, date)) {
    const ref = { type: 'mealPrep' as const, id: p.key }
    const o = overrideFor(db, date, 'mealPrep', p.key)
    if (o?.cancelled) continue
    const done = !!db.mealPrepPlans.find((x) => x.weekStart === startOfWeek(p.date))?.checked.includes(p.key)
    const s = hmToMinutes(o?.time ?? p.time)
    out.push(
      entry({
        kind: 'prep' as const,
        ref,
        key: refKey(ref),
        date,
        title: p.title,
        subtitle: p.detail,
        emoji: '🎒',
        status: done ? ('done' as const) : ('pending' as const),
        editable: { time: true, reorder: false, check: true },
        startMin: s,
        endMin: s + 5,
        timeSource: o?.time ? 'override' : 'fixed',
      }),
    )
  }

  const timed = out.filter((e) => e.timeSource !== 'anytime' && e.start)
  const anytime = out.filter((e) => !(e.timeSource !== 'anytime' && e.start))
  timed.sort((a, b) => a.start!.localeCompare(b.start!) || KIND_RANK[a.kind] - KIND_RANK[b.kind])
  return opts.includeAnytime === false ? timed : [...timed, ...anytime]
}

// ─── Small helpers for callers ──────────────────────────────────────────────

export const isAnytime = (e: TimelineEntry) => e.timeSource === 'anytime' || !e.start

export function startMin(e: TimelineEntry): number | undefined {
  return e.start ? hmToMinutes(e.start) : undefined
}

/** End in minutes (derived from start + a small default when the entry has no end). */
export function endMin(e: TimelineEntry): number | undefined {
  if (!e.start) return undefined
  const s = hmToMinutes(e.start)
  return e.end ? Math.max(hmToMinutes(e.end), s) : s + (e.kind === 'routineItem' ? DEFAULT_ITEM_MIN : 30)
}

/** Every entry including step children, flattened. */
export function flatten(entries: TimelineEntry[]): TimelineEntry[] {
  return entries.flatMap((e) => [e, ...(e.children ?? [])])
}

export function findEntry(entries: TimelineEntry[], ref: ScheduleRef): TimelineEntry | undefined {
  const k = refKey(ref)
  return flatten(entries).find((e) => e.key === k || refKey(e.ref) === k)
}

/** Index of the first timed entry that hasn't started yet ("agora" marker goes right before it). */
export function nowIndex(entries: TimelineEntry[], nowMinutes: number): number {
  const i = entries.findIndex((e) => isAnytime(e) || (startMin(e) ?? 0) > nowMinutes)
  return i === -1 ? entries.length : i
}

export interface RoutineBlock {
  routine: Routine
  start: TimeHM
  end: TimeHM
  done: number
  total: number
  entries: TimelineEntry[]
}

/** Routine items grouped back into one block per routine (Agenda grid: "☀️ Milagre da Manhã 04:40–06:45"). */
export function routineBlocks(db: DB, entries: TimelineEntry[]): RoutineBlock[] {
  const byId = new Map(db.routineItems.map((i) => [i.id, i]))
  const groups = new Map<string, TimelineEntry[]>()
  for (const e of entries) {
    if (e.kind !== 'routineItem' || e.ref.type !== 'routineItem' || isAnytime(e) || e.status === 'cancelled') continue
    const rid = byId.get(e.ref.id)?.routineId
    if (!rid) continue
    groups.set(rid, [...(groups.get(rid) ?? []), e])
  }
  const out: RoutineBlock[] = []
  for (const [rid, list] of groups) {
    const routine = db.routines.find((r) => r.id === rid)
    if (!routine) continue
    const starts = list.map((e) => startMin(e)!)
    const ends = list.map((e) => endMin(e)!)
    const counted = list.filter((e) => !(byId.get(e.ref.id)?.optional && e.status !== 'done'))
    out.push({
      routine,
      start: hm(Math.min(...starts)),
      end: hm(Math.max(...ends)),
      done: counted.filter((e) => e.status === 'done').length,
      total: counted.length,
      entries: list,
    })
  }
  return out
}
