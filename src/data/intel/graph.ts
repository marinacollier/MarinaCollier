/**
 * ActionGraph — one change drags its dependencies along, previewable and undone as ONE unit.
 *
 * - moveWorkout: the training moves (Workout.time/date, or a per-day override for template lines);
 *   the fuel meals (pré / intra / pós) follow it with planMeal overrides; prep items are derived from
 *   the new time (and the new prep day when it changes day). Day types / plans re-derive by themselves.
 * - setDuration: Workout.plannedDurationMin (or ScheduleOverride.durationMin for template lines); the pós
 *   meal follows the new end, meals that would fall inside the training slide after it, and the fuel
 *   strategy is re-read (never new quantities — that's the nutritionist's).
 * - cancel: schedule.cancelOn (occurrence + dependent checklist + freed slot) + dependent tasks.
 * - workMode: per-day 'work' override → commute, presencial kit and its prep checklist appear/disappear.
 * - activityDone: the planned workout becomes 'feito' with real duration/distance (integration-shaped).
 * Every apply logs LifeEvents (root + `causedBy` dependencies) and returns ONE undo.
 */
import type { DateKey, DB, ID, PlannedMeal, Provenance, ScheduleRefType, TimeHM, Workout, WorkDayMode } from '../types'
import { DAY_TYPE_LABEL, contextWorkouts, dayPlanFor, dayTrainingContext, strategyFor } from '../fuel'
import { conflictsOn, workBlocks, workMode } from '../planning'
import { cancelOn } from '../schedule'
import { dayTimeline, findEntry, overrideFor, planMealRefId } from '../timeline'
import { prepChecklistFor, presencialKit } from '../mealprep'
import { addDays, hmToMinutes, minutesToHM, startOfWeek as weekOf, WEEKDAY_LONG, weekday } from '@/lib/date'
import { nowISO, uid } from '@/lib/id'
import { capitalize, dayLabel, fmtDuration } from './context'
import { eventOp, type EventInput } from './log'
import { commitOps, createOp, fromScheduleOps, previewOps, type IntelOp } from './ops'
import type { GraphChange, GraphPlan, Now } from './types'

type Line = GraphPlan['lines'][number]
type Ref = { type: ScheduleRefType; id: string }

const clampHM = (min: number): TimeHM => minutesToHM(Math.max(0, Math.min(23 * 60 + 59, Math.round(min))))
const round5 = (min: number) => Math.round(min / 5) * 5

const MODE_LABEL: Record<WorkDayMode, string> = { presencial: 'presencial', remoto: 'remoto', flexivel: 'flexível', off: 'sem trabalho' }

// ─── Resolving a training ───────────────────────────────────────────────────

interface Resolved {
  workout: Workout
  /** A template line standing in for the day (no record yet). */
  virtual: boolean
  ref: Ref
}

/** The training behind a ref on a date: a Workout record, or the week template's line for that day. */
export function resolveWorkout(db: DB, date: DateKey, ref: Ref | { type: string; id: string }): Resolved | undefined {
  if (ref.type === 'workout' && !ref.id.startsWith('template:')) {
    const w = db.workouts.find((x) => x.id === ref.id)
    return w ? { workout: w, virtual: false, ref: { type: 'workout', id: w.id } } : undefined
  }
  // Virtual ids look like 'template:<templateId>:<date>' (fuel.contextWorkouts).
  const templateId = ref.id.startsWith('template:') ? ref.id.slice('template:'.length, ref.id.lastIndexOf(':')) : ref.id
  const real = db.workouts.find((w) => w.templateId === templateId && w.date === date)
  if (real) return { workout: real, virtual: false, ref: { type: 'workout', id: real.id } }
  const v = contextWorkouts(db, date).find((w) => w.templateId === templateId && w.id.startsWith('template:'))
  return v ? { workout: v, virtual: true, ref: { type: 'weekTemplate', id: templateId } } : undefined
}

/** A template line materialized as a Workout record (same fields, a real id). */
function materialize(w: Workout, patch: Partial<Workout> = {}): IntelOp & { op: 'create' } {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = w
  return createOp('workouts', { ...rest, ...patch } as unknown as Record<string, unknown>)
}

/** When a date gets its first Workout record, its other template lines must become records too (or they'd vanish). */
function materializeDay(db: DB, date: DateKey, exceptTemplate?: ID): IntelOp[] {
  if (db.workouts.some((w) => w.date === date)) return []
  return contextWorkouts(db, date)
    .filter((w) => w.id.startsWith('template:') && w.templateId !== exceptTemplate)
    .map((w) => materialize(w))
}

const titleOf = (w: Workout) => w.title || w.modality

// ─── Dependency lines (computed on before/after previews) ───────────────────

function effectiveStart(db: DB, date: DateKey, ref: Ref): TimeHM | undefined {
  const e = findEntry(dayTimeline(db, date, { includeAnytime: false }), ref)
  return e && e.timeSource !== 'approx' ? e.start : undefined
}

function prepDiff(before: DB, after: DB, dates: DateKey[], today: DateKey): Line[] {
  const lines: Line[] = []
  for (const d of [...new Set(dates)].sort()) {
    const a = new Map(prepChecklistFor(before, d).map((p) => [p.key, p]))
    const b = new Map(prepChecklistFor(after, d).map((p) => [p.key, p]))
    for (const [k, p] of b) {
      const old = a.get(k)
      if (!old) lines.push({ text: `Preparo ${dayLabel(d, today)} ${p.time}: ${p.title}`, provenance: 'inference' })
      else if (old.time !== p.time) lines.push({ text: `${p.title}: ${old.time} → ${p.time}`, provenance: 'inference' })
    }
    for (const [k, p] of a) if (!b.has(k)) lines.push({ text: `Sai do preparo ${dayLabel(d, today)}: ${p.title}`, provenance: 'inference' })
  }
  return lines.slice(0, 4)
}

function dayTypeDiff(before: DB, after: DB, dates: DateKey[], today: DateKey): Line[] {
  const lines: Line[] = []
  for (const d of [...new Set(dates)].sort()) {
    const a = dayTrainingContext(before, d).dayType
    const b = dayTrainingContext(after, d).dayType
    if (a === b) continue
    const plan = dayPlanFor(after, d)
    lines.push({ text: `${capitalize(dayLabel(d, today))} vira ${DAY_TYPE_LABEL[b].toLowerCase()}${plan ? ` (plano da nutri: ${plan.name})` : ''}`, provenance: 'inference' })
  }
  return lines
}

function conflictDiff(before: DB, after: DB, dates: DateKey[]): Line[] {
  const lines: Line[] = []
  for (const d of [...new Set(dates)]) {
    const old = new Set(conflictsOn(before, d, { includeAcknowledged: true }).map((c) => c.key))
    for (const c of conflictsOn(after, d)) if (!old.has(c.key) && c.severity === 'warn') lines.push({ text: `⚠️ ${c.message}`, provenance: 'inference' })
  }
  return lines
}

/** Plan meals of a day (with their effective time after overrides). */
function planMeals(db: DB, date: DateKey): { ref: string; meal: PlannedMeal; time?: TimeHM }[] {
  const plan = dayPlanFor(db, date)
  if (!plan) return []
  return plan.meals.map((meal, i) => {
    const ref = planMealRefId(plan.id, i)
    return { ref, meal, time: overrideFor(db, date, 'planMeal', ref)?.time ?? meal.time }
  })
}

/** Does a fuel meal at `t` belong to a training starting at `start` lasting `dur` (minutes)? */
function fuelBelongs(phase: 'pre' | 'intra' | 'pos', t: number, start: number, dur: number): boolean {
  const end = start + dur
  if (phase === 'pre') return t <= start && t >= start - 180
  if (phase === 'intra') return t >= start - 15 && t <= end + 15
  return t >= end - 30 && t <= end + 180
}

// ─── Plan builder ───────────────────────────────────────────────────────────

class Unit {
  ops: IntelOp[] = []
  lines: Line[] = []
  rootId = uid()
  constructor(
    private at: string,
    private date: DateKey,
  ) {}
  line(text: string, provenance: Provenance) {
    this.lines.push({ text, provenance })
  }
  root(e: Omit<EventInput, 'id' | 'at' | 'by'> & { by?: EventInput['by'] }) {
    this.ops.push(eventOp({ by: 'lumos', ...e, id: this.rootId, at: this.at, date: e.date ?? this.date }))
  }
  dep(e: Omit<EventInput, 'at' | 'by' | 'causedBy' | 'provenance'> & { provenance?: Provenance }) {
    this.ops.push(eventOp({ by: 'lumos', provenance: 'inference', ...e, at: this.at, causedBy: this.rootId, date: e.date ?? this.date }))
  }
  plan(sensitive = false): GraphPlan {
    const ops = this.ops
    return { lines: this.lines, sensitive, apply: () => commitOps(ops) }
  }
}

const noop = (text: string): GraphPlan => ({ lines: [{ text, provenance: 'inference' }], sensitive: false, apply: () => () => {} })

export function planChange(db: DB, change: GraphChange, now: Now): GraphPlan {
  const at = now.iso ?? nowISO()
  switch (change.kind) {
    case 'moveWorkout':
      return moveWorkout(db, change, now, at)
    case 'setDuration':
      return setDuration(db, change, now, at)
    case 'cancel':
      return cancel(db, change, now, at)
    case 'workMode':
      return changeWorkMode(db, change, now, at)
    case 'activityDone':
      return activityDone(db, change, at)
  }
}

// ─── moveWorkout ────────────────────────────────────────────────────────────

function moveWorkout(db: DB, c: Extract<GraphChange, { kind: 'moveWorkout' }>, now: Now, at: string): GraphPlan {
  const r = resolveWorkout(db, c.date, c.ref)
  if (!r) return noop('Não achei esse treino nesse dia.')
  const toDate = c.toDate ?? c.date
  const oldTime = effectiveStart(db, c.date, r.ref) ?? r.workout.time
  const toTime = c.toTime ?? oldTime
  if (toDate === c.date && toTime === oldTime) return noop(`${titleOf(r.workout)} já está ${oldTime ? `às ${oldTime}` : 'nesse dia'}.`)

  const u = new Unit(at, toDate)
  let targetId: ID | undefined = r.virtual ? undefined : r.workout.id
  if (toDate === c.date) {
    if (r.virtual) u.ops.push({ op: 'override', date: c.date, ref: r.ref, patch: { time: toTime, anytime: undefined }, by: 'lumos' })
    else u.ops.push({ op: 'patch', collection: 'workouts', id: r.workout.id, patch: { time: toTime, period: undefined } })
  } else {
    u.ops.push(...materializeDay(db, toDate))
    if (r.virtual) {
      const created = materialize(r.workout, { date: toDate, time: toTime, period: toTime ? undefined : r.workout.period })
      targetId = created.item.id
      u.ops.push(created)
    } else {
      u.ops.push({ op: 'patch', collection: 'workouts', id: r.workout.id, patch: { date: toDate, time: toTime, ...(toTime ? { period: undefined } : {}) } })
    }
    // Template line moved to another week: it must not come back on its original day.
    const tid = r.workout.templateId
    if (tid && weekOf(c.date) !== weekOf(toDate)) u.ops.push({ op: 'override', date: c.date, ref: { type: 'weekTemplate', id: tid }, patch: { cancelled: true, reason: 'treino mudou de dia' }, by: 'lumos' })
  }

  const t = titleOf(r.workout)
  const from = `${dayLabel(c.date, now.date)}${oldTime ? ` ${oldTime}` : ''}`
  const to = `${dayLabel(toDate, now.date)}${toTime ? ` ${toTime}` : ''}`
  u.line(`${t}: ${from} → ${to}`, 'user')
  u.root({ kind: 'moved', title: `${t} foi pra ${to}`, area: 'esportes', ref: targetId ? { type: 'workout', id: targetId } : r.ref, provenance: 'user', date: toDate })

  // Fuel meals follow the training (same offset) on the day it happens.
  let after = previewOps(db, u.ops)
  const delta = oldTime && toTime ? hmToMinutes(toTime) - hmToMinutes(oldTime) : 0
  if (delta && oldTime) {
    const moved: string[] = []
    const dur = r.workout.durationMin ?? r.workout.plannedDurationMin ?? 60
    for (const m of planMeals(after, toDate)) {
      const phase = m.meal.phase
      if (!m.time || !phase || phase === 'refeicao' || phase === 'ontem') continue
      // Only the fuel of THIS training (pré up to 3h before, intra during, pós up to 3h after) follows it.
      if (!fuelBelongs(phase, hmToMinutes(m.time), hmToMinutes(oldTime), dur)) continue
      const nt = clampHM(hmToMinutes(m.time) + delta)
      u.ops.push({ op: 'override', date: toDate, ref: { type: 'planMeal', id: m.ref }, patch: { time: nt, anytime: undefined, cancelled: undefined, reason: 'acompanha o treino' }, by: 'lumos' })
      moved.push(`${m.meal.name} ${m.time} → ${nt}`)
    }
    if (moved.length) {
      u.line(`Comida do treino acompanha: ${moved.join(' · ')}`, 'inference')
      u.dep({ kind: 'moved', title: `Refeições do treino acompanharam (${delta > 0 ? '+' : '−'}${fmtDuration(Math.abs(delta))})`, area: 'alimentacao', date: toDate })
    }
    after = previewOps(db, u.ops)
  }

  const affected = [c.date, toDate, addDays(c.date, -1), addDays(toDate, -1)]
  for (const l of [...dayTypeDiff(db, after, [c.date, toDate], now.date), ...prepDiff(db, after, affected, now.date)]) {
    u.lines.push(l)
  }
  if (u.lines.length > 2) u.dep({ kind: 'changed', title: `Preparo e plano do dia ajustados pro ${t}`, area: 'alimentacao', date: toDate })
  u.lines.push(...conflictDiff(db, after, [toDate]))
  return u.plan()
}


// ─── setDuration ────────────────────────────────────────────────────────────

function setDuration(db: DB, c: Extract<GraphChange, { kind: 'setDuration' }>, now: Now, at: string): GraphPlan {
  const r = resolveWorkout(db, c.date, c.ref)
  if (!r) return noop('Não achei esse treino nesse dia.')
  const oldDur = r.workout.plannedDurationMin ?? r.workout.durationMin ?? 60
  const newDur = Math.round(c.durationMin)
  if (newDur === oldDur) return noop(`${titleOf(r.workout)} já está com ${fmtDuration(newDur)}.`)
  const u = new Unit(at, c.date)
  if (r.virtual) u.ops.push({ op: 'override', date: c.date, ref: r.ref, patch: { durationMin: newDur }, by: 'lumos' })
  else u.ops.push({ op: 'patch', collection: 'workouts', id: r.workout.id, patch: { plannedDurationMin: newDur, plannedDurationMaxMin: undefined } })

  const t = titleOf(r.workout)
  const start = effectiveStart(db, c.date, r.ref) ?? r.workout.time
  const span = start ? ` (${start}–${clampHM(hmToMinutes(start) + newDur)})` : ''
  u.line(`${t} de ${dayLabel(c.date, now.date)}: ${fmtDuration(oldDur)} → ${fmtDuration(newDur)}${span}`, 'user')
  u.root({ kind: 'changed', title: `${t} de ${WEEKDAY_LONG[weekday(c.date)]} passou pra ${fmtDuration(newDur)}`, area: 'esportes', ref: r.ref, provenance: 'user' })

  let after = previewOps(db, u.ops)
  if (start) {
    const s = hmToMinutes(start)
    const oldEnd = s + oldDur
    const newEnd = s + newDur
    const moved: string[] = []
    let cursor = round5(newEnd)
    for (const m of planMeals(after, c.date).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))) {
      if (!m.time) continue
      const mt = hmToMinutes(m.time)
      const phase = m.meal.phase ?? 'refeicao'
      let nt: number | undefined
      // The pós meal is anchored to the end of the training; other meals only move if the training now covers them.
      if (phase === 'pos' && fuelBelongs('pos', mt, s, oldDur)) nt = Math.max(round5(mt + (newEnd - oldEnd)), round5(newEnd))
      else if (phase === 'refeicao' && mt >= s && mt < newEnd) nt = cursor
      if (nt === undefined || nt === mt) continue
      cursor = Math.max(cursor, nt + 30)
      const hm = clampHM(nt)
      u.ops.push({ op: 'override', date: c.date, ref: { type: 'planMeal', id: m.ref }, patch: { time: hm, anytime: undefined, cancelled: undefined, reason: 'acompanha a duração do treino' }, by: 'lumos' })
      moved.push(`${m.meal.name} ${m.time} → ${hm}`)
    }
    if (moved.length) {
      u.line(`Comida acompanha o novo fim: ${moved.join(' · ')}`, 'inference')
      u.dep({ kind: 'moved', title: `Refeições acompanharam o ${t} de ${fmtDuration(newDur)}`, area: 'alimentacao' })
      after = previewOps(db, u.ops)
    }
  }

  // Fuel strategy re-read (never new quantities: those are the nutritionist's).
  const w = after.workouts.find((x) => x.id === r.workout.id) ?? { ...r.workout, plannedDurationMin: newDur }
  const strategy = strategyFor(after, w)
  const intra = planMeals(after, c.date).filter((m) => m.meal.phase === 'intra')
  const big = Math.abs(newDur - oldDur) >= 60 || Math.abs(newDur - oldDur) / Math.max(oldDur, 1) >= 0.5
  if (intra.length && newDur > oldDur) {
    u.line(`Intra: o plano tem ${intra.length === 1 ? '1 tomada' : `${intra.length} tomadas`} (${intra.map((m) => m.time).filter(Boolean).join(', ')}), pensado pra ~${fmtDuration(oldDur)}. Separei o de sempre — quantidade extra pra ${fmtDuration(newDur)} é com a nutri.`, 'fact')
  } else if (!intra.length && newDur >= 90 && strategy?.duringWorkoutInstructions) {
    u.line(`Com ${fmtDuration(newDur)}, a estratégia «${strategy.name}» tem intra: ${strategy.duringWorkoutInstructions.split('\n')[0]}`, 'fact')
  }
  if (big && strategy) u.line(`A duração mudou bastante — quer revisar a estratégia «${strategy.name}»?`, 'suggestion')
  u.lines.push(...prepDiff(db, after, [addDays(c.date, -1), c.date], now.date))
  u.lines.push(...conflictDiff(db, after, [c.date]))
  return u.plan()
}

// ─── cancel ─────────────────────────────────────────────────────────────────

function cancel(db: DB, c: Extract<GraphChange, { kind: 'cancel' }>, now: Now, at: string): GraphPlan {
  // Template trainings / records are resolved so "cancela o treino de amanhã" works on both.
  const isTraining = c.ref.type === 'workout' || c.ref.type === 'weekTemplate'
  const r = isTraining ? resolveWorkout(db, c.date, c.ref) : undefined
  const ref: Ref = r?.ref ?? c.ref
  const entry = findEntry(dayTimeline(db, c.date), ref)
  if (!entry && !r) return noop('Não achei isso nesse dia.')
  if (entry?.status === 'cancelled') return noop(`${entry.title} já está fora ${dayLabel(c.date, now.date)}.`)

  const proposal = cancelOn(db, c.date, ref, 'lumos', 'cancelado com a Lumos')
  const u = new Unit(at, c.date)
  u.ops.push(...fromScheduleOps(proposal.ops))
  const title = entry?.title ?? (r ? titleOf(r.workout) : 'Isso')

  // Tasks that exist only because of it (origin = that event/training, same day) go too.
  const deps = db.tasks.filter((t) => t.origin?.id === ref.id && (t.date ?? t.dueDate) === c.date && t.status !== 'done' && t.status !== 'archived')
  for (const t of deps) u.ops.push({ op: 'patch', collection: 'tasks', id: t.id, patch: { status: 'archived' } })

  const ev = ref.type === 'event' ? db.events.find((e) => e.id === ref.id) : undefined
  const source = ev ? db.calendarSources.find((s) => s.id === ev.sourceId) : undefined
  const sensitive = !!ev && (!!ev.external || (!!source && source.provider !== 'local'))

  u.line(`${title} ${dayLabel(c.date, now.date)} sai — só dessa vez`, 'user')
  u.root({ kind: 'cancelled', title: `${title} de ${WEEKDAY_LONG[weekday(c.date)]} cancelado`, area: r ? 'esportes' : ev?.kind === 'estudo' ? 'estudos' : ev?.kind === 'trabalho' ? 'trabalho' : 'rotina', ref, provenance: 'user' })

  const tl = dayTimeline(db, c.date)
  for (const dep of proposal.cancelled.slice(1)) {
    const e = findEntry(tl, dep)
    if (!e) continue
    u.line(`Sai junto: ${e.title}`, 'inference')
    u.dep({ kind: 'cancelled', title: `${e.title} saiu junto`, ref: dep })
  }
  for (const t of deps) {
    u.line(`Sai junto: ${t.title}`, 'inference')
    u.dep({ kind: 'cancelled', title: `${t.title} saiu junto`, ref: { type: 'task', id: t.id } })
  }
  if (proposal.freed) u.line(`Fica livre ${proposal.freed.start}–${proposal.freed.end}`, 'inference')

  if (r) {
    const after = previewOps(db, u.ops)
    u.lines.push(...dayTypeDiff(db, after, [c.date, addDays(c.date, -1)], now.date), ...prepDiff(db, after, [addDays(c.date, -1), c.date], now.date))
  }
  if (sensitive) u.line(`É um evento de agenda externa: aqui só tiro do seu dia — avisar as pessoas fica com você.`, 'fact')
  return u.plan(sensitive)
}

// ─── workMode ───────────────────────────────────────────────────────────────

function changeWorkMode(db: DB, c: Extract<GraphChange, { kind: 'workMode' }>, now: Now, at: string): GraphPlan {
  const current = workMode(db, c.date)
  const rel = dayLabel(c.date, now.date)
  if (current === c.mode) return noop(`${capitalize(rel)} já é ${MODE_LABEL[c.mode]}.`)
  const u = new Unit(at, c.date)
  u.ops.push({ op: 'override', date: c.date, ref: { type: 'work', id: c.date }, patch: { workMode: c.mode, cancelled: undefined }, by: 'lumos' })
  u.line(`${capitalize(rel)} fica ${MODE_LABEL[c.mode]}`, 'user')
  u.root({ kind: 'changed', title: `${capitalize(WEEKDAY_LONG[weekday(c.date)])} ficou ${MODE_LABEL[c.mode]}`, area: 'trabalho', ref: { type: 'work', id: c.date }, provenance: 'user' })

  const after = previewOps(db, u.ops)
  if (c.mode === 'presencial') {
    const commute = workBlocks(after, c.date).filter((b) => b.kind === 'commute')
    if (commute.length) u.line(`Deslocamento ${commute.map((b) => `${b.start}–${b.end}`).join(' e ')}`, 'fact')
    const kit = presencialKit(after, c.date)
    if (kit) {
      const out = kit.meals.filter((m) => m.place === 'fora' && m.take.length)
      u.line(`Kit presencial: ${out.length ? out.map((m) => `${m.time ?? ''} ${m.name}`.trim()).join(' · ') : 'nada de comida pra levar'} (saída ${kit.out.leave})`, 'inference')
      u.dep({ kind: 'created', title: `Kit presencial de ${WEEKDAY_LONG[weekday(c.date)]} montado`, area: 'alimentacao' })
    }
    const list = db.profile.work?.presencialChecklist ?? []
    if (list.length) u.line(`Pra levar: ${list.join(', ')}`, 'fact')
  } else if (current === 'presencial') {
    u.line('Sem deslocamento — o kit presencial sai', 'inference')
  }
  u.lines.push(...prepDiff(db, after, [addDays(c.date, -1), c.date], now.date))
  u.lines.push(...conflictDiff(db, after, [c.date]))
  return u.plan()
}

// ─── activityDone ───────────────────────────────────────────────────────────

function activityDone(db: DB, c: Extract<GraphChange, { kind: 'activityDone' }>, at: string): GraphPlan {
  const r = db.workouts.some((w) => w.id === c.workoutId) ? resolveWorkout(db, c.date, { type: 'workout', id: c.workoutId }) : resolveWorkout(db, c.date, { type: 'weekTemplate', id: c.workoutId })
  if (!r) return noop('Não achei um treino planejado pra essa atividade.')
  const integration = c.activity.source === 'strava'
  const u = new Unit(at, c.date)
  const patch: Partial<Workout> = {
    status: 'feito',
    ...(c.activity.durationMin != null ? { durationMin: Math.round(c.activity.durationMin) } : {}),
    ...(c.activity.distanceKm != null ? { distanceKm: Math.round(c.activity.distanceKm * 100) / 100 } : {}),
  }
  let id = r.workout.id
  if (r.virtual) {
    u.ops.push(...materializeDay(db, c.date, r.workout.templateId))
    const created = materialize(r.workout, patch)
    id = created.item.id
    u.ops.push(created)
  } else u.ops.push({ op: 'patch', collection: 'workouts', id, patch: patch as Record<string, unknown> })

  const t = titleOf(r.workout)
  const facts = [c.activity.durationMin != null ? fmtDuration(Math.round(c.activity.durationMin)) : undefined, c.activity.distanceKm != null ? `${String(Math.round(c.activity.distanceKm * 10) / 10).replace('.', ',')} km` : undefined].filter(Boolean).join(' · ')
  u.line(`${t} feito${facts ? ` — ${facts}` : ''}${integration ? ' (Strava)' : ''}`, integration ? 'integration' : 'user')
  u.root({ kind: integration ? 'integration' : 'done', title: `${t} feito${facts ? ` (${facts})` : ''}`, area: 'esportes', ref: { type: 'workout', id }, by: integration ? 'integration' : 'lumos', provenance: integration ? 'integration' : 'user', confidence: 'high' })

  const pos = planMeals(db, c.date).find((m) => m.meal.phase === 'pos' && !db.meals.some((x) => x.date === c.date && x.planMealRef === m.ref))
  if (pos) u.line(`Próximo: ${pos.meal.name}${pos.time ? ` (${pos.time})` : ''}`, 'fact')
  return u.plan()
}
