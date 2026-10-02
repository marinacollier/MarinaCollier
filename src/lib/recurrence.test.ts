import { describe, expect, it } from 'vitest'
import { describeRecurrence, isDue, nextOccurrence, occursOn } from './recurrence'

describe('recurrence', () => {
  it('weekly rules follow weekdays', () => {
    const r = { kind: 'weekly' as const, weekdays: [1, 3, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] }
    expect(occursOn(r, '2026-10-02')).toBe(true) // sexta
    expect(occursOn(r, '2026-10-03')).toBe(false) // sábado
    expect(nextOccurrence(r, '2026-10-03')).toBe('2026-10-05')
    expect(describeRecurrence(r)).toBe('seg, qua, sex')
  })
  it('monthly last day clamps to month length', () => {
    const r = { kind: 'monthly' as const, dayOfMonth: 'last' as const }
    expect(occursOn(r, '2026-02-28')).toBe(true)
    expect(occursOn(r, '2026-10-31')).toBe(true)
    expect(occursOn(r, '2026-10-30')).toBe(false)
    expect(occursOn({ kind: 'monthly', dayOfMonth: 31 }, '2026-09-30')).toBe(true)
  })
  it('every N days from anchor', () => {
    const r = { kind: 'every_n_days' as const, days: 3, anchor: '2026-10-01' }
    expect(occursOn(r, '2026-10-04')).toBe(true)
    expect(occursOn(r, '2026-10-05')).toBe(false)
    expect(occursOn(r, '2026-09-28')).toBe(false)
  })
  it('every N days from last done stays due until done', () => {
    const r = { kind: 'every_n_days' as const, days: 15, anchor: '2026-09-01', fromLastDone: true }
    expect(isDue(r, '2026-10-02', '2026-09-20')).toBe(false)
    expect(isDue(r, '2026-10-05', '2026-09-20')).toBe(true)
    expect(isDue(r, '2026-10-20', '2026-09-20')).toBe(true)
    expect(nextOccurrence(r, '2026-10-02', '2026-09-20')).toBe('2026-10-05')
  })
})
