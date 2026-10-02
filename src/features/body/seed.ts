/**
 * Corpo seed — Marina's real week as DATA (reference 02/10/2026, a Friday).
 *
 * - `weekTemplate`: her editable weekly training base (not law). Fixed/rest lines become workouts;
 *   one_of / optional lines stay as choices in the planner.
 * - Workouts: only the current week, only from today on (never "não feito" noise on past days).
 * - Goals: Yoga 1x/semana (lives on Tuesday 19:00; suggestions only if it leaves) and Circo/Aéreos (never an obligation).
 * - No meal templates: no invented diet.
 */
import type { FeatureSeed, SeedContext } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'
import { emptyDB } from '@/data/defaults'
import { proposeWeekFromTemplate } from '@/data/planning'
import type { DateKey, WeekTemplateItem, Weekday } from '@/data/types'
import { startOfWeek } from '@/lib/date'

type Line = Omit<WeekTemplateItem, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'active'> & { slug: string }

const DAY_SLUG = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const

const KEY_FUEL = { requiresPreviousDayPrep: true, requiresPreWorkout: true, requiresIntraWorkout: true, requiresPostWorkout: true } as const

/**
 * Her weekly base (training & nutrition update, 02/10/2026 — supersedes the first template).
 * Heavy sessions early (06:00); lighter second sessions at the end of the day are a preference.
 * Hierarchy: KEY = qua pernas, sex corrida longa, dom pedal longo · MODERADA = seg/qui natação, ter upper · LEVE = yoga, core, acessórios.
 */
export const TEMPLATE_LINES: Line[] = [
  // SEG
  { slug: 'natacao-endurance', weekday: 1, modalities: ['natacao'], choice: 'fixed', title: 'Natação endurance', time: '06:00', durationMin: 60, durationMaxMin: 75, planType: 'base', sessionType: 'endurance', loadCategory: 'moderada', notes: 'Treino principal do dia.' },
  { slug: 'upper-core', weekday: 1, modalities: ['musculacao'], choice: 'optional', title: 'Upper / Core leve', period: 'noite', planType: 'flexivel', sessionType: 'forca', loadCategory: 'leve', notes: 'Opcional, complementar.' },
  // TER
  { slug: 'upper-pliometria', weekday: 2, modalities: ['musculacao'], choice: 'fixed', title: 'Upper + pliometria', time: '06:00', planType: 'base', sessionType: 'forca', loadCategory: 'moderada', tags: ['forca', 'upper', 'pliometria'] },
  { slug: 'yoga', weekday: 2, modalities: ['yoga'], choice: 'fixed', title: 'Yoga', time: '19:00', planType: 'base', sessionType: 'mobilidade', loadCategory: 'leve', notes: 'Leve — recuperação e mobilidade.' },
  // QUA
  {
    slug: 'pernas', weekday: 3, modalities: ['musculacao'], choice: 'fixed', title: 'Pernas — key session', time: '06:00', planType: 'base', sessionType: 'forca', loadCategory: 'key',
    isKeySession: true, recoveryPriority: 'alta', requiresPreWorkout: true, requiresPostWorkout: true, tags: ['forca', 'pernas', 'key-session', 'recovery-important'],
    notes: 'Quadríceps, agachamento, búlgaro, afundo, extensora, posterior, panturrilha.',
  },
  // QUI
  { slug: 'natacao', weekday: 4, modalities: ['natacao'], choice: 'fixed', title: 'Natação', time: '06:00', durationMin: 45, durationMaxMin: 60, planType: 'base', sessionType: 'qualidade', loadCategory: 'moderada', notes: 'Pode ter tiros, técnica ou qualidade.' },
  { slug: 'upper-acessorios', weekday: 4, modalities: ['musculacao'], choice: 'optional', title: 'Upper / acessórios', period: 'noite', planType: 'flexivel', sessionType: 'forca', loadCategory: 'leve' },
  // SEX
  {
    slug: 'corrida-longa', weekday: 5, modalities: ['corrida'], choice: 'fixed', title: 'Corrida longa Z2', time: '06:00', durationMin: 60, durationMaxMin: 75, planType: 'base', sessionType: 'longo', loadCategory: 'key',
    isKeySession: true, isLongSession: true, ...KEY_FUEL, tags: ['running', 'long-run', 'Z2', 'endurance', 'key-session', 'fuel-required'],
  },
  // SÁB — flexível, never auto-filled
  { slug: 'flex', weekday: 6, modalities: ['circo', 'surf', 'mobilidade', 'caminhada'], choice: 'one_of', title: 'Sábado flexível', planType: 'flexivel', loadCategory: 'leve', notes: 'Escolha o que combina com seu sábado.' },
  // DOM
  {
    slug: 'pedal-longo', weekday: 0, modalities: ['bike'], choice: 'fixed', title: 'Pedal longo', time: '06:00', durationMin: 120, durationMaxMin: 180, planType: 'base', sessionType: 'longo', loadCategory: 'key',
    isKeySession: true, isLongSession: true, ...KEY_FUEL, recoveryPriority: 'alta', tags: ['cycling', 'endurance', 'long-ride', 'long-session', 'key-session', 'fuel-required', 'intra-workout-fuel'],
  },
]

export function templateId(weekday: Weekday, slug: string): string {
  return seedId('body', `tpl-${DAY_SLUG[weekday]}-${slug}`)
}

export function seedWeekTemplate(ctx: SeedContext): WeekTemplateItem[] {
  const orderInDay = new Map<number, number>()
  return TEMPLATE_LINES.map(({ slug, ...line }) => {
    const order = orderInDay.get(line.weekday) ?? 0
    orderInDay.set(line.weekday, order + 1)
    return ctx.make('weekTemplate', { ...line, id: templateId(line.weekday, slug), order, active: true })
  })
}

/** Fixed + rest lines of the current week, from `today` on. */
export function seedCurrentWeekWorkouts(ctx: SeedContext, template: WeekTemplateItem[], today: DateKey = ctx.today) {
  const db = { ...emptyDB(), weekTemplate: template }
  return proposeWeekFromTemplate(db, startOfWeek(today))
    .filter((p) => p.workout && p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ctx.make('workouts', { ...p.workout!, id: seedId('body', `w-${p.date}-${p.templateId.split(':').pop()}`) }))
}

export const seedBody: FeatureSeed = (ctx) => {
  const weekTemplate = seedWeekTemplate(ctx)
  const workouts = seedCurrentWeekWorkouts(ctx, weekTemplate)
  const ws = startOfWeek(ctx.today)

  const workoutGoals = [
    ctx.make('workoutGoals', {
      id: seedId('body', 'goal-yoga'),
      title: 'Yoga — 1x/semana',
      kind: 'habit',
      modality: 'yoga',
      perWeek: 1,
      target: 1,
      unit: 'sessoes',
      startDate: ws,
      milestones: [],
      status: 'ativa',
      planType: 'flexivel',
      preferredWeekdays: [2],
      preparation: 'Hoje mora na terça 19:00. Se ela sair do lugar, eu sugiro outra janela que respeite o check-in e a agenda.',
    }),
    ctx.make('workoutGoals', {
      id: seedId('body', 'goal-circo'),
      title: 'Circo / Aéreos',
      kind: 'habit',
      modality: 'circo',
      perWeek: 1,
      obligation: false,
      startDate: ws,
      milestones: [],
      status: 'ativa',
      planType: 'flexivel',
      preferredWeekdays: [6],
      preparation: 'De preferência no sábado, quando combinar.',
    }),
  ]

  return { weekTemplate, workouts, workoutGoals, mealTemplates: [] }
}
