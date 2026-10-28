import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { buildSeed } from '.'
import { applyExpeditionSeed, EXPEDITION_TRIP_ID, expeditionNewItems, zaId } from './expedition'
import { actions, flushNow, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import type { DB, TripItem } from '../types'
import { certaintyOf } from '@/features/travel/expedition/logic'
import { makeBackup, validateBackup, type BackupPreview } from '@/features/settings/backup'
import { restoreBackup } from '@/features/settings/backup-io'

const NOW = '2026-10-27T10:00:00.000Z'
const seed = () => buildSeed('2026-10-27')
const item = (db: DB, id: string) => db.tripItems.find((i) => i.id === id)!
const old = (slug: string) => `seed:travel:${EXPEDITION_TRIP_ID}-${slug}`

describe('Expedição seed', () => {
  it('adds the base itinerary, flights, residence, school and the extras with honest statuses', () => {
    const before = seed()
    const db = applyExpeditionSeed(before, NOW)
    const trip = db.trips.find((t) => t.id === EXPEDITION_TRIP_ID)!
    expect(trip.startDate).toBe('2026-10-24')
    expect(trip.endDate).toBe('2026-11-16')
    expect(trip.expedition).toMatchObject({ currency: 'ZAR', marginPct: 15, timeZone: 'Africa/Johannesburg' })
    expect(trip.expedition!.rateToBRL).toBeUndefined() // no invented rate
    expect(trip.expedition!.school).toMatchObject({ name: 'Bayswater Cape Town', until: '2026-11-13' })
    expect(db.tripItems.length).toBe(before.tripItems.length + expeditionNewItems().length)

    // Flights and residence as given.
    expect(item(db, old('ida-johannesburg'))).toMatchObject({ section: 'voo', date: '2026-11-13', time: '19:35', endTime: '21:35', status: 'confirmado' })
    expect(item(db, old('voo-retorno'))).toMatchObject({ section: 'voo', date: '2026-11-16', time: '11:10', status: 'confirmado' })
    expect(item(db, old('hosp-cape-town'))).toMatchObject({ title: 'Hospedagem Cape Town', address: '106 Adderley Street, Cape Town 8001', status: 'confirmado' })
    // Reused, not duplicated.
    expect(db.tripItems.filter((i) => i.tripId === EXPEDITION_TRIP_ID && /^escola/i.test(i.title))).toHaveLength(1)

    // Subject to wind / availability / medical clearance → never confirmed.
    expect(certaintyOf(item(db, zaId('parapente')))).toBe('clima')
    expect(item(db, zaId('parapente')).status).toBe('a_confirmar')
    expect(certaintyOf(item(db, zaId('caiaque')))).toBe('pendente')
    expect(item(db, zaId('bloukrans'))).toMatchObject({ clearance: 'pendente', status: 'a_confirmar' })
    expect(certaintyOf(item(db, zaId('bloukrans')))).toBe('pendente')
    const safari = item(db, old('safari-dias'))
    expect(safari).toMatchObject({ date: '2026-11-14', endDate: '2026-11-15', needsPickup: true, pickupConfirmed: false, status: 'a_confirmar' })

    // Extras: optional, never done.
    const extras = db.tripItems.filter((i) => i.optional)
    expect(extras.map((i) => i.title)).toEqual(expect.arrayContaining(['Robben Island', 'District Six Museum', 'Two Oceans Aquarium']))
    expect(extras.every((i) => i.status === 'a_confirmar' && i.booking === 'nao_pesquisado')).toBe(true)

    // The only money value is the one she wrote.
    const valued = db.tripItems.filter((i) => i.estimatedCents != null || i.quotedCents != null || i.paidCents != null || i.uberCents != null)
    expect(valued.map((i) => [i.id, i.estimatedCents, i.currency])).toEqual([[zaId('stellenbosch-gravel'), 400000, 'ZAR']])
  })

  it('is idempotent: a second run returns the same database object', () => {
    const once = applyExpeditionSeed(seed(), NOW)
    const twice = applyExpeditionSeed(once, '2026-10-28T10:00:00.000Z')
    expect(twice).toBe(once)
    const ids = twice.tripItems.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never overwrites what she edited: the item keeps her data and only gains missing expedition fields', () => {
    const db = seed()
    const later = '2026-10-20T10:00:00.000Z'
    db.tripItems = db.tripItems.map((i) =>
      i.id === old('safari-dias') ? { ...i, notes: 'Já planejado — não reservar de novo.', status: 'confirmado', updatedAt: later } : i,
    )
    db.trips = db.trips.map((t) => (t.id === EXPEDITION_TRIP_ID ? { ...t, notes: 'minha nota', updatedAt: later } : t))
    const out = applyExpeditionSeed(db, NOW)
    const s = item(out, old('safari-dias'))
    expect(s).toMatchObject({ title: 'Safari', notes: 'Já planejado — não reservar de novo.', status: 'confirmado', checklistKind: 'safari', needsPickup: true })
    expect(s.time).toBeUndefined() // a field that already existed before stays hers to fill
    const trip = out.trips.find((t) => t.id === EXPEDITION_TRIP_ID)!
    expect(trip.startDate).toBe('2026-10-22') // she edited the trip: the date is hers
    expect(trip.notes).toBe('minha nota')
    expect(trip.expedition).toBeDefined()
  })

  it('respects deletions and her own items with the same title', () => {
    const db = seed()
    db.profile = { ...db.profile, removedSeedIds: [zaId('robben-island')] }
    db.tripItems = [...db.tripItems, { id: 'mine', tripId: EXPEDITION_TRIP_ID, section: 'roteiro', title: "lion's head", status: 'feito', order: 99, createdAt: NOW, updatedAt: NOW } as TripItem]
    const out = applyExpeditionSeed(db, NOW)
    expect(out.tripItems.some((i) => i.id === zaId('robben-island'))).toBe(false)
    expect(out.tripItems.some((i) => i.id === zaId('lions-head'))).toBe(false)
    expect(out.tripItems.filter((i) => /lion/i.test(i.title))).toHaveLength(1)
  })

  it('does nothing when the trip was deleted', () => {
    const db = seed()
    db.trips = db.trips.filter((t) => t.id !== EXPEDITION_TRIP_ID)
    db.tripItems = db.tripItems.filter((i) => i.tripId !== EXPEDITION_TRIP_ID)
    expect(applyExpeditionSeed(db, NOW)).toBe(db)
  })

  it('boot applies it once; deleting an item survives a restart; backup round-trips the new fields', async () => {
    const device = createMemoryAdapter()
    await device.save(seed())
    await hydrate(device)
    expect(getDB().trips.find((t) => t.id === EXPEDITION_TRIP_ID)!.expedition).toBeDefined()
    const count = getDB().tripItems.length

    actions.update('tripItems', zaId('lions-head'), { checked: ['Água'], uberCents: 9000, wakeTime: '06:00' })
    actions.remove('tripItems', zaId('aquarium'))
    await flushNow()
    await hydrate(device)
    expect(getDB().tripItems.length).toBe(count - 1)
    expect(item(getDB(), zaId('lions-head'))).toMatchObject({ checked: ['Água'], uberCents: 9000, wakeTime: '06:00' })

    const before = structuredClone(getDB())
    const text = JSON.stringify(makeBackup(getDB()))
    const fresh = createMemoryAdapter()
    await hydrate(fresh)
    const preview = validateBackup(JSON.parse(text))
    expect(preview.ok).toBe(true)
    await restoreBackup(preview as BackupPreview)
    await hydrate(fresh)
    expect(getDB().trips).toEqual(before.trips)
    expect(getDB().tripItems).toEqual(before.tripItems)
  })
})
