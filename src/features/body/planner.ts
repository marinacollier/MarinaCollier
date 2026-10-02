/**
 * Corpo — week planner logic on top of data/planning.ts (pure, testable).
 * Never blocks, never deletes: it only describes choices, conflicts and suggestions.
 */
import type { DateKey, DB, ID, NewItem, PlanType, TrainingGroup, WeekTemplateItem, Workout, WorkoutGoal } from '@/data/types'
import {
  checkWorkoutMove,
  conflictsOn,
  findModality,
  GROUP_LABEL,
  GROUP_ORDER,
  proposeWeekFromTemplate,
  suggestWindows,
  trainingWeekSummary,
  type Conflict,
  type TemplateProposal,
  type WindowSuggestion,
} from '@/data/planning'
import { addDays, startOfWeek, WEEKDAY_LONG, WEEKDAY_SHORT, weekday } from '@/lib/date'

export const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  fixo: 'FIXO',
  base: 'BASE',
  flexivel: 'FLEXÍVEL',
  a_confirmar: 'A CONFIRMAR',
}

export const PLAN_TYPES: PlanType[] = ['fixo', 'base', 'flexivel', 'a_confirmar']

export const CHOICE_LABEL: Record<WeekTemplateItem['choice'], string> = {
  fixed: 'fixo no dia',
  one_of: 'escolher um',
  optional: 'opcional',
  rest: 'descanso',
}

export const GROUP_EMOJI: Record<TrainingGroup, string> = {
  corrida: '🏃‍♀️',
  natacao: '🏊‍♀️',
  bike: '🚴‍♀️',
  forca: '🏋️‍♀️',
  mobilidade: '🧘‍♀️',
  fun: '🎪',
  off: '😴',
}

// ─── "Meu treino da semana" ─────────────────────────────────────────────────

export interface SummaryChip {
  group: TrainingGroup
  label: string
  emoji: string
  count: number
  done: number
}

/** Chips for every group (zeros included, shown muted) + "Esta semana: …" line. Information only. */
export function weekTrainingChips(db: DB, weekStart: DateKey): { chips: SummaryChip[]; line: string } {
  const s = trainingWeekSummary(db, weekStart)
  return {
    chips: GROUP_ORDER.map((g) => ({ group: g, label: GROUP_LABEL[g], emoji: GROUP_EMOJI[g], count: s.counts[g], done: s.done[g] })),
    line: s.line ? `Esta semana: ${s.line}` : '',
  }
}

// ─── Template on the planner ────────────────────────────────────────────────

/**
 * Template lines still open for each day of the week, never on past days.
 * Fixed/rest lines show as "ghost" suggestions; one_of/optional lines as choices.
 */
export function openProposals(db: DB, weekStart: DateKey, today: DateKey): Record<DateKey, TemplateProposal[]> {
  const out: Record<DateKey, TemplateProposal[]> = {}
  for (let i = 0; i < 7; i++) out[addDays(weekStart, i)] = []
  for (const p of proposeWeekFromTemplate(db, weekStart)) {
    if (p.date < today) continue
    // A one_of already answered by a workout of one of its modalities that day doesn't ask again.
    if (p.choice === 'one_of' && db.workouts.some((w) => w.date === p.date && w.status !== 'pulado' && p.options?.includes(w.modality))) continue
    out[p.date]?.push(p)
  }
  return out
}

export function templateItem(db: DB, id: ID): WeekTemplateItem | undefined {
  return db.weekTemplate.find((t) => t.id === id)
}

/** Workout payload for "I pick this option" on a template line. `modality = undefined` → rest. */
export function workoutFromChoice(db: DB, t: WeekTemplateItem, date: DateKey, modality?: string): NewItem<'workouts'> {
  const order = db.workouts.filter((w) => w.date === date).reduce((m, w) => Math.max(m, w.order), -1) + 1
  if (!modality) {
    return { date, modality: 'recuperacao', status: 'descanso', title: t.choice === 'rest' ? t.title : undefined, planType: t.planType, templateId: t.id, order }
  }
  return {
    date,
    modality,
    status: 'planejado',
    time: t.time,
    period: t.time ? undefined : t.period,
    plannedDurationMin: t.durationMin,
    planType: t.choice === 'fixed' || t.choice === 'rest' ? t.planType : 'flexivel',
    templateId: t.id,
    notes: t.choice === 'fixed' ? t.notes : undefined,
    order,
  }
}

/** Fixed + rest lines of the week from `today` on, ready to create ("Trazer a base da semana"). */
export function materializeWeek(db: DB, weekStart: DateKey, today: DateKey): NewItem<'workouts'>[] {
  return proposeWeekFromTemplate(db, weekStart)
    .filter((p) => p.workout && p.date >= today)
    .map((p) => p.workout!)
}

// ─── Conflicts ──────────────────────────────────────────────────────────────

export const DRAFT_ID = '__draft__'

/**
 * Conflicts a workout *draft* would have (new or edited, any modality/date/time).
 * Local twin of checkWorkoutMove that also works for workouts not saved yet.
 */
export function draftConflicts(db: DB, draft: Partial<Workout> & { date: DateKey; modality: string }, existingId?: ID): Conflict[] {
  const id = existingId ?? DRAFT_ID
  const w: Workout = { order: 0, status: 'planejado', createdAt: '', updatedAt: '', ...draft, id } as Workout
  if (w.status === 'descanso' || w.status === 'pulado') return []
  const workouts = [...db.workouts.filter((x) => x.id !== id), w]
  return conflictsOn(db, w.date, { workouts, includeAcknowledged: true }).filter((c) => c.refs.some((r) => r.id === id))
}

/** Conflicts after a move that Marina hasn't answered yet. */
export function openMoveConflicts(db: DB, workoutId: ID, date: DateKey): Conflict[] {
  const acked = new Set(db.conflictAcks.map((a) => a.key))
  return checkWorkoutMove(db, workoutId, date).filter((c) => !acked.has(c.key))
}

export function conflictsByDay(list: Conflict[]): Record<DateKey, Conflict[]> {
  const out: Record<DateKey, Conflict[]> = {}
  for (const c of list) (out[c.date] ??= []).push(c)
  return out
}

// ─── Flexible goals (yoga 1x/semana…) ───────────────────────────────────────

/** Goals the planner tries to fit in a week: active, weekly intent, a modality, and an obligation (circo is never one). */
export function flexibleGoals(db: DB): WorkoutGoal[] {
  return db.workoutGoals.filter((g) => g.status === 'ativa' && g.modality && (g.perWeek ?? 0) > 0 && g.obligation !== false)
}

function goalMatches(g: WorkoutGoal, w: Workout): boolean {
  return w.workoutGoalId === g.id || w.modality === g.modality
}

/** Sessions of the goal in the week (planned or done, not skipped). */
export function goalWeekCount(db: DB, g: WorkoutGoal, weekStart: DateKey): number {
  const end = addDays(weekStart, 6)
  return db.workouts.filter((w) => w.date >= weekStart && w.date <= end && w.status !== 'pulado' && w.status !== 'descanso' && goalMatches(g, w)).length
}

export interface GoalNudge {
  goal: WorkoutGoal
  missing: number
  /** True when the goal had its place this week and lost it (moved, skipped, deleted). */
  left: boolean
  suggestions: WindowSuggestion[]
}

/** Suggested windows for a goal in the week of `from` (respects check-in limits, presencial days and the calendar). */
export function goalSuggestions(db: DB, g: WorkoutGoal, from: DateKey, limit = 3): WindowSuggestion[] {
  if (!g.modality) return []
  return suggestWindows(db, { modality: g.modality, from, durationMin: 60, dayStart: '07:00', preferredWeekdays: g.preferredWeekdays, limit })
}

/**
 * Flexible goals still without a place in the week. `before` (the db before the last change) lets the
 * copy say "saiu da semana" instead of just "ainda sem lugar". Skipped sessions also count as "left".
 */
export function goalNudges(db: DB, weekStart: DateKey, today: DateKey, before?: DB | Set<ID>): GoalNudge[] {
  const end = addDays(weekStart, 6)
  if (end < today) return []
  const from = weekStart < today ? today : weekStart
  const out: GoalNudge[] = []
  for (const g of flexibleGoals(db)) {
    const want = g.perWeek ?? 1
    const count = goalWeekCount(db, g, weekStart)
    if (count >= want) continue
    const hadBefore = before instanceof Set ? before.has(g.id) : before ? goalWeekCount(before, g, weekStart) >= want : false
    const skipped = db.workouts.some((w) => w.date >= weekStart && w.date <= end && w.status === 'pulado' && goalMatches(g, w))
    out.push({ goal: g, missing: want - count, left: hadBefore || skipped, suggestions: goalSuggestions(db, g, from) })
  }
  return out
}

/** Flexible goals that had their place in the week before a change and lost it after. */
export function goalsThatLeft(before: DB, after: DB, weekStart: DateKey): ID[] {
  return flexibleGoals(after)
    .filter((g) => {
      const want = g.perWeek ?? 1
      return goalWeekCount(before, g, weekStart) >= want && goalWeekCount(after, g, weekStart) < want
    })
    .map((g) => g.id)
}

export function dayLabel(date: DateKey): string {
  return WEEKDAY_LONG[weekday(date)].toLowerCase()
}

/** "A yoga saiu da semana — quer encaixar sábado 08:00?" */
export function nudgeMessage(db: DB, n: GoalNudge): string {
  const name = (findModality(db.profile, n.goal.modality!)?.label ?? n.goal.title).toLowerCase()
  const s = n.suggestions[0]
  const where = s ? ` — quer encaixar ${dayLabel(s.date)} ${s.start}?` : '.'
  return n.left ? `A ${name} saiu da semana${where}` : `${capitalize(name)} ainda sem lugar nesta semana${where}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function workoutFromSuggestion(db: DB, g: WorkoutGoal, s: WindowSuggestion): NewItem<'workouts'> {
  const order = db.workouts.filter((w) => w.date === s.date).reduce((m, w) => Math.max(m, w.order), -1) + 1
  return {
    date: s.date,
    time: s.start,
    modality: g.modality!,
    status: 'planejado',
    plannedDurationMin: 60,
    planType: 'flexivel',
    workoutGoalId: g.id,
    order,
  }
}

/**
 * When a conflict involves a flexible workout (planType flexível or part of a weekly goal),
 * suggest another window for it in the same week — computed as if it weren't there.
 */
export function relocateSuggestion(db: DB, workoutId: ID, today: DateKey): WindowSuggestion | undefined {
  const w = db.workouts.find((x) => x.id === workoutId)
  if (!w || w.status !== 'planejado') return undefined
  const goal = db.workoutGoals.find((g) => g.id === w.workoutGoalId) ?? flexibleGoals(db).find((g) => g.modality === w.modality)
  if (w.planType !== 'flexivel' && !goal) return undefined
  const without: DB = { ...db, workouts: db.workouts.filter((x) => x.id !== workoutId) }
  const ws = startOfWeek(w.date)
  const from = ws < today ? today : ws
  return suggestWindows(without, {
    modality: w.modality,
    from,
    durationMin: w.plannedDurationMin ?? 60,
    dayStart: '07:00',
    preferredWeekdays: goal?.preferredWeekdays,
    limit: 5,
  }).find((s) => s.date !== w.date)
}

export function shortDay(date: DateKey): string {
  return WEEKDAY_SHORT[weekday(date)]
}
