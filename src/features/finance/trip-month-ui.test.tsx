/** Finanças on the real screen: the month's ZAR trip lines get their own section, the BRL totals stay in reais. */
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { actions, applyModuleSeeds, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { SEED_IDS } from '@/data/seed/ids'
import type { Expense } from '@/data/types'
import FinancePage from './FinancePage'

const AT = '2026-11-06T10:00:00.000Z'
const line = (id: string, p: Partial<Expense>): Expense => ({ id, createdAt: AT, updatedAt: AT, title: id, amountCents: 10000, categoryId: 'cat-viagem', status: 'paid', origin: 'manual', date: '2026-11-05', tripId: SEED_IDS.tripAfrica, currency: 'ZAR', ...p })

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T15:00:00.000Z'))
})
afterAll(() => vi.useRealTimers())
beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(applyModuleSeeds(buildSeed('2026-11-08'), '2026-11-08'))
})
afterEach(cleanup)

const renderPage = () =>
  render(
    <MemoryRouter>
      <FinancePage />
    </MemoryRouter>,
  )

describe('Finanças · Viagem section', () => {
  it('shows the month in ZAR by category; no BRL equivalent without a documented rate', () => {
    const db = getDB()
    const trip = db.trips.find((t) => t.id === SEED_IDS.tripAfrica)!
    actions.replaceDB({
      ...db,
      trips: db.trips.map((t) => (t.id === trip.id ? { ...t, expedition: t.expedition ? { ...t.expedition, fxRates: undefined } : t.expedition } : t)),
      expenses: [...db.expenses, line('z1', { amountCents: 25000, tripCategory: 'uber' }), line('z2', { amountCents: 50000, tripCategory: 'alimentacao' }), line('z3', { amountCents: 90000, status: 'cancelled' })],
    })
    renderPage()
    expect(trip.expedition?.currency).toBe('ZAR')
    const sec = screen.getByLabelText('Viagem · África do Sul')
    expect(within(sec).getByText('Uber')).toBeTruthy()
    expect(within(sec).getByText('Alimentação')).toBeTruthy()
    expect(sec.textContent).toMatch(/750/)
    expect(sec.textContent).toMatch(/Sem conversão documentada/)
  })

  it('with a documented rate: BRL equivalent + its source', () => {
    const db = getDB()
    actions.replaceDB({
      ...db,
      trips: db.trips.map((t) => (t.id === SEED_IDS.tripAfrica && t.expedition ? { ...t, expedition: { ...t.expedition, fxRates: [{ date: '2026-11-06', brlPerUnit: 0.3, source: 'conversão Wise' }] } } : t)),
      expenses: [...db.expenses, line('z1', { amountCents: 100000, tripCategory: 'tours' })],
    })
    renderPage()
    expect(screen.getByText(/taxa da conversão Wise de 06\/11/)).toBeTruthy()
    expect(screen.getByText(/R\$\s?300,00/)).toBeTruthy()
  })
})
