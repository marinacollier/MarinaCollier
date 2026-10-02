/**
 * Training-aware bits of Hoje (training/nutrition brief, "Behaviour"). Pure + tested.
 * The context belongs to the TRAINING (its flags/time), never to the weekday name.
 * Only registered guidance is shown — nothing is prescribed or calculated here.
 */
import { dayPlanFor, earlyTrainingToday, keySessionTomorrow, planMealsFor, strategyFor, strategyText } from '@/data/fuel'
import { modalityOf } from '@/data/selectors'
import { GROUP_LABEL, modalityGroup } from '@/data/planning'
import type { DateKey, DB, FuelPhase, RoutineItem, Workout } from '@/data/types'
import { hmToMinutes } from '@/lib/date'

export function durationLabel(w: Workout): string | undefined {
  const min = w.plannedDurationMin
  if (!min) return undefined
  return w.plannedDurationMaxMin && w.plannedDurationMaxMin > min ? `${min}–${w.plannedDurationMaxMin} min` : `${min} min`
}

export interface KeySessionCard {
  workout: Workout
  /** "Amanhã é dia de corrida 🏃‍♀️ · 06:00 · Long Z2 · 60–75 min" */
  line: string
}

export function keySessionCard(db: DB, today: DateKey): KeySessionCard | undefined {
  const w = keySessionTomorrow(db, today)
  if (!w) return undefined
  const m = modalityOf(db, w.modality)
  const group = modalityGroup(db.profile, w.modality)
  const kind = (group === 'fun' || group === 'off' ? m.label : GROUP_LABEL[group]).toLowerCase()
  const parts = [`Amanhã é dia de ${kind} ${m.emoji}`, w.time, w.title && w.title !== m.label ? w.title : undefined, durationLabel(w)]
  return { workout: w, line: parts.filter(Boolean).join(' · ') }
}

export interface FuelStep {
  phase: FuelPhase
  /** Registered guidance (strategy text, or the prescribed meal "05:00 · Pré-treino"). */
  detail?: string
}

/** Registered guidance for a stage: the training's strategy first, then the day's prescribed plan. */
export function fuelStep(db: DB, w: Workout, date: DateKey, phase: FuelPhase): FuelStep {
  const fromStrategy = strategyText(strategyFor(db, w), phase)
  if (fromStrategy) return { phase, detail: fromStrategy }
  const meal = planMealsFor(dayPlanFor(db, date), phase)[0]
  return { phase, detail: meal ? [meal.time, meal.name].filter(Boolean).join(' · ') : undefined }
}

export interface TrainingMorning {
  workout: Workout
  /** "Treino 06:00 · Natação" */
  title: string
  pre: FuelStep
  pos: FuelStep
  /** Routine items that belong before the training (base time earlier than it). */
  before: RoutineItem[]
  /** Everything else, after "Depois do treino". */
  after: RoutineItem[]
}

/** On an early-training morning the routine reorganizes around it. Purely presentational. */
export function trainingMorning(db: DB, date: DateKey, items: RoutineItem[]): TrainingMorning | undefined {
  const w = earlyTrainingToday(db, date)
  if (!w?.time) return undefined
  const m = modalityOf(db, w.modality)
  const start = hmToMinutes(w.time)
  const before = items.filter((i) => i.time && hmToMinutes(i.time) < start)
  const after = items.filter((i) => !before.includes(i))
  return {
    workout: w,
    title: `Treino ${w.time} · ${w.title || m.label}`,
    pre: fuelStep(db, w, date, 'pre'),
    pos: fuelStep(db, w, date, 'pos'),
    before,
    after,
  }
}
