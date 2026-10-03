/**
 * "Sempre usar com base no histórico": defaults for a new or swapped session come from Marina's own
 * past sessions first, then from her weekly template, then from the session it replaces.
 * Every default says where it came from.
 */
import { modalityGroup, PERIOD_LABEL, PERIOD_RANGES } from '@/data/planning'
import { findModality } from '@/data/planning'
import type { DateKey, DayPeriod, DB, LoadCategory, SessionType, TimeHM, WeekTemplateItem, Workout } from '@/data/types'
import { addDays, hmToMinutes, weekday } from '@/lib/date'
import type { WorkoutDraft } from './types'

export interface HistoryStats {
  sessions: number
  durationMin?: number
  time?: TimeHM
  load?: LoadCategory
}

const HISTORY_SIZE = 6
const HISTORY_DAYS = 120

function median(list: number[]): number {
  const s = [...list].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function mode<T>(list: T[]): { value: T; count: number } | undefined {
  const counts = new Map<T, number>()
  for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: { value: T; count: number } | undefined
  // list is newest first, so ties go to the most recent value.
  for (const v of list) {
    const c = counts.get(v)!
    if (!best || c > best.count) best = { value: v, count: c }
  }
  return best
}

/** Last sessions of a modality Marina actually did (feito/adaptado), newest first. */
export function pastSessions(db: DB, modality: string, today: DateKey): Workout[] {
  const from = addDays(today, -HISTORY_DAYS)
  return db.workouts
    .filter((w) => w.modality === modality && (w.status === 'feito' || w.status === 'adaptado') && w.date < today && w.date >= from)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, HISTORY_SIZE)
}

/** Median duration / most frequent start time / most frequent load — each needs at least 2 sessions. */
export function historyStats(db: DB, modality: string, today: DateKey, inPeriod?: DayPeriod): HistoryStats {
  const list = pastSessions(db, modality, today)
  const durations = list.map((w) => w.durationMin ?? w.plannedDurationMin).filter((x): x is number => x != null && x > 0)
  const times = list.map((w) => w.time).filter((t): t is TimeHM => !!t && (!inPeriod || inRange(t, inPeriod)))
  const loads = list.map((w) => w.loadCategory).filter((l): l is LoadCategory => !!l)
  const t = mode(times)
  const l = mode(loads)
  return {
    sessions: list.length,
    durationMin: durations.length >= 2 ? median(durations) : undefined,
    time: t && t.count >= 2 ? t.value : undefined,
    load: l && l.count >= 2 ? l.value : undefined,
  }
}

export function inRange(time: TimeHM, period: DayPeriod): boolean {
  const [a, b] = PERIOD_RANGES[period]
  const m = hmToMinutes(time)
  return m >= hmToMinutes(a) && m < hmToMinutes(b)
}

function isLongLine(t: WeekTemplateItem): boolean {
  return !!t.isLongSession || !!t.tags?.some((x) => x.startsWith('long'))
}

/** Template lines for a modality, best first: same weekday, then fixed (long ones only if asked), then choices. */
export function templateLinesFor(db: DB, modality: string, date: DateKey, wantLong: boolean): WeekTemplateItem[] {
  const wd = weekday(date)
  const lines = db.weekTemplate.filter((t) => t.active && t.modalities.includes(modality))
  const score = (t: WeekTemplateItem) =>
    (t.weekday === wd ? 8 : 0) + (t.choice === 'fixed' && t.modalities[0] === modality ? 4 : 0) + (isLongLine(t) === wantLong ? 2 : 0)
  return [...lines].sort((a, b) => score(b) - score(a) || a.weekday - b.weekday || a.order - b.order)
}

const LOAD_FIELDS = [
  'sessionType',
  'loadCategory',
  'isKeySession',
  'isLongSession',
  'requiresPreviousDayPrep',
  'requiresPreWorkout',
  'requiresIntraWorkout',
  'requiresPostWorkout',
  'recoveryPriority',
  'tags',
] as const

/** Fields that belong to the session being replaced and must not carry over blindly. */
export const SESSION_SPECIFIC: (keyof Workout)[] = [
  ...LOAD_FIELDS,
  'plannedDurationMaxMin',
  'title',
  'plannedDurationMin',
  'plannedDistanceKm',
  'nutritionStrategyId',
  'strategyReviewedAtMin',
  'fuelDone',
  'postCheckin',
  'goal',
  'intensity',
  'workoutGoalId',
]

const GROUP_SESSION: Partial<Record<string, SessionType>> = { fun: 'fun', mobilidade: 'mobilidade', off: 'recuperacao' }

export interface SessionInput {
  modality: string
  date: DateKey
  wantLong: boolean
  time?: TimeHM
  period?: DayPeriod
  durationMin?: number
  /** The session this one replaces (swap) — its time is the last fallback. */
  replaces?: Workout
}

export interface SessionDefaults {
  fields: Partial<WorkoutDraft>
  sources: string[]
}

function label(db: DB, w: Workout): string {
  const m = findModality(db.profile, w.modality)
  return (w.title || m?.label || w.modality).toLowerCase()
}

/**
 * Planned duration, time and load of a new session of `modality`. What Marina said always wins;
 * then her history; then the weekly template; then (time only) the session it replaces.
 */
export function sessionDefaults(db: DB, today: DateKey, input: SessionInput): SessionDefaults {
  const { modality, date, period } = input
  const sources: string[] = []
  const hist = historyStats(db, modality, today, period)
  const lines = templateLinesFor(db, modality, date, input.wantLong)
  const fields: Partial<WorkoutDraft> = {}

  // Duration
  if (input.durationMin) fields.plannedDurationMin = input.durationMin
  else if (hist.durationMin) {
    fields.plannedDurationMin = hist.durationMin
    sources.push(`duração pelo seu histórico: ~${hist.durationMin} min nas últimas ${hist.sessions} sessões`)
  } else {
    const line = lines.find((t) => t.durationMin)
    if (line?.durationMin) {
      fields.plannedDurationMin = line.durationMin
      if (line.durationMaxMin) fields.plannedDurationMaxMin = line.durationMaxMin
      sources.push(`duração pelo seu template (${line.title ?? 'semana base'}): ${line.durationMin}${line.durationMaxMin ? `–${line.durationMaxMin}` : ''} min`)
    }
  }

  // Time
  if (input.time) fields.time = input.time
  else if (hist.time) {
    fields.time = hist.time
    sources.push(`horário pelo seu histórico: costuma ser ${hist.time}`)
  } else {
    const line = lines.find((t) => t.time && (!period || inRange(t.time, period)))
    const replaced = input.replaces?.time && (!period || inRange(input.replaces.time, period)) ? input.replaces : undefined
    if (line?.time) {
      fields.time = line.time
      sources.push(`horário do seu template: ${line.time}`)
    } else if (replaced?.time) {
      fields.time = replaced.time
      sources.push(`mantive o horário de antes (${replaced.time}, ${label(db, replaced)})`)
    } else if (period) {
      fields.period = period
      sources.push(`sem horário fixo — fica de ${PERIOD_LABEL[period]}`)
    }
  }
  if (fields.time) fields.period = undefined

  // Load: the template line of this weekday (or the long line when asked) defines a key session;
  // otherwise only a light/moderate category, never key flags.
  const defining = lines.find((t) => t.choice === 'fixed' && t.modalities[0] === modality && (t.weekday === weekday(date) || (input.wantLong && isLongLine(t))))
  if (defining) {
    for (const f of LOAD_FIELDS) if (defining[f] !== undefined) (fields as Record<string, unknown>)[f] = defining[f]
    fields.title = defining.title
    if (input.durationMin && defining.durationMaxMin) fields.plannedDurationMaxMin = undefined
    if (defining.isKeySession) sources.push(`segue o template de ${defining.title ?? 'sessão-chave'} 🔥`)
  } else {
    const group = modalityGroup(db.profile, modality)
    const choiceLine = lines.find((t) => t.loadCategory && t.choice !== 'fixed')
    fields.loadCategory = choiceLine?.loadCategory ?? hist.load ?? (['fun', 'mobilidade', 'off'].includes(group) ? 'leve' : 'moderada')
    fields.sessionType = choiceLine?.sessionType ?? GROUP_SESSION[group]
    fields.isKeySession = false
    fields.isLongSession = false
    fields.requiresPreviousDayPrep = false
    fields.requiresPreWorkout = false
    fields.requiresIntraWorkout = false
    fields.requiresPostWorkout = false
    fields.tags = []
  }
  return { fields, sources }
}
