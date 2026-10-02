import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { buildFixture, FIXTURE_TODAY } from '@/features/search/test-fixture'
import { findWorkoutSlots, freeSlotsForDay, slotLabel } from './freeSlots'
import { buildInsights } from './insights'

const db = buildFixture()
const today = FIXTURE_TODAY

describe('free slots', () => {
  it('finds gaps ≥ 60 min between 06:00 and 21:00', () => {
    expect(freeSlotsForDay(db, today).map(slotLabel)).toEqual(['06:00–09:00', '10:00–14:00', '15:30–21:00'])
  })

  it('respects notBefore and the minimum length', () => {
    expect(freeSlotsForDay(db, today, { notBefore: 8 * 60 + 30 }).map(slotLabel)).toEqual(['10:00–14:00', '15:30–21:00'])
    expect(freeSlotsForDay(db, today, { notBefore: 8 * 60, minMinutes: 240 }).map(slotLabel)).toEqual(['10:00–14:00', '15:30–21:00'])
    expect(freeSlotsForDay(db, today, { notBefore: 8 * 60, minMinutes: 241 }).map(slotLabel)).toEqual(['15:30–21:00'])
  })

  it('an empty day is one big window', () => {
    expect(freeSlotsForDay(emptyDB(), today).map(slotLabel)).toEqual(['06:00–21:00'])
  })

  it('skips days that already have the modality and extends the window when the week is ending', () => {
    const fit = findWorkoutSlots(db, today, 8 * 60, 'musculacao')
    expect(fit.skipped).toEqual(['2026-10-03'])
    expect(fit.extended).toBe(true) // Friday: only Fri + Sun left this week
    expect(fit.days[0].date).toBe(today)
    // 08:00 now → starts at 08:30, so 08:30–09:00 (30 min) is too short
    expect(fit.days[0].slots.map(slotLabel)).toEqual(['10:00–14:00', '15:30–21:00'])
    expect(fit.days.map((d) => d.date)).toContain('2026-10-06') // Tuesday, next week (dentist on Tue 08:00)
  })

  it('on a Monday the window stays inside the week', () => {
    const fit = findWorkoutSlots(emptyDB(), '2026-09-28', 6 * 60, 'musculacao')
    expect(fit.extended).toBe(false)
    expect(fit.days).toHaveLength(7)
  })
})

describe('insights', () => {
  it('returns 2–4 gentle, deterministic insights', () => {
    const list = buildInsights(db, today, 8 * 60)
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list.length).toBeLessThanOrEqual(4)
    const texts = list.map((i) => i.text)
    expect(texts).toContain('2 coisas esperando alguém há mais de 7 dias')
    expect(texts).toContain('Recife é em 20 dias — 4 itens a confirmar')
    expect(buildInsights(db, today, 8 * 60)).toEqual(list)
    for (const t of texts) expect(t).not.toMatch(/%|atrasad|streak|falhou/i)
  })

  it('mentions tomorrow without a workout only when it is true', () => {
    const noTomorrow = { ...db, workouts: db.workouts.filter((w) => w.date !== '2026-10-03') }
    expect(buildInsights(noTomorrow, today, 8 * 60, 10).map((i) => i.text)).toContain('Nenhum treino planejado para amanhã ainda')
    expect(buildInsights(db, today, 8 * 60, 10).map((i) => i.text)).not.toContain('Nenhum treino planejado para amanhã ainda')
  })

  it('an empty db still gets at least two calm insights', () => {
    const list = buildInsights(emptyDB(), today, 8 * 60)
    expect(list.length).toBeGreaterThanOrEqual(2)
  })
})
