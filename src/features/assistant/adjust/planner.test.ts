import { beforeEach, describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { dayTrainingContext } from '@/data/fuel'
import { actions, getDB, useStore } from '@/data/store'
import type { DB, Workout } from '@/data/types'
import { EXAMPLE_QUESTIONS } from '../chief'
import { applyPlan, undoPlan } from './apply'
import { simulate } from './consequences'
import { historyStats, sessionDefaults } from './defaults'
import { lex } from './lexicon'
import { planAdjustment, visibleChanges } from './planner'
import type { ChangePlan } from './types'

const TODAY = '2026-10-03' // Saturday
const seed = () => buildSeed(TODAY)
const nbsp = (s: string) => s.replace(/\u00a0/g, ' ')
const plan = (db: DB, text: string, today = TODAY): ChangePlan => {
  const p = planAdjustment(db, text, today)
  expect(p, text).toBeDefined()
  return JSON.parse(nbsp(JSON.stringify(p)))
}
const PEDAL = 'seed:body:w-2026-10-04-tpl-dom-pedal-longo'

/** Seed + past surf sessions (history) — Marina usually surfs ~90 min at 07:00. */
function withSurfHistory(): DB {
  const db = seed()
  const mk = (date: string, time: string, durationMin: number): Workout => ({
    id: `surf-${date}`,
    createdAt: '',
    updatedAt: '',
    date,
    time,
    modality: 'surf',
    status: 'feito',
    durationMin,
    order: 0,
  })
  return { ...db, workouts: [...db.workouts, mk('2026-09-06', '07:00', 80), mk('2026-09-13', '07:00', 90), mk('2026-09-20', '08:00', 100), mk('2026-09-27', '07:00', 95)] }
}

describe('lexicon', () => {
  it('resolves days, times and durations in pt-BR', () => {
    const db = seed()
    expect(lex(db, 'amanhã', TODAY).days[0].date).toBe('2026-10-04')
    expect(lex(db, 'depois de amanhã', TODAY).days[0].date).toBe('2026-10-05')
    expect(lex(db, 'sábado', TODAY).days[0].date).toBe('2026-10-03')
    expect(lex(db, 'sábado que vem', TODAY).days[0].date).toBe('2026-10-10')
    expect(lex(db, 'quinta-feira', TODAY).days[0].date).toBe('2026-10-08')
    expect(lex(db, 'corrida às 7h', TODAY).time?.hm).toBe('07:00')
    expect(lex(db, 'às 7 da noite', TODAY).time?.hm).toBe('19:00')
    expect(lex(db, 'vai ser de 4h', TODAY).duration?.min).toBe(240)
    expect(lex(db, 'de 1h30', TODAY).duration?.min).toBe(90)
    expect(lex(db, '90 min', TODAY).duration?.min).toBe(90)
    expect(lex(db, 'no almoço', TODAY).period?.period).toBe('almoco')
    expect(lex(db, 'pedal', TODAY).mods[0].id).toBe('bike')
  })

  it('questions Lumos already answers are not adjustments', () => {
    const db = seed()
    for (const q of EXAMPLE_QUESTIONS) expect(planAdjustment(db, q, TODAY), q).toBeUndefined()
    expect(planAdjustment(db, 'Qual minha estratégia pra amanhã?', TODAY)).toBeUndefined()
    expect(planAdjustment(db, 'oi Lumos', TODAY)).toBeUndefined()
  })
})

describe('swap', () => {
  it('Marina’s exact sentence on the real seed: tomorrow is the long ride, so Lumos asks which one', () => {
    const p = plan(seed(), 'amanhã vou mudar meu treino de corrida longa p surf')
    expect(p.changes).toEqual([])
    expect(p.needsChoice?.question).toMatch(/Amanhã não tem corrida longa/)
    expect(p.needsChoice?.question).toMatch(/Pedal longo/)
    const labels = p.needsChoice!.options.map((o) => o.label)
    expect(labels).toEqual([expect.stringMatching(/Corrida longa.*sexta/), expect.stringMatching(/Pedal longo.*amanhã/)])
    const ride = p.needsChoice!.options[1].plan
    expect(ride.summary).toBe('Amanhã: 🚴‍♀️ Pedal longo → 🏄‍♀️ Surf')
    expect(ride.changes[0]).toMatchObject({ kind: 'update', id: PEDAL })
  })

  it('same sentence when tomorrow really has the long run (Thursday)', () => {
    const p = plan(seed(), 'amanhã vou mudar meu treino de corrida longa p surf', '2026-10-08')
    expect(p.needsChoice).toBeUndefined()
    const [c] = visibleChanges(p)
    expect(c.kind).toBe('create') // the Friday run only existed in the template
    expect(c.before?.templateId).toBe('seed:body:tpl-sex-corrida-longa')
    expect(c.after).toMatchObject({ date: '2026-10-09', modality: 'surf', time: '06:00', loadCategory: 'leve', isKeySession: false, requiresPreviousDayPrep: false, status: 'planejado' })
    expect(c.after.title).toBeUndefined()
    expect(c.after.tags).toEqual([])
    expect(p.consequences).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Hoje deixa de ser PREP/),
        'Amanhã deixa de ser dia de corrida longa → vira dia de treino leve · sem plano cadastrado para treino leve',
        'A estratégia “Corrida longa” sai do dia',
        'Nenhuma estratégia cadastrada para surf — quer cadastrar?',
      ]),
    )
    expect(p.offerStrategy).toBe(true)
  })

  it('"domingo vou trocar o pedal longo por surf" → Sunday stops being long-ride day, Saturday stops being PREP', () => {
    const db = seed()
    const p = plan(db, 'domingo vou trocar o pedal longo por surf')
    expect(p.changes).toHaveLength(1)
    const c = p.changes[0]
    expect(c).toMatchObject({ kind: 'update', id: PEDAL })
    expect(c.after).toMatchObject({ modality: 'surf', time: '06:00', isKeySession: false, isLongSession: false, requiresIntraWorkout: false, loadCategory: 'leve' })
    expect(c.after.plannedDurationMin).toBeUndefined()
    expect(c.sources).toEqual(['mantive o horário de antes (06:00, pedal longo)'])
    const after = simulate(db, p.changes)
    expect(dayTrainingContext(db, '2026-10-04').dayType).toBe('pedal_longo')
    expect(dayTrainingContext(after, '2026-10-04').dayType).not.toBe('pedal_longo')
    expect(dayTrainingContext(db, '2026-10-03').dayType).toBe('prep_longo')
    expect(dayTrainingContext(after, '2026-10-03').dayType).not.toBe('prep_longo')
    expect(p.consequences).toEqual(
      expect.arrayContaining([
        'Hoje deixa de ser PREP → dia de descanso · sem plano cadastrado para descanso',
        'Amanhã deixa de ser dia de pedal longo → vira dia de treino leve · sem plano cadastrado para treino leve',
        'A estratégia “Pedal longo” sai do dia',
      ]),
    )
  })

  it('history first: duration (median) and usual time come from past sessions, and it says so', () => {
    const db = withSurfHistory()
    expect(historyStats(db, 'surf', TODAY)).toMatchObject({ sessions: 4, durationMin: 93, time: '07:00' })
    const p = plan(db, 'domingo vou trocar o pedal longo por surf')
    expect(p.changes[0].after).toMatchObject({ modality: 'surf', time: '07:00', plannedDurationMin: 93 })
    expect(p.changes[0].sources).toEqual(['duração pelo seu histórico: ~93 min nas últimas 4 sessões', 'horário pelo seu histórico: costuma ser 07:00'])
  })

  it('template is the fallback when there is no history; key flags only from that weekday’s key line', () => {
    const db = seed()
    const tue = sessionDefaults(db, TODAY, { modality: 'yoga', date: '2026-10-05', wantLong: false })
    expect(tue.fields).toMatchObject({ time: '19:00', loadCategory: 'leve', isKeySession: false })
    expect(tue.sources).toContain('horário do seu template: 19:00')
    const fri = sessionDefaults(db, TODAY, { modality: 'corrida', date: '2026-10-09', wantLong: true })
    expect(fri.fields).toMatchObject({ isKeySession: true, requiresPreviousDayPrep: true, plannedDurationMin: 60 })
    const thu = sessionDefaults(db, TODAY, { modality: 'corrida', date: '2026-10-08', wantLong: false, period: 'almoco' })
    expect(thu.fields).toMatchObject({ isKeySession: false, period: 'almoco', loadCategory: 'moderada' })
  })

  it('"hoje em vez de natação vou de yoga" swaps a template session and keeps nothing hidden', () => {
    const p = plan(seed(), 'hoje em vez de natação vou de yoga', '2026-10-05')
    expect(p.summary).toBe('Hoje: 🏊‍♀️ Natação endurance → 🧘‍♀️ Yoga')
    expect(visibleChanges(p)[0].after).toMatchObject({ modality: 'yoga', date: '2026-10-05', time: '19:00' })
  })
})

describe('move', () => {
  it('moving the long run to Saturday moves PREP with it (Thu no longer, Fri becomes PREP)', () => {
    const p = plan(seed(), 'passa a corrida longa pra sábado', '2026-10-05')
    expect(p.summary).toBe('🏃‍♀️ Corrida longa Z2: sexta → sábado')
    const [c] = visibleChanges(p)
    expect(c.after).toMatchObject({ date: '2026-10-10', modality: 'corrida', isKeySession: true, templateId: 'seed:body:tpl-sex-corrida-longa' })
    expect(p.consequences).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Quinta deixa de ser PREP/),
        expect.stringMatching(/^Sexta vira PREP \(véspera de corrida longa z2\) · plano do nutri: “Quinta”/),
        expect.stringMatching(/^Sábado deixa de ser PREP → dia de corrida longa · plano do nutri: “Sexta”/),
        'A estratégia “Corrida longa” vai junto pra sábado',
      ]),
    )
  })

  it('"passa o pedal longo pro sábado" updates the real record', () => {
    const p = plan(seed(), 'passa o pedal longo pro sábado')
    expect(p.changes).toHaveLength(1)
    expect(p.changes[0]).toMatchObject({ kind: 'update', id: PEDAL, after: { date: '2026-10-03', isKeySession: true } })
  })

  it('two changes in one sentence share the day: "vou nadar cedo e fazer perna à noite"', () => {
    const p = plan(seed(), 'vou nadar cedo e fazer perna à noite')
    const vis = visibleChanges(p)
    expect(vis).toHaveLength(2)
    expect(vis[0].after).toMatchObject({ modality: 'natacao', date: '2026-10-07', time: '06:00' })
    expect(vis[1].before?.title).toMatch(/Pernas/)
    expect(vis[1].after).toMatchObject({ date: '2026-10-07', period: 'noite', isKeySession: true })
    expect(vis[1].after.time).toBeUndefined()
  })
})

describe('skip, duration, time, add', () => {
  it('"hoje não vou treinar" → every session of the day is pulado (never deleted)', () => {
    const p = plan(seed(), 'hoje não vou treinar', '2026-10-06')
    expect(p.changes.map((c) => c.after.status)).toEqual(['pulado', 'pulado'])
    expect(p.changes.every((c) => c.kind !== 'remove')).toBe(true)
    expect(p.summary).toMatch(/ficam de fora \(pulado\)/)
    expect(JSON.stringify(p)).not.toMatch(/falhou/)
    expect(plan(seed(), 'hoje não vou treinar').summary).toMatch(/livre no plano/)
  })

  it('"vou pular a natação de amanhã" picks tomorrow’s swim', () => {
    const p = plan(seed(), 'vou pular a natação de amanhã', '2026-10-04')
    expect(p.needsChoice).toBeUndefined()
    expect(visibleChanges(p)[0].after).toMatchObject({ modality: 'natacao', date: '2026-10-05', status: 'pulado' })
  })

  it('ambiguity → a choice question with one ready plan per option', () => {
    const p = plan(seed(), 'vou pular a natação')
    expect(p.changes).toEqual([])
    expect(p.needsChoice?.question).toBe('Qual natação você quer pular?')
    expect(p.needsChoice?.options).toHaveLength(2)
    expect(p.needsChoice?.options.map((o) => o.plan.changes.find((c) => !c.implicit)!.after.date)).toEqual(['2026-10-05', '2026-10-08'])
  })

  it('"o pedal de domingo vai ser de 4h" → duration update + review note', () => {
    const p = plan(seed(), 'o pedal de domingo vai ser de 4h')
    expect(p.changes[0]).toMatchObject({ kind: 'update', id: PEDAL, after: { plannedDurationMin: 240, strategyReviewedAtMin: 120 } })
    expect(p.consequences).toContain('A duração mudou bastante — vale revisar a estratégia nutricional')
  })

  it('"corrida às 7h" retimes the next run', () => {
    const p = plan(seed(), 'corrida às 7h')
    expect(visibleChanges(p)[0].after).toMatchObject({ modality: 'corrida', date: '2026-10-09', time: '07:00' })
  })

  it('"quinta quero correr no almoço" adds a run and keeps Thursday’s template swim', () => {
    const p = plan(seed(), 'quinta quero correr no almoço')
    const vis = visibleChanges(p)
    expect(vis).toHaveLength(1)
    expect(vis[0]).toMatchObject({ kind: 'create', after: { modality: 'corrida', date: '2026-10-08', period: 'almoco', isKeySession: false } })
    const implicit = p.changes.filter((c) => c.implicit)
    expect(implicit.map((c) => c.after.modality)).toEqual(['natacao'])
    expect(dayTrainingContext(simulate(seed(), p.changes), '2026-10-08').workouts.map((w) => w.modality).sort()).toEqual(['corrida', 'natacao'])
  })

  it('"sábado vou no circo" adds circo today, answering the flexible Saturday line', () => {
    const p = plan(seed(), 'sábado vou no circo')
    expect(p.changes[0].after).toMatchObject({ modality: 'circo', date: TODAY, templateId: 'seed:body:tpl-sab-flex', loadCategory: 'leve' })
  })

  it('warnings come from conflictsOn on the simulated plan', () => {
    const p = plan(seed(), 'hoje em vez de natação vou de yoga', '2026-10-05')
    expect(p.warnings.length).toBeGreaterThan(0)
    expect(p.warnings.every((w) => w.refs.some((r) => p.changes.some((c) => c.after.id === r.id)))).toBe(true)
  })
})

describe('apply / undo', () => {
  beforeEach(() => useStore.setState({ db: seed(), hydrated: true }))

  it('applies via actions, never deletes, and undo restores exactly', () => {
    const before = structuredClone(getDB().workouts)
    const p = plan(getDB(), 'domingo vou trocar o pedal longo por surf')
    const snap = applyPlan(p)
    const w = getDB().workouts.find((x) => x.id === PEDAL)!
    expect(w).toMatchObject({ modality: 'surf', isKeySession: false })
    expect(getDB().workouts).toHaveLength(before.length)
    undoPlan(snap)
    expect(getDB().workouts).toEqual(before)
  })

  it('undo also takes out records the plan created (template sessions + new ones)', () => {
    const before = structuredClone(getDB().workouts)
    const p = plan(getDB(), 'quinta quero correr no almoço')
    const snap = applyPlan(p)
    expect(getDB().workouts.length).toBe(before.length + 2)
    undoPlan(snap)
    expect(getDB().workouts).toEqual(before)
  })

  it('a "remove" change is written as pulado', () => {
    const p = plan(getDB(), 'domingo vou trocar o pedal longo por surf')
    applyPlan({ ...p, changes: [{ ...p.changes[0], kind: 'remove' }] })
    expect(getDB().workouts.find((x) => x.id === PEDAL)?.status).toBe('pulado')
    actions.update('workouts', PEDAL, { status: 'planejado' })
  })
})
