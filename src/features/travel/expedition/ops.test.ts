/**
 * Brief operacional 01/11 — financial close (no double counting with the ZAR statement), what is left to book
 * (planned is never reserved), tomorrow's checklist and the one stored value (original budget).
 */
import { describe, expect, it } from 'vitest'
import type { Expense, Trip, TripItem } from '@/data/types'
import { buildSeed } from '@/data/seed'
import { applyExpeditionSeed } from '@/data/seed/expedition'
import { applyMaster1031 } from '@/data/seed/master-1031'
import { applyOps1101, OPS_1101_ID, ORIGINAL_BUDGET_CENTS } from '@/data/seed/ops-1101'
import { SEED_IDS } from '@/data/seed/ids'
import { confirmedSpend } from './command'
import { daySpend, financialClose, isEssential, toBook, tomorrowChecklist } from './ops'

const at = '2026-11-01T10:00:00.000Z'
let n = 0
const item = (p: Partial<TripItem>): TripItem => ({ id: `i${n++}`, createdAt: at, updatedAt: at, tripId: 't', section: 'reserva', title: 'x', status: 'a_confirmar', order: n, ...p })
const line = (p: Partial<Expense>) =>
  ({ id: `e${n++}`, title: 'x', amountCents: 0, date: '2026-10-28', categoryId: 'c', status: 'paid', origin: 'manual', tripId: 't', currency: 'ZAR', createdAt: at, updatedAt: at, ...p }) as Expense
const trip = (exp: Record<string, unknown> = {}) =>
  ({ id: 't', name: 'ZA', startDate: '2026-10-24', endDate: '2026-11-16', expedition: { timeZone: 'Africa/Johannesburg', currency: 'ZAR', marginPct: 10, emergencyContacts: [], ...exp } }) as unknown as Trip

describe('financial close', () => {
  const items = [
    // 28/10 is covered by the statement: its paid and Uber must not count again.
    item({ id: 'surf', section: 'esporte', status: 'feito', date: '2026-10-28', paidCents: 150000, uberCents: 30000 }),
    // Paid on a day the statement doesn't cover: counts.
    item({ id: 'cp', status: 'feito', date: '2026-11-01', paidCents: 109000 }),
    // Reserved with proof, not paid: committed.
    item({ id: 'res', date: '2026-11-10', bookingStatus: 'reservado', proof: 'e-mail', quotedCents: 80000 }),
    // Planned / quoted / awaiting: estimated.
    item({ id: 'tm', date: '2026-11-03', bookingStatus: 'a_reservar', estimatedCents: 47500 }),
    item({ id: 'gr', date: '2026-11-07', bookingStatus: 'aguardando_resposta', quotedCents: 400000, estimatedCents: 999999 }),
    // "Reservado" without proof is planned, never committed.
    item({ id: 'np', date: '2026-11-11', bookingStatus: 'reservado', estimatedCents: 10000 }),
    // Extras stay out (offered as savings), cancelled out.
    item({ id: 'ext', optional: true, bookingStatus: 'opcional', estimatedCents: 200000, title: 'Parapente' }),
    item({ id: 'cx', status: 'cancelado', quotedCents: 500000 }),
    // Without a value: counted as missing, never guessed.
    item({ id: 'nv', section: 'hospedagem', date: '2026-11-13', bookingStatus: 'a_reservar', title: 'Hotel OR Tambo' }),
  ]
  const ledger = [line({ amountCents: 122000, tripCategory: 'treinos' }), line({ amountCents: 18994, tripCategory: 'uber' })]

  it('paid = statement + items paid on other days (never both); committed and estimated apart', () => {
    const f = financialClose(trip(), items, ledger)
    expect(f.paidLedger).toBe(122000 + 18994)
    expect(f.paidItems).toBe(109000)
    expect(f.paid).toBe(confirmedSpend(trip(), items, ledger))
    expect(f.committed).toBe(80000)
    expect(f.committedLines.map((l) => l.item.id)).toEqual(['res'])
    expect(f.estimatedLines.map((l) => [l.item.id, l.cents, l.kind])).toEqual([
      ['tm', 47500, 'referência'],
      ['gr', 400000, 'cotado'],
      ['np', 10000, 'referência'],
    ])
    expect(f.projected).toBe(f.paid + 80000 + 457500)
    expect(f.withoutValue.map((i) => i.id)).toEqual(['nv'])
  })

  it('without the statement the items count, still once', () => {
    const f = financialClose(trip(), items, [])
    expect(f.paid).toBe(150000 + 30000 + 109000)
    expect(f.paid).toBe(confirmedSpend(trip(), items, []))
  })

  it('the budget is a reference: remaining is computed, risk follows the projection', () => {
    expect(financialClose(trip(), items, ledger).risk).toBe('sem_orcamento')
    // Her budget is in rand (the trip currency): compared directly, no rate needed.
    const f = financialClose(trip({ budgetCents: 10_000_000 }), items, ledger)
    expect(f.budget!.inTrip).toBe(10_000_000)
    expect(f.budget!.remaining).toBe(10_000_000 - f.projected)
    expect(f.budget!.remainingAfterPaid).toBe(10_000_000 - f.paid)
    expect(f.risk).toBe('ok')
    // Projected ≈ ZAR 7.875: over ZAR 5.000 → alto; ZAR 8.000 is under it but not with the 10% margin → atenção.
    expect(financialClose(trip({ budgetCents: 500_000 }), items, ledger).risk).toBe('alto')
    expect(financialClose(trip({ budgetCents: 800_000 }), items, ledger).risk).toBe('atencao')
  })

  it('a BRL statement line without a rate is kept apart, not silently dropped', () => {
    const f = financialClose(trip(), [], [line({ currency: 'BRL', amountCents: 50000, date: '2026-10-20' })])
    expect(f.paid).toBe(0)
    expect(f.unconverted).toEqual([{ currency: 'BRL', cents: 50000 }])
  })

  it('savings follow her rules: extras first, never essential logistics', () => {
    const p2 = [item({ id: 'p2', date: '2026-11-11', bookingStatus: 'planejado', priority: 'P2', estimatedCents: 30000, title: 'Kalk Bay' }), item({ id: 'p2h', section: 'hospedagem', date: '2026-11-12', priority: 'P2', estimatedCents: 90000, title: 'Hotel extra' })]
    const f = financialClose(trip(), [...items, ...p2], ledger)
    expect(f.savings[0]).toMatch(/Extras opcionais somam .*Parapente/)
    expect(f.savings.join(' ')).toMatch(/Kalk Bay/)
    expect(f.savings.join(' ')).not.toMatch(/Hotel extra/)
    expect(f.savings.join(' ')).toMatch(/Uber já soma/)
    expect(f.savings.join(' ')).toMatch(/Logística essencial .* fica fora dos cortes/)
    expect(f.savings.join(' ')).toMatch(/Sem contagem dupla/)
    expect(isEssential(item({ section: 'voo' }))).toBe(true)
    expect(isEssential(item({ priority: 'P0' }))).toBe(true)
  })

  it('the day spend is the statement on the days it covers', () => {
    expect(daySpend(trip(), items, ledger, '2026-10-28')).toEqual({ cents: 122000 + 18994, source: 'extrato' })
    expect(daySpend(trip(), items, ledger, '2026-11-01')).toEqual({ cents: 109000, source: 'itens' })
    expect(daySpend(trip(), items, ledger, '2026-11-02')).toBeUndefined()
  })
})

describe('what is left to book', () => {
  it('P0→P2 by deadline, with value kind and dependencies; planned/reserved never listed as pending', () => {
    const list = [
      item({ id: 'a', priority: 'P1', bookingStatus: 'a_reservar', deadline: '2026-11-03', estimatedCents: 47500, certainty: 'clima', url: 'https://t' }),
      item({ id: 'b', priority: 'P0', bookingStatus: 'a_cotar', deadline: '2026-11-04', nextAction: 'Vem junto da cotação da Garden Route' }),
      item({ id: 'c', priority: 'P0', bookingStatus: 'aguardando_resposta', deadline: '2026-11-01' }),
      item({ id: 'd', priority: 'P0', bookingStatus: 'reservado', proof: 'voucher' }),
      item({ id: 'e', priority: 'P0', bookingStatus: 'planejado', section: 'roteiro' }),
      item({ id: 'f', section: 'voo', status: 'confirmado', date: '2026-11-13' }),
      item({ id: 'g', priority: 'P2', bookingStatus: 'a_cotar', date: '2026-10-30' }),
      item({ id: 'h', optional: true, bookingStatus: 'a_cotar' }),
    ]
    const r = toBook(trip(), list, '2026-11-02')
    expect(r.rows.map((x) => x.item.id)).toEqual(['c', 'b', 'a'])
    expect(r.rows[0].overdue).toBe(true)
    expect(r.rows[1].dependsOn).toEqual(['Vem junto da cotação da Garden Route'])
    expect(r.rows[2].value).toEqual({ cents: 47500, currency: 'ZAR', kind: 'referência' })
    expect(r.rows[2].dependsOn).toEqual(['clima (vento/mar)'])
    // Confirmed in her words but no voucher/code: shown apart, never as reserved.
    expect(r.noProof.map((i) => i.id)).toEqual(['f'])
  })
})

describe("tomorrow's checklist", () => {
  it('gear by activity, documents, water/food, transport, departure and booking status', () => {
    const list = [
      item({ id: 's', section: 'esporte', checklistKind: 'surf', date: '2026-11-03', time: '08:00', leaveTime: '07:15', wakeTime: '06:15', title: 'Surf', address: 'Muizenberg' }),
      item({ id: 'v', section: 'reserva', date: '2026-11-03', time: '14:00', title: 'Table Mountain', bookingStatus: 'a_reservar', needsPickup: true }),
      item({ id: 'x', section: 'reserva', date: '2026-11-04', time: '06:00', title: 'Outro dia' }),
    ]
    const c = tomorrowChecklist(trip(), list, [], [], '2026-11-02')
    expect(c.date).toBe('2026-11-03')
    expect(c.departure).toEqual({ at: '07:15', title: 'Surf', wake: '06:15' })
    expect(c.gear).toContain('Long john')
    expect(c.documents[0]).toMatch(/Passaporte/)
    expect(c.food).toEqual(['Garrafa de água', 'Lanche para Surf'])
    expect(c.transport).toEqual(['Surf: Uber até Muizenberg', 'Table Mountain: pickup ainda não confirmado'])
    expect(c.bookings).toEqual(['Surf: PLANEJADO', 'Table Mountain: A RESERVAR — ainda não reservado'])
  })
})

describe('budget R$ 30.000 stored once on the expedition', () => {
  it('fills the empty field from 01/11, keeps hers, runs once', () => {
    const db = applyMaster1031(applyExpeditionSeed(buildSeed('2026-10-27'), at), '2026-10-31', at)
    expect(applyOps1101(db, '2026-10-31')).toBe(db)
    const once = applyOps1101(db, '2026-11-01', at)
    expect(once.trips.find((t) => t.id === SEED_IDS.tripAfrica)!.expedition!.budgetCents).toBe(ORIGINAL_BUDGET_CENTS)
    expect(once.profile.tripUpdatesApplied).toContain(OPS_1101_ID)
    expect(applyOps1101(once, '2026-11-02')).toBe(once)
    const hers = { ...db, trips: db.trips.map((t) => (t.id === SEED_IDS.tripAfrica ? { ...t, expedition: { ...t.expedition!, budgetCents: 2_500_000 } } : t)) }
    expect(applyOps1101(hers, '2026-11-01', at).trips.find((t) => t.id === SEED_IDS.tripAfrica)!.expedition!.budgetCents).toBe(2_500_000)
  })
})
