/**
 * "Quando consigo encaixar X?" — thin layer over the shared planning engine (data/planning.ts):
 * windows that respect check-in limits, presencial logistics, work hours and the calendar,
 * plus the reasons some days were left out. Pure.
 */
import type { DateKey, DB, SchedulingConstraint, WorkoutGoal } from '@/data/types'
import { suggestWindows, type WindowSuggestion } from '@/data/planning'
import { addDays, hmToMinutes, minutesToHM, startOfWeek, weekday, weekDays } from '@/lib/date'

export interface FitResult {
  modality: string
  durationMin: number
  goal?: WorkoutGoal
  /** Chronological, this week first, then next week when this one is ending. */
  windows: WindowSuggestion[]
  /** Days of this week skipped because a check-in rule is already used up. */
  blocked: { date: DateKey; constraint: SchedulingConstraint }[]
  /** Workouts of this modality already planned/done this week. */
  alreadyThisWeek: DateKey[]
}

const DAY_END = 21 * 60

/** Active flexible goal for a modality ("Yoga — 1x/semana"). */
export function goalFor(db: DB, modality: string): WorkoutGoal | undefined {
  return db.workoutGoals.find((g) => g.status === 'ativa' && g.modality === modality)
}

export function fitWindows(db: DB, today: DateKey, nowMinutes: number, modality: string, max = 4): FitResult {
  const goal = goalFor(db, modality)
  const durationMin = 60
  const base = { modality, durationMin, preferredWeekdays: goal?.preferredWeekdays, limit: 7 }
  const notBefore = Math.ceil((nowMinutes + 30) / 30) * 30

  const thisWeek = suggestWindows(db, { ...base, from: today }).filter((s) => s.date !== today || hmToMinutes(s.start) >= notBefore)
  // Today's first window may already be gone: look again after "now".
  if (!thisWeek.some((s) => s.date === today) && DAY_END - notBefore >= durationMin) {
    const later = suggestWindows(db, { ...base, from: today, dayStart: minutesToHM(notBefore) }).find((s) => s.date === today)
    if (later) thisWeek.push(later)
  }
  thisWeek.sort((a, b) => a.date.localeCompare(b.date))

  let windows = thisWeek
  if (thisWeek.length < 3) {
    const nextWeek = suggestWindows(db, { ...base, from: addDays(startOfWeek(today), 7) }).sort((a, b) => a.date.localeCompare(b.date))
    windows = [...thisWeek, ...nextWeek]
  }
  // Keep a preferred day even if it's further away.
  const preferred = windows.find((w) => goal?.preferredWeekdays?.includes(weekday(w.date)))
  let picked = windows.slice(0, max)
  if (preferred && !picked.includes(preferred)) picked = [...picked.slice(0, max - 1), preferred]

  const days = weekDays(today).filter((d) => d >= today)
  const blocked: FitResult['blocked'] = []
  for (const date of days) {
    const dayWorkouts = db.workouts.filter((w) => w.date === date && w.status !== 'pulado' && w.status !== 'descanso')
    const c = db.constraints.find(
      (c) =>
        c.active &&
        c.kind === 'max_checkins_per_day' &&
        c.modalities?.includes(modality) &&
        !dayWorkouts.some((w) => w.modality === modality) &&
        dayWorkouts.filter((w) => c.modalities?.includes(w.modality)).length >= c.limit,
    )
    if (c) blocked.push({ date, constraint: c })
  }

  const alreadyThisWeek = db.workouts
    .filter((w) => w.modality === modality && weekDays(today).includes(w.date) && w.status !== 'pulado' && w.status !== 'descanso')
    .map((w) => w.date)
    .sort()

  return { modality, durationMin, goal, windows: picked, blocked, alreadyThisWeek }
}
