import { beforeEach, describe, expect, it } from 'vitest'
import { actions, flushNow, getDB, hydrate } from './store'
import { createMemoryAdapter } from './storage'
import { routineItemsFor, routineProgress } from './selectors'

describe('store + persistence', () => {
  let storage: ReturnType<typeof createMemoryAdapter>
  beforeEach(async () => {
    storage = createMemoryAdapter()
    await hydrate(storage)
  })

  it('seeds on first run and persists', async () => {
    expect(getDB().financialCategories.length).toBeGreaterThan(10)
    expect(storage.data).not.toBeNull()
  })

  it('CRUD round-trips through storage (reload)', async () => {
    const t = actions.create('tasks', { title: 'Teste', status: 'todo', order: 0 })
    actions.update('tasks', t.id, { status: 'done' })
    await flushNow()
    await hydrate(storage) // simulate reload
    expect(getDB().tasks.find((x) => x.id === t.id)?.status).toBe('done')
  })

  it('remove + restore (undo)', () => {
    const t = actions.create('tasks', { title: 'Apagar', status: 'todo', order: 0 })
    const removed = actions.remove('tasks', t.id)!
    expect(getDB().tasks.some((x) => x.id === t.id)).toBe(false)
    actions.restore('tasks', removed)
    expect(getDB().tasks.some((x) => x.id === t.id)).toBe(true)
  })

  it('checking a routine item today does not affect tomorrow', () => {
    const r = actions.create('routines', { name: 'Teste', period: 'manha', order: 99, active: true })
    const item = actions.create('routineItems', {
      routineId: r.id,
      title: 'Água',
      recurrence: { kind: 'daily' },
      order: 0,
      active: true,
    })
    actions.toggleOccurrence('routineItem', item.id, '2026-10-02')
    expect(routineProgress(getDB(), r.id, '2026-10-02')).toEqual({ done: 1, total: 1 })
    expect(routineProgress(getDB(), r.id, '2026-10-03')).toEqual({ done: 0, total: 1 })
    expect(routineItemsFor(getDB(), r.id, '2026-10-03')).toHaveLength(1)
    actions.toggleOccurrence('routineItem', item.id, '2026-10-02')
    expect(routineProgress(getDB(), r.id, '2026-10-02')).toEqual({ done: 0, total: 1 })
  })

  it('migrates partial/old data without losing it', () => {
    actions.replaceDB({ tasks: [{ id: 'x', title: 'Old', status: 'todo', order: 0, createdAt: '', updatedAt: '' }], profile: { name: 'Marina' } })
    const db = getDB()
    expect(db.tasks).toHaveLength(1)
    expect(Array.isArray(db.trips)).toBe(true)
    expect(db.profile.featureFlags.icsEnabled).toBe(true)
    expect(db.profile.homeWidgets.length).toBeGreaterThan(5)
  })
})

describe('selectors timezone', () => {
  it('counts a task finished at 22h in São Paulo on that São Paulo day (not the UTC next day)', async () => {
    const { tasksForDay } = await import('./selectors')
    const t = actions.create('tasks', { title: 'Noite', status: 'done', order: 0, completedAt: '2026-10-03T01:30:00.000Z' })
    expect(tasksForDay(getDB(), '2026-10-02').some((x) => x.id === t.id)).toBe(true)
    expect(tasksForDay(getDB(), '2026-10-03').some((x) => x.id === t.id)).toBe(false)
  })
})

describe('migrate · Linha do dia', () => {
  it('slots linha_do_dia right after agora on existing profiles and hides the separate morning card', async () => {
    const { migrate, emptyDB } = await import('./defaults')
    const old = emptyDB()
    old.profile.homeWidgets = [
      { id: 'agora', visible: true },
      { id: 'top3', visible: true },
      { id: 'manha', visible: true },
    ]
    const ids = migrate(old).profile.homeWidgets
    expect(ids.slice(0, 3).map((w) => w.id)).toEqual(['agora', 'linha_do_dia', 'top3'])
    expect(ids.find((w) => w.id === 'manha')?.visible).toBe(false)
    // Already migrated profiles keep their own choices.
    const again = migrate({ ...old, profile: { ...old.profile, homeWidgets: [...ids.map((w) => (w.id === 'manha' ? { ...w, visible: true } : w))] } })
    expect(again.profile.homeWidgets.find((w) => w.id === 'manha')?.visible).toBe(true)
  })
})
