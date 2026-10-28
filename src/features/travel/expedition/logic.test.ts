import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { applyExpeditionSeed, EXPEDITION_TRIP_ID, zaId } from '@/data/seed/expedition'
import type { Expense, Trip, TripItem } from '@/data/types'
import {
  bookingOf,
  bookingPatch,
  certaintyOf,
  classClash,
  dayCost,
  directionsUrl,
  expeditionBudget,
  expeditionCSV,
  expeditionICS,
  findConflicts,
  freeWindow,
  localNow,
  nextDeparture,
  pendencies,
  replanSuggestions,
  schoolDays,
  schoolSummary,
} from './logic'

const NOW = '2026-10-27T10:00:00.000Z'
function base(): { trip: Trip; items: TripItem[] } {
  const db = applyExpeditionSeed(buildSeed('2026-10-27'), NOW)
  return { trip: db.trips.find((t) => t.id === EXPEDITION_TRIP_ID)!, items: db.tripItems.filter((i) => i.tripId === EXPEDITION_TRIP_ID) }
}
let n = 0
const mk = (p: Partial<TripItem>): TripItem => ({ id: `x${n++}`, tripId: EXPEDITION_TRIP_ID, section: 'roteiro', title: 'x', status: 'a_fazer', order: 500 + n, createdAt: NOW, updatedAt: NOW, ...p })
const byId = (items: TripItem[], id: string) => items.find((i) => i.id === id)!

describe('certainty and booking', () => {
  it('never reads "confirmado" while a booking or a medical clearance is pending', () => {
    expect(certaintyOf(mk({ status: 'confirmado' }))).toBe('confirmado')
    expect(certaintyOf(mk({ certainty: 'confirmado', clearance: 'pendente' }))).toBe('pendente')
    expect(certaintyOf(mk({ certainty: 'confirmado', booking: 'aguardando' }))).toBe('pendente')
    expect(certaintyOf(mk({ status: 'a_confirmar' }))).toBe('pendente')
    expect(certaintyOf(mk({ certainty: 'clima' }))).toBe('clima')
  })

  it('maps the 7 booking states onto the older status/payment fields and back', () => {
    expect(bookingPatch('pago')).toEqual({ booking: 'pago', status: 'confirmado', paymentStatus: 'pago' })
    expect(bookingPatch('cotacao_solicitada')).toEqual({ booking: 'cotacao_solicitada', status: 'a_confirmar' })
    expect(bookingPatch('concluido').status).toBe('feito')
    expect(bookingPatch('cancelado').status).toBe('cancelado')
    expect(bookingOf(mk({ status: 'confirmado', paymentStatus: 'pago' }))).toBe('pago')
    expect(bookingOf(mk({ status: 'a_confirmar' }))).toBeUndefined()
  })
})

describe('school', () => {
  it('counts preserved, partial, lost and made-up class days from the itinerary', () => {
    const { trip, items } = base()
    const days = schoolDays(trip, items)
    expect(days).toHaveLength(15) // 26/10 → 13/11, seg–sex
    expect(days.find((d) => d.date === '2026-10-30')!.block).toEqual({ start: '09:00', end: '12:20' })
    expect(schoolSummary(days)).toMatchObject({ total: 15, lost: 4, partial: 1, preserved: 10, madeUp: 0 })
    // Every planned absence still depends on something.
    expect(schoolSummary(days).uncertain).toBe(5)

    const madeUp = items.map((i) => (i.id === zaId('stellenbosch-gravel') ? { ...i, schoolMadeUp: true } : i))
    expect(schoolSummary(schoolDays(trip, madeUp))).toMatchObject({ lost: 3, madeUp: 1 })
    const cancelled = items.map((i) => (i.id === zaId('discover-scuba') ? { ...i, status: 'cancelado' as const } : i))
    expect(schoolSummary(schoolDays(trip, cancelled))).toMatchObject({ lost: 3, preserved: 11 })
  })

  it('warns before booking something over class hours', () => {
    const { trip } = base()
    expect(classClash(trip, { date: '2026-10-28', time: '10:00' })).toEqual({ date: '2026-10-28', block: { start: '09:00', end: '15:10' } })
    expect(classClash(trip, { date: '2026-10-28', time: '16:25' })).toBeUndefined()
    expect(classClash(trip, { date: '2026-10-30', time: '13:30' })).toBeUndefined() // sexta acaba 12:20
    expect(classClash(trip, { date: '2026-10-28', time: '16:00', leaveTime: '15:00' })).toBeDefined()
    expect(classClash(trip, { date: '2026-10-28', time: '10:00', schoolImpact: 'parcial' })).toBeUndefined()
    expect(classClash(trip, { date: '2026-10-31', time: '10:00' })).toBeUndefined() // sábado
  })
})

describe('conflicts and pendências', () => {
  it('the base itinerary has no conflicts; a class clash, an overlap and a flight squeeze show up', () => {
    const { trip, items } = base()
    expect(findConflicts(trip, items)).toEqual([])
    const extra = [
      mk({ title: 'Café com a turma', date: '2026-10-28', time: '11:00' }),
      mk({ title: 'Pôr do sol', date: '2026-10-29', time: '15:30', endTime: '17:00' }), // piscina 16:00
      mk({ title: 'Compras', date: '2026-11-13', time: '19:00', endTime: '20:00' }), // SA366 19:35
    ]
    const kinds = findConflicts(trip, [...items, ...extra]).map((c) => [c.kind, c.date])
    expect(kinds).toEqual([
      ['aula', '2026-10-28'],
      ['sobreposicao', '2026-10-29'],
      ['voo', '2026-11-13'],
    ])
  })

  it('flags a flight less than 18 h after a dive', () => {
    const { trip, items } = base()
    const moved = items.map((i) => (i.id === zaId('discover-scuba') ? { ...i, date: '2026-11-13', time: '07:00', endTime: '09:00', schoolImpact: 'dia' as const } : i))
    expect(findConflicts(trip, moved).some((c) => c.kind === 'mergulho_voo')).toBe(true)
  })

  it('lists weather, clearance, bookings, unpaid and missing pickup — only from today on', () => {
    const { trip, items } = base()
    const p = pendencies(trip, items, '2026-10-27')
    expect(p.weather.map((i) => i.id)).toEqual(expect.arrayContaining([zaId('parapente'), zaId('snorkel-focas')]))
    expect(p.clearance.map((i) => i.id)).toEqual([zaId('bloukrans')])
    expect(p.pickups.map((i) => i.title)).toEqual(['Safari'])
    expect(p.bookings.map((i) => i.id)).toEqual(expect.arrayContaining([zaId('caiaque'), zaId('cape-point')]))
    expect(p.bookings.some((i) => i.optional)).toBe(false)
    expect(p.extras.length).toBe(6)

    const paidLater = items.map((i) => (i.id === zaId('cape-point') ? { ...i, ...bookingPatch('confirmado'), quotedCents: 120000 } : i))
    expect(pendencies(trip, paidLater, '2026-10-27').payments.map((i) => i.id)).toEqual([zaId('cape-point')])
    expect(pendencies(trip, items, '2026-11-17').total).toBe(0)
  })
})

describe('budget', () => {
  it('sums estimated vs quoted vs paid, keeps uber apart, applies the margin and converts with her rate only', () => {
    const { trip, items } = base()
    const priced = items.map((i) => {
      if (i.id === zaId('cape-point')) return { ...i, quotedCents: 150000, uberCents: 20000 }
      if (i.id === zaId('caiaque')) return { ...i, estimatedCents: 60000, quotedCents: 55000, paidCents: 55000 }
      if (i.id === zaId('robben-island')) return { ...i, estimatedCents: 70000 }
      if (i.id === zaId('table-mountain')) return { ...i, currency: 'BRL' as const, estimatedCents: 30000 }
      return i
    })
    const noRate = expeditionBudget(trip, priced)!
    expect(noRate.unconverted).toBe(30000) // BRL value with no rate stays apart
    expect(noRate.estimated).toBe(400000 + 60000)
    expect(noRate.quoted).toBe(150000 + 55000)
    expect(noRate.paid).toBe(55000)
    expect(noRate.uber).toBe(20000)
    expect(noRate.projected).toBe(400000 + 150000 + 55000)
    expect(noRate.totalWithMargin).toBe(Math.round((605000 + 20000) * 1.15))
    expect(noRate.extras).toBe(70000)

    const withRate = { ...trip, expedition: { ...trip.expedition!, rateToBRL: 0.3 } }
    const expenses = [{ id: 'e', tripId: trip.id, amountCents: 3000, status: 'paid', title: 'café', categoryId: 'c', origin: 'manual', createdAt: NOW, updatedAt: NOW } as Expense]
    const b = expeditionBudget(withRate, priced, expenses)!
    expect(b.unconverted).toBe(0)
    expect(b.estimated).toBe(400000 + 60000 + 100000) // R$300 / 0,30 = ZAR 1000
    expect(b.realBRL).toBe(3000)
    expect(b.realInTripCurrency).toBe(10000)
    expect(dayCost(withRate, priced, '2026-10-31')).toEqual({ cents: 150000, uber: 20000, missing: 0 })
  })
})

describe('replanning', () => {
  it('after a weather cancellation suggests flexible, non-weather items that fit, without crossing classes or bookings', () => {
    const { trip, items } = base()
    const para = { ...byId(items, zaId('parapente')), status: 'cancelado' as const, cancelReason: 'vento' as const }
    const fits = mk({ group: 'Cape Town', title: 'Pôr do sol no Signal Hill', flexible: true, date: '2026-11-12', time: '16:00', endTime: '17:30' })
    const tooLong = mk({ group: 'Cape Town', title: 'Volta longa', flexible: true, date: '2026-11-12', time: '08:00', endTime: '16:00' })
    const booked = mk({ group: 'Cape Town', title: 'Reservado', flexible: true, date: '2026-11-12', time: '16:00', endTime: '17:00', status: 'confirmado' })
    const windy = mk({ group: 'Cape Town', title: 'Kite', flexible: true, certainty: 'clima' })
    const far = mk({ group: 'Garden Route', title: 'Longe', flexible: true })
    const list = [...items.map((i) => (i.id === para.id ? para : i)), fits, tooLong, booked, windy, far]
    expect(freeWindow(trip, list, para)).toEqual({ date: '2026-11-04', start: 16 * 60, end: 19 * 60 })
    const s = replanSuggestions(trip, list, para, '2026-10-27', 20)
    const titles = s.map((x) => x.item.title)
    expect(titles[0]).toBe('Pôr do sol no Signal Hill')
    expect(s[0]).toMatchObject({ fit: 'cabe', window: { date: '2026-11-04', start: '16:00', end: '19:00' } })
    for (const no of ['Volta longa', 'Reservado', 'Kite', 'Longe', 'Parapente']) expect(titles).not.toContain(no)
    // Nothing was changed.
    expect(list.find((i) => i.id === fits.id)!.date).toBe('2026-11-12')
  })

  it('rain puts indoor places first; a window squeezed by class and flight has no room', () => {
    const { trip, items } = base()
    const lions = { ...byId(items, zaId('lions-head')), status: 'cancelado' as const, cancelReason: 'chuva' as const }
    const s = replanSuggestions(trip, items.map((i) => (i.id === lions.id ? lions : i)), lions, '2026-10-27', 10)
    expect(s.length).toBeGreaterThan(0)
    expect(s[0].item.indoor).toBe(true)

    const late = mk({ group: 'Cape Town', date: '2026-11-13', time: '17:00', endTime: '18:00', status: 'cancelado', cancelReason: 'vento' })
    expect(freeWindow(trip, [...items, late], late)).toBeUndefined() // 3 h before SA366 is kept free
  })
})

describe('today, maps and exports', () => {
  it('reads the local clock of the trip and finds the next departure', () => {
    expect(localNow('Africa/Johannesburg', new Date('2026-10-28T13:00:00Z'))).toEqual({ date: '2026-10-28', time: '15:00', minutes: 900 })
    const { items } = base()
    const next = nextDeparture(items, { date: '2026-10-28', minutes: 900 })
    expect(next).toMatchObject({ date: '2026-10-28', at: '16:25', inMinutes: 85 })
    expect(next!.item.title).toBe("Lion's Head")
  })

  it('builds a directions link from the residence', () => {
    expect(directionsUrl('40 Shortmarket Street, Cape Town', '106 Adderley Street')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40+Shortmarket+Street%2C+Cape+Town&origin=106+Adderley+Street',
    )
  })

  it('exports ICS in the local time zone and CSV with every field', () => {
    const { trip, items } = base()
    const ics = expeditionICS(trip, items, new Date(NOW))
    // 16:25 in Cape Town (UTC+2) = 14:25 UTC.
    expect(ics).toContain('DTSTART:20261028T142500Z')
    expect(ics).toContain("SUMMARY:Lion's Head [ESTIMADO]")
    expect(ics).toContain('SUMMARY:Parapente [DEPENDE DO CLIMA]')
    expect(ics).toMatch(/UID:aula-2026-10-26@marina-os/)
    expect(ics).not.toMatch(/UID:aula-2026-11-10@/) // day lost to the gravel ride
    const csv = expeditionCSV(trip, items)
    expect(csv.split('\r\n')[0]).toContain('Certeza')
    expect(csv).toContain('4000,00')
  })
})
