import { describe, expect, it } from 'vitest'
import type { StudyItem, Trip } from '@/data/types'
import { baseDB, card, sess } from './fixtures'
import { addDays } from '@/lib/date'
import { classEntryId, minutesBySkill, studyEntries, totalMinutes } from './minutes'
import { domainReport, learningStats, weekOf } from './stats'
import { dueCards, recordOccurrence, review } from './srs'
import { errorTopicsFrom, previewImport, topicCardId } from './import'
import { parseStudyLog } from './parse'
import { TRACK_EN, TRACK_ES } from './model'

const AT = '2026-11-09T10:00:00.000Z'
const NOW = { date: '2026-11-09', minutes: 15 * 60 }

const schoolTrip = (): Trip =>
  ({
    id: 'trip-za',
    createdAt: AT,
    updatedAt: AT,
    name: 'South Africa',
    startDate: '2026-11-01',
    endDate: '2026-11-20',
    expedition: { timeZone: 'Africa/Johannesburg', currency: 'ZAR', marginPct: 15, emergencyContacts: [], school: { name: 'English school', from: '2026-11-02', until: '2026-11-20', days: [1, 2, 3, 4, 5].map((w) => ({ weekday: w, start: '09:00', end: '12:00' })) } },
  }) as unknown as Trip

describe('minutes counted once', () => {
  it('a session with many domains, skills and goals counts its minutes once', () => {
    const db = baseDB({ studySessions: [sess('s1', { minutes: 60, domain: 'moda_fashiontech', relatedDomains: ['idiomas', 'ia'], skills: ['listening', 'speaking', 'business english'], goalIds: ['g1', 'g2'], topics: ['a', 'b'] })] })
    const e = studyEntries(db, '2026-11-09', '2026-11-09', NOW)
    expect(totalMinutes(e)).toBe(60)
    const skills = minutesBySkill(e)
    expect(Object.values(skills).reduce((a, b) => a + b, 0)).toBe(60)
    const rep = domainReport(e)
    expect(rep.reduce((s, r) => s + r.minutes, 0)).toBe(60)
    expect(rep.find((r) => r.domain === 'moda_fashiontech')?.minutes).toBe(60)
    expect(rep.find((r) => r.domain === 'idiomas')).toMatchObject({ minutes: 0, alsoTouched: 60 })
  })

  it('planned / abandoned sessions do not count', () => {
    const db = baseDB({ studySessions: [sess('a', { status: 'planejado' }), sess('b', { status: 'abandonado' }), sess('c', {})] })
    expect(totalMinutes(studyEntries(db, '2026-11-09', '2026-11-09', NOW))).toBe(30)
  })

  it('a class on the calendar counts once it ended, and a session linked to it replaces it', () => {
    const db = baseDB({ trips: [schoolTrip()] })
    const day = '2026-11-09' // Monday
    expect(studyEntries(db, day, day, { date: day, minutes: 10 * 60 })).toHaveLength(0) // not over yet
    const after = studyEntries(db, day, day, NOW)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ source: 'aula', minutes: 180, trackId: TRACK_EN, key: classEntryId('trip-za', day) })
    const linked = baseDB({ trips: [schoolTrip()], studySessions: [sess('s', { minutes: 180, trackId: TRACK_EN, linkedEventId: classEntryId('trip-za', day), skills: ['speaking'] })] })
    expect(totalMinutes(studyEntries(linked, day, day, NOW))).toBe(180)
    const aula = baseDB({ trips: [schoolTrip()], studySessions: [sess('s', { minutes: 150, trackId: TRACK_EN, source: 'aula' })] })
    expect(totalMinutes(studyEntries(aula, day, day, NOW))).toBe(150)
  })
})

describe('per-domain report', () => {
  it('counts each session in its main domain only; a week of literature is just reported', () => {
    const db = baseDB({
      studySessions: [
        sess('l1', { domain: 'literatura_escrita_cultura', minutes: 40, date: '2026-11-09' }),
        sess('l2', { domain: 'literatura_escrita_cultura', minutes: 20, date: '2026-11-10', relatedDomains: ['cristianismo_teologia'] }),
        sess('t1', { domain: 'cristianismo_teologia', minutes: 30, date: '2026-11-11' }),
      ],
    })
    const st = learningStats(db, weekOf('2026-11-12'), { date: '2026-11-15', minutes: 600 })
    expect(st.total).toBe(90)
    expect(st.byDomain.map((r) => [r.domain, r.minutes])).toEqual([
      ['literatura_escrita_cultura', 60],
      ['cristianismo_teologia', 30],
    ])
    expect(st.byDomain[1].alsoTouched).toBe(20)
    const lit = learningStats(db, weekOf('2026-11-12'), { date: '2026-11-15', minutes: 600 }, { domain: 'cristianismo_teologia' })
    expect(lit.total).toBe(50) // filter shows sessions that touched it; still once each
  })

  it('language split is computed inside idiomas only', () => {
    const db = baseDB({ studySessions: [sess('e', { trackId: TRACK_EN, minutes: 60 }), sess('s', { trackId: TRACK_ES, minutes: 20 }), sess('ia', { domain: 'ia', minutes: 200 })] })
    const st = learningStats(db, weekOf('2026-11-09'), NOW)
    expect(st.split.find((x) => x.trackId === TRACK_EN)?.actual).toBeCloseTo(0.75)
    expect(st.split.find((x) => x.trackId === TRACK_ES)?.actual).toBeCloseTo(0.25)
  })
})

describe('spaced review', () => {
  const today = '2026-11-09'
  it('climbs the ladder only with spaced successes; never "dominado" after one', () => {
    let c = card('x', { nextReview: today })
    const r1 = review(c, true, today)
    expect(r1.status).toBe('em_pratica')
    expect(r1.intervalDays).toBeGreaterThanOrEqual(3)
    c = { ...c, ...r1 }
    // early review: no advance
    const early = review(c, true, addDays(today, 1))
    expect(early.streak).toBe(1)
    expect(early.nextReview).toBe(c.nextReview)
    const r2 = review(c, true, c.nextReview)
    expect(r2.status).toBe('consolidando')
    c = { ...c, ...r2 }
    const r3 = review(c, true, c.nextReview)
    expect(r3.status).toBe('dominado_provisorio')
    expect(r3.intervalDays).toBeGreaterThan(r2.intervalDays)
  })

  it('a wrong answer goes back to 1 day and "revisar"; a new occurrence too', () => {
    const c = card('x', { nextReview: today, streak: 3, status: 'dominado_provisorio', intervalDays: 14 })
    const r = review(c, false, today)
    expect(r).toMatchObject({ status: 'revisar', intervalDays: 1, streak: 0, nextReview: addDays(today, 1) })
    expect(r.ease).toBeLessThan(1)
    expect(recordOccurrence(c, today)).toMatchObject({ count: 2, status: 'revisar', streak: 0 })
  })

  it('due list is capped and ordered by impact', () => {
    const cards = Array.from({ length: 12 }, (_, i) => card(`c${i}`, { nextReview: today, count: i === 5 ? 9 : 1 }))
    const due = dueCards(cards, today, 8)
    expect(due).toHaveLength(8)
    expect(due[0].id).toBe('c5')
  })

  it('works for a non-language concept card', () => {
    const c = card('patristica', { kind: 'conceito', domain: 'cristianismo_teologia', front: 'Quem foi Agostinho?', back: 'Bispo de Hipona', nextReview: today })
    expect(dueCards([c], today)).toHaveLength(1)
    expect(review(c, true, today).status).toBe('em_pratica')
  })
})

describe('imports', () => {
  it('JSON import previews and dedupes by id', () => {
    const db = baseDB({ studySessions: [sess('ext-1', {})], learningErrors: [card('err-1')] })
    const raw = JSON.stringify({
      sessions: [
        { id: 'ext-1', date: '2026-11-08', minutes: 30, domain: 'idiomas' },
        { id: 'ext-2', date: '2026-11-08', minutes: 45, trackId: TRACK_EN, skills: ['speaking'] },
        { id: 'ext-2', date: '2026-11-08', minutes: 45, domain: 'ia' },
        { id: 'bad', minutes: 10 },
      ],
      errors: [{ id: 'err-1', original: 'a', correction: 'b' }, { id: 'err-2', original: 'he go', correction: 'he goes' }],
    })
    const p = previewImport(db, raw, '2026-11-09')
    expect(p.sessions.map((s) => s.id)).toEqual(['ext-2'])
    expect(p.sessions[0]).toMatchObject({ domain: 'idiomas', source: 'importado', skills: ['speaking'] })
    expect(p.cards.map((c) => c.id)).toEqual(['err-2'])
    expect(p.cards[0]).toMatchObject({ front: 'he go', back: 'he goes', kind: 'erro' })
    expect(p.skipped.map((s) => s.id)).toEqual(['ext-1', 'ext-2', 'err-1'])
    expect(p.invalid).toHaveLength(1)
  })

  it('"importar como erros" turns the study item topics into cards with stable ids, once', () => {
    const item = { id: 'marina:inv:ingles-pratica-erros', title: 'Inglês: prática de erros', trackId: TRACK_EN, notes: '1. do/does vs be\n2. 3ª pessoa\n3. going to\n4. can sem to\n5. know/now\n6. good/well\n7. artigos/plurais\n8. preposições\n9. word stress\n10. though/through/thought/bought' } as StudyItem
    const db = baseDB({ studyItems: [item] })
    const cards = errorTopicsFrom(db, item, '2026-11-09')
    expect(cards).toHaveLength(10)
    expect(cards.map((c) => c.id)).toContain(topicCardId(item.id, 'know-now'))
    const again = errorTopicsFrom(baseDB({ studyItems: [item], learningErrors: cards.map((c) => card(c.id!, c)) }), item, '2026-11-09')
    expect(again).toHaveLength(0)
  })
})

describe('parsing what she says', () => {
  const db = baseDB()
  it('retro English session with context; no skills invented', () => {
    const p = parseStudyLog(db, 'hoje estudei 60 minutos de inglês preparando a reunião com Hillary', '2026-11-09')!
    expect(p).toMatchObject({ minutes: 60, domain: 'idiomas', trackId: TRACK_EN, skills: [], date: '2026-11-09' })
    expect(p.context).toBe('preparando a reunião com Hillary')
  })
  it('video about fashion in English: main moda, related idiomas, no skill', () => {
    const p = parseStudyLog(db, 'Assisti a um vídeo sobre moda em inglês', '2026-11-09')!
    expect(p).toMatchObject({ domain: 'moda_fashiontech', relatedDomains: ['idiomas'], contentLanguage: 'en', skills: [], resourceType: 'video', learningMode: 'listening' })
  })
  it('IA / teologia', () => {
    expect(parseStudyLog(db, 'Estudei IA por 45 minutos', '2026-11-09')).toMatchObject({ domain: 'ia', minutes: 45 })
    expect(parseStudyLog(db, 'Li 20 páginas de teologia', '2026-11-09')).toMatchObject({ domain: 'cristianismo_teologia', pages: 20, minutes: undefined, learningMode: 'leitura' })
  })
  it('speaking without a language asks; configured context terms answer it', () => {
    expect(parseStudyLog(db, 'Fiz 60 minutos de speaking para a reunião com Hillary', '2026-11-09')).toMatchObject({ domain: 'idiomas', skills: ['speaking'], needsLanguage: true })
    const withTerms = baseDB({ profile: { ...db.profile, learningPlan: { split: { [TRACK_EN]: 0.7, [TRACK_ES]: 0.3 }, contextTerms: [{ trackId: TRACK_EN, terms: ['Hillary'] }] } } })
    expect(parseStudyLog(withTerms, 'Fiz 60 minutos de speaking para a reunião com Hillary', '2026-11-09')).toMatchObject({ trackId: TRACK_EN, needsLanguage: false })
  })
  it('not a study log', () => {
    expect(parseStudyLog(db, 'fiz yoga', '2026-11-09')).toBeUndefined()
    expect(parseStudyLog(db, 'li o livro todo', '2026-11-09')).toBeUndefined()
  })
})
