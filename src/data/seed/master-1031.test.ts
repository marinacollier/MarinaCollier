/**
 * Atualização mestre 31/10 against Marina's REAL data: the cloud snapshot of 31/10 (one JSON per record,
 * `{c, id, v, d, del, at, dev}`), loaded the way a device boots it. Skipped when the snapshot is not on this
 * machine (CI). A small fresh-seed suite below always runs.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrate } from '../defaults'
import { buildSeed } from '.'
import { applyLifeSeed } from './migrate'
import { applyModuleSeeds } from '../store'
import type { DB, TripItem } from '../types'
import { applyMaster1031, m31Id, MASTER_1031_ID } from './master-1031'
import { applyExpeditionSeed, zaId } from './expedition'
import { normalize } from '@/lib/text'
import { schoolDays, schoolSummary, classOn } from '@/features/travel/expedition/logic'
import { bookingStatusOf, tripDashboard, workBlocks, tripWorkouts } from '@/features/travel/expedition/command'

const SNAPSHOT =
  process.env.MARINA_SNAPSHOT_DIR ?? '/tmp/claude-0/-home-user-MarinaCollier/1246982c-75f4-5891-9cce-0656938936af/scratchpad/cloud-1031/rec'
const HAVE = existsSync(SNAPSHOT)
const TRIP = 'trip-africa-do-sul'
const NOW = '2026-10-31T19:00:00.000Z'
const old = (slug: string) => `seed:travel:${TRIP}-${slug}`

/**
 * Records she changed in the cloud after the snapshot file was taken. 31/10: she confirmed 29/10 was an
 * absence ("foi falta") — the record is now a counted absence and the update must leave it alone.
 */
const NEWER: Record<string, Partial<TripItem>> = {
  'marina:za:2026-10-29-sem-aula': {
    title: 'Falta na escola',
    schoolImpact: 'dia',
    status: 'feito',
    notes: 'Falta confirmada por ela em 31/10',
    updatedAt: '2026-10-31T18:30:00.000Z',
  },
}

interface Rec {
  c: string
  id: string
  d: Record<string, unknown> | null
  del: boolean
}

/** The snapshot as a device holds it after adopting the cloud (tombstones out, ids kept). */
function loadSnapshot(): { db: DB; tombstones: Set<string> } {
  const raw: Record<string, unknown[]> & { profile?: unknown } = {}
  const tombstones = new Set<string>()
  for (const f of readdirSync(SNAPSHOT)) {
    if (!f.endsWith('.json')) continue
    const r = JSON.parse(readFileSync(join(SNAPSHOT, f), 'utf8')) as Rec
    if (r.del || !r.d) {
      tombstones.add(r.id)
      continue
    }
    if (r.c === '_profile') raw.profile = r.d
    else (raw[r.c] ??= []).push(r.id in NEWER ? { ...r.d, ...NEWER[r.id] } : r.d)
  }
  // Boot as on 30/10 (every module seed, no master update yet).
  const db = applyModuleSeeds(applyLifeSeed(migrate(raw), '2026-10-30'), '2026-10-30')
  return { db, tombstones }
}

const tripItems = (db: DB) => db.tripItems.filter((i) => i.tripId === TRIP)
const byId = (db: DB, id: string) => db.tripItems.find((i) => i.id === id)
const byTitle = (db: DB, re: RegExp) => tripItems(db).filter((i) => re.test(i.title))

describe.skipIf(!HAVE)('Atualização mestre 31/10 — her real snapshot', () => {
  const { db: before, tombstones } = HAVE ? loadSnapshot() : { db: undefined as unknown as DB, tombstones: new Set<string>() }
  const after = HAVE ? applyMaster1031(before, '2026-10-31', NOW) : (undefined as unknown as DB)

  it('the snapshot is hers (expedition + her 29/10 items) and the update was not applied yet', () => {
    expect(before.profile.tripUpdatesApplied ?? []).not.toContain(MASTER_1031_ID)
    expect(byId(before, 'marina:za:2026-10-29-zeitz')).toBeTruthy()
    expect(byId(before, zaId('cape-point'))).toBeTruthy()
  })

  it('runs once: recorded in the profile, a second run (and a full boot) returns the same database', () => {
    expect(after.profile.tripUpdatesApplied).toContain(MASTER_1031_ID)
    expect(applyMaster1031(after, '2026-10-31', '2026-11-01T10:00:00.000Z')).toBe(after)
    expect(applyMaster1031(after, '2026-11-05')).toBe(after)
    const booted = applyModuleSeeds(after, '2026-11-01')
    expect(booted.tripItems).toBe(after.tripItems)
    expect(booted.tasks).toBe(after.tasks)
    expect(booted.workouts).toBe(after.workouts)
  })

  it('a later app version (life-seed bump) keeps every record of the update', () => {
    const bumped = applyLifeSeed({ ...after, profile: { ...after.profile, seedVersion: (after.profile.seedVersion ?? 10) - 1 } }, '2026-11-02')
    const ids = (db: DB) => [...db.tripItems, ...db.tasks, ...db.workouts].map((x) => x.id).filter((id) => id.startsWith('seed:za1031:') || id.startsWith('seed:travel:za-')).sort()
    expect(ids(bumped)).toEqual(ids(after))
  })

  it('never duplicates: ids unique, no new repeated titles, nothing created over a tombstone', () => {
    for (const k of ['tripItems', 'tasks', 'workouts'] as const) {
      const ids = (after[k] as { id: string }[]).map((x) => x.id)
      expect(new Set(ids).size, k).toBe(ids.length)
    }
    const dupes = (db: DB) => {
      const t = tripItems(db).filter((i) => i.status !== 'cancelado').map((i) => normalize(i.title))
      return t.filter((x, i) => t.indexOf(x) !== i).sort()
    }
    expect(dupes(after)).toEqual(dupes(before))
    const openTasks = after.tasks.filter((t) => t.status !== 'archived').map((t) => normalize(t.title))
    const beforeTasks = before.tasks.filter((t) => t.status !== 'archived').map((t) => normalize(t.title))
    expect(openTasks.filter((x, i) => openTasks.indexOf(x) !== i)).toEqual(beforeTasks.filter((x, i) => beforeTasks.indexOf(x) !== i))
    const created = [...after.tripItems, ...after.tasks, ...after.workouts].map((x) => x.id).filter((id) => id.startsWith('seed:za1031:'))
    expect(created.length).toBeGreaterThan(40)
    expect(created.filter((id) => tombstones.has(id) || (before.profile.removedSeedIds ?? []).includes(id))).toEqual([])
  })

  it('her done / cancelled items are untouched, field by field', () => {
    const closed = before.tripItems.filter((i) => i.status === 'feito' || i.status === 'cancelado')
    expect(closed.length).toBeGreaterThan(20)
    for (const i of closed) expect(byId(after, i.id), i.title).toEqual(i)
    // 29/10 as she confirmed it in the cloud (absence) — untouched by the update.
    expect(byId(after, 'marina:za:2026-10-29-sem-aula')).toMatchObject({ title: 'Falta na escola', schoolImpact: 'dia', status: 'feito' })
    expect(byId(after, 'marina:za:2026-10-29-sem-aula')!.schoolToConfirm).toBeUndefined()
    for (const t of before.tasks.filter((x) => x.status === 'done')) expect(after.tasks.find((x) => x.id === t.id), t.title).toEqual(t)
    for (const w of before.workouts) expect(after.workouts.find((x) => x.id === w.id)).toEqual(w)
    // Her 29/10 items stay as they were (Cape Point Vineyards still pending), except the class question.
    for (const slug of ['cafe', 'cape-point-vineyards', 'timeout', 'zeitz']) {
      const id = `marina:za:2026-10-29-${slug}`
      expect(byId(after, id)).toEqual(byId(before, id))
    }
    expect(byId(after, 'marina:za:2026-10-29-cape-point-vineyards')!.status).toBe('a_confirmar')
  })

  it('section 3: done experiences read CONCLUÍDO, reused where they exist, no booking task for them', () => {
    const done = (re: RegExp) => byTitle(after, re).filter((i) => bookingStatusOf(i) === 'concluido')
    expect(done(/lion'?s head/i)).toHaveLength(1)
    expect(done(/surf muizenberg|surf em muizenberg/i)).toHaveLength(1)
    expect(done(/^natação$/i)).toHaveLength(1) // the existing swim item, not a new one
    expect(done(/camps bay/i).map((i) => i.id)).toEqual([zaId('camps-bay')])
    expect(done(/clifton/i).map((i) => i.id)).toEqual([m31Id('clifton-beach')])
    expect(done(/watershed/i).map((i) => i.id)).toEqual(['marina:za:2026-10-29-watershed'])
    expect(done(/feirinhas locais/i).map((i) => i.id)).toEqual([m31Id('feirinhas')])
    expect(byId(after, m31Id('clifton-beach'))!.date).toBeUndefined()
    const newTasks = after.tasks.filter((t) => t.id.startsWith('seed:za1031:'))
    expect(newTasks.filter((t) => /lion|surf em|muizenberg|sea point|camps bay|clifton|watershed|feirinha/i.test(t.title))).toEqual([])
  })

  it('Cape Point + Boulders: 01/11 RESERVADO from 81 Long Street at 09:45; penguins apart, to pay on site', () => {
    const cp = byId(after, zaId('cape-point'))!
    expect(cp).toMatchObject({ date: '2026-11-01', time: '09:45', address: '81 Long Street, Cape Town', status: 'confirmado' })
    expect(bookingStatusOf(cp)).toBe('reservado')
    expect(cp.proof).toMatch(/informada pela Marina/)
    expect(cp.endTime).toBeUndefined()
    const p = byId(after, m31Id('boulders-pinguins'))!
    expect(p).toMatchObject({ date: '2026-11-01', paymentStatus: 'pendente' })
    expect(bookingStatusOf(p)).toBe('a_cotar')
    expect(p.estimatedCents ?? p.quotedCents ?? p.paidCents).toBeUndefined()
  })

  it('section 4: the itinerary 01–16/11 on the existing records; nothing without voucher reads RESERVADO', () => {
    const at = (id: string) => byId(after, id)!
    expect(at(zaId('bo-kaap')).date).toBe('2026-11-02')
    expect(at(zaId('table-mountain'))).toMatchObject({ date: '2026-11-03', certainty: 'clima', estimatedCents: 47500, currency: 'ZAR' })
    expect(at(zaId('table-mountain')).time).toBeUndefined() // never over the class
    expect(at(zaId('gansbaai-hermanus'))).toMatchObject({ date: '2026-11-04', title: 'Mergulho com tubarões — Gansbaai' })
    expect(at(zaId('gansbaai-hermanus')).schoolImpact).toBeUndefined() // holiday, not an absence
    expect(byId(after, m31Id('hermanus'))).toMatchObject({ optional: true })
    expect(byId(after, m31Id('hermanus'))!.date).toBeUndefined()
    expect(at(zaId('garden-route-1')).date).toBe('2026-11-07')
    expect(at(zaId('garden-route-1')).schoolImpact).toBeUndefined() // Saturday
    expect(at(zaId('garden-route-hosp'))).toMatchObject({ date: '2026-11-07', endDate: '2026-11-09' })
    expect(at(zaId('tsitsikamma')).date).toBe('2026-11-08')
    expect(at(zaId('garden-route-volta'))).toMatchObject({ date: '2026-11-09', schoolImpact: 'dia' })
    expect(at(zaId('kirstenbosch')).date).toBe('2026-11-10')
    expect(at(zaId('kalk-bay')).date).toBe('2026-11-11')
    expect(at(zaId('malas')).date).toBe('2026-11-12')
    expect(at(zaId('check-out')).date).toBe('2026-11-13')
    // Off-plan items leave the calendar as extras (not cancelled).
    for (const s of ['parapente', 'caiaque', 'snorkel-focas', 'bike-urbana', 'discover-scuba', 'comunitaria']) {
      expect(at(zaId(s)), s).toMatchObject({ optional: true })
      expect(at(zaId(s)).date, s).toBeUndefined()
      expect(at(zaId(s)).status, s).not.toBe('cancelado')
    }
    const reserved = tripItems(after).filter((i) => bookingStatusOf(i) === 'reservado')
    expect(reserved.map((i) => i.id)).toEqual([zaId('cape-point')])
    // Flights as registered, with the caveat; never RESERVADO without a voucher.
    for (const id of [old('ida-johannesburg'), old('voo-retorno')]) {
      expect(at(id).caveat).toMatch(/sujeito à conferência do bilhete/)
      expect(bookingStatusOf(at(id))).toBe('planejado')
    }
    expect(at(old('ida-johannesburg'))).toMatchObject({ date: '2026-11-13', time: '19:35', endTime: '21:35' })
    expect(at(old('voo-retorno'))).toMatchObject({ date: '2026-11-16', time: '11:10' })
  })

  it('sections 5–7: links, references and Johannesburg P0 with her notes', () => {
    const velo = byId(after, zaId('stellenbosch-gravel'))!
    expect(bookingStatusOf(velo)).toBe('aguardando_resposta')
    expect(velo).toMatchObject({ supplier: 'Cape Velo', estimatedCents: 400000 })
    expect(velo.date).toBeUndefined()
    expect(byId(after, zaId('stellenbosch-vinicola'))!.url).toBe('https://www.winetram.co.za/')
    expect(byId(after, zaId('kalk-bay'))!.notes).toMatch(/Dalebrook/)
    const kwa = byTitle(after, /kwa maritane/i)
    expect(kwa).toHaveLength(1)
    expect(kwa[0].id).toBe(old('safari')) // the old generic "Reserva do safari" became it
    expect(bookingStatusOf(kwa[0])).toBe('aguardando_resposta')
    expect(kwa[0].notes).toMatch(/Não reservar Golden Years/)
    expect(kwa[0].caveat).toMatch(/4\.810.*não é preço garantido/)
    expect(kwa[0].estimatedCents ?? kwa[0].quotedCents).toBeUndefined()
    expect(kwa[0].priority).toBe('P0')
    const h13 = byId(after, old('hosp-johannesburg'))!
    expect(bookingStatusOf(h13)).toBe('a_reservar')
    expect(h13.notes).toMatch(/City Lodge OR Tambo.*InterContinental OR Tambo/)
    expect(bookingStatusOf(byId(after, m31Id('hotel-or-tambo-15'))!)).toBe('a_reservar')
    const transfer = byId(after, old('transfers'))!
    expect(transfer.title).toMatch(/OR Tambo ↔ Pilanesberg/)
    expect(bookingStatusOf(transfer)).toBe('a_cotar')
    const safari = byId(after, old('safari-dias'))!
    expect(safari.supplier).toMatch(/Kwa Maritane/)
    expect(safari.pickup).toBeUndefined()
    // Only the values she wrote.
    const valued = tripItems(after).filter((i) => !tripItems(before).some((b) => b.id === i.id && same(b, i)) && (i.estimatedCents ?? i.quotedCents ?? i.paidCents) != null)
    expect(valued.map((i) => [i.id, i.estimatedCents ?? i.quotedCents ?? i.paidCents]).sort()).toEqual([
      [zaId('stellenbosch-gravel'), 400000],
      [zaId('table-mountain'), 47500],
    ].sort())
  })

  it('sections 11–12: shopping list with persons, safety checklist', () => {
    const shop = tripItems(after).filter((i) => i.group === 'Compras e souvenirs' && i.section === 'comprar')
    expect(shop.map((i) => i.person).sort()).toEqual(['Família e amigos', 'Luquinhas', 'Marina', 'Marina', 'Marina', 'Marina', 'Matheus', 'Rebeca'])
    expect(shop.every((i) => i.estimatedCents == null && i.status === 'a_fazer')).toBe(true)
    expect(tripItems(after).filter((i) => i.group === 'Segurança')).toHaveLength(10)
  })

  it('section 14: alerts are trip tasks with a deadline before what they protect; the old JNB task is reused', () => {
    const alerts = after.tasks.filter((t) => t.tags?.includes('alerta'))
    expect(alerts.length).toBeGreaterThanOrEqual(12)
    expect(alerts.every((t) => t.tripId === TRIP && t.dueDate && t.date && t.date <= t.dueDate && t.status === 'todo')).toBe(true)
    const due = (re: RegExp) => after.tasks.find((t) => re.test(t.title) && t.tripId === TRIP)!.dueDate!
    expect(due(/Garden Route/)).toBe('2026-11-04')
    expect(due(/souvenirs/) < '2026-11-12').toBe(true)
    expect(due(/mala extra/) < '2026-11-13').toBe(true)
    expect(due(/documentos e bagagem/) < '2026-11-13').toBe(true)
    expect(due(/clima/) <= '2026-11-03').toBe(true)
    expect(due(/voo internacional/) < '2026-11-16').toBe(true)
    const jnb = after.tasks.find((t) => t.id === 'seed:backlog:resolver-hospedagem-e-safari-jnb')!
    expect(jnb).toMatchObject({ title: 'Resolver hospedagem e safari JNB', date: '2026-11-02', dueDate: '2026-11-06', status: 'todo' })
    expect(after.tasks.some((t) => t.id === m31Id('alerta-hoteis-jnb'))).toBe(false)
    expect(after.tasks.find((t) => /confirmação à escola/.test(t.title))!.dueDate! < '2026-11-09').toBe(true)
  })

  it('section 8: trip workouts only on light days; knee-adapted lower body; no bungee recommendation', () => {
    const trip = after.trips.find((t) => t.id === TRIP)!
    const ws = tripWorkouts(trip, after.workouts).filter((w) => w.id.startsWith('seed:za1031:'))
    expect(ws.map((w) => w.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-10', '2026-11-11', '2026-11-12'])
    const banned = ['2026-11-04', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']
    expect(ws.filter((w) => banned.includes(w.date))).toEqual([])
    expect(ws.filter((w) => w.title?.startsWith('Força superior'))).toHaveLength(2)
    expect(ws.find((w) => /inferior adaptada/.test(w.title!))!.notes).toMatch(/joelho esquerdo/i)
    expect(ws.every((w) => w.status === 'planejado' && !w.templateId && w.intensity !== 'forte')).toBe(true)
    const bungee = byId(after, zaId('bloukrans'))!
    expect(bungee).toMatchObject({ optional: true, clearance: 'pendente' })
    expect(bookingStatusOf(bungee)).toBe('opcional')
  })

  it('school: 04/11 holiday (no class, no absence), 09/11 absence flagged, 28 and 29/10 counted absences', () => {
    const trip = after.trips.find((t) => t.id === TRIP)!
    expect(classOn(trip.expedition, '2026-11-04')).toBeUndefined()
    const days = schoolDays(trip, tripItems(after))
    expect(days.find((d) => d.date === '2026-11-04')).toBeUndefined()
    expect(days.find((d) => d.date === '2026-11-09')!.impact).toBe('dia')
    expect(days.find((d) => d.date === '2026-10-28')!.impact).toBe('dia')
    expect(days.find((d) => d.date === '2026-10-29')!.impact).toBe('dia') // confirmed absence (31/10)
    const s = schoolSummary(days)
    expect(s.toConfirm).toBe(0)
    expect(s.lost).toBe(3) // 28/10, 29/10, 09/11
    expect(s.preserved + s.lost + s.partial + s.madeUp + s.toConfirm).toBe(s.total)
  })

  it('section 10: Fashion Finder blocks of 45–90 min on light weekdays, existing tasks reused', () => {
    const trip = after.trips.find((t) => t.id === TRIP)!
    const blocks = workBlocks(trip, after.tasks)
    expect(blocks.map((b) => b.date)).toEqual(['2026-11-02', '2026-11-05', '2026-11-06', '2026-11-10', '2026-11-11', '2026-11-12'])
    for (const b of blocks) expect(b.minutes >= 45 && b.minutes <= 90, b.date).toBe(true)
    expect(after.tasks.find((t) => t.id === 'seed:backlog:solucionar-conta-google')).toMatchObject({ date: '2026-11-05', status: 'todo' })
    expect(after.tasks.find((t) => t.id === 'seed:backlog:criar-conta-pj-para-fashion-finder')).toMatchObject({ date: '2026-11-11', durationMin: 60 })
    expect(after.tasks.some((t) => t.id === m31Id('ff-contas') || t.id === m31Id('ff-pj-linkedin'))).toBe(false)
  })

  it('dashboard on 31/10: next = Cape Point, waiting answers, pending bookings, ZAR spent (paid only), 16 days to the flight', () => {
    const trip = after.trips.find((t) => t.id === TRIP)!
    const d = tripDashboard(trip, tripItems(after), after.tasks, { date: '2026-10-31', minutes: 21 * 60 })
    expect(d.next?.item.id).toBe(zaId('cape-point'))
    expect(d.daysToFlight).toBe(16)
    expect(d.awaiting.map((i) => i.id).sort()).toEqual([old('safari'), zaId('stellenbosch-gravel')].sort())
    expect(d.pendingBookings.map((i) => i.id)).toEqual(expect.arrayContaining([old('hosp-johannesburg'), m31Id('hotel-or-tambo-15'), old('transfers'), zaId('gansbaai-hermanus')]))
    expect(d.priorities.length).toBeLessThanOrEqual(3)
    expect(d.spentCents).toBe(150000 + 30000 + 25000)
    expect(d.currency).toBe('ZAR')
  })
})

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

describe('Atualização mestre 31/10 — gate and fresh install', () => {
  const fresh = () => applyExpeditionSeed(buildSeed('2026-10-27'), '2026-10-27T10:00:00.000Z')

  it('does nothing before 31/10', () => {
    const db = fresh()
    expect(applyMaster1031(db, '2026-10-30')).toBe(db)
  })

  it('applies to the seed once, then never again; a deleted seed record never comes back', () => {
    const db = fresh()
    const once = applyMaster1031(db, '2026-10-31', NOW)
    expect(once.profile.tripUpdatesApplied).toEqual([MASTER_1031_ID])
    expect(applyMaster1031(once, '2026-11-02')).toBe(once)
    const cp = byId(once, zaId('cape-point'))!
    expect(bookingStatusOf(cp)).toBe('reservado')
    // She deleted the Clifton record on another device before this one ran the update.
    const withTombstone: DB = { ...db, profile: { ...db.profile, removedSeedIds: [m31Id('clifton-beach')] } }
    expect(byId(applyMaster1031(withTombstone, '2026-10-31', NOW), m31Id('clifton-beach'))).toBeUndefined()
  })

  it('a field she edited stays hers (only seed values are replaced)', () => {
    const db = fresh()
    const edited: TripItem = { ...byId(db, zaId('kalk-bay'))!, date: '2026-11-03', updatedAt: '2026-10-30T10:00:00.000Z' }
    const mine = { ...db, tripItems: db.tripItems.map((i) => (i.id === edited.id ? edited : i)) }
    const out = byId(applyMaster1031(mine, '2026-10-31', NOW), zaId('kalk-bay'))!
    expect(out.date).toBe('2026-11-03') // hers
    expect(out.notes).toMatch(/Dalebrook/) // was empty → filled
  })
})
