/**
 * Corpo seed: a light, editable example plan for the current week, 3 generic favorite meals
 * and two sport goals. No check-ins, no invented race dates.
 */
import type { FeatureSeed } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import { addDays, startOfWeek } from '@/lib/date'

export const seedBody: FeatureSeed = (ctx) => {
  const ws = startOfWeek(ctx.today)
  const plan: [number, string, string | undefined, 'planejado' | 'descanso'][] = [
    [0, 'natacao', 'técnica', 'planejado'],
    [1, 'corrida', 'leve', 'planejado'],
    [2, 'musculacao', 'força geral', 'planejado'],
    [3, 'yoga', 'soltar o corpo', 'planejado'],
    [5, 'gravel', 'passeio longo, sem pressa', 'planejado'],
    [6, 'recuperacao', undefined, 'descanso'],
  ]
  const workouts = plan.map(([offset, modality, goal, status]) =>
    ctx.make('workouts', { date: addDays(ws, offset), modality, goal, status, order: 0 }),
  )

  const mealTemplates = [
    ctx.make('mealTemplates', { name: 'Ovos + fruta', description: 'Ovos mexidos, pão e uma fruta', slot: 'cafe', tags: ['proteina', 'fruta'], order: 0 }),
    ctx.make('mealTemplates', { name: 'Prato colorido', description: 'Arroz, feijão, proteína e salada', slot: 'almoco', tags: ['proteina', 'vegetais'], order: 1 }),
    ctx.make('mealTemplates', { name: 'Iogurte com granola', description: 'Iogurte, granola e banana', slot: 'lanche_tarde', tags: ['proteina', 'fruta'], order: 2 }),
  ]

  const workoutGoals = [
    ctx.make('workoutGoals', {
      title: 'Manter rotina de força',
      kind: 'habit',
      modality: 'musculacao',
      target: 2,
      unit: 'sessoes',
      startDate: ws,
      preparation: 'Duas sessões de musculação por semana, do jeito que der.',
      milestones: [],
      status: 'ativa',
    }),
    ctx.make('workoutGoals', {
      title: 'Preparar trilhas e surf da África do Sul',
      kind: 'event',
      startDate: ctx.today,
      preparation: 'Chegar com fôlego pras trilhas e braço pro surf.',
      milestones: [
        { id: 'ms-africa-trilhas', title: 'Trilhas longas no fim de semana', done: false },
        { id: 'ms-africa-surf', title: 'Aulas de surf / condicionamento', done: false },
        { id: 'ms-africa-natacao', title: 'Natação pra ganhar confiança no mar', done: false },
      ],
      status: 'ativa',
      tripId: SEED_IDS.tripAfrica,
    }),
  ]

  return { workouts, mealTemplates, workoutGoals }
}
