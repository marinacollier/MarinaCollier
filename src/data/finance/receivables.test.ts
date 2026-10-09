import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { buildSeed } from '../seed'
import { FINANCE_SEED_IDS } from '@/features/finance/seed'
import { topTotals } from '@/features/finance/selectors'
import {
  addExtraIncome,
  cancelReceivable,
  ensureReceivables,
  expectedDateFor,
  findContract,
  markExpected,
  markReceived,
  monthIncome,
  receivableId,
  receivableStatus,
  receivablesFor,
  updateContract,
} from './receivables'

const OCT = '2026-10'
const SAN = FINANCE_SEED_IDS.contractSantander
const FF = FINANCE_SEED_IDS.contractFashionFinder

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed('2026-10-09'))
})

describe('contracts → receivables', () => {
  it('seeds exactly the two contracts she informed (gross, editable, nothing received)', () => {
    const db = getDB()
    expect(db.contracts.map((c) => [c.client, c.amountCents, c.paymentDay, c.status])).toEqual([
      ['Santander', 2_000_000, 15, 'ativo'],
      ['Fashion Finder', 1_000_000, 30, 'ativo'],
    ])
    expect(db.expenses.filter((e) => e.type === 'income')).toHaveLength(0)
  })

  it('each month expects them as "previsto" on day 15 and day 30; one record per contract per month, idempotent', () => {
    ensureReceivables('2026-10-09')
    ensureReceivables('2026-10-09')
    const income = getDB().expenses.filter((e) => e.type === 'income')
    expect(income.map((e) => e.id).sort()).toEqual([receivableId(FF, '2026-10'), receivableId(FF, '2026-11'), receivableId(SAN, '2026-10'), receivableId(SAN, '2026-11')].sort())
    const oct = monthIncome(getDB(), OCT, '2026-10-09')
    expect(oct.items.map((e) => [e.title, e.expectedDate, e.effective])).toEqual([
      ['Santander', '2026-10-15', 'expected'],
      ['Fashion Finder', '2026-10-30', 'expected'],
    ])
    expect(oct.grossCents).toBe(3_000_000)
    expect(oct.receivedCents).toBe(0)
  })

  it('never becomes received because the date passed — it becomes "atrasado" (derived)', () => {
    ensureReceivables('2026-10-09')
    const san = getDB().expenses.find((e) => e.id === receivableId(SAN, OCT))!
    expect(receivableStatus(san, '2026-10-16')).toBe('overdue')
    expect(getDB().expenses.find((e) => e.id === san.id)?.status).toBe('expected')
    expect(monthIncome(getDB(), OCT, '2026-10-16').overdueCents).toBe(2_000_000)
  })

  it('previsto → recebido evolves the SAME record (no duplicate), with receivedAt; undo restores', () => {
    ensureReceivables('2026-10-09')
    const before = getDB().expenses.length
    const undo = markReceived(receivableId(SAN, OCT), { at: '2026-10-15T10:00:00.000-03:00' })
    const rec = getDB().expenses.find((e) => e.id === receivableId(SAN, OCT))!
    expect(getDB().expenses.length).toBe(before)
    expect(rec).toMatchObject({ status: 'received', receivedAt: '2026-10-15T10:00:00.000-03:00', receivedAmountCents: 2_000_000 })
    expect(getDB().lifeLog.at(-1)?.title).toMatch(/Recebeu Santander/)
    undo()
    expect(getDB().expenses.find((e) => e.id === rec.id)?.status).toBe('expected')
    expect(getDB().lifeLog.some((l) => /Recebeu Santander/.test(l.title))).toBe(false)
  })

  it('a different received amount is kept as received; "ainda não caiu" goes back to previsto', () => {
    ensureReceivables('2026-10-09')
    markReceived(receivableId(FF, OCT), { amountCents: 950_000 })
    expect(monthIncome(getDB(), OCT, '2026-10-31').receivedCents).toBe(950_000)
    markExpected(receivableId(FF, OCT))
    expect(getDB().expenses.find((e) => e.id === receivableId(FF, OCT))).toMatchObject({ status: 'expected', amountCents: 1_000_000, receivedAt: undefined })
  })

  it('works even before the month was materialized (virtual → stored once)', () => {
    const id = receivableId(SAN, '2026-12')
    expect(receivablesFor(getDB(), '2026-12').some((e) => e.id === id)).toBe(true)
    markReceived(id)
    markReceived(id)
    expect(getDB().expenses.filter((e) => e.id === id)).toHaveLength(1)
  })

  it('cancelling a month keeps the contract; contract edits flow only into months still previsto', () => {
    ensureReceivables('2026-10-09')
    cancelReceivable(receivableId(FF, '2026-11'))
    markReceived(receivableId(SAN, OCT))
    updateContract(SAN, { amountCents: 2_200_000, paymentDay: 10 }, '2026-10-09')
    const db = getDB()
    expect(db.expenses.find((e) => e.id === receivableId(SAN, OCT))?.receivedAmountCents).toBe(2_000_000)
    expect(db.expenses.find((e) => e.id === receivableId(SAN, '2026-11'))).toMatchObject({ amountCents: 2_200_000, expectedDate: '2026-11-10' })
    expect(db.expenses.find((e) => e.id === receivableId(FF, '2026-11'))?.status).toBe('cancelled')
  })

  it('day 30 in February is the last day of the month', () => {
    expect(expectedDateFor({ paymentDay: 30 }, '2027-02')).toBe('2027-02-28')
  })

  it('extra income is separate from contracts', () => {
    addExtraIncome({ title: 'Mentoria', amountCents: 150_000, date: '2026-10-05', received: true })
    const oct = monthIncome(getDB(), OCT, '2026-10-09')
    expect(oct.extraCents).toBe(150_000)
    expect(oct.receivedCents).toBe(150_000)
  })

  it('income never shows up as spending', () => {
    ensureReceivables('2026-10-09')
    markReceived(receivableId(SAN, OCT), { at: '2026-10-09T10:00:00.000-03:00' })
    expect(topTotals(getDB().expenses, '2026-10-09').month).toBe(0)
  })

  it('finds contracts by name or alias, never guesses between two', () => {
    expect(findContract(getDB(), 'recebi o santander hoje')?.id).toBe(SAN)
    expect(findContract(getDB(), 'o fashion finder ainda não pagou')?.id).toBe(FF)
    expect(findContract(getDB(), 'recebi')).toBeUndefined()
  })
})
