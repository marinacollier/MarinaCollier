/**
 * Top 3 — the day's main three, plus up to three per domain (Trabalho · Corpo · Vida).
 * Never more than 3 in any list. `domain: undefined` = the main Top 3.
 */
import { actions, getDB } from '@/data/store'
import type { DateKey, DayPriority, DB, EntityType, ID } from '@/data/types'
import { addDays } from '@/lib/date'
import { setTaskDone } from '@/features/tasks/ops'

export const MAX_PRIORITIES = 3

export type PriorityDomain = NonNullable<DayPriority['domain']>
/** 'main' = the day's Top 3. */
export type PriorityList = 'main' | PriorityDomain

export const DOMAINS: { value: PriorityList; label: string; emoji: string }[] = [
  { value: 'main', label: 'Hoje', emoji: '✨' },
  { value: 'trabalho', label: 'Trabalho', emoji: '💻' },
  { value: 'corpo', label: 'Corpo', emoji: '🏃‍♀️' },
  { value: 'vida', label: 'Vida', emoji: '🌿' },
]

const domainOf = (list: PriorityList): PriorityDomain | undefined => (list === 'main' ? undefined : list)

export function prioritiesOf(db: DB, date: DateKey, list: PriorityList = 'main'): DayPriority[] {
  const domain = domainOf(list)
  return db.priorities.filter((p) => p.date === date && p.domain === domain).sort((a, b) => a.order - b.order)
}

export function canAddPriority(db: DB, date: DateKey, list: PriorityList = 'main'): boolean {
  return prioritiesOf(db, date, list).length < MAX_PRIORITIES
}

export type AddResult = { ok: true; priority: DayPriority } | { ok: false; reason: 'full' | 'duplicate' | 'empty' }

export function addPriority(date: DateKey, title: string, ref?: { type: EntityType; id: ID }, list: PriorityList = 'main'): AddResult {
  const clean = title.trim()
  if (!clean) return { ok: false, reason: 'empty' }
  const db = getDB()
  const current = prioritiesOf(db, date, list)
  if (current.length >= MAX_PRIORITIES) return { ok: false, reason: 'full' }
  const dup = current.some((p) => (ref && p.ref?.type === ref.type && p.ref.id === ref.id) || p.title.trim().toLowerCase() === clean.toLowerCase())
  if (dup) return { ok: false, reason: 'duplicate' }
  const order = current.reduce((m, p) => Math.max(m, p.order), -1) + 1
  const domain = domainOf(list)
  const priority = actions.create('priorities', { date, title: clean, order, done: false, ref, ...(domain ? { domain } : {}) })
  return { ok: true, priority }
}

/** Check/uncheck. If the priority points at a task, the task follows. */
export function setPriorityDone(id: ID, done: boolean): void {
  const p = getDB().priorities.find((x) => x.id === id)
  if (!p) return
  actions.update('priorities', id, { done })
  if (p.ref?.type === 'task') setTaskDone(p.ref.id, done, p.date)
}

/** "levar para amanhã": copies an open priority to the next day, same list (respecting the max of 3). */
export function carryToTomorrow(id: ID): AddResult {
  const p = getDB().priorities.find((x) => x.id === id)
  if (!p) return { ok: false, reason: 'empty' }
  return addPriority(addDays(p.date, 1), p.title, p.ref, p.domain ?? 'main')
}

export function isCarried(db: DB, p: DayPriority): boolean {
  const next = addDays(p.date, 1)
  return prioritiesOf(db, next, p.domain ?? 'main').some(
    (x) => (p.ref && x.ref?.type === p.ref.type && x.ref.id === p.ref.id) || x.title.trim().toLowerCase() === p.title.trim().toLowerCase(),
  )
}

/** §46 — said gently when trying to add a 4th. */
export const FULL_COPY = 'Tem coisa demais aqui. Escolhe três.'
