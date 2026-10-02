/**
 * Cross-domain read helpers shared by Hoje, Agenda, Mari, Search and reviews.
 * Pure functions of (db, args). Use inside useMemo: `useMemo(() => tasksForDay(db, today), [db, today])`.
 * Feature-specific selectors belong in the feature folder.
 */
import type {
  Book,
  CalendarEvent,
  DailyCheckIn,
  DateKey,
  DB,
  DayPriority,
  Expense,
  ID,
  Modality,
  Project,
  RoutineItem,
  StudyItem,
  Task,
  TimeHM,
  Trip,
  Workout,
} from './types'
import { diffDays, endOfMonth, endOfWeek, hmToMinutes, startOfMonth, startOfWeek } from '@/lib/date'
import { isDue, lastDoneDate, occurrenceFor, occursOn } from '@/lib/recurrence'
import { DEFAULT_MODALITIES } from './defaults'

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

// ─── Tasks ──────────────────────────────────────────────────────────────────

export function isTaskOpen(t: Task): boolean {
  return t.status !== 'done' && t.status !== 'archived'
}

/** Done state of a task on a given day (recurring tasks use occurrences). */
export function isTaskDoneOn(db: DB, task: Task, date: DateKey): boolean {
  if (task.recurrence) return !!occurrenceFor(db.occurrences, 'task', task.id, date)
  return task.status === 'done'
}

/**
 * Tasks that belong to a day: planned for it, due on it, or recurring on it.
 * Includes tasks completed that day so the list doesn't jump when you check things.
 */
export function tasksForDay(db: DB, date: DateKey): Task[] {
  return db.tasks
    .filter((t) => {
      if (t.status === 'archived') return false
      if (t.recurrence) return occursOn(t.recurrence, date, lastDoneDate(db.occurrences, 'task', t.id))
      if (t.status === 'done') return t.completedAt?.slice(0, 10) === date || t.date === date
      return t.date === date || t.dueDate === date || (t.bucket === 'hoje' && !t.date)
    })
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order)
}

/** Open, non-recurring tasks planned before `date` — shown kindly as "ficou de antes", never "atrasado". */
export function carriedOverTasks(db: DB, date: DateKey): Task[] {
  return db.tasks.filter(
    (t) => !t.recurrence && isTaskOpen(t) && t.status !== 'waiting' && !!t.date && t.date < date,
  )
}

export function waitingFor(db: DB): Task[] {
  return db.tasks
    .filter((t) => t.status === 'waiting')
    .sort((a, b) => (a.waiting?.since ?? '').localeCompare(b.waiting?.since ?? ''))
}

export function prioritiesFor(db: DB, date: DateKey): DayPriority[] {
  return db.priorities.filter((p) => p.date === date).sort(byOrder).slice(0, 3)
}

// ─── Routines ───────────────────────────────────────────────────────────────

export function routineItemsFor(db: DB, routineId: ID, date: DateKey): RoutineItem[] {
  return db.routineItems
    .filter((i) => i.routineId === routineId && i.active && occursOn(i.recurrence, date))
    .sort(byOrder)
}

export function routineProgress(db: DB, routineId: ID, date: DateKey): { done: number; total: number } {
  const items = routineItemsFor(db, routineId, date)
  const done = items.filter((i) => occurrenceFor(db.occurrences, 'routineItem', i.id, date)).length
  return { done, total: items.length }
}

// ─── Calendar / agenda ──────────────────────────────────────────────────────

export function eventsFor(db: DB, date: DateKey): CalendarEvent[] {
  const enabled = new Set(db.calendarSources.filter((s) => s.enabled).map((s) => s.id))
  return db.events
    .filter((e) => {
      if (db.calendarSources.length && !enabled.has(e.sourceId)) return false
      if (e.recurrence) return e.date <= date && occursOn(e.recurrence, date)
      if (e.endDate) return e.date <= date && date <= e.endDate
      return e.date === date
    })
    .sort((a, b) => (a.startTime ?? '00:00').localeCompare(b.startTime ?? '00:00'))
}

export type AgendaEntryKind = 'event' | 'task' | 'workout'

/** One row in a day timeline. Built from events, timed tasks and workouts. */
export interface AgendaEntry {
  kind: AgendaEntryKind
  id: ID
  title: string
  emoji?: string
  date: DateKey
  time?: TimeHM
  endTime?: TimeHM
  allDay: boolean
  done: boolean
  /** Tone token for the dot/accent. */
  tone: string
  subtitle?: string
}

export function workoutsOn(db: DB, date: DateKey): Workout[] {
  return db.workouts
    .filter((w) => w.date === date)
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order)
}

export function modalityOf(db: DB, id: string): Modality {
  return (
    db.profile.modalities.find((m) => m.id === id) ??
    DEFAULT_MODALITIES.find((m) => m.id === id) ??
    DEFAULT_MODALITIES[DEFAULT_MODALITIES.length - 1]
  )
}

export function agendaFor(db: DB, date: DateKey): AgendaEntry[] {
  const out: AgendaEntry[] = []
  for (const e of eventsFor(db, date)) {
    out.push({
      kind: 'event',
      id: e.id,
      title: e.title,
      emoji: '📅',
      date,
      time: e.allDay ? undefined : e.startTime,
      endTime: e.endTime,
      allDay: e.allDay,
      done: false,
      tone: e.kind === 'trabalho' ? 'ink' : 'accent',
      subtitle: e.location,
    })
  }
  for (const w of workoutsOn(db, date)) {
    if (w.status === 'descanso') continue
    const m = modalityOf(db, w.modality)
    const dur = w.durationMin ?? w.plannedDurationMin
    out.push({
      kind: 'workout',
      id: w.id,
      title: w.title || m.label,
      emoji: m.emoji,
      date,
      time: w.time,
      endTime: w.time && dur ? minutesToHMSafe(hmToMinutes(w.time) + dur) : undefined,
      allDay: false,
      done: w.status === 'feito' || w.status === 'adaptado',
      tone: m.tone,
      subtitle: w.goal,
    })
  }
  for (const t of tasksForDay(db, date)) {
    if (!t.time) continue
    out.push({
      kind: 'task',
      id: t.id,
      title: t.title,
      emoji: t.context === 'trabalho' ? '💻' : '✓',
      date,
      time: t.time,
      endTime: t.durationMin ? minutesToHMSafe(hmToMinutes(t.time) + t.durationMin) : undefined,
      allDay: false,
      done: isTaskDoneOn(db, t, date),
      tone: 'sage',
    })
  }
  return out.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
  })
}

function minutesToHMSafe(min: number): TimeHM {
  const m = Math.min(min, 23 * 60 + 59)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// ─── Body ───────────────────────────────────────────────────────────────────

export function checkinFor(db: DB, date: DateKey): DailyCheckIn | undefined {
  return db.checkins.find((c) => c.date === date)
}

export function mealsOn(db: DB, date: DateKey) {
  return db.meals.filter((m) => m.date === date)
}

// ─── Money ──────────────────────────────────────────────────────────────────

export function paidExpenses(db: DB): Expense[] {
  return db.expenses.filter((e) => e.status === 'paid' && !!e.date)
}

export function expensesBetween(db: DB, from: DateKey, to: DateKey): Expense[] {
  return paidExpenses(db)
    .filter((e) => e.date! >= from && e.date! <= to)
    .sort((a, b) => b.date!.localeCompare(a.date!) || b.createdAt.localeCompare(a.createdAt))
}

export function sumCents(list: Expense[]): number {
  return list.reduce((s, e) => s + e.amountCents, 0)
}

export function spendSummary(db: DB, today: DateKey) {
  return {
    today: sumCents(expensesBetween(db, today, today)),
    week: sumCents(expensesBetween(db, startOfWeek(today), endOfWeek(today))),
    month: sumCents(expensesBetween(db, startOfMonth(today), endOfMonth(today))),
  }
}

export function categoryOf(db: DB, id: ID) {
  return db.financialCategories.find((c) => c.id === id)
}

// ─── Travel ─────────────────────────────────────────────────────────────────

/** Upcoming trips (not finished), soonest first. Trips without dates go last. */
export function upcomingTrips(db: DB, today: DateKey): Trip[] {
  return db.trips
    .filter((t) => t.status !== 'concluida' && (!t.endDate || t.endDate >= today) && (!t.startDate || t.startDate >= today || (t.endDate ?? t.startDate) >= today))
    .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || a.order - b.order)
}

export function nextTrip(db: DB, today: DateKey): Trip | undefined {
  return upcomingTrips(db, today)[0]
}

export function daysUntil(today: DateKey, date?: DateKey): number | undefined {
  return date ? diffDays(today, date) : undefined
}

// ─── Learning ───────────────────────────────────────────────────────────────

export function readingNow(db: DB): Book[] {
  return db.books.filter((b) => b.status === 'lendo').sort(byOrder)
}

export function nextBook(db: DB): Book | undefined {
  return db.books.filter((b) => b.status === 'proximo').sort(byOrder)[0]
}

export function studyingNow(db: DB): StudyItem[] {
  return db.studyItems.filter((s) => s.status === 'estudando').sort(byOrder)
}

export function nextStudy(db: DB): StudyItem | undefined {
  return db.studyItems.filter((s) => s.status === 'proximo').sort(byOrder)[0]
}

// ─── Work ───────────────────────────────────────────────────────────────────

export function activeProjects(db: DB): Project[] {
  return db.projects.filter((p) => p.status !== 'concluido').sort(byOrder)
}

export function projectTasks(db: DB, projectId: ID): Task[] {
  return db.tasks.filter((t) => t.projectId === projectId).sort(byOrder)
}

// ─── Luna ───────────────────────────────────────────────────────────────────

/** Pet tasks due on `date` (recurring due or one-off due on/before date), not yet done that day. */
export function petTasksDue(db: DB, date: DateKey) {
  return db.petTasks
    .filter((p) => p.active)
    .filter((p) => {
      if (p.recurrence) {
        const last = lastDoneDate(db.occurrences, 'petTask', p.id)
        if (occurrenceFor(db.occurrences, 'petTask', p.id, date)) return true
        return isDue(p.recurrence, date, last)
      }
      return !!p.dueDate && p.dueDate <= date
    })
    .sort(byOrder)
}
