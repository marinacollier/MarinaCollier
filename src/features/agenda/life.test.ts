import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import type { DB } from '@/data/types'
import { dayEntries, lifeEntries } from './selectors'

describe('one life: the agenda grid uses the Linha do dia', () => {
  const db = buildSeed('2026-10-02')

  it('routine stretches + meals with the same times as Hoje', () => {
    const rows = lifeEntries(db, '2026-10-02')
    const routines = rows.filter((e) => e.kind === 'routine')
    expect(routines[0]).toMatchObject({ time: '04:40', endTime: '05:50' }) // split where the training sits
    expect(routines.some((e) => e.time === '07:00')).toBe(true)
    expect(rows.some((e) => e.kind === 'meal' && e.time === '05:00')).toBe(true)
  })

  it('per-day overrides made on Hoje move / remove agenda entries for that day only', () => {
    const fisio = db.events.find((e) => e.startTime === '12:00' && e.recurrence)!
    const moved: DB = {
      ...db,
      scheduleOverrides: [{ id: 'o', createdAt: 'x', updatedAt: 'x', date: '2026-10-02', refType: 'event', refId: fisio.id, time: '15:00', endTime: '16:00', by: 'marina' }],
    }
    expect(dayEntries(moved, '2026-10-02').find((e) => e.id === fisio.id)).toMatchObject({ time: '15:00', endTime: '16:00' })
    expect(dayEntries(moved, '2026-10-09').find((e) => e.id === fisio.id)).toMatchObject({ time: '12:00' })
    const cancelled: DB = { ...db, scheduleOverrides: [{ ...moved.scheduleOverrides[0], time: undefined, cancelled: true }] }
    expect(dayEntries(cancelled, '2026-10-02').some((e) => e.id === fisio.id)).toBe(false)
  })
})
