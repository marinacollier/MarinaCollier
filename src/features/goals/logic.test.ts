import { describe, expect, it } from 'vitest'
import { createSeedContext } from '@/data/seed/context'
import type { Goal } from '@/data/types'
import {
  bigRivals,
  canBeBig,
  defaultPeriod,
  doneCount,
  goalsIn,
  progressLabel,
  progressWords,
  showMondayNudge,
  splitBig,
  subGoals,
  weekLabel,
} from './logic'
import { GOAL_SEED_IDS, seedGoals } from './seed'

let n = 0
const g = (p: Partial<Goal>): Goal => ({
  id: p.id ?? `g${n++}`,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  level: 'semana',
  title: 'Meta',
  category: 'pessoal',
  big: false,
  status: 'ativa',
  order: n,
  ...p,
})

describe('goals logic', () => {
  it('default period per level', () => {
    expect(defaultPeriod('dia', '2026-10-02')).toBe('2026-10-02')
    expect(defaultPeriod('semana', '2026-10-02')).toBe('2026-09-28')
    expect(defaultPeriod('maior', '2026-10-02')).toBeUndefined()
  })

  it('filters by level/period and nests maior sub-goals', () => {
    const parent = g({ id: 'p', level: 'maior', big: true })
    const list = [
      parent,
      g({ level: 'maior', parentId: 'p' }),
      g({ level: 'maior', parentId: 'gone' }),
      g({ period: '2026-09-28' }),
      g({ period: '2026-10-05' }),
      g({ period: '2026-09-28', status: 'solta' }),
    ]
    expect(goalsIn(list, 'maior').length).toBe(2) // parent + orphan
    expect(goalsIn(list, 'semana', '2026-09-28').length).toBe(1)
    expect(subGoals(list, 'p').length).toBe(1)
  })

  it('caps big goals at 3 per period', () => {
    const list = [1, 2, 3].map(() => g({ big: true, period: '2026-09-28' }))
    expect(canBeBig(list, { level: 'semana', period: '2026-09-28' })).toBe(false)
    expect(canBeBig(list, { level: 'semana', period: '2026-10-05' })).toBe(true)
    // editing one of the three doesn't count itself
    expect(canBeBig(list, { id: list[0].id, level: 'semana', period: '2026-09-28' })).toBe(true)
    expect(bigRivals(list, { level: 'dia', period: '2026-09-28' })).toHaveLength(0)
    expect(splitBig([...list, g({})]).small).toHaveLength(1)
  })

  it('speaks in words, not percentages', () => {
    expect(progressWords(0, 0)).toBe('nenhuma ainda')
    expect(progressWords(1, 5)).toBe('1 de 5 feita')
    expect(progressWords(3, 5)).toBe('3 de 5 feitas')
    expect(progressWords(5, 5)).toContain('todas feitas')
    expect(progressLabel(0)).toBe('começando')
    expect(progressLabel(50)).toBe('no meio do caminho')
    expect(progressLabel(100)).toContain('chegou lá')
    expect(doneCount([g({ status: 'feita' }), g({})])).toEqual({ done: 1, total: 2 })
    for (const p of [0, 10, 40, 80, 100]) expect(progressLabel(p)).not.toMatch(/%/)
  })

  it('formats the week label like "28/9 – 4/10"', () => {
    expect(weekLabel('2026-09-28')).toBe('28/9 – 4/10')
    expect(weekLabel('2026-10-05')).toBe('5/10 – 11/10')
  })

  it('nudges only on Monday of the current week without big goals', () => {
    expect(showMondayNudge([], '2026-09-28', '2026-09-28')).toBe(true)
    expect(showMondayNudge([], '2026-09-29', '2026-09-28')).toBe(false)
    expect(showMondayNudge([], '2026-09-28', '2026-10-05')).toBe(false)
    expect(showMondayNudge([g({ big: true, period: '2026-09-28' })], '2026-09-28', '2026-09-28')).toBe(false)
  })
})

describe('goals seed', () => {
  it('only long-term goals grounded in the brief, stable ids, no weekly goals, no invented progress', () => {
    const goals = seedGoals(createSeedContext('2026-10-02')).goals!
    expect(goals.map((x) => [x.title, x.category, x.deadline])).toEqual([
      ['South Africa 2026 pronta pra embarcar', 'viagem', '2026-10-22'],
      ['FashionFinder — roadmap até 20/11', 'profissional', '2026-11-20'],
      ['Manter yoga na rotina', 'corpo', undefined],
    ])
    expect(goals.every((x) => x.level === 'maior' && x.status === 'ativa')).toBe(true)
    expect(goalsIn(goals, 'semana', '2026-09-28')).toHaveLength(0)
    expect(goals.map((x) => x.id)).toEqual([GOAL_SEED_IDS.africa, GOAL_SEED_IDS.fashionFinder, GOAL_SEED_IDS.yoga])
    expect(seedGoals(createSeedContext('2026-11-01')).goals!.map((x) => x.id)).toEqual(goals.map((x) => x.id))
    expect(goals.every((x) => x.progress === undefined)).toBe(true)
    expect(goals.map((x) => x.title).join(' ')).not.toMatch(/Treinar 4x|Avançar o FashionFinder|Inglês confortável/)
  })
})
