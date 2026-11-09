/**
 * "Faltei" on a class day, from wherever the class shows (Home, Agenda).
 * Same record as the absences she already had ("Falta na escola", schoolImpact 'dia'): with it, the class
 * leaves that day (data/travel-mode.ts `travelClassOn`). One record per trip and day, stable id, so a
 * second tap never duplicates it.
 */
import { actions, getDB } from '@/data/store'
import type { DateKey, ID, TripItem } from '@/data/types'

export const absenceId = (tripId: ID, date: DateKey) => `school-absence:${tripId}:${date}`

export function markAbsence(tripId: ID, date: DateKey): TripItem {
  const id = absenceId(tripId, date)
  const existing = getDB().tripItems.find((i) => i.id === id)
  if (existing) {
    if (existing.status !== 'feito' || existing.schoolImpact !== 'dia') actions.update('tripItems', id, { status: 'feito', schoolImpact: 'dia' })
    return getDB().tripItems.find((i) => i.id === id)!
  }
  const order = Math.max(0, ...getDB().tripItems.filter((i) => i.tripId === tripId).map((i) => i.order ?? 0)) + 1
  return actions.create('tripItems', {
    id,
    tripId,
    section: 'roteiro',
    group: 'Escola',
    title: 'Falta na escola',
    date,
    status: 'feito',
    certainty: 'confirmado',
    schoolImpact: 'dia',
    order,
    notes: 'Marcada por ela no detalhe da aula.',
  } as TripItem)
}

/** Undo: the class comes back on that day. */
export function unmarkAbsence(tripId: ID, date: DateKey): void {
  actions.remove('tripItems', absenceId(tripId, date))
}
