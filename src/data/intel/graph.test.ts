import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { buildSeed } from '../seed'
import { dayTimeline, findEntry } from '../timeline'
import { contextWorkouts, dayTrainingContext } from '../fuel'
import { workMode } from '../planning'
import { prepChecklistFor, presencialKit } from '../mealprep'
import { planChange, resolveWorkout } from './graph'
import { activityChange, matchActivity, sportGroup } from './strava'
import type { Now } from './types'

const FRIDAY = '2026-10-02'
const SUNDAY = '2026-10-04'
const now = (date: string, h: number, m = 0): Now => ({ date, minutes: h * 60 + m, iso: new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`).toISOString() })
const longRun = () => getDB().workouts.find((w) => w.date === FRIDAY)!
const ride = () => getDB().workouts.find((w) => w.date === SUNDAY)!
const meal = (date: string, name: string) => dayTimeline(getDB(), date).find((e) => e.kind === 'meal' && e.title === name)

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(FRIDAY))
})

describe('ActionGraph · setDuration ("domingo o pedal passou pra 4h")', () => {
  it('changes the ride, moves the pós meal after the new end, re-reads the strategy; one undo', () => {
    const before = getDB()
    const plan = planChange(before, { kind: 'setDuration', date: SUNDAY, ref: { type: 'workout', id: ride().id }, durationMin: 240 }, now('2026-10-03', 20))
    expect(plan.sensitive).toBe(false)
    expect(plan.lines[0]).toEqual({ text: 'Pedal longo de amanhã: 2h → 4h (06:00–10:00)', provenance: 'user' })
    expect(plan.lines.some((l) => l.text.startsWith('Comida acompanha o novo fim: Café da manhã (pós-treino) 08:00 → 10:00'))).toBe(true)
    expect(plan.lines.some((l) => l.text.startsWith('Intra:') && l.provenance === 'fact')).toBe(true)
    expect(plan.lines.some((l) => l.provenance === 'suggestion')).toBe(true)
    expect(getDB()).toBe(before) // preview only

    const undo = plan.apply()
    expect(ride().plannedDurationMin).toBe(240)
    const w = findEntry(dayTimeline(getDB(), SUNDAY), { type: 'workout', id: ride().id })!
    expect([w.start, w.end]).toEqual(['06:00', '10:00'])
    expect(meal(SUNDAY, 'Café da manhã (pós-treino)')?.start).toBe('10:00')
    expect(meal(SUNDAY, 'Pré-treino')?.start).toBe('05:00')
    const events = getDB().lifeLog
    const root = events.find((e) => !e.causedBy)!
    expect(root).toMatchObject({ kind: 'changed', by: 'lumos', provenance: 'user', title: 'Pedal longo de domingo passou pra 4h' })
    expect(events.filter((e) => e.causedBy === root.id).length).toBeGreaterThan(0)

    undo()
    expect(ride().plannedDurationMin).toBe(120)
    expect(meal(SUNDAY, 'Café da manhã (pós-treino)')?.start).toBe('08:00')
    expect(getDB().lifeLog).toEqual([])
  })

  it('a template line (no record that week) gets a per-day duration override that fuel reads too', () => {
    const nextSunday = '2026-10-11'
    const r = resolveWorkout(getDB(), nextSunday, { type: 'weekTemplate', id: 'seed:body:tpl-dom-pedal-longo' })!
    expect(r.virtual).toBe(true)
    planChange(getDB(), { kind: 'setDuration', date: nextSunday, ref: r.ref, durationMin: 240 }, now('2026-10-10', 20)).apply()
    const o = getDB().scheduleOverrides.find((x) => x.refType === 'weekTemplate' && x.date === nextSunday)
    expect(o?.durationMin).toBe(240)
    expect(contextWorkouts(getDB(), nextSunday)[0].plannedDurationMin).toBe(240)
    expect(meal(nextSunday, 'Café da manhã (pós-treino)')?.start).toBe('10:00')
  })
})

describe('ActionGraph · moveWorkout', () => {
  it('long run Fri → Sat 07:00: fuel meals follow, day types and prep re-derive', () => {
    const plan = planChange(getDB(), { kind: 'moveWorkout', date: FRIDAY, ref: { type: 'workout', id: longRun().id }, toDate: '2026-10-03', toTime: '07:00' }, now('2026-10-01', 19))
    expect(plan.lines[0].text).toBe('Corrida longa Z2: amanhã 06:00 → sábado 07:00')
    plan.apply()
    const w = getDB().workouts.find((x) => x.templateId === 'seed:body:tpl-sex-corrida-longa')!
    expect([w.date, w.time]).toEqual(['2026-10-03', '07:00'])
    expect(dayTrainingContext(getDB(), '2026-10-03').dayType).toBe('corrida_longa')
    expect(dayTrainingContext(getDB(), FRIDAY).dayType).toBe('prep_longo')
    expect(meal('2026-10-03', 'Pré-treino')?.start).toBe('06:00')
    expect(meal('2026-10-03', 'Intra-treino')?.start).toBe('07:40')
    // Intra separation moves to Friday night; grabbing it moves to Saturday before the run.
    expect(prepChecklistFor(getDB(), FRIDAY).some((p) => p.key.endsWith('separar-intra'))).toBe(true)
    expect(prepChecklistFor(getDB(), '2026-10-03').find((p) => p.key.endsWith('pegar-intra'))?.time).toBe('06:50')
  })

  it('only the fuel of THAT training moves (evening yoga does not drag breakfast)', () => {
    const plan = planChange(getDB(), { kind: 'moveWorkout', date: '2026-10-06', ref: { type: 'weekTemplate', id: 'seed:body:tpl-ter-yoga' }, toTime: '20:30' }, now('2026-10-05', 19))
    expect(plan.lines).toHaveLength(1)
    plan.apply()
    expect(findEntry(dayTimeline(getDB(), '2026-10-06'), { type: 'weekTemplate', id: 'seed:body:tpl-ter-yoga' })?.start).toBe('20:30')
    expect(meal('2026-10-06', 'Pré-treino')?.start).toBe('05:00')
  })
})

describe('ActionGraph · cancel', () => {
  it('cancels one occurrence of a recurring event + its dependent checklist + frees the slot', () => {
    const db = getDB()
    const ingles = actions.create('events', { sourceId: 'cal-local', title: 'Inglês', date: '2026-09-29', startTime: '19:00', endTime: '20:00', allDay: false, kind: 'estudo', recurrence: { kind: 'weekly', weekdays: [1] } })
    const prep = actions.create('routineItems', { routineId: db.routines[0].id, title: 'Revisar vocabulário', recurrence: { kind: 'weekly', weekdays: [1] }, order: 99, active: true, time: '18:40', durationMin: 15, dependsOn: [ingles.id] })
    const plan = planChange(getDB(), { kind: 'cancel', date: '2026-10-05', ref: { type: 'event', id: ingles.id } }, now('2026-10-04', 20))
    expect(plan.sensitive).toBe(false)
    expect(plan.lines.map((l) => l.text)).toEqual(['Inglês amanhã sai — só dessa vez', 'Sai junto: Revisar vocabulário', 'Fica livre 19:00–20:00'])
    const undo = plan.apply()
    expect(getDB().events.find((e) => e.id === ingles.id)?.exdates).toEqual(['2026-10-05'])
    const tl = dayTimeline(getDB(), '2026-10-05')
    expect(tl.some((e) => e.ref.id === ingles.id)).toBe(false)
    expect(findEntry(tl, { type: 'routineItem', id: prep.id })?.status).toBe('cancelled')
    // Next week is untouched.
    expect(dayTimeline(getDB(), '2026-10-12').some((e) => e.ref.id === ingles.id)).toBe(true)
    expect(getDB().lifeLog.find((e) => !e.causedBy)?.kind).toBe('cancelled')
    undo()
    expect(getDB().events.find((e) => e.id === ingles.id)?.exdates ?? []).toEqual([])
    expect(getDB().lifeLog).toEqual([])
  })

  it('events from an external calendar are sensitive (Lumos asks first)', () => {
    const src = actions.create('calendarSources', { provider: 'microsoft', name: 'Trabalho', syncDirection: 'read', color: 'ink', enabled: true })
    const ev = actions.create('events', { sourceId: src.id, title: 'Daily do time', date: '2026-10-05', startTime: '10:00', endTime: '10:30', allDay: false, external: { provider: 'microsoft', externalId: 'x1', syncStatus: 'synced' } })
    const plan = planChange(getDB(), { kind: 'cancel', date: '2026-10-05', ref: { type: 'event', id: ev.id } }, now('2026-10-04', 20))
    expect(plan.sensitive).toBe(true)
  })
})

describe('ActionGraph · workMode ("amanhã fiquei presencial")', () => {
  it('per-day work override: commute, kit and its checklist appear; undo removes all', () => {
    const MONDAY = '2026-10-05'
    expect(presencialKit(getDB(), MONDAY)).toBeUndefined()
    const plan = planChange(getDB(), { kind: 'workMode', date: MONDAY, mode: 'presencial' }, now(SUNDAY, 19))
    expect(plan.lines[0].text).toBe('Amanhã fica presencial')
    expect(plan.lines.some((l) => l.text === 'Deslocamento 08:00–09:00 e 18:00–19:00')).toBe(true)
    expect(plan.lines.some((l) => l.text.startsWith('Kit presencial:'))).toBe(true)
    const undo = plan.apply()
    expect(workMode(getDB(), MONDAY)).toBe('presencial')
    expect(workMode(getDB().profile, MONDAY)).toBe('remoto') // the weekly base is untouched
    expect(presencialKit(getDB(), MONDAY)).toBeDefined()
    expect(dayTimeline(getDB(), MONDAY).some((e) => e.kind === 'work' && e.title === 'Deslocamento')).toBe(true)
    expect(prepChecklistFor(getDB(), SUNDAY).some((p) => p.key.includes('bolsa-termica'))).toBe(true)
    undo()
    expect(workMode(getDB(), MONDAY)).toBe('remoto')
    expect(getDB().scheduleOverrides).toEqual([])
  })
})

describe('ActionGraph · activityDone (Strava-shaped)', () => {
  it('matches by day + modality group + duration and completes the planned workout', () => {
    expect(sportGroup('GravelRide')).toBe('bike')
    expect(sportGroup('Swim')).toBe('natacao')
    expect(matchActivity(getDB(), { date: SUNDAY, sport: 'Run', durationMin: 60, source: 'strava' })).toBeUndefined()
    const change = activityChange(getDB(), { date: SUNDAY, sport: 'Ride', startTime: '06:05', durationMin: 131, distanceKm: 62.4, source: 'strava' })!
    expect(change.workoutId).toBe(ride().id)
    const plan = planChange(getDB(), change, now(SUNDAY, 9))
    expect(plan.lines[0]).toEqual({ text: 'Pedal longo feito — 2h11 · 62,4 km (Strava)', provenance: 'integration' })
    plan.apply()
    expect(ride()).toMatchObject({ status: 'feito', durationMin: 131, distanceKm: 62.4 })
    expect(getDB().lifeLog[0]).toMatchObject({ kind: 'integration', by: 'integration', provenance: 'integration' })
  })

  it('a template-line workout gets materialized as done', () => {
    const change = activityChange(getDB(), { date: '2026-10-05', sport: 'Swim', durationMin: 58, source: 'strava' })!
    planChange(getDB(), change, now('2026-10-05', 8)).apply()
    const w = getDB().workouts.find((x) => x.date === '2026-10-05' && x.templateId === 'seed:body:tpl-seg-natacao-endurance')
    expect(w).toMatchObject({ status: 'feito', durationMin: 58 })
  })
})
