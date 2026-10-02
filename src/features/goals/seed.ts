import type { FeatureSeed } from '@/data/seed/context'
import type { Area, Goal } from '@/data/types'
import { startOfWeek } from '@/lib/date'

export const GOAL_SEED_IDS = {
  africa: 'goal-africa-pronta',
  ingles: 'goal-ingles-reunioes',
} as const

/** Editable examples: three big ones for the week, two small, two "maiores". No invented progress. */
export const seedGoals: FeatureSeed = (ctx) => {
  const week = startOfWeek(ctx.today)
  let order = 0
  const goal = (title: string, category: Area, extra: Partial<Goal> & Pick<Goal, 'level' | 'big'>) =>
    ctx.make('goals', {
      title,
      category,
      status: 'ativa',
      order: order++,
      ...extra,
    })

  return {
    goals: [
      goal('África do Sul pronta para embarcar', 'viagem', {
        id: GOAL_SEED_IDS.africa,
        level: 'maior',
        big: true,
      }),
      goal('Inglês confortável em reuniões', 'estudo', {
        id: GOAL_SEED_IDS.ingles,
        level: 'maior',
        big: true,
      }),
      goal('Treinar 4x nesta semana', 'corpo', {
        level: 'semana',
        period: week,
        big: true,
      }),
      goal('Avançar o FashionFinder', 'profissional', {
        level: 'semana',
        period: week,
        big: true,
      }),
      goal('Organizar pendências da África do Sul', 'viagem', {
        level: 'semana',
        period: week,
        big: true,
        parentId: GOAL_SEED_IDS.africa,
      }),
      goal('Estudar inglês 3x', 'estudo', {
        level: 'semana',
        period: week,
        big: false,
        parentId: GOAL_SEED_IDS.ingles,
      }),
      goal('Revisar gastos da semana', 'financeiro', {
        level: 'semana',
        period: week,
        big: false,
      }),
    ],
  }
}
