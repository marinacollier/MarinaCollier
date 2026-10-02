import { actions, getDB } from '@/data/store'
import type { FuelPhase, PostWorkoutCheckin } from '@/data/types'
import { nowISO } from '@/lib/id'
import { toggleFuelDone } from './logic'

export type CheckinPatch = Partial<Omit<PostWorkoutCheckin, 'at'>>

/** Writes one check-in answer immediately (one tap each — the whole check-in takes seconds). */
export function savePostCheckin(workoutId: string, patch: CheckinPatch): void {
  const w = getDB().workouts.find((x) => x.id === workoutId)
  if (!w) return
  actions.update('workouts', workoutId, { postCheckin: { ...w.postCheckin, ...patch, at: nowISO() } })
}

/** Toggle a fuel execution mark (tracking only). Returns true when it became marked. */
export function toggleFuelMark(workoutId: string, phase: FuelPhase): boolean {
  const w = getDB().workouts.find((x) => x.id === workoutId)
  if (!w) return false
  const next = toggleFuelDone(w.fuelDone, phase)
  actions.update('workouts', workoutId, { fuelDone: next })
  return next.includes(phase)
}
