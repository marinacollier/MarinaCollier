import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'

export const GOAL_SEED_IDS = {
  /** Kept from the first seed so existing installs don't get a duplicate. */
  africa: 'goal-africa-pronta',
  fashionFinder: seedId('goals', 'fashionfinder-roadmap'),
  yoga: seedId('goals', 'yoga-na-rotina'),
} as const

/**
 * Marina's long-term goals, grounded in her brief. No weekly goals: she builds the week in
 * "Montar minha semana". No invented progress.
 * (Goal has no planType field yet — see contract request in the report.)
 */
export const seedGoals: FeatureSeed = (ctx) => ({
  goals: [
    ctx.make('goals', {
      id: GOAL_SEED_IDS.africa,
      level: 'maior',
      title: 'South Africa 2026 pronta pra embarcar',
      category: 'viagem',
      deadline: '2026-10-24',
      big: true,
      status: 'ativa',
      order: 0,
    }),
    ctx.make('goals', {
      id: GOAL_SEED_IDS.fashionFinder,
      level: 'maior',
      title: 'FashionFinder — roadmap até 20/11',
      category: 'profissional',
      deadline: '2026-11-20',
      big: true,
      status: 'ativa',
      order: 1,
    }),
    ctx.make('goals', {
      id: GOAL_SEED_IDS.yoga,
      level: 'maior',
      title: 'Manter yoga na rotina',
      category: 'corpo',
      big: true,
      status: 'ativa',
      notes: 'Sem dia fixo — o planejamento sugere uma janela livre na semana.',
      order: 2,
    }),
  ],
})
