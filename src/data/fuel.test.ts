import { describe, expect, it } from 'vitest'
import { emptyDB } from './defaults'
import { dayPlanFor, dayTrainingContext, durationReviewSuggested, fuelPhases, keySessionTomorrow, strategyFor } from './fuel'
import type { DB, NutritionDayPlan, Workout } from './types'

const meta = { createdAt: '', updatedAt: '' }
const w = (id: string, date: string, modality: string, extra: Partial<Workout> = {}): Workout => ({ ...meta, id, date, modality, status: 'planejado', order: 0, ...extra })
const plan = (id: string, dayType: NutritionDayPlan['dayType'], weekdays: NutritionDayPlan['weekdays']): NutritionDayPlan => ({
  ...meta,
  id,
  name: id,
  dayType,
  weekdays,
  meals: [{ time: '05:00', name: 'Pré-treino', phase: 'pre', items: [{ food: 'x' }] }],
  source: 'nutricionista',
  active: true,
})

// 2026-10-08 Thu, 10-09 Fri, 10-10 Sat, 10-11 Sun
function fixture(): DB {
  const db = emptyDB()
  db.workouts = [
    w('swim', '2026-10-08', 'natacao', { time: '06:00', loadCategory: 'moderada' }),
    w('run', '2026-10-09', 'corrida', { time: '06:00', isKeySession: true, isLongSession: true, requiresPreviousDayPrep: true, requiresPreWorkout: true, requiresIntraWorkout: true, requiresPostWorkout: true, tags: ['long-run', 'key-session'] }),
    w('ride', '2026-10-11', 'bike', { time: '06:00', isKeySession: true, isLongSession: true, requiresPreviousDayPrep: true, tags: ['long-ride'] }),
  ]
  db.nutritionDayPlans = [plan('QUI', 'prep_longo', [4]), plan('SEX', 'corrida_longa', [5]), plan('SAB', 'prep_longo', [6]), plan('DOM', 'pedal_longo', [0])]
  db.nutritionStrategies = [{ ...meta, id: 's-run', name: 'Long run', linkedWorkoutTypes: ['long-run'], preWorkoutInstructions: 'pré X', source: 'nutricionista' }]
  return db
}

describe('fuel context', () => {
  it('derives day types from trainings', () => {
    const db = fixture()
    expect(dayTrainingContext(db, '2026-10-08').dayType).toBe('prep_longo') // Thu: prep for Friday run
    expect(dayTrainingContext(db, '2026-10-09').dayType).toBe('corrida_longa')
    expect(dayTrainingContext(db, '2026-10-10').dayType).toBe('prep_longo') // Sat: prep for Sunday ride
    expect(dayTrainingContext(db, '2026-10-11').dayType).toBe('pedal_longo')
    expect(dayPlanFor(db, '2026-10-08')?.id).toBe('QUI')
    expect(dayPlanFor(db, '2026-10-10')?.id).toBe('SAB')
  })

  it('moving the long run moves the context with it', () => {
    const db = fixture()
    db.workouts = db.workouts.map((x) => (x.id === 'run' ? { ...x, date: '2026-10-10' } : x))
    expect(dayTrainingContext(db, '2026-10-10').dayType).toBe('corrida_longa')
    expect(dayTrainingContext(db, '2026-10-09').dayType).toBe('prep_longo')
    expect(dayPlanFor(db, '2026-10-10')?.id).toBe('SEX') // the run's plan follows the run
  })

  it('finds strategies by tags and relevant fuel stages', () => {
    const db = fixture()
    const run = db.workouts.find((x) => x.id === 'run')!
    expect(strategyFor(db, run)?.id).toBe('s-run')
    expect(fuelPhases(run)).toEqual(['ontem', 'pre', 'intra', 'pos'])
    expect(fuelPhases(db.workouts[0])).toEqual(['pre', 'pos'])
    expect(keySessionTomorrow(db, '2026-10-08')?.id).toBe('run')
  })

  it('suggests a strategy review only after big duration changes', () => {
    const db = fixture()
    const run = { ...db.workouts[1], plannedDurationMin: 75, strategyReviewedAtMin: 75 }
    expect(durationReviewSuggested(db, run)).toBe(false)
    expect(durationReviewSuggested(db, { ...run, plannedDurationMin: 150 })).toBe(true)
    expect(durationReviewSuggested(db, { ...run, plannedDurationMin: 90 })).toBe(false)
  })

  it('days without a matching plan stay empty (never invented)', () => {
    const db = fixture()
    db.workouts.push(w('legs', '2026-10-07', 'musculacao', { isKeySession: true }))
    expect(dayTrainingContext(db, '2026-10-07').dayType).toBe('forca_pesada')
    expect(dayPlanFor(db, '2026-10-07')).toBeUndefined()
  })
})
