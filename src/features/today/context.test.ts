import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import type { DB } from '@/data/types'
import { daySummary, homeContext, showCarried, sortForFocus, tripPriorityItems, weekWrap } from './context'
import { keySessionCard, trainingMorning } from './training'
import { db as emptyWith, hm, make } from './test-utils'

const FRI = '2026-10-02'
const SAT = '2026-10-03'
const SUN = '2026-10-04'
const MON = '2026-10-05'

function world(patch: Partial<DB> = {}): DB {
  const seed = buildSeed(FRI)
  return emptyWith({ profile: seed.profile, ...patch })
}

describe('homeContext', () => {
  it('Friday evening → "Fechando a semana" mode; weekend; Sunday OFF', () => {
    expect(homeContext(world(), FRI, hm(20)).mode).toBe('sexta')
    expect(homeContext(world(), FRI, hm(9)).mode).toBe('normal')
    expect(homeContext(world(), SAT, hm(9)).mode).toBe('fds')
    const sun = homeContext(world(), SUN, hm(9))
    expect(sun.sundayOff).toBe(true)
    expect(showCarried(sun)).toBe(false)
    expect(showCarried(homeContext(world(), MON, hm(9)))).toBe(true)
    expect(homeContext(world(), MON, hm(20)).tomorrowPresencial).toBe(true)
  })

  it('energy baixa wins over every other mode', () => {
    const c = make('checkins', { date: SAT, energia: 'baixa', habits: { agua: 0, proteina: false, fruta: false, vegetais: false, refeicoesPlanejadas: false } })
    expect(homeContext(world({ checkins: [c] }), SAT, hm(9)).mode).toBe('baixa')
  })

  it('trip within 7 days surfaces its logistics first', () => {
    const trip = make('trips', { id: 't', name: 'Recife', flag: '🇧🇷', startDate: '2026-10-08', datesConfirmed: true, interests: [], tone: 'sand', links: [], status: 'planejando', order: 0 })
    const items = [
      make('tripItems', { tripId: 't', section: 'quero_ir', title: 'Praia', status: 'a_confirmar', order: 0 }),
      make('tripItems', { tripId: 't', section: 'voo', title: 'Voo', status: 'a_confirmar', order: 1 }),
      make('tripItems', { tripId: 't', section: 'hospedagem', title: 'Hotel', status: 'confirmado', order: 2 }),
    ]
    const db = world({ trips: [trip], tripItems: items })
    expect(homeContext(db, FRI, hm(9)).tripSoon?.days).toBe(6)
    expect(tripPriorityItems(db, trip).map((p) => p.title)).toEqual(['Voo', 'Praia'])
    expect(homeContext(db, '2026-09-25', hm(9)).tripSoon).toBeUndefined()
  })

  it('three work deadlines → personal low-priority things sink', () => {
    const due = (title: string, d: string) => make('tasks', { title, status: 'todo', dueDate: d, context: 'trabalho', order: 0 })
    const books = make('tasks', { title: 'Organizar livros', status: 'todo', date: FRI, priority: 'baixa', order: 0 })
    const work = [due('A', FRI), due('B', SAT), due('C', MON)]
    const db = world({ tasks: [books, ...work] })
    const ctx = homeContext(db, FRI, hm(9))
    expect(ctx.busyWorkWeek).toBe(true)
    expect(sortForFocus([books, ...work], ctx).map((t) => t.title)).toEqual(['A', 'B', 'C', 'Organizar livros'])
    expect(sortForFocus([books, ...work], { busyWorkWeek: false })[0].title).toBe('Organizar livros')
  })
})

describe('daySummary (HOJE line)', () => {
  it('presencial + workout + priority project', () => {
    const tue = '2026-10-06'
    const w = make('workouts', { date: tue, time: '07:00', modality: 'natacao', status: 'planejado', order: 0 })
    const p = make('projects', { id: 'p', name: 'FashionFinder', emoji: '👗', tone: 'plum', status: 'ativo', priority: 'alta', nextDelivery: { title: 'MVP', date: '2026-11-20' }, links: [], files: [], people: [], decisions: [], changelog: [], kind: 'default', order: 0 })
    expect(daySummary(world({ workouts: [w], projects: [p] }), tue).map((b) => `${b.emoji} ${b.text}`)).toEqual([
      '📍 Trabalho presencial · Interlagos',
      '🏊‍♀️ Natação 07:00',
      '👗 FashionFinder',
    ])
  })

  it('Sunday is OFF and shows no work project', () => {
    expect(daySummary(world(), SUN)).toEqual([{ key: 'work', emoji: '🌿', text: 'Domingo é OFF' }])
  })
})

describe('weekWrap', () => {
  it('counts what was done Mon → today, facts only', () => {
    const w = make('workouts', { date: '2026-09-30', modality: 'corrida', status: 'feito', order: 0 })
    const old = make('workouts', { date: '2026-09-27', modality: 'corrida', status: 'feito', order: 0 })
    const pr = make('priorities', { date: '2026-09-29', title: 'x', order: 0, done: true })
    expect(weekWrap(world({ workouts: [w, old], priorities: [pr] }), FRI)).toMatchObject({ workoutsDone: 1, prioritiesDone: 1 })
  })
})

describe('training-aware Home', () => {
  const longRun = (date: string) =>
    make('workouts', { id: 'lr', date, time: '06:00', modality: 'corrida', title: 'Long Z2', status: 'planejado', plannedDurationMin: 60, plannedDurationMaxMin: 75, isKeySession: true, order: 0 })

  it('evening card for a key session tomorrow — follows the training, not the weekday', () => {
    expect(keySessionCard(world({ workouts: [longRun(FRI)] }), '2026-10-01')?.line).toBe('Amanhã é dia de corrida 🏃‍♀️ · 06:00 · Long Z2 · 60–75 min')
    // moved to Saturday → Friday is now the prep evening, Thursday isn't
    const moved = world({ workouts: [longRun(SAT)] })
    expect(keySessionCard(moved, '2026-10-01')).toBeUndefined()
    expect(keySessionCard(moved, FRI)?.workout.id).toBe('lr')
  })

  it('early training reorganizes the morning: items before it stay, the rest comes after', () => {
    const seed = buildSeed(FRI)
    const items = seed.routineItems.filter((i) => i.routineId === 'routine-manha').sort((a, b) => a.order - b.order)
    const tm = trainingMorning(world({ workouts: [longRun(FRI)] }), FRI, items)!
    expect(tm.title).toBe('Treino 06:00 · Long Z2')
    expect(tm.before.map((i) => i.title)).toEqual(['Despertar'])
    expect(tm.after).toHaveLength(items.length - 1)
    expect(trainingMorning(world(), FRI, items)).toBeUndefined()
  })
})
