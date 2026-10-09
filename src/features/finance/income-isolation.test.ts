/** Income never enters any sum of spending: month totals, categories, comparisons, trips, search, Lumos, CSV. */
import { beforeEach, describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { actions, getDB, useStore } from '@/data/store'
import { addExtraIncome, ensureReceivables, markReceived, receivableId } from '@/data/finance/receivables'
import { spendSummary, expensesBetween } from '@/data/selectors'
import { categoryBreakdown, comparePeriods, paidBetween, topTotals } from './selectors'
import { search } from '@/features/search/engine'
import { askLumos } from '@/features/assistant/chief'
import { buildDataset } from '@/features/settings/csv'
import { FINANCE_SEED_IDS } from './seed'

const TODAY = '2026-10-20'
const SAN = receivableId(FINANCE_SEED_IDS.contractSantander, '2026-10')

beforeEach(() => {
  useStore.setState({ db: buildSeed(TODAY), hydrated: true })
  ensureReceivables(TODAY)
  markReceived(SAN, { at: `${TODAY}T10:00:00.000-03:00`, amountCents: 1_850_000 })
  addExtraIncome({ title: 'Freela', amountCents: 300_000, date: TODAY, received: true })
  actions.create('expenses', { title: 'Mercado', amountCents: 12_345, date: TODAY, categoryId: 'cat-mercado', status: 'paid', origin: 'manual' })
})

describe('receita nunca vira gasto', () => {
  it('month/week/day totals and comparisons count only the R$ 123,45 spent', () => {
    expect(spendSummary(getDB(), TODAY)).toEqual({ today: 12_345, week: 12_345, month: 12_345 })
    expect(topTotals(getDB().expenses, TODAY)).toEqual({ today: 12_345, week: 12_345, month: 12_345 })
    expect(comparePeriods(getDB().expenses, 'month', TODAY, TODAY).current).toBe(12_345)
    expect(expensesBetween(getDB(), '2026-10-01', '2026-10-31').map((e) => e.title)).toEqual(['Mercado'])
  })

  it('categories never show income', () => {
    const cats = categoryBreakdown(paidBetween(getDB().expenses, '2026-10-01', '2026-10-31'), getDB().financialCategories)
    expect(cats.reduce((s, c) => s + c.cents, 0)).toBe(12_345)
  })

  it('even an income record carrying a spending status is not counted (defense in depth)', () => {
    actions.update('expenses', SAN, { status: 'paid' as never })
    expect(spendSummary(getDB(), TODAY).month).toBe(12_345)
  })

  it('search "gastos de outubro" and Lumos "quanto gastei este mês?" don\'t add income', () => {
    const r = search(getDB(), 'gastos este mês', TODAY)
    expect(JSON.stringify(r)).not.toMatch(/18\.500|Freela/)
    const a = askLumos(getDB(), 'quanto gastei este mês?', TODAY, 600)
    expect(JSON.stringify(a)).toMatch(/123,45/)
    expect(JSON.stringify(a)).not.toMatch(/18\.500|21\.|Freela/)
  })

  it('the "gastos" CSV has spending only', () => {
    const csv = buildDataset(getDB(), 'gastos')
    expect(csv.rows.map((r) => r[1])).toEqual(['Mercado'])
  })

  it('received keeps expected and actual on the same record; the contract is untouched', () => {
    const recs = getDB().expenses.filter((e) => e.contractId === FINANCE_SEED_IDS.contractSantander && e.period === '2026-10')
    expect(recs).toHaveLength(1)
    expect(recs[0]).toMatchObject({ type: 'income', status: 'received', expectedAmountCents: 2_000_000, receivedAmountCents: 1_850_000 })
    expect(getDB().contracts.find((c) => c.id === FINANCE_SEED_IDS.contractSantander)).toMatchObject({ amountCents: 2_000_000, paymentDay: 15 })
  })
})

describe('contracts seed (gross, editable, nothing inferred)', () => {
  it('Santander R$ 20.000 day 15 · Fashion Finder R$ 10.000 day 30 — no tax/net/readjustment/fine/interest fields', () => {
    const cs = getDB().contracts.map((c) => ({ client: c.client, amountCents: c.amountCents, paymentDay: c.paymentDay, status: c.status }))
    expect(cs).toEqual([
      { client: 'Santander', amountCents: 2_000_000, paymentDay: 15, status: 'ativo' },
      { client: 'Fashion Finder', amountCents: 1_000_000, paymentDay: 30, status: 'ativo' },
    ])
    const keys = new Set(getDB().contracts.flatMap((c) => Object.keys(c)))
    for (const k of keys) expect(k).not.toMatch(/tax|imposto|net|liquid|reajuste|readjust|multa|fine|juros|interest/i)
  })
})
