import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { dayTimeline } from '@/data/timeline'
import { composerPlaceholder, homeDay, nowLabel, relevantRows, REST_MAX } from './day'
import { shouldMarkSeen } from './seen'

const FRI = '2026-10-02' // long run 06:00, remote work, fisioterapia 12:00
const db = buildSeed(FRI)
const at = (h: number, m = 0) => {
  const minutes = h * 60 + m
  return homeDay(db, FRI, minutes, dayTimeline(db, FRI, { nowMinutes: minutes }))
}

describe('Home — relevant rows', () => {
  const rows = relevantRows(db, dayTimeline(db, FRI))
  it('collapses each routine into ONE row and leaves out steps, prep, pet care and intra fuel', () => {
    const routineRows = rows.filter((r) => r.kind === 'routine')
    expect(routineRows.map((r) => r.title)).toEqual(['Milagre da Manhã', 'Encerrar o dia'])
    expect(rows.some((r) => r.kind === 'routineItem' || r.kind === 'prep' || r.kind === 'petTask')).toBe(false)
    expect(rows.some((r) => r.title.startsWith('Intra'))).toBe(false)
    expect(rows.find((r) => r.title === 'Encerrar o dia')).toMatchObject({ start: '21:00', end: '22:10' })
  })

  it('keeps the real anchors: training, events, meals, work', () => {
    const titles = rows.map((r) => r.title)
    for (const t of ['Corrida longa Z2', 'Fisioterapia', 'Almoço', 'Jantar', 'Trabalho remoto']) expect(titles).toContain(t)
  })
})

describe('Home — AGORA / PRÓXIMO', () => {
  it('before the day starts: free until the morning routine', () => {
    const d = at(4, 20)
    expect(nowLabel(d.now)).toBe('Livre até 04:40')
    expect(d.next?.title).toBe('Milagre da Manhã')
  })

  it('a training beats the routine around it', () => {
    const d = at(6, 30)
    expect(d.now).toMatchObject({ state: 'busy', title: 'Corrida longa Z2', until: '07:00' })
  })

  it('during work, an event in the middle is the "now"; otherwise work (or its project) is', () => {
    expect(at(12, 15).now.title).toBe('Fisioterapia')
    const d = at(10)
    expect(d.now.state).toBe('busy')
    expect(d.now.row?.kind).toBe('work')
    expect(d.next?.start).toBe('12:00')
  })

  it('RESTANTE never repeats the next row and stays short', () => {
    const d = at(10)
    expect(d.rest.length).toBeLessThanOrEqual(REST_MAX)
    expect(d.rest.some((r) => r.key === d.next?.key)).toBe(false)
    expect(d.rest.every((r) => r.start >= d.next!.start)).toBe(true)
  })

  it('late night: nothing left, the rest is hers', () => {
    const d = at(23, 30)
    expect(d.now).toMatchObject({ state: 'free', title: 'Livre', until: undefined })
    expect(d.next).toBeUndefined()
    expect(d.rest).toEqual([])
  })
})

describe('Home — composer + seen baseline', () => {
  it('placeholder follows the part of the day', () => {
    expect(composerPlaceholder('manha')).toBe('o que eu tenho hoje?')
    expect(composerPlaceholder('dia', { workNow: true })).toBe('o que precisa de mim?')
    expect(composerPlaceholder('noite')).toBe('me ajuda a organizar amanhã')
  })

  it('moves the ChangeFeed baseline at most once an hour', () => {
    expect(shouldMarkSeen(undefined, '2026-10-02T12:00:00.000Z')).toBe(true)
    expect(shouldMarkSeen('2026-10-02T11:30:00.000Z', '2026-10-02T12:00:00.000Z')).toBe(false)
    expect(shouldMarkSeen('2026-10-02T11:00:00.000Z', '2026-10-02T12:00:00.000Z')).toBe(true)
  })
})
