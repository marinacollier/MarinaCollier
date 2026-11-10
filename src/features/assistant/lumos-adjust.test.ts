import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actions, detachStorage, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { emptyDB } from '@/data/defaults'
import { checkinOf } from '@/features/today/home/day-checkin'
import { respond } from './act/respond'

vi.mock('@/features/learning/candidates', () => ({ studyCandidates: () => [] }))
const DATE = '2026-11-14'
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T13:00:00-03:00'))
  await hydrate(createMemoryAdapter())
  actions.replaceDB({ ...emptyDB(), tasks: [{ id: 'a', title: 'Enviar proposta', status: 'todo', order: 0, durationMin: 20, dueDate: DATE, createdAt: '', updatedAt: '' }] })
  actions.create('dayCheckins', { date: DATE, freeMin: 0, energy: 3, changes: [], blocks: [] })
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('Lumos · "tenho mais 30 minutos" muda o dia de verdade', () => {
  it('raises capacity, places a fitting block and says what changed (persisted in the day)', () => {
    const r = respond(getDB(), 'tenho mais 30 minutos', { date: DATE, minutes: 13 * 60, iso: new Date().toISOString() })!
    const c = checkinOf(getDB(), DATE)!
    expect(c.freeMin).toBe(30)
    expect(c.changes.at(-1)).toMatchObject({ action: 'mais_tempo' })
    expect(r.text).toMatch(/Reorganizei teu planejamento: \+30 min disponíveis e encaixei Enviar proposta às \d\d:\d\d|mais 30 min de capacidade/)
    expect(r.link?.label).toBe('Ver no Início')
  })
})
