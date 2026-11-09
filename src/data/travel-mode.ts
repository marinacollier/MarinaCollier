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
import type { CalendarEvent, DateKey, DB, Routine, RoutineMode, Trip, TripItem, UserProfile, Workout } from './types'
import { SEED_IDS } from './seed/ids'
import { weekday } from '@/lib/date'

/** The profile is optional so callers holding only trips keep working (no modes = automatic). */
type TripsOf = Pick<DB, 'trips'> & { profile?: Pick<UserProfile, 'routineModes'> & Partial<Pick<UserProfile, 'timezone'>> }

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

// ─── Modos de rotina (viagem · férias · transição · Brasil) ──────────────────

export type RoutineModeSource = 'manual' | 'periodo' | 'viagem' | 'padrao'

export interface RoutineModeInfo {
  mode: RoutineMode
  source: RoutineModeSource
  /** Period label, or the trip's name. */
  label?: string
  /** Last day (inclusive) of what set the mode, when known. */
  until?: DateKey
  /** IANA zone the day's wall times live in: the trip's during 'viagem', else the profile's. */
  timeZone: string
  trip?: Trip
}

const inside = (date: DateKey, from: DateKey, to?: DateKey) => from <= date && (!to || date <= to)

/** Manual override > explicit period (the latest-starting one when several cover the date). Undefined = automatic. */
export function explicitModeOn(profile: Pick<UserProfile, 'routineModes'> | undefined, date: DateKey): Omit<RoutineModeInfo, 'timeZone' | 'trip'> | undefined {
  const cfg = profile?.routineModes
  if (!cfg) return undefined
  const m = cfg.manual
  if (m && inside(date, m.from, m.to)) return { mode: m.mode, source: 'manual', until: m.to }
  const p = (cfg.periods ?? []).filter((x) => inside(date, x.from, x.to)).sort((a, b) => b.from.localeCompare(a.from))[0]
  return p ? { mode: p.mode, source: 'periodo', label: p.label, until: p.to } : undefined
}

/** Which routine mode a (local) day is in, and why. Pure; dates are DateKeys, so no clock or zone math here. */
export function routineModeInfo(db: TripsOf, date: DateKey): RoutineModeInfo {
  const homeTz = db.profile?.timezone ?? 'America/Sao_Paulo'
  const trip = travelTripOn(db, date)
  const tripTz = trip?.expedition?.timeZone
  const explicit = explicitModeOn(db.profile, date)
  if (explicit) return { ...explicit, timeZone: explicit.mode === 'viagem' && tripTz ? tripTz : homeTz, trip: explicit.mode === 'viagem' ? trip : undefined }
  if (trip) return { mode: 'viagem', source: 'viagem', label: trip.name, until: trip.endDate ?? trip.startDate, timeZone: tripTz ?? homeTz, trip }
  return { mode: 'brasil', source: 'padrao', timeZone: homeTz }
}

/** manual (if the date is inside it) > period > trip day ('viagem') > 'brasil'. */
export function routineModeOn(db: TripsOf, date: DateKey): RoutineMode {
  return routineModeInfo(db, date).mode
}

/** 'viagem' and 'férias' pause the São Paulo routine (routines, recurring events, weekly templates). */
export const modePausesHome = (m: RoutineMode) => m === 'viagem' || m === 'ferias'

/** Only 'brasil' has the work base (hours + commute). */
export const modeHasWorkBase = (m: RoutineMode) => m === 'brasil'

/**
 * Home routine paused that day: modo viagem/férias. Without routine modes in the profile this is exactly
 * "the day falls inside a real trip" (the original behaviour); a manual 'brasil'/'transição' on a trip day un-pauses it.
 */
export function isTravelDay(db: TripsOf, date: DateKey): boolean {
  const explicit = explicitModeOn(db.profile, date)
  if (explicit) return modePausesHome(explicit.mode)
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
  if (s.holidays?.some((h) => h.date === date)) return undefined
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

/** "Falta na escola" she marked for that day (not an activity that takes the day): the class stays visible, tagged "faltei". */
export function isSchoolAbsence(i: Pick<TripItem, 'id' | 'group' | 'title' | 'schoolImpact'>): boolean {
  return i.schoolImpact === 'dia' && (i.id.startsWith('school-absence:') || (i.group === 'Escola' && /^falta/i.test(i.title)))
}

/**
 * The class of the day as the calendar shows it: also on a day she missed (`absent`), so the day keeps the
 * class with a "faltei" tag. A day taken by an activity (Garden Route, mergulho) still has no class line.
 */
export function classLineOn(db: Pick<DB, 'trips' | 'tripItems'>, date: DateKey): ({ trip: Trip; start: string; end: string; name: string; absent?: TripItem }) | undefined {
  const live = travelClassOn(db, date)
  if (live) return live
  const trip = travelTripOn(db, date)
  const cls = trip && classBlockOn(trip, date)
  if (!trip || !cls) return undefined
  const covering = db.tripItems.filter((i) => i.tripId === trip.id && i.status !== 'cancelado' && i.schoolImpact === 'dia' && !!i.date && i.date <= date && (i.endDate ?? i.date) >= date)
  const absence = covering.find(isSchoolAbsence)
  // Only her own absence keeps the line; an activity that takes the whole day already says so itself.
  return absence && covering.every(isSchoolAbsence) ? { trip, ...cls, absent: absence } : undefined
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
export function travelPrunableWorkouts(db: Pick<DB, 'trips' | 'workouts'> & { profile?: Pick<UserProfile, 'routineModes'> }): Workout[] {
  if (!eligibleTrips(db.trips).length && !db.profile?.routineModes) return []
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
