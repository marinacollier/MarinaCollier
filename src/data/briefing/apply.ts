/**
 * Writes a BriefingPlan as ONE import batch, and undoes it safely.
 * - every record the import created/changed is listed in the batch with what was there before and the
 *   moment it was written;
 * - "Desfazer importação" only touches records still exactly as the import left them — anything she
 *   checked, moved or edited afterwards is kept (her state wins).
 */
import { actions, getDB } from '../store'
import type { CollectionKey, ImportBatch, Note } from '../types'
import { formatDayMonth } from '@/lib/date'
import { nowISO } from '@/lib/id'
import type { BriefingPlan } from './import'

type Change = ImportBatch['changes'][number]

function stampOf(collection: CollectionKey, id: string): string {
  return ((getDB()[collection] as { id: string; updatedAt: string }[]).find((r) => r.id === id)?.updatedAt ?? nowISO()) as string
}

function create(collection: CollectionKey, data: object, changes: Change[]): string {
  const item = actions.create(collection, data as never) as { id: string; updatedAt: string }
  changes.push({ collection, id: item.id, op: 'created', stamp: item.updatedAt })
  return item.id
}

function patch(collection: CollectionKey, id: string, p: Record<string, unknown>, changes: Change[]) {
  const before = (getDB()[collection] as unknown as Record<string, unknown>[]).find((r) => r.id === id)
  if (!before) return
  const previous = Object.fromEntries(Object.keys(p).map((k) => [k, before[k]]))
  actions.update(collection, id, p as never)
  changes.push({ collection, id, op: 'updated', previous, stamp: stampOf(collection, id) })
}

/** Writes the plan; returns the batch id. Nothing here talks to the user — the caller confirms the save. */
export function applyPlan(plan: BriefingPlan, narrative = ''): string {
  const changes: Change[] = []
  for (const op of plan.ops) {
    if (op.kind === 'project') create('projects', op.data, changes)
    else if (op.kind === 'task') create('tasks', op.data, changes)
    else if (op.kind === 'pull') patch('tasks', op.id, op.patch as Record<string, unknown>, changes)
    else if (op.kind === 'backlog') create('backlogItems', op.data, changes)
    else if (op.kind === 'seen') patch('backlogItems', op.id, op.patch as Record<string, unknown>, changes)
    else if (op.kind === 'category') create('financialCategories', op.data, changes)
    else if (op.kind === 'bill') patch('financialCategories', op.id, { bill: op.bill }, changes)
  }
  // The reading itself (without the JSON) is kept as that day's note, replaced if pasted again.
  if (narrative.length > 280) {
    const title = `Daily Executive Briefing · ${formatDayMonth(plan.date)}`
    const same = getDB().notes.find((x) => x.title === title)
    const data: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> = { title, body: narrative, kind: 'nota', tags: ['briefing'], pinned: false }
    if (same) patch('notes', same.id, { body: narrative }, changes)
    else create('notes', data, changes)
  }
  const created = changes.filter((c) => c.op === 'created').length
  actions.create('importBatches', {
    id: plan.batchId,
    source: plan.source ?? 'Daily Executive Briefing',
    briefingDate: plan.date,
    importedAt: nowISO(),
    counts: { created, updated: changes.length - created, ignored: plan.entries.filter((e) => e.how === 'kept' || e.how === 'ignored').length, reviewRequired: plan.review.length },
    changes,
    items: plan.entries.map((e) => ({ kind: e.kind, title: e.title, collection: e.ref?.collection, id: e.ref?.id, how: e.how })),
    review: plan.review,
    sourceKeys: plan.sourceKeys,
  })
  return plan.batchId
}

export interface UndoResult {
  reverted: number
  /** Changed by her after the import — left as she left it. */
  keptEdited: string[]
}

/** "Desfazer importação": reverts only what is still exactly as this import left it. */
export function undoBatch(batchId: string): UndoResult {
  const batch = getDB().importBatches.find((b) => b.id === batchId)
  const out: UndoResult = { reverted: 0, keptEdited: [] }
  if (!batch || batch.undoneAt) return out
  for (const c of [...batch.changes].reverse()) {
    const cur = (getDB()[c.collection] as unknown as { id: string; updatedAt: string; title?: string; name?: string }[]).find((r) => r.id === c.id)
    if (!cur) continue
    if (cur.updatedAt !== c.stamp) {
      out.keptEdited.push(cur.title ?? cur.name ?? c.id)
      continue
    }
    if (c.op === 'created') actions.remove(c.collection, c.id)
    else actions.update(c.collection, c.id, (c.previous ?? {}) as never)
    out.reverted++
  }
  actions.update('importBatches', batch.id, { undoneAt: nowISO() })
  return out
}

/** The latest import (not undone) of a briefing day. */
export function lastBatchFor(date: string): ImportBatch | undefined {
  return getDB()
    .importBatches.filter((b) => b.briefingDate === date && !b.undoneAt)
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0]
}
