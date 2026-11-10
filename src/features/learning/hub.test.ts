import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { actions, detachStorage, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { dayCapacity } from '@/data/priority/capacity'
import type { DayContext } from '@/data/priority/contract'
import type { CalendarEvent, StudyItem } from '@/data/types'
import { dayContextFor } from '@/features/today/home/day-checkin'
import { hmToMinutes, minutesToHM } from '@/lib/date'
import { studyOptions } from './candidates'
import { baseDB, card, sess } from './engine/fixtures'
import { TRACK_EN } from './engine/model'
import { putInDay, startRoute, studyAgents, studyNow } from './hub'
import { applyMarketBoost, extractSkills, hotSkills, marketBoost, marketGaps, pasteHash, RADAR_TAG, skillCounts } from './radar'
import { addNewsletter } from './radar-ops'

const D = '2026-11-10'
const AT = '2026-11-09T10:00:00.000Z'
const item = (id: string, p: Partial<StudyItem>): StudyItem => ({ id, createdAt: AT, updatedAt: AT, title: id, kind: 'curso', status: 'estudando', progress: 0, order: 0, ...p })
const event = (id: string, p: Partial<CalendarEvent>): CalendarEvent => ({ id, createdAt: AT, updatedAt: AT, sourceId: 'local', title: id, date: D, allDay: false, ...p })
const radar = (id: string, notes: string, date = D): StudyItem =>
  item(id, { kind: 'newsletter', reference: true, status: 'finalizado', notes, finishedAt: date, tags: [RADAR_TAG], source: 'ChatGPT · newsletter de vagas' })

const NEWSLETTER = `Vagas da semana

- Senior PM · fintech B2B SaaS — inglês fluente, SQL, experimentação A/B
- Group PM IA — LLM, agentes de IA, RAG, stakeholders
- PM Growth — SQL e analytics, OKR, inglês avançado

Tendência: IA generativa em todo lugar.`

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
})
afterEach(() => detachStorage())

describe('Estudos hub · se quiser estudar agora', () => {
  it('top option and alternatives come from the engine; WHEN is the next real window (rounded up to 5 min)', () => {
    actions.replaceDB(baseDB({ studyItems: [item('pm', { title: 'Curso de Product Discovery', domain: 'produto_negocios', nextContent: 'módulo 3' })] }))
    const db = getDB()
    const now = 18 * 60 + 7
    const s = studyNow(db, D, now)
    const { ctx } = dayContextFor(db, D, now)
    const opts = studyOptions(db, ctx)
    expect(s.top?.key).toBe(opts[0].key)
    expect(s.alternatives.map((o) => o.key)).toEqual(opts.slice(1, 3).map((o) => o.key))
    const w = dayCapacity(db, D, now, ctx.energy).windows.find((x) => hmToMinutes(x.end) - Math.ceil(hmToMinutes(x.start) / 5) * 5 >= opts[0].minMin)!
    const start = Math.ceil(hmToMinutes(w.start) / 5) * 5
    expect(start).toBeGreaterThanOrEqual(now)
    expect(s.when).toEqual({ kind: 'hoje', start: minutesToHM(start), freeMin: hmToMinutes(w.end) - start, minutes: Math.min(opts[0].maxMin, hmToMinutes(w.end) - start) })
  })

  it('a meeting now pushes WHEN after it (+ buffer); no window left → "amanhã", never an invented time', () => {
    actions.replaceDB(baseDB({ events: [event('m', { title: 'Reunião', startTime: '18:00', endTime: '19:00' })] }))
    const s = studyNow(getDB(), D, 18 * 60 + 7)
    expect(s.when).toMatchObject({ kind: 'hoje', start: '19:10' })
    const late = studyNow(getDB(), D, 22 * 60 + 50)
    if (late.top) expect(late.when).toEqual({ kind: 'amanha' })
  })

  it('"Pôr no meu dia" writes ONE planned block of hers in the check-in; Desfazer removes it', () => {
    actions.replaceDB(baseDB())
    const s = studyNow(getDB(), D, 18 * 60)
    expect(s.top).toBeTruthy()
    expect(s.when?.kind).toBe('hoje')
    const when = s.when as Extract<typeof s.when, { kind: 'hoje' }>
    const r = putInDay(D, s.top!, when)
    const blocks = getDB().dayCheckins.find((c) => c.date === D)!.blocks!
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ key: s.top!.key, start: when.start, end: minutesToHM(hmToMinutes(when.start) + when.minutes), status: 'planejado', by: 'marina' })
    // reopening the hub: it says it is already on her day (no second block offered)
    expect(studyNow(getDB(), D, 18 * 60).when).toMatchObject({ kind: 'no_dia', start: when.start })
    r.undo!()
    expect(getDB().dayCheckins.find((c) => c.date === D)?.blocks ?? []).toHaveLength(0)
  })

  it('rest is advised gently on very low energy, and options are still shown', () => {
    actions.replaceDB({ ...baseDB(), dayCheckins: [{ id: 'c', createdAt: AT, updatedAt: AT, date: D, changes: [], energy: 1 }] } as never)
    const s = studyNow(getDB(), D, 18 * 60)
    expect(s.rest).toBe(true)
    expect(s.top).toBeTruthy()
  })

  it('"Começar" goes to the review for flashcards and to the English Coach for English', () => {
    expect(startRoute({ key: 'study:review', domain: 'idiomas', open: { kind: 'route', to: '/estudos/aprendizagem?v=revisar' } })).toBe('/estudos/aprendizagem?v=revisar')
    expect(startRoute({ key: `study:lang:${TRACK_EN}`, domain: 'idiomas', trackId: TRACK_EN, open: { kind: 'study', id: TRACK_EN } })).toBe('/estudos/aprendizagem?v=ingles')
  })
})

describe('Estudos hub · agentes', () => {
  it('real status only: due cards and last session for English; "sem evidência ainda" otherwise', () => {
    const db = baseDB({
      studySessions: [sess('s', { date: '2026-11-08', trackId: TRACK_EN })],
      learningErrors: [card('c1', { trackId: TRACK_EN, domain: 'idiomas', nextReview: D })],
    })
    const agents = studyAgents(db, D)
    const en = agents.find((a) => a.key === 'ingles')!
    expect(en.to).toBe('/estudos/aprendizagem?v=ingles')
    expect(en.lines.join(' ')).toMatch(/última sessão 08\/11/)
    expect(en.lines.join(' ')).toMatch(/1 cartão para revisar hoje/)
    expect(agents.find((a) => a.key === 'ia_produto')!.lines).toEqual(['sem evidência ainda'])
    expect(agents.find((a) => a.key === 'carreira')!.lines).toEqual(['nenhuma newsletter ainda'])
    expect(agents.some((a) => a.key === 'pos')).toBe(false) // no Pós track in this data → no card
  })
})

describe('Radar de vagas', () => {
  it('extracts skills deterministically, once per vaga (item)', () => {
    const c = extractSkills(NEWSLETTER)
    expect(c.sql).toBe(2)
    expect(c.ingles).toBe(2)
    expect(c.fintech).toBe(1)
    expect(c.b2b_saas).toBe(1)
    expect(c.experimentacao).toBe(1)
    expect(c.agentes_ia).toBe(1)
    expect(c.rag).toBe(1)
    expect(c.llm).toBe(2)
    expect(c.okr).toBe(1)
    expect(c.metricas).toBe(1)
    expect(c.figma).toBeUndefined()
  })

  it('identical pastes are stored and counted once', () => {
    actions.replaceDB(baseDB())
    expect(addNewsletter(NEWSLETTER, D).status).toBe('added')
    expect(addNewsletter(`  ${NEWSLETTER.toUpperCase()}  `, '2026-11-11').status).toBe('duplicate')
    expect(getDB().studyItems.filter((i) => i.tags?.includes(RADAR_TAG))).toHaveLength(1)
    // even if two identical records got in (e.g. imported by hand), they count once
    actions.replaceDB(baseDB({ studyItems: [radar('a', NEWSLETTER), radar('b', NEWSLETTER, '2026-11-01')] }))
    expect(skillCounts(getDB()).find((s) => s.id === 'sql')!.count).toBe(2)
    expect(pasteHash('A  b\nc')).toBe(pasteHash('a b c'))
  })

  it('hot skills: top 8 with count and last seen', () => {
    const db = baseDB({ studyItems: [radar('a', NEWSLETTER, '2026-11-03'), radar('b', '- PM com SQL e Figma', '2026-11-09')] })
    const hot = hotSkills(db)
    expect(hot.length).toBeLessThanOrEqual(8)
    expect(hot[0]).toMatchObject({ id: 'sql', count: 3, lastSeen: '2026-11-09' })
  })

  it('boost re-ranks existing options with an explicit reason, never invents one', () => {
    const ctx: DayContext = { date: D, freeMin: 45, energy: 3, now: '18:00' }
    const items = [item('sql', { title: 'Curso de SQL para PMs', domain: 'tecnologia' }), item('hist', { title: 'História da arte', domain: 'outros' })]
    const plain = studyOptions(baseDB({ studyItems: items }), ctx).map((o) => o.key)
    const boosted = studyOptions(baseDB({ studyItems: [...items, radar('n', NEWSLETTER)] }), ctx)
    expect(new Set(boosted.map((o) => o.key))).toEqual(new Set(plain))
    const sql = boosted.find((o) => o.key === 'study:item:sql')!
    expect(sql.reasons.join(' ')).toMatch(/Aparece em 2 vagas das newsletters \(SQL\)/)
    expect(boosted.find((o) => o.key === 'study:item:hist')!.reasons.join(' ')).not.toMatch(/newsletters/)
    expect(boosted.findIndex((o) => o.key === 'study:item:sql')).toBeLessThan(boosted.findIndex((o) => o.key === 'study:item:hist'))
    // the bonus is modest
    expect(Math.max(...Object.values(marketBoost(baseDB({ studyItems: [radar('n', NEWSLETTER)] }))))).toBeLessThanOrEqual(10)
    expect(applyMarketBoost(baseDB(), [])).toEqual([])
  })

  it('gaps: hot skills with no material of hers; no task is created', () => {
    const db = baseDB({ studyItems: [item('sql', { title: 'Curso de SQL' }), radar('n', NEWSLETTER)] })
    const gaps = marketGaps(db).map((g) => g.id)
    expect(gaps).not.toContain('sql')
    expect(gaps).not.toContain('ingles') // the English track is material
    expect(gaps).toContain('llm')
    expect(db.tasks).toHaveLength(0)
  })
})
