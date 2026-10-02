/**
 * Work OS selectors. Pure functions of (db, args) — no React, no store writes.
 * Builders for inbox conversions / changelog return payloads; ./mutations.ts applies them.
 */
import type {
  DateKey,
  DB,
  ID,
  ISODateTime,
  LogEntry,
  NewItem,
  ProfessionalWin,
  Project,
  Task,
  WorkInboxItem,
} from '@/data/types'
import { isTaskOpen, tasksForDay } from '@/data/selectors'
import { diffDays, endOfWeek, formatShortDate, MONTHS, relativeDay, toDateKey } from '@/lib/date'
import { PROJECT_STATUS, PRIORITY } from './constants'

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

// ─── Basics ─────────────────────────────────────────────────────────────────

/** A task belongs to Work OS when it has the 'trabalho' context or points at a project. */
export function isWorkTask(t: Task): boolean {
  return t.context === 'trabalho' || !!t.projectId
}

export function projectById(db: DB, id: ID | undefined): Project | undefined {
  return id ? db.projects.find((p) => p.id === id) : undefined
}

export function isProjectLive(p: Project): boolean {
  return p.status === 'ativo' || p.status === 'planejando'
}

/** Projects split into the main list (ativo/planejando, by order) and the collapsed rest. */
export function splitProjects(db: DB): { live: Project[]; resting: Project[] } {
  const sorted = [...db.projects].sort(byOrder)
  return { live: sorted.filter(isProjectLive), resting: sorted.filter((p) => !isProjectLive(p)) }
}

// ─── Precisa de mim ─────────────────────────────────────────────────────────

export const ATTENTION_INBOX_KINDS = ['aprovacao', 'pedido', 'responder'] as const

export type AttentionItem =
  | { type: 'task'; id: ID; task: Task }
  | { type: 'inbox'; id: ID; item: WorkInboxItem }

/** Open work tasks blocked on Marina + new inbox items that ask something of her. */
export function attentionItems(db: DB): AttentionItem[] {
  const tasks: AttentionItem[] = db.tasks
    .filter((t) => isWorkTask(t) && isTaskOpen(t) && t.needsMe && !t.recurrence)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.order - b.order)
    .map((task) => ({ type: 'task', id: task.id, task }))
  const inbox: AttentionItem[] = db.workInbox
    .filter((i) => i.status === 'novo' && (ATTENTION_INBOX_KINDS as readonly string[]).includes(i.kind))
    .sort((a, b) => (b.receivedAt ?? b.createdAt).localeCompare(a.receivedAt ?? a.createdAt))
    .map((item) => ({ type: 'inbox', id: item.id, item }))
  return [...tasks, ...inbox]
}

// ─── Hoje ───────────────────────────────────────────────────────────────────

/** Work tasks for today (date/dueDate today, bucket hoje, recurring today). Waiting items live elsewhere. */
export function todayWorkTasks(db: DB, today: DateKey): Task[] {
  return tasksForDay(db, today).filter((t) => isWorkTask(t) && t.status !== 'waiting')
}

// ─── Waiting for ────────────────────────────────────────────────────────────

export function waitingWork(db: DB, projectId?: ID): Task[] {
  return db.tasks
    .filter((t) => t.status === 'waiting' && isWorkTask(t) && (!projectId || t.projectId === projectId))
    .sort((a, b) => (a.waiting?.since ?? a.createdAt).localeCompare(b.waiting?.since ?? b.createdAt))
}

/** "Aguardando retorno de Ana · há 3 dias" — neutral, never "atrasado". */
export function waitingLabel(t: Task, today: DateKey): string {
  const who = t.waiting?.who?.trim()
  const since = t.waiting?.since ?? toDateKey(new Date(t.createdAt))
  const d = Math.max(0, diffDays(since, today))
  const ago = d === 0 ? 'desde hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`
  return `${who ? `Aguardando retorno de ${who}` : 'Aguardando retorno'} · ${ago}`
}

// ─── Deadlines / deliveries ─────────────────────────────────────────────────

export type DatedKind = 'deadline' | 'entrega' | 'milestone' | 'tarefa'

export interface DatedItem {
  key: string
  kind: DatedKind
  title: string
  date: DateKey
  projectId?: ID
  /** Task id or milestone id (for actions). */
  refId: ID
}

/**
 * Everything with a date that matters at work, sorted by proximity (soonest first).
 * Skips done tasks/milestones and paused/finished projects.
 */
export function datedWorkItems(db: DB): DatedItem[] {
  const out: DatedItem[] = []
  const live = new Set(db.projects.filter(isProjectLive).map((p) => p.id))
  for (const p of db.projects) {
    if (!live.has(p.id)) continue
    if (p.deadline) out.push({ key: `dl-${p.id}`, kind: 'deadline', title: `Deadline · ${p.name}`, date: p.deadline, projectId: p.id, refId: p.id })
    if (p.nextDelivery?.date)
      out.push({ key: `nd-${p.id}`, kind: 'entrega', title: p.nextDelivery.title || 'Próxima entrega', date: p.nextDelivery.date, projectId: p.id, refId: p.id })
  }
  for (const m of db.milestones) {
    if (m.done || !m.date || !live.has(m.projectId)) continue
    out.push({ key: `ms-${m.id}`, kind: 'milestone', title: m.title, date: m.date, projectId: m.projectId, refId: m.id })
  }
  for (const t of db.tasks) {
    if (!t.dueDate || !isWorkTask(t) || !isTaskOpen(t) || t.recurrence) continue
    if (t.projectId && !live.has(t.projectId) && db.projects.some((p) => p.id === t.projectId)) continue
    out.push({ key: `tk-${t.id}`, kind: 'tarefa', title: t.title, date: t.dueDate, projectId: t.projectId, refId: t.id })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

/** Deliveries up to the end of this week (includes open items from before today). */
export function thisWeekItems(db: DB, today: DateKey): DatedItem[] {
  const end = endOfWeek(today)
  return datedWorkItems(db).filter((i) => i.date <= end)
}

/** Dated items after this week. */
export function laterDeadlines(db: DB, today: DateKey): DatedItem[] {
  const end = endOfWeek(today)
  return datedWorkItems(db).filter((i) => i.date > end)
}

/** "hoje", "amanhã", "sexta", "12 de out.", and "de antes" for open items whose date passed. */
export function dueLabel(date: DateKey, today: DateKey): string {
  if (date < today) return diffDays(date, today) === 1 ? 'ficou de ontem' : 'ficou de antes'
  return relativeDay(date, today)
}

// ─── Last update ────────────────────────────────────────────────────────────

/** Latest updatedAt among the project and its tasks, milestones, meetings and wins. */
export function projectLastUpdate(db: DB, projectId: ID): ISODateTime | undefined {
  let last: ISODateTime | undefined
  const bump = (iso?: ISODateTime) => {
    if (iso && (!last || iso > last)) last = iso
  }
  bump(db.projects.find((p) => p.id === projectId)?.updatedAt)
  for (const t of db.tasks) if (t.projectId === projectId) bump(t.updatedAt)
  for (const m of db.milestones) if (m.projectId === projectId) bump(m.updatedAt)
  for (const m of db.meetings) if (m.projectId === projectId) bump(m.updatedAt)
  for (const w of db.wins) if (w.projectId === projectId) bump(w.updatedAt)
  return last
}

/** "atualizado hoje", "atualizado ontem", "atualizado há 5 dias". */
export function updatedAgoLabel(iso: ISODateTime | undefined, today: DateKey): string {
  if (!iso) return 'sem atualizações ainda'
  const d = Math.max(0, diffDays(toDateKey(new Date(iso)), today))
  if (d === 0) return 'atualizado hoje'
  if (d === 1) return 'atualizado ontem'
  return `atualizado há ${d} dias`
}

/** "agora há pouco", "hoje", "ontem", "há 3 dias", "12 de set." for received timestamps. */
export function receivedLabel(iso: ISODateTime | undefined, today: DateKey): string {
  if (!iso) return ''
  const key = toDateKey(new Date(iso))
  const d = diffDays(key, today)
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 7) return `há ${d} dias`
  return formatShortDate(key)
}

// ─── Changelog ──────────────────────────────────────────────────────────────

/**
 * Given a project and a patch, returns the patch with automatic changelog lines appended
 * for status / priority / deadline changes. Returns the patch untouched when nothing tracked changed.
 */
export function withChangelog(project: Project, patch: Partial<Project>, today: DateKey): Partial<Project> {
  const lines: string[] = []
  if (patch.status && patch.status !== project.status)
    lines.push(`Status: ${PROJECT_STATUS[project.status].label} → ${PROJECT_STATUS[patch.status].label}`)
  if (patch.priority && patch.priority !== project.priority)
    lines.push(`Prioridade: ${PRIORITY[project.priority].label.replace('prioridade ', '')} → ${PRIORITY[patch.priority].label.replace('prioridade ', '')}`)
  if ('deadline' in patch && patch.deadline !== project.deadline) {
    if (!patch.deadline) lines.push('Deadline removido')
    else lines.push(`Deadline: ${project.deadline ? formatShortDate(project.deadline) + ' → ' : ''}${formatShortDate(patch.deadline)}`)
  }
  if (!lines.length) return patch
  const base = patch.changelog ?? project.changelog
  const added: LogEntry[] = lines.map((text) => ({ date: today, text }))
  return { ...patch, changelog: [...base, ...added] }
}

/** Log entries newest first (stable for same day: last added first). */
export function sortedLog(log: LogEntry[]): { entry: LogEntry; index: number }[] {
  return log
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.index - a.index)
}

// ─── Work inbox ─────────────────────────────────────────────────────────────

export function inboxNew(db: DB): WorkInboxItem[] {
  return db.workInbox
    .filter((i) => i.status === 'novo')
    .sort((a, b) => (b.receivedAt ?? b.createdAt).localeCompare(a.receivedAt ?? a.createdAt))
}

export function inboxHandled(db: DB): WorkInboxItem[] {
  return db.workInbox
    .filter((i) => i.status !== 'novo')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export type InboxConversion = 'task' | 'waiting'

/** Task payload for converting an inbox item. Never called automatically — only on Marina's tap. */
export function taskFromInboxItem(
  item: WorkInboxItem,
  as: InboxConversion,
  today: DateKey,
  order: number,
): NewItem<'tasks'> {
  return {
    title: item.subject,
    notes: item.summary,
    status: as === 'waiting' ? 'waiting' : 'todo',
    context: 'trabalho',
    area: 'profissional',
    projectId: item.projectId,
    dueDate: item.dueDate,
    origin: { type: 'workInbox', id: item.id },
    waiting: as === 'waiting' ? { who: item.sender ?? '', since: today } : undefined,
    needsMe: as === 'task' && (ATTENTION_INBOX_KINDS as readonly string[]).includes(item.kind) ? true : undefined,
    order,
  }
}

/** Patch for the inbox item after conversion. */
export function inboxPatchAfterConversion(as: InboxConversion, taskId: ID): Partial<WorkInboxItem> {
  return { status: as === 'waiting' ? 'waiting' : 'virou_tarefa', taskId }
}

export function integrationConnected(db: DB, provider: 'outlook' | 'teams'): boolean {
  return db.integrations.some((c) => c.provider === provider && c.status === 'connected')
}

// ─── Wins ───────────────────────────────────────────────────────────────────

export function winsSorted(wins: ProfessionalWin[]): ProfessionalWin[] {
  return [...wins].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}

export function groupWinsByMonth(wins: ProfessionalWin[]): { month: string; label: string; wins: ProfessionalWin[] }[] {
  const groups = new Map<string, ProfessionalWin[]>()
  for (const w of winsSorted(wins)) {
    const m = w.date.slice(0, 7)
    groups.set(m, [...(groups.get(m) ?? []), w])
  }
  return [...groups.entries()].map(([month, list]) => ({ month, label: monthLabel(month), wins: list }))
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/**
 * Clean bullets for a CV / LinkedIn: "• Title — impact (Projeto, out/2026)".
 * Only wins with from <= date <= to; oldest first reads better in a CV section.
 */
export function resumeBullets(wins: ProfessionalWin[], projects: Project[], from?: DateKey, to?: DateKey): string {
  const names = new Map(projects.map((p) => [p.id, p.name]))
  return [...wins]
    .filter((w) => (!from || w.date >= from) && (!to || w.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => {
      const [y, m] = w.date.split('-').map(Number)
      const when = `${MONTHS[m - 1].slice(0, 3)}/${y}`
      const ctx = [w.projectId ? names.get(w.projectId) : undefined, when].filter(Boolean).join(', ')
      const detail = (w.impact || w.description)?.trim()
      return `• ${w.title.trim()}${detail ? ` — ${detail}` : ''} (${ctx})`
    })
    .join('\n')
}
