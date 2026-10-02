import type { FeatureSeed } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { NewItem, Priority, Project, Tone } from '@/data/types'

/**
 * Work OS seed: Marina's real professional fronts. No invented deadlines, deliveries, wins or inbox items.
 * Example tasks use status 'review' — they are prompts to confirm, not facts.
 */
export const seedWork: FeatureSeed = (ctx) => {
  const project = (
    id: string,
    name: string,
    emoji: string,
    tone: Tone,
    priority: Priority,
    order: number,
    extra: Partial<NewItem<'projects'>> = {},
  ): Project =>
    ctx.make('projects', {
      id,
      name,
      emoji,
      tone,
      priority,
      status: 'ativo',
      nextAction: 'Definir próxima ação',
      links: [],
      files: [],
      people: [],
      decisions: [],
      changelog: [],
      kind: 'default',
      order,
      ...extra,
    })

  const projects = [
    project(SEED_IDS.projSantander, 'Santander', '🏦', 'accent', 'alta', 0, { role: 'Produto / IA' }),
    project(SEED_IDS.projFashionFinder, 'FashionFinder', '👗', 'plum', 'alta', 1, {
      role: 'Produto + Tecnologia · CTPO',
    }),
    project(SEED_IDS.projDayOne, 'Day One AI', '🌅', 'ocean', 'media', 2),
    project(SEED_IDS.projYoga, 'Yoga App', '🧘‍♀️', 'sage', 'media', 3),
    project(SEED_IDS.projUGC, 'UGC / Conteúdo / Parcerias', '🎬', 'sand', 'media', 4, {
      kind: 'creator',
      description: 'Conteúdo, UGC e parcerias com marcas.',
    }),
  ]

  let order = 0
  const review = (title: string, projectId: string) =>
    ctx.make('tasks', {
      title,
      status: 'review',
      context: 'trabalho',
      area: 'profissional',
      projectId,
      bucket: 'semana',
      order: order++,
    })

  const tasks = [
    review('Revisar prioridades atuais', SEED_IDS.projSantander),
    review('Definir próxima entrega', SEED_IDS.projSantander),
    review('Revisar prioridades atuais', SEED_IDS.projFashionFinder),
    review('Definir próxima entrega', SEED_IDS.projFashionFinder),
    review('Definir próxima entrega', SEED_IDS.projDayOne),
    review('Definir próxima entrega', SEED_IDS.projYoga),
    review('Revisar parcerias em andamento', SEED_IDS.projUGC),
    ctx.make('tasks', {
      title: 'Weekly CEO Review',
      status: 'todo',
      context: 'trabalho',
      area: 'profissional',
      time: '09:00',
      recurrence: { kind: 'weekly', weekdays: [6] },
      order: order++,
    }),
    ctx.make('tasks', {
      title: 'Monthly Board',
      status: 'todo',
      context: 'trabalho',
      area: 'profissional',
      time: '20:00',
      recurrence: { kind: 'monthly', dayOfMonth: 'last' },
      order: order++,
    }),
  ]

  return { projects, tasks }
}
