import { describe, expect, it } from 'vitest'
import type { Expense, FinancialCategory, IntegrationConnection, Trip } from '@/data/types'
import { defaultCategories } from '@/data/defaults'
import {
  budgetText,
  categoriesByUsage,
  categoryBreakdown,
  comparePeriods,
  comparisonText,
  duplicatePairs,
  groupByDay,
  lastPaymentMethod,
  organizzeState,
  periodLabel,
  periodRange,
  plannedSplit,
  shiftPeriod,
  sportSpend,
  topTotals,
  tripSpend,
} from './selectors'

const sp = (s: string | undefined) => s?.replace(/\u00a0/g, ' ')

let n = 0
function exp(p: Partial<Expense>): Expense {
  n += 1
  return {
    id: p.id ?? `e${n}`,
    createdAt: p.createdAt ?? `2026-10-01T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
    updatedAt: '2026-10-01T10:00:00.000Z',
    title: 'x',
    amountCents: 1000,
    categoryId: 'cat-mercado',
    status: 'paid',
    origin: 'manual',
    date: '2026-10-02',
    ...p,
  }
}

const cats: FinancialCategory[] = defaultCategories('2026-01-01T00:00:00.000Z')
const TODAY = '2026-10-02' // sexta-feira

describe('periods', () => {
  it('week starts on Monday and month covers the whole month', () => {
    expect(periodRange('week', TODAY)).toEqual({ from: '2026-09-28', to: '2026-10-04' })
    expect(periodRange('month', TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })
  it('shifts periods', () => {
    expect(shiftPeriod('week', TODAY, -1)).toBe('2026-09-25')
    expect(shiftPeriod('month', '2026-03-31', -1)).toBe('2026-02-01')
  })
  it('labels periods kindly', () => {
    expect(periodLabel('week', TODAY, TODAY)).toBe('Esta semana')
    expect(periodLabel('week', '2026-09-22', TODAY)).toBe('Semana passada')
    expect(periodLabel('month', TODAY, TODAY)).toBe('Este mês')
    expect(periodLabel('month', '2026-09-10', TODAY)).toBe('Setembro de 2026')
  })
})

describe('totals', () => {
  it('ignores planned purchases and sums today/week/month', () => {
    const list = [
      exp({ amountCents: 500 }),
      exp({ amountCents: 700, date: '2026-09-29' }),
      exp({ amountCents: 900, date: '2026-09-15' }),
      exp({ amountCents: 9999, status: 'planned_purchase', date: undefined }),
    ]
    expect(topTotals(list, TODAY)).toEqual({ today: 500, week: 1200, month: 500 })
  })
})

describe('comparePeriods', () => {
  it('compares month-to-date with the same days of the previous month', () => {
    const list = [
      exp({ amountCents: 10000, date: '2026-10-01' }),
      exp({ amountCents: 18000, date: '2026-09-02' }),
      exp({ amountCents: 50000, date: '2026-09-20' }), // outside the like-for-like window
    ]
    const c = comparePeriods(list, 'month', TODAY, TODAY)
    expect(c.partial).toBe(true)
    expect(c.previousRange).toEqual({ from: '2026-09-01', to: '2026-09-02' })
    expect(c.current).toBe(10000)
    expect(c.previous).toBe(18000)
    expect(sp(comparisonText(c))).toBe('R$ 80 a menos que no mês passado até hoje')
  })
  it('clamps to the end of a shorter previous month', () => {
    const c = comparePeriods([], 'month', '2026-03-31', '2026-03-31')
    expect(c.partial).toBe(false)
    expect(c.previousRange).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('says "parecido" for small differences and stays silent without data', () => {
    const list = [exp({ amountCents: 10000, date: '2026-09-29' }), exp({ amountCents: 10500, date: '2026-09-22' })]
    expect(comparisonText(comparePeriods(list, 'week', TODAY, TODAY))).toBe('parecido com a semana passada até hoje')
    expect(comparisonText(comparePeriods([], 'week', TODAY, TODAY))).toBeUndefined()
  })
  it('compares full past weeks', () => {
    const c = comparePeriods([exp({ amountCents: 30000, date: '2026-09-27' })], 'week', '2026-09-22', TODAY)
    expect(c.partial).toBe(false)
    expect(c.previousRange).toEqual({ from: '2026-09-14', to: '2026-09-20' })
    expect(comparisonText(c)).toMatch(/sem registros/)
  })
})

describe('categories', () => {
  it('breaks down by category, biggest first', () => {
    const list = [
      exp({ amountCents: 100, categoryId: 'cat-mercado' }),
      exp({ amountCents: 300, categoryId: 'cat-restaurante' }),
      exp({ amountCents: 150, categoryId: 'cat-mercado' }),
    ]
    const b = categoryBreakdown(list, cats)
    expect(b.map((r) => [r.categoryId, r.cents, r.count])).toEqual([
      ['cat-restaurante', 300, 1],
      ['cat-mercado', 250, 2],
    ])
    expect(b[0].category?.name).toBe('Restaurante')
  })
  it('writes neutral budget copy', () => {
    const mercado = { ...cats[1], budgetCents: 50000 }
    expect(sp(budgetText(mercado, 38000))).toBe('R$ 120 livres no orçamento de Mercado')
    expect(sp(budgetText(mercado, 52000))).toBe('R$ 20 além do orçamento de Mercado')
    expect(budgetText(cats[0], 100)).toBeUndefined()
  })
  it('orders categories by usage and hides archived', () => {
    const list = [exp({ categoryId: 'cat-luna' }), exp({ categoryId: 'cat-luna' }), exp({ categoryId: 'cat-beleza' })]
    const withArchived = cats.map((c) => (c.id === 'cat-casa' ? { ...c, archived: true } : c))
    const ordered = categoriesByUsage(withArchived, list)
    expect(ordered.slice(0, 2).map((c) => c.id)).toEqual(['cat-luna', 'cat-beleza'])
    expect(ordered.some((c) => c.id === 'cat-casa')).toBe(false)
  })
  it('remembers the last manual payment method', () => {
    const list = [
      exp({ payment: 'pix', createdAt: '2026-10-01T09:00:00.000Z' }),
      exp({ payment: 'debito', createdAt: '2026-10-02T09:00:00.000Z' }),
      exp({ payment: 'credito', createdAt: '2026-10-03T09:00:00.000Z', origin: 'organizze' }),
    ]
    expect(lastPaymentMethod(list)).toBe('debito')
    expect(lastPaymentMethod([])).toBeUndefined()
  })
})

describe('planned vs unplanned', () => {
  it('splits by the planned flag and keeps unmarked apart', () => {
    const s = plannedSplit([exp({ planned: true, amountCents: 100 }), exp({ planned: false, amountCents: 200 }), exp({ amountCents: 400 })])
    expect(s).toEqual({ planned: 100, unplanned: 200, unmarked: 400 })
  })
})

describe('questions', () => {
  it('sums sport spend by category', () => {
    const list = [exp({ categoryId: 'cat-esporte', amountCents: 2500 }), exp({ categoryId: 'cat-mercado' })]
    expect(sportSpend(list, cats, { from: '2026-10-01', to: '2026-10-31' })).toBe(2500)
  })
  it('sums trip spend by tripId plus unlinked Viagem category', () => {
    const trip = { id: 't1', name: 'Recife' } as Trip
    const list = [
      exp({ tripId: 't1', amountCents: 1000, categoryId: 'cat-restaurante' }),
      exp({ tripId: 't1', amountCents: 500, categoryId: 'cat-viagem' }),
      exp({ categoryId: 'cat-viagem', amountCents: 700 }),
      exp({ categoryId: 'cat-viagem', amountCents: 700, status: 'planned_purchase' }),
    ]
    const r = tripSpend(list, [trip], cats)
    expect(r.byTrip).toEqual([{ trip, cents: 1500, count: 2 }])
    expect(r.unlinked).toEqual({ cents: 700, count: 1 })
  })
})

describe('groupByDay', () => {
  it('groups consecutive days', () => {
    const g = groupByDay([exp({ date: '2026-10-02' }), exp({ date: '2026-10-02' }), exp({ date: '2026-10-01' })])
    expect(g.map((d) => [d.date, d.items.length, d.cents])).toEqual([
      ['2026-10-02', 2, 2000],
      ['2026-10-01', 1, 1000],
    ])
  })
})

describe('duplicates', () => {
  it('pairs flagged expenses once and keeps the imported one', () => {
    const manual = exp({ id: 'm1' })
    const imported = exp({ id: 'o1', origin: 'organizze', possibleDuplicateOf: 'm1' })
    const pairs = duplicatePairs([manual, imported, exp({ possibleDuplicateOf: 'missing' })])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].keep.id).toBe('o1')
    expect(pairs[0].drop.id).toBe('m1')
  })
  it('works when the manual one carries the flag', () => {
    const pairs = duplicatePairs([exp({ id: 'm2', possibleDuplicateOf: 'o2' }), exp({ id: 'o2', origin: 'organizze' })])
    expect(pairs[0].keep.id).toBe('o2')
    expect(pairs[0].drop.id).toBe('m2')
  })
})

describe('organizzeState', () => {
  it('is off without a connection and connected only with the flag on', () => {
    expect(organizzeState([], false).state).toBe('off')
    const conn: IntegrationConnection = { id: 'i', provider: 'organizze', status: 'connected', scopes: [], createdAt: '', updatedAt: '' }
    expect(organizzeState([conn], false).state).toBe('off')
    expect(organizzeState([conn], true).state).toBe('connected')
    expect(organizzeState([{ ...conn, status: 'needs_config' }], true).state).toBe('needs_setup')
  })
})
