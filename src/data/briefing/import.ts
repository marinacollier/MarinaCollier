/**
 * Daily Executive Briefing → Marina OS. The briefing (written outside the app) ends with a JSON block
 * ("BLOCO PARA MARINA OS APP"): the day's checklist, a backlog watchlist and the recurring payments.
 * This module reads that block and plans what to write — pure, nothing is written here.
 *
 * Rules:
 * - one record per thing: a task already in the app (same title) is never duplicated; from a DAILY
 *   briefing an open one is pulled to that day instead;
 * - no invented values: payments come in as categories with a check, never with an amount; a due day
 *   only exists when she gives it;
 * - the briefing's own words stay: "Feito quando: …" (done criteria) goes to the task notes, estimated
 *   minutes to its duration.
 */
import type { DateKey, DB, FinancialCategory, Priority, Project, Task, Tone } from '../types'
import { categoryId } from '../defaults'
import { addDays, formatDayMonth, isDateKey } from '@/lib/date'
import { uid } from '@/lib/id'
import { normalize } from '@/lib/text'

export interface BriefingTask {
  title: string
  category?: string
  project?: string
  priority?: string
  done_criteria?: string
  estimated_minutes?: number
  status?: string
  due_date?: string | null
}

export interface BriefingWatch {
  title: string
  project?: string
  status?: string
  notes?: string
}

export interface BriefingBlock {
  date: DateKey
  source?: string
  tasks: BriefingTask[]
  backlog_watchlist?: BriefingWatch[]
  recurring_financial_categories?: string[]
}

// ─── Reading the block out of a pasted text ─────────────────────────────────

/** Hand-edited JSON is common ("Hortifruti" — *semanal*, a missing comma): fix only those shapes. */
function repair(json: string): string {
  return (
    json
      // "Name" — *note*  →  "Name — note"
      .replace(/"([^"\n]*)"\s*[—–-]+\s*\*([^*\n]*)\*/g, (_m, a: string, b: string) => `"${a} — ${b.trim()}"`)
      // two strings / objects on consecutive lines without a comma
      .replace(/"\s*\n(\s*)"/g, '",\n$1"')
      .replace(/}\s*\n(\s*){/g, '},\n$1{')
      // trailing commas
      .replace(/,\s*([}\]])/g, '$1')
  )
}

/** Balanced `{…}` blocks of a text (strings respected). */
function objectsIn(text: string): string[] {
  const out: string[] = []
  for (let i = text.indexOf('{'); i >= 0; i = text.indexOf('{', i + 1)) {
    let depth = 0
    let str = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (str) {
        if (c === '\\') j++
        else if (c === '"') str = false
      } else if (c === '"') str = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        out.push(text.slice(i, j + 1))
        i = j
        break
      }
    }
  }
  return out
}

/** Cheap check before parsing (used to keep a pasted briefing away from the sentence splitter). */
export function looksLikeBriefing(text: string): boolean {
  return /"tasks"\s*:\s*\[/.test(text) || /"recurring_financial_categories"\s*:/.test(text)
}

function asBlock(v: unknown): BriefingBlock | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const tasks = Array.isArray(o.tasks) ? o.tasks.filter((t): t is BriefingTask => !!t && typeof t === 'object' && typeof (t as BriefingTask).title === 'string' && !!(t as BriefingTask).title.trim()) : []
  const watch = Array.isArray(o.backlog_watchlist) ? o.backlog_watchlist.filter((t): t is BriefingWatch => !!t && typeof t === 'object' && typeof (t as BriefingWatch).title === 'string') : undefined
  const cats = Array.isArray(o.recurring_financial_categories) ? o.recurring_financial_categories.filter((c): c is string => typeof c === 'string' && !!c.trim()) : undefined
  if (!tasks.length && !watch?.length && !cats?.length) return undefined
  if (!isDateKey(o.date)) return undefined
  return { date: o.date, source: typeof o.source === 'string' ? o.source : undefined, tasks, backlog_watchlist: watch, recurring_financial_categories: cats }
}

/** The briefing's JSON blocks (a text may carry more than one; later ones complement earlier ones). */
export function readBriefing(text: string): { blocks: BriefingBlock[]; narrative: string } {
  const blocks: BriefingBlock[] = []
  let narrative = text
  for (const raw of objectsIn(text)) {
    if (!looksLikeBriefing(raw)) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      try {
        parsed = JSON.parse(repair(raw))
      } catch {
        continue
      }
    }
    const b = asBlock(parsed)
    if (!b) continue
    blocks.push(b)
    narrative = narrative.replace(raw, '')
  }
  narrative = narrative
    .replace(/```(?:json)?\s*```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { blocks, narrative }
}

// ─── Mapping ────────────────────────────────────────────────────────────────

const key = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '')
const sameTitle = (a: string, b: string) => key(a) === key(b)

export function priorityOf(p?: string): Priority | undefined {
  const v = (p ?? '').trim().toUpperCase()
  if (v === 'P1') return 'alta'
  if (v === 'P2') return 'media'
  if (v === 'P3' || v === 'OPTIONAL' || v === 'OPCIONAL') return 'baixa'
  return undefined
}

/** Fronts that are not projects (they map to a context or a trip). */
const NOT_PROJECT = new Set(['vidaadmin', 'vida', 'admin', 'carreira', 'africadosul', 'pessoal', ''])

export function findProject(projects: Pick<Project, 'id' | 'name'>[], name?: string): Pick<Project, 'id' | 'name'> | undefined {
  const k = key(name ?? '')
  if (!k || NOT_PROJECT.has(k)) return undefined
  return projects.find((p) => key(p.name) === k) ?? projects.find((p) => key(p.name).startsWith(k) || k.startsWith(key(p.name)))
}

function contextOf(t: BriefingTask): Pick<Task, 'context' | 'lifeAdminCategory' | 'area'> {
  const c = key(t.category ?? '')
  const p = key(t.project ?? '')
  if (/carreira|networking|portfolio/.test(c)) return { context: 'carreira', area: 'profissional' }
  if (c === 'ingles') return { context: 'estudo' }
  if (c === 'viagem' || p === 'africadosul') return { context: 'viagem' }
  if (c === 'financeiro' || c === 'logistica' || p === 'vidaadmin') {
    const car = /carro|multa|pedagio|\bb\.?o\b|ipva|licenciamento/.test(normalize(t.title))
    return { context: 'vida_real', lifeAdminCategory: car ? 'carro' : 'burocracia' }
  }
  return { context: 'trabalho', area: 'profissional' }
}

/** "Aguardar retorno do Vitor" → Vitor. */
export function whoOf(title: string, fallback?: string): string | undefined {
  const m = /(?:retorno|resposta|feedback|posi[cç][aã]o)\s+d[aoe]s?\s+(\p{Lu}[\p{L}]+)/u.exec(title) ?? /aguardar\s+(?:o\s+|a\s+)?(\p{Lu}[\p{L}]+)/u.exec(title)
  return m?.[1] ?? fallback
}

const isDaily = (b: BriefingBlock) => /daily|briefing/i.test(b.source ?? '') && !/backlog/i.test(b.source ?? '')

export interface TaskContext {
  /** Trip id for "África do Sul". */
  africaTripId?: string
  order: number
}

/** One briefing task → the task's data (no id/stamps). Pure. */
export function taskFromBriefing(t: BriefingTask, block: BriefingBlock, ctx: TaskContext, projectId?: string): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  const due = t.due_date && isDateKey(t.due_date) ? t.due_date : undefined
  const status = (t.status ?? 'todo').toLowerCase()
  const daily = isDaily(block)
  const priority = priorityOf(t.priority)
  const optional = /optional|opcional/i.test(t.priority ?? '')
  const notes = [t.done_criteria?.trim() ? `Feito quando: ${t.done_criteria.trim()}` : undefined, `Origem: ${block.source ?? 'Briefing'} · ${formatDayMonth(block.date)}`].filter(Boolean).join('\n')
  const base = {
    ...contextOf(t),
    title: t.title.trim(),
    notes,
    priority,
    durationMin: typeof t.estimated_minutes === 'number' && t.estimated_minutes > 0 ? Math.round(t.estimated_minutes) : undefined,
    projectId,
    tripId: key(t.project ?? '') === 'africadosul' ? ctx.africaTripId : undefined,
    order: ctx.order,
  }
  if (status === 'waiting') {
    const who = whoOf(t.title, t.project)
    return { ...base, title: who && /aguardar/i.test(t.title) ? `Retorno · ${t.project ?? who}` : base.title, status: 'waiting', waiting: { who: who ?? 'alguém', since: block.date, followUpOn: due } }
  }
  if (status === 'done') return { ...base, status: 'done', date: block.date, completedAt: `${block.date}T12:00:00.000Z` }
  // Daily briefing: the checklist IS that day. Backlog: dated only when due by the next day; else a deadline.
  if (daily) return { ...base, status: 'todo', date: block.date, dueDate: due && due > block.date ? due : undefined }
  if (due && due <= addDays(block.date, 1)) return { ...base, status: 'todo', date: due }
  return { ...base, status: 'todo', dueDate: due, bucket: optional ? 'algum_dia' : due || priority === 'alta' ? 'semana' : 'algum_dia' }
}

// ─── Payments (categories with a check) ─────────────────────────────────────

const EMOJI: [RegExp, string][] = [
  [/cartao/, '💳'],
  [/aluguel/, '🏡'],
  [/carro|gasolina|multa|pedagio|estacionamento/, '🚗'],
  [/seguro/, '🛡️'],
  [/saude/, '🩺'],
  [/luna|racao/, '🐾'],
  [/faculdade|ingles/, '📚'],
  [/enel|luz/, '💡'],
  [/divida|banco/, '🏦'],
  [/feira|hortifruti|carnes|mercado/, '🥬'],
  [/limpeza/, '🧽'],
  [/assinatura/, '🔁'],
  [/ajuda|mae|vo\b/, '💛'],
  [/mercado livre/, '📦'],
]

/** "Hortifruti e carnes — semanal e não mensal" → weekly; "Ajuda mãe $" → "Ajuda mãe". */
export function billFromName(raw: string): { name: string; every: 'mes' | 'semana' } {
  const [name, ...rest] = raw.split(/\s+[—–]\s+/)
  return { name: name.replace(/\s*\$\s*$/, '').trim(), every: /^\s*semanal|por semana/i.test(rest.join(' ')) ? 'semana' : 'mes' }
}

export function categoryFromBill(raw: string, order: number): Omit<FinancialCategory, 'createdAt' | 'updatedAt'> {
  const { name, every } = billFromName(raw)
  const n = normalize(name)
  return { id: categoryId(name), name, emoji: EMOJI.find(([re]) => re.test(n))?.[1] ?? '•', tone: 'ink' as Tone, order, archived: false, bill: { every } }
}

// ─── The plan ───────────────────────────────────────────────────────────────

export type BriefingOp =
  | { kind: 'project'; data: Omit<Project, 'createdAt' | 'updatedAt'> }
  | { kind: 'task'; data: Omit<Task, 'createdAt' | 'updatedAt'> }
  | { kind: 'pull'; id: string; patch: Partial<Task>; title: string }
  | { kind: 'category'; data: Omit<FinancialCategory, 'createdAt' | 'updatedAt'> }
  | { kind: 'bill'; id: string; bill: NonNullable<FinancialCategory['bill']>; name: string }

export interface BriefingPlan {
  date: DateKey
  source?: string
  ops: BriefingOp[]
  /** Already there, nothing to do. */
  kept: string[]
}

export function planBriefing(db: DB, blocks: BriefingBlock[]): BriefingPlan | undefined {
  if (!blocks.length) return undefined
  const ops: BriefingOp[] = []
  const kept: string[] = []
  const projects: Pick<Project, 'id' | 'name'>[] = [...db.projects]
  const africa = db.trips.find((t) => /africa/.test(normalize(t.name)))?.id
  let order = db.tasks.reduce((m, t) => Math.max(m, t.order), -1) + 1
  const planned: Omit<Task, 'createdAt' | 'updatedAt'>[] = []
  const categories: { id: string; name: string; bill?: FinancialCategory['bill'] }[] = [...db.financialCategories]
  let catOrder = db.financialCategories.reduce((m, c) => Math.max(m, c.order), -1) + 1

  const projectFor = (name?: string): string | undefined => {
    const found = findProject(projects, name)
    if (found) return found.id
    const k = key(name ?? '')
    if (!name || NOT_PROJECT.has(k)) return undefined
    const data: Omit<Project, 'createdAt' | 'updatedAt'> = { id: uid(), name: name.trim(), emoji: '📁', tone: 'ink', status: 'ativo', priority: 'media', links: [], files: [], people: [], decisions: [], changelog: [], kind: 'default', order: projects.length }
    projects.push(data)
    ops.push({ kind: 'project', data })
    return data.id
  }

  const addTask = (t: BriefingTask, block: BriefingBlock) => {
    const data = taskFromBriefing(t, block, { africaTripId: africa, order })
    const existing = db.tasks.find((x) => x.status !== 'archived' && (sameTitle(x.title, t.title) || sameTitle(x.title, data.title)))
    const twin = planned.find((x) => sameTitle(x.title, data.title))
    if (twin) return
    if (existing) {
      // From a daily briefing, an open task is pulled to that day (its own record, nothing duplicated).
      if (isDaily(block) && existing.status === 'todo' && data.date && existing.date !== data.date && !existing.recurrence) {
        ops.push({ kind: 'pull', id: existing.id, patch: { date: data.date, bucket: undefined }, title: existing.title })
      } else kept.push(existing.title)
      return
    }
    const full = { ...data, id: uid(), projectId: projectFor(t.project) }
    planned.push(full)
    ops.push({ kind: 'task', data: full })
    order++
  }

  const addBill = (raw: string) => {
    const { name, every } = billFromName(raw)
    if (!name) return
    const existing = categories.find((c) => key(c.name) === key(name))
    if (existing) {
      if (existing.bill) kept.push(name)
      else {
        existing.bill = { every }
        ops.push({ kind: 'bill', id: existing.id, bill: { every }, name: existing.name })
      }
      return
    }
    const data = categoryFromBill(raw, catOrder++)
    categories.push(data)
    ops.push({ kind: 'category', data })
  }

  for (const block of blocks) {
    for (const t of block.tasks) addTask(t, block)
    for (const w of block.backlog_watchlist ?? []) {
      const s = (w.status ?? '').toLowerCase()
      if (s === 'recurring') addBill(w.title)
      else addTask({ title: w.title, project: w.project, status: s === 'waiting' ? 'waiting' : 'todo', done_criteria: w.notes }, { ...block, source: `${block.source ?? 'Briefing'} · backlog` })
    }
    for (const c of block.recurring_financial_categories ?? []) addBill(c)
  }
  const last = blocks.at(-1)!
  return { date: last.date, source: last.source, ops, kept }
}

export function summarize(plan: BriefingPlan): { tasks: number; pulled: number; waiting: number; projects: number; bills: number; kept: number } {
  const tasks = plan.ops.filter((o): o is Extract<BriefingOp, { kind: 'task' }> => o.kind === 'task')
  return {
    tasks: tasks.filter((t) => t.data.status !== 'waiting').length,
    waiting: tasks.filter((t) => t.data.status === 'waiting').length,
    pulled: plan.ops.filter((o) => o.kind === 'pull').length,
    projects: plan.ops.filter((o) => o.kind === 'project').length,
    bills: plan.ops.filter((o) => o.kind === 'category' || o.kind === 'bill').length,
    kept: plan.kept.length,
  }
}
