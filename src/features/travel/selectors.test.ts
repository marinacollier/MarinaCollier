import { describe, expect, it } from 'vitest'
import type { Expense, Trip, TripItem } from '@/data/types'
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
} from './selectors'

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
    expect(tripCountdown(trip({ dateLabel: 'out/nov 2026' }), TODAY)).toBe('data a definir')
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
    expect(list).toHaveLength(11)
    expect(list.find((i) => i.title.startsWith('Visto'))?.status).toBe('a_confirmar')
    expect(list.find((i) => i.title.startsWith('Vacinas'))?.status).toBe('a_confirmar')
    expect(list.every((i) => i.section === 'antes_de_ir' && i.tripId === 'za')).toBe(true)
  })

  it('is idempotent (never duplicates, accent/case-insensitive)', () => {
    const first = defaultChecklistItems({ id: 'za', flag: '🇿🇦' }, [])
    const existing = first.map((d, i) => item({ ...d, id: `x${i}`, title: i === 0 ? d.title.toUpperCase() : d.title }))
    expect(defaultChecklistItems({ id: 'za', flag: '🇿🇦' }, existing)).toEqual([])
    // other trip's items don't count
    expect(defaultChecklistItems({ id: 'other', flag: '🇿🇦' }, existing)).toHaveLength(11)
  })

  it('skips international-only items for domestic trips', () => {
    const titles = defaultChecklistItems({ id: 'br', flag: '🇧🇷' }, []).map((i) => i.title)
    expect(titles).not.toContain('Passaporte e validade')
    expect(titles).toContain('Luna: creche/hotel')
  })
})

describe('seed', () => {
  const data = seedTravel(createSeedContext(TODAY))
  const trips = data.trips!
  const items = data.tripItems!

  it('seeds the three trips with the stable ids', () => {
    expect(trips.map((t) => t.id).sort()).toEqual([SEED_IDS.tripAfrica, SEED_IDS.tripItacare, SEED_IDS.tripRecife].sort())
    const recife = trips.find((t) => t.id === SEED_IDS.tripRecife)!
    expect(recife.startDate).toBe('2026-10-22')
    expect(recife.endDate).toBeUndefined()
    expect(tripBuckets(trips, TODAY).next?.id).toBe(SEED_IDS.tripRecife)
  })

  it('never invents dates, prices or confirmations', () => {
    const africa = trips.find((t) => t.id === SEED_IDS.tripAfrica)!
    expect(africa.startDate).toBeUndefined()
    expect(africa.datesConfirmed).toBe(false)
    expect(trips.every((t) => t.budgetCents == null)).toBe(true)
    expect(items.every((i) => i.amountCents == null && !i.date && !i.confirmationCode)).toBe(true)
    expect(items.some((i) => i.status === 'confirmado' || i.status === 'feito')).toBe(false)
    expect(items.some((i) => i.section === 'voo')).toBe(false)
  })

  it('África do Sul has its groups and a checklist', () => {
    const mine = items.filter((i) => i.tripId === SEED_IDS.tripAfrica)
    expect(new Set(mine.map((i) => i.group).filter(Boolean))).toEqual(new Set(['Cape Town', 'Johannesburg / Safari', 'Equipment']))
    expect(mine.filter((i) => i.group === 'Equipment').every((i) => i.section === 'mala' && i.status === 'a_fazer')).toBe(true)
    expect(checklistProgress(mine).total).toBe(11)
    expect(defaultChecklistItems({ id: SEED_IDS.tripAfrica, flag: '🇿🇦' }, mine)).toEqual([])
  })
})
