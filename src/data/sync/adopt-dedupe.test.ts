/**
 * Regression (07/11/2026 05:48): a device opened the app with an old copy of its storage (seeded 03/10,
 * Daily Briefing 12/10 applied there, never synced with the Claude store). Adopting the cloud pushed its
 * local-only copies as NEW records: the 12/10 briefing tasks again as "todo" (done in the cloud), its
 * backlog items, a second "Breevo" brand + opportunity and week-template workouts of past October days.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootWithBriefings } from '../briefing/bundled'
import { createMemoryAdapter } from '../storage'
import { detachStorage, getDB } from '../store'
import type { DB, SyncConflict } from '../types'
import { claudeFirstRun, createArtifactTransport } from './artifact-db'
import { createSyncEngine, type SyncMeta } from './engine'
import { createFakeArtifactDb } from './fake-artifact-db'

type Fake = ReturnType<typeof createFakeArtifactDb>
type Rec = Record<string, unknown> & { id: string }

const setNow = (iso: string) => vi.setSystemTime(new Date(iso))

function device(fake: Fake, name: string, initial: DB) {
  let db = structuredClone(initial)
  let meta: SyncMeta | null = null
  const transport = createArtifactTransport({ db: fake.db, deviceId: name, sleep: async () => {} })
  const engine = createSyncEngine({
    api: transport,
    meta: { load: async () => (meta ? structuredClone(meta) : null), save: async (m) => void (meta = structuredClone(m)) },
    getDB: () => db,
    commitDB: async (next) => void (db = next),
  })
  return {
    get db() {
      return db
    },
    set db(next: DB) {
      db = next
    },
    async run(freshSeedAt: string | null = null) {
      if (!(await engine.meta()).migratedAt) await claudeFirstRun(engine, transport, async () => {}, freshSeedAt)
      return engine.sync()
    },
  }
}

/** A device's DB right after a fresh boot on that day (seed + module seeds + bundled briefings). */
async function bootFresh(dayIso: string, day: string): Promise<DB> {
  setNow(dayIso)
  await bootWithBriefings(createMemoryAdapter(), day)
  return structuredClone(getDB())
}

const cloudRecs = (fake: Fake, c: string): Rec[] =>
  [...fake.state.docs.values()].filter((b) => (b as { c?: string }).c === c && !(b as { del?: boolean }).del).map((b) => (b as { d: Rec }).d)
const sourceKey = (r: Rec) => (r.source as { sourceKey?: string } | undefined)?.sourceKey
const dupes = (keys: (string | undefined)[]) => keys.filter((k, i) => k && keys.indexOf(k) !== i)
const briefingTasks = (db: DB) => db.tasks.filter((t) => (t.source as { briefingDate?: string } | undefined)?.briefingDate === '2026-10-12')

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('adopting the cloud never uploads copies of what it already has', () => {
  async function cloudWithHerOctober(fake: Fake) {
    // Her real device: booted 12/10 (briefing applied), later checked the briefing tasks, synced.
    const her = await bootFresh('2026-10-12T21:00:00Z', '2026-10-12')
    setNow('2026-10-17T13:00:00Z')
    const done = { status: 'done', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    her.tasks = her.tasks.map((t) => (briefingTasks(her).includes(t) ? { ...t, ...done } : t)) as DB['tasks']
    const a = device(fake, 'her-phone', her)
    expect((await a.run()).status).toBe('ok')
    expect(briefingTasks(a.db).length).toBeGreaterThan(0)
    return a
  }

  it('an old, never-synced copy of the device storage (no fresh mark) adds no duplicates', async () => {
    const fake = createFakeArtifactDb()
    const her = await cloudWithHerOctober(fake)
    const before = new Map([...fake.state.docs.entries()].map(([k, v]) => [k, JSON.stringify(v)]))

    // The stale device: its own boot of 12/10 (other random ids), plus what the old UGC migration did there.
    const stale = await bootFresh('2026-10-12T21:48:00Z', '2026-10-12')
    const brandId = '8afc3bf8-c935-45d0-ad95-05182583e13d'
    const t0 = '2026-10-11T18:07:56.818Z'
    stale.brands = [...stale.brands, { id: brandId, name: 'Breevo', createdAt: t0, updatedAt: '2026-10-12T18:48:55.911Z' } as DB['brands'][number]]
    const herOpp = her.db.ugcOpportunities.find((o) => o.title === 'Breevo · parceria')
    if (herOpp) stale.ugcOpportunities = [...stale.ugcOpportunities, { ...herOpp, id: 'c3202dd5-6451-4ac9-a9eb-16501e178f31', brandId, createdAt: t0, updatedAt: t0 }]
    // Something she really wrote on that device back then and never synced: still hers, still sent.
    stale.tasks = [...stale.tasks, { id: 'aaaaaaaa-1111-4111-8111-111111111111', title: 'Ligar para a Duda', status: 'todo', createdAt: '2026-10-12T22:00:00.000Z', updatedAt: '2026-10-12T22:00:00.000Z' } as DB['tasks'][number]]
    expect(stale.workouts.some((w) => w.id.startsWith('seed:body:w-2026-10-1'))).toBe(true)
    expect(stale.profile.briefingsApplied).toContain('2026-10-12')

    setNow('2026-11-07T08:48:00Z')
    const dev = device(fake, 'dozn9ajcg', stale)
    expect((await dev.run()).status).toBe('ok')

    // Nothing the cloud had was changed by this device…
    for (const [k, v] of before) if (k.includes('tasks+') || k.includes('backlogItems+') || k.includes('brands+')) expect(JSON.stringify(fake.state.docs.get(k))).toBe(v)
    // …no identity twice in the cloud…
    expect(dupes(cloudRecs(fake, 'tasks').map(sourceKey))).toEqual([])
    expect(dupes(cloudRecs(fake, 'backlogItems').map(sourceKey))).toEqual([])
    expect(cloudRecs(fake, 'brands').filter((b) => b.name === 'Breevo')).toHaveLength(1)
    expect(cloudRecs(fake, 'ugcOpportunities').filter((o) => o.title === 'Breevo · parceria').length).toBeLessThanOrEqual(1)
    expect(cloudRecs(fake, 'importBatches').filter((b) => b.briefingDate === '2026-10-12')).toHaveLength(1)
    // …no week-template workouts of past days the cloud never had…
    const herWorkouts = new Set(her.db.workouts.map((w) => w.id))
    expect(cloudRecs(fake, 'workouts').filter((w) => !herWorkouts.has(w.id) && String(w.date) < '2026-11-07')).toEqual([])
    // …the briefing tasks stay done, once, on this device too; and what she wrote there is kept and sent.
    expect(briefingTasks(dev.db).every((t) => t.status === 'done')).toBe(true)
    expect(dupes(dev.db.tasks.map((t) => sourceKey(t as unknown as Rec)))).toEqual([])
    expect(cloudRecs(fake, 'tasks').some((t) => t.title === 'Ligar para a Duda')).toBe(true)
    expect(dev.db.tasks.some((t) => t.title === 'Ligar para a Duda')).toBe(true)
    // The copies are dropped silently (untouched since created there); shared ids merge as before.
    const inCloud = new Set([...fake.state.docs.values()].map((b) => (b as { id: string }).id))
    expect((dev.db.profile.syncConflicts ?? []).filter((c) => !inCloud.has(c.recordId))).toEqual([])

    // A second round sends nothing more.
    const writes = fake.state.writes
    await dev.run()
    expect(fake.state.writes).toBe(writes)
  })

  it('a wiped device booting inside the briefing week re-imports nothing the cloud profile lists as applied', async () => {
    const fake = createFakeArtifactDb()
    await cloudWithHerOctober(fake)
    const count = fake.state.docs.size
    // The Claude app wiped the device: a fresh boot on 15/10 applies the bundled 12/10 briefing again locally.
    const fresh = await bootFresh('2026-10-17T14:00:00Z', '2026-10-15')
    expect(fresh.profile.briefingsApplied).toContain('2026-10-12')
    const dev = device(fake, 'wiped', fresh)
    expect((await dev.run(new Date().toISOString())).status).toBe('ok')
    expect(dupes(cloudRecs(fake, 'tasks').map(sourceKey))).toEqual([])
    expect(dupes(cloudRecs(fake, 'backlogItems').map(sourceKey))).toEqual([])
    expect(cloudRecs(fake, 'importBatches').filter((b) => b.briefingDate === '2026-10-12')).toHaveLength(1)
    expect(briefingTasks(dev.db).every((t) => t.status === 'done')).toBe(true)
    expect(fake.state.docs.size).toBe(count)
  })

  it('a local copy she edited after the cloud version is not uploaded but kept as a conflict', async () => {
    const fake = createFakeArtifactDb()
    await cloudWithHerOctober(fake)
    const stale = await bootFresh('2026-10-12T21:48:00Z', '2026-10-12')
    const t = briefingTasks(stale)[0]
    setNow('2026-11-07T08:48:00Z')
    stale.tasks = stale.tasks.map((x) => (x.id === t.id ? { ...x, notes: 'minha nota', updatedAt: new Date().toISOString() } : x))
    const dev = device(fake, 'old', stale)
    await dev.run()
    expect(cloudRecs(fake, 'tasks').some((x) => x.id === t.id)).toBe(false)
    const kept = (dev.db.profile.syncConflicts as SyncConflict[]).filter((c) => c.recordId === t.id)
    expect(kept).toHaveLength(1)
    expect(kept[0].other?.notes).toBe('minha nota')
  })
})
