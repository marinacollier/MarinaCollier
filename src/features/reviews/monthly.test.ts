import { describe, expect, it } from 'vitest'
import { categoryId } from '@/data/defaults'
import { at, makeDB } from './fixtures.test-utils'
import { findMonthlyReview, monthData, monthLabel, shiftMonth } from './monthly'

const TRIP = {
  datesConfirmed: true,
  interests: [],
  tone: 'ocean' as const,
  links: [],
  status: 'confirmada' as const,
  order: 0,
}
const PROJ = {
  tone: 'accent' as const,
  status: 'ativo' as const,
  priority: 'alta' as const,
  links: [],
  files: [],
  people: [],
  decisions: [],
  kind: 'default' as const,
  order: 0,
}
const PAID = { status: 'paid' as const, origin: 'manual' as const }

function fixture() {
  const { db, add } = makeDB()
  add('trips', { ...TRIP, name: 'Recife', flag: '🇧🇷', startDate: '2026-09-28', endDate: '2026-10-03' })
  add('trips', { ...TRIP, name: 'África do Sul', flag: '🇿🇦', startDate: '2026-11-10', endDate: '2026-11-25' })
  add('trips', { ...TRIP, name: 'Sem data', flag: '🌴' })
  add('projects', {
    ...PROJ,
    id: 'p1',
    name: 'FashionFinder',
    emoji: '👗',
    changelog: [
      { date: '2026-10-12', text: 'Beta fechado' },
      { date: '2026-09-02', text: 'antigo' },
    ],
  })
  add('projects', { ...PROJ, id: 'p2', name: 'Yoga', emoji: '🧘‍♀️', changelog: [] })
  add('projects', { ...PROJ, id: 'p3', name: 'Parado', emoji: '💤', changelog: [] })
  add('tasks', { title: 'Aula gravada', status: 'done', completedAt: at('2026-10-20'), projectId: 'p2', order: 0 })
  add('wins', { date: '2026-10-05', title: 'Palestra', kind: 'reconhecimento' })
  add('workouts', { date: '2026-10-01', modality: 'corrida', status: 'feito', order: 0 })
  add('workouts', { date: '2026-10-08', modality: 'corrida', status: 'feito', order: 1 })
  add('workouts', { date: '2026-10-09', modality: 'surf', status: 'adaptado', order: 2 })
  add('workouts', { date: '2026-10-10', modality: 'surf', status: 'pulado', order: 3 })
  add('workouts', { date: '2026-11-01', modality: 'surf', status: 'feito', order: 4 })
  add('expenses', {
    ...PAID,
    title: 'Aluguel',
    amountCents: 300000,
    date: '2026-10-05',
    categoryId: categoryId('Casa'),
  })
  add('expenses', {
    ...PAID,
    title: 'Mercado',
    amountCents: 40000,
    date: '2026-10-31',
    categoryId: categoryId('Mercado'),
  })
  add('expenses', { ...PAID, title: 'Nov', amountCents: 1000, date: '2026-11-01', categoryId: categoryId('Mercado') })
  add('studyItems', {
    title: 'Inglês B2',
    kind: 'curso',
    status: 'finalizado',
    progress: 100,
    order: 0,
    finishedAt: '2026-10-15',
  })
  add('books', {
    title: 'Torto arado',
    status: 'finalizado',
    progress: 100,
    quotes: [],
    order: 0,
    endDate: '2026-10-28',
  })
  add('books', { title: 'Lendo', status: 'lendo', progress: 30, quotes: [], order: 1 })
  const goal = { level: 'semana' as const, category: 'corpo' as const, big: true, order: 0 }
  add('goals', { ...goal, period: '2026-10-05', title: 'Treinar 4x', status: 'feita' })
  add('goals', { ...goal, period: '2026-09-28', title: 'Semana passada', status: 'feita' })
  add('goals', { ...goal, period: '2026-10-12', title: 'Aberta', status: 'ativa' })
  add('notes', { body: 'ideia', kind: 'ideia', tags: [], pinned: false })
  db.notes[0].createdAt = at('2026-10-03')
  return db
}

describe('monthly aggregation', () => {
  const m = monthData(fixture(), '2026-10')

  it('finds trips overlapping the month', () => {
    expect(m.trips.map((t) => t.name)).toEqual(['Recife'])
  })

  it('collects work: wins, changelog and projects touched', () => {
    expect(m.wins.map((w) => w.title)).toEqual(['Palestra'])
    expect(m.changelog.map((c) => c.text)).toEqual(['Beta fechado'])
    expect(m.projectsTouched.map((p) => p.name)).toEqual(['FashionFinder', 'Yoga'])
  })

  it('counts workouts by modality (done/adaptado only)', () => {
    expect(m.workouts.total).toBe(3)
    expect(m.workouts.byModality).toEqual([
      { id: 'corrida', label: 'Corrida', emoji: '🏃‍♀️', count: 2 },
      { id: 'surf', label: 'Surf', emoji: '🏄‍♀️', count: 1 },
    ])
  })

  it('sums spending with top categories', () => {
    expect(m.spend.total).toBe(340000)
    expect(m.spend.top.map((c) => c.name)).toEqual(['Casa', 'Mercado'])
  })

  it('lists finished studies, books, goals and notes', () => {
    expect(m.studiesFinished.map((s) => s.title)).toEqual(['Inglês B2'])
    expect(m.booksFinished.map((b) => b.title)).toEqual(['Torto arado'])
    expect(m.goalsDone.map((g) => g.title)).toEqual(['Treinar 4x'])
    expect(m.notesCreated).toBe(1)
  })

  it('builds automatic highlights in date order', () => {
    expect(m.autoHighlights.map((h) => h.kind)).toEqual(['viagem', 'win', 'projeto'])
    expect(m.autoHighlights[2].text).toBe('FashionFinder: Beta fechado')
  })

  it('handles month math and labels', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(monthLabel('2026-10')).toBe('outubro 2026')
    const r = { id: 'r', createdAt: '', updatedAt: '', month: '2026-10', highlights: [] }
    expect(findMonthlyReview([r], '2026-10')).toBe(r)
  })

  it('works on an empty month', () => {
    const { db: empty } = makeDB()
    const e = monthData(empty, '2026-02')
    expect(e.to).toBe('2026-02-28')
    expect(e.autoHighlights).toEqual([])
    expect(e.spend.total).toBe(0)
  })
})
