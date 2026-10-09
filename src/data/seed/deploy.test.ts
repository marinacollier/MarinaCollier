/**
 * "Quando eu subir um deploy novo, persista o que eu já tinha dado check e alterado."
 * A new deploy = the app opens her existing device data with a newer life seed. Nothing she did may be
 * undone: checks, edits, deletions, her own records. Only genuinely new seed records arrive — once.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { buildSeed } from '.'
import { actions, detachStorage, flushNow, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import type { DB } from '../types'

const DAY = '2026-10-09'
afterEach(() => detachStorage())

/** Her phone as it was on the previous version (seed v8: no backlog yet, no bookkeeping). */
function previousInstall(): DB {
  const db = buildSeed(DAY)
  db.tasks = db.tasks.filter((t) => !t.id.startsWith('seed:backlog:'))
  db.projects = db.projects.filter((p) => p.id !== 'seed:work:tranquilo-sp')
  const defaults = new Set(['cat-casa', 'cat-mercado', 'cat-restaurante', 'cat-transporte', 'cat-luna', 'cat-esporte', 'cat-viagem', 'cat-beleza', 'cat-autocuidado', 'cat-educacao', 'cat-trabalho', 'cat-lazer', 'cat-compras', 'cat-assinaturas', 'cat-outros'])
  db.financialCategories = db.financialCategories.filter((c) => defaults.has(c.id)).map(({ bill: _bill, ...c }) => c)
  db.profile = { ...db.profile, seedVersion: 8, seedIds: undefined, removedSeedIds: undefined }
  return db
}

async function open(device: ReturnType<typeof createMemoryAdapter>) {
  await hydrate(device)
  return getDB()
}

describe('a new deploy keeps everything she did', () => {
  it('checks, edits, deletions and her own records survive; the new backlog arrives once', async () => {
    const device = createMemoryAdapter()
    await device.save(previousInstall())
    await open(device)

    // What she did on the old version.
    const seedTask = getDB().tasks.find((t) => t.id.startsWith('seed:work:') && t.status === 'todo')!
    const deleted = getDB().tasks.find((t) => t.id.startsWith('seed:work:') && t.id !== seedTask.id)!
    actions.update('tasks', seedTask.id, { status: 'done', completedAt: `${DAY}T12:00:00.000Z` })
    actions.remove('tasks', deleted.id)
    const routineItem = getDB().routineItems[0]
    actions.toggleOccurrence('routineItem', routineItem.id, DAY)
    const event = getDB().events[0]
    actions.toggleOccurrence('event', event.id, DAY)
    actions.toggleOccurrence('item', 'waiting:x', DAY)
    actions.create('tasks', { title: 'Minha tarefa', status: 'todo', date: DAY, order: 1 })
    const trip = getDB().trips[0]
    actions.update('trips', trip.id, { name: 'Meu nome pra viagem' })
    await flushNow()
    // Old installs had no bookkeeping yet: the deletion happened before this version.
    const stored = (await device.load()) as DB
    stored.profile = { ...stored.profile, seedVersion: 8, removedSeedIds: undefined, seedIds: undefined }
    await device.save(stored)

    // Deploy (seed v9).
    const db = await open(device)
    expect(db.tasks.find((t) => t.id === seedTask.id)?.status).toBe('done')
    expect(db.tasks.some((t) => t.id === deleted.id)).toBe(false)
    expect(db.tasks.some((t) => t.title === 'Minha tarefa')).toBe(true)
    expect(db.trips.find((t) => t.id === trip.id)?.name).toBe('Meu nome pra viagem')
    expect(db.occurrences.filter((o) => o.date === DAY).map((o) => o.parentType).sort()).toEqual(['event', 'item', 'routineItem'])
    // The backlog of 09/10 arrived, with payments as categories with a check.
    expect(db.tasks.filter((t) => t.id.startsWith('seed:backlog:'))).toHaveLength(16)
    expect(db.tasks.find((t) => t.title === 'Abrir B.O de pedágio')).toMatchObject({ date: '2026-10-10', priority: 'alta', durationMin: 30 })
    expect(db.financialCategories.find((c) => c.id === 'cat-assinaturas')?.bill).toEqual({ every: 'mes' })
    expect(db.financialCategories.find((c) => c.name === 'Hortifruti e carnes')?.bill).toEqual({ every: 'semana' })
    expect(db.financialCategories.find((c) => c.name === 'Ajuda vó')?.bill?.every).toBe('mes')
    expect(db.financialCategories.every((c) => c.budgetCents === undefined)).toBe(true)
  })

  it('the next deploy after that: a backlog task she deleted or edited stays as she left it; nothing duplicates', async () => {
    const device = createMemoryAdapter()
    await device.save(previousInstall())
    await open(device)
    const before = getDB().tasks.length
    const gone = getDB().tasks.find((t) => t.title === 'Cobrar agendas necessárias')!
    actions.remove('tasks', gone.id)
    const edited = getDB().tasks.find((t) => t.title === 'Revisar épicos de layout')!
    actions.update('tasks', edited.id, { title: 'Revisar épicos de layout (v2)', date: '2026-10-12' })
    const paid = getDB().financialCategories.find((c) => c.name === 'Aluguel')!
    actions.toggleOccurrence('bill', paid.id, '2026-10-01')
    actions.update('financialCategories', paid.id, { bill: { every: 'mes', dueDay: 5 } })
    await flushNow()

    // A later version (any seed bump).
    const stored = (await device.load()) as DB
    stored.profile = { ...stored.profile, seedVersion: 8 }
    await device.save(stored)
    const db = await open(device)
    expect(db.tasks.some((t) => t.title === 'Cobrar agendas necessárias')).toBe(false)
    expect(db.tasks.find((t) => t.id === edited.id)).toMatchObject({ title: 'Revisar épicos de layout (v2)', date: '2026-10-12' })
    expect(db.tasks.length).toBe(before - 1)
    expect(db.financialCategories.find((c) => c.id === paid.id)?.bill).toEqual({ every: 'mes', dueDay: 5 })
    expect(db.occurrences.some((o) => o.parentType === 'bill' && o.parentId === paid.id)).toBe(true)
  })

  it('undoing a deletion of a seed record lifts the tombstone', async () => {
    const device = createMemoryAdapter()
    await device.save(buildSeed(DAY))
    await open(device)
    const t = getDB().tasks.find((x) => x.id.startsWith('seed:'))!
    const removed = actions.remove('tasks', t.id)!
    expect(getDB().profile.removedSeedIds).toContain(t.id)
    actions.restore('tasks', removed)
    expect(getDB().profile.removedSeedIds).not.toContain(t.id)
  })
})
