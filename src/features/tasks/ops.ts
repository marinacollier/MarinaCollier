/**
 * Task writes shared by Hoje, Tarefas and the Top 3.
 * Recurring tasks complete through Occurrences (the rule is never marked done).
 */
import { actions, getDB } from '@/data/store'
import { isTaskDoneOn } from '@/data/selectors'
import type { DateKey, ID, Task } from '@/data/types'
import { nowISO } from '@/lib/id'
import { todayKey } from '@/lib/date'

/** Set the done-state of a task on a day. Keeps Top 3 priorities pointing at it in sync. */
export function setTaskDone(taskId: ID, done: boolean, date: DateKey = todayKey()): void {
  const db = getDB()
  const task = db.tasks.find((t) => t.id === taskId)
  if (!task) return
  if (task.recurrence) {
    if (isTaskDoneOn(db, task, date) !== done) actions.toggleOccurrence('task', task.id, date)
  } else {
    actions.update('tasks', task.id, done ? { status: 'done', completedAt: nowISO() } : { status: 'todo', completedAt: undefined })
  }
  for (const p of getDB().priorities) {
    if (p.date === date && p.ref?.type === 'task' && p.ref.id === task.id && p.done !== done) {
      actions.update('priorities', p.id, { done })
    }
  }
}

export function toggleTaskDone(task: Task, date: DateKey = todayKey()): boolean {
  const next = !isTaskDoneOn(getDB(), task, date)
  setTaskDone(task.id, next, date)
  return next
}
