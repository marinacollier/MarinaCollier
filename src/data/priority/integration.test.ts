import { describe, expect, it } from 'vitest'
import { applyModuleSeeds } from '@/data/store'
import { buildSeed } from '@/data/seed'
import { planDay, rankCandidates } from './engine'

describe('Priority Engine + Learning Engine (integração)', () => {
  const db = applyModuleSeeds(buildSeed('2026-11-24'))
  const ctx = { date: '2026-11-24', freeMin: 120, energy: 3 as const, now: '18:00' }

  it('no máximo 2 estudos competem no plano e o resto da vida concorre normalmente', () => {
    const ranked = rankCandidates(db, ctx)
    const plan = planDay(db, ctx)
    const picked = [plan.primary, ...plan.secondary].filter(Boolean).map((p) => p!.c)
    const studyAreas = new Set(['idiomas', 'estudos', 'faculdade'])
    expect(picked.filter((c) => studyAreas.has(c.area)).length).toBeLessThanOrEqual(2)
    expect(ranked.length).toBeGreaterThan(0)
    expect(plan.freeSpaceMin).toBeGreaterThanOrEqual(Math.round(ctx.freeMin * 0.2) - 1)
  })

  it('"quero descansar" tira os estudos do plano', () => {
    const plan = planDay(db, { ...ctx, interest: 'quero descansar' })
    const picked = [plan.primary, ...plan.secondary].filter(Boolean).map((p) => p!.c)
    expect(picked.some((c) => ['idiomas', 'estudos'].includes(c.area))).toBe(false)
  })
})
