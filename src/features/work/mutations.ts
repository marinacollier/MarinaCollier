/** Store writes used across Work OS screens. Thin wrappers around `actions` + feedback. */
import { actions, getDB, nextOrder } from '@/data/store'
import type { DateKey, ID, Project, Task, WorkInboxItem } from '@/data/types'
import { toast } from '@/app/ui-store'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'
import { todayKey } from '@/lib/date'
import { inboxPatchAfterConversion, taskFromInboxItem, withChangelog, type InboxConversion } from './selectors'

/** Complete (or un-complete) a work task. Recurring tasks toggle today's occurrence only. */
export function toggleTaskDone(task: Task, date: DateKey = todayKey()): void {
  if (task.recurrence) {
    const done = actions.toggleOccurrence('task', task.id, date)
    if (done) haptic('success')
    return
  }
  const done = task.status !== 'done'
  actions.update('tasks', task.id, done ? { status: 'done', completedAt: nowISO() } : { status: 'todo', completedAt: undefined })
  if (done) haptic('success')
}

/** Update a project, auto-appending changelog lines for status / priority / deadline changes. */
export function updateProject(id: ID, patch: Partial<Project>): void {
  const p = getDB().projects.find((x) => x.id === id)
  if (!p) return
  actions.update('projects', id, withChangelog(p, patch, todayKey()))
}

export function followUpToday(task: Task): void {
  const today = todayKey()
  actions.update('tasks', task.id, {
    waiting: { who: task.waiting?.who ?? '', since: task.waiting?.since ?? today, followUpOn: today },
  })
  haptic('light')
  toast('Follow-up marcado pra hoje 👋')
}

export function waitingArrived(task: Task): void {
  actions.update('tasks', task.id, { status: 'done', completedAt: nowISO() })
  haptic('success')
  toast('Chegou! Um a menos na cabeça ✓')
}

/** Inbox item → Task (todo or waiting). Only ever called from an explicit tap. */
export function convertInboxItem(item: WorkInboxItem, as: InboxConversion): Task {
  const db = getDB()
  const task = actions.create('tasks', taskFromInboxItem(item, as, todayKey(), nextOrder(db.tasks)))
  actions.update('workInbox', item.id, inboxPatchAfterConversion(as, task.id))
  haptic('success')
  toast(as === 'waiting' ? 'Foi pro Waiting For ⏳' : 'Virou tarefa ✓')
  return task
}

/** Keep inbox item + its task in sync for dueDate / projectId. */
export function patchInboxItem(item: WorkInboxItem, patch: Pick<Partial<WorkInboxItem>, 'dueDate' | 'projectId'>): void {
  actions.update('workInbox', item.id, patch)
  if (item.taskId && getDB().tasks.some((t) => t.id === item.taskId)) actions.update('tasks', item.taskId, patch)
}

export function setInboxStatus(item: WorkInboxItem, status: 'resolvido' | 'ignorado' | 'novo'): void {
  const prev = item.status
  actions.update('workInbox', item.id, { status })
  if (status !== 'novo') {
    haptic('light')
    toast(status === 'resolvido' ? 'Resolvido ✓' : 'Ignorado — sem culpa', {
      action: { label: 'Desfazer', run: () => actions.update('workInbox', item.id, { status: prev }) },
    })
  }
}
