/** Corpo — writes that combine several store actions. */
import { actions, getDB } from '@/data/store'
import type { DailyCheckIn, DateKey, FoodTag, ID, Workout, WorkoutGoal } from '@/data/types'
import type { Conflict, WindowSuggestion } from '@/data/planning'
import { toast } from '@/app/ui-store'
import { haptic } from '@/lib/haptics'
import { relativeDay } from '@/lib/date'
import { materializeWeek, openMoveConflicts, templateItem, workoutFromChoice, workoutFromSuggestion } from './planner'
import { EMPTY_HABITS, copyWeekPlan, habitsWithTags, movePatch } from './selectors'

type CheckinPatch = Partial<Omit<DailyCheckIn, 'id' | 'createdAt' | 'updatedAt' | 'date'>>

/** Update the day's check-in, creating the record when it doesn't exist yet. */
export function upsertCheckin(date: DateKey, patch: CheckinPatch): void {
  const existing = getDB().checkins.find((c) => c.date === date)
  if (existing) actions.update('checkins', existing.id, patch)
  else actions.create('checkins', { date, habits: { ...EMPTY_HABITS }, ...patch })
}

export function setHabits(date: DateKey, patch: Partial<DailyCheckIn['habits']>): void {
  const existing = getDB().checkins.find((c) => c.date === date)
  upsertCheckin(date, { habits: { ...EMPTY_HABITS, ...(existing?.habits ?? {}), ...patch } })
}

/** Ticking food tags on a meal also ticks the matching habits of that day. */
export function applyMealTags(date: DateKey, tags: FoodTag[], planned = false): void {
  if (!tags.length && !planned) return
  const existing = getDB().checkins.find((c) => c.date === date)
  const habits = habitsWithTags(existing?.habits, tags)
  if (planned) habits.refeicoesPlanejadas = true
  upsertCheckin(date, { habits })
}

export function moveWorkout(id: string, toDate: DateKey): boolean {
  const patch = movePatch(getDB(), id, toDate)
  if (!patch) return false
  actions.update('workouts', id, patch)
  haptic('light')
  return true
}

/** "Repetir semana passada": copies last week's plan into `weekStart` as planned, with undo. */
export function repeatLastWeek(weekStart: DateKey): number {
  const items = copyWeekPlan(getDB(), weekStart)
  if (!items.length) {
    toast('Nada novo pra copiar — essa semana já tem esse plano 🙂')
    return 0
  }
  const created = actions.createMany('workouts', items)
  haptic('success')
  toast(`${created.length} ${created.length === 1 ? 'atividade copiada' : 'atividades copiadas'} como planejadas ✨`, {
    action: { label: 'Desfazer', run: () => created.forEach((w) => actions.remove('workouts', w.id)) },
  })
  return created.length
}

// ─── Planner ────────────────────────────────────────────────────────────────

/** Move + return the conflicts it created (never blocks: the move always happens). Null = nothing moved. */
export function moveWorkoutChecked(id: string, toDate: DateKey): Conflict[] | null {
  if (!moveWorkout(id, toDate)) return null
  return openMoveConflicts(getDB(), id, toDate)
}

/** "QUI · bike ou corrida?" → creates the workout (flexível). `modality` undefined = descanso. */
export function pickTemplateChoice(templateId: ID, date: DateKey, modality?: string): Workout | null {
  const db = getDB()
  const t = templateItem(db, templateId)
  if (!t) return null
  const w = actions.create('workouts', workoutFromChoice(db, t, date, modality))
  haptic('light')
  return w
}

/** Creates the fixed + rest lines of the template for the week, from today on. */
export function bringWeekBase(weekStart: DateKey, today: DateKey): number {
  const items = materializeWeek(getDB(), weekStart, today)
  if (!items.length) return 0
  const created = actions.createMany('workouts', items)
  haptic('success')
  toast('Base da semana no lugar ✨', {
    action: { label: 'Desfazer', run: () => created.forEach((w) => actions.remove('workouts', w.id)) },
  })
  return created.length
}

export function fitGoalAt(goal: WorkoutGoal, s: WindowSuggestion): Workout {
  const w = actions.create('workouts', workoutFromSuggestion(getDB(), goal, s))
  haptic('success')
  toast(`Encaixado: ${relativeDay(s.date)} ${s.start} ✨`, { action: { label: 'Desfazer', run: () => actions.remove('workouts', w.id) } })
  return w
}

/** Move an existing workout to a suggested window (date + time). */
export function moveToWindow(id: string, s: WindowSuggestion): void {
  const w = getDB().workouts.find((x) => x.id === id)
  if (!w) return
  const prev = { date: w.date, time: w.time, period: w.period }
  actions.update('workouts', id, { date: s.date, time: s.start, period: undefined })
  haptic('light')
  toast(`Levado pra ${relativeDay(s.date)} ${s.start} ✓`, { action: { label: 'Desfazer', run: () => actions.update('workouts', id, prev) } })
}
