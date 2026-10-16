import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDB } from '../defaults'
import type { DB, Task } from '../types'
import { claudeFirstRun, createArtifactTransport, docIdFor, MAX_DOC_BYTES, REC_COLLECTION } from './artifact-db'
import { createSyncEngine, type SyncMeta } from './engine'
import { createFakeArtifactDb } from './fake-artifact-db'
import { SyncError } from './postgrest'

let clock = Date.parse('2026-10-16T12:00:00Z')
const tick = (ms = 1000) => (clock += ms)
const iso = () => new Date(clock).toISOString()

function task(id: string, title: string, extra: Partial<Task> = {}): Task {
  const t = iso()
  return {
    id,
    title,
    status: 'todo',
    createdAt: t,
    updatedAt: t,
    ...extra,
  } as Task
}

type Fake = ReturnType<typeof createFakeArtifactDb>

function device(fake: Fake, name: string, initial: DB = emptyDB(), skewMs = 0) {
  let db = structuredClone(initial)
  const store = { meta: null as SyncMeta | null }
  const sleeps: number[] = []
  let snapshots = 0
  const now = () => clock + skewMs
  const transport = createArtifactTransport({
    db: fake.db,
    deviceId: name,
    now,
    sleep: async (ms) => void sleeps.push(ms),
    pageSize: 3,
  })
  const engine = createSyncEngine({
    api: transport,
    meta: {
      load: async () => (store.meta ? structuredClone(store.meta) : null),
      save: async (m) => void (store.meta = structuredClone(m)),
    },
    getDB: () => db,
    commitDB: async (next) => void (db = next),
    now,
  })
  const d = {
    engine,
    transport,
    sleeps,
    get snapshots() {
      return snapshots
    },
    get db() {
      return db
    },
    addTask(t: Task) {
      db = { ...db, tasks: [...db.tasks, t] }
    },
    editTask(id: string, patch: Partial<Task>) {
      tick()
      db = {
        ...db,
        tasks: db.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date(now()).toISOString() } : t)),
      }
    },
    removeTask(id: string) {
      db = { ...db, tasks: db.tasks.filter((t) => t.id !== id) }
    },
    /** What the app does on each round: first run when needed, then a sync. */
    async run() {
      let tooBig = 0
      if (!(await engine.meta()).migratedAt) tooBig = await claudeFirstRun(engine, transport, async () => void snapshots++)
      const r = await engine.sync()
      return { ...r, tooBig }
    },
  }
  return d
}

const titles = (db: DB) => db.tasks.map((t) => t.title).sort()
const cloudDoc = (fake: Fake, c: string, id: string) => fake.state.docs.get(`${REC_COLLECTION}/${docIdFor(c, id)}`)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Claude db sync — inert without the platform', () => {
  it('does nothing when claude.use("db") resolves null', async () => {
    const use = vi.fn(async () => null)
    vi.stubGlobal('claude', { use })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    vi.resetModules()
    const { initCloudSync, artifactActive, cloudEnabled, useCloudSync, syncNow } = await import('./index')
    const { getArtifactDb } = await import('@/integrations/artifact-db')
    initCloudSync()
    expect(await getArtifactDb()).toBeNull()
    expect(use).toHaveBeenCalledWith('db')
    await syncNow()
    expect(artifactActive()).toBe(false)
    expect(cloudEnabled()).toBe(false)
    expect(useCloudSync.getState()).toMatchObject({ status: 'local-only' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resolves null outside an Artifact (no window.claude)', async () => {
    vi.resetModules()
    const { getArtifactDb } = await import('@/integrations/artifact-db')
    expect(await getArtifactDb()).toBeNull()
  })
})

describe('Claude db sync — documents', () => {
  it('doc ids are valid path segments, injective, and bounded', () => {
    const ids = [docIdFor('tasks', 'a/b c'), docIdFor('tasks', 'a~2fb c'), docIdFor('tasks+x', 'y'), docIdFor('tasks', 'x+y'), docIdFor('_profile', 'me'), docIdFor('notes', 'ção')]
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_\-.~:@+]+$/)
    expect(new Set(ids).size).toBe(ids.length)
    const long = docIdFor('tasks', 'x'.repeat(500))
    expect(long.length).toBeLessThanOrEqual(200)
    expect(long).not.toBe(docIdFor('tasks', `${'x'.repeat(499)}y`))
  })
})

describe('Claude db sync — engine over the Artifact store', () => {
  it('first run on an empty store uploads everything and verifies it', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    for (let i = 0; i < 7; i++) a.addTask(task(`t${i}`, `Tarefa ${i}`))
    const r = await a.run()
    expect(r.status).toBe('ok')
    expect(a.snapshots).toBe(1)
    expect(fake.state.docs.size).toBe(8) // 7 tasks + profile
    expect(cloudDoc(fake, 'tasks', 't3')).toMatchObject({
      c: 'tasks',
      id: 't3',
      del: false,
      dev: 'A',
      d: { title: 'Tarefa 3' },
    })
    expect(typeof cloudDoc(fake, '_profile', 'me')?.at).toBe('string')
  })

  it('a second device on a fresh install pulls her data and never overwrites it with its seed', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    a.addTask(task('seed:task:agua', 'Beber água'))
    a.addTask(task('t1', 'Dela'))
    await a.run()
    a.editTask('seed:task:agua', { title: 'Beber 2L de água' })
    await a.run()

    tick()
    const b = device(fake, 'B')
    b.addTask(task('seed:task:agua', 'Beber água')) // the untouched seed of a new install
    b.addTask(task('b1', 'Só no B'))
    const writesBefore = fake.state.writes
    await b.run()
    expect(b.snapshots).toBe(1)
    expect(titles(b.db)).toEqual(['Beber 2L de água', 'Dela', 'Só no B'])
    expect(cloudDoc(fake, 'tasks', 'seed:task:agua')?.d).toMatchObject({
      title: 'Beber 2L de água',
    })
    expect(b.db.profile.syncConflicts ?? []).toHaveLength(0)
    expect(fake.state.writes - writesBefore).toBe(1) // only b1
    await a.run()
    expect(titles(a.db)).toEqual(titles(b.db))
  })

  it('edits on two devices merge; deletes propagate; a stale device never resurrects', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    a.addTask(task('t1', 'Um'))
    a.addTask(task('t2', 'Dois'))
    a.addTask(task('t3', 'Apagar'))
    await a.run()
    const b = device(fake, 'B')
    await b.run()

    a.editTask('t1', { title: 'Um (A)' })
    b.editTask('t2', { title: 'Dois (B)' })
    b.addTask(task('t4', 'Quatro (B)'))
    tick()
    a.removeTask('t3')
    await a.run()
    await b.run()
    await a.run()
    expect(titles(a.db)).toEqual(['Dois (B)', 'Quatro (B)', 'Um (A)'])
    expect(titles(b.db)).toEqual(titles(a.db))
    expect(cloudDoc(fake, 'tasks', 't3')).toMatchObject({ del: true, d: null })
    await b.run()
    expect(titles(b.db)).toEqual(titles(a.db))
  })

  it('same record edited on both: newer wins, the other is kept as a conflict', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    a.addTask(task('t1', 'Original'))
    await a.run()
    const b = device(fake, 'B')
    await b.run()
    a.editTask('t1', { title: 'Versão A' })
    b.editTask('t1', { title: 'Versão B' })
    await a.run()
    await b.run()
    await a.run()
    expect(a.db.tasks[0].title).toBe('Versão B')
    expect(b.db.tasks[0].title).toBe('Versão B')
    expect(b.db.profile.syncConflicts).toMatchObject([
      {
        collection: 'tasks',
        recordId: 't1',
        kept: 'local',
        other: { title: 'Versão A' },
      },
    ])
    expect(JSON.stringify(cloudDoc(fake, '_profile', 'me'))).not.toContain('syncConflicts')
  })

  it('a device whose clock runs behind is still picked up (overlap window)', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    a.addTask(task('t1', 'Um'))
    await a.run()
    const late = device(fake, 'L', emptyDB(), -3 * 60_000)
    await late.run()
    tick(5000)
    await a.run() // A's cursor moves past "now"
    late.addTask(task('t2', 'Do relógio atrasado'))
    await late.run()
    await a.run()
    expect(titles(a.db)).toEqual(['Do relógio atrasado', 'Um'])
  })

  it('a record over the size limit is skipped with a warning; the rest syncs', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    a.addTask(
      task('big', 'Enorme', {
        notes: 'x'.repeat(MAX_DOC_BYTES + 10),
      } as Partial<Task>),
    )
    a.addTask(task('ok', 'Normal'))
    const r = await a.run()
    expect(r.tooBig).toBe(1)
    expect(r.skipped).toEqual(['tasks/big'])
    expect(cloudDoc(fake, 'tasks', 'big')).toBeUndefined()
    expect(cloudDoc(fake, 'tasks', 'ok')).toBeDefined()
    const writes = fake.state.writes
    const again = await a.run()
    expect(again.skipped).toEqual(['tasks/big'])
    expect(fake.state.writes).toBe(writes)
    expect(a.db.tasks).toHaveLength(2) // still here, on this device
  })

  it('backs off on resource_exhausted and then succeeds; gives up after the budget', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    a.addTask(task('t1', 'Um'))
    await a.run()
    a.editTask('t1', { title: 'Um editado' })
    fake.state.failNext = { code: 'resource_exhausted', times: 3 }
    const r = await a.run()
    expect(r.pushed).toBe(1)
    expect(a.sleeps.length).toBe(3)
    expect(a.sleeps[2]).toBeGreaterThan(a.sleeps[0])
    expect(cloudDoc(fake, 'tasks', 't1')?.d).toMatchObject({
      title: 'Um editado',
    })

    a.editTask('t1', { title: 'De novo' })
    fake.state.failNext = { code: 'resource_exhausted', times: 100 }
    await expect(a.run()).rejects.toBeInstanceOf(SyncError)
    fake.state.failNext = { code: '', times: 0 }
    expect(await a.engine.refreshOutbox()).toBe(1) // kept for the retry
    expect((await a.run()).pushed).toBe(1)
  })

  it('repeated syncs are idempotent (no writes when nothing changed)', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    for (let i = 0; i < 5; i++) a.addTask(task(`t${i}`, `T${i}`))
    await a.run()
    const b = device(fake, 'B')
    await b.run()
    const writes = fake.state.writes
    for (let i = 0; i < 3; i++) {
      tick()
      const ra = await a.run()
      const rb = await b.run()
      expect(ra.pushed + rb.pushed).toBe(0)
    }
    expect(fake.state.writes).toBe(writes)
    expect(fake.state.docs.size).toBe(6)
    expect(b.db.tasks).toHaveLength(5)
  })

  it('a fresh install with a differing non-seed record lets the cloud win and keeps its copy as a conflict', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    a.addTask(task('brief-1', 'Da nuvem (editado)'))
    await a.run()
    tick()
    const b = device(fake, 'B')
    b.addTask(task('brief-1', 'Importado de novo')) // newer timestamp, but this device never synced
    await b.run()
    expect(b.db.tasks[0].title).toBe('Da nuvem (editado)')
    expect(cloudDoc(fake, 'tasks', 'brief-1')?.d).toMatchObject({
      title: 'Da nuvem (editado)',
    })
    expect(b.db.profile.syncConflicts).toMatchObject([
      {
        recordId: 'brief-1',
        kept: 'remote',
        other: { title: 'Importado de novo' },
      },
    ])
  })

  it('live: the subscription fires for another device’s write, not for its own', async () => {
    const fake = createFakeArtifactDb()
    const a = device(fake, 'A')
    const b = device(fake, 'B')
    a.addTask(task('t1', 'Um'))
    await a.run()
    await b.run()
    const onRemote = vi.fn()
    const stop = a.transport.watch(onRemote, () => undefined)
    await Promise.resolve()
    a.editTask('t1', { title: 'meu' })
    await a.run()
    await new Promise((r) => setTimeout(r, 0))
    expect(onRemote).not.toHaveBeenCalled()
    b.addTask(task('t2', 'Dois'))
    await b.run()
    await new Promise((r) => setTimeout(r, 0))
    expect(onRemote).toHaveBeenCalled()
    stop()
  })
})
