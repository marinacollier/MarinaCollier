import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Trip, TripItem } from '@/data/types'
import { BookingDetails } from './BookingDetails'

afterEach(cleanup)

const trip = { id: 't', name: 'ZA', expedition: { timeZone: 'Africa/Johannesburg', currency: 'ZAR', marginPct: 10, emergencyContacts: [] } } as unknown as Trip
const item: TripItem = {
  id: 'safari',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-06T12:30:00.000Z',
  tripId: 't',
  section: 'reserva',
  group: 'Johannesburg / Safari',
  title: 'Safari Pilanesberg',
  status: 'confirmado',
  date: '2026-11-14',
  time: '05:30',
  endDate: '2026-11-15',
  order: 1,
  supplier: 'Operador X',
  confirmationCode: 'F59F-4976',
  quotedCents: 900000,
  paidCents: 300000,
  bookingStatus: 'reserva_emitida',
  paymentStatus: 'pendente',
  route: 'Shuttle do operador',
  cancellationPolicy: '48 h',
  nextAction: 'Pagar saldo',
  source: 'e-mail do operador 06/11',
}

describe('BookingDetails', () => {
  it('shows every booking field, with total · paid · balance and what is missing as "não informado"', () => {
    render(<BookingDetails trip={trip} item={item} />)
    const t = screen.getByLabelText('Resumo da reserva').textContent ?? ''
    for (const s of ['Operador X', 'F59F-4976', 'RESERVA EMITIDA', 'Pendente', 'Shuttle do operador', '48 h', 'Pagar saldo', 'e-mail do operador 06/11', '06/11/2026', '05:30']) expect(t).toContain(s)
    expect(t).toMatch(/Valor total.*9\.000/)
    expect(t).toMatch(/Valor pago.*3\.000/)
    expect(t).toMatch(/Saldo.*6\.000/)
    // Local falls back to the group; nothing else is invented.
    expect(t).toContain('Johannesburg / Safari')
  })

  it('without a total there is no balance', () => {
    render(<BookingDetails trip={trip} item={{ ...item, quotedCents: undefined, paidCents: undefined, source: undefined }} />)
    const t = screen.getByLabelText('Resumo da reserva').textContent ?? ''
    expect(t).toMatch(/Saldonão informado/)
    expect(t).toMatch(/Fontenão informado/)
  })
})
