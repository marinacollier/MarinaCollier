import { describe, expect, it } from 'vitest'
import { eventDraftFromText, readDate, readTime } from './events'

const FRI = '2026-10-09' // sexta

describe('reading events in pt-BR (typed, spoken or from an invite)', () => {
  it('aniversário da Ana sábado 20h no Bar Brahma', () => {
    expect(eventDraftFromText('aniversário da Ana sábado 20h no Bar Brahma', FRI)).toMatchObject({ title: 'Aniversário da Ana', date: '2026-10-10', startTime: '20:00', location: 'Bar Brahma', missing: [] })
  })
  it('spoken: "coloca aniversário da Ana sábado às oito da noite"', () => {
    expect(eventDraftFromText('coloca aniversário da Ana sábado às oito da noite', FRI)).toMatchObject({ title: 'Aniversário da Ana', date: '2026-10-10', startTime: '20:00' })
  })
  it('invite text: "Aniversário da Ana · sábado, 17 de outubro · 20h · Local: Casa Rosa"', () => {
    expect(eventDraftFromText('Aniversário da Ana\nsábado, 17 de outubro\n20h\nLocal: Casa Rosa', FRI, { strict: true })).toMatchObject({ title: 'Aniversário da Ana', date: '2026-10-17', startTime: '20:00', location: 'Casa Rosa', missing: [] })
  })
  it('dates: 17/10, 17 out, amanhã, "sábado, dia 17" pinned by the weekday', () => {
    expect(readDate('dia 17/10', FRI).date).toBe('2026-10-17')
    expect(readDate('17 out', FRI).date).toBe('2026-10-17')
    expect(readDate('amanhã', FRI).date).toBe('2026-10-10')
    expect(readDate('sábado, dia 17', FRI).date).toBe('2026-10-17')
    expect(readDate('17/01', FRI).date).toBe('2027-01-17')
  })
  it('a bare "dia 17" from an invite is NOT guessed → asks the month', () => {
    const d = eventDraftFromText('Festa da Bia dia 17 às 21h', FRI, { strict: true })
    expect(d.missing).toContain('month')
    expect(d.dayOfMonth).toBe(17)
    expect(d.date).toBeUndefined()
  })
  it('weekday + day that matches no near month → asks', () => {
    expect(readDate('quarta, dia 17', FRI).needsMonth).toBe(17)
  })
  it('no time written → no time invented (all-day), and it says so', () => {
    const d = eventDraftFromText('aniversário da Ana sábado', FRI)
    expect(d.startTime).toBeUndefined()
    expect(d.missing).toEqual(['time'])
  })
  it('times', () => {
    expect(readTime('20h30').start).toBe('20:30')
    expect(readTime('às 8 da noite').start).toBe('20:00')
    expect(readTime('19:00 - 23:00')).toEqual({ start: '19:00', end: '23:00' })
    expect(readTime('dia 17').start).toBeUndefined()
  })
})

describe('no false ranges', () => {
  it('"sábado, 17 às 20h" is one time, not 17–20h', () => {
    expect(readTime('sábado, 17 às 20h')).toEqual({ start: '20:00' })
    expect(readTime('das 9h às 18h')).toEqual({ start: '09:00', end: '18:00' })
  })
})
