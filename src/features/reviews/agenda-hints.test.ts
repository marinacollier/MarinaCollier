import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { buildLifeFixture } from '@/features/search/life-fixture'
import { boardEventOfMonth } from './monthly'
import { reviewEventOfWeek } from './weekly'

const db = buildLifeFixture()

describe('review agenda hints (from data)', () => {
  it('finds the Saturday event with a template for the reviewed week', () => {
    const hit = reviewEventOfWeek(db, '2026-09-28')!
    expect(hit.event.title).toBe('Weekly CEO Review')
    expect(hit.date).toBe('2026-10-03')
    expect(reviewEventOfWeek(emptyDB(), '2026-09-28')).toBeUndefined()
    // cancelled that week → no hint
    const cancelled = { ...db, events: db.events.map((e) => (e.id === 'e-ceo' ? { ...e, exdates: ['2026-10-03'] } : e)) }
    expect(reviewEventOfWeek(cancelled, '2026-09-28')).toBeUndefined()
  })

  it('finds the monthly event with a template (last day of the month)', () => {
    expect(boardEventOfMonth(db, '2026-10')).toMatchObject({ date: '2026-10-31', event: { title: 'Monthly Board Meeting' } })
    expect(boardEventOfMonth(db, '2026-11')!.date).toBe('2026-11-30')
    expect(boardEventOfMonth(emptyDB(), '2026-10')).toBeUndefined()
  })
})
