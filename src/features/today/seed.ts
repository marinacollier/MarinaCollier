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

/**
 * ☀️ Milagre da Manhã — BASE, daily. Every item has a time: Despertar is fixed at 04:40 (brief §2/§3)
 * and the rest follow "em sequência" from their durations, so each one (and each step) gets its own
 * time — 04:40 acordar · 04:55 higiene · 05:05 morning shot · 05:10 leitura · 05:20 meditação…
 * On a training morning the chain slides past the training (see data/timeline.ts).
 */
const MORNING: ItemSeed[] = [
  {
    slug: 'despertar',
    title: 'Despertar',
    emoji: '🌅',
    time: '04:40',
    timeMode: 'fixed',
    durationMin: 15,
    steps: ['Acordar', 'Alguns minutos ainda na cama', 'Respirar', 'Pranayama / body scan', 'Perceber como estou me sentindo'],
    stepDurations: [2, 3, 3, 5, 2],
    essential: true,
    essentialLabel: 'Respirar',
  },
  {
    slug: 'higiene',
    title: 'Higiene da manhã',
    emoji: '🪥',
    timeMode: 'sequence',
    durationMin: 10,
    steps: ['Higiene', 'Raspar língua', 'Higiene nasal (quando fizer)', 'Lavar rosto', 'Escovar dentes'],
    stepDurations: [2, 2, 2, 2, 2],
    essential: true,
    essentialLabel: 'Higiene',
  },
  { slug: 'morning-shot', title: 'Morning shot / água da manhã', emoji: '🥤', timeMode: 'sequence', durationMin: 5, essential: true, essentialLabel: 'Morning shot' },
  { slug: 'leitura', title: 'Leitura da manhã', emoji: '📖', timeMode: 'sequence', durationMin: 10, essential: true, essentialLabel: '5 min de leitura' },
  { slug: 'meditacao', title: 'Meditação', emoji: '🧘‍♀️', timeMode: 'sequence', durationMin: 10 },
  { slug: 'afirmacoes', title: 'Afirmações', emoji: '✨', timeMode: 'sequence', durationMin: 5 },
  { slug: 'journaling', title: 'Journaling / escrita', emoji: '✍️', timeMode: 'sequence', durationMin: 10, acceptsText: true },
  { slug: 'visualizacao', title: 'Visualização', emoji: '🌄', timeMode: 'sequence', durationMin: 5 },
  {
    slug: 'movimento',
    title: 'Movimento',
    emoji: '🤸‍♀️',
    timeMode: 'sequence',
    durationMin: 20,
    timeFlexible: true,
    steps: ['Mobilidade', 'Yoga', 'Caminhada', 'Treino'],
    hint: 'depende do treino do dia',
  },
  {
    slug: 'luna-sol',
    title: 'Passeio da Luna / pegar sol',
    emoji: '🐾',
    timeMode: 'sequence',
    durationMin: 20,
    timeFlexible: true,
    optional: true,
    hint: 'quando ela estiver em casa e na rotina',
  },
  {
    slug: 'preparar-o-dia',
    title: 'Preparar o dia',
    emoji: '🗓️',
    timeMode: 'sequence',
    durationMin: 15,
    steps: [
      'Olhar agenda',
      'Escolher Top 3',
      'Conferir treino',
      'Conferir compromissos',
      'Conferir o que precisa sair comigo',
      'Suplementos',
      'Café da manhã',
    ],
    stepDurations: [2, 2, 2, 2, 2, 2, 3],
    essential: true,
    essentialLabel: 'Agenda + Top 3',
  },
]

/**
 * 🌙 Encerrar o dia — BASE, daily. No nagging if skipped. Sleep goal ~22:00 (brief §2/§5):
 * the routine starts an hour before and flows in sequence, Dormir stays at 22:00.
 */
const EVENING: ItemSeed[] = [
  { slug: 'conferir-amanha', title: 'Conferir amanhã', emoji: '🗓️', timeMode: 'sequence', durationMin: 5, timeFlexible: true },
  { slug: 'preparar-roupa', title: 'Preparar roupa / equipamentos', emoji: '🎒', timeMode: 'sequence', durationMin: 10, timeFlexible: true },
  { slug: 'brain-dump', title: 'Brain dump', emoji: '🧠', timeMode: 'sequence', durationMin: 5, timeFlexible: true, acceptsText: true },
  { slug: 'higiene-skincare', title: 'Higiene / skincare', emoji: '🧴', timeMode: 'sequence', durationMin: 10, timeFlexible: true },
  { slug: 'leitura', title: 'Leitura', emoji: '📖', timeMode: 'sequence', durationMin: 15, timeFlexible: true },
  { slug: 'respiracao', title: 'Respiração / body scan', emoji: '🌬️', timeMode: 'sequence', durationMin: 5, timeFlexible: true },
  { slug: 'desacelerar', title: 'Desacelerar', emoji: '🕯️', timeMode: 'sequence', durationMin: 10, timeFlexible: true },
  { slug: 'dormir', title: 'Dormir', emoji: '😴', time: '22:00', timeMode: 'fixed', hint: 'meta ~22h, sem cobrança' },
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
    startTime: '21:00',
  })
  const items = (routineId: string, prefix: string, list: ItemSeed[]) =>
    list.map(({ slug, ...rest }, i) =>
      ctx.make('routineItems', { ...rest, id: seedId('today', `${prefix}-${slug}`), routineId, recurrence: EVERY_DAY, order: i, active: true, source: 'seed' }),
    )

  return {
    routines: [morning, evening],
    routineItems: [...items(morning.id, 'milagre', MORNING), ...items(evening.id, 'encerrar', EVENING)],
  }
}
