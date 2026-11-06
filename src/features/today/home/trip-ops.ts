/**
 * Home · painel operacional da viagem — which trip/day it reads and the day's rows it borrows from the agenda
 * projection (data/agenda/items.ts): work/study tasks and today's training. Pure; nothing is copied or written.
 */
import type { ActionItem } from '@/data/agenda/items'
import type { DateKey, DB } from '@/data/types'
import { activeExpeditionTrip, tripOpsPanel, type TripOpsPanel } from '@/features/travel/expedition/panel'
import { localNow } from '@/features/travel/expedition/logic'

/** Work and study of the day (Trabalho/Carreira/Estudo/Conteúdo fronts), still open, trip rows left out. */
export const workStudyItems = (items: ActionItem[]): ActionItem[] => items.filter((i) => i.front.group === 'trabalho' && i.status === 'pending' && i.refType !== 'tripItem')

/** Today's training rows (the trip's own plan while travelling). */
export const workoutItems = (items: ActionItem[]): ActionItem[] => items.filter((i) => i.entry?.kind === 'workout' && i.status !== 'cancelled' && i.status !== 'skipped')

/**
 * The panel while a trip with an expedition is happening (read in the trip's local day). Undefined otherwise —
 * Home stays as it is.
 */
export function homeTripOps(db: DB, today: DateKey, clock: Date): TripOpsPanel | undefined {
  for (const t of db.trips) {
    if (!t.expedition) continue
    let date = today
    try {
      date = localNow(t.expedition.timeZone, clock).date
    } catch {
      // An invalid zone falls back to Home's day.
    }
    if (activeExpeditionTrip([t], date)) return tripOpsPanel(t, db.tripItems, db.expenses, db.workouts, date)
  }
  return undefined
}
