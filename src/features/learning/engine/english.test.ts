import { describe, expect, it } from 'vitest'
import type { MemoryItem, Task } from '@/data/types'
import {
  durationLabel,
  englishLevel,
  grammarReport,
  NO_EVIDENCE,
  PASSIVE_LABEL,
  patternReport,
  recentEvidence,
  reviewReport,
  skillEvidence,
  UNKNOWN_DURATION,
  vocabularyReport,
  weeklyGoal,
} from './english'
import { baseDB, card, sess } from './fixtures'
import { previewImport } from './import'
import { minutesBySkill, studyEntries, totalMinutes } from './minutes'
import { TRACK_EN } from './model'
import { learningStats, weekOf } from './stats'

const NOW = { date: '2026-11-10', minutes: 20 * 60 }
const AT = '2026-11-09T10:00:00.000Z'
const mem = (id: string, p: Partial<MemoryItem>): MemoryItem => ({ id, createdAt: AT, updatedAt: AT, kind: 'state', area: 'estudos', text: id, status: 'confirmed', source: 'marina', ...p })
const task = (id: string, p: Partial<Task>): Task => ({ id, createdAt: AT, updatedAt: AT, title: id, status: 'todo', order: 0, ...p }) as Task

describe('minutesUnknown', () => {
  it('counts as a session but adds 0 minutes to every total', () => {
    const db = baseDB({
      studySessions: [
        sess('escola', { trackId: TRACK_EN, minutes: 240, minutesUnknown: true, origin: 'escola', skills: ['grammar', 'speaking'], date: '2026-11-09' }),
        sess('ok', { trackId: TRACK_EN, minutes: 30, skills: ['speaking'], date: '2026-11-09' }),
      ],
    })
    const e = studyEntries(db, '2026-11-09', '2026-11-09')
    expect(e).toHaveLength(2)
    expect(e.find((x) => x.key === 'session:escola')).toMatchObject({ minutes: 0, minutesUnknown: true })
    expect(totalMinutes(e)).toBe(30)
    expect(minutesBySkill(e)).toEqual({ speaking: 30 })
    const st = learningStats(db, weekOf('2026-11-09'), NOW)
    expect(st).toMatchObject({ total: 30, sessions: 2, unknownDuration: 1 })
    expect(st.byTrack[TRACK_EN]).toBe(30)
    expect(durationLabel(db.studySessions[0])).toBe(UNKNOWN_DURATION)
    expect(recentEvidence(db).find((r) => r.id === 'escola')).toMatchObject({ id: 'escola', duration: UNKNOWN_DURATION, origin: 'escola' })
  })

  it('import accepts minutesUnknown without minutes and keeps 0', () => {
    const p = previewImport(baseDB(), JSON.stringify({ sessions: [{ id: 'x', date: '2026-11-09', trackId: TRACK_EN, minutesUnknown: true, origin: 'escola', assisted: true, content: [{ area: 'grammar', title: 'Conditionals', items: ['second conditional'] }] }] }), '2026-11-10')
    expect(p.invalid).toEqual([])
    expect(p.sessions[0]).toMatchObject({ minutes: 0, minutesUnknown: true, origin: 'escola', assisted: true })
  })
})

describe('mastery', () => {
  const grammarSession = (id: string, assisted: boolean) => sess(id, { trackId: TRACK_EN, assisted, content: [{ area: 'grammar', title: 'Tenses', items: ['Present perfect'] }] })

  it('assisted practice is never mastery', () => {
    const db = baseDB({ studySessions: [grammarSession('a', true), grammarSession('b', true)] })
    const r = grammarReport(db)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ structure: 'Present perfect', status: 'praticado', assistedOnly: true, label: 'praticado com ajuda, ainda sem avaliação', sessions: 2 })
    expect(r.masteredCards).toHaveLength(0)
  })

  it('mastery only from cards with ≥2 correct in a row', () => {
    const one = baseDB({ studySessions: [grammarSession('a', false)], learningErrors: [card('c1', { trackId: TRACK_EN, category: 'present perfect', streak: 1 })] })
    expect(grammarReport(one).rows[0]).toMatchObject({ status: 'praticado', label: 'praticado, ainda sem avaliação', cards: 1 })
    const two = baseDB({ studySessions: [grammarSession('a', true)], learningErrors: [card('c1', { trackId: TRACK_EN, category: 'Present Perfect', streak: 2 })] })
    const r = grammarReport(two)
    expect(r.rows[0].status).toBe('dominio_demonstrado')
    expect(r.masteredCards.map((c) => c.id)).toEqual(['c1'])
    // A wrong answer resets the streak → no longer mastery.
    const reset = baseDB({ studySessions: [grammarSession('a', false)], learningErrors: [card('c1', { trackId: TRACK_EN, category: 'present perfect', streak: 0, count: 5 })] })
    expect(grammarReport(reset).rows[0].status).toBe('praticado')
  })

  it('vocabulary stays passive until used in her own (unassisted) production', () => {
    const db = baseDB({
      studySessions: [
        sess('v', { trackId: TRACK_EN, date: '2026-11-05', content: [{ area: 'vocabulary', title: 'Business', items: ['leverage', 'roadmap'] }] }),
        sess('help', { trackId: TRACK_EN, date: '2026-11-06', assisted: true, evidence: 'used roadmap with ChatGPT' }),
        sess('use', { trackId: TRACK_EN, date: '2026-11-07', origin: 'reuniao', evidence: 'said "leverage" in the meeting' }),
      ],
    })
    const v = vocabularyReport(db)
    expect(v.find((x) => x.word === 'leverage')).toMatchObject({ active: true })
    expect(v.find((x) => x.word === 'roadmap')).toMatchObject({ active: false, label: PASSIVE_LABEL })
  })
})

describe('patterns, reviews and goals come from real records only', () => {
  it('pattern frequency = matching English review cards', () => {
    const db = baseDB({
      memory: [mem('p1', { key: 'english.pattern.preposicoes', text: 'Preposições (ex.: “depend of”)' }), mem('p2', { key: 'english.pattern.artigos' }), mem('old', { key: 'english.pattern.x', status: 'archived' })],
      learningErrors: [card('a', { trackId: TRACK_EN, category: 'Preposições', count: 3 }), card('b', { trackId: TRACK_EN, category: 'preposicoes', count: 1 }), card('es', { trackId: 'marina:os2:track-espanhol', category: 'preposições' })],
    })
    const p = patternReport(db)
    expect(p.map((x) => [x.key, x.cards, x.occurrences])).toEqual([
      ['english.pattern.preposicoes', 2, 4],
      ['english.pattern.artigos', 0, 0],
    ])
  })

  it('reviews count cards and revisao-ingles tasks', () => {
    const db = baseDB({
      learningErrors: [card('a', { trackId: TRACK_EN, nextReview: '2026-11-10' }), card('b', { trackId: TRACK_EN, nextReview: '2026-11-20', lastReviewed: '2026-11-08', streak: 2 })],
      tasks: [task('t2', { tags: ['revisao-ingles'], date: '2026-11-14' }), task('t1', { tags: ['revisao-ingles'], date: '2026-11-12' }), task('t0', { tags: ['revisao-ingles'], status: 'done' }), task('other', { date: '2026-11-11' })],
    })
    const r = reviewReport(db, '2026-11-10')
    expect(r).toMatchObject({ cards: 2, due: 1, reviewed: 1, mastered: 1, doneTasks: 1 })
    expect(r.upcomingTasks.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('empty data → no evidence, no invented numbers', () => {
    const db = baseDB()
    expect(englishLevel(db).label).toBe('nível: a avaliar → objetivo C1')
    expect(recentEvidence(db)).toEqual([])
    expect(grammarReport(db).empty).toBe(true)
    expect(vocabularyReport(db)).toEqual([])
    expect(Object.values(skillEvidence(db)).every((x) => x.length === 0)).toBe(true)
    expect(patternReport(db)).toEqual([])
    expect(reviewReport(db, NOW.date)).toMatchObject({ cards: 0, due: 0, reviewed: 0, mastered: 0, upcomingTasks: [], doneTasks: 0 })
    expect(weeklyGoal(db, NOW)).toMatchObject({ targetMin: undefined, label: 'sem objetivo definido', confirmedMin: 0, sessions: 0 })
    expect(NO_EVIDENCE).toBe('sem evidência ainda')
  })

  it('level is the track’s own (provisional), never from hours', () => {
    const db = baseDB({ studySessions: [sess('lots', { trackId: TRACK_EN, minutes: 6000 })] })
    db.studyTracks[0] = { ...db.studyTracks[0], level: 'B1+–B2', goalLevel: 'C1' }
    expect(englishLevel(db).label).toBe('B1+–B2 (provisório) → objetivo C1')
  })

  it('weekly goal: plan target, confirmed minutes outside school only', () => {
    const db = baseDB({
      studySessions: [sess('s', { trackId: TRACK_EN, minutes: 40, date: '2026-11-09' }), sess('school', { trackId: TRACK_EN, minutes: 0, minutesUnknown: true, origin: 'escola', date: '2026-11-09' }), sess('msg', { trackId: TRACK_EN, minutes: 0, minutesUnknown: true, origin: 'mensagem', date: '2026-11-10' })],
    })
    db.profile = { ...db.profile, learningPlan: { split: {}, weeklyAutonomousMin: 180 } }
    expect(weeklyGoal(db, NOW)).toMatchObject({ targetMin: 180, confirmedMin: 40, sessions: 2, unknownDuration: 1 })
  })
})
