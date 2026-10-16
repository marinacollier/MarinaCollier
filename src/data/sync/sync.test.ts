import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDB } from '../defaults'
import type { DB, Task } from '../types'
import { createSyncEngine, type SyncMeta } from './engine'
import { createFakePostgrest } from './fake-postgrest'
import { canonical, hashData } from './hash'
import { createRecordsApi } from './postgrest'

let clock = Date.parse('2026-10-16T12:00:00Z')
const tick = (ms = 1000) => (clock += ms)
const iso = () => new Date(clock).toISOString()

function task(id: string, title: string, extra: Partial<Task> = {}): Task {
  const t = iso()
  return { id, title, status: 'todo', createdAt: t, updatedAt: t, ...extra } as Task
}

type Server = ReturnType<typeof createFakePostgrest>

function device(server: Server, user = 'u1', initial: DB = emptyDB()) {
  let db = structuredClone(initial)
  const store = { meta: null as SyncMeta | null }
  const make = () =>
    createSyncEngine({
      api: createRecordsApi({ baseUrl: 'https://ref.supabase.co', anonKey: 'anon', token: async () => server.tokenFor(user), fetchImpl: server.fetch, pageSize: 3, pushBatch: 4 }),
      meta: { load: async () => (store.meta ? structuredClone(store.meta) : null), save: async (m) => void (store.meta = structuredClone(m)) },
      getDB: () => db,
      commitDB: async (next) => void (db = next),
      now: () => clock,
    })
  const d = {
    engine: make(),
    store,
    get db() {
      return db
    },
    set(next: DB) {
      db = next
    },
    addTask(t: Task) {
      db = { ...db, tasks: [...db.tasks, t] }
    },
    editTask(id: string, patch: Partial<Task>) {
      tick()
      db = { ...db, tasks: db.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: iso() } : t)) }
    },
    removeTask(id: string) {
      db = { ...db, tasks: db.tasks.filter((t) => t.id !== id) }
    },
    /** Simulates closing and reopening the app (engine rebuilt from the persisted meta). */
    restart() {
      d.engine = make()
    },
    async join() {
      const r = await d.engine.uploadAll()
      expect(r.ok).toBe(true)
      await d.engine.sync()
      return r
    },
  }
  return d
}

const titles = (db: DB) => db.tasks.map((t) => t.title).sort()

afterEach(() => vi.restoreAllMocks())

describe('cloud sync — inert by default', () => {
  it('makes no request when the server is not configured, even with the profile flag on', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const { syncNow, cloudConfigured, cloudEnabled, initCloudSync, useCloudSync, migrateToCloud } = await import('./index')
    const { actions } = await import('../store')
    actions.setProfile({ cloudSync: true })
    expect(cloudConfigured()).toBe(false)
    expect(cloudEnabled()).toBe(false)
    initCloudSync()
    await syncNow()
    await expect(migrateToCloud()).rejects.toThrow()
    expect(useCloudSync.getState().status).toBe('local-only')
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses to sync before a verified first upload', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    a.addTask(task('t1', 'Nadar'))
    expect((await a.engine.sync()).status).toBe('not-migrated')
    expect(server.requests).toBe(0)
  })
})

describe('cloud sync — engine', () => {
  it('hash is stable across a jsonb-style key reorder', () => {
    expect(hashData({ a: 1, b: { c: [1, { d: 2, e: undefined }] } })).toBe(hashData({ b: { c: [1, { d: 2 }] }, a: 1 }))
    expect(canonical({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('push/pull roundtrip between two devices', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    for (let i = 0; i < 7; i++) a.addTask(task(`t${i}`, `Tarefa ${i}`))
    a.set({ ...a.db, profile: { ...a.db.profile, name: 'Marina' } })
    const report = await a.join()
    expect(report.matched).toBe(8)
    expect(report.collections.find((c) => c.collection === 'tasks')).toEqual({ collection: 'tasks', local: 7, cloud: 7 })

    const b = device(server)
    const rb = await b.join()
    expect(rb.onlyInCloud).toBe(7)
    expect(titles(b.db)).toEqual(titles(a.db))
    expect(b.db.profile.name).toBe('Marina')
  })

  it('two devices editing different records both keep both edits', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    a.addTask(task('t1', 'Um'))
    a.addTask(task('t2', 'Dois'))
    await a.join()
    const b = device(server)
    await b.join()

    a.editTask('t1', { title: 'Um (A)' })
    b.editTask('t2', { title: 'Dois (B)' })
    b.addTask(task('t3', 'Três (B)'))
    await a.engine.sync()
    await b.engine.sync()
    await a.engine.sync()
    expect(titles(a.db)).toEqual(['Dois (B)', 'Três (B)', 'Um (A)'])
    expect(titles(b.db)).toEqual(titles(a.db))
    expect(a.db.profile.syncConflicts ?? []).toHaveLength(0)
  })

  it('same record edited on both: newer wins, the other is kept as a conflict', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    a.addTask(task('t1', 'Original'))
    await a.join()
    const b = device(server)
    await b.join()

    a.editTask('t1', { title: 'Versão A' }) // older
    b.editTask('t1', { title: 'Versão B' }) // newer
    await a.engine.sync() // A pushes first
    await b.engine.sync() // B pulls A's older edit → keeps its own, records A's
    await a.engine.sync() // A pulls B's newer (its own edit was already superseded in the cloud)
    expect(a.db.tasks[0].title).toBe('Versão B')
    expect(b.db.tasks[0].title).toBe('Versão B')
    expect(b.db.profile.syncConflicts).toMatchObject([{ collection: 'tasks', recordId: 't1', kept: 'local', other: { title: 'Versão A' } }])

    // the other order: A edits later but syncs after B → A keeps its newer one, records B's
    b.editTask('t1', { title: 'B de novo' })
    a.editTask('t1', { title: 'A mais nova' })
    await b.engine.sync()
    await a.engine.sync()
    expect(a.db.tasks[0].title).toBe('A mais nova')
    expect(a.db.profile.syncConflicts).toMatchObject([{ recordId: 't1', kept: 'local', other: { title: 'B de novo' } }])
    await b.engine.sync()
    expect(b.db.tasks[0].title).toBe('A mais nova')
    // the cloud row has the winner, and conflicts never leave the device
    expect(server.userRows('u1').find((r) => r.id === 't1')?.data).toMatchObject({ title: 'A mais nova' })
    expect(JSON.stringify(server.userRows('u1').find((r) => r.collection === '_profile')?.data)).not.toContain('syncConflicts')
  })

  it('deletes propagate as tombstones', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    a.addTask(task('t1', 'Apagar'))
    a.addTask(task('t2', 'Fica'))
    await a.join()
    const b = device(server)
    await b.join()
    tick()
    a.removeTask('t1')
    await a.engine.sync()
    const row = server.userRows('u1').find((r) => r.id === 't1')!
    expect(row).toMatchObject({ deleted: true, data: null })
    await b.engine.sync()
    expect(titles(b.db)).toEqual(['Fica'])
    // a stale device never resurrects it
    await a.engine.sync()
    expect(titles(a.db)).toEqual(['Fica'])
  })

  it('offline changes stay queued (across a restart) and go out when back online', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    await a.join()
    a.addTask(task('t1', 'Offline'))
    expect(await a.engine.refreshOutbox()).toBe(1)
    server.offline = true
    await expect(a.engine.sync()).rejects.toThrow('Sem conexão')
    a.restart()
    expect(await a.engine.refreshOutbox()).toBe(1)
    server.offline = false
    const r = await a.engine.sync()
    expect(r.pushed).toBe(1)
    expect(a.engine.pending()).toBe(0)
    expect(server.userRows('u1').some((x) => x.id === 't1' && !x.deleted)).toBe(true)
  })

  it('repeated syncs create no duplicates and send nothing new', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    for (let i = 0; i < 5; i++) a.addTask(task(`t${i}`, `T${i}`))
    await a.join()
    const b = device(server)
    await b.join()
    const rowsBefore = server.rows.size
    for (let i = 0; i < 3; i++) {
      const ra = await a.engine.sync()
      const rb = await b.engine.sync()
      expect(ra.pushed + rb.pushed).toBe(0)
    }
    expect(server.rows.size).toBe(rowsBefore)
    expect(a.db.tasks).toHaveLength(5)
    expect(b.db.tasks).toHaveLength(5)
  })

  it('never uploads device-only profile fields (privacy lock hash)', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    a.set({ ...a.db, profile: { ...a.db.profile, privacyLock: { enabled: true, areas: [], pinHash: 'SECRET', pinSalt: 'SALT', relockMinutes: 5 } } })
    await a.join()
    expect(JSON.stringify([...server.rows.values()])).not.toContain('SECRET')
    expect(a.db.profile.privacyLock?.pinHash).toBe('SECRET')
  })

  it('a fresh device does not override edits with its untouched seed copy', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    a.addTask(task('seed:task:agua', 'Beber água'))
    await a.join()
    a.editTask('seed:task:agua', { title: 'Beber 2L de água' })
    await a.engine.sync()
    const b = device(server)
    b.addTask(task('seed:task:agua', 'Beber água')) // the seed on a new install
    const r = await b.join()
    expect(r.issues).toEqual([{ collection: 'tasks', id: 'seed:task:agua', kind: 'cloud-newer' }])
    expect(b.db.tasks[0].title).toBe('Beber 2L de água')
    expect(b.db.profile.syncConflicts ?? []).toHaveLength(0)
  })

  it('migration compare reports records that did not land as sent', async () => {
    const server = createFakePostgrest()
    const a = device(server)
    a.addTask(task('t1', 'Ok'))
    a.addTask(task('t2', 'Vai faltar'))
    a.addTask(task('t3', 'Vai mudar'))
    const realFetch = server.fetch
    server.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const rows = (JSON.parse(String(init.body)) as { id: string; data: { title?: string } }[])
          .filter((r) => r.id !== 't2')
          .map((r) => (r.id === 't3' ? { ...r, data: { ...r.data, title: 'corrompido' } } : r))
        return realFetch(input, { ...init, body: JSON.stringify(rows) })
      }
      return realFetch(input, init)
    }) as typeof fetch
    const b = device(server) // fresh engine bound to the patched fetch
    b.set(a.db)
    const r = await b.engine.uploadAll()
    expect(r.ok).toBe(false)
    expect(r.issues).toEqual(
      expect.arrayContaining([
        { collection: 'tasks', id: 't2', kind: 'missing' },
        { collection: 'tasks', id: 't3', kind: 'different' },
      ]),
    )
    expect(r.collections.find((c) => c.collection === 'tasks')).toEqual({ collection: 'tasks', local: 3, cloud: 2 })
    // not turned on, local data untouched
    expect((await b.engine.sync()).status).toBe('not-migrated')
    expect(b.db.tasks).toHaveLength(3)
  })

  it('accounts are isolated (RLS by token)', async () => {
    const server = createFakePostgrest()
    const a = device(server, 'u1')
    a.addTask(task('t1', 'Dela'))
    await a.join()
    const other = device(server, 'u2')
    const r = await other.join()
    expect(r.onlyInCloud).toBe(0)
    expect(other.db.tasks).toHaveLength(0)
  })
})
