import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Trip, TripItem } from '@/data/types'
import { bookingStatusOf, bookingStatusPatch, budgetByCategory, confirmedSpend, dayPriorities, shoppingBy } from './command'
import { ExpeditionFields, missingProof } from './ExpeditionFields'

const at = '2026-10-31T10:00:00.000Z'
let n = 0
const item = (p: Partial<TripItem>): TripItem => ({ id: `i${n++}`, createdAt: at, updatedAt: at, tripId: 't', section: 'reserva', title: 'x', status: 'a_confirmar', order: n, ...p })
const trip = { id: 't', name: 'ZA', flag: '🇿🇦', startDate: '2026-10-24', endDate: '2026-11-16', expedition: { timeZone: 'Africa/Johannesburg', currency: 'ZAR', marginPct: 15, emergencyContacts: [] } } as unknown as Trip

afterEach(cleanup)

describe('status vocabulary', () => {
  it('RESERVADO only with voucher, code or supplier confirmation', () => {
    expect(bookingStatusOf(item({ bookingStatus: 'reservado' }))).toBe('planejado')
    expect(bookingStatusOf(item({ bookingStatus: 'reservado', proof: 'e-mail do fornecedor' }))).toBe('reservado')
    expect(bookingStatusOf(item({ status: 'confirmado', section: 'voo' }))).toBe('planejado')
    expect(bookingStatusOf(item({ status: 'confirmado', voucherUrl: 'https://v' }))).toBe('reservado')
    expect(missingProof({ bookingStatus: 'reservado' })).toBe(true)
    expect(missingProof({ bookingStatus: 'reservado' }, 'ABC')).toBe(false)
  })

  it('derives from the older fields and keeps them in step when picked', () => {
    expect(bookingStatusOf(item({ status: 'feito' }))).toBe('concluido')
    expect(bookingStatusOf(item({ booking: 'aguardando' }))).toBe('aguardando_resposta')
    expect(bookingStatusOf(item({ booking: 'nao_pesquisado' }))).toBe('a_cotar')
    expect(bookingStatusOf(item({ section: 'hospedagem' }))).toBe('a_reservar')
    expect(bookingStatusOf(item({ optional: true }))).toBe('opcional')
    expect(bookingStatusOf(item({ section: 'roteiro', status: 'a_fazer' }))).toBe('planejado')
    // A done tick on the older screens wins over a stored pending status.
    expect(bookingStatusOf(item({ status: 'feito', bookingStatus: 'a_cotar' }))).toBe('concluido')
    expect(bookingStatusPatch('concluido')).toMatchObject({ status: 'feito' })
    expect(bookingStatusPatch('cancelado')).toMatchObject({ status: 'cancelado' })
    expect(bookingStatusPatch('aguardando_resposta')).toMatchObject({ status: 'a_confirmar', booking: 'aguardando' })
  })
})

describe('money, shopping and priorities', () => {
  it('confirmed spend = paid only (+ Uber of what she did); categories split estimated / quoted / paid', () => {
    const items = [
      item({ section: 'esporte', status: 'feito', paidCents: 150000, uberCents: 30000, currency: 'ZAR' }),
      item({ section: 'hospedagem', estimatedCents: 100000 }),
      item({ section: 'reserva', quotedCents: 50000, uberCents: 9000 }),
    ]
    expect(confirmedSpend(trip, items)).toBe(180000)
    const rows = Object.fromEntries(budgetByCategory(trip, items).map((r) => [r.category, r]))
    expect(rows.treinos).toMatchObject({ paid: 150000 })
    expect(rows.hospedagem).toMatchObject({ estimated: 100000, paid: 0 })
    expect(rows.tours).toMatchObject({ quoted: 50000 })
    expect(rows.uber).toMatchObject({ paid: 30000, estimated: 9000 })
  })

  it('shopping per person and per category', () => {
    const items = [item({ section: 'comprar', person: 'Rebeca', category: 'presentes' }), item({ section: 'comprar', person: 'Marina', category: 'bagagem' }), item({ section: 'comprar' })]
    expect(shoppingBy(trip, items, 'person').map((g) => g.key)).toEqual(['Marina', 'Rebeca', 'Sem pessoa'])
    expect(shoppingBy(trip, items, 'category').map((g) => g.key).sort()).toEqual(['Bagagem extra', 'Compras', 'Presentes'])
  })

  it('three priorities, P0 first, only what is due soon', () => {
    const items = [
      item({ title: 'A', priority: 'P1', deadline: '2026-11-01', bookingStatus: 'a_reservar' }),
      item({ title: 'B', priority: 'P0', deadline: '2026-11-02', bookingStatus: 'a_cotar' }),
      item({ title: 'C', priority: 'P0', deadline: '2026-11-20', bookingStatus: 'a_cotar' }),
      item({ title: 'D', priority: 'P2', deadline: '2026-10-31', bookingStatus: 'aguardando_resposta' }),
      item({ title: 'E', priority: 'P0', deadline: '2026-10-31', bookingStatus: 'a_cotar', status: 'feito' }),
    ]
    expect(dayPriorities(trip, items, [], '2026-10-31').map((p) => p.title)).toEqual(['B', 'A', 'D'])
  })
})

describe('item sheet', () => {
  it('picking RESERVADO asks for a voucher or the supplier confirmation', () => {
    const noop = () => {}
    const when = { date: '2026-11-01', section: 'reserva' as const }
    render(<ExpeditionFields trip={trip} draft={{ bookingStatus: 'reservado' }} set={noop} when={when} status="confirmado" onBooking={noop} />)
    expect(screen.getByText(/RESERVADO só com voucher, comprovante ou confirmação do fornecedor/)).toBeTruthy()
    expect(screen.getByLabelText('Confirmação do fornecedor')).toBeTruthy()
    cleanup()
    render(<ExpeditionFields trip={trip} draft={{ bookingStatus: 'reservado', proof: 'e-mail' }} set={noop} when={when} status="confirmado" onBooking={noop} />)
    expect(screen.getByText(/Reserva com comprovante/)).toBeTruthy()
  })
})
