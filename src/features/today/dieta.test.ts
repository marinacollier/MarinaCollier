import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { dayPlanFor } from '@/data/fuel'
import { currentPlannedMeal, slotForPlannedMeal } from './widgets/DayWidgets'

describe('Dieta de hoje', () => {
  const db = buildSeed('2026-10-02')
  const plan = dayPlanFor(db, '2026-10-02')!

  it('uses the prescribed plan for the day of the long run', () => {
    expect(plan.name).toBe('Sexta')
    expect(plan.meals.map((m) => m.time)).toEqual(['05:00', '06:40', '08:00', '12:00', '16:00', '20:00'])
  })

  it('maps prescribed meals to slots (training meals are extra)', () => {
    expect(plan.meals.map(slotForPlannedMeal)).toEqual(['extra', 'extra', 'cafe', 'almoco', 'lanche_tarde', 'jantar'])
  })

  it('highlights the meal whose time has started', () => {
    expect(currentPlannedMeal(plan.meals, 4 * 60)).toBe(0)
    expect(currentPlannedMeal(plan.meals, 12 * 60 + 30)).toBe(3)
    expect(currentPlannedMeal(plan.meals, 21 * 60)).toBe(5)
  })
})
