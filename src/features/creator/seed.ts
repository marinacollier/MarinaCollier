import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'

/**
 * Creator seed (brief §22, 23, 28). Only what Marina gave:
 * - Breevo as a partnership in 'contato' + a "revisar hoje" task (never late, no values invented);
 * - the possible South Africa series as a creator project with an idea bank (§28).
 * No generic everyday ideas: her own ideas arrive through Lumos ("ideia de reels na bike").
 */
export const AFRICA_SERIES_CATEGORIES = [
  'viagem solo',
  'estudo',
  'Cape Town',
  'surf',
  'gravel',
  'corrida',
  'trail',
  'safari',
  'rotina',
  'comida',
  'vida real',
]

export const seedCreator: FeatureSeed = (ctx) => {
  const seriesId = seedId('creator', 'serie-africa-do-sul')
  const breevoId = seedId('creator', 'breevo')

  const projects = [
    ctx.make('projects', {
      id: seriesId,
      name: 'Um mês sozinha na África do Sul',
      emoji: '🇿🇦',
      tone: 'ocean',
      status: 'planejando',
      priority: 'media',
      description: 'Possível série/vlog — sem vídeo diário obrigatório',
      links: [],
      files: [],
      people: [],
      decisions: [],
      changelog: [],
      kind: 'creator',
      order: 5,
      tripId: SEED_IDS.tripAfrica,
      categories: AFRICA_SERIES_CATEGORIES,
    }),
  ]

  const africaIdeas: [string, string][] = [
    ['Primeiro dia em Cape Town', 'Cape Town'],
    ['Rotina de estudos no intercâmbio', 'estudo'],
    ['Surf: primeira aula', 'surf'],
    ['Gravel pelas vinícolas', 'gravel'],
    ['Corrida/trail na Table Mountain (a confirmar rota)', 'trail'],
    ['Safari: bastidores', 'safari'],
    ['O que comi na semana', 'comida'],
    ['Vida real: dias sem roteiro', 'vida real'],
  ]
  let order = 0
  const contentItems = [
    ...africaIdeas.map(([title, category]) =>
      ctx.make('contentItems', { id: seedId('creator', `africa-${title}`), title, category, stage: 'ideia', projectId: seriesId, links: [], order: order++ }),
    ),
  ]

  const partnerships = [
    ctx.make('partnerships', {
      id: breevoId,
      brand: 'Breevo',
      stage: 'contato',
      notes: 'Testar durante corrida + produzir conteúdo',
      links: [],
      order: 0,
    }),
  ]

  const tasks = [
    ctx.make('tasks', {
      id: seedId('creator', 'breevo-revisar'),
      title: 'Breevo — testar durante corrida + produzir conteúdo',
      status: 'review',
      context: 'conteudo',
      area: 'conteudo',
      date: ctx.today,
      partnershipId: breevoId,
      projectId: SEED_IDS.projUGC,
      planType: 'a_confirmar',
      order: 0,
    }),
  ]

  return { projects, contentItems, partnerships, tasks }
}
