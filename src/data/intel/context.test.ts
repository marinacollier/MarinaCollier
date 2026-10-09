import { describe, expect, it } from 'vitest'
import { buildSeed } from '../seed'
import { busyIntervals, dayContext, fmtDuration, freeWindows, lifeContext, tripOpenItems } from './context'
import { previewOps } from './ops'
import type { Now } from './types'

const FRIDAY = '2026-10-02'
const now = (date: string, h: number, m = 0): Now => ({ date, minutes: h * 60 + m })

describe('LifeContextEngine — Marina’s seed', () => {
  const db = buildSeed(FRIDAY)

  it('Saturday evening: tomorrow is the long ride, early, key, pedal-longo day', () => {
    const ctx = lifeContext(db, now('2026-10-03', 20))
    expect(ctx.week).toHaveLength(7)
    expect(ctx.tomorrow.trainings).toEqual([expect.objectContaining({ title: 'Pedal longo', time: '06:00', durationMin: 120, key: true, done: false })])
    expect(ctx.tomorrow.nutritionDay).toBe('Pedal longo')
    expect(ctx.tomorrow.notes[0]).toMatchObject({ value: 'Seu pedal começa cedo amanhã (06:00).', provenance: 'fact' })
    // Saturday is the prep day for it.
    expect(ctx.today.notes.map((n) => n.value)).toContain('Hoje é dia de preparar o pedal do dia seguinte.')
  })

  it('presencial days carry the commute and the leaving time', () => {
    const tue = dayContext(db, '2026-10-06', now('2026-10-05', 20))
    expect(tue).toMatchObject({ workMode: 'presencial', presencial: true })
    expect(tue.commitments.some((c) => c.title.startsWith('Trabalho presencial'))).toBe(true)
    expect(tue.notes.some((n) => n.value === 'Amanhã é presencial — saída 08:00.')).toBe(true)
  })

  it('a per-day work override makes a remote day presencial (provenance: Marina)', () => {
    const changed = previewOps(db, [{ op: 'override', date: '2026-10-05', ref: { type: 'work', id: '2026-10-05' }, patch: { workMode: 'presencial' }, by: 'lumos' }])
    const mon = dayContext(changed, '2026-10-05', now('2026-10-04', 20))
    expect(mon.presencial).toBe(true)
    expect(mon.notes.find((n) => n.value.includes('presencial'))?.provenance).toBe('user')
  })

  it('free windows sit between wake and sleep, outside training, work, routines and events', () => {
    const fri = dayContext(db, FRIDAY)
    for (const f of fri.free) {
      expect(f.start >= '04:40').toBe(true)
      expect(f.end <= '22:00').toBe(true)
      expect(f.start < '09:00' ? f.end <= '09:00' : f.start >= '18:00').toBe(true)
    }
    // From "now" on, for today.
    expect(dayContext(db, FRIDAY, now(FRIDAY, 19)).free.every((f) => f.start >= '19:00')).toBe(true)
    expect(busyIntervals(db, FRIDAY).length).toBeGreaterThan(3)
  })

  it('next trip counts only real open items (bookings, documents…), not wishlists', () => {
    const ctx = lifeContext(db, now(FRIDAY, 10))
    expect(ctx.nextTrip).toMatchObject({ id: 'trip-africa-do-sul', daysLeft: 20 })
    const trip = db.trips.find((t) => t.id === 'trip-africa-do-sul')!
    const open = tripOpenItems(db, trip, FRIDAY)
    expect(open.length).toBe(ctx.nextTrip!.openItems)
    expect(open.every((i) => i.section !== 'quero_ir' && i.section !== 'comida')).toBe(true)
  })

  it('helpers', () => {
    expect(fmtDuration(240)).toBe('4h')
    expect(fmtDuration(90)).toBe('1h30')
    expect(fmtDuration(45)).toBe('45 min')
    expect(freeWindows([{ start: 600, end: 700 }], 540, 800, 30)).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '11:40', end: '13:20' },
    ])
  })
})

describe('Proactive · monthly backup reminder', () => {
  it('suggests a backup after 30 days, once per month, never before', async () => {
    const { proactiveInsights } = await import('./proactive')
    const db = buildSeed(FRIDAY)
    const fresh = { ...db, profile: { ...db.profile, lastBackupAt: '2026-09-25T12:00:00.000Z' } }
    expect(proactiveInsights(fresh, now(FRIDAY, 10), 10).some((i) => i.key.startsWith('backup:'))).toBe(false)
    const old = { ...db, profile: { ...db.profile, lastBackupAt: '2026-08-31T12:00:00.000Z' } }
    const tip = proactiveInsights(old, now(FRIDAY, 10), 10).find((i) => i.key.startsWith('backup:'))!
    expect(tip.text).toBe('Seu último backup foi há 32 dias. Quer gerar um agora?')
    expect(tip.ask).toBe('gera meu backup')
    expect(tip.key).toBe('backup:2026-10')
  })
})
