/**
 * Confirmed plan → writes through the existing store actions / domain ops (UGC ops, receivables, tasks…),
 * recorded as ONE ImportBatch (same record and same "Desfazer importação" as the Daily Briefing).
 *
 * What each item wrote is captured as a diff of the DB around it — so side effects of a domain op (a
 * life-log line, the income of a closed deal, an Occurrence) are in the batch too, and undo reverts them.
 */
import { actions, flushNow, getDB } from '../store'
import { takeSnapshot, type SnapshotInfo } from '../snapshots'
import type { CollectionKey, DB, ImportBatch } from '../types'
import { nowISO } from '@/lib/id'
import { areaLocked } from '@/app/lock-store'
import type { ChangesDoc } from './contract'
import { planChanges, willWrite, type ChangesPlan, type PlanItem, type PlanOptions } from './plan'
import { TYPE_DEFS } from './types'

type Change = ImportBatch['changes'][number]
type Row = Record<string, unknown> & { id: string; updatedAt: string }

/** Everything that differs between two DB states, merged into `acc` (first `previous`, last `stamp`). */
function recordDiff(before: DB, after: DB, acc: Map<string, Change>): { collection: CollectionKey; id: string }[] {
  const created: { collection: CollectionKey; id: string }[] = []
  for (const k of Object.keys(after) as (keyof DB)[]) {
    if (k === 'importBatches' || !Array.isArray(after[k]) || before[k] === after[k]) continue
    const coll = k as CollectionKey
    const was = new Map((before[coll] as unknown as Row[]).map((r) => [r.id, r]))
    const now = new Map((after[coll] as unknown as Row[]).map((r) => [r.id, r]))
    for (const [id, r] of now) {
      const old = was.get(id)
      if (old === r) continue
      const at = `${coll}:${id}`
      const prev = acc.get(at)
      if (!old) {
        acc.set(at, { collection: coll, id, op: 'created', stamp: r.updatedAt })
        created.push({ collection: coll, id })
      } else if (prev) acc.set(at, { ...prev, stamp: r.updatedAt })
      else {
        const keys = new Set([...Object.keys(old), ...Object.keys(r)].filter((x) => x !== 'updatedAt' && JSON.stringify(old[x]) !== JSON.stringify(r[x])))
        acc.set(at, { collection: coll, id, op: 'updated', previous: Object.fromEntries([...keys].map((x) => [x, old[x]])), stamp: r.updatedAt })
      }
    }
    for (const [id, r] of was) {
      if (now.has(id)) continue
      const at = `${coll}:${id}`
      const prev = acc.get(at)
      // Created and removed within the same import: nothing to undo.
      if (prev?.op === 'created') acc.delete(at)
      else acc.set(at, { collection: coll, id, op: 'removed', previous: prev?.previous ? { ...r, ...prev.previous } : r, stamp: nowISO() })
    }
  }
  return created
}

export interface ItemResult {
  index: number
  title: string
  result: string
}

export interface ApplyResult {
  batchId?: string
  written: number
  results: ItemResult[]
}

const DONE: Record<string, string> = { create: 'criado', update: 'atualizado', complete: 'concluído', move: 'movido', archive: 'arquivado', delete: 'apagado' }

function runItem(item: PlanItem, today: string): void {
  const def = TYPE_DEFS[item.type as keyof typeof TYPE_DEFS]!
  const coll = item.collection!
  if (item.exec === 'delete') return void actions.remove(coll, item.targetId!)
  if (item.exec === 'create') {
    const run = def.exec?.create
    if (run) run({ patch: {}, target: cleanOf(item), data: item.data, fields: cleanOf(item), today })
    else actions.create(coll, item.data as never)
    return
  }
  const op = item.exec!
  const run = def.exec?.[op]
  if (run) run({ id: item.targetId, patch: item.patch ?? {}, target: item.target ?? {}, fields: { ...item.target }, today })
  else actions.update(coll, item.targetId!, (item.patch ?? {}) as never)
}
/** The validated values (a create's data already went through cleanFields; amount → amountCents). */
const cleanOf = (item: PlanItem) => Object.fromEntries(item.diffs.map((d) => [d.field, d.after]))

/** Writes the plan (only what is confirmed) as one batch. Returns the batch id (none when nothing changed). */
export function applyChangesPlan(plan: ChangesPlan): ApplyResult {
  const acc = new Map<string, Change>()
  const refs: NonNullable<ImportBatch['refs']> = {}
  const results: ItemResult[] = []
  let written = 0
  for (const item of plan.items) {
    if (!willWrite(item)) {
      results.push({ index: item.index, title: item.title, result: item.action === 'delete' || item.action === 'conflict' ? 'não confirmado — nada feito' : (item.reason ?? item.action) })
      if (item.targetId && item.collection && item.action === 'unchanged') refs[item.key] = { collection: item.collection, id: item.targetId }
      continue
    }
    const before = getDB()
    try {
      runItem(item, plan.today)
    } catch (err) {
      console.error('[marina-os] change failed', err instanceof Error ? err.message : 'unknown')
      results.push({ index: item.index, title: item.title, result: 'erro ao gravar — nada feito' })
      continue
    }
    const created = recordDiff(before, getDB(), acc)
    const id = item.targetId ?? created.find((x) => x.collection === item.collection)?.id
    if (id && item.collection && item.exec !== 'delete') refs[item.key] = { collection: item.collection, id }
    written++
    results.push({ index: item.index, title: item.title, result: DONE[item.exec!] ?? 'feito' })
  }
  if (!written) return { written, results }
  const changes = [...acc.values()]
  const created = changes.filter((c) => c.op === 'created').length
  const how = (i: PlanItem): ImportBatch['items'][number]['how'] => (willWrite(i) ? (i.action === 'create' ? 'created' : 'updated') : i.action === 'unchanged' ? 'kept' : 'ignored')
  actions.create('importBatches', {
    id: plan.batchId,
    kind: 'changes',
    source: plan.doc.source,
    briefingDate: plan.today,
    importedAt: nowISO(),
    counts: { created, updated: changes.length - created, ignored: plan.items.filter((i) => !willWrite(i)).length, reviewRequired: plan.items.filter((i) => i.action === 'review').length },
    changes,
    items: plan.items.map((i) => ({ kind: 'change' as const, type: i.type, title: i.title, collection: i.collection, id: refs[i.key]?.id ?? i.targetId, how: how(i), result: results.find((r) => r.index === i.index)?.result })),
    review: plan.items.filter((i) => i.action === 'review').map((i) => ({ title: i.title, reason: i.reason ?? 'precisa de revisão' })),
    sourceKeys: Object.keys(refs),
    refs,
  })
  return { batchId: plan.batchId, written, results }
}

/** The privacy lock as it is right now (a locked area's changes are refused until unlocked). */
export const lockNow = () => {
  const lock = getDB().profile.privacyLock
  return (area: Parameters<typeof areaLocked>[1]) => areaLocked(lock, area)
}

/**
 * The whole "Confirmar": snapshot of the device → re-plan against the CURRENT data (nothing stale is
 * written) → apply → saved on the device. Success is only reported after the save (flushNow throws otherwise).
 */
export async function importChanges(doc: ChangesDoc, opts: PlanOptions = {}): Promise<ApplyResult & { plan: ChangesPlan; snapshot?: SnapshotInfo }> {
  const preview = planChanges(getDB(), doc, { isLocked: lockNow(), ...opts })
  const snapshot = preview.items.some(willWrite) ? await takeSnapshot(`antes de importar “${doc.source}”`) : undefined
  const plan = planChanges(getDB(), doc, { isLocked: lockNow(), ...opts, batchId: preview.batchId })
  const result = applyChangesPlan(plan)
  await flushNow()
  return { ...result, plan, snapshot }
}
