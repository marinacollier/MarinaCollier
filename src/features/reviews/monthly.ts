/**
 * "Meu mês": pure aggregation of one calendar month ('YYYY-MM').
 */
import type { Book, DateKey, DB, Goal, MonthlyReview, Project, ProfessionalWin, StudyItem, Trip } from '@/data/types'
import { expensesBetween } from '@/data/selectors'
import { addMonths, endOfMonth, MONTHS } from '@/lib/date'
import { inRange, isoToKey, isWorkoutDone, spendBreakdown, workoutsByModality, type CategorySpend } from './shared'

export const monthStart = (month: string): DateKey => `${month}-01`

export function shiftMonth(month: string, n: number): string {
  return addMonths(monthStart(month), n).slice(0, 7)
}

/** "outubro 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

export function findMonthlyReview(reviews: MonthlyReview[], month: string): MonthlyReview | undefined {
  return reviews.find((r) => r.month === month)
}

export interface AutoHighlight {
  kind: 'viagem' | 'win' | 'projeto'
  date?: DateKey
  text: string
  emoji: string
}

export interface MonthData {
  month: string
  from: DateKey
  to: DateKey
  trips: Trip[]
  wins: ProfessionalWin[]
  changelog: { project: Project; date: DateKey; text: string }[]
  projectsTouched: Project[]
  workouts: { total: number; byModality: { id: string; label: string; emoji: string; count: number }[] }
  spend: { total: number; count: number; top: CategorySpend[] }
  studiesFinished: StudyItem[]
  booksFinished: Book[]
  goalsDone: Goal[]
  notesCreated: number
  autoHighlights: AutoHighlight[]
}

/** A trip touches the month if any of its days fall inside it. */
function tripInMonth(t: Trip, from: DateKey, to: DateKey): boolean {
  if (!t.startDate) return false
  const end = t.endDate ?? t.startDate
  return t.startDate <= to && end >= from
}

export function monthData(db: DB, month: string): MonthData {
  const from = monthStart(month)
  const to = endOfMonth(from)
  const inMonth = (k?: DateKey) => inRange(k, from, to)

  const trips = db.trips
    .filter((t) => tripInMonth(t, from, to))
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
  const wins = db.wins.filter((w) => inMonth(w.date)).sort((a, b) => a.date.localeCompare(b.date))
  const changelog = db.projects
    .flatMap((project) =>
      project.changelog.filter((c) => inMonth(c.date)).map((c) => ({ project, date: c.date, text: c.text })),
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  const doneTasks = db.tasks.filter((t) => t.status === 'done' && inMonth(isoToKey(t.completedAt)))
  const touched = new Set<string>([
    ...changelog.map((c) => c.project.id),
    ...wins.flatMap((w) => (w.projectId ? [w.projectId] : [])),
    ...doneTasks.flatMap((t) => (t.projectId ? [t.projectId] : [])),
    ...db.projects.filter((p) => p.decisions.some((d) => inMonth(d.date))).map((p) => p.id),
  ])
  const projectsTouched = db.projects.filter((p) => touched.has(p.id)).sort((a, b) => a.order - b.order)

  const doneWorkouts = db.workouts.filter((w) => inMonth(w.date) && isWorkoutDone(w))

  const goalsDone = db.goals.filter((g) => {
    if (g.status !== 'feita') return false
    if (g.level !== 'maior' && g.period) return inMonth(g.period)
    return inMonth(isoToKey(g.updatedAt))
  })

  const autoHighlights: AutoHighlight[] = [
    ...trips.map((t) => ({ kind: 'viagem' as const, date: t.startDate, text: `${t.name}`, emoji: t.flag || '✈️' })),
    ...wins.map((w) => ({ kind: 'win' as const, date: w.date, text: w.title, emoji: '✨' })),
    ...changelog.map((c) => ({
      kind: 'projeto' as const,
      date: c.date,
      text: `${c.project.name}: ${c.text}`,
      emoji: c.project.emoji,
    })),
  ].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  return {
    month,
    from,
    to,
    trips,
    wins,
    changelog,
    projectsTouched,
    workouts: { total: doneWorkouts.length, byModality: workoutsByModality(db, doneWorkouts) },
    spend: spendBreakdown(db, expensesBetween(db, from, to), 4),
    studiesFinished: db.studyItems.filter((s) => s.status === 'finalizado' && inMonth(s.finishedAt)),
    booksFinished: db.books.filter((b) => b.status === 'finalizado' && inMonth(b.endDate)),
    goalsDone,
    notesCreated: db.notes.filter((n) => inMonth(isoToKey(n.createdAt))).length,
    autoHighlights,
  }
}
