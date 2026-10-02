import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { search, searchAll, topResults } from './engine'
import { buildFixture, FIXTURE_TODAY } from './test-fixture'

const db = buildFixture()
const today = FIXTURE_TODAY
const run = (q: string) => search(db, q, today)
const domains = (q: string) => run(q).groups.map((g) => g.domain)
const titles = (q: string) => run(q).groups.flatMap((g) => g.results.map((r) => r.title))

describe('search engine', () => {
  it('returns nothing for an empty query or empty db', () => {
    expect(run('  ').total).toBe(0)
    expect(search(emptyDB(), 'bike', today).total).toBe(0)
  })

  it('FashionFinder: project first, then everything linked to it', () => {
    const res = run('FashionFinder')
    expect(res.groups[0].domain).toBe('project')
    expect(res.groups[0].results[0]).toMatchObject({ title: 'FashionFinder', action: { kind: 'route', to: '/trabalho/projeto/proj-fashionfinder' } })
    expect(domains('fashionfinder')).toEqual(expect.arrayContaining(['task', 'milestone', 'win', 'workInbox', 'meeting', 'note']))
    // tasks found via the project name (secondary field) open the task sheet
    const task = res.groups.find((g) => g.domain === 'task')!.results[0]
    expect(task.action).toMatchObject({ kind: 'sheet', name: 'task' })
  })

  it('is accent-insensitive and multi-token AND', () => {
    expect(titles('africa')).toContain('África do Sul')
    expect(titles('ÁFRICA')).toContain('África do Sul')
    const capeTown = titles('cape town')
    expect(capeTown).toEqual(expect.arrayContaining(['Reservar tour Cape Point', 'Hospedagem em Cape Town', 'Lista de vinícolas perto de Cape Town']))
    // "cape" alone also matches Cape Point; "cape town" requires both words
    expect(titles('cape').length).toBeGreaterThan(0)
    expect(titles('cape xyz')).toEqual([])
  })

  it('Cape Town finds trip items, brain dump and tasks', () => {
    expect(domains('Cape Town')).toEqual(expect.arrayContaining(['tripItem', 'brainDump', 'task']))
  })

  it('safari finds trip items (incl. group) + brain dump + trip interests', () => {
    const res = run('safari')
    expect(domains('safari')).toEqual(expect.arrayContaining(['tripItem', 'brainDump', 'trip']))
    const items = res.groups.find((g) => g.domain === 'tripItem')!.results
    expect(items[0].title).toBe('Safari no Kruger')
    expect(items[0].action).toMatchObject({ kind: 'sheet', name: 'tripItem', props: { tripId: 'trip-africa' } })
  })

  it('bike matches bike, gravel and speed workouts plus anything mentioning bike', () => {
    const res = run('bike')
    const workouts = res.groups.find((g) => g.domain === 'workout')!.results
    expect(workouts.map((w) => w.title)).toContain('Gravel na represa')
    expect(titles('bike')).toEqual(expect.arrayContaining(['Revisão da bike gravel', 'Câmara de ar da bike']))
    expect(titles('bicicleta')).toContain('Gravel na represa')
  })

  it('corrida matches corrida and trail', () => {
    const w = run('corrida').groups.find((g) => g.domain === 'workout')!.results.map((r) => r.title)
    expect(w).toEqual(expect.arrayContaining(['Trail no Pico do Jaraguá', 'Corrida']))
  })

  it('gastos setembro → money summary of September', () => {
    const res = run('gastos setembro')
    expect(res.intent).toBe('money')
    expect(res.summary).toMatchObject({ periodLabel: 'em setembro', count: 6, totalCents: 197000 })
    expect(res.summary!.action).toEqual({ kind: 'route', to: '/dinheiro' })
    expect(res.summary!.topCategories[0].name).toBe('Viagem')
    expect(res.groups[0].results.every((r) => r.action.kind === 'sheet')).toBe(true)
  })

  it('gastos viagem / esporte / luna / semana', () => {
    expect(run('gastos viagem').summary).toMatchObject({ count: 1, totalCents: 120000, periodLabel: 'no total' })
    expect(run('gastos esporte').summary).toMatchObject({ count: 2, totalCents: 22500 })
    expect(run('gastos luna').summary).toMatchObject({ count: 1, totalCents: 21000, title: 'Gastos · Luna' })
    expect(run('gastos essa semana').summary).toMatchObject({ count: 4, totalCents: 30200 })
    expect(run('gastos').summary).toMatchObject({ periodLabel: 'este mês', count: 2 })
    expect(run('gastos esporte setembro').summary).toMatchObject({ count: 2 })
  })

  it('a month after today rolls back to last year', () => {
    expect(run('gastos dezembro').summary!.periodLabel).toBe('em dezembro de 2025')
  })

  it('livros → books grouped by status', () => {
    const res = run('livros')
    expect(res.intent).toBe('books')
    expect(res.groups.map((g) => g.label)).toEqual(['Lendo agora', 'Próximos da fila', 'Quero ler', 'Lidos'])
    expect(res.groups[1].results.map((r) => r.title)).toEqual(['O poder do hábito', 'Pequenas coisas como estas'])
    expect(res.groups[0].results[0].action).toMatchObject({ kind: 'route', to: expect.stringMatching(/^\/livros\//) })
  })

  it('estudo IA → the IA track items, currently studying first', () => {
    const res = run('estudo IA')
    expect(res.intent).toBe('study')
    expect(res.groups).toHaveLength(1)
    const t = res.groups[0].results.map((r) => r.title)
    expect(t).toEqual(['IA', 'Curso de LLMs aplicados', 'Prompt engineering na prática'])
  })

  it('"ia" alone does not match words that merely contain it (dia, média)', () => {
    expect(titles('ia')).not.toContain('Daily FashionFinder')
    expect(titles('ia')).toContain('IA')
  })

  it('Luna → the pet first, plus her tasks and expenses', () => {
    const res = run('Luna')
    expect(res.groups[0].domain).toBe('luna')
    expect(res.groups[0].results[0]).toMatchObject({ title: 'Luna', action: { kind: 'route', to: '/vida/luna' } })
    expect(titles('luna')).toEqual(expect.arrayContaining(['Banho da Luna', 'Comprar ração da Luna', 'Ração da Luna']))
  })

  it('UGC → creator project, content, partnerships and brain dump', () => {
    expect(domains('UGC')).toEqual(expect.arrayContaining(['project', 'content', 'partnership', 'brainDump']))
  })

  it('ranks title matches above other-field matches and done items lower', () => {
    const all = searchAll(db, 'fashionfinder', today)
    expect(all[0].title).toBe('FashionFinder')
    const briefing = searchAll(db, 'briefing', today)
    expect(briefing[0].title).toBe('Ler briefing antigo')
  })

  it('topResults flattens best results', () => {
    expect(topResults(run('cape town'), 2)).toHaveLength(2)
  })
})
