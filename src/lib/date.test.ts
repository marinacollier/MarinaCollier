import { describe, expect, it } from 'vitest'
import { addDays, addMonths, countdownLabel, dayPart, diffDays, endOfMonth, formatLongDate, startOfWeek, toDateKey, toInstant, weekday, weekDays } from './date'

describe('date (America/Sao_Paulo)', () => {
  it('uses São Paulo day, not UTC, near midnight', () => {
    // 02:30 UTC on Oct 3 is still Oct 2, 23:30 in São Paulo
    expect(toDateKey(new Date('2026-10-03T02:30:00Z'))).toBe('2026-10-02')
    expect(toDateKey(new Date('2026-10-03T03:30:00Z'))).toBe('2026-10-03')
  })
  it('does key arithmetic across month/year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(diffDays('2026-10-02', '2026-10-22')).toBe(20)
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29')
  })
  it('starts weeks on Monday', () => {
    expect(weekday('2026-10-02')).toBe(5) // sexta
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28') // domingo → segunda anterior
    expect(weekDays('2026-10-02')[0]).toBe('2026-09-28')
    expect(weekDays('2026-10-02')[6]).toBe('2026-10-04')
  })
  it('formats in pt-BR', () => {
    expect(formatLongDate('2026-10-02')).toBe('sexta-feira, 2 de outubro')
    expect(countdownLabel('2026-10-22', '2026-10-02')).toBe('faltam 20 dias')
    expect(countdownLabel('2026-10-02', '2026-10-02')).toBe('é hoje! ✨')
  })
  it('builds instants at -03:00', () => {
    expect(toInstant('2026-10-02', '07:00').toISOString()).toBe('2026-10-02T10:00:00.000Z')
  })
  it('splits the day in parts', () => {
    expect(dayPart(7 * 60)).toBe('manha')
    expect(dayPart(14 * 60)).toBe('dia')
    expect(dayPart(21 * 60)).toBe('noite')
    expect(dayPart(1 * 60)).toBe('noite')
  })
})
