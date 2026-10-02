/**
 * Weekly review: pure aggregation of one week (Monday..Sunday) of Marina's data.
 * Everything here is a function of (db, weekStart) so it is easy to test and reuse.
 */
import type {
  Area,
  CalendarEvent,
  Book,
  DateKey,
  DayPriority,
  DB,
  Goal,
  Project,
  ProfessionalWin,
  StudyItem,
  Task,
  WeeklyReview,
} from '@/data/types'
import { eventsFor, expensesBetween, isTaskOpen } from '@/data/selectors'
import { eventOccursOn } from '@/data/planning'
import { addDays, startOfWeek, weekday } from '@/lib/date'
import { normalize } from '@/lib/text'
import {
  inRange,
  isoToKey,
  isWorkoutDone,
  plural,
  spendBreakdown,
  workoutsByModality,
  type CategorySpend,
} from './shared'
import { formatBRLShort } from '@/lib/money'

export type QuestionKey = keyof WeeklyReview['answers']

export const QUESTIONS: { key: QuestionKey; question: string; placeholder: string }[] = [
  { key: 'certo', question: 'O que deu certo?', placeholder: 'Pequenas vitórias contam muito…' },
  { key: 'pendente', question: 'O que ficou pendente?', placeholder: 'Sem culpa — só pra saber o que leva adiante.' },
  { key: 'gostei', question: 'Do que eu mais gostei?', placeholder: 'Um momento, uma conversa, um treino…' },
  { key: 'corpo', question: 'Como meu corpo respondeu?', placeholder: 'Energia, sono, treinos, dores…' },
  { key: 'dinheiro', question: 'Onde meu dinheiro foi?', placeholder: 'Só olhar, sem julgamento.' },
  { key: 'projeto', question: 'Qual projeto avançou?', placeholder: 'O que andou de verdade?' },
  { key: 'evitando', question: 'O que estou evitando?', placeholder: 'Às vezes nomear já destrava.' },
  { key: 'atencao', question: 'O que precisa da minha atenção agora?', placeholder: 'Uma coisa de cada vez.' },
]

/** Which week to review today: on Monday it's the week that just ended, otherwise the current one. */
export function reviewWeekFor(today: DateKey): DateKey {
  const ws = startOfWeek(today)
  return weekday(today) === 1 ? addDays(ws, -7) : ws
}

/**
 * A review-style calendar event with a checklist template on the Saturday of this week
 * (e.g. "Weekly CEO Review"). Found from data only: any event with `template` occurring that day.
 */
export function reviewEventOfWeek(db: DB, weekStartIn: DateKey): { event: CalendarEvent; date: DateKey } | undefined {
  const saturday = addDays(startOfWeek(weekStartIn), 5)
  const event = db.events.find((e) => !!e.template?.length && eventOccursOn(e, saturday))
  return event ? { event, date: saturday } : undefined
}

export function nextMonday(weekStart: DateKey): DateKey {
  return addDays(startOfWeek(weekStart), 7)
}

export function findWeeklyReview(reviews: WeeklyReview[], weekStart: DateKey): WeeklyReview | undefined {
  return reviews.find((r) => r.weekStart === weekStart)
}

export interface WeekData {
  weekStart: DateKey
  weekEnd: DateKey
  events: number
  tasksDone: number
  openTasks: Task[]
  openPriorities: DayPriority[]
  workouts: { done: number; planned: number; byModality: { label: string; emoji: string; count: number }[] }
  /** e.g. ['energia alta', 'corpo forte'] — the most frequent check-in words of the week. */
  bodyWords: string[]
  money: { total: number; count: number; top: CategorySpend[] }
  projects: { project: Project; updates: number }[]
  wins: ProfessionalWin[]
  studiesFinished: StudyItem[]
  studiesMoving: StudyItem[]
  booksFinished: Book[]
  life: { done: number; titles: string[] }
  goals: { done: number; total: number; open: Goal[] }
}

const ENERGY_WORD = { baixa: 'energia baixa', media: 'energia média', alta: 'energia alta' } as const
const BODY_WORD = { cansado: 'corpo cansado', normal: 'corpo normal', forte: 'corpo forte' } as const
const SLEEP_WORD = { ruim: 'sono ruim', ok: 'sono ok', bom: 'sono bom' } as const

function topWord<T extends string>(values: (T | undefined)[], words: Record<T, string>): string | undefined {
  const by = new Map<T, number>()
  for (const v of values) if (v) by.set(v, (by.get(v) ?? 0) + 1)
  const best = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
  return best ? words[best[0]] : undefined
}

export function weekData(db: DB, weekStartIn: DateKey): WeekData {
  const weekStart = startOfWeek(weekStartIn)
  const weekEnd = addDays(weekStart, 6)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const inWeek = (k?: DateKey) => inRange(k, weekStart, weekEnd)

  const events = days.reduce((n, d) => n + eventsFor(db, d).length, 0)

  const doneOnce = db.tasks.filter((t) => !t.recurrence && t.status === 'done' && inWeek(isoToKey(t.completedAt)))
  const recurringDone = db.occurrences.filter((o) => o.parentType === 'task' && o.status === 'done' && inWeek(o.date))
  const tasksDone = doneOnce.length + recurringDone.length

  const openTasks = db.tasks
    .filter((t) => !t.recurrence && isTaskOpen(t) && t.status !== 'waiting')
    .filter((t) => inWeek(t.date) || inWeek(t.dueDate))
    .sort((a, b) => (a.date ?? a.dueDate ?? '').localeCompare(b.date ?? b.dueDate ?? '') || a.order - b.order)
  const openPriorities = db.priorities
    .filter((p) => !p.done && inWeek(p.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)

  const weekWorkouts = db.workouts.filter((w) => inWeek(w.date) && w.status !== 'descanso')
  const doneWorkouts = weekWorkouts.filter(isWorkoutDone)

  const checkins = db.checkins.filter((c) => inWeek(c.date))
  const bodyWords = [
    topWord(
      checkins.map((c) => c.energia),
      ENERGY_WORD,
    ),
    topWord(
      checkins.map((c) => c.corpo),
      BODY_WORD,
    ),
    topWord(
      checkins.map((c) => c.sono),
      SLEEP_WORD,
    ),
  ].filter((w): w is string => !!w)

  const money = spendBreakdown(db, expensesBetween(db, weekStart, weekEnd))

  const wins = db.wins.filter((w) => inWeek(w.date)).sort((a, b) => a.date.localeCompare(b.date))
  const projects = db.projects
    .map((project) => {
      const updates =
        project.changelog.filter((c) => inWeek(c.date)).length +
        project.decisions.filter((c) => inWeek(c.date)).length +
        doneOnce.filter((t) => t.projectId === project.id).length +
        wins.filter((w) => w.projectId === project.id).length +
        db.milestones.filter((m) => m.projectId === project.id && m.done && inWeek(isoToKey(m.updatedAt))).length
      return { project, updates }
    })
    .filter((p) => p.updates > 0)
    .sort((a, b) => b.updates - a.updates || a.project.order - b.project.order)

  const studiesFinished = db.studyItems.filter((s) => s.status === 'finalizado' && inWeek(s.finishedAt))
  const studiesMoving = db.studyItems.filter((s) => s.status === 'estudando' && inWeek(isoToKey(s.updatedAt)))
  const booksFinished = db.books.filter((b) => b.status === 'finalizado' && inWeek(b.endDate))

  const lifeTasks = doneOnce.filter((t) => t.context === 'vida_real' || t.context === 'luna')
  const petDone = db.occurrences.filter((o) => o.parentType === 'petTask' && o.status === 'done' && inWeek(o.date))
  const lifeRecurring = recurringDone.filter((o) => {
    const t = db.tasks.find((x) => x.id === o.parentId)
    return t?.context === 'vida_real' || t?.context === 'luna'
  })

  const weekGoals = db.goals.filter((g) => g.level === 'semana' && g.period === weekStart && g.status !== 'solta')

  return {
    weekStart,
    weekEnd,
    events,
    tasksDone,
    openTasks,
    openPriorities,
    workouts: {
      done: doneWorkouts.length,
      planned: weekWorkouts.length,
      byModality: workoutsByModality(db, doneWorkouts),
    },
    bodyWords,
    money,
    projects,
    wins,
    studiesFinished,
    studiesMoving,
    booksFinished,
    life: { done: lifeTasks.length + petDone.length + lifeRecurring.length, titles: lifeTasks.map((t) => t.title) },
    goals: {
      done: weekGoals.filter((g) => g.status === 'feita').length,
      total: weekGoals.length,
      open: weekGoals
        .filter((g) => g.status !== 'feita')
        .sort((a, b) => Number(b.big) - Number(a.big) || a.order - b.order),
    },
  }
}

const list = (items: string[], max = 3) => {
  const shown = items.slice(0, max)
  const rest = items.length - shown.length
  return shown.join(', ') + (rest > 0 ? ` e mais ${rest}` : '')
}

/** A small, factual hint under each question. Undefined when there's nothing worth saying. */
export function weeklyHints(d: WeekData): Partial<Record<QuestionKey, string>> {
  const h: Partial<Record<QuestionKey, string>> = {}

  const good: string[] = []
  if (d.goals.done) good.push(plural(d.goals.done, 'meta feita', 'metas feitas'))
  if (d.tasksDone) good.push(plural(d.tasksDone, 'tarefa concluída', 'tarefas concluídas'))
  if (d.workouts.done) good.push(plural(d.workouts.done, 'treino', 'treinos'))
  if (d.wins.length) good.push(plural(d.wins.length, 'win', 'wins'))
  if (good.length) h.certo = `Nessa semana: ${good.join(' · ')}.`

  const pending = [
    ...d.goals.open.map((g) => g.title),
    ...d.openPriorities.map((p) => p.title),
    ...d.openTasks.map((t) => t.title),
  ]
  if (pending.length) h.pendente = `Ficou em aberto: ${list(dedupe(pending))}.`

  const body: string[] = []
  if (d.workouts.planned || d.workouts.done) body.push(`${d.workouts.done} de ${d.workouts.planned} treinos feitos`)
  if (d.bodyWords.length) body.push(d.bodyWords.join(', '))
  if (body.length) h.corpo = body.join(' · ') + '.'

  if (d.money.count) {
    const top = d.money.top.map((c) => `${c.emoji} ${c.name} ${formatBRLShort(c.cents)}`).join(' · ')
    h.dinheiro = `${formatBRLShort(d.money.total)} na semana. Mais em: ${top}.`
  }

  if (d.projects.length) {
    h.projeto = `Mais movimento em: ${list(
      d.projects.map((p) => `${p.project.emoji} ${p.project.name}`),
      2,
    )}.`
  }

  if (d.openTasks.length) {
    h.evitando = `Talvez algo daqui: ${list(
      d.openTasks.map((t) => t.title),
      2,
    )}?`
  }

  const attention = [...d.goals.open.filter((g) => g.big).map((g) => g.title), ...d.openPriorities.map((p) => p.title)]
  if (attention.length) h.atencao = `No radar: ${list(dedupe(attention), 2)}.`

  const liked: string[] = []
  if (d.booksFinished.length) liked.push(`terminou ${d.booksFinished[0].title}`)
  if (d.studiesFinished.length) liked.push(`finalizou ${d.studiesFinished[0].title}`)
  if (d.wins.length) liked.push(d.wins[0].title)
  if (liked.length) h.gostei = `Lembra: ${list(liked, 2)}.`

  return h
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter((t) => {
    const k = normalize(t)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export interface PrioritySuggestion {
  title: string
  category: Area
}

/** Suggestions for next week's 3 priorities, from what stayed open. Max `max`. */
export function prioritySuggestions(d: WeekData, max = 6): PrioritySuggestion[] {
  const out: PrioritySuggestion[] = []
  const seen = new Set<string>()
  const push = (title: string, category: Area) => {
    const k = normalize(title)
    if (!k || seen.has(k) || out.length >= max) return
    seen.add(k)
    out.push({ title, category })
  }
  for (const g of d.goals.open) push(g.title, g.category)
  for (const p of d.openPriorities) push(p.title, 'pessoal')
  const byPriority = [...d.openTasks].sort((a, b) => rank(a.priority) - rank(b.priority))
  for (const t of byPriority) push(t.title, t.area ?? (t.context === 'trabalho' ? 'profissional' : 'pessoal'))
  return out
}

const rank = (p?: Task['priority']) => (p === 'alta' ? 0 : p === 'media' ? 1 : p === 'baixa' ? 3 : 2)

/**
 * Goals to create for next week's priorities: level 'semana', big, period = next Monday.
 * Skips titles that already exist that week; never makes more than 3 big for the week.
 */
export function goalsForPriorities(
  goals: Goal[],
  weekStart: DateKey,
  priorities: PrioritySuggestion[],
): Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'order'>[] {
  const period = nextMonday(weekStart)
  const existing = goals.filter((g) => g.level === 'semana' && g.period === period && g.status !== 'solta')
  const titles = new Set(existing.map((g) => normalize(g.title)))
  let bigSlots = 3 - existing.filter((g) => g.big).length
  const out: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'order'>[] = []
  for (const p of priorities.slice(0, 3)) {
    const k = normalize(p.title)
    if (!k || titles.has(k)) continue
    titles.add(k)
    const big = bigSlots > 0
    if (big) bigSlots--
    out.push({ title: p.title.trim(), level: 'semana', period, big, category: p.category, status: 'ativa' })
  }
  return out
}
