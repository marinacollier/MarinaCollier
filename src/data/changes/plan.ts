/**
 * marina-os/changes@1 → a PLAN. Pure: reads the DB, writes nothing (the preview is this plan).
 *
 * Identity, in order: 1. the record's id · 2. sourceKey / externalRef of an earlier import · 3. contextual
 * match (same matcher as the Daily Briefing — B.O. abrir/verificar/regularizar is one obligation) ·
 * 4. more than one candidate → "precisa de revisão" with explicit choices (vincular a X / criar novo / ignorar).
 *
 * Her state wins: fields not sent are kept; a record she edited after the file's version is a conflict
 * (kept as hers unless she says otherwise); done is never reopened; cancelled/archived never comes back;
 * deletes need her yes per item; locked areas are refused until unlocked; the same file twice changes nothing.
 */
import type { CollectionKey, DateKey, DB, LockArea } from '../types'
import { slug } from '../briefing/import'
import { todayKey } from '@/lib/date'
import { uid } from '@/lib/id'
import type { Change, ChangeOp, ChangesDoc, Fields, ValidationIssue } from './contract'
import { cleanFields, findRecurring, TYPE_DEFS, TYPE_LABEL, type ExecOp, type Rec } from './types'

export type ItemAction = 'create' | 'update' | 'complete' | 'move' | 'archive' | 'delete' | 'unchanged' | 'conflict' | 'review' | 'blocked' | 'unsupported' | 'invalid' | 'refused'

export interface Diff {
  field: string
  label: string
  before: unknown
  after: unknown
}

export interface Candidate {
  id: string
  title: string
  sub?: string
}

export interface PlanItem {
  index: number
  op: ChangeOp
  type: string
  typeLabel: string
  title: string
  action: ItemAction
  reason?: string
  collection?: CollectionKey
  targetId?: string
  via?: 'id' | 'sourceKey' | 'externalRef' | 'match' | 'escolha' | 'novo'
  diffs: Diff[]
  /** create: the new record's data. */
  data?: Record<string, unknown>
  /** existing record: the patch (record field names). */
  patch?: Record<string, unknown>
  /** existing record: values after the change (contract field names). */
  target?: Fields
  fields: Fields
  exec?: ExecOp | 'delete'
  candidates?: Candidate[]
  /** A delete, or overwriting her newer edit: runs only with her explicit yes for THIS item. */
  needsConfirm?: boolean
  confirmed?: boolean
  /** Identity of this item for the next import of the same file. */
  key: string
  lock?: LockArea
  ignoredFields?: string[]
}

export interface PlanOptions {
  today?: DateKey
  /** "Precisa de revisão" answers: change index → record id | 'new' | 'ignore'. */
  choices?: Record<number, string>
  /** Explicit per-item yes: deletes and conflict overwrites. Default: none (destructive ops OFF). */
  confirmed?: Iterable<number>
  /** Privacy lock state (areaLocked). */
  isLocked?: (area: LockArea) => boolean
  batchId?: string
}

export interface ChangesPlan {
  doc: ChangesDoc
  batchId: string
  today: DateKey
  items: PlanItem[]
  issues: ValidationIssue[]
}

const EMPTY = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
const same = (a: unknown, b: unknown) => (EMPTY(a) && EMPTY(b)) || JSON.stringify(a) === JSON.stringify(b)
const newer = (a: string, b: string) => {
  const x = Date.parse(a)
  const y = Date.parse(b)
  return Number.isFinite(x) && Number.isFinite(y) && x > y
}

/** Identity keys recorded by earlier (not undone) imports of changes files. */
function knownRefs(db: DB): Map<string, { collection: CollectionKey; id: string }> {
  const out = new Map<string, { collection: CollectionKey; id: string }>()
  for (const b of [...db.importBatches].sort((x, y) => x.importedAt.localeCompare(y.importedAt))) {
    if (b.undoneAt || !b.refs) continue
    for (const [k, v] of Object.entries(b.refs)) out.set(k, v)
  }
  return out
}

export function planChanges(db: DB, doc: ChangesDoc, opts: PlanOptions = {}, invalid: Map<number, string[]> = new Map(), issues: ValidationIssue[] = []): ChangesPlan {
  const today = opts.today ?? todayKey()
  const batchId = opts.batchId ?? uid()
  const confirmed = new Set(opts.confirmed ?? [])
  const refs = knownRefs(db)
  const plannedKeys = new Set<string>()
  // A project created by this file is visible to the changes after it (its tasks can name it).
  let seen = db
  const items = doc.changes.map((c, index) => {
    const item = planOne(seen, doc, c, index, { today, batchId, confirmed, refs, plannedKeys, choice: opts.choices?.[index], isLocked: opts.isLocked ?? (() => false), problems: invalid.get(index) })
    if (item.action === 'create' && item.type === 'project' && item.data) {
      item.data.id ??= uid()
      seen = { ...seen, projects: [...seen.projects, { ...item.data, createdAt: '', updatedAt: '' } as unknown as DB['projects'][number]] }
    }
    return item
  })
  return { doc, batchId, today, items, issues }
}

interface Ctx {
  today: DateKey
  batchId: string
  confirmed: Set<number>
  refs: Map<string, { collection: CollectionKey; id: string }>
  plannedKeys: Set<string>
  choice?: string
  isLocked: (a: LockArea) => boolean
  problems?: string[]
}

function planOne(db: DB, doc: ChangesDoc, c: Change, index: number, ctx: Ctx): PlanItem {
  const typeLabel = TYPE_LABEL[c.type] ?? String(c.type)
  const named = (c.fields.title ?? c.fields.name ?? c.fields.brand ?? c.match?.title ?? c.fields.description ?? c.id ?? c.sourceKey ?? typeLabel) as string
  const key = c.sourceKey ? `sk:${c.sourceKey}` : c.externalRef ? `ext:${c.externalRef}` : c.id ? `id:${c.id}` : `auto:${c.type}:${slug(String(named))}:${String(c.fields.date ?? c.match?.date ?? '')}`
  const base: PlanItem = { index, op: c.op, type: c.type, typeLabel, title: String(named).slice(0, 120), action: 'unchanged', diffs: [], fields: c.fields, key }
  const out = (p: Partial<PlanItem>): PlanItem => ({ ...base, ...p })

  if (ctx.problems?.length) return out({ action: 'invalid', reason: ctx.problems.join(' · ') })

  // Recurrences are part of her life already: recognised (linked), never created or changed by a file.
  if (c.type === 'recurring') {
    const found = findRecurring(db, String(c.match?.title ?? c.fields.title ?? ''))
    if (found) return out({ action: 'unchanged', title: found.title, collection: found.collection, targetId: found.id, via: 'match', reason: 'recorrência que já existe — vinculada, nada muda' })
    return out({ action: 'unsupported', reason: 'recorrência nova não é criada por arquivo — crie no app (valor, dia e frequência)' })
  }

  const def = TYPE_DEFS[c.type as keyof typeof TYPE_DEFS]
  if (!def) return out({ action: 'unsupported', reason: `“${c.type}” não suportado ainda` })
  const { clean: f, errors, ignored } = cleanFields(def, c.fields)
  const withIgnored = (p: Partial<PlanItem>) => out({ ignoredFields: ignored.length ? ignored : undefined, ...p })
  if (errors.length) return withIgnored({ action: 'invalid', reason: errors.join(' · ') })
  const coll = def.collection
  const list = [...(db[coll] as unknown as Rec[]), ...(def.virtual?.(db) ?? [])]

  // ── 1–4: who is it? ──
  let rec: Rec | undefined
  let via: PlanItem['via']
  if (ctx.choice === 'ignore') return withIgnored({ action: 'unchanged', reason: 'ignorado por você' })
  if (ctx.choice && ctx.choice !== 'new') {
    rec = list.find((r) => r.id === ctx.choice)
    via = 'escolha'
  } else if (!ctx.choice) {
    if (c.id) {
      rec = list.find((r) => r.id === c.id && def.belongs(r))
      via = 'id'
      if (!rec && c.op !== 'create') return withIgnored({ action: 'refused', reason: 'não encontrei esse id no app (apagado, ou de outro aparelho)' })
    }
    const known = !rec ? (c.sourceKey && ctx.refs.get(`sk:${c.sourceKey}`)) || (c.externalRef && ctx.refs.get(`ext:${c.externalRef}`)) || ctx.refs.get(key) : undefined
    if (known) {
      rec = (db[known.collection] as unknown as Rec[]).find((r) => r.id === known.id)
      via = c.sourceKey ? 'sourceKey' : c.externalRef ? 'externalRef' : 'match'
      if (!rec) {
        if (c.op === 'create' || c.op === 'delete') return withIgnored({ action: 'unchanged', reason: 'você tirou do app depois de importar — não volta' })
        return withIgnored({ action: 'refused', reason: 'esse registro não existe mais no app' })
      }
    }
    if (!rec && !c.id) {
      const found = def.match(db, { title: (c.match?.title ?? f.title ?? f.name ?? f.brand) as string | undefined, project: (c.match?.project ?? f.project ?? f.front) as string | undefined, date: (c.match?.date ?? f.date) as string | undefined, fields: f })
      if (found.length > 1)
        return withIgnored({
          action: 'review',
          collection: coll,
          reason: `${found.length} registros parecidos — qual é?`,
          candidates: found.slice(0, 6).map((r) => ({ id: r.id, title: def.titleOf(r, db), sub: def.sub?.(r, db) })),
        })
      rec = found[0]
      via = rec ? 'match' : undefined
    }
  }
  const title = rec ? def.titleOf(rec, db) : base.title

  // ── no record: create (or nothing to act on) ──
  if (!rec) {
    // Taking out something that isn't there is already done (a day's session that was never stored).
    if (c.op === 'archive') return withIgnored({ action: 'unchanged', reason: 'não está no app — nada a tirar' })
    if (c.op !== 'create') return withIgnored({ action: 'refused', reason: 'não encontrei no app — nada pra mudar' })
    if (ctx.plannedKeys.has(key)) return withIgnored({ action: 'unchanged', reason: 'repetido neste arquivo' })
    const missing = (def.required ?? []).filter((k) => EMPTY(f[k]))
    if (missing.length) return withIgnored({ action: 'invalid', reason: `faltam: ${missing.map((k) => def.fields[k]?.label ?? k).join(', ')}` })
    const area = def.lock?.(undefined, f)
    if (area && ctx.isLocked(area)) return withIgnored({ action: 'blocked', lock: area, reason: `área “${area}” trancada — desbloqueie pra importar` })
    const data = def.build?.(f, db, ctx.today)
    if (typeof data === 'string') return withIgnored({ action: 'invalid', reason: data })
    if (!data) return withIgnored({ action: 'unsupported', reason: 'criar esse tipo não é suportado ainda' })
    // Provenance on records that carry it (to-dos and backlog know they came from this file).
    if (coll === 'tasks' || coll === 'backlogItems') data.source = { type: 'changes', label: doc.source, briefingDate: ctx.today, sourceKey: key, importBatchId: ctx.batchId }
    ctx.plannedKeys.add(key)
    const diffs = Object.entries(f)
      .filter(([, v]) => !EMPTY(v))
      .map(([k, v]) => ({ field: k, label: def.fields[k]?.label ?? k, before: undefined, after: v }))
    return withIgnored({ action: 'create', collection: coll, via: ctx.choice === 'new' ? 'escolha' : 'novo', data, diffs, exec: 'create' })
  }

  // ── an existing record ──
  const found = { collection: coll, targetId: rec.id, via, title }
  const area = def.lock?.(rec, f)
  if (area && ctx.isLocked(area)) return withIgnored({ ...found, action: 'blocked', lock: area, reason: `área “${area}” trancada — desbloqueie pra importar` })
  const state = def.state(rec)
  const yes = ctx.confirmed.has(index)

  if (c.op === 'delete') {
    return withIgnored({ ...found, action: 'delete', exec: 'delete', needsConfirm: true, confirmed: yes, diffs: [{ field: '_record', label: def.label, before: title, after: undefined }], reason: yes ? undefined : 'exclusão só com o seu sim (desligada)' })
  }
  if (state === 'gone') {
    if (c.op === 'create') return withIgnored({ ...found, action: 'unchanged', reason: 'você cancelou/arquivou — não volta' })
    if (c.op === 'archive') return withIgnored({ ...found, action: 'unchanged', reason: 'já estava fora' })
    return withIgnored({ ...found, action: 'refused', reason: 'está cancelado/arquivado — não ressuscito' })
  }

  const cur = def.read(rec, db)
  let target: Fields
  let exec: ExecOp
  let action: ItemAction
  let fill = false
  if (c.op === 'create') {
    if (def.onExisting === 'complete') {
      if (state === 'done') return withIgnored({ ...found, action: 'unchanged', reason: 'já estava feito' })
      target = { ...def.completeTarget!(rec, f) }
      exec = 'complete'
      action = 'complete'
    } else {
      // Already there: only what it doesn't have (her title, date and edits stay).
      target = Object.fromEntries(Object.entries(f).filter(([k, v]) => !EMPTY(v) && EMPTY(cur[k])))
      exec = 'update'
      action = 'update'
      fill = true
    }
  } else if (c.op === 'update') {
    if (state === 'done' && f.status !== undefined && f.status !== 'done') return withIgnored({ ...found, action: 'refused', reason: 'já está feita — não reabro' })
    target = f
    exec = 'update'
    action = 'update'
  } else if (c.op === 'complete') {
    if (state === 'done') return withIgnored({ ...found, action: 'unchanged', reason: 'já estava feito' })
    if (!def.completeTarget && !def.exec?.complete) return withIgnored({ ...found, action: 'unsupported', reason: `concluir ${def.label} não é suportado` })
    target = def.completeTarget ? def.completeTarget(rec, f) : { done: f.date ?? ctx.today }
    if (!Object.keys(target).length) return withIgnored({ ...found, action: 'unchanged', reason: 'nada a concluir' })
    exec = 'complete'
    action = 'complete'
  } else if (c.op === 'move') {
    if (state === 'done') return withIgnored({ ...found, action: 'refused', reason: 'já está feito — não mexo' })
    target = Object.fromEntries(def.moveFields.filter((k) => k in f).map((k) => [k, f[k]]))
    if (!Object.keys(target).length) return withIgnored({ ...found, action: 'invalid', reason: `move precisa de ${def.moveFields.join(' / ') || 'algo que mova'}` })
    exec = 'move'
    action = 'move'
  } else {
    if (!def.archiveTarget && !def.exec?.archive) return withIgnored({ ...found, action: 'unsupported', reason: `arquivar ${def.label} não é suportado` })
    target = def.archiveTarget ?? {}
    exec = 'archive'
    action = 'archive'
  }

  // Routine "done on a day" lives in an Occurrence, not in a field.
  if (c.type === 'routine' && exec === 'complete') {
    const date = (f.date as string | undefined) ?? ctx.today
    const done = db.occurrences.some((o) => o.parentType === 'routineItem' && o.parentId === rec!.id && o.date === date)
    if (done) return withIgnored({ ...found, action: 'unchanged', reason: `já feito em ${date}` })
    return withIgnored({ ...found, action: 'complete', exec, target: { date }, patch: {}, diffs: [{ field: 'feito', label: `feito em ${date}`, before: 'não', after: 'sim' }] })
  }

  const diffs: Diff[] = Object.entries(target)
    .filter(([k, v]) => !same(cur[k], v))
    .map(([k, v]) => ({ field: k, label: def.fields[k]?.label ?? k, before: cur[k], after: v }))
  if (!diffs.length) return withIgnored({ ...found, action: 'unchanged', reason: fill ? 'já existe' : 'já está assim' })
  const changed = Object.fromEntries(diffs.map((d) => [d.field, d.after]))
  const patch = def.write(changed, db, rec)
  if (typeof patch === 'string') return withIgnored({ ...found, action: 'invalid', reason: patch })

  // She changed it after the version the file was written from: hers wins unless she says otherwise.
  const baseline = c.baseVersion ?? doc.generatedAt
  if (!fill && baseline && newer(rec.updatedAt, baseline)) {
    return withIgnored({ ...found, action: yes ? action : 'conflict', exec, target: changed, patch, diffs, needsConfirm: true, confirmed: yes, reason: yes ? 'conflito — você escolheu usar a versão do arquivo' : 'você mudou isso depois — fica a sua versão (a não ser que você escolha a do arquivo)' })
  }
  return withIgnored({ ...found, action, exec, target: changed, patch, diffs, reason: fill ? 'já existia — completo só o que faltava' : undefined })
}

// ─── Summary ────────────────────────────────────────────────────────────────

export interface PlanCounts {
  create: number
  update: number
  unchanged: number
  conflict: number
  delete: number
  review: number
  blocked: number
  unsupported: number
  invalid: number
  refused: number
}

export function countPlan(plan: Pick<ChangesPlan, 'items'>): PlanCounts {
  const n = (...a: ItemAction[]) => plan.items.filter((i) => a.includes(i.action)).length
  return {
    create: n('create'),
    update: n('update', 'complete', 'move', 'archive'),
    unchanged: n('unchanged'),
    conflict: n('conflict'),
    delete: n('delete'),
    review: n('review'),
    blocked: n('blocked'),
    unsupported: n('unsupported'),
    invalid: n('invalid'),
    refused: n('refused'),
  }
}

/** "12 novos · 7 atualizações · 3 já existentes · 2 conflitos · 1 exclusão" (+ what needs her). */
export function planLine(plan: Pick<ChangesPlan, 'items'>): string {
  const c = countPlan(plan)
  const p = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  return [
    p(c.create, 'novo', 'novos'),
    p(c.update, 'atualização', 'atualizações'),
    p(c.unchanged, 'já existente', 'já existentes'),
    p(c.conflict, 'conflito', 'conflitos'),
    p(c.delete, 'exclusão', 'exclusões'),
    c.review ? p(c.review, 'precisa de revisão', 'precisam de revisão') : '',
    c.blocked ? p(c.blocked, 'bloqueado', 'bloqueados') : '',
    c.unsupported ? p(c.unsupported, 'não suportado', 'não suportados') : '',
    c.invalid + c.refused ? p(c.invalid + c.refused, 'recusado', 'recusados') : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Items that will actually write when confirmed. */
export const willWrite = (i: PlanItem) => !!i.exec && ['create', 'update', 'complete', 'move', 'archive', 'delete'].includes(i.action) && (!i.needsConfirm || i.confirmed)
