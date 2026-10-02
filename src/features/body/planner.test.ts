import { beforeEach, describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import type { DB, Workout } from '@/data/types'
import { createSeedContext } from '@/data/seed/context'
import { seedProfile } from '@/data/seed/profile'
import { SEED_IDS } from '@/data/seed/ids'
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

const TODAY = '2026-10-02' // sexta
const WS = startOfWeek(TODAY) // 2026-09-28 (seg)
const SAT = addDays(WS, 5)
const SUN = addDays(WS, 6)
const THU = addDays(WS, 3)

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

describe('seed: week template', () => {
  const ctx = createSeedContext(TODAY)
  const tpl = seedWeekTemplate(ctx)

  it('has stable ids and her weekly base', () => {
    expect(new Set(tpl.map((t) => t.id)).size).toBe(tpl.length)
    expect(tpl.every((t) => t.id.startsWith('seed:body:tpl-'))).toBe(true)
    expect(seedWeekTemplate(createSeedContext('2027-01-01')).map((t) => t.id)).toEqual(tpl.map((t) => t.id))
    const on = (d: number) => tpl.filter((t) => t.weekday === d)
    expect(on(1).map((t) => [t.modalities[0], t.choice, t.planType])).toEqual([
      ['corrida', 'fixed', 'base'],
      ['musculacao', 'optional', 'flexivel'],
    ])
    expect(on(1)[0].period).toBeUndefined()
    expect(on(2)[0]).toMatchObject({ choice: 'one_of', modalities: ['corrida', 'musculacao'], planType: 'flexivel', notes: 'presencial — evitar pedal longo' })
    expect(on(3)[0]).toMatchObject({ modalities: ['natacao'], choice: 'fixed', time: '07:00', durationMin: 60, planType: 'base' })
    expect(on(4)[0]).toMatchObject({ choice: 'one_of', modalities: ['bike', 'corrida'], period: 'manha', planType: 'flexivel' })
    expect(on(5)[0]).toMatchObject({ modalities: ['natacao'], time: '07:00', planType: 'base' })
    expect(on(6)[0]).toMatchObject({ choice: 'one_of', title: 'Fun day', notes: 'Escolha o que combina com seu sábado.' })
    expect(on(6)[0].modalities).toEqual(['circo', 'surf', 'bike', 'corrida', 'trail', 'caminhada'])
    expect(on(0)[0]).toMatchObject({ choice: 'rest', title: 'Recovery / OFF', planType: 'base' })
  })

  it('materializes only the current week, from today on (no past-day noise)', () => {
    const ws = seedCurrentWeekWorkouts(ctx, tpl)
    expect(ws.map((x) => [x.date, x.modality, x.status, x.time, x.planType])).toEqual([
      [TODAY, 'natacao', 'planejado', '07:00', 'base'],
      [SUN, 'recuperacao', 'descanso', undefined, 'base'],
    ])
    expect(ws.every((x) => x.id.startsWith('seed:body:w-'))).toBe(true)
    // Monday seed: the whole week's fixed lines
    const monday = seedCurrentWeekWorkouts(createSeedContext(WS), tpl, WS)
    expect(monday.map((x) => weekday(x.date))).toEqual([1, 3, 5, 0])
  })

  it('goals: yoga flexible 1x/semana, circo never an obligation, no invented diet', () => {
    const out = seedBody(ctx)
    const yoga = out.workoutGoals!.find((g) => g.modality === 'yoga')!
    expect(yoga).toMatchObject({ title: 'Yoga — 1x/semana', kind: 'habit', perWeek: 1, planType: 'flexivel', preferredWeekdays: [4] })
    const circo = out.workoutGoals!.find((g) => g.modality === 'circo')!
    expect(circo).toMatchObject({ obligation: false, preferredWeekdays: [6], planType: 'flexivel' })
    expect(out.workoutGoals!.some((g) => g.tripId === SEED_IDS.tripAfrica)).toBe(false)
    expect(out.mealTemplates).toEqual([])
    expect(out.workoutGoals!.every((g) => g.id.startsWith('seed:body:'))).toBe(true)
  })
})

describe('planner', () => {
  it('shows open choices only from today: Saturday fun day stays a choice, Sunday already OFF', () => {
    const db = seededDB()
    const open = openProposals(db, WS, TODAY)
    expect(open[addDays(WS, 1)]).toEqual([]) // TER is past
    expect(open[TODAY].map((p) => p.choice)).toEqual(['optional']) // musculação possível
    expect(open[SAT].map((p) => p.choice)).toEqual(['one_of'])
    expect(open[SUN]).toEqual([])
    expect(materializeWeek(db, WS, TODAY)).toEqual([])
    // next week: the whole base is waiting
    expect(materializeWeek(db, addDays(WS, 7), TODAY).map((x) => x.modality)).toEqual(['recuperacao', 'corrida', 'natacao', 'natacao'])
  })

  it('picking a one_of option creates a flexible workout and closes the choice', () => {
    const db = seededDB()
    const t = db.weekTemplate.find((x) => x.weekday === 4)!
    const item = workoutFromChoice(db, t, THU, 'bike')
    expect(item).toMatchObject({ modality: 'bike', planType: 'flexivel', period: 'manha', templateId: t.id, status: 'planejado' })
    const rest = workoutFromChoice(db, t, THU)
    expect(rest).toMatchObject({ status: 'descanso', templateId: t.id })
  })

  it('summary chips list every group and a plain line, no score', () => {
    const db = { ...seededDB(), workouts: [...seededDB().workouts, w({ date: THU, modality: 'yoga' }), w({ date: addDays(WS, 0), modality: 'corrida', status: 'feito' })] }
    const s = weekTrainingChips(db, WS)
    expect(s.chips.map((c) => c.label)).toEqual(['Corrida', 'Natação', 'Bike', 'Força', 'Mobilidade / Yoga', 'Fun / Outros', 'OFF'])
    expect(s.line).toBe('Esta semana: 1 corrida · 1 natação · 1 mobilidade/yoga · 1 recovery')
    expect(s.line).not.toMatch(/%/)
  })

  it('draft conflicts: natação + yoga on the same day compete for the same check-in', () => {
    const db = seededDB()
    const c = draftConflicts(db, { date: TODAY, modality: 'yoga', time: '18:30' })
    expect(c.map((x) => x.kind)).toContain('checkin_limit')
    expect(c[0].message).toMatch(/mesmo check-in/)
    expect(draftConflicts(db, { date: TODAY, modality: 'corrida', time: '18:30' }).map((x) => x.kind)).toEqual(['same_day_workout'])
  })
})

describe('yoga flexible + adapting week', () => {
  it('suggests a window that respects the check-in limit (not Friday with natação)', () => {
    const db = seededDB()
    const [n] = goalNudges(db, WS, TODAY)
    expect(n.goal.modality).toBe('yoga')
    expect(n.left).toBe(false)
    expect(n.suggestions.length).toBeGreaterThan(0)
    expect(n.suggestions.every((s) => s.date !== TODAY)).toBe(true)
    expect(nudgeMessage(db, n)).toMatch(/^Yoga ainda sem lugar nesta semana — quer encaixar sábado \d\d:\d\d\?$/)
    // circo (obligation false) never nudges
    expect(goalNudges(db, WS, TODAY).some((x) => x.goal.modality === 'circo')).toBe(false)
  })

  it('re-surfaces kindly when a change pushes yoga out of the week', () => {
    const base = seededDB('2026-09-28')
    const yogaThu = w({ id: 'yoga', date: THU, modality: 'yoga', time: '07:00', planType: 'flexivel' })
    const before: DB = { ...base, workouts: [...base.workouts, yogaThu] }
    expect(goalNudges(before, WS, '2026-09-28')).toEqual([])
    const after: DB = { ...before, workouts: before.workouts.filter((x) => x.id !== 'yoga') }
    expect(goalsThatLeft(before, after, WS)).toEqual([before.workoutGoals.find((g) => g.modality === 'yoga')!.id])
    const [n] = goalNudges(after, WS, '2026-09-28', before)
    expect(n.left).toBe(true)
    expect(nudgeMessage(after, n)).toMatch(/^A yoga saiu da semana — quer encaixar /)
  })

  it('a conflicting flexible yoga gets a relocation suggestion on another day', () => {
    const db = seededDB()
    const yoga = w({ id: 'y', date: TODAY, modality: 'yoga', time: '18:00', planType: 'flexivel' })
    const s = relocateSuggestion({ ...db, workouts: [...db.workouts, yoga] }, 'y', TODAY)
    expect(s?.date).toBe(SAT)
  })
})

describe('move + conflicts flow (store)', () => {
  beforeEach(() => useStore.setState({ db: seededDB(), hydrated: true }))

  it('moves even when it conflicts, then reports it; acks hide it', () => {
    const yoga = actions.create('workouts', { date: SAT, modality: 'yoga', time: '07:00', status: 'planejado', planType: 'flexivel', order: 0 })
    const conflicts = moveWorkoutChecked(yoga.id, TODAY)!
    expect(getDB().workouts.find((x) => x.id === yoga.id)!.date).toBe(TODAY) // never blocked
    expect(conflicts.map((c) => c.kind)).toContain('checkin_limit')
    actions.create('conflictAcks', { key: conflicts[0].key, decision: 'manter', date: TODAY })
    expect(moveWorkoutChecked(yoga.id, SAT)).toEqual([])
    expect(moveWorkoutChecked(yoga.id, SAT)).toBeNull() // same day: nothing to do
  })

  it('picking a choice and fitting a goal suggestion create real workouts', () => {
    const t = getDB().weekTemplate.find((x) => x.weekday === 6)!
    const fun = pickTemplateChoice(t.id, SAT, 'surf')!
    expect(fun).toMatchObject({ modality: 'surf', planType: 'flexivel', templateId: t.id })
    expect(openProposals(getDB(), WS, TODAY)[SAT]).toEqual([])
    const goal = getDB().workoutGoals.find((g) => g.modality === 'yoga')!
    const [n] = goalNudges(getDB(), WS, TODAY)
    const y = fitGoalAt(goal, n.suggestions[0])
    expect(y).toMatchObject({ modality: 'yoga', planType: 'flexivel', workoutGoalId: goal.id, time: n.suggestions[0].start })
    expect(goalNudges(getDB(), WS, TODAY)).toEqual([])
  })
})
