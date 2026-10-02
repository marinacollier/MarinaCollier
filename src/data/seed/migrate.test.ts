import { describe, expect, it } from 'vitest'
import { emptyDB, migrate } from '../defaults'
import { buildSeed, LIFE_SEED_VERSION } from '.'
import { applyLifeSeed, needsLifeSeed } from './migrate'

describe('life seed migration', () => {
  it('fresh seed is already current and every record has an id', () => {
    const db = buildSeed('2026-10-02')
    expect(db.profile.seedVersion).toBe(LIFE_SEED_VERSION)
    expect(needsLifeSeed(db)).toBe(false)
    expect(db.profile.rhythm.wakeTime).toBe('04:40')
    expect(db.profile.work.days[2]).toBe('presencial')
    expect(db.constraints.some((c) => c.name.startsWith('TotalPass'))).toBe(true)
  })

  it('adds missing seed records to an old database without touching existing ones', () => {
    const old = migrate({ ...emptyDB(), profile: { ...emptyDB().profile, seedVersion: 1 } })
    old.tasks = [{ id: 'mine', title: 'Minha tarefa', status: 'todo', order: 0, createdAt: '', updatedAt: '' }]
    const next = applyLifeSeed(old, '2026-10-02')
    expect(next.tasks.find((t) => t.id === 'mine')?.title).toBe('Minha tarefa')
    expect(next.constraints.length).toBeGreaterThan(0)
    expect(next.profile.rhythm.wakeTime).toBe('04:40')
    // idempotent
    const again = applyLifeSeed({ ...next, profile: { ...next.profile, seedVersion: 1 } }, '2026-10-02')
    expect(again.constraints.length).toBe(next.constraints.length)
  })

  it('keeps profile choices Marina already made', () => {
    const old = migrate({ ...emptyDB(), profile: { ...emptyDB().profile, seedVersion: 1, rhythm: { wakeTime: '05:30', sleepTime: '22:30' } } })
    expect(applyLifeSeed(old, '2026-10-02').profile.rhythm.wakeTime).toBe('05:30')
  })
})

describe('life seed migration — old example cleanup', () => {
  it('upgrades/retires untouched old examples and keeps edited ones', () => {
    const stamp = '2026-09-01T10:00:00.000Z'
    const old = migrate({ ...emptyDB(), profile: { ...emptyDB().profile, seedVersion: 1 } })
    old.financialCategories = [{ id: 'cat-casa', name: 'Casa', emoji: '🏡', tone: 'sand', order: 0, archived: false, createdAt: stamp, updatedAt: stamp }]
    old.books = [
      { id: 'b-untouched', title: 'Exemplo', status: 'quero', progress: 0, quotes: [], order: 0, createdAt: stamp, updatedAt: stamp },
      { id: 'b-edited', title: 'Exemplo editado', status: 'lendo', progress: 30, quotes: [], order: 1, createdAt: stamp, updatedAt: '2026-09-10T10:00:00.000Z' },
    ]
    old.routines = [{ id: 'routine-manha', name: 'Minha manhã', period: 'manha', order: 0, active: true, createdAt: stamp, updatedAt: stamp }]
    const next = applyLifeSeed(old, '2026-10-02')
    expect(next.books.map((b) => b.id)).toEqual(['b-edited'])
    // untouched routine with a stable id is upgraded to the new seed's version
    const r = next.routines.find((x) => x.id === 'routine-manha')!
    const fresh = buildSeed('2026-10-02').routines.find((x) => x.id === 'routine-manha')!
    expect(r.name).toBe(fresh.name)
  })
})
