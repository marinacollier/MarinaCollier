import { describe, expect, it } from 'vitest'
import type { CalendarEntry } from '@/data/calendar/universal'
import { eveningPlan, fixityOf, lastFixed } from './adaptive'

const ev = (title: string, start: string, end?: string, p: Partial<CalendarEntry> = {}): CalendarEntry =>
  ({ id: title, title, startAt: { date: '2026-11-11', time: start }, endAt: { date: '2026-11-11', time: end }, sourceType: 'event', status: 'confirmado', allDay: false, ...p }) as unknown as CalendarEntry

// Her real Wednesday 11/11 evening.
const DAY = [
  ev('Bluemoon | Hillary', '18:30', '19:00'),
  ev('Estudar - Marina OS', '19:00', '20:00', { flexible: true }),
  ev('Tech e Operações (Tranquilo)', '20:00', '21:00'),
  ev('Fashion Finder - Tutorial', '21:00', '21:30'),
  ev('Entrevista Técnica| Marina Collier', '21:30', '22:15'),
]

describe('fixo × flexível', () => {
  it('meetings/classes/flights are fixed; tasks, studies and flexible plans are not', () => {
    expect(fixityOf(DAY[0])).toBe('fixo')
    expect(fixityOf(DAY[1])).toBe('flexivel')
    expect(fixityOf(ev('Tarefa', '10:00', undefined, { sourceType: 'task' }))).toBe('flexivel')
    expect(fixityOf(ev('Aula', '09:00', '15:10', { sourceType: 'school' }))).toBe('fixo')
    expect(fixityOf(ev('Robben', '09:00', undefined, { sourceType: 'tripItem', status: 'planejado' }))).toBe('flexivel')
    expect(fixityOf(ev('Voo SA366', '19:35', '21:35', { sourceType: 'tripItem', status: 'confirmado' }))).toBe('fixo')
  })
})

describe('encerramento inteligente', () => {
  it('"Encerrar o dia" 21:00 goes after the 21:30 interview (ends 22:15); sleep moves after it and is flagged', () => {
    const p = eveningPlan(DAY, '2026-11-11', { closingAt: '21:00', closingMin: 30, sleepAt: '22:00', wakeAt: '06:00' })
    expect(p.closing).toMatchObject({ from: '21:00', to: '22:15' })
    expect(p.closing!.reason).toContain('Entrevista Técnica')
    expect(p.sleep).toMatchObject({ from: '22:00', to: '22:45', hours: 7.3, tight: false })
  })

  it('a meeting with NO end time is not given one: the routine goes "depois de" its start, said out loud', () => {
    const p = eveningPlan([ev('Jantar com a escola', '21:30')], '2026-11-11', { closingAt: '21:00', sleepAt: '22:00' })
    expect(p.closing).toMatchObject({ to: '21:30', unknownEnd: true })
    expect(p.closing!.reason).toContain('fim não informado')
  })

  it('nothing after the routine → nothing changes; cancelled and all-day events do not count', () => {
    expect(eveningPlan([ev('Reunião', '15:00', '16:00')], '2026-11-11', { closingAt: '21:00', sleepAt: '22:00' })).toEqual({})
    expect(lastFixed([ev('X', '22:00', '23:00', { status: 'cancelado' }), ev('Y', '00:00', undefined, { allDay: true })], '2026-11-11')).toBeUndefined()
  })

  it('a very late commitment flags sleep as tight', () => {
    const p = eveningPlan([ev('Call EUA', '23:00', '23:45')], '2026-11-11', { closingAt: '21:00', closingMin: 30, sleepAt: '22:00', wakeAt: '06:00' })
    expect(p.sleep?.tight).toBe(true)
  })
})
