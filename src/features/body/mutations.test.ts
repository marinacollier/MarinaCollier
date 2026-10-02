import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, useStore } from '@/data/store'
import { emptyDB } from '@/data/defaults'
import { addDays, startOfWeek } from '@/lib/date'
import { applyMealTags, moveWorkout, repeatLastWeek, setHabits, upsertCheckin } from './mutations'

const DAY = '2026-10-02'

describe('body mutations', () => {
  beforeEach(() => useStore.setState({ db: emptyDB(), hydrated: true }))

  it('creates the check-in on first habit tap, then updates it', () => {
    setHabits(DAY, { agua: 2 })
    expect(getDB().checkins).toHaveLength(1)
    upsertCheckin(DAY, { energia: 'alta' })
    setHabits(DAY, { fruta: true })
    const c = getDB().checkins[0]
    expect(getDB().checkins).toHaveLength(1)
    expect(c).toMatchObject({ date: DAY, energia: 'alta', habits: { agua: 2, fruta: true, proteina: false } })
  })

  it('meal tags tick the day habits (and planned meals tick "refeições planejadas")', () => {
    applyMealTags(DAY, ['proteina', 'vegetais'], true)
    expect(getDB().checkins[0].habits).toMatchObject({ proteina: true, vegetais: true, fruta: false, refeicoesPlanejadas: true })
  })

  it('moves workouts between days and repeats last week', () => {
    const ws = startOfWeek(DAY)
    const a = actions.create('workouts', { date: addDays(ws, -7), modality: 'natacao', status: 'feito', order: 0 })
    expect(moveWorkout(a.id, addDays(ws, -6))).toBe(true)
    expect(getDB().workouts[0].date).toBe(addDays(ws, -6))
    expect(repeatLastWeek(ws)).toBe(1)
    expect(getDB().workouts.find((w) => w.date === addDays(ws, 1))?.status).toBe('planejado')
    expect(repeatLastWeek(ws)).toBe(0) // nothing new
  })
})
