import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { CalendarEvent, NewItem, Priority, Project, Recurrence, Tone } from '@/data/types'
import { nextOccurrence } from '@/lib/recurrence'

/**
 * Work OS seed — Marina's real professional fronts (brief §19–22, reference 02/10/2026).
 * Rules: stable ids, no invented internal tasks, wins, inbox items or meeting times.
 * Executive rituals (Weekly CEO Review, Monthly Board) are FIXO recurring calendar events with a
 * checklist template — not tasks.
 */

export const WEEKLY_CEO_TEMPLATE = [
  'Principais wins',
  'O que avançou',
  'O que travou',
  'Próximos movimentos',
  'Dinheiro / renda',
  'Carreira',
  'Projetos',
  'Networking',
  'Estudo',
  'Prioridades da próxima semana',
]

export const MONTHLY_BOARD_TEMPLATE = [
  'Mês em retrospectiva',
  'Carreira',
  'Renda',
  'Projetos',
  'Desenvolvimento',
  'Corpo / energia',
  'Estudos',
  'Viagens',
  'Prioridades',
  'Decisões',
]

/** FashionFinder roadmap lanes → items (editable; status 'roadmap', no dates). */
const FF_ROADMAP: { group: string; title: string }[] = [
  { group: 'Infra / catálogo', title: 'Postgres + sync' },
  { group: 'Busca', title: 'Embeddings' },
  { group: 'Provider', title: 'Primeiro provider' },
  { group: 'Produto', title: 'Favoritos' },
  { group: 'Produto', title: 'Histórico' },
  { group: 'Painel', title: 'Painel' },
  { group: 'Ranking', title: 'Ranking' },
  { group: 'Arquitetura', title: 'Deduplicação' },
  { group: 'UX', title: 'UX' },
  { group: 'Futuro', title: 'Google Shopping' },
]

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
    project(SEED_IDS.projSantander, 'Santander', '🟥', 'accent', 'alta', 0, {
      role: 'Produto / IA',
      description: 'Principal frente profissional',
    }),
    project(SEED_IDS.projFashionFinder, 'FashionFinder', '👗', 'plum', 'alta', 1, {
      role: 'Produto + Tecnologia · CTPO',
      deadline: '2026-11-20',
      description: 'Roadmap vivo — 20/11 é o deadline de referência.',
      people: [{ name: 'Fran' }],
    }),
    project(SEED_IDS.projDayOne, 'Day One AI', '🤖', 'ocean', 'media', 2, {
      sections: ['Planner', 'Match', 'Smart Flight', 'Consultant Copilot'],
    }),
    project(SEED_IDS.projYoga, 'Yoga App', '🧘', 'sage', 'media', 3, {
      description: 'Produto/app para cliente — MVP funcional primeiro',
    }),
    project(SEED_IDS.projUGC, 'UGC / Creator', '📸', 'sand', 'media', 4, {
      kind: 'creator',
      description: 'Conteúdo, UGC e parcerias com marcas.',
      categories: ['esporte', 'corrida', 'bike', 'natação', 'yoga', 'surf', 'lifestyle', 'alimentação', 'autocuidado', 'viagem', 'rotina'],
    }),
  ]

  const milestones = FF_ROADMAP.map((m, i) =>
    ctx.make('milestones', {
      id: seedId('work', `ff-${m.group}-${m.title}`),
      projectId: SEED_IDS.projFashionFinder,
      title: m.title,
      group: m.group,
      status: 'roadmap',
      done: false,
      order: i,
    }),
  )

  let order = 0
  const focus = (projectId: string, slug: string, title: string, group?: string) =>
    ctx.make('tasks', {
      id: seedId('work', `${slug}-${title}`),
      title,
      status: 'todo',
      planType: 'flexivel',
      context: 'trabalho',
      area: 'profissional',
      projectId,
      group,
      order: order++,
    })

  const tasks = [
    focus(SEED_IDS.projDayOne, 'dayone', 'Ranking do Match', 'Match'),
    focus(SEED_IDS.projDayOne, 'dayone', 'Padronização do Planner', 'Planner'),
    focus(SEED_IDS.projDayOne, 'dayone', 'Perfil compartilhado'),
    focus(SEED_IDS.projDayOne, 'dayone', 'Evolução dos módulos'),
    focus(SEED_IDS.projDayOne, 'dayone', 'Consolidar demo funcional'),
    focus(SEED_IDS.projYoga, 'yoga', 'Fluxo principal'),
    focus(SEED_IDS.projYoga, 'yoga', 'Telas'),
    focus(SEED_IDS.projYoga, 'yoga', 'Identidade visual'),
    focus(SEED_IDS.projYoga, 'yoga', 'Figma'),
    focus(SEED_IDS.projYoga, 'yoga', 'MVP'),
  ]

  const ritual = (
    slug: string,
    title: string,
    recurrence: Recurrence,
    startTime: string,
    endTime: string,
    template: string[],
    notes: string,
  ): CalendarEvent =>
    ctx.make('events', {
      id: seedId('work', slug),
      sourceId: SEED_IDS.sourceLocal,
      title,
      date: nextOccurrence(recurrence, ctx.today) ?? ctx.today,
      startTime,
      endTime,
      allDay: false,
      kind: 'trabalho',
      category: 'Trabalho / Carreira',
      planType: 'fixo',
      recurrence,
      template,
      notes,
    })

  const events = [
    ritual(
      'weekly-ceo-review',
      'Weekly CEO Review',
      { kind: 'weekly', weekdays: [6] },
      '09:00',
      '10:00',
      WEEKLY_CEO_TEMPLATE,
      'Revisar a vida profissional e a evolução da semana.',
    ),
    ritual(
      'monthly-board-meeting',
      'Monthly Board Meeting',
      { kind: 'monthly', dayOfMonth: 'last' },
      '20:00',
      '21:00',
      MONTHLY_BOARD_TEMPLATE,
      'Último dia do mês: olhar o mês inteiro com calma.',
    ),
  ]

  return { projects, milestones, tasks, events }
}
