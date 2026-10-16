/**
 * "Itens de viagem confirmados voltaram para a confirmar" — never again. Her device data, then a NEW VERSION
 * of the app (a newer life seed running the hydrate path again): nothing she did reverts, nothing she deleted
 * comes back, every id stays the same. Plus the two other fixes: a stale instance never saves over a newer
 * one, and a failed read never puts the seed over her data. See docs/PERSISTENCIA.md.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { actions, detachStorage, flushNow, getDB, hydrate } from '../store'
import { createMemoryAdapter, type StorageAdapter } from '../storage'
import type { DB } from '../types'
import { LIFE_SEED_VERSION } from '.'

afterEach(() => detachStorage())

const ids = (db: DB) => Object.fromEntries(Object.entries(db).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as { id: string }[]).map((x) => x.id).sort()]))

describe('a new version of the app keeps her data', () => {
  it('confirmed trip items + edits + deletions survive a seed bump; no seed id resurrects; ids are stable', async () => {
    const device = createMemoryAdapter()
    await hydrate(device)
    const db0 = getDB()
    const trip = db0.tripItems.filter((t) => t.status === 'a_confirmar')
    expect(trip.length).toBeGreaterThan(3)
    // What she did.
    actions.update('tripItems', trip[0].id, { status: 'confirmado', confirmationCode: 'ABC123' })
    actions.update('tripItems', trip[1].id, { status: 'feito' })
    actions.update('tripItems', trip[2].id, { title: `${trip[2].title} (meu nome)`, status: 'confirmado' })
    actions.remove('tripItems', trip[3].id)
    const seedTask = db0.tasks.find((t) => t.id.startsWith('seed:') && t.status === 'todo' && !t.recurrence)!
    actions.update('tasks', seedTask.id, { status: 'done', completedAt: '2026-10-15T12:00:00.000Z' })
    actions.create('tasks', { title: 'Minha tarefa própria', status: 'todo', order: 1 })
    await flushNow()
    const mine = structuredClone(getDB())

    // New version: the stored DB says it was made by an older seed → applyLifeSeed runs again at boot.
    const stored = (await device.load()) as DB
    stored.profile = { ...stored.profile, seedVersion: LIFE_SEED_VERSION - 1 }
    await device.save(stored)
    await hydrate(device)
    const after = getDB()

    expect(after.tripItems.find((t) => t.id === trip[0].id)).toMatchObject({ status: 'confirmado', confirmationCode: 'ABC123' })
    expect(after.tripItems.find((t) => t.id === trip[1].id)?.status).toBe('feito')
    expect(after.tripItems.find((t) => t.id === trip[2].id)).toMatchObject({ status: 'confirmado', title: `${trip[2].title} (meu nome)` })
    // No "a confirmar" copy next to the ones she confirmed or renamed, and the deleted one stays deleted.
    expect(after.tripItems.filter((t) => t.tripId === trip[0].tripId && t.title === trip[0].title)).toHaveLength(1)
    expect(after.tripItems.some((t) => t.id === trip[3].id)).toBe(false)
    expect(after.tripItems.filter((t) => t.title === trip[2].title && t.status === 'a_confirmar')).toHaveLength(0)
    expect(after.tasks.find((t) => t.id === seedTask.id)?.status).toBe('done')
    expect(after.tasks.some((t) => t.title === 'Minha tarefa própria')).toBe(true)
    // Same records, same ids (nothing resurrected, nothing re-keyed).
    expect(ids(after)).toEqual(ids(mine))
    expect(after.profile.removedSeedIds).toContain(trip[3].id)

    // And again (two deploys in a row): still identical.
    const again = (await device.load()) as DB
    again.profile = { ...again.profile, seedVersion: LIFE_SEED_VERSION - 1 }
    await device.save(again)
    await hydrate(device)
    expect(ids(getDB())).toEqual(ids(mine))
  })

  it('a stale instance with nothing new never saves its old snapshot over a newer save', async () => {
    const device = createMemoryAdapter()
    await hydrate(device)
    const item = getDB().tripItems[0]
    // Another (newer) instance confirmed it and saved.
    const newer = structuredClone(getDB())
    newer.tripItems = newer.tripItems.map((t) => (t.id === item.id ? { ...t, status: 'confirmado' as const } : t))
    await device.save(newer)
    // This old tab goes to the background: flush with nothing dirty writes nothing.
    await flushNow()
    expect((device.data as DB).tripItems.find((t) => t.id === item.id)?.status).toBe('confirmado')
  })

  it('a failed read never writes the seed over her data', async () => {
    const real = createMemoryAdapter()
    await hydrate(real)
    actions.update('tripItems', getDB().tripItems[0].id, { status: 'confirmado' })
    await flushNow()
    const saved = JSON.stringify(real.data)
    const flaky: StorageAdapter = { load: () => Promise.reject(new Error('busy')), save: real.save, clear: real.clear }
    await hydrate(flaky)
    actions.create('tasks', { title: 'em memória', status: 'todo', order: 1 })
    await flushNow().catch(() => undefined)
    expect(JSON.stringify(real.data)).toBe(saved)
  })
})
