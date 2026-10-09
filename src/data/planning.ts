/**
 * Planning engine shared by Hoje, Agenda, Corpo, "Montar minha semana" and Lumos.
 *
 * Principles
 * - It never blocks or deletes anything: it only *describes* conflicts and suggests windows.
 * - Everything is driven by data (profile.work, constraints, weekTemplate, modalities) —
 *   no names of places, services or people are hardcoded here.
 * - A conflict Marina already answered ("manter" / "ignorar") is hidden via ConflictAck.
 */
import type {
  CalendarEvent,
  DateKey,
  DayPeriod,
  DB,
  ID,
  Modality,
  NewItem,
  ScheduleOverride,
  SchedulingConstraint,
  Task,
  TimeHM,
  TrainingGroup,
  UserProfile,
  Workout,
  WorkDayMode,
} from './types'
import { addDays, hmToMinutes, minutesToHM, weekday, weekDays } from '@/lib/date'
import { occursOn } from '@/lib/recurrence'
import { DEFAULT_MODALITIES } from './defaults'

// ─── Basics ─────────────────────────────────────────────────────────────────

export const PERIOD_RANGES: Record<DayPeriod, [TimeHM, TimeHM]> = {
  manha: ['06:00', '12:00'],
  almoco: ['12:00', '14:00'],
  tarde: ['14:00', '18:00'],
  noite: ['18:00', '22:00'],
}

export const PERIOD_LABEL: Record<DayPeriod, string> = {
  manha: 'manhã',
  almoco: 'almoço',
  tarde: 'tarde',
  noite: 'noite',
}

export const GROUP_LABEL: Record<TrainingGroup, string> = {
  corrida: 'Corrida',
  natacao: 'Natação',
  bike: 'Bike',
  forca: 'Força',
  mobilidade: 'Mobilidade / Yoga',
  fun: 'Fun / Outros',
  off: 'OFF',
}

export const GROUP_ORDER: TrainingGroup[] = ['corrida', 'natacao', 'bike', 'forca', 'mobilidade', 'fun', 'off']

export function findModality(profile: UserProfile, id: string): Modality | undefined {
  return profile.modalities.find((m) => m.id === id) ?? DEFAULT_MODALITIES.find((m) => m.id === id)
}

export function modalityGroup(profile: UserProfile, id: string): TrainingGroup {
  return findModality(profile, id)?.group ?? DEFAULT_MODALITIES.find((m) => m.id === id)?.group ?? 'fun'
}

/** Profile or the whole DB. Passing the DB makes per-day changes ("amanhã fiquei presencial") count. */
export type WorkSource = UserProfile | DB

const isDB = (src: WorkSource): src is DB => 'profile' in src && 'scheduleOverrides' in src
const profileOf = (src: WorkSource): UserProfile => (isDB(src) ? src.profile : src)

/** The per-day work override (ScheduleOverride refType 'work', refId = the DateKey). Latest write wins. */
export function workOverride(db: DB, date: DateKey): ScheduleOverride | undefined {
  let found: ScheduleOverride | undefined
  for (const o of db.scheduleOverrides ?? []) {
    if (o.refType === 'work' && o.refId === date && (!found || o.updatedAt >= found.updatedAt)) found = o
  }
  return found
}

/**
 * Work mode of a day: the per-day override (when `src` is the DB) wins over the weekly BASE.
 * A cancelled 'work' override means no work that day ('off').
 */
export function workMode(src: WorkSource, date: DateKey): WorkDayMode {
  if (isDB(src)) {
    const o = workOverride(src, date)
    if (o?.workMode) return o.workMode
    if (o?.cancelled) return 'off'
  }
  return profileOf(src).work?.days?.[weekday(date)] ?? 'remoto'
}

export function isPresencial(src: WorkSource, date: DateKey): boolean {
  return workMode(src, date) === 'presencial'
}

export interface TimeRange {
  start: number // minutes
  end: number
  /** True when derived from a DayPeriod, not an exact time. */
  approx: boolean
}

/** Time range of something with an exact time, a period, or nothing (→ undefined). */
export function rangeOf(item: { time?: TimeHM; startTime?: TimeHM; endTime?: TimeHM; period?: DayPeriod }, durationMin = 60): TimeRange | undefined {
  const start = item.time ?? item.startTime
  if (start) {
    const s = hmToMinutes(start)
    const e = item.endTime ? hmToMinutes(item.endTime) : s + durationMin
    return { start: s, end: Math.max(e, s + 15), approx: false }
  }
  if (item.period) {
    const [a, b] = PERIOD_RANGES[item.period]
    return { start: hmToMinutes(a), end: hmToMinutes(b), approx: true }
  }
  return undefined
}

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end
}

// ─── Work blocks ────────────────────────────────────────────────────────────

export interface WorkBlock {
  kind: 'work' | 'commute'
  title: string
  start: TimeHM
  end: TimeHM
  mode: WorkDayMode
}

/** BASE work hours for a day, plus commute buffers on presencial days. Empty on 'off'. With the DB, a 'work' override's time/endTime change that day's hours. */
export function workBlocks(src: WorkSource, date: DateKey): WorkBlock[] {
  const profile = profileOf(src)
  const mode = workMode(src, date)
  if (mode === 'off' || !profile.work) return []
  const o = isDB(src) ? workOverride(src, date) : undefined
  const { location, commuteBeforeMin, commuteAfterMin } = profile.work
  const start = o?.time ?? profile.work.start
  const end = o?.endTime ?? profile.work.end
  const blocks: WorkBlock[] = []
  if (mode === 'presencial' && commuteBeforeMin > 0) {
    blocks.push({ kind: 'commute', title: 'Deslocamento', start: minutesToHM(Math.max(0, hmToMinutes(start) - commuteBeforeMin)), end: start, mode })
  }
  const label = mode === 'presencial' ? `Trabalho presencial${location ? ` · ${location}` : ''}` : mode === 'flexivel' ? 'Trabalho (flexível)' : 'Trabalho remoto'
  blocks.push({ kind: 'work', title: label, start, end, mode })
  if (mode === 'presencial' && commuteAfterMin > 0) {
    blocks.push({ kind: 'commute', title: 'Deslocamento', start: end, end: minutesToHM(Math.min(23 * 60 + 59, hmToMinutes(end) + commuteAfterMin)), mode })
  }
  return blocks
}

// ─── Events helper (recurrence + exdates) ───────────────────────────────────

export function eventOccursOn(e: CalendarEvent, date: DateKey): boolean {
  if (e.exdates?.includes(date)) return false
  if (e.recurrence) return e.date <= date && occursOn(e.recurrence, date)
  if (e.endDate) return e.date <= date && date <= e.endDate
  return e.date === date
}

// ─── "Meu treino da semana" ─────────────────────────────────────────────────

export interface TrainingWeekSummary {
  /** Sessions per group (planned or done, excluding 'pulado'); 'off' = rest days marked. */
  counts: Record<TrainingGroup, number>
  done: Record<TrainingGroup, number>
  totalMinutes: number
  /** "2 corridas · 2 natações · 2 forças · 1 bike · 1 recovery" */
  line: string
}

const GROUP_WORD: Record<TrainingGroup, [string, string]> = {
  corrida: ['corrida', 'corridas'],
  natacao: ['natação', 'natações'],
  bike: ['bike', 'bikes'],
  forca: ['força', 'forças'],
  mobilidade: ['mobilidade/yoga', 'mobilidade/yoga'],
  fun: ['fun', 'fun'],
  off: ['recovery', 'recovery'],
}

export function trainingWeekSummary(db: DB, anyDayOfWeek: DateKey): TrainingWeekSummary {
  const days = new Set(weekDays(anyDayOfWeek))
  const counts = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0])) as Record<TrainingGroup, number>
  const done = { ...counts }
  let totalMinutes = 0
  for (const w of db.workouts) {
    if (!days.has(w.date) || w.status === 'pulado') continue
    const g: TrainingGroup = w.status === 'descanso' ? 'off' : modalityGroup(db.profile, w.modality)
    counts[g]++
    if (w.status === 'feito' || w.status === 'adaptado') {
      done[g]++
      totalMinutes += w.durationMin ?? w.plannedDurationMin ?? 0
    }
  }
  const line = GROUP_ORDER.filter((g) => counts[g] > 0)
    .map((g) => `${counts[g]} ${GROUP_WORD[g][counts[g] === 1 ? 0 : 1]}`)
    .join(' · ')
  return { counts, done, totalMinutes, line }
}

// ─── Conflicts ──────────────────────────────────────────────────────────────

export type ConflictKind =
  | 'checkin_limit' // e.g. TotalPass 1 check-in/day
  | 'overlap' // two things at the same time
  | 'work_hours' // training inside BASE work hours / commute
  | 'presencial_heavy' // long logistics on a presencial day
  | 'same_day_workout' // another workout already that day (info)
  | 'project_time_cap' // project max minutes/day exceeded

export interface Conflict {
  /** Stable id used by ConflictAck. */
  key: string
  kind: ConflictKind
  date: DateKey
  /** Involved records (workouts / events / tasks). */
  refs: { type: 'workout' | 'event' | 'task'; id: ID; title: string }[]
  title: string
  message: string
  severity: 'info' | 'warn'
  constraintId?: ID
}

function conflictKey(kind: ConflictKind, date: DateKey, ids: string[]): string {
  return `${kind}:${date}:${[...ids].sort().join('+')}`
}

interface Busy {
  type: 'workout' | 'event' | 'task'
  id: ID
  title: string
  range: TimeRange
}

function workoutTitle(db: DB, w: Workout): string {
  const m = findModality(db.profile, w.modality)
  return `${m?.emoji ?? ''} ${w.title || m?.label || w.modality}`.trim()
}

function activeWorkouts(db: DB, date: DateKey, workouts: Workout[] = db.workouts): Workout[] {
  return workouts.filter((w) => w.date === date && w.status !== 'pulado' && w.status !== 'descanso')
}

function busyOn(db: DB, date: DateKey, workouts: Workout[]): Busy[] {
  const out: Busy[] = []
  for (const w of activeWorkouts(db, date, workouts)) {
    const r = rangeOf(w, w.durationMin ?? w.plannedDurationMin ?? 60)
    if (r) out.push({ type: 'workout', id: w.id, title: workoutTitle(db, w), range: r })
  }
  for (const e of db.events) {
    if (e.allDay || !eventOccursOn(e, date)) continue
    const r = rangeOf(e, 60)
    if (r) out.push({ type: 'event', id: e.id, title: e.title, range: r })
  }
  for (const t of db.tasks) {
    if (!t.time || t.status === 'done' || t.status === 'archived') continue
    const on = t.recurrence ? occursOn(t.recurrence, date) : t.date === date
    if (!on) continue
    const r = rangeOf(t, t.durationMin ?? 30)
    if (r) out.push({ type: 'task', id: t.id, title: t.title, range: r })
  }
  return out
}

export interface ConflictOptions {
  /** Include conflicts Marina already acknowledged. */
  includeAcknowledged?: boolean
  /** Evaluate with these workouts instead of db.workouts (used for "what if I move this?"). */
  workouts?: Workout[]
}

/** Does this session spend a check-in of constraint `c`? The session's own answer wins over the modality list. */
export function usesCheckin(c: Pick<SchedulingConstraint, 'modalities'>, w: Pick<Workout, 'modality' | 'usesCheckin'>): boolean {
  return w.usesCheckin ?? !!c.modalities?.includes(w.modality)
}

/** All conflicts on one day. Pure; never mutates. */
export function conflictsOn(db: DB, date: DateKey, opts: ConflictOptions = {}): Conflict[] {
  const workouts = opts.workouts ?? db.workouts
  const out: Conflict[] = []
  const dayWorkouts = activeWorkouts(db, date, workouts)

  // 1. Check-in limits (TotalPass-style)
  for (const c of db.constraints.filter((c) => c.active && c.kind === 'max_checkins_per_day')) {
    const using = dayWorkouts.filter((w) => usesCheckin(c, w))
    if (using.length > c.limit) {
      out.push({
        key: conflictKey('checkin_limit', date, using.map((w) => w.id)),
        kind: 'checkin_limit',
        date,
        refs: using.map((w) => ({ type: 'workout', id: w.id, title: workoutTitle(db, w) })),
        title: c.name,
        message: `⚠️ ${using.length === 2 ? 'Esses dois treinos podem' : 'Esses treinos podem'} competir pelo mesmo check-in (${c.name}).`,
        severity: 'warn',
        constraintId: c.id,
      })
    }
  }

  // 2. Time overlaps among workouts, events and timed tasks
  const busy = busyOn(db, date, workouts)
  for (let i = 0; i < busy.length; i++) {
    for (let j = i + 1; j < busy.length; j++) {
      const a = busy[i]
      const b = busy[j]
      if (a.type !== 'workout' && b.type !== 'workout' && !(a.range.approx || b.range.approx)) {
        // Event vs event overlaps belong to the calendar itself; only flag when a workout or an approximate window is involved.
        continue
      }
      if (!overlaps(a.range, b.range)) continue
      const approx = a.range.approx || b.range.approx
      out.push({
        key: conflictKey('overlap', date, [a.id, b.id]),
        kind: 'overlap',
        date,
        refs: [a, b].map((x) => ({ type: x.type, id: x.id, title: x.title })),
        title: 'Mesmo horário',
        message: approx
          ? `${a.title} e ${b.title} podem cair no mesmo período.`
          : `${a.title} e ${b.title} estão no mesmo horário.`,
        severity: 'warn',
      })
    }
  }

  // 3. Workouts inside work hours / commute (BASE, so it's information)
  const blocks = workBlocks(db, date)
  for (const w of dayWorkouts) {
    const r = rangeOf(w, w.durationMin ?? w.plannedDurationMin ?? 60)
    if (!r || r.approx) continue
    const hit = blocks.find((b) => overlaps(r, { start: hmToMinutes(b.start), end: hmToMinutes(b.end), approx: false }))
    if (hit) {
      out.push({
        key: conflictKey('work_hours', date, [w.id]),
        kind: 'work_hours',
        date,
        refs: [{ type: 'workout', id: w.id, title: workoutTitle(db, w) }],
        title: hit.kind === 'commute' ? 'Hora do deslocamento' : 'Horário de trabalho',
        message:
          hit.kind === 'commute'
            ? `${workoutTitle(db, w)} cai no deslocamento de um dia presencial.`
            : `${workoutTitle(db, w)} cai no horário base de trabalho (${hit.start}–${hit.end}).`,
        severity: hit.mode === 'presencial' ? 'warn' : 'info',
      })
    }
  }

  // 4. Heavy logistics on presencial days
  if (isPresencial(db, date)) {
    for (const w of dayWorkouts) {
      const m = findModality(db.profile, w.modality)
      const dur = w.durationMin ?? w.plannedDurationMin ?? 0
      if (m?.heavyLogistics && dur >= 90) {
        out.push({
          key: conflictKey('presencial_heavy', date, [w.id]),
          kind: 'presencial_heavy',
          date,
          refs: [{ type: 'workout', id: w.id, title: workoutTitle(db, w) }],
          title: 'Dia presencial',
          message: `${workoutTitle(db, w)} longo num dia presencial pode virar logística demais.`,
          severity: 'warn',
        })
      }
    }
  }

  // 5. Same-day workouts (information only, never a problem by itself)
  if (dayWorkouts.length > 1 && !out.some((c) => c.kind === 'checkin_limit')) {
    out.push({
      key: conflictKey('same_day_workout', date, dayWorkouts.map((w) => w.id)),
      kind: 'same_day_workout',
      date,
      refs: dayWorkouts.map((w) => ({ type: 'workout', id: w.id, title: workoutTitle(db, w) })),
      title: 'Dois treinos no dia',
      message: `${dayWorkouts.map((w) => workoutTitle(db, w)).join(' + ')} no mesmo dia.`,
      severity: 'info',
    })
  }

  // 6. Project time caps (e.g. "até 1h/dia")
  for (const c of db.constraints.filter((c) => c.active && c.kind === 'max_minutes_per_day' && c.projectId)) {
    const tasks = db.tasks.filter((t) => t.projectId === c.projectId && t.date === date && t.status !== 'done' && t.status !== 'archived')
    const minutes = tasks.reduce((s, t) => s + (t.durationMin ?? 0), 0)
    if (minutes > c.limit) {
      out.push({
        key: conflictKey('project_time_cap', date, tasks.map((t) => t.id)),
        kind: 'project_time_cap',
        date,
        refs: tasks.map((t) => ({ type: 'task', id: t.id, title: t.title })),
        title: c.name,
        message: `${Math.round(minutes / 6) / 10}h planejadas — o combinado é até ${Math.round(c.limit / 6) / 10}h por dia.`,
        severity: 'warn',
        constraintId: c.id,
      })
    }
  }

  if (opts.includeAcknowledged) return out
  const acked = new Set(db.conflictAcks.map((a) => a.key))
  return out.filter((c) => !acked.has(c.key))
}

export function conflictsBetween(db: DB, from: DateKey, to: DateKey, opts: ConflictOptions = {}): Conflict[] {
  const out: Conflict[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(...conflictsOn(db, d, opts))
  return out
}

/**
 * "Não quero treino burro": what would happen if this workout moved to `date` (and optionally `time`)?
 * Returns only conflicts that involve the moved workout. Never blocks.
 */
export function checkWorkoutMove(db: DB, workoutId: ID, date: DateKey, time?: TimeHM | null): Conflict[] {
  const w = db.workouts.find((x) => x.id === workoutId)
  if (!w) return []
  const moved: Workout = { ...w, date, time: time === null ? undefined : (time ?? w.time) }
  const workouts = db.workouts.map((x) => (x.id === workoutId ? moved : x))
  return conflictsOn(db, date, { workouts, includeAcknowledged: true }).filter((c) => c.refs.some((r) => r.id === workoutId))
}

// ─── Suggestions ────────────────────────────────────────────────────────────

export interface WindowSuggestion {
  date: DateKey
  start: TimeHM
  end: TimeHM
  reason: string
}

export interface SuggestOptions {
  modality: string
  durationMin?: number
  /** Earliest date to consider (usually today). */
  from: DateKey
  preferredWeekdays?: number[]
  /** Search window inside a day. */
  dayStart?: TimeHM
  dayEnd?: TimeHM
  limit?: number
}

/**
 * Free windows in the week of `from` for a modality, respecting check-in limits, presencial logistics,
 * work hours and everything already scheduled. Preferred weekdays come first.
 */
export function suggestWindows(db: DB, opts: SuggestOptions): WindowSuggestion[] {
  const dur = opts.durationMin ?? 60
  const dayStart = hmToMinutes(opts.dayStart ?? '06:00')
  const dayEnd = hmToMinutes(opts.dayEnd ?? '21:00')
  const m = findModality(db.profile, opts.modality)
  const limiting = db.constraints.filter((c) => c.active && c.kind === 'max_checkins_per_day' && c.modalities?.includes(opts.modality))
  const results: (WindowSuggestion & { score: number })[] = []

  for (const date of weekDays(opts.from)) {
    if (date < opts.from) continue
    if (m?.heavyLogistics && dur >= 90 && isPresencial(db, date)) continue
    const dayWorkouts = activeWorkouts(db, date)
    if (dayWorkouts.some((w) => w.modality === opts.modality)) continue
    if (limiting.some((c) => dayWorkouts.filter((w) => usesCheckin(c, w)).length >= c.limit)) continue

    const busy = busyOn(db, date, db.workouts).map((b) => b.range)
    for (const b of workBlocks(db, date)) busy.push({ start: hmToMinutes(b.start), end: hmToMinutes(b.end), approx: false })
    busy.sort((a, b) => a.start - b.start)

    let cursor = dayStart
    for (const r of [...busy, { start: dayEnd, end: dayEnd, approx: false }]) {
      if (r.start - cursor >= dur) {
        const preferred = opts.preferredWeekdays?.includes(weekday(date)) ?? false
        results.push({
          date,
          start: minutesToHM(cursor),
          end: minutesToHM(cursor + dur),
          reason: preferred ? 'dia que você costuma preferir' : workMode(db, date) === 'presencial' ? 'janela livre num dia presencial' : 'janela livre',
          score: (preferred ? 0 : 100) + weekDays(opts.from).indexOf(date),
        })
        break // one suggestion per day keeps the list calm
      }
      cursor = Math.max(cursor, r.end)
      if (cursor >= dayEnd) break
    }
  }
  return results
    .sort((a, b) => a.score - b.score)
    .slice(0, opts.limit ?? 3)
    .map(({ score: _score, ...s }) => s)
}

// ─── Week template → plan ───────────────────────────────────────────────────

export interface TemplateProposal {
  date: DateKey
  templateId: ID
  /** Ready to create (fixed / rest items). */
  workout?: NewItem<'workouts'>
  /** Needs Marina's choice (one_of / optional). */
  options?: string[]
  choice: 'fixed' | 'one_of' | 'optional' | 'rest'
  planType: Workout['planType']
  note?: string
}

/**
 * Expands the weekly template for the week of `anyDayOfWeek`.
 * Skips template lines already materialized that week — on ANY day: a session she moved (seg → ter) or
 * skipped still came from that line, so the base never brings it back to the original day.
 */
export function proposeWeekFromTemplate(db: DB, anyDayOfWeek: DateKey): TemplateProposal[] {
  const days = weekDays(anyDayOfWeek)
  const out: TemplateProposal[] = []
  const items = db.weekTemplate.filter((t) => t.active).sort((a, b) => a.weekday - b.weekday || a.order - b.order)
  const inWeek = new Set(db.workouts.filter((w) => w.templateId && days.includes(w.date)).map((w) => w.templateId))
  // Sessions of the week that came from no base line (added by hand or by Lumos): each one already covers one
  // fixed line of its modality ("já fiz yoga" on Thursday means Tuesday's yoga isn't missing).
  const loose = db.workouts.filter((w) => !w.templateId && days.includes(w.date) && w.status !== 'pulado' && w.status !== 'descanso')
  for (const t of items) {
    const date = days.find((d) => weekday(d) === t.weekday)!
    if (inWeek.has(t.id)) continue
    if (t.choice === 'fixed' && t.modalities[0]) {
      const i = loose.findIndex((w) => w.modality === t.modalities[0])
      if (i >= 0) {
        loose.splice(i, 1)
        continue
      }
    }
    const base = { date, templateId: t.id, choice: t.choice, planType: t.planType, note: t.notes }
    if (t.choice === 'fixed' && t.modalities[0]) {
      out.push({
        ...base,
        workout: {
          date,
          modality: t.modalities[0],
          status: 'planejado',
          title: t.title,
          time: t.time,
          period: t.time ? undefined : t.period,
          plannedDurationMin: t.durationMin,
          planType: t.planType,
          templateId: t.id,
          notes: t.notes,
          order: 0,
          plannedDurationMaxMin: t.durationMaxMin,
          sessionType: t.sessionType,
          loadCategory: t.loadCategory,
          isKeySession: t.isKeySession,
          isLongSession: t.isLongSession,
          requiresPreviousDayPrep: t.requiresPreviousDayPrep,
          requiresPreWorkout: t.requiresPreWorkout,
          requiresIntraWorkout: t.requiresIntraWorkout,
          requiresPostWorkout: t.requiresPostWorkout,
          recoveryPriority: t.recoveryPriority,
          tags: t.tags,
        },
      })
    } else if (t.choice === 'rest') {
      out.push({
        ...base,
        workout: { date, modality: 'recuperacao', status: 'descanso', title: t.title, planType: t.planType, templateId: t.id, notes: t.notes, order: 0 },
      })
    } else {
      out.push({ ...base, options: t.modalities })
    }
  }
  return out
}

/** Constraint lookup for UI labels. */
export function constraintById(db: DB, id?: ID): SchedulingConstraint | undefined {
  return id ? db.constraints.find((c) => c.id === id) : undefined
}

/** Does a task belong to a project with a daily time cap? (for "não agendar 3h numa tarde") */
export function projectDailyCap(db: DB, task: Pick<Task, 'projectId'>): number | undefined {
  if (!task.projectId) return undefined
  return db.constraints.find((c) => c.active && c.kind === 'max_minutes_per_day' && c.projectId === task.projectId)?.limit
}
