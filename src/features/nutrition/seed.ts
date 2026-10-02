import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'
import type { NutritionDayPlan, NutritionStrategy, PlannedMeal } from '@/data/types'
import { mealToText } from './format'
import { PLAN_DOMINGO, PLAN_QUINTA, PLAN_SABADO, PLAN_SEGUNDA_E_QUARTA, PLAN_SEXTA, PLAN_TERCA } from './plans.data'

/** Who prescribed the plans (PDF header, 02/10/2026). */
export const NUTRI_SOURCE_NAME = 'João Monteiro — Clínica JMN (CRN 30844)'
export const NUTRI_PRESCRIBED_AT = '2026-10-02'

const at = (plan: PlannedMeal[], time: string, phase?: PlannedMeal['phase']): PlannedMeal => {
  const m = plan.find((x) => x.time === time && (!phase || x.phase === phase))
  if (!m) throw new Error(`seed: meal ${time} not found`)
  return m
}

/**
 * Nutrition seed — ONLY what the nutritionist prescribed (no invented guidance, no calories).
 * Day plans are the six PDFs; strategies are derived from those same plans; body composition is
 * Marina's reference (history is never a target, and no goal is created from it).
 */
export const seedNutrition: FeatureSeed = (ctx) => {
  const common = { source: 'nutricionista' as const, sourceName: NUTRI_SOURCE_NAME, prescribedAt: NUTRI_PRESCRIBED_AT, active: true }
  const plan = (slug: string, data: Pick<NutritionDayPlan, 'name' | 'dayType' | 'weekdays' | 'meals'> & { notes?: string }) =>
    ctx.make('nutritionDayPlans', { id: seedId('nutrition', `plano-${slug}`), ...common, ...data })

  const nutritionDayPlans = [
    plan('segunda', {
      name: 'Segunda',
      dayType: 'moderado',
      weekdays: [1],
      meals: PLAN_SEGUNDA_E_QUARTA,
      notes: 'Plano de segunda e quarta (mesmo plano prescrito para os dois dias).',
    }),
    plan('terca', { name: 'Terça', dayType: 'moderado', weekdays: [2], meals: PLAN_TERCA }),
    plan('quarta', {
      name: 'Quarta',
      dayType: 'forca_pesada',
      weekdays: [3],
      meals: PLAN_SEGUNDA_E_QUARTA,
      notes: 'Plano de segunda e quarta (mesmo plano prescrito para os dois dias).',
    }),
    plan('quinta', { name: 'Quinta', dayType: 'prep_longo', weekdays: [4], meals: PLAN_QUINTA }),
    plan('sexta', { name: 'Sexta', dayType: 'corrida_longa', weekdays: [5], meals: PLAN_SEXTA }),
    plan('sabado', { name: 'Sábado', dayType: 'prep_longo', weekdays: [6], meals: PLAN_SABADO }),
    plan('domingo', { name: 'Domingo', dayType: 'pedal_longo', weekdays: [0], meals: PLAN_DOMINGO }),
  ]

  const strat = (slug: string, data: Omit<NutritionStrategy, 'id' | 'createdAt' | 'updatedAt' | 'source' | 'sourceName'>) =>
    ctx.make('nutritionStrategies', { id: seedId('nutrition', `estrategia-${slug}`), source: 'nutricionista', sourceName: NUTRI_SOURCE_NAME, ...data })

  const nutritionStrategies = [
    strat('corrida-longa', {
      name: 'Corrida longa',
      linkedWorkoutTypes: ['long-run'],
      previousDayInstructions: ['Jantar do dia anterior conforme o plano de preparação (quinta)', mealToText(at(PLAN_QUINTA, '20:00'))].join('\n\n'),
      preWorkoutInstructions: mealToText(at(PLAN_SEXTA, '05:00', 'pre')),
      duringWorkoutInstructions: mealToText(at(PLAN_SEXTA, '06:40', 'intra'), { withSubstitutions: true }),
      postWorkoutInstructions: mealToText(at(PLAN_SEXTA, '08:00', 'pos')),
      timing: 'Pré 05:00 · Intra 06:40 · Pós 08:00 (plano de sexta)',
    }),
    strat('pedal-longo', {
      name: 'Pedal longo',
      linkedWorkoutTypes: ['long-ride', 'long-session'],
      previousDayInstructions: ['Jantar do dia anterior conforme o plano de preparação (sábado)', mealToText(at(PLAN_SABADO, '20:00'))].join('\n\n'),
      preWorkoutInstructions: mealToText(at(PLAN_DOMINGO, '05:00', 'pre')),
      duringWorkoutInstructions: [
        mealToText(at(PLAN_DOMINGO, '06:40', 'intra'), { withSubstitutions: true }),
        mealToText(at(PLAN_DOMINGO, '07:20', 'intra'), { withSubstitutions: true }),
      ].join('\n\n'),
      postWorkoutInstructions: mealToText(at(PLAN_DOMINGO, '08:00', 'pos')),
      timing: 'Pré 05:00 · Intra 06:40 e 07:20 · Pós 08:00 (plano de domingo)',
    }),
    strat('pernas', {
      name: 'Pernas — key session',
      linkedWorkoutTypes: ['pernas', 'leg-day'],
      preWorkoutInstructions: mealToText(at(PLAN_SEGUNDA_E_QUARTA, '05:00', 'pre')),
      postWorkoutInstructions: mealToText(at(PLAN_SEGUNDA_E_QUARTA, '08:00', 'pos')),
      timing: 'Pré 05:00 · Pós 08:00 (plano de segunda e quarta)',
    }),
  ]

  const bodyComposition = [
    ctx.make('bodyComposition', {
      id: seedId('nutrition', 'composicao-2026-10-02'),
      date: '2026-10-02',
      label: 'Referência atual',
      weightKg: 69.5,
      bodyFatPct: 21.7,
      fatMassKg: 15.1,
      skeletalMuscleKg: 30.6,
    }),
    ctx.make('bodyComposition', {
      id: seedId('nutrition', 'composicao-referencia-2022'),
      label: 'Referência 2022',
      weightKg: 65.7,
      bodyFatPct: 13.8,
      skeletalMuscleKg: 32.1,
      historical: true,
      notes: 'apenas histórico — não é meta',
    }),
  ]

  return { nutritionDayPlans, nutritionStrategies, bodyComposition }
}
