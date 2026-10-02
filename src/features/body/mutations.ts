/** Corpo — writes that combine several store actions. */
import { actions, getDB } from '@/data/store'
import type { DailyCheckIn, DateKey, FoodTag } from '@/data/types'
import { toast } from '@/app/ui-store'
import { haptic } from '@/lib/haptics'
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
