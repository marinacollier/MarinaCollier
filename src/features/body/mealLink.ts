/** Meals ↔ trainings: which training a meal relates to, and a suggested purpose (always editable). */
import type { DateKey, DB, MealPurpose, MealSlot, Workout } from '@/data/types'
import { modalityGroup } from '@/data/planning'
import { workoutsOnDay } from '@/data/fuel'
import { addDays, hmToMinutes } from '@/lib/date'

export const MEAL_PURPOSE_LABEL: Record<MealPurpose, string> = {
  geral: 'geral',
  pre_treino: 'pré-treino',
  intra_treino: 'intra-treino',
  pos_treino: 'pós-treino',
  recovery: 'recuperação',
  pre_long_run: 'pré corrida longa',
  post_long_run: 'pós corrida longa',
  pre_long_ride: 'pré pedal longo',
  post_long_ride: 'pós pedal longo',
  prep_dia_anterior: 'prep do dia anterior',
}

/** Approximate time of a meal slot, used when the meal has no time. */
export const SLOT_MINUTES: Record<MealSlot, number> = {
  cafe: 8 * 60,
  lanche_manha: 10 * 60,
  almoco: 12 * 60 + 30,
  lanche_tarde: 16 * 60,
  jantar: 20 * 60,
  extra: 15 * 60,
}

function longKind(db: DB, w: Workout): 'run' | 'ride' | undefined {
  const long = w.isLongSession || w.tags?.some((t) => t === 'long-run' || t === 'long-ride' || t === 'long-session')
  if (!long) return undefined
  const g = modalityGroup(db.profile, w.modality)
  return g === 'bike' ? 'ride' : g === 'corrida' ? 'run' : undefined
}

export interface MealLinkSuggestion {
  workout: Workout
  purpose: MealPurpose
}

/**
 * Nearest training to a meal: a timed training the same day (before → pré, after → pós),
 * or, for a dinner/late meal, tomorrow's training that needs prep the day before.
 */
export function suggestMealLink(db: DB, date: DateKey, minutes: number): MealLinkSuggestion | undefined {
  const today = workoutsOnDay(db, date).filter((w) => w.time)
  let best: { w: Workout; dist: number; before: boolean } | undefined
  for (const w of today) {
    const start = hmToMinutes(w.time!)
    const end = start + (w.durationMin ?? w.plannedDurationMin ?? 60)
    const before = minutes <= start
    const dist = before ? start - minutes : Math.max(0, minutes - end)
    if (dist <= 4 * 60 && (!best || dist < best.dist)) best = { w, dist, before }
  }
  if (best) {
    const long = longKind(db, best.w)
    const purpose: MealPurpose = best.before
      ? long === 'run'
        ? 'pre_long_run'
        : long === 'ride'
          ? 'pre_long_ride'
          : 'pre_treino'
      : long === 'run'
        ? 'post_long_run'
        : long === 'ride'
          ? 'post_long_ride'
          : 'pos_treino'
    return { workout: best.w, purpose }
  }
  if (minutes >= 17 * 60) {
    const next = workoutsOnDay(db, addDays(date, 1)).find((w) => w.requiresPreviousDayPrep)
    if (next) {
      const long = longKind(db, next)
      return { workout: next, purpose: long === 'run' ? 'pre_long_run' : long === 'ride' ? 'pre_long_ride' : 'prep_dia_anterior' }
    }
  }
  return undefined
}
