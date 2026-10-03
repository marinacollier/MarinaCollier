import { describe, expect, it } from 'vitest'
import { toggleIn, withChoice, withPotState } from './mutations'
import { defaultWeek } from './MealPrepPage'

describe('meal prep UI helpers', () => {
  it('toggles checked keys', () => {
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('sets and clears substitution choices', () => {
    expect(withChoice({}, 'k', 'X - 1 (10g)')).toEqual({ k: 'X - 1 (10g)' })
    expect(withChoice({ k: 'X' }, 'k', undefined)).toEqual({})
  })

  it('stores pot state only when it differs from the default', () => {
    expect(withPotState(undefined, 'd#2', 'freezer', 'geladeira')).toEqual({ 'd#2': 'freezer' })
    expect(withPotState({ 'd#2': 'freezer' }, 'd#2', 'geladeira', 'geladeira')).toEqual({})
  })

  it('weekend opens the coming week; weekdays the current one', () => {
    expect(defaultWeek('2026-10-03')).toBe('2026-10-05') // Saturday
    expect(defaultWeek('2026-10-04')).toBe('2026-10-05') // Sunday (prep day)
    expect(defaultWeek('2026-10-07')).toBe('2026-10-05') // Wednesday
  })
})
