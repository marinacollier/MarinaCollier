/**
 * Backlog da Home — what is open but not planned for today (or a future day). Replaces the long
 * "Podem esperar" list with one compact summary. Pure: no store, no React.
 */
import type { DateKey, DB, Priority, Task } from '@/data/types'
import { addDays } from '@/lib/date'

export interface BacklogItem {
  id: string
  title: string
  projectId?: string
  projectName?: string
  priority?: 'alta' | 'media' | 'baixa'
  dueDate?: string
  status: 'todo' | 'doing' | 'waiting'
  bucket: 'prioritario' | 'aguardando' | 'sem_urgencia'
  waitingWho?: string
  postponed?: boolean
}

export interface BacklogFilter {
  project?: string
  priority?: string
  due?: 'vencidas' | '7dias' | 'sem_prazo'
  bucket?: BacklogItem['bucket']
}

const OPEN = new Set<Task['status']>(['todo', 'doing', 'waiting'])
const CLOSED_PROJECT = new Set<string>(['concluido', 'arquivado'])
const BUCKET_ORDER: Record<BacklogItem['bucket'], number> = { prioritario: 0, aguardando: 1, sem_urgencia: 2 }
/** Due within this many days of today (or overdue) → prioritário. */
const SOON_DAYS = 3

function excluded(id: string, exclude?: ReadonlySet<string>): boolean {
  return !!exclude && (exclude.has(id) || exclude.has(`task:${id}`))
}

export function backlogOf(db: DB, today: DateKey, exclude?: ReadonlySet<string>): BacklogItem[] {
  const projects = new Map((db.projects ?? []).map((p) => [p.id, p]))
  const soon = addDays(today, SOON_DAYS)
  const out: BacklogItem[] = []
  for (const t of db.tasks ?? []) {
    if (!OPEN.has(t.status)) continue
    if (t.recurrence) continue
    const status = t.status as BacklogItem['status']
    // Planned for today or later = the day's plan, not backlog (waiting always belongs here).
    if (status !== 'waiting' && t.date && t.date >= today) continue
    const project = t.projectId ? projects.get(t.projectId) : undefined
    if (project && CLOSED_PROJECT.has(project.status)) continue
    if (excluded(t.id, exclude)) continue
    const bucket: BacklogItem['bucket'] =
      status === 'waiting'
        ? 'aguardando'
        : t.priority === 'alta' || t.moscow === 'must' || (!!t.dueDate && t.dueDate <= soon)
          ? 'prioritario'
          : 'sem_urgencia'
    out.push({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectName: project?.name,
      priority: t.priority as Priority | undefined,
      dueDate: t.dueDate,
      status,
      bucket,
      waitingWho: t.waiting?.who || undefined,
      postponed: !!t.postponedFrom,
    })
  }
  return out.sort(
    (a, b) =>
      BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] ||
      (a.dueDate && b.dueDate ? a.dueDate.localeCompare(b.dueDate) : a.dueDate ? -1 : b.dueDate ? 1 : 0) ||
      a.title.localeCompare(b.title, 'pt-BR'),
  )
}

export function backlogCounts(items: BacklogItem[]): { total: number; prioritario: number; aguardando: number; sem_urgencia: number } {
  const c = { total: items.length, prioritario: 0, aguardando: 0, sem_urgencia: 0 }
  for (const i of items) c[i.bucket]++
  return c
}

export function filterBacklog(items: BacklogItem[], f: BacklogFilter, today: DateKey): BacklogItem[] {
  const week = addDays(today, 7)
  return items.filter((i) => {
    if (f.project && i.projectId !== f.project) return false
    if (f.priority && i.priority !== f.priority) return false
    if (f.bucket && i.bucket !== f.bucket) return false
    if (f.due === 'vencidas' && !(i.dueDate && i.dueDate < today)) return false
    if (f.due === '7dias' && !(i.dueDate && i.dueDate >= today && i.dueDate <= week)) return false
    if (f.due === 'sem_prazo' && i.dueDate) return false
    return true
  })
}
