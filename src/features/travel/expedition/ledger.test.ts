import { describe, expect, it } from 'vitest'
import type { Expense, Trip, TripItem } from '@/data/types'
import { emptyDB } from '@/data/defaults'
import { paidExpenses } from '@/data/selectors'
import { budgetByCategory, confirmedSpend } from './command'

const trip = { id: 't', name: 'ZA', expedition: { currency: 'ZAR', marginPct: 15, timeZone: 'Africa/Johannesburg' } } as unknown as Trip
const item = (p: Partial<TripItem>) => ({ id: p.id ?? 'i', tripId: 't', section: 'esporte', title: 'Surf', status: 'feito', order: 0, createdAt: '', updatedAt: '', ...p }) as TripItem
const line = (p: Partial<Expense>) =>
  ({ id: p.id ?? 'e', title: 'x', amountCents: 0, date: '2026-10-28', categoryId: 'c', status: 'paid', origin: 'manual', tripId: 't', currency: 'ZAR', createdAt: '', updatedAt: '', ...p }) as Expense

describe('trip statement (ZAR) lines', () => {
  const items = [item({ id: 'surf', date: '2026-10-28', paidCents: 150000, uberCents: 30000 }), item({ id: 'next', date: '2026-11-01', paidCents: 109000 })]
  const ledger = [line({ id: 'a', amountCents: 122000, tripCategory: 'treinos' }), line({ id: 'b', amountCents: 18994, tripCategory: 'uber' })]

  it('replace the items paid/uber on the days they cover, and add up elsewhere', () => {
    expect(confirmedSpend(trip, items)).toBe(150000 + 30000 + 109000)
    expect(confirmedSpend(trip, items, ledger)).toBe(122000 + 18994 + 109000)
    const rows = Object.fromEntries(budgetByCategory(trip, items, ledger).map((r) => [r.category, r]))
    expect(rows.uber.paid).toBe(18994)
    expect(rows.treinos.paid).toBe(122000 + 109000)
  })

  it('never enter a BRL total', () => {
    const db = { ...emptyDB(), expenses: [...ledger, line({ id: 'brl', currency: undefined, tripId: undefined, amountCents: 5000 })] }
    expect(paidExpenses(db).map((e) => e.id)).toEqual(['brl'])
  })
})
