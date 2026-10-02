/**
 * Corpo seed — Marina's real week as DATA (reference 02/10/2026, a Friday).
 *
 * - `weekTemplate`: her editable weekly training base (not law). Fixed/rest lines become workouts;
 *   one_of / optional lines stay as choices in the planner.
 * - Workouts: only the current week, only from today on (never "não feito" noise on past days).
 * - Goals: Yoga 1x/semana (flexível) and Circo/Aéreos (diversão, never an obligation).
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

/** Her weekly base (§10). Times only where she gave them. */
export const TEMPLATE_LINES: Line[] = [
  // SEG
  { slug: 'corrida', weekday: 1, modalities: ['corrida'], choice: 'fixed', planType: 'base', notes: 'Janela compatível com o dia.' },
  { slug: 'musculacao', weekday: 1, modalities: ['musculacao'], choice: 'optional', planType: 'flexivel', notes: 'Pode rolar no mesmo dia, dependendo da semana.' },
  // TER — presencial
  { slug: 'corrida-ou-forca', weekday: 2, modalities: ['corrida', 'musculacao'], choice: 'one_of', title: 'Corrida leve ou força', planType: 'flexivel', notes: 'presencial — evitar pedal longo' },
  // QUA — presencial
  { slug: 'natacao', weekday: 3, modalities: ['natacao'], choice: 'fixed', time: '07:00', durationMin: 60, planType: 'base' },
  { slug: 'musculacao', weekday: 3, modalities: ['musculacao'], choice: 'optional', planType: 'flexivel', notes: 'outra janela; cuidado com o check-in' },
  // QUI
  { slug: 'bike-ou-corrida', weekday: 4, modalities: ['bike', 'corrida'], choice: 'one_of', title: 'Bike cedo ou corrida', period: 'manha', planType: 'flexivel' },
  // SEX
  { slug: 'natacao', weekday: 5, modalities: ['natacao'], choice: 'fixed', time: '07:00', durationMin: 60, planType: 'base', notes: 'espaço pra recuperação e vida pessoal' },
  { slug: 'musculacao', weekday: 5, modalities: ['musculacao'], choice: 'optional', planType: 'flexivel' },
  // SÁB — fun day
  { slug: 'fun-day', weekday: 6, modalities: ['circo', 'surf', 'bike', 'corrida', 'trail', 'caminhada'], choice: 'one_of', title: 'Fun day', planType: 'flexivel', notes: 'Escolha o que combina com seu sábado.' },
  // DOM — recovery
  { slug: 'off', weekday: 0, modalities: [], choice: 'rest', title: 'Recovery / OFF', planType: 'base', notes: 'pedal longo pode migrar pra cá' },
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
      preferredWeekdays: [4],
      preparation: 'Sem dia fixo. Quinta é uma janela possível — o planner confere a agenda antes.',
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
