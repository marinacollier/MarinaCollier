/**
 * Career activities = existing tasks, no parallel app.
 * - A QUOTA is an undated task with careerKind + targetPerWeek / targetMinutesPerWeek ("Inglês executivo 3×").
 * - A SESSION is a dated task with careerParentId (placed by the planner/Lumos in a free window), or an
 *   Occurrence on the quota (logged after the fact: "registra 30 min de inglês executivo hoje").
 * Weekly progress is a count — no percentages, no "atrasado", nothing computed from elapsed time.
 */
import { actions, getDB } from '../store'
import { logLife } from '../intel/log'
import { isCareerQuota } from '../selectors'
import type { CareerKind, DateKey, DB, ID, Occurrence, Task } from '../types'
import { addDays, startOfWeek } from '@/lib/date'
import { nowISO } from '@/lib/id'

export type Undo = () => void

export const CAREER_META: Record<CareerKind, { label: string; emoji: string; sessionMin: number; unit: 'sessões' | 'posts' | 'ações' | 'min' | 'revisão' }> = {
  ingles_exec: { label: 'Inglês executivo', emoji: '🗣️', sessionMin: 30, unit: 'sessões' },
  networking: { label: 'Networking', emoji: '🤝', sessionMin: 30, unit: 'ações' },
  post: { label: 'Conteúdo profissional', emoji: '✍️', sessionMin: 30, unit: 'posts' },
  lideranca: { label: 'Desenvolvimento de liderança', emoji: '🧭', sessionMin: 60, unit: 'min' },
  review: { label: 'Executive Career Review', emoji: '📈', sessionMin: 45, unit: 'revisão' },
}

export const careerQuotas = (db: DB): Task[] => db.tasks.filter((t) => isCareerQuota(t) && t.status !== 'archived')

export interface QuotaProgress {
  quota: Task
  kind: CareerKind
  /** Sessions done this week (or minutes, for minute-based quotas). */
  done: number
  target: number
  unit: 'vezes' | 'min'
  remaining: number
  /** Sessions already placed this week but not done yet. */
  planned: Task[]
}

function weekRange(weekStart: DateKey): [DateKey, DateKey] {
  return [weekStart, addDays(weekStart, 6)]
}

/** Week progress per quota. Done = sessions completed (placed tasks done + logged occurrences). */
export function weekProgress(db: DB, anyDayOfWeek: DateKey): QuotaProgress[] {
  const [from, to] = weekRange(startOfWeek(anyDayOfWeek))
  return careerQuotas(db).map((quota) => {
    const kind = quota.careerKind!
    const sessions = db.tasks.filter((t) => t.careerParentId === quota.id && t.date && t.date >= from && t.date <= to)
    const doneSessions = sessions.filter((t) => t.status === 'done')
    const logs = db.occurrences.filter((o) => o.parentType === 'task' && o.parentId === quota.id && o.status === 'done' && o.date >= from && o.date <= to)
    const byMinutes = !!quota.targetMinutesPerWeek && !quota.targetPerWeek
    const done = byMinutes
      ? doneSessions.reduce((s, t) => s + (t.durationMin ?? 0), 0) + logs.reduce((s, o) => s + (o.durationMin ?? 0), 0)
      : doneSessions.length + logs.length
    const target = byMinutes ? quota.targetMinutesPerWeek! : quota.targetPerWeek!
    return { quota, kind, done, target, unit: byMinutes ? 'min' : 'vezes', remaining: Math.max(0, target - done), planned: sessions.filter((t) => t.status !== 'done') }
  })
}

/** "Inglês executivo 2/3 · Networking 0/1 · Liderança 30/60 min" — one honest line. */
export function weekLine(p: QuotaProgress[]): string {
  return p.map((x) => `${CAREER_META[x.kind].label} ${x.done}/${x.target}${x.unit === 'min' ? ' min' : ''}`).join(' · ')
}

/** Quota for a kind (single by construction; undefined if Marina removed it). */
export const quotaFor = (db: DB, kind: CareerKind): Task | undefined => careerQuotas(db).find((t) => t.careerKind === kind)

/**
 * Records a session that happened. If a session was placed for that day it is marked done (same record);
 * otherwise an Occurrence is logged on the quota (minutes add up on the same day). One undo.
 */
export function logCareerActivity(kind: CareerKind, date: DateKey, opts: { minutes?: number; note?: string; by?: 'marina' | 'lumos' } = {}): { undo: Undo; title: string } | undefined {
  const db = getDB()
  const quota = quotaFor(db, kind)
  if (!quota) return undefined
  const minutes = opts.minutes ?? CAREER_META[kind].sessionMin
  const placed = db.tasks.find((t) => t.careerParentId === quota.id && t.date === date && t.status !== 'done')
  let undoWrite: Undo
  if (placed) {
    actions.update('tasks', placed.id, { status: 'done', completedAt: nowISO(), durationMin: minutes })
    undoWrite = () => actions.update('tasks', placed.id, { status: placed.status, completedAt: placed.completedAt, durationMin: placed.durationMin })
  } else {
    const existing = db.occurrences.find((o) => o.parentType === 'task' && o.parentId === quota.id && o.date === date)
    if (existing) {
      const before: Occurrence = { ...existing }
      actions.update('occurrences', existing.id, { status: 'done', durationMin: (existing.durationMin ?? 0) + minutes, note: opts.note ?? existing.note })
      undoWrite = () => actions.update('occurrences', existing.id, before)
    } else {
      const occ = actions.create('occurrences', { parentType: 'task', parentId: quota.id, date, status: 'done', completedAt: nowISO(), durationMin: minutes, note: opts.note })
      undoWrite = () => actions.remove('occurrences', occ.id)
    }
  }
  const title = `${CAREER_META[kind].label}: ${minutes} min`
  const log = logLife({ kind: 'done', date, title, area: 'trabalho', ref: { type: 'task', id: placed?.id ?? quota.id }, by: opts.by ?? 'marina', provenance: 'user' })
  return {
    title,
    undo: () => {
      log.undo()
      undoWrite()
    },
  }
}

/** A dated session for a quota (used by the planner on apply, or by Lumos "marca networking quinta 12h"). */
export function sessionDraft(quota: Task, date: DateKey, time?: string): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  const meta = CAREER_META[quota.careerKind!]
  return {
    title: `${meta.emoji} ${meta.label}`,
    status: 'todo',
    date,
    time,
    durationMin: meta.sessionMin,
    context: 'carreira',
    area: 'profissional',
    planType: 'flexivel',
    careerKind: quota.careerKind,
    careerParentId: quota.id,
    goalId: quota.goalId,
    order: 0,
  }
}

/** Sessions still to place this week (minute quotas → number of default-length sessions). */
export function sessionsToPlace(p: QuotaProgress): number {
  const missing = p.remaining
  const meta = CAREER_META[p.kind]
  const plannedUnits = p.unit === 'min' ? p.planned.reduce((s, t) => s + (t.durationMin ?? meta.sessionMin), 0) : p.planned.length
  const left = Math.max(0, missing - plannedUnits)
  return p.unit === 'min' ? Math.ceil(left / meta.sessionMin) : left
}

export const isCareerSession = (t: Task, quotaId?: ID) => !!t.careerParentId && (!quotaId || t.careerParentId === quotaId)
