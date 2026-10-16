/* eslint-disable @typescript-eslint/no-explicit-any -- a registry over heterogeneous records; each entry reads/writes its own shape */
/**
 * What each type of marina-os/changes@1 IS in the app — the existing records, never a parallel model:
 *   task / waiting          → tasks (waiting = status 'waiting' + who)
 *   backlog                 → backlogItems (future intention, not a to-do)
 *   recurring               → link only (an existing recurrence is recognised; never created from a file)
 *   plannedWorkout / completedWorkout → workouts (planejado / feito — the same record evolves)
 *   plannedMeal / consumedMeal        → meals (planned / done)
 *   expectedRevenue / receivedRevenue → expenses type 'income' (expected → received, one record; finance ops)
 *   expense                 → expenses (spending)
 *   ugcProspect / ugcDeal   → brands + ugcOpportunities (UGC ops)
 *   project                 → projects
 *   routine (habit)         → routineItems (+ an Occurrence when done on a day)
 * Pure except `exec`, which calls the existing store ops when the import is confirmed.
 */
import { actions, getDB } from '../store'
import { findProject, sameTitle, stageOf } from '../briefing/import'
import { addExtraIncome, cancelReceivable, findContract, isIncome, markReceived, nextPeriod, receivablesFor, updateReceivable } from '../finance/receivables'
import { addOpportunity, archiveBrand, endOpportunity, ensureProspect, setStage } from '../ugc/ops'
import { currentOpportunity, findBrand } from '../ugc/model'
import type { CollectionKey, DateKey, DB, LockArea, Weekday } from '../types'
import { isDateKey, monthKey, todayKey } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'
import type { ChangeType, Fields } from './contract'

export type Rec = Record<string, any> & { id: string; updatedAt: string }

export type FieldSpec =
  | { kind: 'str' | 'text' | 'date' | 'time' | 'int' | 'cents' | 'bool' | 'strs' | 'weekdays' | 'iso'; label: string }
  | { kind: 'enum'; label: string; values: readonly string[]; aliases?: Record<string, string> }

export interface Query {
  title?: string
  project?: string
  date?: DateKey
  fields: Fields
}

export interface ExecCtx {
  id?: string
  /** Record patch (already mapped from fields). */
  patch: Rec | Record<string, unknown>
  /** Input-level values after the change (only what changes). */
  target: Fields
  /** New record data (create). */
  data?: Record<string, unknown>
  fields: Fields
  today: DateKey
}

export type ExecOp = 'create' | 'update' | 'complete' | 'move' | 'archive'

export interface TypeDef {
  label: string
  collection: CollectionKey
  fields: Record<string, FieldSpec>
  /** Fields a 'move' may carry. */
  moveFields: string[]
  required?: string[]
  belongs: (r: Rec) => boolean
  titleOf: (r: Rec, db: DB) => string
  /** The record in the contract's own field names (for diffs and the ChatGPT context). */
  read: (r: Rec, db: DB) => Fields
  /** Contract fields → record patch. A string is a validation error (a reference that doesn't exist…). */
  write: (f: Fields, db: DB, r?: Rec) => Record<string, unknown> | string
  /** New record data (no id/stamps). */
  build?: (f: Fields, db: DB, today: DateKey) => Record<string, unknown> | string
  state: (r: Rec) => 'open' | 'done' | 'gone'
  completeTarget?: (r: Rec, f: Fields) => Fields
  archiveTarget?: Fields
  /** A create that finds the record already there: 'fill' only what it lacks; 'complete' it (a done workout on the planned one). */
  onExisting?: 'fill' | 'complete'
  match: (db: DB, q: Query) => Rec[]
  lock?: (r: Rec | undefined, f: Fields) => LockArea | undefined
  /** Ops that must go through an existing domain op instead of a plain store write. */
  exec?: Partial<Record<ExecOp, (c: ExecCtx) => void>>
  /** Quiet second line of a candidate ("hoje · Santander"). */
  sub?: (r: Rec, db: DB) => string | undefined
  /** Records that exist without being stored yet (a contract's receivable of a month — materialized by the op). */
  virtual?: (db: DB) => Rec[]
}

// ─── Small helpers ──────────────────────────────────────────────────────────

const key = (s: unknown) => (typeof s === 'string' ? normalize(s).replace(/[^a-z0-9]+/g, '') : '')
const looseTitle = (a: unknown, b: unknown) => {
  const x = key(a)
  const y = key(b)
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 6 && (x.startsWith(y) || y.startsWith(x))))
}
const projectName = (db: DB, id?: string) => db.projects.find((p) => p.id === id)?.name
const nextOrder = (list: { order?: number }[]) => list.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1
/** Only keys that were sent. */
const pick = (f: Fields, keys: string[]) => Object.fromEntries(keys.filter((k) => f[k] !== undefined).map((k) => [k, f[k]]))
const dateOf = (r: Rec) => r.date ?? r.dueDate

function projectRef(db: DB, f: Fields): { projectId?: string } | string {
  if (f.project === undefined) return {}
  if (f.project === null || f.project === '') return { projectId: undefined }
  const p = findProject(db.projects, String(f.project))
  return p ? { projectId: p.id } : `projeto “${String(f.project)}” não existe no app (crie com type "project" antes)`
}

function modalityRef(db: DB, v: unknown): string | undefined {
  const k = key(v)
  return db.profile.modalities.find((m) => key(m.id) === k || key(m.label) === k)?.id
}

/** Narrow a list of candidates by project and date when that settles it (never to zero). */
function narrow(db: DB, list: Rec[], q: Query, dateOfRec: (r: Rec) => string | undefined = dateOf): Rec[] {
  let out = list
  if (out.length > 1 && q.project) {
    const p = findProject(db.projects, q.project)
    const by = out.filter((r) => (p ? r.projectId === p.id : key(r.front) === key(q.project)))
    if (by.length) out = by
  }
  if (out.length > 1 && q.date) {
    const by = out.filter((r) => dateOfRec(r) === q.date)
    if (by.length) out = by
  }
  return out
}

const PRIORITY: FieldSpec = { kind: 'enum', label: 'prioridade', values: ['alta', 'media', 'baixa'], aliases: { p1: 'alta', p2: 'media', p3: 'baixa', média: 'media', optional: 'baixa', opcional: 'baixa' } }
const CONTEXT: FieldSpec = { kind: 'enum', label: 'contexto', values: ['geral', 'trabalho', 'vida_real', 'luna', 'viagem', 'conteudo', 'estudo', 'carreira'] }

// ─── task / waiting / backlog ───────────────────────────────────────────────

const taskBase = {
  collection: 'tasks' as const,
  titleOf: (r: Rec) => r.title as string,
  state: (r: Rec) => (r.status === 'done' ? 'done' : r.status === 'archived' ? 'gone' : 'open') as 'open' | 'done' | 'gone',
  lock: (r: Rec | undefined, f: Fields) => ((f.context ?? r?.context) === 'carreira' ? ('carreira' as const) : undefined),
  sub: (r: Rec, db: DB) => [r.date ?? (r.dueDate ? `prazo ${r.dueDate}` : undefined), projectName(db, r.projectId), r.status === 'done' ? 'feita' : undefined].filter(Boolean).join(' · ') || undefined,
}

const task: TypeDef = {
  ...taskBase,
  label: 'tarefa',
  fields: {
    title: { kind: 'str', label: 'título' },
    notes: { kind: 'text', label: 'notas' },
    status: { kind: 'enum', label: 'status', values: ['todo', 'doing', 'review', 'done'] },
    date: { kind: 'date', label: 'dia' },
    time: { kind: 'time', label: 'hora' },
    durationMin: { kind: 'int', label: 'duração (min)' },
    dueDate: { kind: 'date', label: 'prazo' },
    priority: PRIORITY,
    project: { kind: 'str', label: 'projeto' },
    context: CONTEXT,
    doneCriteria: { kind: 'text', label: 'feito quando' },
    tags: { kind: 'strs', label: 'tags' },
  },
  moveFields: ['date', 'time', 'dueDate'],
  required: ['title'],
  belongs: (r) => !r.recurrence && r.status !== 'waiting' && !r.waiting,
  read: (r, db) => ({ title: r.title, notes: r.notes, status: r.status, date: r.date, time: r.time, durationMin: r.durationMin, dueDate: r.dueDate, priority: r.priority, project: projectName(db, r.projectId), context: r.context, doneCriteria: r.doneCriteria, tags: r.tags }),
  write: (f, db) => {
    const proj = projectRef(db, f)
    if (typeof proj === 'string') return proj
    const out: Record<string, unknown> = { ...pick(f, ['title', 'notes', 'status', 'date', 'time', 'durationMin', 'dueDate', 'priority', 'context', 'doneCriteria', 'tags']), ...proj }
    if (f.status === 'done') out.completedAt = nowISO()
    // A day given = it is planned for that day (no longer in a "someday" bucket).
    if (f.date) out.bucket = undefined
    return out
  },
  build: (f, db) => {
    const w = task.write(f, db)
    if (typeof w === 'string') return w
    return { status: 'todo', context: 'geral', order: nextOrder(db.tasks), ...w }
  },
  completeTarget: () => ({ status: 'done' }),
  archiveTarget: { status: 'archived' },
  match: (db, q) => {
    if (!q.title) return []
    const stage = stageOf(q.title)
    const list = db.tasks.filter((t) => !t.recurrence && t.status !== 'waiting' && (sameTitle(t.title, q.title!) || t.aliases?.some((a) => sameTitle(a, q.title!)) || (!!stage && stage.length >= 4 && stageOf(t.title) === stage))) as Rec[]
    // An archived look-alike is only "the same" when nothing live matches (so it reads as "você tirou").
    const live = list.filter((t) => t.status !== 'archived')
    return narrow(db, live.length ? live : list, q)
  },
}

const waiting: TypeDef = {
  ...taskBase,
  label: 'aguardando retorno',
  fields: {
    title: { kind: 'str', label: 'título' },
    who: { kind: 'str', label: 'de quem' },
    since: { kind: 'date', label: 'desde' },
    followUpOn: { kind: 'date', label: 'cobrar em' },
    notes: { kind: 'text', label: 'notas' },
    project: { kind: 'str', label: 'projeto' },
  },
  moveFields: ['followUpOn'],
  required: ['title'],
  belongs: (r) => r.status === 'waiting' || !!r.waiting,
  read: (r, db) => ({ title: r.title, who: r.waiting?.who, since: r.waiting?.since, followUpOn: r.waiting?.followUpOn, notes: r.notes, project: projectName(db, r.projectId), status: r.status }),
  write: (f, db, r) => {
    const proj = projectRef(db, f)
    if (typeof proj === 'string') return proj
    const out: Record<string, unknown> = { ...pick(f, ['title', 'notes']), ...proj }
    if (f.who !== undefined || f.since !== undefined || f.followUpOn !== undefined) {
      const cur = (r?.waiting ?? {}) as Record<string, unknown>
      out.waiting = { ...cur, who: f.who ?? cur.who ?? 'alguém', since: f.since ?? cur.since, ...(f.followUpOn !== undefined ? { followUpOn: f.followUpOn } : {}) }
    }
    if (f.status === 'done') Object.assign(out, { status: 'done', completedAt: nowISO() })
    if (f.status === 'archived') out.status = 'archived'
    return out
  },
  build: (f, db, today) => {
    const w = waiting.write({ ...f, who: f.who ?? 'alguém', since: f.since ?? today }, db)
    if (typeof w === 'string') return w
    return { status: 'waiting', context: 'trabalho', order: nextOrder(db.tasks), ...w }
  },
  completeTarget: () => ({ status: 'done' }),
  archiveTarget: { status: 'archived' },
  match: (db, q) => {
    const who = key(q.fields.who)
    const list = db.tasks.filter((t) => (t.status === 'waiting' || t.waiting) && t.status !== 'archived' && ((!!q.title && sameTitle(t.title, q.title)) || (!!who && key(t.waiting?.who) === who))) as Rec[]
    return narrow(db, list, q, (r) => r.waiting?.since)
  },
}

const backlog: TypeDef = {
  label: 'backlog',
  collection: 'backlogItems',
  fields: {
    title: { kind: 'str', label: 'título' },
    notes: { kind: 'text', label: 'notas' },
    from: { kind: 'date', label: 'a partir de' },
    until: { kind: 'date', label: 'até' },
    front: { kind: 'str', label: 'frente' },
    project: { kind: 'str', label: 'projeto' },
  },
  moveFields: ['from', 'until'],
  required: ['title'],
  belongs: (r) => r.kind === 'scheduled',
  titleOf: (r) => r.title,
  read: (r, db) => ({ title: r.title, notes: r.notes, from: r.window?.from, until: r.window?.until, front: r.front, project: projectName(db, r.projectId), status: r.status }),
  write: (f, db, r) => {
    const proj = projectRef(db, f)
    if (typeof proj === 'string') return proj
    const out: Record<string, unknown> = { ...pick(f, ['title', 'notes', 'front', 'status']), ...proj }
    if (f.from !== undefined || f.until !== undefined) {
      const from = (f.from ?? r?.window?.from) as string | undefined
      const until = (f.until ?? r?.window?.until) as string | undefined
      out.window = from || until ? { from, until, label: [from && `a partir de ${from.slice(8)}/${from.slice(5, 7)}`, until && `até ${until.slice(8)}/${until.slice(5, 7)}`].filter(Boolean).join(' ') } : undefined
    }
    return out
  },
  build: (f, db, today) => {
    const w = backlog.write(f, db)
    if (typeof w === 'string') return w
    return { kind: 'scheduled', status: 'open', ...w, source: { type: 'changes', label: 'Arquivo de mudanças', briefingDate: today, sourceKey: '', importBatchId: '' } }
  },
  state: (r) => (r.status === 'done' ? 'done' : r.status === 'dismissed' ? 'gone' : 'open'),
  completeTarget: () => ({ status: 'done' }),
  archiveTarget: { status: 'dismissed' },
  match: (db, q) => narrow(db, (q.title ? db.backlogItems.filter((b) => b.kind === 'scheduled' && sameTitle(b.title, q.title!)) : []) as Rec[], q, (r) => r.window?.from),
  sub: (r) => r.window?.label,
}

// ─── workouts ───────────────────────────────────────────────────────────────

const workoutFields: Record<string, FieldSpec> = {
  date: { kind: 'date', label: 'dia' },
  time: { kind: 'time', label: 'hora' },
  modality: { kind: 'str', label: 'modalidade' },
  title: { kind: 'str', label: 'título' },
  plannedDurationMin: { kind: 'int', label: 'duração planejada (min)' },
  plannedDistanceKm: { kind: 'int', label: 'distância planejada (km)' },
  intensity: { kind: 'enum', label: 'intensidade', values: ['leve', 'moderado', 'forte'] },
  notes: { kind: 'text', label: 'notas' },
  // What happened (a 'complete' of the planned one, or a done workout).
  durationMin: { kind: 'int', label: 'duração (min)' },
  distanceKm: { kind: 'int', label: 'distância (km)' },
  feeling: { kind: 'int', label: 'como foi (1–5)' },
}
const workoutBase = {
  collection: 'workouts' as const,
  moveFields: ['date', 'time'],
  required: ['date', 'modality'],
  belongs: () => true,
  titleOf: (r: Rec, db: DB) => r.title ?? `${db.profile.modalities.find((m) => m.id === r.modality)?.label ?? r.modality} · ${r.date}`,
  read: (r: Rec) => ({ date: r.date, time: r.time, modality: r.modality, title: r.title, plannedDurationMin: r.plannedDurationMin, plannedDistanceKm: r.plannedDistanceKm, intensity: r.intensity, notes: r.notes, durationMin: r.durationMin, distanceKm: r.distanceKm, feeling: r.feeling, status: r.status }),
  write: (f: Fields, db: DB) => {
    const out: Record<string, unknown> = pick(f, ['date', 'time', 'title', 'plannedDurationMin', 'plannedDistanceKm', 'intensity', 'notes', 'durationMin', 'distanceKm', 'feeling', 'status'])
    if (f.modality !== undefined) {
      const m = modalityRef(db, f.modality)
      if (!m) return `modalidade “${String(f.modality)}” não existe (use: ${db.profile.modalities.map((x) => x.id).join(', ')})`
      out.modality = m
    }
    return out
  },
  state: (r: Rec) => (r.status === 'feito' || r.status === 'adaptado' ? 'done' : r.status === 'pulado' ? 'gone' : 'open') as 'open' | 'done' | 'gone',
  completeTarget: (_r: Rec, f: Fields) => ({ status: 'feito', ...pick(f, ['durationMin', 'distanceKm', 'feeling']) }),
  archiveTarget: { status: 'pulado' },
  match: (db: DB, q: Query) => {
    const date = q.date ?? (q.fields.date as string | undefined)
    if (!date) return []
    const m = q.fields.modality !== undefined ? modalityRef(db, q.fields.modality) : undefined
    let list = db.workouts.filter((w) => w.date === date && (!m || w.modality === m)) as Rec[]
    if (list.length > 1 && q.title) {
      const t = list.filter((w) => looseTitle(w.title, q.title))
      if (t.length) list = t
    }
    return list
  },
  sub: (r: Rec) => [r.date, r.time, r.status].filter(Boolean).join(' · '),
}

const plannedWorkout: TypeDef = {
  ...workoutBase,
  label: 'treino planejado',
  fields: workoutFields,
  build: (f, db) => {
    const w = workoutBase.write(f, db)
    if (typeof w === 'string') return w
    return { status: 'planejado', planType: 'base', order: nextOrder(db.workouts.filter((x) => x.date === f.date)), ...w }
  },
}

const completedWorkout: TypeDef = {
  ...workoutBase,
  label: 'treino feito',
  fields: workoutFields,
  onExisting: 'complete',
  build: (f, db) => {
    const w = workoutBase.write(f, db)
    if (typeof w === 'string') return w
    if (typeof f.feeling === 'number' && (f.feeling < 1 || f.feeling > 5)) return 'feeling vai de 1 a 5'
    return { status: 'feito', order: nextOrder(db.workouts.filter((x) => x.date === f.date)), ...w }
  },
}

// ─── meals ──────────────────────────────────────────────────────────────────

const SLOT: FieldSpec = { kind: 'enum', label: 'refeição', values: ['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'extra'], aliases: { café: 'cafe', 'café da manhã': 'cafe', almoço: 'almoco', lanche: 'lanche_tarde' } }
const mealBase = {
  collection: 'meals' as const,
  fields: { date: { kind: 'date', label: 'dia' }, slot: SLOT, description: { kind: 'text', label: 'o quê' }, time: { kind: 'time', label: 'hora' } } as Record<string, FieldSpec>,
  moveFields: ['date', 'time'],
  required: ['date', 'slot', 'description'],
  belongs: () => true,
  titleOf: (r: Rec) => `${r.description}`.slice(0, 80) || `${r.slot} · ${r.date}`,
  read: (r: Rec) => ({ date: r.date, slot: r.slot, description: r.description, time: r.time, done: r.done }),
  write: (f: Fields) => {
    const out: Record<string, unknown> = pick(f, ['date', 'slot', 'description', 'time'])
    if (f.done === true) Object.assign(out, { done: true, consumedAt: out.consumedAt ?? nowISO() })
    return out
  },
  state: (r: Rec) => (r.done ? 'done' : 'open') as 'open' | 'done' | 'gone',
  completeTarget: () => ({ done: true }),
  match: (db: DB, q: Query) => {
    const date = q.date ?? (q.fields.date as string | undefined)
    if (!date) return []
    const slot = q.fields.slot as string | undefined
    return db.meals.filter((m) => m.date === date && (!slot || m.slot === slot)) as Rec[]
  },
  sub: (r: Rec) => [r.date, r.slot, r.done ? 'comeu' : 'planejada'].join(' · '),
}

const plannedMeal: TypeDef = {
  ...mealBase,
  label: 'refeição planejada',
  build: (f) => ({ done: false, planned: true, tags: [], contentSource: 'marina', ...mealBase.write(f) }),
}
const consumedMeal: TypeDef = {
  ...mealBase,
  label: 'refeição feita',
  onExisting: 'complete',
  build: (f) => ({ done: true, tags: [], consumedAt: f.time && f.date ? `${f.date}T${f.time}:00-03:00` : nowISO(), contentSource: 'marina', ...mealBase.write(f) }),
}

// ─── money (existing receivables model) ─────────────────────────────────────

const moneyLock = () => 'dinheiro' as const
const revenueFields: Record<string, FieldSpec> = {
  title: { kind: 'str', label: 'título' },
  amountCents: { kind: 'cents', label: 'valor (centavos)' },
  date: { kind: 'date', label: 'data prevista' },
  notes: { kind: 'text', label: 'notas' },
}
const revenueBase = {
  collection: 'expenses' as const,
  fields: revenueFields,
  moveFields: ['date'],
  required: ['title', 'amountCents', 'date'],
  belongs: (r: Rec) => isIncome(r as never),
  titleOf: (r: Rec) => `${r.title}${r.period ? ` · ${r.period}` : ''}`,
  read: (r: Rec) => ({ title: r.title, amountCents: r.status === 'received' ? (r.receivedAmountCents ?? r.amountCents) : (r.expectedAmountCents ?? r.amountCents), date: r.expectedDate ?? r.date, notes: r.notes, status: r.status }),
  write: (f: Fields) => {
    const out: Record<string, unknown> = pick(f, ['title', 'notes'])
    if (f.amountCents !== undefined) out.expectedAmountCents = f.amountCents
    if (f.date !== undefined) out.expectedDate = f.date
    return out
  },
  state: (r: Rec) => (r.status === 'received' ? 'done' : r.status === 'cancelled' ? 'gone' : 'open') as 'open' | 'done' | 'gone',
  completeTarget: (_r: Rec, f: Fields) => ({ status: 'received', ...pick(f, ['amountCents']) }),
  archiveTarget: { status: 'cancelled' },
  lock: moneyLock,
  match: (db: DB, q: Query) => {
    if (!q.title) return []
    const date = q.date ?? (q.fields.date as string | undefined)
    const pool: Rec[] = date ? (receivablesFor(db, monthKey(date)) as Rec[]) : (db.expenses.filter((e) => isIncome(e)) as Rec[])
    const contract = findContract(db, q.title)
    return pool.filter((e) => looseTitle(e.title, q.title) || (!!contract && e.contractId === contract.id))
  },
  exec: {
    update: (c: ExecCtx) => void updateReceivable(c.id!, c.patch as never),
    move: (c: ExecCtx) => void updateReceivable(c.id!, c.patch as never),
    complete: (c: ExecCtx) => void markReceived(c.id!, { amountCents: c.target.amountCents as number | undefined }),
    archive: (c: ExecCtx) => void cancelReceivable(c.id!),
  },
  sub: (r: Rec) => [r.expectedDate ?? r.date, r.status === 'received' ? 'recebido' : r.status === 'cancelled' ? 'cancelado' : 'previsto'].filter(Boolean).join(' · '),
  virtual: (db: DB) => {
    const now = monthKey(todayKey())
    const stored = new Set(db.expenses.map((e) => e.id))
    return [now, nextPeriod(now)].flatMap((p) => receivablesFor(db, p)).filter((e) => !stored.has(e.id)) as Rec[]
  },
}

const expectedRevenue: TypeDef = {
  ...revenueBase,
  label: 'receita prevista',
  build: (f) => ({ title: f.title, amountCents: f.amountCents, date: f.date, notes: f.notes, received: false }),
  exec: { ...revenueBase.exec, create: (c) => void addExtraIncome({ title: String(c.fields.title), amountCents: Number(c.fields.amountCents), date: String(c.fields.date), received: false, notes: c.fields.notes as string | undefined }) },
}
const receivedRevenue: TypeDef = {
  ...revenueBase,
  label: 'receita recebida',
  onExisting: 'complete',
  build: (f) => ({ title: f.title, amountCents: f.amountCents, date: f.date, notes: f.notes, received: true }),
  exec: { ...revenueBase.exec, create: (c) => void addExtraIncome({ title: String(c.fields.title), amountCents: Number(c.fields.amountCents), date: String(c.fields.date), received: true, notes: c.fields.notes as string | undefined }) },
}

const expense: TypeDef = {
  label: 'gasto',
  collection: 'expenses',
  fields: {
    title: { kind: 'str', label: 'título' },
    amountCents: { kind: 'cents', label: 'valor (centavos)' },
    date: { kind: 'date', label: 'dia' },
    category: { kind: 'str', label: 'categoria' },
    payment: { kind: 'enum', label: 'pagamento', values: ['credito', 'debito', 'pix', 'dinheiro', 'boleto', 'vale'] },
    planned: { kind: 'bool', label: 'planejado' },
    notes: { kind: 'text', label: 'notas' },
  },
  moveFields: ['date'],
  required: ['title', 'amountCents', 'date'],
  belongs: (r) => !isIncome(r as never),
  titleOf: (r) => r.title,
  read: (r, db) => ({ title: r.title, amountCents: r.amountCents, date: r.date, category: db.financialCategories.find((c) => c.id === r.categoryId)?.name, payment: r.payment, planned: r.planned, notes: r.notes, status: r.status }),
  write: (f, db) => {
    const out: Record<string, unknown> = pick(f, ['title', 'amountCents', 'date', 'payment', 'planned', 'notes', 'status'])
    if (f.category !== undefined) {
      const c = db.financialCategories.find((x) => key(x.name) === key(f.category) || x.id === f.category)
      if (!c) return `categoria “${String(f.category)}” não existe (use uma de Dinheiro)`
      out.categoryId = c.id
    }
    return out
  },
  build: (f, db) => {
    const w = expense.write(f, db)
    if (typeof w === 'string') return w
    const fallback = db.financialCategories.find((c) => c.id === 'cat-outros')?.id ?? db.financialCategories[0]?.id
    if (!w.categoryId && !fallback) return 'sem categoria de gasto no app'
    return { status: 'paid', origin: 'manual', type: 'expense', categoryId: fallback, ...w }
  },
  state: (r) => (r.status === 'cancelled' ? 'gone' : 'open'),
  completeTarget: (r) => (r.status === 'planned_purchase' ? { status: 'paid' } : {}),
  lock: moneyLock,
  match: (db, q) => {
    const date = q.date ?? (q.fields.date as string | undefined)
    if (!q.title || !date) return []
    const list = db.expenses.filter((e) => !isIncome(e) && e.date === date && looseTitle(e.title, q.title)) as Rec[]
    const amount = q.fields.amountCents
    const same = typeof amount === 'number' ? list.filter((e) => e.amountCents === amount) : list
    return same.length ? same : list
  },
  sub: (r) => r.date,
}

// ─── UGC (brand + opportunity, through the UGC ops) ─────────────────────────

const ugcProspect: TypeDef = {
  label: 'marca (prospecção UGC)',
  collection: 'brands',
  fields: {
    name: { kind: 'str', label: 'marca' },
    category: { kind: 'str', label: 'categoria' },
    website: { kind: 'str', label: 'site' },
    instagram: { kind: 'str', label: 'instagram' },
    priorityTier: { kind: 'enum', label: 'prioridade', values: ['S', 'A', 'B', 'C'] },
    notes: { kind: 'text', label: 'notas' },
    tags: { kind: 'strs', label: 'tags' },
  },
  moveFields: [],
  required: ['name'],
  belongs: () => true,
  titleOf: (r) => r.name,
  read: (r) => ({ name: r.name, category: r.category, website: r.website, instagram: r.instagram, priorityTier: r.priorityTier, notes: r.notes, tags: r.tags, archived: r.archived }),
  write: (f) => pick(f, ['name', 'category', 'website', 'instagram', 'priorityTier', 'notes', 'tags']),
  build: (f) => pick(f, ['name', 'category', 'website', 'instagram', 'priorityTier', 'notes', 'tags']),
  state: (r) => (r.archived ? 'gone' : 'open'),
  archiveTarget: { archived: true },
  match: (db, q) => {
    const name = (q.fields.name ?? q.fields.brand ?? q.title) as string | undefined
    const b = name ? findBrand(db, name) : undefined
    return b ? [b as Rec] : []
  },
  exec: {
    // A brand once + a live prospecting opportunity once (the same op Lumos and the UGC space use).
    create: (c) => {
      const { name, ...extra } = c.fields
      void ensureProspect(String(name), extra as never)
    },
    archive: (c) => void archiveBrand(c.id!, 'arquivada por importação'),
  },
}

const STAGES = ['prospectar', 'contatada', 'conversa', 'producao', 'entregue', 'fechada'] as const
const ugcDeal: TypeDef = {
  label: 'negociação UGC',
  collection: 'ugcOpportunities',
  fields: {
    brand: { kind: 'str', label: 'marca' },
    title: { kind: 'str', label: 'título' },
    stage: { kind: 'enum', label: 'etapa', values: STAGES, aliases: { produção: 'producao' } },
    type: { kind: 'enum', label: 'tipo', values: ['ugc', 'permuta', 'campanha_paga', 'afiliado', 'embaixadora', 'evento', 'press_kit', 'programa_creators'] },
    nextFollowUpAt: { kind: 'date', label: 'próximo follow-up' },
    proposedDeliverables: { kind: 'text', label: 'entregáveis' },
    estimatedValueCents: { kind: 'cents', label: 'valor estimado (centavos)' },
    agreedValueCents: { kind: 'cents', label: 'valor fechado (centavos)' },
    notes: { kind: 'text', label: 'notas' },
  },
  moveFields: ['stage', 'nextFollowUpAt'],
  required: ['brand'],
  belongs: () => true,
  titleOf: (r, db) => `${db.brands.find((b) => b.id === r.brandId)?.name ?? ''} · ${r.title}`.replace(/^ · /, ''),
  read: (r, db) => ({ brand: db.brands.find((b) => b.id === r.brandId)?.name, title: r.title, stage: r.stage, status: r.status, type: r.type, nextFollowUpAt: r.nextFollowUpAt, proposedDeliverables: r.proposedDeliverables, estimatedValueCents: r.estimatedValueCents, agreedValueCents: r.agreedValueCents, notes: r.notes }),
  write: (f, db) => {
    const out: Record<string, unknown> = pick(f, ['title', 'stage', 'status', 'type', 'nextFollowUpAt', 'proposedDeliverables', 'estimatedValueCents', 'agreedValueCents', 'notes'])
    if (f.brand !== undefined) {
      const b = findBrand(db, String(f.brand))
      if (!b) return `marca “${String(f.brand)}” não existe (crie com type "ugcProspect" antes)`
      out.brandId = b.id
    }
    return out
  },
  build: (f, db) => ugcDeal.write(f, db),
  state: (r) => (r.status === 'concluida' ? 'done' : ['perdida', 'recusada', 'pausada'].includes(r.status) ? 'gone' : 'open'),
  completeTarget: () => ({ stage: 'fechada', status: 'concluida' }),
  archiveTarget: { status: 'pausada' },
  lock: (_r, f) => (f.estimatedValueCents !== undefined || f.agreedValueCents !== undefined ? 'dinheiro' : undefined),
  match: (db, q) => {
    const name = (q.fields.brand ?? q.title) as string | undefined
    const b = name ? findBrand(db, name) : undefined
    if (!b) return []
    const titled = q.fields.title ? db.ugcOpportunities.filter((o) => o.brandId === b.id && sameTitle(o.title, String(q.fields.title))) : []
    if (titled.length) return titled as Rec[]
    const cur = currentOpportunity(db, b.id)
    return cur ? [cur as Rec] : []
  },
  exec: {
    create: (c) => {
      const { brandId, ...data } = c.data as { brandId: string }
      void addOpportunity(brandId, data)
    },
    move: (c) => {
      const { stage, ...rest } = c.patch as { stage?: (typeof STAGES)[number] }
      if (stage) void setStage(c.id!, stage, c.today)
      if (Object.keys(rest).length) actions.update('ugcOpportunities', c.id!, rest)
    },
    complete: (c) => void setStage(c.id!, 'fechada', c.today),
    archive: (c) => void endOpportunity(c.id!, 'pausada', 'pausada por importação'),
  },
  sub: (r) => [r.stage, r.status].join(' · '),
}

// ─── projects & routines ────────────────────────────────────────────────────

const project: TypeDef = {
  label: 'projeto',
  collection: 'projects',
  fields: {
    name: { kind: 'str', label: 'nome' },
    status: { kind: 'enum', label: 'status', values: ['ativo', 'planejando', 'pausado', 'concluido'] },
    priority: PRIORITY,
    description: { kind: 'text', label: 'descrição' },
    objective: { kind: 'text', label: 'objetivo' },
    nextAction: { kind: 'text', label: 'próxima ação' },
    deadline: { kind: 'date', label: 'prazo' },
  },
  moveFields: ['deadline'],
  required: ['name'],
  belongs: () => true,
  titleOf: (r) => r.name,
  read: (r) => ({ name: r.name, status: r.status, priority: r.priority, description: r.description, objective: r.objective, nextAction: r.nextAction, deadline: r.deadline }),
  write: (f) => pick(f, ['name', 'status', 'priority', 'description', 'objective', 'nextAction', 'deadline']),
  build: (f, db) => ({ emoji: '📁', tone: 'ink', status: 'ativo', priority: 'media', links: [], files: [], people: [], decisions: [], changelog: [], kind: 'default', order: nextOrder(db.projects), ...pick(f, ['name', 'status', 'priority', 'description', 'objective', 'nextAction', 'deadline']) }),
  state: (r) => (r.status === 'concluido' ? 'done' : 'open'),
  completeTarget: () => ({ status: 'concluido' }),
  match: (db, q) => {
    const name = (q.fields.name ?? q.title) as string | undefined
    const p = name ? findProject(db.projects, name) : undefined
    return p ? [p as unknown as Rec] : []
  },
}

const routine: TypeDef = {
  label: 'hábito / rotina',
  collection: 'routineItems',
  fields: {
    title: { kind: 'str', label: 'título' },
    routine: { kind: 'str', label: 'rotina' },
    time: { kind: 'time', label: 'hora' },
    durationMin: { kind: 'int', label: 'duração (min)' },
    weekdays: { kind: 'weekdays', label: 'dias da semana' },
    date: { kind: 'date', label: 'feito no dia' },
  },
  moveFields: ['time'],
  required: ['title', 'routine'],
  belongs: () => true,
  titleOf: (r) => r.title,
  read: (r, db) => ({ title: r.title, routine: db.routines.find((x) => x.id === r.routineId)?.name, time: r.time, durationMin: r.durationMin, weekdays: r.recurrence?.kind === 'weekly' ? r.recurrence.weekdays : undefined, active: r.active }),
  write: (f, db) => {
    const out: Record<string, unknown> = pick(f, ['title', 'time', 'durationMin'])
    if (f.routine !== undefined) {
      const r = db.routines.find((x) => key(x.name) === key(f.routine) || x.id === f.routine)
      if (!r) return `rotina “${String(f.routine)}” não existe (use: ${db.routines.map((x) => x.name).join(', ')})`
      out.routineId = r.id
    }
    if (f.weekdays !== undefined) out.recurrence = { kind: 'weekly', weekdays: f.weekdays as Weekday[] }
    return out
  },
  build: (f, db) => {
    const w = routine.write(f, db)
    if (typeof w === 'string') return w
    return { active: true, recurrence: { kind: 'daily' }, order: nextOrder(db.routineItems.filter((x) => x.routineId === w.routineId)), source: 'marina', ...w }
  },
  state: (r) => (r.active === false ? 'gone' : 'open'),
  archiveTarget: { active: false },
  match: (db, q) => (q.title ? (db.routineItems.filter((r) => sameTitle(r.title, q.title!)) as Rec[]) : []),
  exec: {
    // Done on a day = an Occurrence (the rule itself is never touched).
    complete: (c) => {
      const date = (c.fields.date as string | undefined) ?? c.today
      const done = getDB().occurrences.some((o) => o.parentType === 'routineItem' && o.parentId === c.id && o.date === date)
      if (!done) actions.toggleOccurrence('routineItem', c.id!, date)
    },
  },
}

export const TYPE_DEFS: Partial<Record<ChangeType, TypeDef>> = {
  task,
  waiting,
  backlog,
  plannedWorkout,
  completedWorkout,
  plannedMeal,
  consumedMeal,
  expectedRevenue,
  receivedRevenue,
  expense,
  ugcProspect,
  ugcDeal,
  project,
  routine,
}

/** Labels for every type, supported or not (the preview names things in her words). */
export const TYPE_LABEL: Record<string, string> = { recurring: 'recorrência', ...Object.fromEntries(Object.entries(TYPE_DEFS).map(([k, d]) => [k, d!.label])) }

/** "recurring" is recognised against what exists — never created or changed by a file. */
export function findRecurring(db: DB, title: string): { collection: CollectionKey; id: string; title: string } | undefined {
  const t = db.tasks.find((x) => x.recurrence && looseTitle(x.title, title))
  if (t) return { collection: 'tasks', id: t.id, title: t.title }
  const b = db.backlogItems.find((x) => x.kind === 'recurring' && (looseTitle(x.title, title) || looseTitle(x.recognizedAs, title)))
  if (b) return { collection: 'backlogItems', id: b.id, title: b.title }
  const c = db.financialCategories.find((x) => x.bill && !x.archived && looseTitle(x.name, title))
  if (c) return { collection: 'financialCategories', id: c.id, title: c.name }
  const r = db.routineItems.find((x) => x.active && looseTitle(x.title, title))
  if (r) return { collection: 'routineItems', id: r.id, title: r.title }
  return undefined
}

// ─── Field validation ───────────────────────────────────────────────────────

/** Validates and normalizes `fields` against the type. Unknown fields are reported and ignored (never written). */
export function cleanFields(def: TypeDef, f: Fields): { clean: Fields; errors: string[]; ignored: string[] } {
  const clean: Fields = {}
  const errors: string[] = []
  const ignored: string[] = []
  for (const [k, raw] of Object.entries(f)) {
    // Common alias: money in reais.
    if (k === 'amount' && def.fields.amountCents && typeof raw === 'number' && Number.isFinite(raw)) {
      clean.amountCents = Math.round(raw * 100)
      continue
    }
    const spec = def.fields[k]
    if (!spec) {
      if (k === 'status' || k === 'done' || k === 'archived' || k === 'active') errors.push(`“${k}” não se muda com update — use op complete / archive`)
      else ignored.push(k)
      continue
    }
    if (raw === null) {
      // Clearing a field is allowed for optional ones only.
      if (def.required?.includes(k)) errors.push(`${spec.label} não pode ficar vazio`)
      else clean[k] = undefined
      continue
    }
    const bad = (why: string) => errors.push(`${spec.label}: ${why}`)
    switch (spec.kind) {
      case 'str':
      case 'text':
        if (typeof raw !== 'string' || !raw.trim()) bad('precisa ser texto')
        else if (spec.kind === 'str' && raw.length > 300) bad('longo demais (máx. 300)')
        else clean[k] = raw.trim()
        break
      case 'date':
        if (!isDateKey(raw) || Number.isNaN(Date.parse(`${raw}T12:00:00Z`))) bad('data AAAA-MM-DD')
        else clean[k] = raw
        break
      case 'iso':
        if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) bad('data/hora ISO')
        else clean[k] = raw
        break
      case 'time':
        if (typeof raw !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) bad('hora HH:MM')
        else clean[k] = raw
        break
      case 'int':
      case 'cents':
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1e10) bad('número ≥ 0')
        else clean[k] = spec.kind === 'cents' ? Math.round(raw) : raw
        break
      case 'bool':
        if (typeof raw !== 'boolean') bad('true ou false')
        else clean[k] = raw
        break
      case 'strs':
        if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string' || x.length > 80)) bad('lista de textos curtos')
        else clean[k] = raw.map((x: string) => x.trim()).filter(Boolean)
        break
      case 'weekdays':
        if (!Array.isArray(raw) || !raw.length || raw.some((x) => !Number.isInteger(x) || x < 0 || x > 6)) bad('lista de 0 (dom) a 6 (sáb)')
        else clean[k] = [...new Set(raw as number[])].sort()
        break
      case 'enum': {
        const v = typeof raw === 'string' ? raw.trim() : ''
        const n = spec.aliases?.[v.toLowerCase()] ?? (spec.values.includes(v) ? v : spec.values.find((x) => x === normalize(v)))
        if (!n) bad(`use ${spec.values.join(' | ')}`)
        else clean[k] = n
        break
      }
    }
  }
  return { clean, errors, ignored }
}
