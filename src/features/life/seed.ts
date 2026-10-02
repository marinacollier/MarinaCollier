import type { FeatureSeed } from '@/data/seed/context'
import type { NewItem } from '@/data/types'
import { SEED_IDS } from '@/data/seed/ids'
import { addDays } from '@/lib/date'

/**
 * Luna + Vida real starter data. Only rules and reminders — no invented appointments,
 * dates of past events or money values. Anything unproven is status 'review'.
 */
export const seedLife: FeatureSeed = (ctx) => {
  const pet = ctx.make('pets', {
    id: SEED_IDS.petLuna,
    name: 'Luna',
    species: 'cachorro',
    breed: 'Border Collie',
    documents: [],
  })

  const petTask = (order: number, data: Omit<NewItem<'petTasks'>, 'petId' | 'order' | 'active'>) =>
    ctx.make('petTasks', { petId: pet.id, active: true, order, ...data })

  const petTasks = [
    petTask(0, {
      title: 'Passeio',
      category: 'passeio',
      recurrence: { kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] },
    }),
    petTask(1, {
      title: 'Ração — reabastecer',
      category: 'alimentacao',
      recurrence: { kind: 'every_n_days', days: 30, anchor: ctx.today, fromLastDone: true },
    }),
    petTask(2, {
      title: 'Banho',
      category: 'banho',
      // Unknown last bath: first reminder a week from now, then every 15 days from the last one.
      recurrence: { kind: 'every_n_days', days: 15, anchor: addDays(ctx.today, 7), fromLastDone: true },
    }),
    petTask(3, {
      title: 'Antipulgas / vermífugo',
      category: 'medicacao',
      recurrence: { kind: 'every_n_days', days: 90, anchor: addDays(ctx.today, 14), fromLastDone: true },
      notes: 'Confirmar com a vet o produto e a frequência certa pra ela.',
    }),
    petTask(4, {
      title: 'Check-up no veterinário',
      category: 'veterinario',
      notes: 'Lembrete pra agendar quando der.',
    }),
  ]

  const life = (
    order: number,
    data: Omit<NewItem<'tasks'>, 'context' | 'order'>,
  ) => ctx.make('tasks', { context: 'vida_real', order, ...data })

  const tasks = [
    life(0, { title: 'Revisar manutenções da casa', status: 'review', lifeAdminCategory: 'casa', bucket: 'algum_dia' }),
    life(1, {
      title: 'Conferir revisão e documentos do carro',
      status: 'review',
      lifeAdminCategory: 'carro',
      bucket: 'algum_dia',
    }),
    life(2, {
      title: 'Revisão da bike antes da África do Sul',
      status: 'review',
      lifeAdminCategory: 'bike',
      bucket: 'semana',
      tripId: SEED_IDS.tripAfrica,
    }),
    life(3, {
      title: 'Conferir validade do passaporte',
      status: 'review',
      lifeAdminCategory: 'documentos',
      bucket: 'semana',
      tripId: SEED_IDS.tripAfrica,
    }),
    life(4, { title: 'Lista de compras da casa', status: 'todo', lifeAdminCategory: 'compras', bucket: 'semana' }),
  ]

  return { pets: [pet], petTasks, tasks }
}
