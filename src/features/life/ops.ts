import { actions, getDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { outOfRoutinePlan } from './selectors'

/**
 * "Fora da rotina hoje" (creche, hotel, viagem…). Stores skipped occurrences for the day's flexible
 * routines so they leave "Hoje" without counting as missed; turning it off removes only those skips.
 */
export function setLunaOutOfRoutine(date: DateKey, on: boolean): void {
  const plan = outOfRoutinePlan(getDB(), date, on)
  for (const parentId of plan.create) actions.create('occurrences', { parentType: 'petTask', parentId, date, status: 'skipped' })
  for (const id of plan.remove) actions.remove('occurrences', id)
}
