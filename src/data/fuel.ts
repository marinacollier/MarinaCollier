/**
 * Training ↔ nutrition context. Pure functions of the DB.
 *
 * - The context belongs to the TRAINING, not to the weekday: move the long run from Friday to
 *   Saturday and Saturday becomes the key run day, Friday becomes the prep day — automatically.
 * - The app never prescribes: it only finds the guidance Marina or her nutritionist registered
 *   (NutritionStrategy / NutritionDayPlan) and shows it at the right moment.
 */
import type {
  DateKey,
  DB,
  FuelPhase,
  NutritionDayPlan,
  NutritionDayType,
  NutritionStrategy,
  PlannedMeal,
  Workout,
} from './types'
import { addDays, weekday, weekDays } from '@/lib/date'
import { modalityGroup } from './planning'

const ACTIVE = (w: Workout) => w.status !== 'pulado' && w.status !== 'descanso'

export function workoutsOnDay(db: DB, date: DateKey): Workout[] {
  return db.workouts
    .filter((w) => w.date === date && ACTIVE(w))
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order)
}

/**
 * Trainings that shape a day's context. When the day has no workout records at all (not planned yet,
 * or a past day of the week that was never materialized), the weekly template's FIXED lines stand in,
 * so "QUA 🔥 Pernas" still reads right. Real records always win, including rest days.
 */
export function contextWorkouts(db: DB, date: DateKey): Workout[] {
  if (db.workouts.some((w) => w.date === date)) return workoutsOnDay(db, date)
  // A template line already materialized somewhere this week (e.g. the long run moved to Saturday)
  // belongs to that workout now — it must not reappear on its original weekday.
  const week = new Set(weekDays(date))
  const used = new Set(db.workouts.filter((w) => w.templateId && week.has(w.date)).map((w) => w.templateId))
  return db.weekTemplate
    .filter((t) => t.active && t.choice === 'fixed' && t.weekday === weekday(date) && t.modalities[0] && !used.has(t.id))
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order)
    .map((t) => ({
      id: `template:${t.id}:${date}`,
      createdAt: '',
      updatedAt: '',
      date,
      modality: t.modalities[0],
      status: 'planejado' as const,
      title: t.title,
      time: t.time,
      period: t.period,
      plannedDurationMin: t.durationMin,
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
      templateId: t.id,
      order: t.order,
    }))
}

function isLong(w: Workout): boolean {
  return !!w.isLongSession || !!w.tags?.some((t) => t === 'long-run' || t === 'long-ride' || t === 'long-session')
}

export interface DayTrainingContext {
  date: DateKey
  workouts: Workout[]
  /** First key session of the day, if any. */
  key?: Workout
  /** A next-day training that needs preparation the day before (makes today a PREP day). */
  prepFor?: Workout
  dayType: NutritionDayType
}

export function dayTrainingContext(db: DB, date: DateKey): DayTrainingContext {
  const workouts = contextWorkouts(db, date)
  const key = workouts.find((w) => w.isKeySession)
  const prepFor = contextWorkouts(db, addDays(date, 1)).find((w) => w.requiresPreviousDayPrep)
  const group = (w: Workout) => modalityGroup(db.profile, w.modality)

  let dayType: NutritionDayType = 'descanso'
  const longRide = workouts.find((w) => isLong(w) && group(w) === 'bike')
  const longRun = workouts.find((w) => isLong(w) && group(w) === 'corrida')
  if (longRide) dayType = 'pedal_longo'
  else if (longRun) dayType = 'corrida_longa'
  else if (prepFor) dayType = 'prep_longo'
  else if (workouts.some((w) => w.isKeySession && group(w) === 'forca')) dayType = 'forca_pesada'
  else if (workouts.some((w) => w.loadCategory === 'key' || w.loadCategory === 'moderada')) dayType = 'moderado'
  else if (workouts.length) dayType = 'leve'
  return { date, workouts, key, prepFor, dayType }
}

/** The prescribed day plan for a date: same day type, preferring the weekday it was written for. */
export function dayPlanFor(db: DB, date: DateKey): NutritionDayPlan | undefined {
  const { dayType } = dayTrainingContext(db, date)
  const wd = weekday(date)
  const candidates = db.nutritionDayPlans.filter((p) => p.active && p.dayType === dayType)
  return candidates.find((p) => p.weekdays.includes(wd)) ?? candidates[0]
}

/** Strategy for a training: explicit id, else the first strategy whose linked types match its tags/sessionType/modality. */
export function strategyFor(db: DB, w: Workout): NutritionStrategy | undefined {
  if (w.nutritionStrategyId) {
    const s = db.nutritionStrategies.find((x) => x.id === w.nutritionStrategyId)
    if (s) return s
  }
  const keys = new Set([...(w.tags ?? []), w.sessionType, w.modality].filter(Boolean) as string[])
  return db.nutritionStrategies.find((s) => s.linkedWorkoutTypes.some((t) => keys.has(t)))
}

/** Which fuel stages matter for this training (ONTEM → PRÉ → TREINO → INTRA → PÓS). */
export function fuelPhases(w: Workout): FuelPhase[] {
  const flagged = w.requiresPreviousDayPrep || w.requiresPreWorkout || w.requiresIntraWorkout || w.requiresPostWorkout
  if (!flagged) return ['pre', 'pos']
  const out: FuelPhase[] = []
  if (w.requiresPreviousDayPrep) out.push('ontem')
  if (w.requiresPreWorkout) out.push('pre')
  if (w.requiresIntraWorkout) out.push('intra')
  if (w.requiresPostWorkout) out.push('pos')
  return out
}

export const FUEL_LABEL: Record<FuelPhase, string> = {
  ontem: 'Ontem',
  pre: 'Pré',
  intra: 'Intra',
  pos: 'Pós',
}

/** Registered text for one stage, from the strategy (if any). */
export function strategyText(s: NutritionStrategy | undefined, phase: FuelPhase): string | undefined {
  if (!s) return undefined
  return {
    ontem: s.previousDayInstructions,
    pre: s.preWorkoutInstructions,
    intra: s.duringWorkoutInstructions,
    pos: s.postWorkoutInstructions,
  }[phase]
}

/** Prescribed meals of a day plan for a stage (pre/intra/pos), e.g. "05:00 · Pré-treino". */
export function planMealsFor(plan: NutritionDayPlan | undefined, phase: FuelPhase | 'refeicao'): PlannedMeal[] {
  return plan?.meals.filter((m) => m.phase === phase) ?? []
}

/** Evening card: a key session tomorrow that deserves a look at its strategy tonight. */
export function keySessionTomorrow(db: DB, today: DateKey): Workout | undefined {
  return workoutsOnDay(db, addDays(today, 1)).find((w) => w.isKeySession || w.requiresPreviousDayPrep)
}

/** Early training today (before 07:30) — the morning routine should reorganize around it. */
export function earlyTrainingToday(db: DB, today: DateKey, before = '07:30'): Workout | undefined {
  return workoutsOnDay(db, today).find((w) => !!w.time && w.time < before)
}

/**
 * "A duração mudou bastante. Quer revisar a estratégia?" — only when a strategy exists and the
 * planned duration grew/shrank ≥ 50% or ≥ 60 min since it was last reviewed. Never computes intake.
 */
export function durationReviewSuggested(db: DB, w: Workout): boolean {
  if (!strategyFor(db, w) || w.strategyReviewedAtMin == null || w.plannedDurationMin == null) return false
  const base = w.strategyReviewedAtMin
  const diff = Math.abs(w.plannedDurationMin - base)
  return diff >= 60 || (base > 0 && diff / base >= 0.5)
}

export const DAY_TYPE_LABEL: Record<NutritionDayType, string> = {
  descanso: 'Descanso',
  leve: 'Treino leve',
  moderado: 'Treino moderado',
  forca_pesada: 'Força pesada',
  corrida_longa: 'Corrida longa',
  pedal_longo: 'Pedal longo',
  prep_longo: 'Preparação pra treino longo',
}
