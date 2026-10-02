/**
 * Marina's routines as seed DATA (brief §3, §4, §5).
 * No invented priorities or tasks: today's Top 3 starts empty — she picks it.
 */
import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { NewItem, Recurrence } from '@/data/types'

const EVERY_DAY: Recurrence = { kind: 'daily' }

export const EVENING_ROUTINE_ID = seedId('today', 'routine-encerrar-o-dia')

type ItemSeed = Omit<NewItem<'routineItems'>, 'routineId' | 'order' | 'active' | 'recurrence'> & { slug: string }

/** ☀️ Milagre da Manhã — BASE, daily. */
const MORNING: ItemSeed[] = [
  {
    slug: 'despertar',
    title: 'Despertar',
    emoji: '🌅',
    time: '04:40',
    steps: ['Acordar', 'Alguns minutos ainda na cama', 'Respirar', 'Pranayama / body scan', 'Perceber como estou me sentindo'],
    essential: true,
    essentialLabel: 'Respirar',
  },
  {
    slug: 'higiene',
    title: 'Higiene da manhã',
    emoji: '🪥',
    steps: ['Higiene', 'Raspar língua', 'Higiene nasal (quando fizer)', 'Lavar rosto', 'Escovar dentes'],
    essential: true,
    essentialLabel: 'Higiene',
  },
  { slug: 'morning-shot', title: 'Morning shot / água da manhã', emoji: '🥤', essential: true, essentialLabel: 'Morning shot' },
  { slug: 'leitura', title: 'Leitura da manhã', emoji: '📖', essential: true, essentialLabel: '5 min de leitura' },
  { slug: 'meditacao', title: 'Meditação', emoji: '🧘‍♀️' },
  { slug: 'afirmacoes', title: 'Afirmações', emoji: '✨' },
  { slug: 'journaling', title: 'Journaling / escrita', emoji: '✍️', acceptsText: true },
  { slug: 'visualizacao', title: 'Visualização', emoji: '🌄' },
  {
    slug: 'movimento',
    title: 'Movimento',
    emoji: '🤸‍♀️',
    steps: ['Mobilidade', 'Yoga', 'Caminhada', 'Treino'],
    hint: 'depende do treino do dia',
  },
  { slug: 'luna-sol', title: 'Passeio da Luna / pegar sol', emoji: '🐾', optional: true, hint: 'quando ela estiver em casa e na rotina' },
  {
    slug: 'preparar-o-dia',
    title: 'Preparar o dia',
    emoji: '🗓️',
    steps: [
      'Olhar agenda',
      'Escolher Top 3',
      'Conferir treino',
      'Conferir compromissos',
      'Conferir o que precisa sair comigo',
      'Suplementos',
      'Café da manhã',
    ],
    essential: true,
    essentialLabel: 'Agenda + Top 3',
  },
]

/** 🌙 Encerrar o dia — BASE, daily. No nagging if skipped. */
const EVENING: ItemSeed[] = [
  { slug: 'conferir-amanha', title: 'Conferir amanhã', emoji: '🗓️' },
  { slug: 'preparar-roupa', title: 'Preparar roupa / equipamentos', emoji: '🎒' },
  { slug: 'brain-dump', title: 'Brain dump', emoji: '🧠', acceptsText: true },
  { slug: 'higiene-skincare', title: 'Higiene / skincare', emoji: '🧴' },
  { slug: 'leitura', title: 'Leitura', emoji: '📖' },
  { slug: 'respiracao', title: 'Respiração / body scan', emoji: '🌬️' },
  { slug: 'desacelerar', title: 'Desacelerar', emoji: '🕯️' },
  { slug: 'dormir', title: 'Dormir', emoji: '😴', time: '22:00', hint: 'meta ~22h, sem cobrança' },
]

export const seedToday: FeatureSeed = (ctx) => {
  const morning = ctx.make('routines', {
    id: SEED_IDS.routineMorning,
    name: 'Milagre da Manhã',
    emoji: '☀️',
    period: 'manha',
    order: 0,
    active: true,
    planType: 'base',
    startTime: '04:40',
    hasEssential: true,
    essentialName: 'Essential',
  })
  const evening = ctx.make('routines', {
    id: EVENING_ROUTINE_ID,
    name: 'Encerrar o dia',
    emoji: '🌙',
    period: 'noite',
    order: 1,
    active: true,
    planType: 'base',
  })
  const items = (routineId: string, prefix: string, list: ItemSeed[]) =>
    list.map(({ slug, ...rest }, i) =>
      ctx.make('routineItems', { ...rest, id: seedId('today', `${prefix}-${slug}`), routineId, recurrence: EVERY_DAY, order: i, active: true }),
    )

  return {
    routines: [morning, evening],
    routineItems: [...items(morning.id, 'milagre', MORNING), ...items(evening.id, 'encerrar', EVENING)],
  }
}
