/**
 * BRIEF OPERACIONAL 01/11 — the one stored value of her operations brief: the original budget of the South
 * Africa trip (~R30.000 — rand, the trip currency) on the trip's Expedição settings. Applied once per install from 01/11
 * (`profile.tripUpdatesApplied` gets OPS_1101_ID), only when the field is still empty — a value she typed stays.
 *
 * Everything else in the brief (daily mandatory blocks, briefing/review views, financial close, conflict
 * checks) is computed from her data and never stored (expedition/daily.ts, expedition/ops.ts).
 * Returns the SAME db object when there is nothing to do.
 */
import type { DateKey, DB } from '../types'
import { SEED_IDS } from './ids'
import { nowISO } from '@/lib/id'

export const OPS_1101_ID = 'za-2026-11-01'
export const OPS_1101_FROM: DateKey = '2026-11-01'
/** R30.000 (ZAR) in cents — her original reference, not money still available. */
export const ORIGINAL_BUDGET_CENTS = 3_000_000

export function applyOps1101(db: DB, today: DateKey, now: string = nowISO()): DB {
  if (today < OPS_1101_FROM || db.profile.tripUpdatesApplied?.includes(OPS_1101_ID)) return db
  const profile = { ...db.profile, tripUpdatesApplied: [...(db.profile.tripUpdatesApplied ?? []), OPS_1101_ID] }
  const trip = db.trips.find((t) => t.id === SEED_IDS.tripAfrica)
  if (!trip?.expedition) return { ...db, profile }
  if (trip.expedition.budgetCents != null) return { ...db, profile }
  const next = { ...trip, expedition: { ...trip.expedition, budgetCents: ORIGINAL_BUDGET_CENTS }, updatedAt: now }
  return { ...db, profile, trips: db.trips.map((t) => (t.id === trip.id ? next : t)) }
}
