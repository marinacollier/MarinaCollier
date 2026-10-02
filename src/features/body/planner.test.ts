import { beforeEach, describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import type { DB, Workout } from '@/data/types'
import { createSeedContext } from '@/data/seed/context'
import { seedProfile } from '@/data/seed/profile'
import { SEED_IDS } from '@/data/seed/ids'
import { dayTrainingContext } from '@/data/fuel'
import { actions, getDB, useStore } from '@/data/store'
import { addDays, startOfWeek, weekday } from '@/lib/date'
import { seedBody, seedCurrentWeekWorkouts, seedWeekTemplate } from './seed'
import {
  draftConflicts,
  goalNudges,
  goalsThatLeft,
  materializeWeek,
  nudgeMessage,
  openProposals,
  relocateSuggestion,
  weekTrainingChips,
  workoutFromChoice,
} from './planner'
import { fitGoalAt, moveWorkoutChecked, pickTemplateChoice } from './mutations'
import { SLOT_MINUTES, suggestMealLink } from './mealLink'

const TODAY = '2026-10-02' // sexta
const WS = startOfWeek(TODAY) // 2026-09-28 (seg)
const TUE = addDays(WS, 1)
const THU = addDays(WS, 3)
const SAT = addDays(WS, 5)
const SUN = addDays(WS, 6)

function seededDB(today = TODAY): DB {
  const ctx = createSeedContext(today)
  const db = emptyDB()
  const { profile, ...prof } = seedProfile(ctx)
  const body = seedBody(ctx)
  return { ...db, ...prof, ...body, profile: { ...db.profile, ...profile } } as DB
}

let n = 0
function w(p: Partial<Workout>): Workout {
  n++
  return { id: `w${n}`, createdAt: '', updatedAt: '', date: TODAY, modality: 'corrida', status: 'planejado', order: 0, ...p }
}

describe('seed: week template (training update 02/10)', () => {
  const ctx = createSeedContext(TODAY)
  const tpl = seedWeekTemplate(ctx)
  const on = (d: number) => tpl.filter((t) => t.weekday === d)

  it('has stable ids and her weekly base with the load hierarchy', () => {
    expect(new Set(tpl.map((t) => t.id)).size).toBe(tpl.length)
    expect(tpl.every((t) => t.id.startsWith('seed:body:tpl-'))).toBe(true)
    expect(seedWeekTemplate(createSeedContext('2027-01-01')).map((t) => t.id)).toEqual(tpl.map((t) => t.id))

    expect(on(1)[0]).toMatchObject({ modalities: ['natacao'], choice: 'fixed', time: '06:00', durationMin: 60, durationMaxMin: 75, loadCategory: 'moderada' })
    expect(on(1)[1]).toMatchObject({ modalities: ['musculacao'], choice: 'optional', period: 'noite', loadCategory: 'leve' })
    expect(on(2).map((t) => [t.title, t.time, t.choice, t.loadCategory])).toEqual([
      ['Upper + pliometria', '06:00', 'fixed', 'moderada'],
      ['Yoga', '19:00', 'fixed', 'leve'],
    ])
    expect(on(3)[0]).toMatchObject({ title: 'Pernas — key session', isKeySession: true, loadCategory: 'key', recoveryPriority: 'alta', requiresPreWorkout: true, requiresPostWorkout: true })
    expect(on(3)[0].tags).toEqual(['forca', 'pernas', 'key-session', 'recovery-important'])
    expect(on(4)[0]).toMatchObject({ modalities: ['natacao'], time: '06:00', durationMin: 45, durationMaxMin: 60 })
    expect(on(5)[0]).toMatchObject({ modalities: ['corrida'], isKeySession: true, isLongSession: true, requiresPreviousDayPrep: true, requiresIntraWorkout: true })
    expect(on(5)[0].tags).toContain('long-run')
    expect(on(6)[0]).toMatchObject({ choice: 'one_of', modalities: ['circo', 'surf', 'mobilidade', 'caminhada'], planType: 'flexivel' })
    expect(on(0)[0]).toMatchObject({ modalities: ['bike'], time: '06:00', durationMin: 120, durationMaxMin: 180, isKeySession: true, isLongSession: true })
    expect(on(0)[0].tags).toEqual(expect.arrayContaining(['long-ride', 'intra-workout-fuel', 'fuel-required']))
    // key sessions only where she said so
    expect(tpl.filter((t) => t.isKeySession).map((t) => t.weekday)).toEqual([3, 5, 0])
  })

  it('materializes only the current week, from today on (no past-day noise)', () => {
    const ws = seedCurrentWeekWorkouts(ctx, tpl)
    expect(ws.map((x) => [x.date, x.modality, x.time, x.isKeySession])).toEqual([
      [TODAY, 'corrida', '06:00', true],
      [SUN, 'bike', '06:00', true],
    ])
    expect(ws[0]).toMatchObject({ title: 'Corrida longa Z2', plannedDurationMin: 60, plannedDurationMaxMin: 75, requiresPreviousDayPrep: true })
    expect(ws.every((x) => x.id.startsWith('seed:body:w-'))).toBe(true)
    const monday = seedCurrentWeekWorkouts(createSeedContext(WS), tpl, WS)
    expect(monday.map((x) => weekday(x.date))).toEqual([1, 2, 2, 3, 4, 5, 0])
  })

  it('goals: yoga 1x/semana (lives on Tuesday), circo never an obligation, no invented diet', () => {
    const out = seedBody(ctx)
    expect(out.workoutGoals!.find((g) => g.modality === 'yoga')).toMatchObject({ title: 'Yoga — 1x/semana', kind: 'habit', perWeek: 1, preferredWeekdays: [2] })
    expect(out.workoutGoals!.find((g) => g.modality === 'circo')).toMatchObject({ obligation: false, preferredWeekdays: [6] })
    expect(out.workoutGoals!.some((g) => g.tripId === SEED_IDS.tripAfrica)).toBe(false)
    expect(out.mealTemplates).toEqual([])
  })
})

describe('planner', () => {
  it('open choices only from today: Saturday stays a choice, nothing auto-filled', () => {
    const db = seededDB()
    const open = openProposals(db, WS, TODAY)
    expect(open[TUE]).toEqual([]) // past
    expect(open[TODAY]).toEqual([])
    expect(open[SAT].map((p) => p.choice)).toEqual(['one_of'])
    expect(open[SUN]).toEqual([])
    expect(materializeWeek(db, WS, TODAY)).toEqual([])
    expect(materializeWeek(db, addDays(WS, 7), TODAY)).toHaveLength(7)
  })

  it('picking options: one_of → flexível without the line title; optional keeps its title/period', () => {
    const db = seededDB()
    const sat = db.weekTemplate.find((x) => x.weekday === 6)!
    expect(workoutFromChoice(db, sat, SAT, 'surf')).toMatchObject({ modality: 'surf', planType: 'flexivel', templateId: sat.id, title: undefined, loadCategory: 'leve' })
    expect(workoutFromChoice(db, sat, SAT)).toMatchObject({ status: 'descanso', templateId: sat.id })
    const opt = db.weekTemplate.find((x) => x.weekday === 1 && x.choice === 'optional')!
    expect(workoutFromChoice(db, opt, WS, 'musculacao')).toMatchObject({ title: 'Upper / Core leve', period: 'noite', loadCategory: 'leve' })
  })

  it('summary chips list every group and a plain line, no score', () => {
    const base = seededDB()
    const db = { ...base, workouts: [...base.workouts, w({ date: THU, modality: 'yoga' }), w({ date: WS, modality: 'corrida', status: 'feito' })] }
    const s = weekTrainingChips(db, WS)
    expect(s.chips.map((c) => c.label)).toEqual(['Corrida', 'Natação', 'Bike', 'Força', 'Mobilidade / Yoga', 'Fun / Outros', 'OFF'])
    expect(s.line).toBe('Esta semana: 2 corridas · 1 bike · 1 mobilidade/yoga')
    expect(s.line).not.toMatch(/%/)
  })

  it('PREP: the day before a training that needs prep (context follows the training)', () => {
    const db = seededDB()
    expect(dayTrainingContext(db, SAT).prepFor?.modality).toBe('bike')
    const moved = { ...db, workouts: db.workouts.map((x) => (x.modality === 'bike' ? { ...x, date: SAT } : x)) }
    expect(dayTrainingContext(moved, TODAY).prepFor?.modality).toBe('bike')
    expect(dayTrainingContext(moved, SAT).prepFor).toBeUndefined()
  })

  it('draft conflicts: natação + yoga on the same day compete for the same check-in', () => {
    const db = seededDB(WS)
    const c = draftConflicts(db, { date: THU, modality: 'yoga', time: '19:00' })
    expect(c.map((x) => x.kind)).toContain('checkin_limit')
    expect(c.find((x) => x.kind === 'checkin_limit')!.message).toMatch(/mesmo check-in/)
    expect(draftConflicts(db, { date: THU, modality: 'musculacao', time: '19:00' }).map((x) => x.kind)).toEqual(['same_day_workout'])
  })
})

describe('yoga flexible + adapting week', () => {
  it('no nudge when the base week already holds yoga (even if Tuesday is past)', () => {
    expect(goalNudges(seededDB(), WS, TODAY)).toEqual([])
    expect(goalNudges(seededDB(WS), WS, WS)).toEqual([])
  })

  it('re-surfaces kindly when a change pushes yoga out of the week, respecting the check-in', () => {
    const before = seededDB(WS)
    const after: DB = { ...before, workouts: before.workouts.filter((x) => x.modality !== 'yoga') }
    const yogaGoal = before.workoutGoals.find((g) => g.modality === 'yoga')!
    expect(goalsThatLeft(before, after, WS)).toEqual([yogaGoal.id])
    const [nudge] = goalNudges(after, WS, WS, before)
    expect(nudge.left).toBe(true)
    expect(nudge.suggestions.length).toBeGreaterThan(0)
    expect(nudge.suggestions.every((s) => s.date !== WS && s.date !== THU)).toBe(true) // natação days
    expect(nudgeMessage(after, nudge)).toMatch(/^A yoga saiu da semana — quer encaixar \S+ \d\d:\d\d\?$/)
    // circo (obligation false) never nudges
    expect(goalNudges(after, WS, WS).some((x) => x.goal.modality === 'circo')).toBe(false)
  })

  it('a conflicting flexible yoga gets a relocation suggestion away from natação days', () => {
    const db = seededDB(WS)
    const yoga = w({ id: 'y', date: THU, modality: 'yoga', time: '19:00', planType: 'flexivel' })
    const s = relocateSuggestion({ ...db, workouts: [...db.workouts.filter((x) => x.modality !== 'yoga'), yoga] }, 'y', WS)
    expect(s).toBeDefined()
    expect([WS, THU]).not.toContain(s!.date)
  })
})

describe('move + conflicts flow (store)', () => {
  beforeEach(() => useStore.setState({ db: seededDB(WS), hydrated: true }))

  it('moves even when it conflicts, then reports it; acks hide it', () => {
    const yoga = getDB().workouts.find((x) => x.modality === 'yoga')!
    const conflicts = moveWorkoutChecked(yoga.id, THU)!
    expect(getDB().workouts.find((x) => x.id === yoga.id)!.date).toBe(THU) // never blocked
    const limit = conflicts.find((c) => c.kind === 'checkin_limit')!
    expect(limit).toBeDefined()
    actions.create('conflictAcks', { key: limit.key, decision: 'manter', date: THU })
    expect(moveWorkoutChecked(yoga.id, TUE)!.map((c) => c.kind)).toEqual(['same_day_workout']) // info only
    expect(moveWorkoutChecked(yoga.id, TUE)).toBeNull()
  })

  it('picking a choice and fitting a goal suggestion create real workouts', () => {
    const t = getDB().weekTemplate.find((x) => x.weekday === 6)!
    expect(pickTemplateChoice(t.id, SAT, 'surf')).toMatchObject({ modality: 'surf', planType: 'flexivel', templateId: t.id })
    expect(openProposals(getDB(), WS, WS)[SAT]).toEqual([])
    const yoga = getDB().workouts.find((x) => x.modality === 'yoga')!
    actions.remove('workouts', yoga.id)
    const [nudge] = goalNudges(getDB(), WS, WS)
    const y = fitGoalAt(nudge.goal, nudge.suggestions[0])
    expect(y).toMatchObject({ modality: 'yoga', planType: 'flexivel', workoutGoalId: nudge.goal.id })
    expect(goalNudges(getDB(), WS, WS)).toEqual([])
  })
})

describe('meal ↔ training link', () => {
  it('suggests pós/pré purposes from times and the day-before prep', () => {
    const db = seededDB()
    expect(suggestMealLink(db, TODAY, SLOT_MINUTES.cafe)).toMatchObject({ purpose: 'post_long_run' })
    expect(suggestMealLink(db, TODAY, 5 * 60)).toMatchObject({ purpose: 'pre_long_run' })
    const dinner = suggestMealLink(db, SAT, SLOT_MINUTES.jantar)
    expect(dinner?.purpose).toBe('pre_long_ride')
    expect(dinner?.workout.date).toBe(SUN)
    expect(suggestMealLink(db, SAT, SLOT_MINUTES.almoco)).toBeUndefined()
  })
})
