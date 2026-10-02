import { describe, expect, it } from 'vitest'
import { pickAgora } from './agora'
import { db, hm, make } from './test-utils'
import { SEED_IDS } from '@/data/seed/ids'

const TODAY = '2026-10-02' // sexta

const swim = () =>
  make('workouts', { id: 'w1', date: TODAY, time: '07:00', modality: 'natacao', status: 'planejado', plannedDurationMin: 45, order: 0 })

function morningRoutine(doneAll = false) {
  const routine = make('routines', { id: SEED_IDS.routineMorning, name: 'Minha manhã', period: 'manha', order: 0, active: true })
  const items = ['Água', 'Café'].map((title, i) =>
    make('routineItems', { id: `ri-${i}`, routineId: routine.id, title, recurrence: { kind: 'daily' }, order: i, active: true }),
  )
  const occurrences = doneAll
    ? items.map((it) => make('occurrences', { parentType: 'routineItem', parentId: it.id, date: TODAY, status: 'done' }))
    : []
  return { routines: [routine], routineItems: items, occurrences }
}

describe('pickAgora', () => {
  it('shows a workout about to start as "Agora"', () => {
    const p = pickAgora(db({ workouts: [swim()] }), TODAY, hm(6, 52))
    expect(p.label).toBe('Agora')
    expect(p.title).toBe('Natação às 07:00')
    expect(p.emoji).toBe('🏊‍♀️')
    expect(p.reason).toBe('now')
  })

  it('opens the workout log once the workout started', () => {
    const p = pickAgora(db({ workouts: [swim()] }), TODAY, hm(7, 20))
    expect(p.label).toBe('Agora')
    expect(p.action).toEqual({ kind: 'sheet', name: 'workoutLog', props: { id: 'w1' } })
  })

  it('counts down to something soon ("Daqui a 40 min")', () => {
    const ev = make('events', { id: 'e1', sourceId: 'x', title: 'Reunião', date: TODAY, startTime: '15:00', endTime: '16:00', allDay: false })
    const p = pickAgora(db({ events: [ev] }), TODAY, hm(14, 20))
    expect(p.label).toBe('Daqui a 40 min')
    expect(p.title).toBe('Reunião')
    expect(p.action).toEqual({ kind: 'sheet', name: 'event', props: { id: 'e1' } })
  })

  it('ignores done workouts', () => {
    const w = { ...swim(), status: 'feito' as const }
    const p = pickAgora(db({ workouts: [w] }), TODAY, hm(6, 55))
    expect(p.reason).not.toBe('now')
  })

  it('in the morning, points at the unfinished routine', () => {
    const p = pickAgora(db(morningRoutine()), TODAY, hm(7, 30))
    expect(p.reason).toBe('routine')
    expect(p.action).toEqual({ kind: 'scroll', target: 'manha' })
  })

  it('after the routine, nudges breakfast inside its window', () => {
    const p = pickAgora(db(morningRoutine(true)), TODAY, hm(8, 0))
    expect(p.reason).toBe('meal')
    expect(p.action).toEqual({ kind: 'sheet', name: 'meal', props: { slot: 'cafe', date: TODAY } })
  })

  it('lunch window without lunch logged → lunch; with lunch → top priority', () => {
    const pri = make('priorities', { date: TODAY, title: 'FashionFinder — revisar entrega', order: 0, done: false })
    const p1 = pickAgora(db({ priorities: [pri] }), TODAY, hm(12, 30))
    expect(p1.reason).toBe('meal')
    expect(p1.title).toBe('Hora do almoço')

    const lunch = make('meals', { date: TODAY, slot: 'almoco', description: 'Salada', done: true, tags: [] })
    const p2 = pickAgora(db({ priorities: [pri], meals: [lunch] }), TODAY, hm(12, 30))
    expect(p2.label).toBe('Próximo')
    expect(p2.title).toBe('FashionFinder — revisar entrega')
  })

  it('a deadline today comes before the priorities', () => {
    const t = make('tasks', { title: 'Mandar proposta', status: 'todo', dueDate: TODAY, context: 'trabalho', order: 0 })
    const pri = make('priorities', { date: TODAY, title: 'Estudar inglês', order: 0, done: false })
    const p = pickAgora(db({ tasks: [t], priorities: [pri] }), TODAY, hm(16, 0))
    expect(p.reason).toBe('deadline')
    expect(p.emoji).toBe('💻')
  })

  it('a trip tomorrow shows up', () => {
    const trip = make('trips', {
      id: 'tr',
      name: 'Recife',
      flag: '🇧🇷',
      startDate: '2026-10-03',
      datesConfirmed: true,
      interests: [],
      tone: 'ocean',
      links: [],
      status: 'confirmada',
      order: 0,
    })
    const p = pickAgora(db({ trips: [trip] }), TODAY, hm(16, 0))
    expect(p.reason).toBe('trip')
    expect(p.subtitle).toContain('é amanhã')
    expect(p.action).toEqual({ kind: 'route', to: '/viagens/tr' })
  })

  it('later today, the next timed thing is "Próximo"', () => {
    const ev = make('events', { sourceId: 'x', title: 'Jantar', date: TODAY, startTime: '20:00', allDay: false })
    const p = pickAgora(db({ events: [ev] }), TODAY, hm(16, 0))
    expect(p.label).toBe('Próximo')
    expect(p.title).toBe('Jantar às 20:00')
  })

  it('at night, invites to close the day; once closed, a calm fallback', () => {
    const p1 = pickAgora(db(), TODAY, hm(21, 30))
    expect(p1.reason).toBe('closing')
    const closed = make('checkins', {
      date: TODAY,
      habits: { agua: 0, proteina: false, fruta: false, vegetais: false, refeicoesPlanejadas: false },
      closing: { mood: 'bom', closedAt: '2026-10-03T00:00:00Z' },
    })
    const p2 = pickAgora(db({ checkins: [closed] }), TODAY, hm(21, 30))
    expect(p2.reason).toBe('fallback')
  })

  it('has a gentle fallback when nothing is scheduled', () => {
    const p = pickAgora(db(), TODAY, hm(16, 0))
    expect(p.reason).toBe('fallback')
    expect(p.title).toBe('Nada marcado agora')
  })
})
