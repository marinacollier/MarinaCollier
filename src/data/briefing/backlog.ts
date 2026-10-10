/**
 * BacklogItem ≠ Task. Shared by the Home and Lumos:
 *   radarItems     → what's coming from the backlog, for the folded "No radar" under Próximos (never Hoje)
 *   promoteBacklog → she gives it a day: it becomes a real to-do (or its existing to-do moves)
 */
import { actions, getDB, nextOrder } from '../store'
import type { ActionItem, Front } from '../agenda/items'
import type { BacklogItem, DateKey, DB } from '../types'

const up = (s: string) => s.toLocaleUpperCase('pt-BR')

function frontOf(db: DB, b: BacklogItem): Front {
  const p = b.projectId ? db.projects.find((x) => x.id === b.projectId) : undefined
  if (p) return { label: up(p.name), group: 'trabalho' }
  if (b.tripId) return { label: `VIAGEM · ${up(db.trips.find((t) => t.id === b.tripId)?.name ?? '')}`.replace(/ · $/, ''), group: 'vida' }
  if (b.context === 'carreira' || b.context === 'trabalho') return { label: up(b.front ?? 'TRABALHO'), group: 'trabalho' }
  return { label: up(b.front ?? ''), group: 'vida' }
}

/** Open future intentions, soonest window first (no window last). */
export function radarItems(db: DB, today: DateKey): ActionItem[] {
  return db.backlogItems
    .filter((b) => b.kind === 'scheduled' && b.status === 'open' && (!b.window?.until || b.window.until >= today))
    .sort((a, b) => (a.window?.from ?? a.window?.until ?? '9999').localeCompare(b.window?.from ?? b.window?.until ?? '9999') || a.title.localeCompare(b.title))
    .map((b) => ({
      key: `backlogItem:${b.id}`,
      source: 'task' as const,
      refType: 'backlogItem',
      refId: b.id,
      date: today,
      title: b.title,
      sub: b.window?.label ?? 'sem data',
      front: frontOf(db, b),
      status: 'pending' as const,
      check: 'toggle' as const,
      important: false,
    }))
}

/** Gives the backlog item a day: a real to-do on `date` (or its to-do moves). Returns the undo. */
export function promoteBacklog(id: string, date: DateKey): () => void {
  const b = getDB().backlogItems.find((x) => x.id === id)
  if (!b) return () => {}
  const task = b.promotedTaskId ? getDB().tasks.find((t) => t.id === b.promotedTaskId) : undefined
  if (task) {
    const before = { date: task.date, bucket: task.bucket }
    actions.update('tasks', task.id, { date, bucket: undefined })
    return () => actions.update('tasks', task.id, before)
  }
  const created = actions.create('tasks', {
    title: b.title,
    status: 'todo',
    date,
    projectId: b.projectId,
    tripId: b.tripId,
    context: b.context,
    notes: b.notes,
    order: nextOrder(getDB().tasks),
    source: { ...b.source, sourceKey: `${b.source.sourceKey}-task` },
  })
  const prev = { status: b.status, promotedTaskId: b.promotedTaskId }
  actions.update('backlogItems', b.id, { status: 'promoted', promotedTaskId: created.id })
  return () => {
    actions.remove('tasks', created.id)
    actions.update('backlogItems', b.id, prev)
  }
}
