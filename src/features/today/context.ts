/**
 * Contextual rules for Hoje (brief §36–§39, §43, §44). Pure functions of (db, today, minutes):
 * no clock reads, no names — everything comes from data (profile.work, tasks, trips, check-in).
 */
import { checkinFor, isTaskOpen, modalityOf, nextTrip, workoutsOn } from '@/data/selectors'
import { isPresencial, PERIOD_LABEL, workMode } from '@/data/planning'
import type { DailyCheckIn, DateKey, DB, Project, Task, Trip, TripItem, Weekday } from '@/data/types'
import { addDays, dayPart, diffDays, toDateKey, weekday, type DayPart } from '@/lib/date'

export type Energy = NonNullable<DailyCheckIn['energia']>

export const ENERGY_OPTIONS: { value: Energy; emoji: string; label: string }[] = [
  { value: 'alta', emoji: '⚡', label: 'Energia alta' },
  { value: 'media', emoji: '🙂', label: 'Normal' },
  { value: 'baixa', emoji: '😮‍💨', label: 'Baixa' },
]

export type HomeMode = 'normal' | 'baixa' | 'sexta' | 'fds'

export interface HomeContext {
  part: DayPart
  weekday: Weekday
  energy?: Energy
  weekend: boolean
  /** Friday evening: "Fechando a semana ✨". */
  fridayEvening: boolean
  /** Sunday with work OFF: never auto-fill with things left from before. */
  sundayOff: boolean
  tomorrowPresencial: boolean
  /** A workout (not rest) is planned or done today. */
  hasWorkoutToday: boolean
  /** Trip starting within 7 days (or happening now). */
  tripSoon?: { trip: Trip; days: number }
  /** ≥ 3 work deadlines in the next days: personal low-priority things sink. */
  busyWorkWeek: boolean
  mode: HomeMode
}

export const TRIP_SOON_DAYS = 7
export const BUSY_WINDOW_DAYS = 4
export const BUSY_DEADLINES = 3

export function isWorkTask(t: Task): boolean {
  return t.context === 'trabalho' || !!t.projectId
}

/** Work deadlines between today and today + BUSY_WINDOW_DAYS (tasks + project deliveries). */
export function workDeadlinesAhead(db: DB, today: DateKey): number {
  const end = addDays(today, BUSY_WINDOW_DAYS)
  const inRange = (d?: DateKey) => !!d && d >= today && d <= end
  const tasks = db.tasks.filter((t) => isWorkTask(t) && isTaskOpen(t) && !t.recurrence && inRange(t.dueDate)).length
  const deliveries = db.projects.filter((p) => p.status !== 'concluido' && p.kind !== 'creator' && inRange(p.nextDelivery?.date)).length
  return tasks + deliveries
}

export function homeContext(db: DB, today: DateKey, minutes: number): HomeContext {
  const part = dayPart(minutes, db.profile.dayParts)
  const wd = weekday(today)
  const energy = checkinFor(db, today)?.energia
  const weekend = wd === 0 || wd === 6
  const fridayEvening = wd === 5 && part === 'noite'
  const sundayOff = wd === 0 && workMode(db.profile, today) === 'off'
  const trip = nextTrip(db, today)
  const days = trip?.startDate ? diffDays(today, trip.startDate) : undefined
  const tripSoon = trip && days !== undefined && days <= TRIP_SOON_DAYS ? { trip, days: Math.max(days, 0) } : undefined
  const mode: HomeMode = energy === 'baixa' ? 'baixa' : fridayEvening ? 'sexta' : weekend ? 'fds' : 'normal'
  return {
    part,
    weekday: wd,
    energy,
    weekend,
    fridayEvening,
    sundayOff,
    tomorrowPresencial: isPresencial(db.profile, addDays(today, 1)),
    hasWorkoutToday: workoutsOn(db, today).some((w) => w.status !== 'descanso' && w.status !== 'pulado'),
    tripSoon,
    busyWorkWeek: workDeadlinesAhead(db, today) >= BUSY_DEADLINES,
    mode,
  }
}

// ─── Tasks on Hoje ──────────────────────────────────────────────────────────

/**
 * Order of today's open tasks. When the work week is busy, work comes first and personal
 * low-priority things sink ("organizar livros" never above three deadlines).
 */
export function sortForFocus(tasks: Task[], ctx: Pick<HomeContext, 'busyWorkWeek'>): Task[] {
  if (!ctx.busyWorkWeek) return tasks
  const rank = (t: Task) => (isWorkTask(t) ? 0 : t.priority === 'alta' ? 1 : t.priority === 'baixa' || !t.priority ? 3 : 2)
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map((x) => x.t)
}

/** Sunday OFF never gets auto-filled with things left from before. */
export function showCarried(ctx: Pick<HomeContext, 'sundayOff' | 'mode'>): boolean {
  return !ctx.sundayOff && ctx.mode !== 'baixa' && ctx.mode !== 'sexta'
}

// ─── Trip soon ──────────────────────────────────────────────────────────────

const CRITICAL_SECTIONS: TripItem['section'][] = ['voo', 'hospedagem', 'documento', 'reserva', 'transporte', 'antes_de_ir']

export interface TripPending {
  key: string
  title: string
  kind: 'tripItem' | 'task'
  id: string
  /** 'a_confirmar' items say so — never "atrasado". */
  status: 'a_confirmar' | 'a_fazer'
}

/** The few pending things that matter before a trip: logistics first, then dated items, then the rest. */
export function tripPriorityItems(db: DB, trip: Trip, limit = 3): TripPending[] {
  const items = db.tripItems
    .filter((i) => i.tripId === trip.id && (i.status === 'a_fazer' || i.status === 'a_confirmar'))
    .map((i) => ({
      score: (CRITICAL_SECTIONS.includes(i.section) ? 0 : 10) + (i.date ? 0 : 5),
      date: i.date ?? '9999',
      order: i.order,
      p: { key: `ti-${i.id}`, title: i.title, kind: 'tripItem' as const, id: i.id, status: i.status === 'a_confirmar' ? ('a_confirmar' as const) : ('a_fazer' as const) },
    }))
  const tasks = db.tasks
    .filter((t) => t.tripId === trip.id && isTaskOpen(t) && t.status !== 'waiting')
    .map((t) => ({
      score: t.priority === 'alta' ? -1 : 3,
      date: t.dueDate ?? t.date ?? '9999',
      order: t.order,
      p: { key: `t-${t.id}`, title: t.title, kind: 'task' as const, id: t.id, status: t.status === 'review' ? ('a_confirmar' as const) : ('a_fazer' as const) },
    }))
  return [...tasks, ...items]
    .sort((a, b) => a.score - b.score || a.date.localeCompare(b.date) || a.order - b.order)
    .slice(0, limit)
    .map((x) => x.p)
}

// ─── Friday: "Fechando a semana ✨" ──────────────────────────────────────────

export interface WeekWrap {
  tasksDone: number
  workoutsDone: number
  prioritiesDone: number
  routineDays: number
}

/** What got done this week (Mon → today). Facts only, no score. */
export function weekWrap(db: DB, today: DateKey, routineId?: string): WeekWrap {
  const wd = weekday(today)
  const monday = addDays(today, -((wd + 6) % 7))
  const inWeek = (d?: string) => !!d && d >= monday && d <= today
  const dayOf = (iso?: string) => (iso ? toDateKey(new Date(iso)) : undefined)
  const routineItems = new Set(db.routineItems.filter((i) => i.routineId === routineId).map((i) => i.id))
  const routineDays = new Set(
    db.occurrences.filter((o) => o.parentType === 'routineItem' && o.status === 'done' && routineItems.has(o.parentId) && inWeek(o.date)).map((o) => o.date),
  ).size
  return {
    tasksDone:
      db.tasks.filter((t) => !t.recurrence && t.status === 'done' && inWeek(dayOf(t.completedAt))).length +
      db.occurrences.filter((o) => o.parentType === 'task' && o.status === 'done' && inWeek(o.date)).length,
    workoutsDone: db.workouts.filter((w) => (w.status === 'feito' || w.status === 'adaptado') && inWeek(w.date)).length,
    prioritiesDone: db.priorities.filter((p) => p.done && inWeek(p.date)).length,
    routineDays,
  }
}

// ─── "HOJE" line (§37) ──────────────────────────────────────────────────────

export interface SummaryBit {
  key: 'work' | 'workout' | 'project'
  emoji: string
  text: string
}

/** "📍 Trabalho presencial · Interlagos · 🏊 Natação 07:00 · 💻 projeto prioritário". */
export function daySummary(db: DB, today: DateKey): SummaryBit[] {
  const out: SummaryBit[] = []
  const mode = workMode(db.profile, today)
  const place = db.profile.work?.location?.split(',')[0]?.trim()
  if (mode === 'presencial') out.push({ key: 'work', emoji: '📍', text: `Trabalho presencial${place ? ` · ${place}` : ''}` })
  else if (mode === 'remoto') out.push({ key: 'work', emoji: '💻', text: 'Trabalho remoto' })
  else if (mode === 'flexivel') out.push({ key: 'work', emoji: '💻', text: 'Trabalho flexível' })
  else out.push({ key: 'work', emoji: '🌿', text: weekday(today) === 0 ? 'Domingo é OFF' : 'Sem trabalho hoje' })

  const workouts = workoutsOn(db, today).filter((w) => w.status !== 'pulado')
  const active = workouts.find((w) => w.status !== 'descanso')
  if (active) {
    const m = modalityOf(db, active.modality)
    const when = active.time ?? (active.period ? PERIOD_LABEL[active.period] : undefined)
    out.push({ key: 'workout', emoji: m.emoji, text: `${active.title || m.label}${when ? ` ${when}` : ''}` })
  } else if (workouts.some((w) => w.status === 'descanso')) {
    out.push({ key: 'workout', emoji: '🌿', text: 'Recovery' })
  }

  if (mode !== 'off') {
    const project = priorityProject(db, today)
    if (project) out.push({ key: 'project', emoji: project.emoji, text: project.name })
  }
  return out
}

/** The project that matters today: first one referenced by the work (or main) Top 3, else the nearest delivery. */
export function priorityProject(db: DB, today: DateKey): Project | undefined {
  const byId = (id?: string) => (id ? db.projects.find((p) => p.id === id && p.status !== 'concluido') : undefined)
  const pri = db.priorities
    .filter((p) => p.date === today && (p.domain === 'trabalho' || !p.domain) && !p.done)
    .sort((a, b) => Number(a.domain !== 'trabalho') - Number(b.domain !== 'trabalho') || a.order - b.order)
  for (const p of pri) {
    if (p.ref?.type === 'project' && byId(p.ref.id)) return byId(p.ref.id)
    if (p.ref?.type === 'task') {
      const t = db.tasks.find((x) => x.id === p.ref!.id)
      if (byId(t?.projectId)) return byId(t?.projectId)
    }
  }
  return db.projects
    .filter((p) => p.status === 'ativo' && p.kind !== 'creator')
    .map((p) => ({ p, d: [p.nextDelivery?.date, p.deadline].filter((d): d is string => !!d && d >= today).sort()[0] }))
    .filter((x) => x.d)
    .sort((a, b) => a.d!.localeCompare(b.d!) || a.p.order - b.p.order)[0]?.p
}
