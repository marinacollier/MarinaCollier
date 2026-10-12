/**
 * Bíblia, Graça & Liberdade — pure selectors. Progress is ALWAYS sessions concluded / total
 * (opening a page or generating a study never counts). Plan status is derived from its sessions.
 */
import type { DateKey, DB, ID, SpiritualJournalEntry, SpiritualPlan, SpiritualPlanStatus, SpiritualSession } from '../types'
import { toDateKey } from '@/lib/date'

export interface Progress {
  done: number
  total: number
  /** 0..100, rounded. */
  pct: number
}

const progress = (done: number, total: number): Progress => ({ done, total, pct: total ? Math.round((done / total) * 100) : 0 })

export const isDone = (s: SpiritualSession) => s.status === 'concluido'

export function plansOf(db: DB): SpiritualPlan[] {
  return [...db.spiritualPlans].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
}

export function sessionsOf(db: DB, planId: ID): SpiritualSession[] {
  return db.spiritualSessions.filter((s) => s.planId === planId).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function planProgress(db: DB, planId: ID): Progress {
  const list = sessionsOf(db, planId)
  return progress(list.filter(isDone).length, list.length)
}

export function totalProgress(db: DB): Progress {
  const plans = new Set(db.spiritualPlans.map((p) => p.id))
  const list = db.spiritualSessions.filter((s) => plans.has(s.planId))
  return progress(list.filter(isDone).length, list.length)
}

export function planStatus(db: DB, planId: ID): SpiritualPlanStatus {
  const list = sessionsOf(db, planId)
  const done = list.filter(isDone).length
  if (list.length && done === list.length) return 'concluido'
  if (done > 0 || list.some((s) => s.status === 'em_andamento')) return 'em_andamento'
  return 'nao_iniciado'
}

export const PLAN_STATUS_LABEL: Record<SpiritualPlanStatus, string> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
}

/** The plan she is walking now: the first in progress; else the first not started. */
export function currentPlan(db: DB): SpiritualPlan | undefined {
  const plans = plansOf(db)
  return plans.find((p) => planStatus(db, p.id) === 'em_andamento') ?? plans.find((p) => planStatus(db, p.id) === 'nao_iniciado')
}

/** Next session to study: the first not concluded, in order (of a given plan, or of the current one). */
export function nextSession(db: DB, planId?: ID): SpiritualSession | undefined {
  const id = planId ?? currentPlan(db)?.id
  return id ? sessionsOf(db, id).find((s) => !isDone(s)) : undefined
}

export interface BlockGroup {
  title: string
  sessions: SpiritualSession[]
  progress: Progress
}

/** Sessions grouped by the plan's blocks (by sortOrder). Sessions outside every block go to a last group. */
export function blockGroups(db: DB, plan: SpiritualPlan): BlockGroup[] {
  const list = sessionsOf(db, plan.id)
  const blocks = plan.blocks ?? []
  const used = new Set<ID>()
  const groups: BlockGroup[] = blocks.map((b) => {
    const sessions = list.filter((s) => s.sortOrder >= b.from && s.sortOrder <= b.to)
    sessions.forEach((s) => used.add(s.id))
    return { title: b.title, sessions, progress: progress(sessions.filter(isDone).length, sessions.length) }
  })
  const rest = list.filter((s) => !used.has(s.id))
  if (rest.length) groups.push({ title: blocks.length ? 'Outros textos' : '', sessions: rest, progress: progress(rest.filter(isDone).length, rest.length) })
  return groups.filter((g) => g.sessions.length > 0)
}

export function journalFor(db: DB, sessionId: ID): SpiritualJournalEntry[] {
  return db.spiritualJournal.filter((j) => j.sessionId === sessionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function latestStudy(db: DB, sessionId: ID) {
  return db.spiritualStudies.filter((s) => s.sessionId === sessionId).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
}

export function lastReflection(db: DB): SpiritualJournalEntry | undefined {
  return [...db.spiritualJournal].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

/** Concluded sessions, most recent first (imported ones without a date go last, in reading order). */
export function completedHistory(db: DB): SpiritualSession[] {
  const planOrder = new Map(db.spiritualPlans.map((p) => [p.id, p.sortOrder]))
  return db.spiritualSessions.filter(isDone).sort((a, b) => {
    if (a.completedAt && b.completedAt) return b.completedAt.localeCompare(a.completedAt)
    if (a.completedAt !== b.completedAt) return a.completedAt ? -1 : 1
    return (planOrder.get(a.planId) ?? 0) - (planOrder.get(b.planId) ?? 0) || a.sortOrder - b.sortOrder
  })
}

export function sessionDoneOn(s: SpiritualSession): DateKey | undefined {
  return s.completedAt ? toDateKey(new Date(s.completedAt)) : undefined
}

/**
 * What the Home shows (optional, never overdue, no due date): the session(s) concluded today; otherwise the
 * next one of the plan in progress. Nothing when she turned it off or no plan is in progress.
 */
export function homeSpiritualSessions(db: DB, today: DateKey): SpiritualSession[] {
  if (db.profile.spiritualOnHome === false || !db.spiritualSessions.length) return []
  const doneToday = db.spiritualSessions.filter((s) => isDone(s) && sessionDoneOn(s) === today)
  if (doneToday.length) return doneToday
  const plan = currentPlan(db)
  if (!plan || planStatus(db, plan.id) !== 'em_andamento') return []
  const next = nextSession(db, plan.id)
  return next ? [next] : []
}
