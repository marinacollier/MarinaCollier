/**
 * Brief operacional 01/11 — the daily mandatory blocks (placement without overlaps) and the conflict check
 * ("nunca duas atividades incompatíveis no mesmo horário").
 */
import { describe, expect, it } from 'vitest'
import type { Occurrence, Trip, TripItem, Workout } from '@/data/types'
import { buildSeed } from '@/data/seed'
import { applyExpeditionSeed } from '@/data/seed/expedition'
import { applyMaster1031 } from '@/data/seed/master-1031'
import { SEED_IDS } from '@/data/seed/ids'
import { hmToMinutes } from '@/lib/date'
import { busyOn, dailyKey, dailyPlan, placeWindow, type DailyPlan } from './daily'
import { findConflicts, pendencies, tripDays } from './logic'

const at = '2026-11-01T10:00:00.000Z'
let n = 0
const item = (p: Partial<TripItem>): TripItem => ({ id: `i${n++}`, createdAt: at, updatedAt: at, tripId: SEED_IDS.tripAfrica, section: 'roteiro', title: 'x', status: 'a_fazer', order: n, ...p })
const workout = (p: Partial<Workout>): Workout => ({ id: `w${n++}`, createdAt: at, updatedAt: at, date: '2026-11-02', modality: 'musculacao', status: 'planejado', order: 0, ...p })
const trip = {
  id: SEED_IDS.tripAfrica,
  name: 'South Africa',
  startDate: '2026-10-24',
  endDate: '2026-11-16',
  expedition: {
    timeZone: 'Africa/Johannesburg',
    currency: 'ZAR',
    marginPct: 15,
    emergencyContacts: [],
    school: {
      name: 'Bayswater',
      from: '2026-10-26',
      until: '2026-11-13',
      days: [1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '15:10' })).concat([{ weekday: 5, start: '09:00', end: '12:20' }]),
      holidays: [{ date: '2026-11-04', label: 'Feriado eleitoral — sem aula' }],
    },
  },
} as unknown as Trip

const win = (p: DailyPlan, kind: string) => {
  const b = p.blocks.find((x) => x.kind === kind)!
  return b.start && b.end ? `${b.start}–${b.end}` : b.start
}

/** No two timed blocks overlap each other, nor anything that holds the day (class, items). */
function expectNoOverlap(t: Trip, items: TripItem[], p: DailyPlan) {
  const placed = p.blocks.filter((b) => b.start && b.end && !b.filledBy).map((b) => ({ s: hmToMinutes(b.start!), e: hmToMinutes(b.end!), k: b.kind }))
  const timedBlocks = p.blocks.filter((b) => b.start && b.end).map((b) => ({ s: hmToMinutes(b.start!), e: hmToMinutes(b.end!), k: b.kind }))
  for (let a = 0; a < timedBlocks.length; a++)
    for (let b = a + 1; b < timedBlocks.length; b++) expect(timedBlocks[a].s < timedBlocks[b].e && timedBlocks[b].s < timedBlocks[a].e, `${p.date} ${timedBlocks[a].k} × ${timedBlocks[b].k}`).toBe(false)
  for (const x of placed) for (const busy of busyOn(t, items, p.date)) expect(x.s < busy.end && busy.start < x.e, `${p.date} ${x.k} × ${busy.label}`).toBe(false)
}

describe('daily mandatory blocks', () => {
  it('only on the days of her brief (02–16/11), five blocks with the default windows', () => {
    expect(dailyPlan(trip, [], [], [], '2026-11-01')).toBeUndefined()
    expect(dailyPlan(trip, [], [], [], '2026-11-17')).toBeUndefined()
    expect(dailyPlan({ ...trip, id: 'other' } as Trip, [], [], [], '2026-11-03')).toBeUndefined()
    const p = dailyPlan(trip, [], [], [], '2026-11-03')!
    expect(p.blocks.map((b) => b.kind).sort()).toEqual(['alimentacao', 'ingles', 'revisao', 'trabalho', 'treino'])
    expect(win(p, 'treino')).toBe('07:00–08:00')
    expect(win(p, 'trabalho')).toBe('19:30–20:00')
    expect(win(p, 'ingles')).toBe('20:00–20:30')
    expect(win(p, 'revisao')).toBe('20:30–20:45')
    expect(p.blocks.filter((b) => b.core).map((b) => b.kind).sort()).toEqual(['ingles', 'trabalho', 'treino'])
    const en = p.blocks.find((b) => b.kind === 'ingles')!
    expect(en.parts).toHaveLength(3)
    expect(en.sub).toMatch(/Aula da escola não conta/)
    expect(p.blocks.find((b) => b.kind === 'trabalho')!.parts).toContain('Bloqueios do lançamento de dezembro')
  })

  it('moves a block only to avoid a clash — never two things at once', () => {
    const items = [item({ date: '2026-11-03', time: '19:00', endTime: '21:00', title: 'Jantar' }), item({ date: '2026-11-03', time: '06:30', endTime: '07:30', title: 'Café cedo' })]
    const p = dailyPlan(trip, items, [], [], '2026-11-03')!
    expect(win(p, 'trabalho')).toBe('21:00–21:30')
    expect(win(p, 'ingles')).toBe('21:30–22:00')
    expect(win(p, 'revisao')).toBe('22:00–22:15')
    expect(win(p, 'treino')).toBe('07:30–08:30')
    expectNoOverlap(trip, items, p)
  })

  it('keeps class hours free (school days) and says Friday hours need confirming', () => {
    const w = workout({ date: '2026-11-03', period: 'manha', plannedDurationMin: 150 })
    const p = dailyPlan(trip, [], [w], [], '2026-11-03')!
    // 07:00 + 150 min would cross 09:00 → moved to after class.
    expect(win(p, 'treino')).toBe('15:15–17:45')
    expect(dailyPlan(trip, [], [], [], '2026-11-06')!.notes.join(' ')).toMatch(/Sexta: confirmar o horário real/)
    expect(dailyPlan(trip, [], [], [], '2026-11-04')!.notes.join(' ')).toMatch(/Feriado/)
  })

  it('a training activity (gravel, caiaque, snorkel, natação, surf) or the trip workout fills the training block', () => {
    const surf = item({ date: '2026-11-10', time: '16:00', endTime: '18:00', title: 'Surf em Muizenberg', section: 'esporte', checklistKind: 'surf' })
    const p = dailyPlan(trip, [surf], [], [], '2026-11-10')!
    const t = p.blocks.find((b) => b.kind === 'treino')!
    expect(t.filledBy).toBe('Surf em Muizenberg')
    expect(win(p, 'treino')).toBe('16:00–18:00')
    const kayak = item({ date: '2026-11-11', title: 'Caiaque em Hout Bay', section: 'reserva' })
    expect(dailyPlan(trip, [kayak], [], [], '2026-11-11')!.blocks.find((b) => b.kind === 'treino')!.filledBy).toBe('Caiaque em Hout Bay')
    const wk = workout({ date: '2026-11-10', title: 'Força superior', period: 'tarde' })
    const q = dailyPlan(trip, [], [wk], [], '2026-11-10')!
    expect(q.blocks.find((b) => b.kind === 'treino')!.title).toBe('Treino: Força superior')
    expect(win(q, 'treino')).toBe('16:00–17:00')
  })

  it('long travel / shark dive / safari days: recovery and mobility, no forcing', () => {
    for (const d of ['2026-11-06', '2026-11-13', '2026-11-14', '2026-11-15']) {
      const t = dailyPlan(trip, [], [], [], d)!.blocks.find((b) => b.kind === 'treino')!
      expect(t.recovery, d).toBe(true)
      expect(t.title).toBe('Recuperação e mobilidade, sem forçar')
    }
    const shark = item({ date: '2026-11-05', title: 'Mergulho com tubarões — Gansbaai' })
    expect(dailyPlan(trip, [shark], [], [], '2026-11-05')!.blocks.find((b) => b.kind === 'treino')!.recovery).toBe(true)
    // A planned workout on a recovery day is only "if the body asks".
    const swim = workout({ date: '2026-11-06', modality: 'natacao', title: 'Natação' })
    expect(dailyPlan(trip, [], [swim], [], '2026-11-06')!.blocks.find((b) => b.kind === 'treino')!.sub).toMatch(/Natação só se o corpo pedir/)
  })

  it('a flight takes the airport time; blocks go around it', () => {
    const flight = item({ section: 'voo', date: '2026-11-16', time: '11:10', title: 'Voo internacional' })
    const p = dailyPlan(trip, [flight], [], [], '2026-11-16')!
    expectNoOverlap(trip, [flight], p)
    for (const b of p.blocks.filter((x) => x.start)) expect(hmToMinutes(b.end ?? b.start!)).toBeLessThanOrEqual(hmToMinutes('09:10'))
  })

  it('a tick is one occurrence of that day (persists and syncs); nothing else is stored', () => {
    const occ: Occurrence = { id: 'o', createdAt: at, updatedAt: at, parentType: 'item', parentId: dailyKey(trip.id, 'ingles'), date: '2026-11-03', status: 'done' }
    const p = dailyPlan(trip, [], [], [occ], '2026-11-03')!
    expect(p.blocks.find((b) => b.kind === 'ingles')!.done).toBe(true)
    expect(p.done).toBe(1)
    expect(dailyPlan(trip, [], [], [occ], '2026-11-04')!.done).toBe(0)
  })

  it('her real itinerary: every day 02–16/11 placed without overlaps', () => {
    const db = applyMaster1031(applyExpeditionSeed(buildSeed('2026-10-27'), at), '2026-10-31', at)
    const t = db.trips.find((x) => x.id === SEED_IDS.tripAfrica)!
    const days = tripDays(t).filter((d) => d >= '2026-11-02')
    expect(days).toHaveLength(15)
    for (const d of days) {
      const p = dailyPlan(t, db.tripItems, db.workouts, db.occurrences, d)!
      expect(p.blocks.filter((b) => b.core && b.start).length, d).toBe(3)
      expectNoOverlap(t, db.tripItems.filter((i) => i.tripId === t.id), p)
    }
  })

  it('placeWindow searches forward, then backward, inside 06:00–22:30', () => {
    expect(placeWindow(20 * 60, 30, [{ start: 18 * 60, end: 23 * 60 }])).toEqual({ start: 17 * 60 + 30, end: 18 * 60 })
    expect(placeWindow(7 * 60, 60, [{ start: 0, end: 24 * 60 }])).toBeUndefined()
  })
})

describe('conflict check — never two incompatible things at the same time', () => {
  const D = '2026-11-07'
  it('flags two items in the same window, also when both only have a start time', () => {
    const a = item({ date: D, time: '10:00', endTime: '12:00', title: 'A' })
    const b = item({ date: D, time: '11:00', endTime: '13:00', title: 'B' })
    expect(findConflicts(trip, [a, b]).map((c) => c.kind)).toEqual(['sobreposicao'])
    const p = item({ date: D, time: '10:00', title: 'P' })
    const q = item({ date: D, time: '10:00', title: 'Q' })
    const r = item({ date: D, time: '10:40', title: 'R' })
    const far = item({ date: D, time: '15:00', title: 'Far' })
    const keys = findConflicts(trip, [p, q, r, far]).map((c) => c.text)
    expect(keys).toEqual(['P e Q no mesmo horário.', 'P e R no mesmo horário.', 'Q e R no mesmo horário.'])
  })

  it('ignores what is done or cancelled and what has no time', () => {
    const a = item({ date: D, time: '10:00', endTime: '12:00', title: 'A', status: 'feito' })
    const b = item({ date: D, time: '11:00', endTime: '13:00', title: 'B' })
    const c = item({ date: D, time: '11:00', endTime: '13:00', title: 'C', status: 'cancelado' })
    const d = item({ date: D, title: 'D' })
    expect(findConflicts(trip, [a, b, c, d])).toEqual([])
  })

  it('a timed trip workout over an item is a conflict too, and Pendências lists it', () => {
    const a = item({ date: D, time: '07:30', endTime: '09:00', title: 'Transfer' })
    const w = workout({ date: D, time: '07:00', title: 'Corrida leve', plannedDurationMin: 60 })
    const c = findConflicts(trip, [a], [w])
    expect(c.map((x) => x.text)).toEqual(['Treino Corrida leve (07:00) e Transfer no mesmo horário.'])
    const p = pendencies(trip, [a], '2026-11-02', [w])
    expect(p.conflicts).toHaveLength(1)
    expect(p.total).toBeGreaterThanOrEqual(1)
    expect(pendencies(trip, [a], '2026-11-08', [w]).conflicts).toHaveLength(0)
  })
})
