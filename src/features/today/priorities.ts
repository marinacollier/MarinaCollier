/**
 * "Minhas 3 prioridades de hoje" — never more than 3 per day.
 */
import { actions, getDB } from '@/data/store'
import type { DateKey, DayPriority, DB, EntityType, ID } from '@/data/types'
import { addDays } from '@/lib/date'
import { setTaskDone } from '@/features/tasks/ops'

export const MAX_PRIORITIES = 3

export function prioritiesOf(db: DB, date: DateKey): DayPriority[] {
  return db.priorities.filter((p) => p.date === date).sort((a, b) => a.order - b.order)
}

export function canAddPriority(db: DB, date: DateKey): boolean {
  return prioritiesOf(db, date).length < MAX_PRIORITIES
}

export type AddResult = { ok: true; priority: DayPriority } | { ok: false; reason: 'full' | 'duplicate' | 'empty' }

export function addPriority(date: DateKey, title: string, ref?: { type: EntityType; id: ID }): AddResult {
  const clean = title.trim()
  if (!clean) return { ok: false, reason: 'empty' }
  const db = getDB()
  const list = prioritiesOf(db, date)
  if (list.length >= MAX_PRIORITIES) return { ok: false, reason: 'full' }
  const dup = list.some((p) => (ref && p.ref?.type === ref.type && p.ref.id === ref.id) || p.title.trim().toLowerCase() === clean.toLowerCase())
  if (dup) return { ok: false, reason: 'duplicate' }
  const order = list.reduce((m, p) => Math.max(m, p.order), -1) + 1
  const priority = actions.create('priorities', { date, title: clean, order, done: false, ref })
  return { ok: true, priority }
}

/** Check/uncheck. If the priority points at a task, the task follows. */
export function setPriorityDone(id: ID, done: boolean): void {
  const p = getDB().priorities.find((x) => x.id === id)
  if (!p) return
  actions.update('priorities', id, { done })
  if (p.ref?.type === 'task') setTaskDone(p.ref.id, done, p.date)
}

/** "levar para amanhã": copies an open priority to the next day (respecting the max of 3). */
export function carryToTomorrow(id: ID): AddResult {
  const p = getDB().priorities.find((x) => x.id === id)
  if (!p) return { ok: false, reason: 'empty' }
  return addPriority(addDays(p.date, 1), p.title, p.ref)
}

export function isCarried(db: DB, p: DayPriority): boolean {
  const next = addDays(p.date, 1)
  return prioritiesOf(db, next).some(
    (x) => (p.ref && x.ref?.type === p.ref.type && x.ref.id === p.ref.id) || x.title.trim().toLowerCase() === p.title.trim().toLowerCase(),
  )
}

export const FULL_COPY = '3 já é bastante coisa boa pra um dia 💛'
