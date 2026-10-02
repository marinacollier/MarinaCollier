/**
 * Corpo — pure selectors and rules. No store access here: everything is a function of (db, args)
 * so it is easy to test and to use inside useMemo.
 */
import type { DailyCheckIn, DateKey, DB, FoodTag, Meal, MealSlot, Modality, NewItem, Workout, WorkoutGoal } from '@/data/types'
import { addDays, diffDays, formatShortDate, startOfWeek } from '@/lib/date'
import { MODALITY_GROUPS } from './constants'

// ─── Modalities ─────────────────────────────────────────────────────────────

/** Favorites first (keeping the profile order inside each group). Inactive ones are hidden unless `keep` is one of them. */
export function orderedModalities(list: Modality[], opts: { includeInactive?: boolean; keep?: string } = {}): Modality[] {
  const visible = list.filter((m) => opts.includeInactive || m.active || m.id === opts.keep)
  return [...visible.filter((m) => m.favorite), ...visible.filter((m) => !m.favorite)]
}

/** Modality ids matched by a goal's `modality` (id or group key). Undefined = any modality. */
export function modalityIdsFor(key: string | undefined): string[] | undefined {
  if (!key) return undefined
  const group = MODALITY_GROUPS.find((g) => g.key === key)
  return group ? group.ids : [key]
}

export function slugify(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'modalidade'
  )
}

/** A modality id that doesn't collide with existing ones. */
export function uniqueModalityId(label: string, existing: Modality[]): string {
  const base = slugify(label)
  let id = base
  let n = 2
  while (existing.some((m) => m.id === id)) id = `${base}-${n++}`
  return id
}

// ─── Workouts ───────────────────────────────────────────────────────────────

export const isDone = (w: Workout) => w.status === 'feito' || w.status === 'adaptado'

export function workoutsBetween(db: DB, from: DateKey, to: DateKey): Workout[] {
  return db.workouts
    .filter((w) => w.date >= from && w.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order)
}

export function workoutsByDay(db: DB, weekStart: DateKey): Record<DateKey, Workout[]> {
  const out: Record<DateKey, Workout[]> = {}
  for (let i = 0; i < 7; i++) out[addDays(weekStart, i)] = []
  for (const w of workoutsBetween(db, weekStart, addDays(weekStart, 6))) out[w.date]?.push(w)
  return out
}

export interface WeekSummary {
  planned: number
  done: number
  minutes: number
  runKm: number
  bikeKm: number
  swimSessions: number
  swimKm: number
  strengthSessions: number
  mobilitySessions: number
  restDays: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Light weekly summary. Only done/adapted sessions count for time and distance. */
export function weekSummary(workouts: Workout[]): WeekSummary {
  const s: WeekSummary = { planned: 0, done: 0, minutes: 0, runKm: 0, bikeKm: 0, swimSessions: 0, swimKm: 0, strengthSessions: 0, mobilitySessions: 0, restDays: 0 }
  for (const w of workouts) {
    if (w.status === 'descanso') {
      s.restDays++
      continue
    }
    s.planned++
    if (!isDone(w)) continue
    s.done++
    s.minutes += w.durationMin ?? w.plannedDurationMin ?? 0
    const km = w.distanceKm ?? w.plannedDistanceKm ?? 0
    if (w.modality === 'corrida' || w.modality === 'trail') s.runKm += km
    if (w.modality === 'bike' || w.modality === 'gravel' || w.modality === 'speed') s.bikeKm += km
    if (w.modality === 'natacao') {
      s.swimSessions++
      s.swimKm += km
    }
    if (w.modality === 'musculacao') s.strengthSessions++
    if (w.modality === 'yoga' || w.modality === 'mobilidade') s.mobilitySessions++
  }
  s.runKm = round1(s.runKm)
  s.bikeKm = round1(s.bikeKm)
  s.swimKm = round1(s.swimKm)
  return s
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function formatKm(km: number): string {
  return `${String(round1(km)).replace('.', ',')} km`
}

/** Short parts for the summary line ("3 de 5 feitos", "2h30", "12 km corrida"...). Zero values are left out. */
export function summaryParts(s: WeekSummary): string[] {
  const parts: string[] = []
  if (s.planned && !s.done) parts.push(`${s.planned} ${s.planned === 1 ? 'planejado' : 'planejados'}`)
  else if (s.planned) parts.push(`${s.done} de ${s.planned} ${s.planned === 1 ? 'feito' : 'feitos'}`)
  if (s.minutes) parts.push(formatMinutes(s.minutes))
  if (s.runKm) parts.push(`${formatKm(s.runKm)} corrida`)
  if (s.bikeKm) parts.push(`${formatKm(s.bikeKm)} bike`)
  if (s.swimSessions) parts.push(`${s.swimSessions} ${s.swimSessions === 1 ? 'natação' : 'natações'}`)
  if (s.strengthSessions) parts.push(`${s.strengthSessions} força`)
  if (s.mobilitySessions) parts.push(`${s.mobilitySessions} yoga/mob.`)
  return parts
}

/** New `date` + `order` for a workout dropped on another day (goes to the end of that day). */
export function movePatch(db: DB, id: string, toDate: DateKey): Pick<Workout, 'date' | 'order'> | null {
  const w = db.workouts.find((x) => x.id === id)
  if (!w || w.date === toDate) return null
  const order = db.workouts.filter((x) => x.date === toDate).reduce((m, x) => Math.max(m, x.order), -1) + 1
  return { date: toDate, order }
}

/**
 * Plan for `toWeekStart` copied from the week before: same modality/time/plan, status reset to planejado
 * (rest days stay rest days). Skips anything already planned with the same modality on the same day.
 */
export function copyWeekPlan(db: DB, toWeekStart: DateKey): NewItem<'workouts'>[] {
  const from = addDays(toWeekStart, -7)
  const source = workoutsBetween(db, from, addDays(from, 6))
  const out: NewItem<'workouts'>[] = []
  for (const w of source) {
    const date = addDays(w.date, 7)
    if (db.workouts.some((x) => x.date === date && x.modality === w.modality)) continue
    out.push({
      date,
      time: w.time,
      modality: w.modality,
      status: w.status === 'descanso' ? 'descanso' : 'planejado',
      title: w.title,
      plannedDurationMin: w.plannedDurationMin ?? w.durationMin,
      plannedDistanceKm: w.plannedDistanceKm ?? w.distanceKm,
      goal: w.goal,
      intensity: w.intensity,
      workoutGoalId: w.workoutGoalId,
      order: w.order,
    })
  }
  return out
}

// ─── Goals ──────────────────────────────────────────────────────────────────

export interface GoalProgress {
  current: number
  target?: number
  unit: 'sessoes' | 'km' | 'marcos'
  /** Effective deadline (goal deadline or linked trip start). */
  deadline?: DateKey
  daysLeft?: number
  /** Habit goals: sessions in each of the last 4 weeks (oldest first) and this week. */
  weeks?: { weekStart: DateKey; count: number }[]
}

export function goalDeadline(db: DB, g: WorkoutGoal): DateKey | undefined {
  if (g.deadline) return g.deadline
  if (g.tripId) return db.trips.find((t) => t.id === g.tripId)?.startDate
  return undefined
}

function matching(db: DB, g: WorkoutGoal, from: DateKey, to: DateKey): Workout[] {
  const ids = modalityIdsFor(g.modality)
  return db.workouts.filter((w) => isDone(w) && w.date >= from && w.date <= to && (!ids || ids.includes(w.modality)))
}

/** Progress computed from workouts (sessions/distance/habit) or milestones (event). */
export function goalProgress(db: DB, g: WorkoutGoal, today: DateKey): GoalProgress {
  const deadline = goalDeadline(db, g)
  const daysLeft = deadline ? diffDays(today, deadline) : undefined
  const end = deadline && deadline < today ? deadline : today
  if (g.kind === 'event') {
    const done = g.milestones.filter((m) => m.done).length
    return { current: done, target: g.milestones.length || undefined, unit: 'marcos', deadline, daysLeft }
  }
  if (g.kind === 'habit') {
    const thisWeek = startOfWeek(today)
    const weeks = [-3, -2, -1, 0]
      .map((k) => addDays(thisWeek, k * 7))
      .filter((ws, i) => i === 3 || addDays(ws, 6) >= g.startDate)
      .map((ws) => {
        const from = ws < g.startDate ? g.startDate : ws
        return { weekStart: ws, count: from > addDays(ws, 6) ? 0 : matching(db, g, from, addDays(ws, 6)).length }
      })
    return { current: weeks[weeks.length - 1].count, target: g.target, unit: 'sessoes', deadline, daysLeft, weeks }
  }
  const list = matching(db, g, g.startDate, end)
  if (g.kind === 'distance') {
    const km = round1(list.reduce((s, w) => s + (w.distanceKm ?? w.plannedDistanceKm ?? 0), 0))
    return { current: km, target: g.target, unit: 'km', deadline, daysLeft }
  }
  return { current: list.length, target: g.target, unit: 'sessoes', deadline, daysLeft }
}

// ─── Check-ins, habits, meals ───────────────────────────────────────────────

export const EMPTY_HABITS: DailyCheckIn['habits'] = { agua: 0, proteina: false, fruta: false, vegetais: false, refeicoesPlanejadas: false }

/** Habits after logging a meal with these tags: ticked tags turn the habit on (never off). */
export function habitsWithTags(habits: DailyCheckIn['habits'] | undefined, tags: FoodTag[]): DailyCheckIn['habits'] {
  const h = { ...EMPTY_HABITS, ...(habits ?? {}) }
  for (const t of tags) h[t] = true
  return h
}

/** Default meal slot for a minute of the day. */
export function slotForMinutes(min: number): MealSlot {
  const h = min / 60
  if (h < 10) return 'cafe'
  if (h < 11.5) return 'lanche_manha'
  if (h < 15) return 'almoco'
  if (h < 18.5) return 'lanche_tarde'
  return 'jantar'
}

export function mealsBySlot(meals: Meal[], date: DateKey): Partial<Record<MealSlot, Meal[]>> {
  const out: Partial<Record<MealSlot, Meal[]>> = {}
  for (const m of meals) if (m.date === date) (out[m.slot] ??= []).push(m)
  return out
}

export function habitDone(c: DailyCheckIn | undefined, key: keyof DailyCheckIn['habits'], waterGoal: number): boolean {
  if (!c) return false
  if (key === 'agua') return c.habits.agua >= Math.max(1, waterGoal)
  return !!c.habits[key]
}

/**
 * Plain-words observations from check-ins (never a diagnosis, never a score).
 * Needs a handful of data points; returns [] otherwise.
 */
export function patternNotes(db: DB, today: DateKey, windowDays = 42): string[] {
  const from = addDays(today, -windowDays)
  const list = db.checkins.filter((c) => c.date >= from && c.date <= today)
  const notes: string[] = []

  const goodSleep = list.filter((c) => (c.sono === 'ok' || c.sono === 'bom') && c.energia)
  if (goodSleep.length >= 3) {
    const share = goodSleep.filter((c) => c.energia !== 'baixa').length / goodSleep.length
    if (share >= 0.66) notes.push('Nos dias de sono ok ou bom, sua energia tende a ficar média ou alta.')
  }
  const badSleep = list.filter((c) => c.sono === 'ruim' && c.corpo)
  if (badSleep.length >= 3 && badSleep.filter((c) => c.corpo === 'cansado').length / badSleep.length >= 0.66) {
    notes.push('Depois de noites de sono ruim, o corpo costuma pedir um dia mais leve.')
  }
  const trained = new Set(db.workouts.filter(isDone).map((w) => w.date))
  const withMood = list.filter((c) => c.humor)
  const a = withMood.filter((c) => trained.has(c.date))
  const b = withMood.filter((c) => !trained.has(c.date))
  if (a.length >= 3 && b.length >= 3) {
    const avg = (xs: DailyCheckIn[]) => xs.reduce((s, c) => s + (c.humor ?? 0), 0) / xs.length
    if (avg(a) - avg(b) >= 0.5) notes.push('Nos dias com treino, seu humor tende a ficar um pouco melhor.')
  }
  return notes
}

/** Monday keys of past weeks (most recent first), starting at the week before `today`'s. */
export function pastWeeks(today: DateKey, count: number): DateKey[] {
  const ws = startOfWeek(today)
  return Array.from({ length: count }, (_, i) => addDays(ws, -7 * (i + 1)))
}

/** "Esta semana", "Próxima semana", "Semana passada" or "28 de set. – 4 de out.". */
export function weekLabel(weekStart: DateKey, today: DateKey): string {
  const diff = diffDays(startOfWeek(today), weekStart) / 7
  if (diff === 0) return 'Esta semana'
  if (diff === 1) return 'Próxima semana'
  if (diff === -1) return 'Semana passada'
  return `${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`
}
