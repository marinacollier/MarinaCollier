import { describe, expect, it } from 'vitest'
import type { Expense, Trip, TripExpedition } from '@/data/types'
import { paidExpenses } from '@/data/selectors'
import { confirmedSpend } from '@/features/travel/expedition/command'
import { topTotals } from './selectors'
import { fxRateLabel, latestFxRate, tripMonthSpend, tripPlaceLabel } from './trip-month'

const TODAY = '2026-11-08'
let n = 0
function exp(p: Partial<Expense>): Expense {
  n += 1
  return {
    id: `e${n}`,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    title: 'x',
    amountCents: 10000,
    categoryId: 'cat-viagem',
    status: 'paid',
    origin: 'manual',
    date: '2026-11-03',
    ...p,
  }
}
const EXP: TripExpedition = { timeZone: 'Africa/Johannesburg', currency: 'ZAR', marginPct: 15, emergencyContacts: [] }
function trip(expedition: Partial<TripExpedition> = {}): Trip {
  return {
    id: 'trip-za',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    name: 'África do Sul',
    flag: '🇿🇦',
    datesConfirmed: true,
    interests: [],
    tone: 'ocean',
    links: [],
    status: 'em_andamento',
    order: 0,
    expedition: { ...EXP, ...expedition },
  } as Trip
}

const zar = (p: Partial<Expense>) => exp({ tripId: 'trip-za', currency: 'ZAR', ...p })

describe('Finanças · Viagem (ZAR in its own currency)', () => {
  const lines = [
    zar({ amountCents: 25000, tripCategory: 'uber' }),
    zar({ amountCents: 15000, tripCategory: 'uber', date: '2026-11-05' }),
    zar({ amountCents: 80000, tripCategory: 'alimentacao' }),
    zar({ amountCents: 99999, tripCategory: 'tours', status: 'cancelled' }),
    zar({ amountCents: 50000, tripCategory: 'tours', date: '2026-10-30' }), // other month
    zar({ amountCents: 7000, type: 'income', status: 'received' }),
    exp({ tripId: 'trip-za', currency: 'BRL', amountCents: 300000 }), // already in BRL totals
  ]

  it('sums the month in ZAR by trip category; cancelled, income, BRL and other months never count', () => {
    const [r] = tripMonthSpend([trip()], lines, TODAY)
    expect(r.currency).toBe('ZAR')
    expect(r.cents).toBe(120000)
    expect(r.count).toBe(3)
    expect(r.byCategory).toEqual([
      { category: 'alimentacao', cents: 80000, count: 1 },
      { category: 'uber', cents: 40000, count: 2 },
    ])
  })

  it('no documented rate → no BRL figure (the typed rateToBRL is not documentation)', () => {
    const [r] = tripMonthSpend([trip({ rateToBRL: 0.3 })], lines, TODAY)
    expect(r.brl).toBeUndefined()
  })

  it('uses the latest documented rate, with its source', () => {
    const t = trip({
      fxRates: [
        { date: '2026-11-06', brlPerUnit: 0.31, source: 'conversão Wise' },
        { date: '2026-10-20', brlPerUnit: 0.29, source: 'conversão Wise' },
      ],
    })
    expect(latestFxRate(t)?.date).toBe('2026-11-06')
    const [r] = tripMonthSpend([t], lines, TODAY)
    expect(r.brl).toEqual({ cents: Math.round(120000 * 0.31), rate: { date: '2026-11-06', brlPerUnit: 0.31, source: 'conversão Wise' } })
    expect(fxRateLabel(r.brl!.rate)).toBe('taxa da conversão Wise de 06/11')
  })

  it('ZAR never enters the BRL totals, even with a rate (no mixing, no double count)', () => {
    const t = trip({ fxRates: [{ date: '2026-11-06', brlPerUnit: 0.31, source: 'conversão Wise' }] })
    const brlOnly = lines.filter((e) => (e.currency ?? 'BRL') === 'BRL')
    expect(topTotals(brlOnly, TODAY).month).toBe(300000)
    expect(paidExpenses({ expenses: lines } as never).every((e) => (e.currency ?? 'BRL') === 'BRL')).toBe(true)
    expect(tripMonthSpend([t], lines, TODAY)[0].cents).toBe(120000)
  })

  it('single source: the Expedição reads the same ZAR lines (all months, cancelled excluded)', () => {
    const zarOnly = lines.filter((e) => e.currency === 'ZAR')
    expect(confirmedSpend(trip(), [], zarOnly)).toBe(120000 + 50000)
  })

  it('labels the section with the country linked in Lugares, else the trip name', () => {
    const t = trip()
    expect(tripPlaceLabel(t, [{ id: 'p', createdAt: '', updatedAt: '', name: 'África do Sul', kind: 'pais', tripIds: ['trip-za'] } as never])).toBe('África do Sul')
    expect(tripPlaceLabel(t, [])).toBe('África do Sul')
    expect(tripPlaceLabel({ ...t, name: 'South Africa 2026' }, [])).toBe('South Africa 2026')
  })

  it('a trip in BRL or without lines this month shows nothing', () => {
    expect(tripMonthSpend([trip({ currency: 'BRL' })], lines, TODAY)).toEqual([])
    expect(tripMonthSpend([trip()], lines, '2026-12-01')).toEqual([])
  })
})
