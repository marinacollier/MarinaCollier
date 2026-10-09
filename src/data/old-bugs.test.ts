/**
 * Old bugs, re-tested on purpose against her REAL seed (not fixtures): passing new tests elsewhere
 * doesn't prove these stayed fixed.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { buildSeed } from './seed'
import { actions, getDB, useStore } from './store'
import { conflictsOn, proposeWeekFromTemplate } from './planning'
import { workoutForPhase } from './fuel'
import { dayTimeline } from './timeline'
import { addDays } from '@/lib/date'
import { useUI } from '@/app/ui-store'
import { openEntryFlow } from '@/features/today/timeline/actions'
import { understand } from '@/features/assistant/router'
import { applyPlan } from '@/features/assistant/adjust/apply'
import type { Workout } from './types'

const MON = '2026-10-12'
const TUE = addDays(MON, 1)
const add = (date: string, modality: string, extra: Partial<Workout> = {}) =>
  actions.create('workouts', { date, modality, status: 'planejado', order: 9, ...extra })
const checkin = (date: string) => conflictsOn(getDB(), date).filter((c) => c.kind === 'checkin_limit')

beforeEach(() => useStore.setState({ db: buildSeed(MON), hydrated: true }))

describe('TotalPass check-in (her seed: natação + yoga share the pass)', () => {
  const D = addDays(MON, 5) // Saturday: no training in her base week
  it('yoga without TotalPass → no conflict', () => {
    add(D, 'yoga', { time: '18:00', usesCheckin: false })
    expect(checkin(D)).toEqual([])
  })
  it('natação TotalPass + yoga without TotalPass → no conflict', () => {
    add(D, 'natacao', { time: '07:00' })
    add(D, 'yoga', { time: '18:00', usesCheckin: false })
    expect(checkin(D)).toEqual([])
  })
  it('natação TotalPass + musculação TotalPass → conflict', () => {
    add(D, 'natacao', { time: '07:00' })
    add(D, 'musculacao', { time: '18:00', usesCheckin: true })
    expect(checkin(D)).toHaveLength(1)
  })
  it('natação + yoga both by the pass (the default rule) → conflict', () => {
    add(D, 'natacao', { time: '07:00' })
    add(D, 'yoga', { time: '18:00' })
    expect(checkin(D)).toHaveLength(1)
  })
})

describe('two workouts on the same day', () => {
  it('are not a warning by themselves (her Tuesday: musculação 06:00 + yoga 19:00)', () => {
    const tue = getDB().workouts.filter((w) => w.date === TUE)
    expect(tue.map((w) => w.modality).sort()).toEqual(['musculacao', 'yoga'])
    expect(conflictsOn(getDB(), TUE).filter((c) => c.kind === 'checkin_limit' || c.kind === 'overlap')).toEqual([])
  })
  it('only a real clash warns (same hour)', () => {
    add(TUE, 'corrida', { time: '19:00', plannedDurationMin: 45 })
    expect(conflictsOn(getDB(), TUE).some((c) => c.kind === 'overlap')).toBe(true)
  })
})

describe('moving a workout Mon → Tue', () => {
  it('leaves Monday, lands on Tuesday, base template untouched, base never brings it back', () => {
    const template = structuredClone(getDB().weekTemplate)
    const swim = getDB().workouts.find((w) => w.date === MON && w.modality === 'natacao')!
    const turn = understand(getDB(), 'passa minha natação de segunda pra terça', MON, 5 * 60)
    expect(turn.kind).toBe('adjust')
    if (turn.kind !== 'adjust') return
    applyPlan(turn.plan)
    const db = getDB()
    expect(db.workouts.filter((w) => w.date === MON && w.modality === 'natacao' && w.status !== 'pulado')).toHaveLength(0)
    expect(db.workouts.some((w) => w.date === TUE && w.modality === 'natacao' && w.status === 'planejado')).toBe(true)
    expect(db.weekTemplate).toEqual(template)
    expect(proposeWeekFromTemplate(db, MON).some((p) => p.date === MON && p.workout?.modality === 'natacao')).toBe(false)
    expect(dayTimeline(db, MON).some((e) => e.kind === 'workout' && e.title.toLowerCase().includes('natação'))).toBe(false)
    expect(swim.id).toBeTruthy()
  })
})

describe('Yoga already in the week is not offered again by "trazer da base"', () => {
  it('materialized yoga (even moved to Thursday) is not proposed again', () => {
    const yoga = getDB().workouts.find((w) => w.date === TUE && w.modality === 'yoga')!
    actions.update('workouts', yoga.id, { date: addDays(MON, 3) })
    expect(proposeWeekFromTemplate(getDB(), MON).some((p) => p.workout?.modality === 'yoga')).toBe(false)
  })
  it('a yoga she added by hand that week also covers the base line', () => {
    const db = getDB()
    useStore.setState({ db: { ...db, workouts: db.workouts.filter((w) => w.modality !== 'yoga') } })
    expect(proposeWeekFromTemplate(getDB(), MON).some((p) => p.workout?.modality === 'yoga')).toBe(true)
    add(addDays(MON, 4), 'yoga', { time: '18:00', status: 'feito' })
    expect(proposeWeekFromTemplate(getDB(), MON).some((p) => p.workout?.modality === 'yoga')).toBe(false)
  })
})

describe('workout identity — never by index or list position', () => {
  it('each timeline card opens its own workout', () => {
    for (const e of dayTimeline(getDB(), TUE).filter((x) => x.ref.type === 'workout')) {
      useUI.setState({ sheets: [] })
      openEntryFlow(e, MON)
      const top = useUI.getState().sheets.at(-1) as { name: string; props: { id: string } }
      const w = getDB().workouts.find((x) => x.id === top.props.id)!
      // The card that says Yoga opens the yoga record; the one that says Upper opens the musculação.
      expect(w.title ?? w.modality).toBe(getDB().workouts.find((x) => x.id === e.ref.id)!.title ?? w.modality)
      expect(top.props.id).toBe(e.ref.id)
    }
  })
  it('fuel around a training belongs to the session by time (pré-yoga is not the 06:00 musculação)', () => {
    const tue = getDB().workouts.filter((w) => w.date === TUE)
    const yoga = tue.find((w) => w.modality === 'yoga')!
    const gym = tue.find((w) => w.modality === 'musculacao')!
    expect(workoutForPhase(getDB(), TUE, 'pre', '18:00')?.id).toBe(yoga.id)
    expect(workoutForPhase(getDB(), TUE, 'pre', '05:30')?.id).toBe(gym.id)
    expect(workoutForPhase(getDB(), TUE, 'pos', '07:30')?.id).toBe(gym.id)
  })
})
