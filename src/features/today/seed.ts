import type { FeatureSeed } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { Recurrence, Weekday } from '@/data/types'

const EVERY_DAY: Recurrence = { kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] }
const WEEKDAYS: Recurrence = { kind: 'weekly', weekdays: [1, 2, 3, 4, 5] as Weekday[] }

const MORNING: [string, string, Recurrence][] = [
  ['Beber água', '💧', EVERY_DAY],
  ['Café da manhã', '☕', EVERY_DAY],
  ['Suplementos', '💊', EVERY_DAY],
  ['Skincare', '🧴', EVERY_DAY],
  ['Protetor solar', '☀️', EVERY_DAY],
  ['Conferir agenda', '📅', EVERY_DAY],
  ['Conferir minhas 3 prioridades', '✨', EVERY_DAY],
  ['Preparar coisas do dia', '🎒', WEEKDAYS],
]

export const seedToday: FeatureSeed = (ctx) => {
  const routine = ctx.make('routines', {
    id: SEED_IDS.routineMorning,
    name: 'Minha manhã',
    period: 'manha',
    emoji: '☀️',
    order: 0,
    active: true,
  })
  const routineItems = MORNING.map(([title, emoji, recurrence], i) =>
    ctx.make('routineItems', { routineId: routine.id, title, emoji, recurrence, order: i, active: true }),
  )

  const entrega = ctx.make('tasks', {
    title: 'Entregar revisão do projeto X',
    status: 'todo',
    date: ctx.today,
    context: 'trabalho',
    area: 'profissional',
    priority: 'alta',
    needsMe: true,
    order: 0,
  })
  const tasks = [
    entrega,
    ctx.make('tasks', { title: 'Responder mensagens pendentes', status: 'todo', date: ctx.today, context: 'geral', order: 1 }),
    ctx.make('tasks', {
      title: 'Organizar a semana',
      status: 'todo',
      context: 'geral',
      recurrence: { kind: 'weekly', weekdays: [0] },
      notes: 'Olhar agenda, treinos e as 3 prioridades de segunda.',
      order: 2,
    }),
    ctx.make('tasks', {
      title: 'Agendar check-up anual',
      status: 'todo',
      bucket: 'algum_dia',
      context: 'vida_real',
      lifeAdminCategory: 'consultas',
      order: 3,
    }),
  ]

  const priorities = [
    ctx.make('priorities', { date: ctx.today, title: 'Entregar revisão do projeto X', order: 0, done: false, ref: { type: 'task', id: entrega.id } }),
    ctx.make('priorities', { date: ctx.today, title: 'Fazer treino de natação', order: 1, done: false }),
    ctx.make('priorities', { date: ctx.today, title: 'Estudar inglês', order: 2, done: false }),
  ]

  return { routines: [routine], routineItems, tasks, priorities }
}
