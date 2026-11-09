import { describe, expect, it } from 'vitest'
import type { DayContext } from '@/data/priority/contract'
import type { CalendarEvent, StudyItem } from '@/data/types'
import { studyCandidates, studyOptions } from './candidates'
import { baseDB, card, sess } from './engine/fixtures'
import { TRACK_EN, TRACK_ES } from './engine/model'

const AT = '2026-11-09T10:00:00.000Z'
const ctx = (p: Partial<DayContext> = {}): DayContext => ({ date: '2026-11-09', freeMin: 120, energy: 3, now: '18:30', ...p })
const item = (id: string, p: Partial<StudyItem>): StudyItem => ({ id, createdAt: AT, updatedAt: AT, title: id, kind: 'curso', status: 'estudando', progress: 0, order: 0, ...p })
const event = (id: string, p: Partial<CalendarEvent>): CalendarEvent => ({ id, createdAt: AT, updatedAt: AT, sourceId: 'local', title: id, date: '2026-11-09', allDay: false, ...p })

describe('studyCandidates', () => {
  it('09/11: 60 min of English done + 2h free + medium energy → no long English; Spanish ≤ 20 min offered', () => {
    const db = baseDB({ studySessions: [sess('en', { trackId: TRACK_EN, minutes: 60, skills: ['speaking'] })] })
    const list = studyCandidates(db, ctx({ freeMin: 120, energy: 3, now: '18:30' }))
    for (const c of list.filter((c) => c.area === 'idiomas' && c.key.includes(TRACK_EN))) expect(c.maxMin).toBeLessThanOrEqual(20)
    expect(list.some((c) => c.key === `study:lang:${TRACK_EN}`)).toBe(false)
    const es = list.find((c) => c.key === `study:lang:${TRACK_ES}`)
    expect(es).toBeTruthy()
    expect(es!.maxMin).toBeLessThanOrEqual(20)
    expect(es!.reasons.join(' ')).toMatch(/60 min de inglês/)
    for (const c of list) {
      expect(c.score).toBeGreaterThanOrEqual(0)
      expect(c.score).toBeLessThanOrEqual(100)
      expect(c.moscow).not.toBe('must')
    }
  })

  it('matrix: 15 min → review; 30 min high energy → conversation; 60 min medium → reading/workbook; low energy → light listening', () => {
    const db = baseDB()
    const en = (c: DayContext) => studyOptions(db, c).find((o) => o.trackId === TRACK_EN)!
    expect(en(ctx({ freeMin: 15 })).title).toMatch(/Revisão/)
    expect(en(ctx({ freeMin: 30, energy: 4 })).title).toMatch(/Conversação/)
    expect(en(ctx({ freeMin: 60, energy: 3 })).title).toMatch(/Leitura \+ workbook/)
    expect(en(ctx({ freeMin: 60, energy: 4 })).title).toMatch(/estruturada/)
    expect(en(ctx({ freeMin: 45, energy: 2 })).title).toMatch(/Listening leve/)
  })

  it('a subject she chose is respected (never redirected to languages)', () => {
    const db = baseDB({ studyItems: [item('agents', { title: 'Curso de agentes de IA', domain: 'ia' })] })
    const opts = studyOptions(db, ctx({ freeMin: 30 }), { domain: 'politica_sociedade' })
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.every((o) => o.domain === 'politica_sociedade')).toBe(true)
    expect(opts[0].kind).toBe('livre')
    const noLang = studyOptions(db, ctx(), { excludeDomains: ['idiomas'] })
    expect(noLang.some((o) => o.domain === 'idiomas')).toBe(false)
    expect(noLang.some((o) => o.key === 'study:item:agents')).toBe(true)
  })

  it('cards due show up (any domain), and Cambly only with a purpose', () => {
    const db = baseDB({ learningErrors: [card('know', { trackId: TRACK_EN, domain: 'idiomas', front: 'I now', back: 'I know', count: 4, nextReview: '2026-11-09' })] })
    const list = studyOptions(db, ctx())
    expect(list.find((o) => o.key === 'study:review')?.reasons.join(' ')).toMatch(/I now/)
    expect(list.some((o) => o.tool === 'cambly')).toBe(false)
    const cambly = studyOptions(db, ctx({ freeMin: 60 }), { domain: 'idiomas', tool: 'cambly' }).find((o) => o.tool === 'cambly')
    expect(cambly?.title).toMatch(/Cambly com objetivo/)
  })

  it('a meeting in English within 48h → prep (should); an exam → must', () => {
    const db = (baseDB({ events: [event('m', { title: 'Reunião em inglês com parceiros', date: '2026-11-10', startTime: '10:00', endTime: '11:00' })] }))
    const o = studyOptions(db, ctx()).find((x) => x.trackId === TRACK_EN)!
    expect(o.title).toMatch(/Preparar/)
    expect(o.moscow).toBe('should')
    expect(o.reasons[0]).toMatch(/Reunião em inglês/)
    const exam = (baseDB({ events: [event('x', { title: 'Prova de espanhol', date: '2026-11-10', startTime: '10:00', endTime: '11:00' })] }))
    expect(studyOptions(exam, ctx()).find((x) => x.trackId === TRACK_ES)?.moscow).toBe('must')
  })
})
