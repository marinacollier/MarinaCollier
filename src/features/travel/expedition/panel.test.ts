/**
 * Painel operacional da Home — derivations from stored data only: saldo, payments pending, awaiting supplier,
 * deliveries, the next leg highlight, the flight countdown, the next action, the new booking statuses.
 */
import { describe, expect, it } from 'vitest'
import type { Expense, Trip, TripItem } from '@/data/types'
import { BOOKING_STATUS_META, BOOKING_STATUS_ORDER, bookingStatusOf, bookingStatusPatch, dayPriorities } from './command'
import { financialClose } from './ops'
import { activeExpeditionTrip, awaitingSupplier, itemMoney, nextFlight, nextLegPending, nextPriorityAction, pendingDeliveries, pendingPayments, tripAgenda, tripOpsPanel } from './panel'
import { workStudyItems, workoutItems } from '@/features/today/home/trip-ops'
import type { ActionItem } from '@/data/agenda/items'

const at = '2026-11-01T10:00:00.000Z'
let n = 0
const item = (p: Partial<TripItem>): TripItem => ({ id: `i${n++}`, createdAt: at, updatedAt: at, tripId: 't', section: 'reserva', title: 'x', status: 'a_confirmar', order: n, ...p })
const expense = (p: Partial<Expense>) => ({ id: `e${n++}`, title: 'x', amountCents: 1000, date: '2026-11-01', categoryId: 'c', status: 'paid', origin: 'manual', createdAt: at, updatedAt: at, ...p }) as Expense
const trip = (exp: Record<string, unknown> = {}, p: Partial<Trip> = {}) =>
  ({ id: 't', name: 'ZA', flag: '🇿🇦', status: 'em_andamento', startDate: '2026-10-24', endDate: '2026-11-16', expedition: { timeZone: 'Africa/Johannesburg', currency: 'ZAR', marginPct: 10, emergencyContacts: [], ...exp }, ...p }) as unknown as Trip
const today = '2026-11-06'

describe('item money', () => {
  it('total = cotado ?? valor ?? estimado; saldo only when the total is known', () => {
    expect(itemMoney(item({ quotedCents: 500000, amountCents: 1, estimatedCents: 2, paidCents: 200000 }), 'ZAR')).toEqual({ total: 500000, paid: 200000, balance: 300000, currency: 'ZAR' })
    expect(itemMoney(item({ amountCents: 9000 }), 'ZAR').balance).toBe(9000)
    expect(itemMoney(item({ estimatedCents: 4000, currency: 'BRL' }), 'ZAR')).toMatchObject({ total: 4000, balance: 4000, currency: 'BRL' })
    expect(itemMoney(item({ paidCents: 100 }), 'ZAR')).toEqual({ total: undefined, paid: 100, balance: undefined, currency: 'ZAR' })
  })
})

describe('new booking statuses', () => {
  it('reserva_emitida and confirmado have labels, order and keep the older fields in step', () => {
    for (const s of ['reserva_emitida', 'confirmado'] as const) {
      expect(BOOKING_STATUS_ORDER).toContain(s)
      expect(BOOKING_STATUS_META[s].label).toBeTruthy()
      expect(bookingStatusPatch(s)).toEqual({ bookingStatus: s, status: 'confirmado', booking: 'confirmado' })
      expect(bookingStatusOf(item({ bookingStatus: s }))).toBe(s)
    }
    expect(bookingStatusOf(item({ bookingStatus: 'confirmado', status: 'feito' }))).toBe('concluido')
  })

  it('count as committed while not paid; a deposit leaves the rest committed', () => {
    const items = [
      item({ id: 'em', date: '2026-11-14', bookingStatus: 'reserva_emitida', confirmationCode: 'F59F-4976', quotedCents: 600000 }),
      item({ id: 'cf', date: '2026-11-15', bookingStatus: 'confirmado', estimatedCents: 50000 }),
      item({ id: 'dep', date: '2026-11-14', bookingStatus: 'reserva_emitida', quotedCents: 800000, paidCents: 300000 }),
      item({ id: 'full', date: '2026-11-14', bookingStatus: 'confirmado', quotedCents: 100000, paidCents: 100000 }),
    ]
    const f = financialClose(trip(), items)
    expect(f.committedLines.map((l) => [l.item.id, l.cents])).toEqual([
      ['em', 600000],
      ['cf', 50000],
      ['dep', 500000],
    ])
    expect(f.paid).toBe(400000)
    expect(f.estimated).toBe(0)
  })

  it('a confirmed booking is not a "to do" priority; an issued one with a deadline is', () => {
    const items = [item({ id: 'cf', bookingStatus: 'confirmado', deadline: today, priority: 'P0' }), item({ id: 'em', bookingStatus: 'reserva_emitida', deadline: today, priority: 'P0', nextAction: 'Pagar saldo' })]
    expect(dayPriorities(trip(), items, [], today).map((p) => p.id)).toEqual(['em'])
  })
})

describe('panel lists', () => {
  const flightCT = item({ id: 'sa366', section: 'voo', title: 'Voo SA366', date: '2026-11-13', time: '10:00', bookingStatus: 'reservado', confirmationCode: 'X1' })
  const flightHome = item({ id: 'home', section: 'voo', title: 'Voo para São Paulo', date: '2026-11-16', time: '20:00', bookingStatus: 'reservado', confirmationCode: 'Y2' })
  const safari = item({ id: 'safari', group: 'Johannesburg / Safari', title: 'Safari Pilanesberg', date: '2026-11-14', endDate: '2026-11-15', bookingStatus: 'reserva_emitida', confirmationCode: 'F59F-4976', quotedCents: 900000, paidCents: 300000, priority: 'P0' })
  const hotel = item({ id: 'hotel', section: 'hospedagem', group: 'Johannesburg / Safari', title: 'Hotel OR Tambo', date: '2026-11-13', bookingStatus: 'a_reservar', priority: 'P0', deadline: '2026-11-08', nextAction: 'Reservar hotel' })
  const shuttle = item({ id: 'shuttle', group: 'Johannesburg / Safari', title: 'Shuttle do aeroporto', date: '2026-11-13', bookingStatus: 'aguardando_resposta', supplier: 'Op', priority: 'P1', nextAction: 'Cobrar resposta', deadline: '2026-11-07' })
  const garden = item({ id: 'gr', group: 'Garden Route', title: 'Garden Route', date: '2026-11-07', endDate: '2026-11-09', bookingStatus: 'aguardando_resposta', priority: 'P0', nextAction: 'Fechar', deadline: '2026-11-06' })
  const paidDone = item({ id: 'done', title: 'Surf', date: '2026-11-02', status: 'feito', quotedCents: 50000 })
  const flaggedPending = item({ id: 'pend', title: 'Tour Cabo', date: '2026-11-10', paymentStatus: 'pendente', bookingStatus: 'planejado' })
  const paid = item({ id: 'paid', title: 'Aula de mergulho', date: '2026-11-11', bookingStatus: 'reservado', proof: 'e-mail', quotedCents: 10000, paymentStatus: 'pago' })
  const cancelled = item({ id: 'cx', title: 'Bungee', date: '2026-11-08', status: 'cancelado', bookingStatus: 'cancelado', quotedCents: 1, nextAction: 'x', priority: 'P0' })
  const extra = item({ id: 'ext', title: 'Parapente', date: '2026-11-07', optional: true, bookingStatus: 'opcional' })
  const items = [flightCT, flightHome, safari, hotel, shuttle, garden, paidDone, flaggedPending, paid, cancelled, extra]

  it('pending payments: explicit "pendente" or a balance on a booked/awaited item; paid and cancelled out', () => {
    const p = pendingPayments(trip(), items)
    expect(p.map((x) => x.item.id).sort()).toEqual(['pend', 'safari'])
    expect(p.find((x) => x.item.id === 'safari')!.money.balance).toBe(600000)
    expect(p.find((x) => x.item.id === 'pend')!.money.balance).toBeUndefined()
  })

  it('awaiting supplier: ahead, P0 first', () => {
    expect(awaitingSupplier(items, today).map((i) => i.id)).toEqual(['gr', 'shuttle'])
    expect(awaitingSupplier(items, '2026-11-14').map((i) => i.id)).toEqual([])
  })

  it('next priority action: P0 then nearest deadline, cancelled/done/extras never', () => {
    expect(nextPriorityAction(items, today)!.id).toBe('gr')
    expect(nextPriorityAction(items.filter((i) => i.id !== 'gr'), today)!.id).toBe('hotel')
    expect(nextPriorityAction([cancelled, extra, paidDone], today)).toBeUndefined()
  })

  it('countdown: the next flight not done', () => {
    expect(nextFlight(items, today)).toEqual({ item: flightCT, days: 7 })
    expect(nextFlight([{ ...flightCT, status: 'feito' }, flightHome], today)!.item.id).toBe('home')
    expect(nextFlight([flightCT], '2026-11-13')!.days).toBe(0)
  })

  it('next leg: named Johannesburg/safari or from the next flight on, while to book/quote/awaiting/payment pending', () => {
    const leg = nextLegPending(trip(), items, today)
    expect(leg.items.map((i) => i.id)).toEqual(['hotel', 'safari', 'shuttle'])
    expect(leg.label).toBe('Johannesburg / Safari')
    // Resolved (booked and paid) → it leaves the highlight.
    const resolved = items.map((i) => (i.id === 'hotel' ? { ...i, bookingStatus: 'confirmado' as const } : i.id === 'safari' ? { ...i, paidCents: 900000 } : i.id === 'shuttle' ? { ...i, bookingStatus: 'confirmado' as const } : i))
    expect(nextLegPending(trip(), resolved, today).items).toEqual([])
    // Unnamed items on/after the next flight's day count too.
    const unnamed = item({ id: 'un', title: 'Restaurante Soweto', date: '2026-11-14', bookingStatus: 'a_cotar' })
    expect(nextLegPending(trip(), [flightCT, unnamed], today).items.map((i) => i.id)).toEqual(['un'])
  })

  it('agenda: today + 7 days, running multi-day items, stays on check-in only, no cancelled/extras', () => {
    const ids = tripAgenda(items, today).map((i) => i.id)
    expect(ids).toEqual(['gr', 'pend', 'paid', 'sa366', 'hotel', 'shuttle'])
    expect(tripAgenda(items, '2026-11-08').map((i) => i.id)).toContain('gr')
    expect(tripAgenda(items, '2026-11-14').map((i) => i.id)).not.toContain('hotel')
  })

  it('the panel puts it together; wallet only when stored', () => {
    const p = tripOpsPanel(trip(), items, [], [], today)
    expect(p.wallet).toBeUndefined()
    expect(p.flight!.days).toBe(7)
    expect(p.finance.currency).toBe('ZAR')
    // safari's balance + the diving class ("pago" without a paid value stays committed, as before).
    expect(p.finance.committed).toBe(610000)
    const w = tripOpsPanel(trip({ walletBalance: { cents: 1234500, asOf: today, source: 'Wise' } }), items, [], [], today)
    expect(w.wallet).toEqual({ cents: 1234500, asOf: today, source: 'Wise' })
  })
})

describe('deliveries', () => {
  it('only bought with delivery pending, nearest expected first', () => {
    const list = [
      expense({ id: 'a', title: 'Tênis', delivery: { status: 'pendente', expected: '2026-11-20' } }),
      expense({ id: 'b', title: 'Mochila', delivery: { status: 'pendente', expected: '2026-11-10' } }),
      expense({ id: 'c', title: 'Sem previsão', delivery: { status: 'pendente' } }),
      expense({ id: 'd', title: 'Recebido', delivery: { status: 'recebido' } }),
      expense({ id: 'e', title: 'Cancelado', status: 'cancelled', delivery: { status: 'pendente' } }),
      expense({ id: 'f', title: 'Normal' }),
    ]
    expect(pendingDeliveries(list).map((e) => e.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('active trip and Home rows', () => {
  it('only a trip with expedition covering the day', () => {
    expect(activeExpeditionTrip([trip()], today)?.id).toBe('t')
    expect(activeExpeditionTrip([trip()], '2026-11-17')).toBeUndefined()
    expect(activeExpeditionTrip([trip({}, { expedition: undefined })], today)).toBeUndefined()
  })

  it('work/study rows and workouts come from the agenda projection', () => {
    const row = (p: Partial<ActionItem>) => ({ key: `k${n++}`, source: 'task', refType: 'task', refId: 'x', date: today, title: 'x', front: { label: '', group: 'vida' }, status: 'pending', check: 'toggle', important: false, ...p }) as ActionItem
    const rows = [
      row({ title: 'Fashion Finder', front: { label: 'FASHION FINDER', group: 'trabalho' } }),
      row({ title: 'Inglês', front: { label: 'ESTUDO', group: 'trabalho' }, status: 'done' }),
      row({ title: 'Mercado', front: { label: 'VIDA', group: 'vida' } }),
      row({ title: 'Treino', source: 'timeline', refType: 'workout', front: { label: 'TREINO', group: 'corpo' }, entry: { kind: 'workout' } as ActionItem['entry'] }),
    ]
    expect(workStudyItems(rows).map((r) => r.title)).toEqual(['Fashion Finder'])
    expect(workoutItems(rows).map((r) => r.title)).toEqual(['Treino'])
  })
})
