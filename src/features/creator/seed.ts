import type { FeatureSeed } from '@/data/seed/context'

/**
 * Creator seed: only content ideas that fit Marina's life. No partnerships are invented —
 * brands, values and deadlines only exist when she adds them.
 */
export const seedCreator: FeatureSeed = (ctx) => ({
  contentItems: [
    { title: 'Minha rotina: treino + trabalho em produto', category: 'rotina' },
    { title: 'Preparando a viagem para a África do Sul', category: 'viagem' },
    { title: 'Como uso IA no meu dia a dia', category: 'IA' },
    { title: 'Bastidores de um treino de natação', category: 'esporte' },
  ].map((c, i) => ctx.make('contentItems', { ...c, stage: 'ideia', links: [], order: i })),
  partnerships: [],
})
