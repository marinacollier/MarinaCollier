import { describe, expect, it } from 'vitest'
import type { DB, Expense, Trip, TripItem } from '@/data/types'
import { createSeedContext } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import { seedTravel } from './seed'
import {
  budgetSummary,
  checklistProgress,
  defaultChecklistItems,
  groupItems,
  nextChecklistItem,
  sectionCounts,
  sortUpcoming,
  tripBuckets,
  tripCountdown,
  tripDatesLabel,
  tripPhase,
  PAYMENT_META,
  PAYMENT_ORDER,
  followingTrip,
  followingTripLabel,
  groupCounts,
  groupsOfTrip,
  inSection,
  itemDateLabel,
  reviewGroups,
  reviewItems,
  statusLabel,
} from './selectors'
import { upcomingTrips } from '@/data/selectors'

const TODAY = '2026-10-02'
const now = '2026-10-02T12:00:00.000Z'
let n = 0

function trip(p: Partial<Trip>): Trip {
  return {
    id: `t${n++}`,
    createdAt: now,
    updatedAt: now,
    name: 'X',
    flag: '🇿🇦',
    datesConfirmed: false,
    interests: [],
    tone: 'sand',
    links: [],
    status: 'planejando',
    order: 0,
    ...p,
  }
}

function item(p: Partial<TripItem>): TripItem {
  return { id: `i${n++}`, createdAt: now, updatedAt: now, tripId: 't', section: 'mala', title: 'x', status: 'a_fazer', order: n, ...p }
}

function expense(p: Partial<Expense>): Expense {
  return { id: `e${n++}`, createdAt: now, updatedAt: now, title: 'x', amountCents: 0, categoryId: 'cat-viagem', status: 'paid', origin: 'manual', date: TODAY, ...p }
}

describe('upcoming ordering', () => {
  it('puts dated trips first (soonest first), fuzzy ones after by order, drops past + dreams', () => {
    const fuzzyB = trip({ name: 'fuzzyB', dateLabel: 'Réveillon', order: 2 })
    const fuzzyA = trip({ name: 'fuzzyA', dateLabel: 'out/nov', order: 1 })
    const late = trip({ name: 'late', startDate: '2026-12-01' })
    const soon = trip({ name: 'soon', startDate: '2026-10-22' })
    const past = trip({ name: 'past', startDate: '2026-01-01', endDate: '2026-01-10' })
    const dream = trip({ name: 'dream', status: 'sonhando' })
    const names = sortUpcoming([fuzzyB, late, past, fuzzyA, dream, soon], TODAY).map((t) => t.name)
    expect(names).toEqual(['soon', 'late', 'fuzzyA', 'fuzzyB'])
  })

  it('buckets next / upcoming / dreaming / past', () => {
    const a = trip({ name: 'a', startDate: '2026-10-22' })
    const b = trip({ name: 'b', dateLabel: 'out/nov' })
    const d = trip({ name: 'd', status: 'sonhando' })
    const p = trip({ name: 'p', status: 'concluida' })
    const buckets = tripBuckets([b, d, p, a], TODAY)
    expect(buckets.next?.name).toBe('a')
    expect(buckets.upcoming.map((t) => t.name)).toEqual(['b'])
    expect(buckets.dreaming.map((t) => t.name)).toEqual(['d'])
    expect(buckets.past.map((t) => t.name)).toEqual(['p'])
  })
})

describe('countdown', () => {
  it('counts days to a dated trip', () => {
    expect(tripCountdown(trip({ startDate: '2026-10-22' }), TODAY)).toBe('faltam 20 dias')
    expect(tripCountdown(trip({ startDate: '2026-10-03' }), TODAY)).toBe('é amanhã!')
    expect(tripCountdown(trip({ startDate: TODAY }), TODAY)).toBe('é hoje! ✨')
  })
  it('never invents dates for fuzzy trips', () => {
    expect(tripCountdown(trip({ dateLabel: 'out/nov 2026' }), TODAY)).toBe('data a confirmar')
    expect(tripCountdown(trip({}), TODAY)).toBe('data a confirmar')
    expect(tripDatesLabel(trip({ dateLabel: 'out/nov 2026' }))).toBe('out/nov 2026')
    expect(tripPhase(trip({ dateLabel: 'x' }), TODAY)).toBe('sem_data')
  })
  it('knows when you are travelling', () => {
    const t = trip({ startDate: '2026-09-30', endDate: '2026-10-05' })
    expect(tripPhase(t, TODAY)).toBe('em_viagem')
    expect(tripCountdown(t, TODAY)).toBe('em viagem 🌴')
    expect(tripPhase(t, '2026-10-06')).toBe('passada')
  })
})

describe('budget', () => {
  it('sums only this trip, separating paid from planned', () => {
    const t = trip({ id: 'trip1', budgetCents: 100_000 })
    const list = [
      expense({ tripId: 'trip1', amountCents: 30_000 }),
      expense({ tripId: 'trip1', amountCents: 5_000, status: 'planned_purchase', date: undefined }),
      expense({ tripId: 'other', amountCents: 99_999 }),
      expense({ amountCents: 1 }),
    ]
    expect(budgetSummary(t, list)).toEqual({ budgetCents: 100_000, spentCents: 30_000, plannedCents: 5_000, leftCents: 70_000 })
  })
  it('has no "left" without a budget', () => {
    expect(budgetSummary(trip({ id: 'z' }), []).leftCents).toBeUndefined()
  })
})

describe('sections', () => {
  it('counts per section, ignoring cancelled; open = not done/confirmed', () => {
    const c = sectionCounts([
      item({ section: 'mala', status: 'a_fazer' }),
      item({ section: 'mala', status: 'feito' }),
      item({ section: 'reserva', status: 'a_confirmar' }),
      item({ section: 'reserva', status: 'confirmado' }),
      item({ section: 'reserva', status: 'cancelado' }),
    ])
    expect(c.mala).toEqual({ total: 2, open: 1 })
    expect(c.reserva).toEqual({ total: 2, open: 1 })
    expect(c.voo).toBeUndefined()
  })

  it('groups by group label, ungrouped first', () => {
    const g = groupItems(
      [item({ group: 'Cape Town', order: 1 }), item({ order: 2 }), item({ group: 'Equipment', order: 3 }), item({ group: 'Cape Town', order: 4 })],
      'mala',
    )
    expect(g.map((x) => x.label)).toEqual([undefined, 'Cape Town', 'Equipment'])
    expect(g[1].items).toHaveLength(2)
  })

  it('groups roteiro by date (chronological, by time), undated after', () => {
    const g = groupItems(
      [
        item({ section: 'roteiro', title: 'c', date: '2026-11-02' }),
        item({ section: 'roteiro', title: 'u', group: 'Safari' }),
        item({ section: 'roteiro', title: 'b', date: '2026-11-01', time: '15:00' }),
        item({ section: 'roteiro', title: 'a', date: '2026-11-01', time: '08:00' }),
      ],
      'roteiro',
    )
    expect(g.map((x) => x.label)).toEqual(['2026-11-01', '2026-11-02', 'Safari'])
    expect(g[0].items.map((i) => i.title)).toEqual(['a', 'b'])
  })

  it('checklist progress + next action', () => {
    const list = [
      item({ section: 'antes_de_ir', title: 'A', status: 'feito', order: 1 }),
      item({ section: 'antes_de_ir', title: 'B', status: 'a_confirmar', order: 2 }),
      item({ section: 'antes_de_ir', title: 'C', status: 'cancelado', order: 0 }),
    ]
    expect(checklistProgress(list)).toEqual({ done: 1, total: 2 })
    expect(nextChecklistItem(list)?.title).toBe('B')
  })
})

describe('default checklist', () => {
  it('creates the full list for international trips with unproven items "a confirmar"', () => {
    const list = defaultChecklistItems({ id: 'za', flag: '🇿🇦' }, [])
    expect(list).toHaveLength(10)
    expect(list.find((i) => i.title.startsWith('Visto'))?.status).toBe('a_confirmar')
    expect(list.find((i) => i.title.startsWith('Vacinas'))?.status).toBe('a_confirmar')
    expect(list.every((i) => i.section === 'antes_de_ir' && i.tripId === 'za')).toBe(true)
  })

  it('is idempotent (never duplicates, accent/case-insensitive)', () => {
    const first = defaultChecklistItems({ id: 'za', flag: '🇿🇦' }, [])
    const existing = first.map((d, i) => item({ ...d, id: `x${i}`, title: i === 0 ? d.title.toUpperCase() : d.title }))
    expect(defaultChecklistItems({ id: 'za', flag: '🇿🇦' }, existing)).toEqual([])
    // other trip's items don't count
    expect(defaultChecklistItems({ id: 'other', flag: '🇿🇦' }, existing)).toHaveLength(10)
  })

  it('skips international-only items for domestic trips', () => {
    const titles = defaultChecklistItems({ id: 'br', flag: '🇧🇷' }, []).map((i) => i.title)
    expect(titles).not.toContain('Passaporte e validade')
    expect(titles).toContain('Seguro viagem')
  })

  it('adds one care item per pet from the data (nothing hardcoded)', () => {
    expect(defaultChecklistItems({ id: 'br', flag: '🇧🇷' }, []).some((i) => /creche/.test(i.title))).toBe(false)
    const titles = defaultChecklistItems({ id: 'br', flag: '🇧🇷' }, [], 0, ['Nina']).map((i) => i.title)
    expect(titles).toContain('Nina: creche/hotel')
  })
})

describe('payment + review', () => {
  it('has its own labels, never derived from the reservation status', () => {
    expect(PAYMENT_ORDER.map((p) => PAYMENT_META[p].label)).toEqual(['A confirmar', 'Pendente', 'Pago', 'N/A'])
    expect(statusLabel('a_confirmar', true)).toBe('Revisar')
    expect(statusLabel('a_confirmar')).toBe('A confirmar')
    expect(statusLabel('confirmado', true)).toBe('Confirmado')
  })

  it('lists a_confirmar items grouped by sub-area (trip order), ungrouped last, filterable', () => {
    const list = [
      item({ title: 'a', group: 'Cape Town', status: 'a_confirmar', order: 1 }),
      item({ title: 'b', group: 'Safari', status: 'a_confirmar', order: 2 }),
      item({ title: 'c', status: 'a_confirmar', order: 3 }),
      item({ title: 'd', group: 'Cape Town', status: 'confirmado', order: 4 }),
      item({ title: 'e', group: 'Cape Town', status: 'a_confirmar', order: 5 }),
    ]
    expect(reviewItems(list).map((i) => i.title)).toEqual(['a', 'b', 'c', 'e'])
    const g = reviewGroups(list)
    expect(g.map((x) => x.label)).toEqual(['Cape Town', 'Safari', 'Outros'])
    expect(g[0].items.map((i) => i.title)).toEqual(['a', 'e'])
    expect(reviewGroups(list, 'Safari').map((x) => x.label)).toEqual(['Safari'])
    expect(groupCounts(list)).toEqual([
      { group: 'Cape Town', count: 3 },
      { group: 'Safari', count: 1 },
    ])
  })

  it('roteiro is a timeline: dated items of other sections show up, multi-day labels', () => {
    const flight = item({ section: 'voo', title: 'voo', date: '2026-11-16', time: '10:00' })
    const undatedFlight = item({ section: 'voo', title: 'revisar voo' })
    const safari = item({ section: 'roteiro', title: 'Safari', date: '2026-11-14', endDate: '2026-11-15' })
    expect(inSection(flight, 'roteiro')).toBe(true)
    expect(inSection(undatedFlight, 'roteiro')).toBe(false)
    expect(groupItems([flight, undatedFlight, safari], 'roteiro').map((g) => g.label)).toEqual(['2026-11-14', '2026-11-16'])
    expect(itemDateLabel(safari)).toBe('14 → 15 de nov.')
    expect(itemDateLabel({ date: '2026-10-30', endDate: '2026-11-02' })).toBe('30 de out. → 2 de nov.')
    expect(itemDateLabel({ date: '2026-11-16' })).toBe('16 de nov.')
  })
})

describe('back-to-back trips', () => {
  it('finds a trip starting within 3 days after this one', () => {
    const a = trip({ id: 'r', name: 'Recife', flag: '🇧🇷', startDate: '2026-10-22' })
    const b = trip({ id: 'z', name: 'South Africa 2026', flag: '🇿🇦', startDate: '2026-10-24', endDate: '2026-11-16' })
    const c = trip({ id: 'i', name: 'Itacaré', dateLabel: 'Réveillon' })
    const f = followingTrip(a, [a, b, c])
    expect(f?.trip.id).toBe('z')
    expect(followingTripLabel(f!)).toBe('2 dias depois: South Africa 2026 🇿🇦')
    expect(followingTrip(b, [a, b, c])).toBeUndefined()
    expect(followingTrip(a, [a, trip({ startDate: '2026-10-26' })])).toBeUndefined()
    expect(followingTrip(c, [a, b, c])).toBeUndefined()
  })
})

describe('seed', () => {
  const data = seedTravel(createSeedContext(TODAY))
  const trips = data.trips!
  const items = data.tripItems!
  const byId = (id: string) => trips.find((t) => t.id === id)!

  it('seeds the three trips with stable ids and her dates', () => {
    expect(trips.map((t) => t.id).sort()).toEqual([SEED_IDS.tripAfrica, SEED_IDS.tripItacare, SEED_IDS.tripRecife].sort())
    const recife = byId(SEED_IDS.tripRecife)
    // Marina, 03/10: "22 de outubro viajo p África do Sul, não p Recife" — Recife's date is unknown.
    expect(recife).toMatchObject({ dateLabel: 'data a confirmar', datesConfirmed: false, status: 'planejando' })
    expect(recife.startDate).toBeUndefined()
    const africa = byId(SEED_IDS.tripAfrica)
    expect(africa).toMatchObject({ name: 'South Africa 2026', flag: '🇿🇦', startDate: '2026-10-22', endDate: '2026-11-16', datesConfirmed: true })
    expect(africa.notes).toMatch(/período-base/)
    const itacare = byId(SEED_IDS.tripItacare)
    expect(itacare).toMatchObject({ place: 'Itacaré, Bahia', dateLabel: 'fim de 2026 / Réveillon', datesConfirmed: false })
    expect(itacare.startDate).toBeUndefined()
    expect(tripCountdown(itacare, TODAY)).toBe('data a confirmar')
  })

  it('every item has a stable, unique id', () => {
    expect(items.every((i) => i.id.startsWith('seed:travel:'))).toBe(true)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(seedTravel(createSeedContext('2027-01-01')).tripItems!.map((i) => i.id)).toEqual(items.map((i) => i.id))
  })

  it('orders countdowns: South Africa (22/10) first, undated trips after (local + shared selector)', () => {
    const order = [SEED_IDS.tripAfrica, SEED_IDS.tripRecife, SEED_IDS.tripItacare]
    expect(sortUpcoming(trips, TODAY).map((t) => t.id)).toEqual(order)
    const db = { trips } as unknown as DB
    expect(upcomingTrips(db, TODAY).map((t) => t.id)).toEqual(order)
    expect(tripBuckets(trips, TODAY).next?.id).toBe(SEED_IDS.tripAfrica)
  })

  it('never invents money, confirmations or payments', () => {
    expect(trips.every((t) => t.budgetCents == null)).toBe(true)
    expect(items.every((i) => i.amountCents == null && !i.confirmationCode)).toBe(true)
    expect(items.every((i) => i.status === 'a_confirmar')).toBe(true)
    expect(items.some((i) => i.paymentStatus === 'pago')).toBe(false)
    expect(JSON.stringify(data)).not.toMatch(/"confirmado"|"pago"|"feito"/)
  })

  it('África: §26 itinerary with own payment status, all sub-areas present', () => {
    const mine = items.filter((i) => i.tripId === SEED_IDS.tripAfrica)
    const ida = mine.find((i) => i.date === '2026-11-13')!
    expect(ida).toMatchObject({ section: 'roteiro', status: 'a_confirmar', paymentStatus: 'a_confirmar' })
    const safari = mine.find((i) => i.date === '2026-11-14')!
    expect(safari).toMatchObject({ title: 'Safari', endDate: '2026-11-15', paymentStatus: 'a_confirmar' })
    const flight = mine.find((i) => i.date === '2026-11-16')!
    expect(flight).toMatchObject({ section: 'voo', time: '10:00', group: 'Flights', paymentStatus: 'a_confirmar' })
    expect(flight.title).toMatch(/OR Tambo/)
    expect(groupItems(mine, 'roteiro').filter((g) => g.key.startsWith('d:')).map((g) => g.label)).toEqual(['2026-11-13', '2026-11-14', '2026-11-16'])

    const subAreas = ['Cape Town', 'School', 'Surf', 'Running', 'Trail', 'Gravel / Cycling', 'Beaches', 'Wine', 'Social', 'Content', 'Johannesburg', 'Safari', 'Flights', 'Accommodation', 'Transport', 'Shopping', 'Packing', 'Documents', 'Budget']
    expect(groupsOfTrip(mine)).toEqual(subAreas)

    const find = (t: string) => mine.find((i) => i.title === t)!
    expect(find('Revisar voo')).toMatchObject({ section: 'voo', group: 'Flights' })
    expect(find('Hospedagem Cape Town')).toMatchObject({ section: 'hospedagem', group: 'Accommodation' })
    expect(find('Logística aeroporto').section).toBe('transporte')
    expect(find('Seguro').section).toBe('documento')
    expect(find('Bike rental').group).toBe('Gravel / Cycling')
    expect(find('Vinícolas').group).toBe('Wine')
    expect(reviewItems(mine)).toHaveLength(mine.length)
  })

  it('Recife: §29 items a confirmar, no date yet so no back-to-back note', () => {
    const mine = items.filter((i) => i.tripId === SEED_IDS.tripRecife)
    expect(mine.map((i) => i.title)).toEqual(['Voo', 'Mala', 'Compromissos', 'Pessoas', 'Compras', 'Logística', 'Retorno / próximo deslocamento'])
    expect(mine.every((i) => i.status === 'a_confirmar')).toBe(true)
    expect(followingTrip(byId(SEED_IDS.tripRecife), trips)).toBeUndefined()
  })

  it('Itacaré: §30 items, no budget', () => {
    const mine = items.filter((i) => i.tripId === SEED_IDS.tripItacare)
    expect(mine).toHaveLength(9)
    expect(byId(SEED_IDS.tripItacare).budgetCents).toBeUndefined()
  })
})
