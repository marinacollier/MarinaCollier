/**
 * How the Tarefas page slices tasks. Pure + tested.
 * Every open task lands in exactly one section; nothing is ever called "atrasado".
 */
import type { DateKey, DB, Task } from '@/data/types'
import { carriedOverTasks, isTaskDoneOn, isTaskOpen, tasksForDay } from '@/data/selectors'
import { addDays, endOfWeek, toDateKey } from '@/lib/date'

export type TaskContext = NonNullable<Task['context']>

export const CONTEXT_LABEL: Record<TaskContext, string> = {
  geral: 'Geral',
  trabalho: 'Trabalho',
  vida_real: 'Vida real',
  luna: 'Luna',
  viagem: 'Viagem',
  conteudo: 'Conteúdo',
  estudo: 'Estudo',
}

export const CONTEXT_EMOJI: Record<TaskContext, string> = {
  geral: '✓',
  trabalho: '💻',
  vida_real: '🏡',
  luna: '🐾',
  viagem: '✈️',
  conteudo: '🎬',
  estudo: '📚',
}

export type TaskSectionId = 'hoje' | 'semana' | 'depois' | 'algum_dia' | 'recorrentes' | 'esperando' | 'revisar' | 'feitas'

export interface TaskSection {
  id: TaskSectionId
  title: string
  tasks: Task[]
}

export function contextOf(t: Task): TaskContext {
  return t.context ?? 'geral'
}

const byDateThenOrder = (a: Task, b: Task) =>
  (a.date ?? a.dueDate ?? '9999').localeCompare(b.date ?? b.dueDate ?? '9999') ||
  (a.time ?? '99').localeCompare(b.time ?? '99') ||
  a.order - b.order

/** Ids of tasks that show on Hoje: today's + carried over (open ones first, done at the end). */
export function todayTasks(db: DB, today: DateKey): { open: Task[]; carried: Task[]; done: Task[] } {
  const day = tasksForDay(db, today).filter((t) => t.status !== 'waiting' && t.status !== 'review')
  const carried = carriedOverTasks(db, today)
    .filter((t) => t.status !== 'review')
    .sort(byDateThenOrder)
  return {
    open: day.filter((t) => !isTaskDoneOn(db, t, today)),
    carried,
    done: day.filter((t) => isTaskDoneOn(db, t, today)),
  }
}

export function groupTasks(db: DB, today: DateKey, context?: TaskContext): TaskSection[] {
  const match = (t: Task) => !context || contextOf(t) === context
  const weekEnd = endOfWeek(today)
  const seen = new Set<string>()
  const take = (list: Task[]) => {
    const out = list.filter((t) => match(t) && !seen.has(t.id))
    out.forEach((t) => seen.add(t.id))
    return out
  }

  const waiting = take(db.tasks.filter((t) => t.status === 'waiting').sort((a, b) => (a.waiting?.since ?? '').localeCompare(b.waiting?.since ?? '')))
  const review = take(db.tasks.filter((t) => t.status === 'review').sort(byDateThenOrder))

  const t = todayTasks(db, today)
  const hoje = take([...t.carried, ...t.open])

  const open = db.tasks.filter((x) => isTaskOpen(x) && !x.recurrence && !seen.has(x.id))
  const semana = take(
    open
      .filter((x) => {
        const d = x.date ?? x.dueDate
        if (d) return d > today && d <= weekEnd
        return x.bucket === 'semana' || x.bucket === 'hoje'
      })
      .sort(byDateThenOrder),
  )
  const depois = take(open.filter((x) => (x.date ?? x.dueDate ?? '') > weekEnd).sort(byDateThenOrder))
  const algum = take(open.filter((x) => !x.date && !x.dueDate).sort((a, b) => a.order - b.order))
  const recorrentes = take(db.tasks.filter((x) => x.recurrence && x.status !== 'archived').sort((a, b) => a.order - b.order))

  const since = addDays(today, -7)
  const feitas = db.tasks
    .filter((x) => match(x) && !x.recurrence && x.status === 'done' && !!x.completedAt && toDateKey(new Date(x.completedAt)) >= since)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 12)

  return [
    { id: 'hoje', title: 'Hoje', tasks: hoje },
    { id: 'semana', title: 'Esta semana', tasks: semana },
    { id: 'depois', title: 'Mais pra frente', tasks: depois },
    { id: 'algum_dia', title: 'Algum dia', tasks: algum },
    { id: 'esperando', title: 'Esperando', tasks: waiting },
    { id: 'revisar', title: 'Revisar / confirmar', tasks: review },
    { id: 'recorrentes', title: 'Recorrentes', tasks: recorrentes },
    { id: 'feitas', title: 'Feitas recentemente', tasks: feitas },
  ]
}
