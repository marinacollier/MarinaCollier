import { describe, expect, it } from 'vitest'
import { categoryId } from '@/data/defaults'
import type { Goal } from '@/data/types'
import { at, makeDB } from './fixtures.test-utils'
import {
  findWeeklyReview,
  goalsForPriorities,
  nextMonday,
  prioritySuggestions,
  reviewWeekFor,
  weekData,
  weeklyHints,
} from './weekly'

const WEEK = '2026-09-28'

const PROJ = {
  tone: 'accent' as const,
  status: 'ativo' as const,
  priority: 'alta' as const,
  links: [],
  files: [],
  people: [],
  decisions: [],
  kind: 'default' as const,
}

function fixture() {
  const { db, add } = makeDB()
  // tasks
  add('tasks', { title: 'Enviar proposta', status: 'done', completedAt: at('2026-09-29'), projectId: 'p1', order: 0 })
  add('tasks', {
    title: 'Renovar seguro do carro',
    status: 'done',
    completedAt: at('2026-09-30'),
    context: 'vida_real',
    order: 1,
  })
  add('tasks', { title: 'Coisa antiga', status: 'done', completedAt: at('2026-09-20'), order: 2 })
  add('tasks', { title: 'Ligar pro contador', status: 'todo', date: '2026-10-01', priority: 'alta', order: 3 })
  add('tasks', { title: 'Comprar ração', status: 'todo', dueDate: '2026-10-03', order: 4 })
  add('tasks', { title: 'Aguardando RH', status: 'waiting', date: '2026-10-01', order: 5 })
  add('tasks', { title: 'Fora da semana', status: 'todo', date: '2026-10-10', order: 6 })
  // recurring task done once in the week
  add('tasks', {
    id: 'rec',
    title: 'Passear Luna',
    status: 'todo',
    context: 'luna',
    recurrence: { kind: 'daily' },
    order: 7,
  })
  add('occurrences', { parentType: 'task', parentId: 'rec', date: '2026-09-30', status: 'done' })
  // priorities
  add('priorities', { date: '2026-09-29', title: 'Fechar briefing', order: 0, done: false })
  add('priorities', { date: '2026-09-29', title: 'Treino longo', order: 1, done: true })
  // workouts
  add('workouts', { date: '2026-09-28', modality: 'corrida', status: 'feito', order: 0 })
  add('workouts', { date: '2026-09-30', modality: 'corrida', status: 'adaptado', order: 1 })
  add('workouts', { date: '2026-10-01', modality: 'yoga', status: 'feito', order: 2 })
  add('workouts', { date: '2026-10-02', modality: 'natacao', status: 'planejado', order: 3 })
  add('workouts', { date: '2026-10-03', modality: 'outro', status: 'descanso', order: 4 })
  // check-ins
  const habits = { agua: 0, proteina: false, fruta: false, vegetais: false, refeicoesPlanejadas: false }
  add('checkins', { date: '2026-09-28', energia: 'alta', corpo: 'forte', habits })
  add('checkins', { date: '2026-09-29', energia: 'alta', habits })
  add('checkins', { date: '2026-09-30', energia: 'baixa', habits })
  // money
  const paid = { status: 'paid' as const, origin: 'manual' as const }
  add('expenses', {
    ...paid,
    title: 'Mercado',
    amountCents: 20000,
    date: '2026-09-29',
    categoryId: categoryId('Mercado'),
  })
  add('expenses', { ...paid, title: 'Feira', amountCents: 5000, date: '2026-10-01', categoryId: categoryId('Mercado') })
  add('expenses', {
    ...paid,
    title: 'Jantar',
    amountCents: 12000,
    date: '2026-10-02',
    categoryId: categoryId('Restaurante'),
  })
  add('expenses', {
    title: 'Planejado',
    amountCents: 99900,
    categoryId: categoryId('Compras'),
    status: 'planned_purchase',
    origin: 'manual',
  })
  add('expenses', { ...paid, title: 'Antes', amountCents: 50000, date: '2026-09-27', categoryId: categoryId('Casa') })
  // projects
  add('projects', {
    ...PROJ,
    id: 'p1',
    name: 'FashionFinder',
    emoji: '👗',
    changelog: [{ date: '2026-09-30', text: 'MVP no ar' }],
    order: 0,
  })
  add('projects', {
    ...PROJ,
    id: 'p2',
    name: 'Day One',
    emoji: '📓',
    changelog: [{ date: '2026-09-01', text: 'antigo' }],
    order: 1,
  })
  add('wins', { date: '2026-10-01', title: 'Cliente aprovou', kind: 'feedback', projectId: 'p1' })
  // learning
  add('studyItems', {
    title: 'Curso de IA',
    kind: 'curso',
    status: 'finalizado',
    progress: 100,
    order: 0,
    finishedAt: '2026-09-30',
  })
  add('books', {
    title: 'Tudo é rio',
    status: 'finalizado',
    progress: 100,
    quotes: [],
    order: 0,
    endDate: '2026-10-02',
  })
  // goals of the week
  const goal = (p: Partial<Goal>) => ({
    level: 'semana' as const,
    period: WEEK,
    category: 'pessoal' as const,
    big: false,
    status: 'ativa' as const,
    order: 0,
    title: 'x',
    ...p,
  })
  add('goals', goal({ title: 'Treinar 4x', big: true, status: 'feita', category: 'corpo' }))
  add('goals', goal({ title: 'Avançar o FashionFinder', big: true, category: 'profissional' }))
  add('goals', goal({ title: 'Revisar gastos' }))
  // events
  add('calendarSources', {
    id: 'cal',
    provider: 'local',
    name: 'Local',
    syncDirection: 'none',
    color: 'accent',
    enabled: true,
  })
  add('events', { sourceId: 'cal', title: 'Dentista', date: '2026-09-29', allDay: false, startTime: '10:00' })
  add('events', { sourceId: 'cal', title: 'Aniversário', date: '2026-10-02', allDay: true })
  add('events', { sourceId: 'cal', title: 'Fora', date: '2026-10-08', allDay: true })
  return db
}

describe('weekly review aggregation', () => {
  const db = fixture()
  const d = weekData(db, '2026-10-01') // any day normalizes to its Monday

  it('normalizes the week', () => {
    expect(d.weekStart).toBe(WEEK)
    expect(d.weekEnd).toBe('2026-10-04')
  })

  it('counts agenda, tasks and life', () => {
    expect(d.events).toBe(2)
    expect(d.tasksDone).toBe(3) // 2 one-off + 1 recurring occurrence
    expect(d.openTasks.map((t) => t.title)).toEqual(['Ligar pro contador', 'Comprar ração'])
    expect(d.openPriorities.map((p) => p.title)).toEqual(['Fechar briefing'])
    expect(d.life.done).toBe(2) // seguro + Luna walk
  })

  it('summarizes body without metrics overload', () => {
    expect(d.workouts).toMatchObject({ done: 3, planned: 4 })
    expect(d.workouts.byModality[0]).toMatchObject({ label: 'Corrida', count: 2 })
    expect(d.bodyWords).toEqual(['energia alta', 'corpo forte'])
  })

  it('sums money by category (paid only, in range)', () => {
    expect(d.money.total).toBe(37000)
    expect(d.money.top.map((c) => c.name)).toEqual(['Mercado', 'Restaurante'])
    expect(d.money.top[0].cents).toBe(25000)
  })

  it('finds projects that moved, wins and studies', () => {
    expect(d.projects.map((p) => p.project.name)).toEqual(['FashionFinder'])
    expect(d.projects[0].updates).toBe(3) // changelog + task + win
    expect(d.wins).toHaveLength(1)
    expect(d.studiesFinished).toHaveLength(1)
    expect(d.booksFinished).toHaveLength(1)
    expect(d.goals).toMatchObject({ done: 1, total: 3 })
  })

  it('writes kind hints with real data and no guilt words', () => {
    const h = weeklyHints(d)
    expect(h.dinheiro).toContain('Mercado')
    expect(h.corpo).toContain('3 de 4 treinos')
    expect(h.corpo).toContain('energia alta')
    expect(h.projeto).toContain('FashionFinder')
    expect(h.pendente).toContain('Avançar o FashionFinder')
    expect(h.certo).toContain('3 treinos')
    const all = Object.values(h).join(' ').toLowerCase()
    expect(all).not.toMatch(/atrasad|falhou|streak|%/)
  })

  it('returns no hints for an empty week', () => {
    const { db: empty } = makeDB()
    expect(weeklyHints(weekData(empty, WEEK))).toEqual({})
  })

  it('suggests priorities from what stayed open, deduped', () => {
    const s = prioritySuggestions(d)
    expect(s[0]).toEqual({ title: 'Avançar o FashionFinder', category: 'profissional' })
    expect(s.map((x) => x.title)).toContain('Fechar briefing')
    expect(s.map((x) => x.title)).toContain('Ligar pro contador')
    expect(s.length).toBeLessThanOrEqual(6)
  })
})

const weekGoal = (title: string, big: boolean): Goal => ({
  id: title,
  createdAt: '',
  updatedAt: '',
  level: 'semana',
  period: '2026-10-05',
  title,
  category: 'pessoal',
  big,
  status: 'ativa',
  order: 0,
})

describe('next week priorities → goals', () => {
  it('creates big weekly goals on next Monday, max 3, no duplicates', () => {
    const out = goalsForPriorities([weekGoal('Treinar 4x', true)], WEEK, [
      { title: 'treinar 4X', category: 'corpo' },
      { title: 'Fechar briefing', category: 'profissional' },
      { title: 'Ligar pro contador', category: 'pessoal' },
      { title: 'Quarta', category: 'pessoal' },
    ])
    expect(out.map((g) => g.title)).toEqual(['Fechar briefing', 'Ligar pro contador'])
    expect(out.every((g) => g.level === 'semana' && g.period === '2026-10-05' && g.big)).toBe(true)
  })

  it('keeps extras small when the week already has 3 big', () => {
    const out = goalsForPriorities([weekGoal('a', true), weekGoal('b', true), weekGoal('c', true)], WEEK, [
      { title: 'd', category: 'pessoal' },
    ])
    expect(out[0].big).toBe(false)
  })

  it('picks the week to review and finds existing reviews', () => {
    expect(reviewWeekFor('2026-10-02')).toBe(WEEK) // Friday → this week
    expect(reviewWeekFor('2026-10-05')).toBe(WEEK) // Monday → the week that just ended
    expect(nextMonday(WEEK)).toBe('2026-10-05')
    const r = { id: 'r', createdAt: '', updatedAt: '', weekStart: WEEK, answers: {}, nextPriorities: [] }
    expect(findWeeklyReview([r], WEEK)).toBe(r)
    expect(findWeeklyReview([r], '2026-10-05')).toBeUndefined()
  })
})
