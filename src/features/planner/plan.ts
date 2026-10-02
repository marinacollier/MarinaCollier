/**
 * "Montar minha semana" — pure planning logic (no store, no React).
 *
 * The flow gathers what already exists for a week (step 1, 3, 4, 5), lets Marina pick trainings
 * (step 2), simulates the result to show conflicts (step 6) and only writes at the end (step 7).
 * Everything here is driven by data (profile.work, weekTemplate, workoutGoals, constraints…):
 * no names of people, places or services.
 */
import type {
  CalendarEvent,
  DateKey,
  DayPeriod,
  DB,
  EntityType,
  ID,
  NewItem,
  PlanType,
  StudyItem,
  StudyTrack,
  TimeHM,
  Trip,
  TripItem,
  Workout,
  WorkDayMode,
  WorkoutGoal,
  WeekTemplateItem,
} from '@/data/types'
import {
  conflictsBetween,
  conflictsOn,
  findModality,
  PERIOD_LABEL,
  proposeWeekFromTemplate,
  suggestWindows,
  trainingWeekSummary,
  workBlocks,
  workMode,
  type Conflict,
  type WindowSuggestion,
} from '@/data/planning'
import { eventsFor, nextTrip, petTasksDue } from '@/data/selectors'
import { dayTrainingContext } from '@/data/fuel'
import { addDays, endOfWeek, startOfWeek, weekday, weekDays } from '@/lib/date'

// ─── Week & steps ───────────────────────────────────────────────────────────

export const STEPS = [
  { key: 'fixos', label: 'Fixos', title: 'O que já está de pé', lede: 'Trabalho, compromissos, treinos base e viagens. Só pra você ver a semana inteira.' },
  { key: 'treinos', label: 'Treinos', title: 'Treinos que você quer', lede: 'Seu modelo da semana, do jeito que der. Nada é lei.' },
  { key: 'estudos', label: 'Estudos', title: 'Foco de estudo', lede: 'Escolhe o que merece atenção essa semana. O resto espera tranquilo.' },
  { key: 'deadlines', label: 'Trabalho', title: 'Entregas da semana', lede: 'O que vence no trabalho. Dá pra puxar pro Top 3 de um dia.' },
  { key: 'vida', label: 'Vida', title: 'Vida pessoal', lede: 'Compromissos, cuidados, coisas da casa e da próxima viagem.' },
  { key: 'conflitos', label: 'Conflitos', title: 'Onde pode apertar', lede: 'Eu só aviso — quem decide é você.' },
  { key: 'confirmo', label: 'Confirmo', title: 'Tudo certo?', lede: 'Nada foi criado ainda. Quando você confirmar, a semana entra no app.' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

/** Sat/Sun → next week; Mon–Fri → the current week. */
export function defaultWeekStart(today: DateKey): DateKey {
  const wd = weekday(today)
  const start = startOfWeek(today)
  return wd === 0 || wd === 6 ? addDays(start, 7) : start
}

/** Days of the week that can still be planned (from today on). */
export function planDays(weekStart: DateKey, today: DateKey): DateKey[] {
  return weekDays(weekStart).filter((d) => d >= today)
}

// ─── Step 1 · Fixos ─────────────────────────────────────────────────────────

export interface FixedEntry {
  key: string
  kind: 'work' | 'event' | 'workout' | 'template'
  emoji: string
  title: string
  time?: string
  detail?: string
  planType?: PlanType
  eventId?: ID
  /** Recurring event: can be cancelled for this week only (exdates). */
  cancellable?: boolean
}

export interface FixedDay {
  date: DateKey
  mode: WorkDayMode
  entries: FixedEntry[]
}

/**
 * Events that anchor a week: FIXO/BASE, recurring, work meetings or mirrored from a real calendar.
 * Uncertain/flexible ones belong to "vida pessoal" instead.
 */
export function isAnchorEvent(e: CalendarEvent): boolean {
  if (e.planType === 'a_confirmar' || e.planType === 'flexivel') return false
  return e.planType === 'fixo' || e.planType === 'base' || !!e.recurrence || e.kind === 'trabalho' || !!e.external
}

function timeLabel(item: { time?: TimeHM; startTime?: TimeHM; endTime?: TimeHM; period?: DayPeriod; allDay?: boolean }): string | undefined {
  if (item.allDay) return 'dia todo'
  const start = item.time ?? item.startTime
  if (start) return item.endTime ? `${start}–${item.endTime}` : start
  return item.period ? PERIOD_LABEL[item.period] : undefined
}

export function modalityLabel(db: DB, id: string): { emoji: string; label: string } {
  const m = findModality(db.profile, id)
  return { emoji: m?.emoji ?? '✨', label: m?.label ?? id }
}

export function gatherFixed(db: DB, weekStart: DateKey): FixedDay[] {
  const proposals = proposeWeekFromTemplate(db, weekStart)
  return weekDays(weekStart).map((date) => {
    const mode = workMode(db.profile, date)
    const entries: FixedEntry[] = []
    if (mode === 'presencial') {
      const work = workBlocks(db.profile, date).find((b) => b.kind === 'work')
      const commute = db.profile.work.commuteBeforeMin + db.profile.work.commuteAfterMin > 0
      entries.push({
        key: `work:${date}`,
        kind: 'work',
        emoji: '📍',
        title: 'Trabalho presencial',
        time: work ? `${work.start}–${work.end}` : undefined,
        detail: [db.profile.work.location, commute ? '+ deslocamento' : ''].filter(Boolean).join(' · ') || undefined,
        planType: 'base',
      })
    }
    for (const e of eventsFor(db, date)) {
      if (!isAnchorEvent(e)) continue
      entries.push({
        key: `event:${e.id}:${date}`,
        kind: 'event',
        emoji: e.kind === 'criatividade' ? '🏺' : e.kind === 'trabalho' ? '💼' : e.kind === 'estudo' ? '📚' : e.kind === 'viagem' ? '✈️' : '📅',
        title: e.title,
        time: timeLabel(e),
        detail: e.category ?? e.location,
        planType: e.planType,
        eventId: e.id,
        cancellable: !!e.recurrence,
      })
    }
    for (const w of db.workouts) {
      if (w.date !== date || w.status === 'pulado' || w.status === 'descanso') continue
      if (w.planType !== 'fixo' && w.planType !== 'base') continue
      const m = modalityLabel(db, w.modality)
      entries.push({ key: `workout:${w.id}`, kind: 'workout', emoji: m.emoji, title: w.title || m.label, time: timeLabel(w), planType: w.planType })
    }
    for (const p of proposals) {
      if (p.date !== date || p.choice !== 'fixed' || !p.workout) continue
      if (p.planType !== 'fixo' && p.planType !== 'base') continue
      const m = modalityLabel(db, p.workout.modality)
      entries.push({
        key: `template:${p.templateId}`,
        kind: 'template',
        emoji: m.emoji,
        title: p.workout.title || m.label,
        time: timeLabel(p.workout),
        detail: 'do seu modelo · confirma no próximo passo',
        planType: p.planType,
      })
    }
    entries.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
    return { date, mode, entries }
  })
}

/** Trips that touch the week. */
export function weekTrips(db: DB, weekStart: DateKey): Trip[] {
  const end = endOfWeek(weekStart)
  return db.trips
    .filter((t) => !!t.startDate && t.startDate <= end && (t.endDate ?? t.startDate) >= weekStart)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
}

/** exdates patch to cancel one occurrence of a recurring event. */
export function cancelOncePatch(e: CalendarEvent, date: DateKey): Pick<CalendarEvent, 'exdates'> {
  return { exdates: [...new Set([...(e.exdates ?? []), date])].sort() }
}

// ─── Step 2 · Treinos ───────────────────────────────────────────────────────

export interface TrainingLine {
  templateId: ID
  date: DateKey
  choice: WeekTemplateItem['choice']
  options: string[]
  /** Pre-selected modality (fixed / rest) or null (needs a choice). */
  defaultPick: string | null
  planType: PlanType
  title?: string
  time?: TimeHM
  period?: DayPeriod
  durationMin?: number
  notes?: string
  /** Training-load fields copied from the template into the workout (🔥 key session, PREP…). */
  load: LoadFields
}

export type LoadFields = Pick<
  Workout,
  | 'plannedDurationMaxMin'
  | 'sessionType'
  | 'loadCategory'
  | 'isKeySession'
  | 'isLongSession'
  | 'requiresPreviousDayPrep'
  | 'requiresPreWorkout'
  | 'requiresIntraWorkout'
  | 'requiresPostWorkout'
  | 'recoveryPriority'
  | 'tags'
>

function loadOf(t: WeekTemplateItem): LoadFields {
  return {
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
  }
}

/** Template lines not yet materialized anywhere in the week (a moved line counts as materialized). */
export function trainingLines(db: DB, weekStart: DateKey, today: DateKey): TrainingLine[] {
  const days = new Set(weekDays(weekStart))
  const done = new Set(db.workouts.filter((w) => w.templateId && days.has(w.date)).map((w) => w.templateId!))
  const byId = new Map(db.weekTemplate.map((t) => [t.id, t]))
  const out: TrainingLine[] = []
  for (const p of proposeWeekFromTemplate(db, weekStart)) {
    if (p.date < today || done.has(p.templateId)) continue
    const t = byId.get(p.templateId)
    if (!t) continue
    const rest = t.choice === 'rest'
    out.push({
      templateId: t.id,
      date: p.date,
      choice: t.choice,
      options: rest ? ['recuperacao'] : t.modalities,
      defaultPick: rest ? 'recuperacao' : t.choice === 'fixed' ? (t.modalities[0] ?? null) : null,
      planType: t.planType,
      title: t.title,
      time: t.time,
      period: t.time ? undefined : t.period,
      durationMin: t.durationMin,
      notes: t.notes,
      load: rest ? {} : loadOf(t),
    })
  }
  return out
}

/** Workouts already in the week (shown as "já no plano"). */
export function existingWorkouts(db: DB, weekStart: DateKey): Workout[] {
  const days = new Set(weekDays(weekStart))
  return db.workouts.filter((w) => days.has(w.date) && w.status !== 'pulado').sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
}

/** Active flexible intents ("Yoga — 1x/semana", fun goals). */
export function flexibleGoals(db: DB): WorkoutGoal[] {
  return db.workoutGoals.filter((g) => g.status === 'ativa' && (g.perWeek ?? 0) > 0 && !!g.modality)
}

/** How many sessions of a flexible goal already exist in the week. */
export function flexPlannedCount(db: DB, goal: WorkoutGoal, weekStart: DateKey): number {
  const days = new Set(weekDays(weekStart))
  return db.workouts.filter((w) => days.has(w.date) && w.status !== 'pulado' && w.status !== 'descanso' && (w.workoutGoalId === goal.id || w.modality === goal.modality)).length
}

export interface FlexPick {
  goalId: ID
  date: DateKey
  time?: TimeHM
  durationMin?: number
}

export function flexSuggestions(db: DB, goal: WorkoutGoal, weekStart: DateKey, today: DateKey, planned: Workout[]): WindowSuggestion[] {
  const from = today > weekStart ? today : weekStart
  if (from > endOfWeek(weekStart)) return []
  const sim: DB = { ...db, workouts: mergeWorkouts(db.workouts, planned) }
  return suggestWindows(sim, { modality: goal.modality!, from, preferredWeekdays: goal.preferredWeekdays, limit: 3, durationMin: 60 })
}

// ─── Draft → planned workouts ───────────────────────────────────────────────

export interface Top3Pick {
  date: DateKey
  title: string
  ref?: { type: EntityType; id: ID }
}

export interface StudyPick {
  trackId: ID
  itemId?: ID
}

export interface WeekDraft {
  weekStart: DateKey
  /** templateId → chosen modality (null = not this week). Missing = line default. */
  picks: Record<ID, string | null>
  /** planned workout id → new date (moved in step 6). */
  moved: Record<ID, DateKey>
  flex: FlexPick[]
  study: StudyPick[]
  top3: Top3Pick[]
}

export function emptyDraft(weekStart: DateKey): WeekDraft {
  return { weekStart, picks: {}, moved: {}, flex: [], study: [], top3: [] }
}

export const plannedTemplateId = (weekStart: DateKey, templateId: ID) => `plan:${weekStart}:t:${templateId}`
export const plannedFlexId = (weekStart: DateKey, goalId: ID, date: DateKey) => `plan:${weekStart}:g:${goalId}:${date}`

export function pickFor(draft: WeekDraft, line: TrainingLine): string | null {
  return line.templateId in draft.picks ? draft.picks[line.templateId] : line.defaultPick
}

/**
 * The workouts the draft would create, with deterministic ids so a conflict acknowledged in
 * step 6 still matches after confirming. Pure.
 */
export function plannedWorkouts(db: DB, draft: WeekDraft, lines: TrainingLine[], now = ''): Workout[] {
  const meta = { createdAt: now, updatedAt: now }
  const out: Workout[] = []
  for (const line of lines) {
    const modality = pickFor(draft, line)
    if (!modality) continue
    const id = plannedTemplateId(draft.weekStart, line.templateId)
    const rest = line.choice === 'rest'
    out.push({
      ...meta,
      id,
      date: draft.moved[id] ?? line.date,
      modality,
      status: rest ? 'descanso' : 'planejado',
      title: rest ? line.title : line.choice === 'fixed' ? line.title : undefined,
      time: line.time,
      period: line.time ? undefined : line.period,
      plannedDurationMin: rest ? undefined : line.durationMin,
      planType: line.planType,
      templateId: line.templateId,
      notes: line.notes,
      ...(rest ? {} : line.load),
      order: 0,
    })
  }
  for (const f of draft.flex) {
    const goal = db.workoutGoals.find((g) => g.id === f.goalId)
    if (!goal?.modality) continue
    const id = plannedFlexId(draft.weekStart, goal.id, f.date)
    out.push({
      ...meta,
      id,
      date: draft.moved[id] ?? f.date,
      time: f.time,
      modality: goal.modality,
      status: 'planejado',
      plannedDurationMin: f.durationMin,
      planType: goal.planType ?? 'flexivel',
      workoutGoalId: goal.id,
      order: 0,
    })
  }
  return out
}

function mergeWorkouts(existing: Workout[], planned: Workout[]): Workout[] {
  const ids = new Set(planned.map((w) => w.id))
  return [...existing.filter((w) => !ids.has(w.id)), ...planned]
}

/** Day a template line lands on in the draft (moved in step 6, or its template day). */
export function lineDate(draft: WeekDraft, line: TrainingLine): DateKey {
  return draft.moved[plannedTemplateId(draft.weekStart, line.templateId)] ?? line.date
}

export interface DayLoad {
  date: DateKey
  /** 🔥 key session of the day. */
  key?: Workout
  /** Tomorrow's training that needs preparation today (PREP). */
  prepFor?: Workout
}

/**
 * Load hierarchy of the simulated week. Context belongs to the training, not the weekday:
 * move the key session and its PREP day moves with it (via data/fuel.ts dayTrainingContext).
 */
export function weekLoad(db: DB, weekStart: DateKey, planned: Workout[]): DayLoad[] {
  const sim = weekWithPlan(db, planned)
  return weekDays(weekStart).map((date) => {
    const ctx = dayTrainingContext(sim, date)
    return { date, key: ctx.key, prepFor: ctx.prepFor }
  })
}

// ─── Step 3 · Estudos ───────────────────────────────────────────────────────

export interface StudyTrackView {
  track: StudyTrack
  items: StudyItem[]
}

export function studyOptions(db: DB): StudyTrackView[] {
  return db.studyTracks
    .filter((t) => !t.archived && (t.status ?? 'ativo') !== 'pausado')
    .sort((a, b) => a.order - b.order)
    .map((track) => ({
      track,
      items: db.studyItems
        .filter((i) => i.trackId === track.id && (i.status === 'estudando' || i.status === 'proximo'))
        .sort((a, b) => (a.status === b.status ? a.order - b.order : a.status === 'estudando' ? -1 : 1)),
    }))
}

export function studyGoalTitle(db: DB, pick: StudyPick): string | undefined {
  const track = db.studyTracks.find((t) => t.id === pick.trackId)
  if (!track) return undefined
  const item = pick.itemId ? db.studyItems.find((i) => i.id === pick.itemId) : undefined
  return `${track.emoji} ${track.name}${item ? ` — ${item.title}` : ''}`
}

// ─── Step 4 · Deadlines ─────────────────────────────────────────────────────

export interface DeadlineEntry {
  key: string
  kind: 'task' | 'delivery' | 'deadline' | 'milestone'
  date: DateKey
  title: string
  emoji: string
  context?: string
  ref: { type: EntityType; id: ID }
}

export function workDeadlines(db: DB, weekStart: DateKey): DeadlineEntry[] {
  const end = endOfWeek(weekStart)
  const inWeek = (d?: DateKey) => !!d && d >= weekStart && d <= end
  const project = (id?: ID) => db.projects.find((p) => p.id === id)
  const out: DeadlineEntry[] = []
  for (const t of db.tasks) {
    if (t.recurrence || t.status === 'done' || t.status === 'archived' || !inWeek(t.dueDate)) continue
    if (t.context !== 'trabalho' && !t.projectId && t.area !== 'profissional') continue
    const p = project(t.projectId)
    out.push({ key: `task:${t.id}`, kind: 'task', date: t.dueDate!, title: t.title, emoji: p?.emoji ?? '💼', context: p?.name, ref: { type: 'task', id: t.id } })
  }
  for (const p of db.projects) {
    if (p.status === 'concluido') continue
    if (inWeek(p.nextDelivery?.date))
      out.push({ key: `delivery:${p.id}`, kind: 'delivery', date: p.nextDelivery!.date!, title: p.nextDelivery!.title, emoji: p.emoji, context: `${p.name} · próxima entrega`, ref: { type: 'project', id: p.id } })
    if (inWeek(p.deadline))
      out.push({ key: `deadline:${p.id}`, kind: 'deadline', date: p.deadline!, title: `Prazo de ${p.name}`, emoji: p.emoji, context: 'prazo de referência', ref: { type: 'project', id: p.id } })
  }
  for (const m of db.milestones) {
    if (m.done || m.status === 'feito' || !inWeek(m.date)) continue
    const p = project(m.projectId)
    out.push({ key: `milestone:${m.id}`, kind: 'milestone', date: m.date!, title: m.title, emoji: p?.emoji ?? '🏁', context: [p?.name, m.group].filter(Boolean).join(' · ') || undefined, ref: { type: 'milestone', id: m.id } })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Free Top 3 slots (domain trabalho) on a date, counting what the draft already queued. */
export function top3Room(db: DB, draft: WeekDraft, date: DateKey): number {
  const existing = db.priorities.filter((p) => p.date === date && p.domain === 'trabalho').length
  const queued = draft.top3.filter((t) => t.date === date).length
  return Math.max(0, 3 - existing - queued)
}

// ─── Step 5 · Vida pessoal ──────────────────────────────────────────────────

export interface LifeEntry {
  key: string
  date?: DateKey
  title: string
  emoji: string
  detail?: string
}

export interface PersonalLife {
  events: LifeEntry[]
  pet: LifeEntry[]
  tasks: LifeEntry[]
  trip?: { trip: Trip; items: TripItem[]; total: number }
}

export function personalLife(db: DB, weekStart: DateKey, today: DateKey): PersonalLife {
  const days = weekDays(weekStart)
  const end = days[6]
  const inWeek = (d?: DateKey) => !!d && d >= weekStart && d <= end

  const events: LifeEntry[] = []
  for (const date of days) {
    for (const e of eventsFor(db, date)) {
      if (isAnchorEvent(e)) continue
      events.push({ key: `event:${e.id}:${date}`, date, title: e.title, emoji: e.kind === 'saude' ? '🩺' : e.kind === 'luna' ? '🐾' : '📅', detail: [timeLabel(e), e.planType === 'a_confirmar' ? 'a confirmar' : undefined].filter(Boolean).join(' · ') || undefined })
    }
  }

  const pet: LifeEntry[] = []
  const seenPet = new Set<ID>()
  for (const date of days) {
    for (const p of petTasksDue(db, date)) {
      if (seenPet.has(p.id) || p.recurrence?.kind === 'daily') continue
      seenPet.add(p.id)
      const petName = db.pets.find((x) => x.id === p.petId)?.name
      pet.push({ key: `pet:${p.id}`, date: !p.recurrence && p.dueDate && p.dueDate < weekStart ? undefined : date, title: p.title, emoji: '🐾', detail: [petName, !p.recurrence && p.dueDate && p.dueDate < weekStart ? 'ficou de antes' : undefined].filter(Boolean).join(' · ') || undefined })
    }
  }

  const tasks: LifeEntry[] = []
  for (const t of db.tasks) {
    if (t.recurrence || t.status === 'done' || t.status === 'archived' || t.status === 'waiting') continue
    if (t.context === 'trabalho' || t.projectId || t.area === 'profissional') continue
    const lifeAdmin = t.context === 'vida_real' || !!t.lifeAdminCategory
    const dated = inWeek(t.dueDate) || inWeek(t.date)
    if (!(dated || (lifeAdmin && t.bucket === 'semana'))) continue
    tasks.push({ key: `task:${t.id}`, date: t.dueDate ?? t.date, title: t.title, emoji: lifeAdmin ? '🏡' : '✓', detail: t.status === 'review' ? 'revisar' : undefined })
  }
  tasks.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))

  const next = nextTrip(db, today)
  let trip: PersonalLife['trip']
  if (next) {
    const pending = db.tripItems.filter((i) => i.tripId === next.id && i.status === 'a_confirmar').sort((a, b) => a.order - b.order)
    if (pending.length) trip = { trip: next, items: pending.slice(0, 5), total: pending.length }
  }
  return { events, pet, tasks, trip }
}

// ─── Step 6 · Conflitos ─────────────────────────────────────────────────────

export function weekWithPlan(db: DB, planned: Workout[]): DB {
  return { ...db, workouts: mergeWorkouts(db.workouts, planned) }
}

/** Conflicts of the simulated week, from `from` (usually today) to the end of the week. */
export function planConflicts(db: DB, weekStart: DateKey, today: DateKey, planned: Workout[]): Conflict[] {
  const from = today > weekStart ? today : weekStart
  const to = endOfWeek(weekStart)
  if (from > to) return []
  return conflictsBetween(db, from, to, { workouts: mergeWorkouts(db.workouts, planned) })
}

/** For each candidate day: how many conflicts a planned workout would have there. */
export function moveOptions(db: DB, planned: Workout[], workoutId: ID, days: DateKey[]): { date: DateKey; conflicts: number }[] {
  const w = planned.find((x) => x.id === workoutId)
  if (!w) return []
  return days
    .filter((d) => d !== w.date)
    .map((date) => {
      const sim = mergeWorkouts(db.workouts, planned.map((x) => (x.id === workoutId ? { ...x, date } : x)))
      const n = conflictsOn(db, date, { workouts: sim, includeAcknowledged: true }).filter((c) => c.severity === 'warn' && c.refs.some((r) => r.id === workoutId)).length
      return { date, conflicts: n }
    })
}

// ─── Step 7 · Confirmo ──────────────────────────────────────────────────────

export interface PlanOps {
  workouts: NewItem<'workouts'>[]
  goals: NewItem<'goals'>[]
  priorities: NewItem<'priorities'>[]
  weekPlan: { existingId?: ID; weekStart: DateKey }
}

/**
 * What confirming the draft writes. Idempotent: running it again on the resulting database
 * yields no new workouts/goals/priorities (ids, templateId, goal+date and titles are checked).
 */
export function buildOps(db: DB, draft: WeekDraft, lines: TrainingLine[]): PlanOps {
  const days = new Set(weekDays(draft.weekStart))
  const ids = new Set(db.workouts.map((w) => w.id))
  const templateDone = new Set(db.workouts.filter((w) => w.templateId && days.has(w.date)).map((w) => w.templateId))
  const goalDone = new Set(db.workouts.filter((w) => w.workoutGoalId).map((w) => `${w.workoutGoalId}:${w.date}`))

  const workouts: NewItem<'workouts'>[] = []
  for (const w of plannedWorkouts(db, draft, lines)) {
    if (ids.has(w.id)) continue
    if (w.templateId && templateDone.has(w.templateId)) continue
    if (!w.templateId && w.workoutGoalId && goalDone.has(`${w.workoutGoalId}:${w.date}`)) continue
    const { createdAt: _c, updatedAt: _u, ...rest } = w
    workouts.push(stripUndefined(rest))
  }

  const goals: NewItem<'goals'>[] = []
  const goalTitles = new Set(db.goals.filter((g) => g.level === 'semana' && g.period === draft.weekStart).map((g) => g.title))
  let order = db.goals.reduce((m, g) => Math.max(m, g.order), -1) + 1
  for (const pick of draft.study) {
    const title = studyGoalTitle(db, pick)
    if (!title || goalTitles.has(title)) continue
    goalTitles.add(title)
    goals.push({ level: 'semana', title, category: 'estudo', period: draft.weekStart, big: false, status: 'ativa', order: order++ })
  }

  const priorities: NewItem<'priorities'>[] = []
  for (const t of draft.top3) {
    const same = db.priorities.filter((p) => p.date === t.date && p.domain === 'trabalho')
    const queued = priorities.filter((p) => p.date === t.date)
    if (same.some((p) => p.title === t.title) || queued.some((p) => p.title === t.title)) continue
    if (same.length + queued.length >= 3) continue
    priorities.push(stripUndefined({ date: t.date, domain: 'trabalho' as const, title: t.title, order: same.length + queued.length, done: false, ref: t.ref }))
  }

  const existing = db.weekPlans.find((p) => p.weekStart === draft.weekStart)
  return { workouts, goals, priorities, weekPlan: { existingId: existing?.id, weekStart: draft.weekStart } }
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

export function opsCount(ops: PlanOps): number {
  return ops.workouts.length + ops.goals.length + ops.priorities.length
}

/** "2 corridas · 2 natações · 1 recovery" for the simulated week. */
export function plannedSummaryLine(db: DB, weekStart: DateKey, planned: Workout[]): string {
  return trainingWeekSummary(weekWithPlan(db, planned), weekStart).line
}

export function confirmedPlan(db: DB, weekStart: DateKey) {
  return db.weekPlans.find((p) => p.weekStart === weekStart && !!p.confirmedAt)
}
