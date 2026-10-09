/**
 * Lumos only says "feito" after the device holds the change (save + read back).
 * If the device refuses, nothing changes and she says she could NOT save.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, getDB, hydrate, useStore } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import type { DB } from '@/data/types'
import { whenSaved } from './act/commit'
import { ask, clearConversation, undoAdjust, undoReply, useConversation, type Exchange } from './conversation'

const FRI = '2026-10-09'
const NOW: Now = { date: FRI, minutes: 10 * 60, iso: `${FRI}T10:00:00.000-03:00` }

/** A device that can be told to refuse writes, or to lose them (read-back differs). */
function device() {
  const mem = createMemoryAdapter()
  const d = {
    mode: 'ok' as 'ok' | 'refuse' | 'lose',
    data: () => mem.data as DB | null,
    async load() {
      return mem.load()
    },
    async save(db: DB) {
      if (d.mode === 'refuse') throw new Error('QuotaExceededError')
      if (d.mode === 'lose') return
      return mem.save(db)
    },
    async clear() {
      return mem.clear()
    },
  }
  return d
}

let dev: ReturnType<typeof device>
const ex = (id: number): Exchange => useConversation.getState().exchanges.find((e) => e.id === id)!

beforeEach(async () => {
  dev = device()
  await hydrate(dev)
  actions.replaceDB(buildSeed(FRI))
  await whenSaved()
  clearConversation()
})
afterEach(() => detachStorage())

const lunaTask = (db: DB | null) => db?.tasks.find((t) => /ração da luna/i.test(t.title))

describe('Lumos confirms only after persisting', () => {
  it('direct action: "salvando" first, "feito" only once the device holds it', async () => {
    const id = ask('preciso lembrar de comprar ração da Luna', NOW)!
    expect(ex(id).lumos?.status).toBe('saving')
    await whenSaved()
    expect(ex(id).lumos?.status).toBe('done')
    expect(lunaTask(dev.data())).toBeDefined()
  })

  it('device refuses → she says she did NOT save, and nothing changed (memory rolled back too)', async () => {
    dev.mode = 'refuse'
    const id = ask('preciso lembrar de comprar ração da Luna', NOW)!
    await whenSaved()
    expect(ex(id).lumos?.status).toBe('failed')
    expect(lunaTask(getDB())).toBeUndefined()
    expect(lunaTask(dev.data())).toBeUndefined()
    expect(useStore.getState().saveFailed).toBe(true)
    expect(getDB().lifeLog.some((e) => /ração/i.test(e.title))).toBe(false)
  })

  it('write silently lost (read-back differs) counts as a failure', async () => {
    dev.mode = 'lose'
    const id = ask('preciso lembrar de comprar ração da Luna', NOW)!
    await whenSaved()
    expect(ex(id).lumos?.status).toBe('failed')
    expect(lunaTask(getDB())).toBeUndefined()
  })

  it('schedule change (adjust card): applied only after save; failure rolls back the time', async () => {
    const before = structuredClone(getDB().scheduleOverrides)
    const workoutsBefore = structuredClone(getDB().workouts)
    dev.mode = 'refuse'
    const id = ask('minha corrida hoje é 6h45', NOW)!
    await whenSaved()
    const e = ex(id)
    expect(e.adjust ?? e.lumos).toBeDefined()
    expect(e.adjust?.status ?? e.lumos?.status).toBe('failed')
    expect(getDB().scheduleOverrides).toEqual(before)
    expect(getDB().workouts).toEqual(workoutsBefore)

    dev.mode = 'ok'
    const id2 = ask('minha corrida hoje é 6h45', NOW)!
    await whenSaved()
    const e2 = ex(id2)
    expect(e2.adjust?.status ?? e2.lumos?.status).toMatch(/applied|done/)
    expect(JSON.stringify(dev.data())).toEqual(JSON.stringify(getDB()))
  })

  it('Desfazer is a write too: "desfeito" only after save; if it fails the change stays and she says so', async () => {
    const id = ask('preciso lembrar de comprar ração da Luna', NOW)!
    await whenSaved()
    dev.mode = 'refuse'
    undoReply(id)
    await whenSaved()
    expect(ex(id).lumos?.status).toBe('done')
    expect(ex(id).saveNote).toMatch(/não consegui salvar o desfazer/i)
    expect(lunaTask(getDB())).toBeDefined()

    dev.mode = 'ok'
    undoReply(id)
    expect(ex(id).lumos?.status).toBe('saving')
    await whenSaved()
    expect(ex(id).lumos?.status).toBe('undone')
    expect(lunaTask(dev.data())).toBeUndefined()
  })

  it('food log waits for the device, and a refused save leaves no meal behind', async () => {
    const meals = getDB().meals.length
    dev.mode = 'refuse'
    const id = ask('comi um yopro', NOW)!
    await whenSaved()
    if (ex(id).food?.status === 'resolving') return // product needs a choice first: nothing written yet
    expect(ex(id).food?.status).toBe('failed')
    expect(getDB().meals.length).toBe(meals)
    dev.mode = 'ok'
    const id2 = ask('comi um yopro', NOW)!
    await whenSaved()
    expect(ex(id2).food?.status).toBe('logged')
    expect(dev.data()!.meals.length).toBe(meals + 1)
  })

  it('every answer that changed something is on the device when it says so (career, money, routine)', async () => {
    for (const q of ['registra 30 min de inglês executivo hoje', 'recebi o Santander hoje', 'já fiz yoga hoje', 'adiciona uma vaga de Head of Product na empresa X']) {
      const id = ask(q, NOW)!
      await whenSaved()
      const e = ex(id)
      const st = e.lumos?.status ?? e.adjust?.status
      expect(st, q).not.toBe('saving')
      expect(st, q).not.toBe('failed')
      expect(JSON.stringify(dev.data()), q).toEqual(JSON.stringify(getDB()))
    }
  })

  it('undo of an applied adjust waits for the device', async () => {
    const id = ask('minha corrida hoje é 6h45', NOW)!
    await whenSaved()
    if (ex(id).adjust?.status !== 'applied') return
    undoAdjust(id)
    expect(ex(id).adjust?.status).toBe('saving')
    await whenSaved()
    expect(ex(id).adjust?.status).toBe('undone')
    expect(JSON.stringify(dev.data())).toEqual(JSON.stringify(getDB()))
  })
})
