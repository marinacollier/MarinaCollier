/**
 * Atualização operacional 06/11 on top of the data a device holds on 06/11 (seed + Expedição + 31/10 + 01/11):
 * what it updates, creates, closes and leaves pending; that it never duplicates, never reopens or moves what she
 * closed or booked, keeps her payments and notes; and that it survives a full reload of the app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { buildSeed } from '.'
import { applyModuleSeeds, flushNow, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import type { DB, TripItem } from '../types'
import { findConflicts } from '@/features/travel/expedition/logic'
import { bookingStatusOf } from '@/features/travel/expedition/command'
import { zaId } from './expedition'
import { m31Id } from './master-1031'
import { applyUpdate1106, u06Id, UPDATE_1106_ID } from './update-1106'
import { normalize } from '@/lib/text'

const TRIP = 'trip-africa-do-sul'
const NOW = '2026-11-06T09:00:00.000Z'
/** The device on the morning of 06/11, before this update (31/10 and 01/11 already applied). */
const before = (): DB => {
  const db = applyModuleSeeds(buildSeed('2026-11-05'), '2026-11-05')
  return db
}
const after = (db = before()) => applyUpdate1106(db, '2026-11-06', NOW)
const item = (db: DB, id: string) => db.tripItems.find((i) => i.id === id)!
const byTitle = (db: DB, re: RegExp) => db.tripItems.filter((i) => i.tripId === TRIP && re.test(i.title))

describe('Atualização 06/11', () => {
  it('waits for 06/11 and runs once', () => {
    const db = before()
    expect(applyUpdate1106(db, '2026-11-05', NOW)).toBe(db)
    const once = after(db)
    expect(once.profile.tripUpdatesApplied).toContain(UPDATE_1106_ID)
    expect(applyUpdate1106(once, '2026-11-07', NOW)).toBe(once)
  })

  it('rebuilds the existing records for the last week (same ids, no duplicates)', () => {
    const db = after()
    const velo = item(db, zaId('stellenbosch-gravel'))
    expect(velo).toMatchObject({ date: '2026-11-08', quotedCents: 400000, currency: 'ZAR' })
    expect(bookingStatusOf(velo)).toBe('aguardando_pagamento')
    expect(velo.paidCents).toBeUndefined()

    const shark = item(db, zaId('gansbaai-hermanus'))
    expect(shark).toMatchObject({ date: '2026-11-10', quotedCents: 600000, schoolImpact: 'dia', certainty: 'clima' })
    expect(bookingStatusOf(shark)).toBe('aguardando_resposta')
    expect(shark.supplier).toMatch(/WHI-114/)

    expect(item(db, zaId('caiaque'))).toMatchObject({ date: '2026-11-09', time: '13:00', optional: false, schoolImpact: 'parcial' })
    expect(item(db, zaId('snorkel-focas'))).toMatchObject({ date: '2026-11-11', time: '09:00', quotedCents: 295000 })
    expect(item(db, zaId('snorkel-focas')).nextAction).toMatch(/sem a GoPro/)
    expect(item(db, zaId('robben-island'))).toMatchObject({ date: '2026-11-12', time: '15:00', estimatedCents: 60000, optional: false })
    expect(item(db, zaId('kalk-bay'))).toMatchObject({ date: '2026-11-07', leaveTime: '08:30', time: '09:30' })

    const titles = db.tripItems.filter((i) => i.tripId === TRIP && i.status !== 'cancelado').map((i) => normalize(i.title))
    expect(titles.length).toBe(new Set(titles).size)
    expect(byTitle(db, /Caiaque/)).toHaveLength(1)
    expect(byTitle(db, /Robben/)).toHaveLength(1)
  })

  it('records the dinner payment as paid, not the table as confirmed', () => {
    const mama = item(after(), u06Id('mama-africa'))
    expect(mama).toMatchObject({ paidCents: 11000, currency: 'ZAR', date: '2026-11-06' })
    expect(bookingStatusOf(mama)).toBe('aguardando_resposta')
    expect(mama.time).toBeUndefined()
  })

  it('Wine Tram is a pending decision, never booked', () => {
    const tram = item(after(), u06Id('wine-tram'))
    expect(bookingStatusOf(tram)).toBe('opcional')
    expect(tram.date).toBeUndefined()
    expect(tram.notes).toMatch(/Robben Island/)
  })

  it('takes the Garden Route out of the week without deleting or cancelling it', () => {
    const db = after()
    for (const id of [zaId('garden-route-1'), zaId('garden-route-hosp'), zaId('tsitsikamma'), zaId('garden-route-volta'), m31Id('prep-garden-route'), zaId('kirstenbosch')]) {
      const r = item(db, id)
      expect(r.status).not.toBe('cancelado')
      expect(bookingStatusOf(r)).toBe('opcional')
      expect(r.date).toBeUndefined()
    }
  })

  it('tasks: done today, open today, operators awaited — without duplicating', () => {
    const db = after()
    const t = (re: RegExp) => db.tasks.filter((x) => re.test(x.title))
    expect(t(/Bernoulli/)[0]).toMatchObject({ status: 'done', date: '2026-11-06' })
    expect(t(/Reunião da manhã — Tranquilo/)[0].status).toBe('done')
    expect(t(/^Reunião Fashion Finder$/)[0]).toMatchObject({ status: 'todo', time: '18:00', date: '2026-11-06' })
    for (const re of [/teste de inglês/i, /apresentação de inglês/i, /ajustes técnicos/i, /Cape Velo, pagamento/, /Ocean Safari e Robben/]) expect(t(re)[0].status).toBe('todo')
    // Apple: her existing open task is planned for today instead of a second one.
    expect(db.tasks.filter((x) => /apple/i.test(x.title) && x.status !== 'done' && x.status !== 'archived')).toHaveLength(1)
    expect(db.tasks.find((x) => /apple/i.test(x.title) && x.status === 'todo')!.date).toBe('2026-11-06')
    const waiting = db.tasks.filter((x) => x.status === 'waiting' && x.tags?.includes('operador'))
    expect(waiting.map((x) => x.waiting!.who).sort()).toEqual(['Kayak Adventures', 'Mama Africa / Dineplan', 'White Shark Diving (Amanda)'])
    expect(db.tasks.find((x) => x.id === m31Id('alerta-cape-velo'))!.status).toBe('done')
    expect(db.tasks.find((x) => x.id === m31Id('alerta-garden-route'))!.status).toBe('archived')
    // ff-busca (06/11) is left exactly as it was: she did not say it was done.
    expect(db.tasks.find((x) => x.id === m31Id('ff-busca'))!.status).toBe('todo')
  })

  it('reuses the 31/10 shopping list (Lucas, Matheus, canga) and adds the rest once', () => {
    const db = after()
    expect(item(db, m31Id('whisky-luquinhas')).person).toBe('Lucas')
    expect(byTitle(db, /Whisky/)).toHaveLength(1)
    expect(byTitle(db, /Essence stick foundation cor 160/)).toHaveLength(1)
    expect(item(db, u06Id('mercado-6')).notes).toMatch(/consumir localmente/)
  })

  it('never reopens, moves or downgrades what she closed, booked or paid', () => {
    const db = before()
    const set = (id: string, patch: Partial<TripItem>) => (db.tripItems = db.tripItems.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: '2026-11-04T10:00:00.000Z' } : i)))
    set(zaId('gansbaai-hermanus'), { status: 'cancelado', bookingStatus: 'cancelado', notes: 'Cancelado pelo mar em 04/11' })
    set(zaId('robben-island'), { bookingStatus: 'reservado', status: 'confirmado', confirmationCode: 'RI-123', date: '2026-11-11', time: '09:00', optional: false })
    set(zaId('stellenbosch-gravel'), { paidCents: 100000, notes: 'Sinal pago' })
    const out = after(db)
    // Cancelled stays cancelled; the 10/11 trip is a new record.
    expect(item(out, zaId('gansbaai-hermanus'))).toMatchObject({ status: 'cancelado', notes: 'Cancelado pelo mar em 04/11' })
    expect(item(out, u06Id('gansbaai'))).toMatchObject({ date: '2026-11-10', quotedCents: 600000 })
    // Booked with proof: date/time stay; the clash with class is shown, not fixed.
    expect(item(out, zaId('robben-island'))).toMatchObject({ date: '2026-11-11', time: '09:00', bookingStatus: 'reservado' })
    // Her payment and notes stay; the 06/11 line is appended.
    const velo = item(out, zaId('stellenbosch-gravel'))
    expect(velo.paidCents).toBe(100000)
    expect(velo.notes).toMatch(/^Sinal pago\n06\/11:/)
  })

  it('respects records she deleted', () => {
    const db = before()
    db.profile = { ...db.profile, removedSeedIds: [...(db.profile.removedSeedIds ?? []), u06Id('wine-tram'), u06Id('espera-kayak')] }
    const out = after(db)
    expect(out.tripItems.some((i) => i.id === u06Id('wine-tram'))).toBe(false)
    expect(out.tasks.some((t) => t.id === u06Id('espera-kayak'))).toBe(false)
  })

  it('leaves the real clashes visible', () => {
    const db = after()
    const trip = db.trips.find((t) => t.id === TRIP)!
    const clashes = findConflicts(trip, db.tripItems.filter((i) => i.tripId === TRIP), db.workouts)
    // Ocean Safari at 09:00 on a class day (Wednesday 11/11).
    expect(clashes.some((c) => c.date === '2026-11-11' && c.items.some((i) => /Ocean Safari/.test(i.title)))).toBe(true)
  })
})

describe('Atualização 06/11 through the real boot', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-06T09:00:00+02:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('applies on open, keeps a copy before, and survives a reload', async () => {
    const storage = createMemoryAdapter(before())
    await hydrate(storage)
    expect(getDB().profile.tripUpdatesApplied).toContain(UPDATE_1106_ID)
    await flushNow()
    const saved = structuredClone(storage.data) as DB
    expect(saved.tripItems.find((i) => i.id === zaId('stellenbosch-gravel'))!.date).toBe('2026-11-08')
    const { listSnapshots } = await import('../snapshots')
    expect((await listSnapshots()).some((s) => /06\/11/.test(s.reason))).toBe(true)

    await hydrate(storage) // reopen
    expect(getDB().tripItems.filter((i) => i.id.startsWith('seed:za1106:')).length).toBe(saved.tripItems.filter((i) => i.id.startsWith('seed:za1106:')).length)
    expect(getDB().tasks.filter((t) => /Bernoulli/.test(t.title))).toHaveLength(1)
    expect(getDB().tripItems.find((i) => i.id === u06Id('mama-africa'))!.paidCents).toBe(11000)
  })
})
