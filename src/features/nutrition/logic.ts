/**
 * Pure helpers for the nutrition screens. They only FIND and ARRANGE guidance that Marina or her
 * nutritionist registered (data/fuel.ts) — nothing here computes intake, calories or targets.
 */
import type { DateKey, DB, FuelPhase, NutritionDayPlan, NutritionStrategy, PlannedMeal, Workout } from '@/data/types'
import { dayPlanFor, dayTrainingContext, fuelPhases, planMealsFor, strategyFor, type DayTrainingContext } from '@/data/fuel'
import { modalityGroup } from '@/data/planning'
import { addDays, WEEKDAY_SHORT, weekDays, weekday } from '@/lib/date'
import { workoutTitle } from './format'

export type TimelineStage = FuelPhase | 'treino'

export interface FuelStage {
  phase: TimelineStage
  /** Prescribed meals for this stage (from the day plan; ONTEM = the previous day's dinner). */
  meals: PlannedMeal[]
  /** The plan the meals came from. */
  plan?: NutritionDayPlan
  /** Registered strategy text for this stage. */
  text?: string
}

export const STAGE_LABEL: Record<TimelineStage, string> = {
  ontem: 'Ontem',
  pre: 'Pré',
  treino: 'Treino',
  intra: 'Intra',
  pos: 'Pós',
}

export const DONE_LABEL: Record<FuelPhase, string> = {
  ontem: 'Ontem preparei',
  pre: 'Fiz o pré',
  intra: 'Levei intra',
  pos: 'Fiz o pós',
}

/** The previous day's dinner (or last regular meal) — what "ONTEM" means in a prescribed plan. */
export function previousDayMeals(plan: NutritionDayPlan | undefined): PlannedMeal[] {
  const regular = planMealsFor(plan, 'refeicao')
  const dinner = regular.filter((m) => /jantar/i.test(m.name))
  if (dinner.length) return dinner
  return regular.length ? [regular[regular.length - 1]] : []
}

/** ONTEM → PRÉ → TREINO → INTRA → PÓS, only the relevant stages (+ TREINO always). */
export function fuelStages(db: DB, w: Workout): FuelStage[] {
  const strategy = strategyFor(db, w)
  const plan = dayPlanFor(db, w.date)
  const phases = fuelPhases(w)
  const out: FuelStage[] = []
  for (const p of phases) {
    if (p === 'ontem') {
      const prev = dayPlanFor(db, addDays(w.date, -1))
      out.push({ phase: 'ontem', meals: previousDayMeals(prev), plan: prev, text: strategy?.previousDayInstructions })
    } else {
      if (p === 'intra' || p === 'pos') {
        if (!out.some((s) => s.phase === 'treino')) out.push({ phase: 'treino', meals: [] })
      }
      out.push({ phase: p, meals: planMealsFor(plan, p), plan, text: stageText(strategy, p) })
    }
  }
  if (!out.some((s) => s.phase === 'treino')) out.push({ phase: 'treino', meals: [] })
  return out
}

function stageText(s: NutritionStrategy | undefined, p: FuelPhase): string | undefined {
  if (!s) return undefined
  const t = { ontem: s.previousDayInstructions, pre: s.preWorkoutInstructions, intra: s.duringWorkoutInstructions, pos: s.postWorkoutInstructions }[p]
  return t?.trim() || undefined
}

export function hasGuidance(stages: FuelStage[]): boolean {
  return stages.some((s) => s.meals.length > 0 || !!s.text)
}

export function toggleFuelDone(done: FuelPhase[] | undefined, phase: FuelPhase): FuelPhase[] {
  const cur = done ?? []
  return cur.includes(phase) ? cur.filter((p) => p !== phase) : [...cur, phase]
}

// ─── Week view ──────────────────────────────────────────────────────────────

export interface WeekRow {
  date: DateKey
  short: string
  label: string
  key: boolean
  prepLabel?: string
  ctx: DayTrainingContext
  plan?: NutritionDayPlan
}

const PREP_NOUN: Record<string, string> = { corrida: 'corrida', bike: 'pedal', natacao: 'natação' }

/** "QUA 🔥 Perna — key session", "QUI Natação + PREP corrida" — generic, from the trainings. */
export function weekRows(db: DB, anyDay: DateKey): WeekRow[] {
  return weekDays(anyDay).map((date) => {
    const ctx = dayTrainingContext(db, date)
    const main = ctx.workouts.filter((w) => w.loadCategory !== 'leve')
    const shown = main.length ? main : ctx.workouts
    const titles = [...new Set(shown.map((w) => workoutTitle(db.profile, w)))]
    const prepLabel = ctx.prepFor ? `PREP ${PREP_NOUN[modalityGroup(db.profile, ctx.prepFor.modality)] ?? workoutTitle(db.profile, ctx.prepFor).toLowerCase()}` : undefined
    const label = [...titles, ...(prepLabel ? [prepLabel] : [])].join(' + ')
    return { date, short: WEEKDAY_SHORT[weekday(date)], label, key: !!ctx.key, prepLabel, ctx, plan: dayPlanFor(db, date) }
  })
}
