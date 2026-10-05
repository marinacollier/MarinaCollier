import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { buildSeed } from '../seed'
import { ackAttention, needsAttention } from './attention'
import type { Now } from './types'

const FRIDAY = '2026-10-02'
const now: Now = { date: FRIDAY, minutes: 10 * 60 }

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(FRIDAY))
})

describe('NeedsAttention', () => {
  it('is one short queue on the real seed (no flood of trip wishlist items)', () => {
    const items = needsAttention(getDB(), now)
    expect(items.length).toBeLessThanOrEqual(6)
    expect(items.filter((i) => i.ref?.type === 'trip')).toHaveLength(1)
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length)
  })

  it('a real conflict shows up; info-only things do not', () => {
    // Natação + yoga the same day compete for the single check-in.
    actions.create('workouts', { date: '2026-10-05', time: '06:00', modality: 'natacao', status: 'planejado', order: 0 })
    actions.create('workouts', { date: '2026-10-05', time: '19:00', modality: 'yoga', status: 'planejado', order: 1 })
    const conflict = needsAttention(getDB(), now).find((i) => i.kind === 'conflict')
    expect(conflict?.detail).toContain('check-in')
    expect(conflict?.options?.length).toBe(2)
  })

  it('waiting-for with a due follow-up becomes "waiting_reply"; resolving it removes it', () => {
    const t = actions.create('tasks', { title: 'Proposta do FashionFinder', status: 'waiting', waiting: { who: 'Fran', since: '2026-09-25', followUpOn: '2026-10-01' }, order: 0 })
    const item = needsAttention(getDB(), now).find((i) => i.kind === 'waiting_reply')!
    expect(item.title).toBe('Esperando Fran: Proposta do FashionFinder')
    expect(item.options?.[0].ask).toBe('Fran me respondeu')
    actions.update('tasks', t.id, { status: 'todo' })
    expect(needsAttention(getDB(), now).some((i) => i.kind === 'waiting_reply')).toBe(false)
  })

  it('a pattern with enough evidence (never asked) is a decision; asked ones are not', () => {
    const m = actions.create('memory', { kind: 'preference', area: 'esportes', text: 'Você costuma mover a yoga pra 20:30', status: 'observed', source: 'observed', evidence: 3 })
    expect(needsAttention(getDB(), now).some((i) => i.kind === 'confirm_pattern' && i.ref?.id === m.id)).toBe(true)
    actions.update('memory', m.id, { askedAt: '2026-10-02T10:00:00.000Z' })
    expect(needsAttention(getDB(), now).some((i) => i.kind === 'confirm_pattern')).toBe(false)
  })

  it('acks hide items (snooze only until its date); undo brings them back', () => {
    const first = needsAttention(getDB(), now).find((i) => i.key.startsWith('trip:'))!
    const undo = ackAttention(first.key, 'dismissed')
    expect(needsAttention(getDB(), now).some((i) => i.key === first.key)).toBe(false)
    undo()
    expect(needsAttention(getDB(), now).some((i) => i.key === first.key)).toBe(true)
    ackAttention(first.key, 'snoozed', '2026-10-04')
    expect(needsAttention(getDB(), now).some((i) => i.key === first.key)).toBe(false)
    expect(needsAttention(getDB(), { date: '2026-10-04', minutes: 600 }).some((i) => i.key === first.key)).toBe(true)
  })
})

describe('NeedsAttention · quiet Waiting For', () => {
  it('a Waiting For without follow-up date surfaces after a quiet week, not before', () => {
    const add = (since: string) =>
      actions.create('tasks', { title: 'Retorno sobre o roadmap', status: 'waiting', waiting: { who: 'Fran', since }, order: 99 })
    const fresh = add('2026-09-30')
    expect(needsAttention(getDB(), now).some((i) => i.ref?.id === fresh.id)).toBe(false)
    const quiet = add('2026-09-20')
    const item = needsAttention(getDB(), now).find((i) => i.ref?.id === quiet.id)!
    expect(item.options?.[0]).toEqual({ label: 'Fran respondeu', ask: 'Fran me respondeu' })
  })
})
