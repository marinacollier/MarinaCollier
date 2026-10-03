import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { dayTimeline } from '@/data/timeline'
import type { DB } from '@/data/types'
import { SEED_IDS } from '@/data/seed/ids'
import { buildView, foldSummary, lateMorning, routineCardEntries } from './view'

const FRIDAY = '2026-10-02'
const db = buildSeed(FRIDAY)
const tl = dayTimeline(db, FRIDAY)

describe('Linha do dia — view rules', () => {
  it('early morning: nothing folded, "agora" before the first future item', () => {
    const v = buildView(tl, 4 * 60 + 30)
    expect(v.folded).toEqual([])
    expect(v.nowAt).toBe(0)
  })

  it('afternoon: the past folds into one calm line; current thing is highlighted', () => {
    const v = buildView(tl, 12 * 60 + 5)
    expect(v.folded.length).toBeGreaterThan(5)
    expect(foldSummary(v.folded)).toMatch(/^04:40–\d\d:\d\d · \d+ itens$/)
    expect(v.visible[v.nowAt! - 1].start! <= '12:05').toBe(true)
    expect(v.currentKey).toBeDefined()
    expect(buildView(tl, 12 * 60, true).folded).toEqual([])
  })

  it('not today → no marker, nothing folded', () => {
    const v = buildView(tl)
    expect(v.nowAt).toBeUndefined()
    expect(v.anytime.length).toBeGreaterThan(0)
  })

  it('offers "acordei agora" only when the morning clearly has not started', () => {
    expect(lateMorning(db, tl, 4 * 60 + 45)).toBeUndefined()
    expect(lateMorning(db, tl, 5 * 60 + 12)).toBe(SEED_IDS.routineMorning)
    const started: DB = {
      ...db,
      occurrences: [{ id: 'o', createdAt: 'x', updatedAt: 'x', parentType: 'routineItem', parentId: db.routineItems[0].id, date: FRIDAY, status: 'done' }],
    }
    expect(lateMorning(started, dayTimeline(started, FRIDAY), 5 * 60 + 12)).toBeUndefined()
  })
})

describe('routine card entries', () => {
  it('a training morning shows the training and its fuel inside the routine', () => {
    const rows = routineCardEntries(db, tl, SEED_IDS.routineMorning)
    expect(rows.some((e) => e.kind === 'workout' && e.start === '06:00')).toBe(true)
    expect(rows.some((e) => e.kind === 'meal' && e.phase === 'pre')).toBe(true)
    expect(rows.some((e) => e.kind === 'work')).toBe(false)
    expect(rows.filter((e) => e.kind === 'routineItem')).toHaveLength(11)
  })
})
