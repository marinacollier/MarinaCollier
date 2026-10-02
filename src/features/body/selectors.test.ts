import { describe, expect, it } from 'vitest'
import { emptyDB, DEFAULT_MODALITIES } from '@/data/defaults'
import type { DB, Workout, WorkoutGoal } from '@/data/types'
import { createSeedContext } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import { addDays, startOfWeek } from '@/lib/date'
import {
  copyWeekPlan,
  goalProgress,
  habitsWithTags,
  movePatch,
  orderedModalities,
  patternNotes,
  slotForMinutes,
  summaryParts,
  uniqueModalityId,
  weekLabel,
  weekSummary,
} from './selectors'
import { seedBody } from './seed'

const TODAY = '2026-10-02' // sexta
const WS = startOfWeek(TODAY) // 2026-09-28

let n = 0
function w(p: Partial<Workout>): Workout {
  n++
  return { id: `w${n}`, createdAt: '', updatedAt: '', date: TODAY, modality: 'corrida', status: 'planejado', order: 0, ...p }
}
function goal(p: Partial<WorkoutGoal>): WorkoutGoal {
  return { id: 'g', createdAt: '', updatedAt: '', title: 'x', kind: 'sessions', startDate: WS, milestones: [], status: 'ativa', ...p }
}
function db(p: Partial<DB> = {}): DB {
  return { ...emptyDB(), ...p }
}

describe('weekSummary', () => {
  it('counts planned vs done, time and distances by group', () => {
    const s = weekSummary([
      w({ modality: 'corrida', status: 'feito', durationMin: 40, distanceKm: 6.5 }),
      w({ modality: 'trail', status: 'adaptado', durationMin: 60, distanceKm: 8 }),
      w({ modality: 'gravel', status: 'feito', durationMin: 120, distanceKm: 45 }),
      w({ modality: 'natacao', status: 'feito', plannedDurationMin: 45 }),
      w({ modality: 'musculacao', status: 'planejado', plannedDurationMin: 60 }),
      w({ modality: 'yoga', status: 'feito', durationMin: 30 }),
      w({ modality: 'recuperacao', status: 'descanso' }),
    ])
    expect(s.planned).toBe(6)
    expect(s.done).toBe(5)
    expect(s.minutes).toBe(40 + 60 + 120 + 45 + 30)
    expect(s.runKm).toBe(14.5)
    expect(s.bikeKm).toBe(45)
    expect(s.swimSessions).toBe(1)
    expect(s.strengthSessions).toBe(0)
    expect(s.mobilitySessions).toBe(1)
    expect(s.restDays).toBe(1)
    expect(summaryParts(s)).toEqual(['5 de 6 feitos', '4h55', '14,5 km corrida', '45 km bike', '1 natação', '1 yoga/mob.'])
  })

  it('never shows "0 de N" — just how many are planned', () => {
    expect(summaryParts(weekSummary([w({}), w({})]))).toEqual(['2 planejados'])
  })
})

describe('moving and copying workouts', () => {
  it('moves a workout to the end of another day', () => {
    const d = db({ workouts: [w({ id: 'a', date: WS }), w({ id: 'b', date: addDays(WS, 2), order: 3 })] })
    expect(movePatch(d, 'a', addDays(WS, 2))).toEqual({ date: addDays(WS, 2), order: 4 })
    expect(movePatch(d, 'a', WS)).toBeNull()
    expect(movePatch(d, 'zzz', WS)).toBeNull()
  })

  it('copies last week as planned, keeping rest days and skipping duplicates', () => {
    const prev = addDays(WS, -7)
    const d = db({
      workouts: [
        w({ date: prev, modality: 'natacao', status: 'feito', durationMin: 50, distanceKm: 1.5, goal: 'técnica' }),
        w({ date: addDays(prev, 1), modality: 'corrida', status: 'adaptado' }),
        w({ date: addDays(prev, 6), modality: 'recuperacao', status: 'descanso' }),
        w({ date: addDays(WS, 1), modality: 'corrida', status: 'planejado' }), // already there
      ],
    })
    const out = copyWeekPlan(d, WS)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ date: WS, modality: 'natacao', status: 'planejado', plannedDurationMin: 50, plannedDistanceKm: 1.5, goal: 'técnica' })
    expect(out[0]).not.toHaveProperty('durationMin')
    expect(out[1]).toMatchObject({ date: addDays(WS, 6), status: 'descanso' })
  })
})

describe('goalProgress', () => {
  const workouts = [
    w({ date: addDays(WS, -10), modality: 'bike', status: 'feito', distanceKm: 30 }), // before start
    w({ date: WS, modality: 'gravel', status: 'feito', distanceKm: 40 }),
    w({ date: addDays(WS, 1), modality: 'speed', status: 'adaptado', distanceKm: 20.5 }),
    w({ date: addDays(WS, 2), modality: 'bike', status: 'planejado', plannedDistanceKm: 50 }), // not done
    w({ date: addDays(WS, 3), modality: 'corrida', status: 'feito', distanceKm: 5 }),
  ]
  it('distance goal sums done workouts of the group since start', () => {
    const p = goalProgress(db({ workouts }), goal({ kind: 'distance', modality: 'grupo:bike', target: 100 }), TODAY)
    expect(p).toMatchObject({ current: 60.5, target: 100, unit: 'km' })
  })
  it('sessions goal without modality counts every done workout', () => {
    expect(goalProgress(db({ workouts }), goal({ kind: 'sessions', target: 10 }), TODAY).current).toBe(3)
  })
  it('event goal uses milestones and the linked trip start as countdown', () => {
    const d = db({ trips: [{ id: SEED_IDS.tripAfrica, startDate: '2026-11-01' } as DB['trips'][number]] })
    const g = goal({
      kind: 'event',
      tripId: SEED_IDS.tripAfrica,
      milestones: [
        { id: '1', title: 'a', done: true },
        { id: '2', title: 'b', done: false },
      ],
    })
    expect(goalProgress(d, g, TODAY)).toMatchObject({ current: 1, target: 2, unit: 'marcos', deadline: '2026-11-01', daysLeft: 30 })
  })
  it('habit goal counts this week and only weeks since start', () => {
    const d = db({ workouts: [w({ modality: 'musculacao', status: 'feito', date: WS }), w({ modality: 'musculacao', status: 'feito', date: addDays(WS, -7) })] })
    const p = goalProgress(d, goal({ kind: 'habit', modality: 'musculacao', target: 2, startDate: addDays(WS, -7) }), TODAY)
    expect(p.current).toBe(1)
    expect(p.weeks?.map((x) => x.count)).toEqual([1, 1])
  })
})

describe('habits, meals and modalities', () => {
  it('meal tags turn habits on and never off', () => {
    const h = habitsWithTags({ agua: 3, proteina: false, fruta: true, vegetais: false, refeicoesPlanejadas: false }, ['proteina'])
    expect(h).toEqual({ agua: 3, proteina: true, fruta: true, vegetais: false, refeicoesPlanejadas: false })
    expect(habitsWithTags(undefined, ['vegetais']).vegetais).toBe(true)
  })
  it('default meal slot follows the hour', () => {
    expect(slotForMinutes(7 * 60)).toBe('cafe')
    expect(slotForMinutes(12 * 60 + 30)).toBe('almoco')
    expect(slotForMinutes(16 * 60)).toBe('lanche_tarde')
    expect(slotForMinutes(20 * 60)).toBe('jantar')
  })
  it('favorites first, inactive hidden', () => {
    const list = orderedModalities([
      { ...DEFAULT_MODALITIES[5], favorite: false },
      { ...DEFAULT_MODALITIES[0], favorite: true },
      { ...DEFAULT_MODALITIES[1], active: false },
    ])
    expect(list.map((m) => m.id)).toEqual(['corrida', 'speed'])
    expect(uniqueModalityId('Corrida', DEFAULT_MODALITIES)).toBe('corrida-2')
    expect(uniqueModalityId('Beach Tênis', DEFAULT_MODALITIES)).toBe('beach-tenis')
  })
  it('week labels', () => {
    expect(weekLabel(WS, TODAY)).toBe('Esta semana')
    expect(weekLabel(addDays(WS, 7), TODAY)).toBe('Próxima semana')
    expect(weekLabel(addDays(WS, -7), TODAY)).toBe('Semana passada')
  })
})

describe('patternNotes', () => {
  it('needs data and describes correlations in plain words', () => {
    expect(patternNotes(db(), TODAY)).toEqual([])
    const checkins = [1, 2, 3, 4].map((i) => ({
      id: `c${i}`,
      createdAt: '',
      updatedAt: '',
      date: addDays(TODAY, -i),
      sono: 'bom' as const,
      energia: 'alta' as const,
      habits: { agua: 0, proteina: false, fruta: false, vegetais: false, refeicoesPlanejadas: false },
    }))
    expect(patternNotes(db({ checkins }), TODAY)[0]).toMatch(/sono ok ou bom/)
  })
})

describe('seed', () => {
  it('plans the current week and links the Africa goal to the trip', () => {
    const out = seedBody(createSeedContext(TODAY))
    expect(out.workouts).toHaveLength(6)
    expect(out.workouts!.every((x) => x.date >= WS && x.date <= addDays(WS, 6))).toBe(true)
    expect(out.workouts!.every((x) => !x.time && (x.status === 'planejado' || x.status === 'descanso'))).toBe(true)
    expect(out.workouts!.find((x) => x.date === addDays(WS, 6))?.status).toBe('descanso')
    expect(out.mealTemplates).toHaveLength(3)
    const africa = out.workoutGoals!.find((g) => g.tripId === SEED_IDS.tripAfrica)
    expect(africa?.kind).toBe('event')
    expect(africa?.deadline).toBeUndefined()
    expect(out.checkins).toBeUndefined()
  })
})
