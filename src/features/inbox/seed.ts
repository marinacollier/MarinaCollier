import type { FeatureSeed } from '@/data/seed/context'

/** Marina's own brain dump, grouped. Unproven trip items are phrased as "Revisar/confirmar". */
const GROUPS: [string, string[]][] = [
  [
    'África do Sul',
    [
      'Revisar/confirmar: reservas',
      'Revisar/confirmar: hospedagens',
      'Revisar/confirmar: transporte',
      'Revisar/confirmar: equipamentos',
      'Revisar/confirmar: packing',
      'Revisar/confirmar: atividades',
      'Revisar/confirmar: Cape Town',
      'Revisar/confirmar: Johannesburg / safari',
    ],
  ],
  [
    'Projetos',
    [
      'Definir próxima ação — FashionFinder',
      'Definir próxima ação — Day One AI',
      'Definir próxima ação — Yoga App',
      'Definir próxima ação — UGC',
    ],
  ],
  ['Vida', ['Preparação de viagens', 'Manutenção / equipamentos', 'Compras']],
]

export const seedInbox: FeatureSeed = (ctx) => ({
  brainDump: GROUPS.flatMap(([group, texts]) =>
    texts.map((text) => ctx.make('brainDump', { text, group, status: 'inbox' })),
  ),
})
