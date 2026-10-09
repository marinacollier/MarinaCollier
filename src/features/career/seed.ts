import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'

/**
 * Career & Growth 2027 — only what Marina stated: the North Star and the five recurring activities.
 * No invented quarter objectives, opportunities, contacts or results. Activities are FLEXÍVEL targets;
 * the planner places sessions only in free windows (never over trainings, swimming, yoga, ceramics…).
 */
export const CAREER_SEED_IDS = {
  northStar: seedId('career', 'north-star-2027'),
  inglesExec: seedId('career', 'ingles-executivo'),
  networking: seedId('career', 'networking'),
  posts: seedId('career', 'posts'),
  lideranca: seedId('career', 'lideranca'),
  review: seedId('career', 'executive-career-review'),
}

export const seedCareer: FeatureSeed = (ctx) => ({
  goals: [
    ctx.make('goals', {
      id: CAREER_SEED_IDS.northStar,
      level: 'maior',
      title: 'Head of Product / Head of AI Products — 2027',
      category: 'profissional',
      big: true,
      status: 'ativa',
      deadline: '2027-12-31',
      notes: 'Liderança de Produto ou de Produtos de IA em empresa média/grande, Brasil ou exterior. Diretoria também é oportunidade possível.',
      order: 0,
    }),
  ],
  tasks: [
    ctx.make('tasks', { id: CAREER_SEED_IDS.inglesExec, title: 'Inglês executivo', status: 'todo', context: 'carreira', area: 'profissional', planType: 'flexivel', careerKind: 'ingles_exec', targetPerWeek: 3, goalId: CAREER_SEED_IDS.northStar, order: 900 }),
    ctx.make('tasks', { id: CAREER_SEED_IDS.networking, title: 'Networking — uma ação relevante', status: 'todo', context: 'carreira', area: 'profissional', planType: 'flexivel', careerKind: 'networking', targetPerWeek: 1, goalId: CAREER_SEED_IDS.northStar, order: 901 }),
    ctx.make('tasks', { id: CAREER_SEED_IDS.posts, title: 'Conteúdo profissional (posts)', status: 'todo', context: 'carreira', area: 'profissional', planType: 'flexivel', careerKind: 'post', targetPerWeek: 2, goalId: CAREER_SEED_IDS.northStar, order: 902 }),
    ctx.make('tasks', { id: CAREER_SEED_IDS.lideranca, title: 'Desenvolvimento de liderança', status: 'todo', context: 'carreira', area: 'profissional', planType: 'flexivel', careerKind: 'lideranca', targetMinutesPerWeek: 60, goalId: CAREER_SEED_IDS.northStar, order: 903 }),
    ctx.make('tasks', {
      id: CAREER_SEED_IDS.review,
      title: '📈 Executive Career Review',
      notes: 'Mensal. Pode acontecer junto do Monthly Board.',
      status: 'todo',
      context: 'carreira',
      area: 'profissional',
      planType: 'flexivel',
      careerKind: 'review',
      recurrence: { kind: 'monthly', dayOfMonth: 'last' },
      goalId: CAREER_SEED_IDS.northStar,
      order: 904,
    }),
  ],
})
