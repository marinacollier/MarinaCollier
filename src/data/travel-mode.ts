/**
 * MODO VIAGEM — derived from data, never a global toggle.
 *
 * While a day falls inside a real trip (confirmed / em andamento, or one with `expedition` settings),
 * the São Paulo routine is suspended for that day:
 * - the weekly training template proposes nothing (the trip's activities are the training);
 * - profile.work (presencial/remoto, commute, presencial checklist) does not apply;
 * - the home routines (Milagre da Manhã, Encerrar o dia) are paused — not deleted, back the day after;
 * - local-life items (nutrition plan by weekday, meal prep, Luna, recurring local events) are paused.
 *
 * Pausing is computed here and read by the selectors; nothing is written. The only write is
 * `pruneTravelWorkouts`: untouched planned workouts the weekly template generated on trip days are
 * removed (the planner regenerates them after the trip). Logged, edited or done workouts are never touched.
 *
 * She can turn it off per trip: `trip.pauseHomeRoutine === false`.
 * Pure and dependency-light (types + date helpers) so every data module can import it.
 */
import type { CalendarEvent, DateKey, DB, Routine, Trip, Workout } from './types'
import { SEED_IDS } from './seed/ids'
import { weekday } from '@/lib/date'

type TripsOf = Pick<DB, 'trips'>

/** A trip that can pause the home routine at all (dates set, really happening, switch not off). */
export function travelModeEligible(t: Trip): boolean {
  if (!t.startDate || t.pauseHomeRoutine === false) return false
  if (t.status === 'concluida' && !t.expedition) return false
  return t.status === 'confirmada' || t.status === 'em_andamento' || !!t.expedition
}

/** Same as eligible, ignoring her switch (the trip page shows the line either way). */
export function travelModeApplies(t: Trip): boolean {
  return travelModeEligible({ ...t, pauseHomeRoutine: undefined })
}

const inTrip = (t: Trip, date: DateKey) => !!t.startDate && t.startDate <= date && date <= (t.endDate ?? t.startDate)

// One small cache per trips array: selectors call this for every row of every day.
let cacheTrips: Trip[] | undefined
let cacheList: Trip[] = []
function eligibleTrips(trips: Trip[] | undefined): Trip[] {
  if (!trips?.length) return []
  if (trips !== cacheTrips) {
    cacheTrips = trips
    cacheList = trips.filter(travelModeEligible).sort((a, b) => a.startDate!.localeCompare(b.startDate!) || a.order - b.order)
  }
  return cacheList
}

/** The trip whose travel mode covers `date` (undefined = normal São Paulo day). */
export function travelTripOn(db: TripsOf, date: DateKey): Trip | undefined {
  return eligibleTrips(db.trips).find((t) => inTrip(t, date))
}

export function isTravelDay(db: TripsOf, date: DateKey): boolean {
  return !!travelTripOn(db, date)
}

/** "16/11" */
export function shortDM(date: DateKey): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

/** Settings line: "Modo viagem ativo: rotina de SP pausada até 16/11". */
export function travelModeLine(t: Trip): string {
  const end = t.endDate ?? t.startDate
  return t.pauseHomeRoutine === false
    ? 'Modo viagem desligado: rotina de SP segue normal nestas datas'
    : `Modo viagem ativo: rotina de SP pausada${end ? ` até ${shortDM(end)}` : ''}`
}

/** The expedition's class block on a day (data-layer twin of expedition/logic `classOn`). */
export function classBlockOn(t: Trip, date: DateKey): { start: string; end: string; name: string } | undefined {
  const s = t.expedition?.school
  if (!s || date < s.from || date > s.until) return undefined
  const d = s.days.find((x) => x.weekday === weekday(date))
  return d ? { start: d.start, end: d.end, name: s.name } : undefined
}

/** The day's class when modo viagem covers `date` and no whole-day absence is planned. */
export function travelClassOn(db: Pick<DB, 'trips' | 'tripItems'>, date: DateKey): { trip: Trip; start: string; end: string; name: string } | undefined {
  const trip = travelTripOn(db, date)
  const cls = trip && classBlockOn(trip, date)
  if (!trip || !cls) return undefined
  const absent = db.tripItems.some((i) => i.tripId === trip.id && i.status !== 'cancelado' && i.schoolImpact === 'dia' && !!i.date && i.date <= date && (i.endDate ?? i.date) >= date)
  return absent ? undefined : { trip, ...cls }
}

// ─── What pauses ────────────────────────────────────────────────────────────

/** Home routines (Milagre da Manhã, Encerrar o dia, any BASE routine) pause on trip days. */
export function isHomeRoutine(r: Pick<Routine, 'id' | 'planType'>): boolean {
  return r.id === SEED_IDS.routineMorning || r.id.startsWith('seed:today:routine-') || r.planType === 'base'
}

export function routinePausedOn(db: TripsOf & Pick<DB, 'routines'>, routineId: string, date: DateKey): boolean {
  if (!isTravelDay(db, date)) return false
  const r = db.routines.find((x) => x.id === routineId)
  return !r || isHomeRoutine(r)
}

/**
 * Recurring local-life events (cerâmica, fisioterapia, weekly CEO review…) pause on trip days.
 * One-off events she created, and anything from an external calendar, stay.
 */
export function eventPausedOn(db: TripsOf, e: CalendarEvent, date: DateKey): boolean {
  return !!e.recurrence && !e.external && isTravelDay(db, date)
}

// ─── Generated template workouts on trip days ───────────────────────────────

const GENERATED = /^seed:body:w-\d{4}-\d{2}-\d{2}-tpl-/

/** A workout the weekly template generated and nobody touched since (safe to remove on a trip day). */
export function isUntouchedTemplateWorkout(w: Workout): boolean {
  if (w.status !== 'planejado' && w.status !== 'descanso') return false
  if (w.createdAt !== w.updatedAt) return false
  if (!w.templateId && !GENERATED.test(w.id)) return false
  // Anything she wrote about it keeps it (a log, a real duration, a goal, a link).
  return !w.durationMin && !w.distanceKm && !w.feeling && !w.workoutGoalId && !w.external && !w.fuelDone?.length && !w.postCheckin
}

/** Ids of the workouts `pruneTravelWorkouts` would remove. */
export function travelPrunableWorkouts(db: Pick<DB, 'trips' | 'workouts'>): Workout[] {
  if (!eligibleTrips(db.trips).length) return []
  return db.workouts.filter((w) => isTravelDay(db, w.date) && isUntouchedTemplateWorkout(w))
}

/**
 * Removes untouched template workouts on trip days. Idempotent; returns the same DB when nothing
 * changes. Seed ids go to `removedSeedIds` (like any delete), so a seed migration never brings them back;
 * the cloud sync sees an ordinary local delete and sends a tombstone.
 */
export function pruneTravelWorkouts(db: DB): DB {
  const drop = travelPrunableWorkouts(db)
  if (!drop.length) return db
  const ids = new Set(drop.map((w) => w.id))
  const removed = db.profile.removedSeedIds ?? []
  const seedIds = drop.map((w) => w.id).filter((id) => id.startsWith('seed:') && !removed.includes(id))
  return {
    ...db,
    workouts: db.workouts.filter((w) => !ids.has(w.id)),
    profile: seedIds.length ? { ...db.profile, removedSeedIds: [...removed, ...seedIds] } : db.profile,
  }
}
