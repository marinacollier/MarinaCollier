import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { buildSeed } from '../seed'
import { changeFeed, markLumosSeen, sinceYesterday } from './changes'
import { planChange } from './graph'
import { logFood } from '../nutrition'
import type { Now } from './types'

const FRIDAY = '2026-10-02'
const now = (): Now => ({ date: FRIDAY, minutes: 12 * 60, iso: new Date(Date.now() + 60_000).toISOString() })
const before = () => new Date(Date.now() - 1000).toISOString()

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(FRIDAY))
})

describe('ChangeFeed', () => {
  it('no baseline yet → honest line; untouched seed is never a "change"', () => {
    expect(changeFeed(getDB(), now()).items).toEqual([])
    // Seed records were created "now" too, but they are not deltas.
    const r = changeFeed(getDB(), now(), new Date(Date.now() - 86_400_000).toISOString())
    expect(r.items).toEqual([])
    expect(r.summary).toBe('Nada mudou desde a última vez. Tudo como você deixou.')
  })

  it('real deltas since the last time, Lumos changes by name + her edits counted, in one line', () => {
    actions.setProfile({ lumosLastSeenAt: before() })
    const ride = getDB().workouts.find((w) => w.date === '2026-10-04')!
    planChange(getDB(), { kind: 'setDuration', date: '2026-10-04', ref: { type: 'workout', id: ride.id }, durationMin: 240 }, now()).apply()
    planChange(getDB(), { kind: 'workMode', date: '2026-10-05', mode: 'presencial' }, now()).apply()
    actions.create('tasks', { title: 'Mandar o deck pro board', status: 'todo', order: 0 })
    const feed = changeFeed(getDB(), now())
    // Dependency events (causedBy) don't repeat in the feed.
    expect(feed.items.map((i) => i.title)).toEqual(expect.arrayContaining(['Pedal longo de domingo passou pra 4h', 'Segunda ficou presencial', 'Nova tarefa: Mandar o deck pro board']))
    expect(feed.items).toHaveLength(3)
    expect(feed.summary).toBe('Pedal longo de domingo passou pra 4h, segunda ficou presencial e 1 tarefa nova.')
    expect(feed.items.find((i) => i.title.startsWith('Pedal'))).toMatchObject({ by: 'lumos', provenance: 'user' })
  })

  it('"desde ontem" baseline and markLumosSeen', () => {
    expect(sinceYesterday({ date: FRIDAY, minutes: 0 })).toBe('2026-10-01T03:00:00.000Z')
    logFood({ foods: [{ name: 'brownie', qty: 1, confidence: 'unknown' }], description: 'brownie', via: 'lumos', noAdapt: true })
    expect(changeFeed(getDB(), now(), before()).items[0].title).toMatch(/^Comeu brownie/)
    markLumosSeen(now())
    expect(changeFeed(getDB(), now()).items).toEqual([])
  })
})
