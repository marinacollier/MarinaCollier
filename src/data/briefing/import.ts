/**
 * Daily Executive Briefing → Marina OS. The briefing (written outside the app) ends with a JSON block
 * ("BLOCO PARA MARINA OS APP"). This module reads it and PLANS what to write — pure, nothing written here.
 *
 * Each thing keeps its nature (her life is not flattened into a to-do list):
 *   tasks                         → real to-dos of the briefing's day (no due date ≠ "no day")
 *   backlog_watchlist · scheduled → a BacklogItem (future intention, with a window when the notes give one)
 *   backlog_watchlist · waiting   → Waiting For (the existing waiting task when there is one)
 *   backlog_watchlist · recurring → recognised against what already exists (payments…); never re-created
 *
 * Rules:
 * - deterministic sourceKeys: the same JSON imported 10 times writes once;
 * - her state wins: anything already imported (done, moved, edited, resolved, deleted) is left as she left it;
 * - "equivalent" means same front + the same action words — "Consolidar pendências JNB" (today) and
 *   "Hospedagem e safari JNB" (later) are related, not the same;
 * - nothing invented: no time, no amount, no date that the payload/notes don't say.
 */
import type { BacklogItem, DateKey, DB, FinancialCategory, ImportOrigin, Priority, Project, Task, Tone } from '../types'
import { categoryId } from '../defaults'
import { addDays, formatDayMonth, isDateKey, startOfWeek, weekday, WEEKDAY_SHORT } from '@/lib/date'
import { uid } from '@/lib/id'
import { normalize } from '@/lib/text'

export interface BriefingTask {
  title: string
  doneCriteria?: string
  estimatedMinutes?: number
  dueDate?: string | null
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
  /** Entries that could not be read (no title…) — shown as "precisa de revisão", never dropped silently. */
  invalid?: { title: string; reason: string }[]
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
  return /"tasks"\s*:\s*\[/.test(text) || /"(?:recurring_financial_categories|recurringFinancialCategories|backlog_watchlist|backlogWatchlist)"\s*:/.test(text)
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

/** snake_case or camelCase at the border → one internal shape. */
function normalizeTask(v: Record<string, unknown>): BriefingTask {
  const due = v.due_date ?? v.dueDate
  const mins = v.estimated_minutes ?? v.estimatedMinutes
  return {
    title: (str(v.title) ?? '').trim(),
    category: str(v.category),
    project: str(v.project),
    priority: str(v.priority),
    done_criteria: str(v.done_criteria) ?? str(v.doneCriteria),
    estimated_minutes: typeof mins === 'number' ? mins : typeof mins === 'string' && /^\d+$/.test(mins) ? Number(mins) : undefined,
    status: str(v.status),
    due_date: due === null ? null : str(due),
  }
}

function asBlock(v: unknown): BriefingBlock | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const invalid: { title: string; reason: string }[] = []
  const tasks: BriefingTask[] = []
  for (const raw of Array.isArray(o.tasks) ? o.tasks : []) {
    if (!raw || typeof raw !== 'object') continue
    const t = normalizeTask(raw as Record<string, unknown>)
    if (!t.title) invalid.push({ title: t.done_criteria ?? t.project ?? 'tarefa sem título', reason: 'sem título' })
    else tasks.push(t)
  }
  const rawWatch = o.backlog_watchlist ?? o.backlogWatchlist
  const watch: BriefingWatch[] = []
  for (const raw of Array.isArray(rawWatch) ? rawWatch : []) {
    if (!raw || typeof raw !== 'object') continue
    const w = raw as Record<string, unknown>
    const title = (str(w.title) ?? '').trim()
    if (!title) invalid.push({ title: str(w.notes) ?? str(w.project) ?? 'item sem título', reason: 'sem título' })
    else watch.push({ title, project: str(w.project), status: str(w.status), notes: str(w.notes) })
  }
  const rawCats = o.recurring_financial_categories ?? o.recurringFinancialCategories
  const cats = Array.isArray(rawCats) ? rawCats.filter((c): c is string => typeof c === 'string' && !!c.trim()) : undefined
  if (!tasks.length && !watch.length && !cats?.length && !invalid.length) return undefined
  if (!isDateKey(o.date)) return undefined
  return { date: o.date, source: str(o.source), tasks, backlog_watchlist: watch.length ? watch : undefined, recurring_financial_categories: cats, invalid: invalid.length ? invalid : undefined }
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
  if (/produto|ia|operacao|trabalho|tech|tecnologia|estrategia/.test(c) || t.project) return { context: 'trabalho', area: 'profissional' }
  // Unknown category and no front: a neutral to-do (never fails the import).
  return { context: 'geral' }
}

/** "Aguardar retorno do Vitor" → Vitor. */
export function whoOf(title: string, fallback?: string): string | undefined {
  const m = /(?:[Rr]etorno|[Rr]esposta|[Ff]eedback|[Pp]osi[cç][aã]o)\s+d[aoe]s?\s+(\p{Lu}[\p{L}]+)/u.exec(title) ?? /[Aa]guardar\s+(?:o\s+|a\s+)?(\p{Lu}[\p{L}]+)/u.exec(title)
  return m?.[1] ?? fallback
}

const isDaily = (b: BriefingBlock) => /daily|briefing/i.test(b.source ?? '') && !/backlog/i.test(b.source ?? '')

export interface TaskContext {
  /** Trip id for "África do Sul". */
  africaTripId?: string
  order: number
}

/** One briefing task → the task's data (no id/stamps). Pure. */
export function taskFromBriefing(t: BriefingTask, block: BriefingBlock, ctx: TaskContext, projectId?: string, origin?: ImportOrigin): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  const due = t.due_date && isDateKey(t.due_date) ? t.due_date : undefined
  // (an invalid due date is simply absent — never guessed; the plan flags it for review)
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
    doneCriteria: t.done_criteria?.trim() || undefined,
    tags: optional ? ['optional'] : undefined,
    source: origin,
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

// ─── Time windows from the notes ("Semana de 12 a 16/10", "a partir de 13/10", "próxima semana") ──────

const wd = (d: DateKey) => WEEKDAY_SHORT[weekday(d)].toLowerCase()
const dm = (d: DateKey) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`

/** dd/mm in the briefing's year (a month far behind means next year). Undefined when not a real date. */
function dayMonth(day: string, month: string, ref: DateKey): DateKey | undefined {
  const m = Number(month)
  const y = Number(ref.slice(0, 4)) + (m < Number(ref.slice(5, 7)) - 6 ? 1 : 0)
  const k = `${y}-${String(m).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`
  return isDateKey(k) && !Number.isNaN(Date.parse(`${k}T12:00:00Z`)) && new Date(`${k}T12:00:00Z`).getUTCDate() === Number(day) ? k : undefined
}

/** Only what can be read safely; otherwise undefined (kept as backlog without a date). */
export function windowOf(text: string | undefined, ref: DateKey): BacklogItem['window'] | undefined {
  if (!text) return undefined
  const n = normalize(text)
  let m = /(\d{1,2})\s*(?:a|ate|-|–)\s*(\d{1,2})\/(\d{1,2})/.exec(n)
  if (m) {
    const from = dayMonth(m[1], m[3], ref)
    const until = dayMonth(m[2], m[3], ref)
    if (from && until && from <= until) return { from, until, label: `${wd(from)} ${Number(m[1])} – ${wd(until)} ${dm(until)}` }
  }
  m = /(\d{1,2})\/(\d{1,2})\s*(?:a|ate|-|–)\s*(\d{1,2})\/(\d{1,2})/.exec(n)
  if (m) {
    const from = dayMonth(m[1], m[2], ref)
    const until = dayMonth(m[3], m[4], ref)
    if (from && until && from <= until) return { from, until, label: `${wd(from)} ${dm(from)} – ${wd(until)} ${dm(until)}` }
  }
  m = /a partir de\s+(?:\w+\s+)?(\d{1,2})\/(\d{1,2})/.exec(n)
  if (m) {
    const from = dayMonth(m[1], m[2], ref)
    if (from) return { from, label: `a partir de ${wd(from)} ${dm(from)}` }
  }
  m = /\bate\s+(?:\w+\s+)?(\d{1,2})\/(\d{1,2})/.exec(n)
  if (m) {
    const until = dayMonth(m[1], m[2], ref)
    if (until) return { until, label: `até ${wd(until)} ${dm(until)}` }
  }
  if (/\b(?:proxima semana|semana que vem)\b/.test(n)) {
    const from = addDays(startOfWeek(ref), 7)
    const until = addDays(from, 6)
    return { from, until, label: `semana que vem · ${Number(from.slice(8))}–${dm(until)}` }
  }
  return undefined
}

// ─── The plan ───────────────────────────────────────────────────────────────

export const slug = (s: string) =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'com', 'para', 'pra', 'pro', 'os', 'as', 'no', 'na', 'em', 'um', 'uma', 'o', 'a'])
const words = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w))
const hasWord = (list: string[], w: string) => list.some((x) => x === w || (x.length >= 5 && w.length >= 5 && (x.startsWith(w) || w.startsWith(x))))

export type BriefingOp =
  | { kind: 'project'; data: Omit<Project, 'createdAt' | 'updatedAt'> }
  | { kind: 'task'; data: Omit<Task, 'createdAt' | 'updatedAt'> }
  | { kind: 'pull'; id: string; patch: Partial<Task>; title: string }
  | { kind: 'backlog'; data: Omit<BacklogItem, 'createdAt' | 'updatedAt'> }
  | { kind: 'seen'; id: string; patch: Partial<BacklogItem>; title: string }
  | { kind: 'category'; data: Omit<FinancialCategory, 'createdAt' | 'updatedAt'> }
  | { kind: 'bill'; id: string; bill: NonNullable<FinancialCategory['bill']>; name: string }

export type PlanKind = 'today' | 'future' | 'waiting' | 'recurring'

/** How one briefing item was understood — what the preview shows and the batch remembers. */
export interface PlanEntry {
  kind: PlanKind
  title: string
  /** Quiet second line: front · window · "já estava" … */
  sub?: string
  how: 'created' | 'linked' | 'kept' | 'ignored'
  ref?: { collection: 'tasks' | 'backlogItems'; id: string }
}

export interface BriefingPlan {
  date: DateKey
  source?: string
  batchId: string
  ops: BriefingOp[]
  entries: PlanEntry[]
  review: { title: string; reason: string }[]
  /** Already there, nothing to do (titles). */
  kept: string[]
  sourceKeys: string[]
}

export function planBriefing(db: DB, blocks: BriefingBlock[], batchId: string = uid()): BriefingPlan | undefined {
  if (!blocks.length) return undefined
  const ops: BriefingOp[] = []
  const entries: PlanEntry[] = []
  const review: { title: string; reason: string }[] = []
  const kept: string[] = []
  const sourceKeys: string[] = []
  const projects: Pick<Project, 'id' | 'name'>[] = [...db.projects]
  const africa = db.trips.find((t) => /africa/.test(normalize(t.name)))?.id
  let order = db.tasks.reduce((m, t) => Math.max(m, t.order), -1) + 1
  const planned: Omit<Task, 'createdAt' | 'updatedAt'>[] = []
  const plannedBacklog: Omit<BacklogItem, 'createdAt' | 'updatedAt'>[] = []
  const categories: { id: string; name: string; bill?: FinancialCategory['bill'] }[] = [...db.financialCategories]
  let catOrder = db.financialCategories.reduce((m, c) => Math.max(m, c.order), -1) + 1
  // Keys of earlier imports (not undone): an item she deleted after importing never comes back.
  const imported = new Set(db.importBatches.filter((b) => !b.undoneAt).flatMap((b) => b.sourceKeys))
  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name

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
  const origin = (block: BriefingBlock, sourceKey: string): ImportOrigin => {
    sourceKeys.push(sourceKey)
    return { type: 'daily_briefing', label: block.source ?? 'Daily Executive Briefing', briefingDate: block.date, sourceKey, importBatchId: batchId }
  }
  const frontOf = (t: Pick<Task, 'projectId' | 'tripId' | 'context'>, raw?: string) => projectName(t.projectId) ?? raw

  // ── tasks → to-dos of the day ────────────────────────────────────────────
  const addTask = (t: BriefingTask, block: BriefingBlock) => {
    if (t.priority && !priorityOf(t.priority)) review.push({ title: t.title, reason: `prioridade “${t.priority}” não reconhecida — importada sem prioridade` })
    if (t.due_date && !isDateKey(t.due_date)) review.push({ title: t.title, reason: `data “${t.due_date}” inválida — importada sem prazo` })
    const sourceKey = `daily-briefing-${block.date}-${slug(t.project || t.category || 'geral')}-${slug(t.title)}`
    const mine = db.tasks.find((x) => x.source?.sourceKey === sourceKey)
    if (mine) {
      // Already imported: whatever she did with it (done, moved, edited) stays.
      kept.push(mine.title)
      entries.push({ kind: 'today', title: mine.title, sub: 'já estava no app', how: 'kept', ref: { collection: 'tasks', id: mine.id } })
      return
    }
    if (imported.has(sourceKey)) {
      entries.push({ kind: 'today', title: t.title, sub: 'você tirou do app — não volta', how: 'ignored' })
      return
    }
    const data = taskFromBriefing(t, block, { africaTripId: africa, order })
    if (planned.some((x) => sameTitle(x.title, data.title))) return
    const existing = db.tasks.find((x) => x.status !== 'archived' && (sameTitle(x.title, t.title) || sameTitle(x.title, data.title)))
    if (existing) {
      // The same to-do already exists (her backlog): one record. An open one with no day comes to the
      // briefing's day; one she already placed, finished or edited is left exactly as it is.
      if (isDaily(block) && existing.status === 'todo' && !existing.date && data.date && !existing.recurrence) {
        ops.push({ kind: 'pull', id: existing.id, patch: { date: data.date, bucket: undefined, source: existing.source ?? origin(block, sourceKey) }, title: existing.title })
        entries.push({ kind: 'today', title: existing.title, sub: 'já estava no backlog · vem pra hoje', how: 'linked', ref: { collection: 'tasks', id: existing.id } })
      } else {
        kept.push(existing.title)
        entries.push({ kind: 'today', title: existing.title, sub: existing.status === 'done' ? 'já feita ✓' : 'já estava no app', how: 'kept', ref: { collection: 'tasks', id: existing.id } })
      }
      return
    }
    const projectId = projectFor(t.project)
    const full = { ...data, id: uid(), projectId, source: origin(block, sourceKey) }
    planned.push(full)
    ops.push({ kind: 'task', data: full })
    entries.push({ kind: data.status === 'waiting' ? 'waiting' : 'today', title: full.title, sub: [frontOf(full, t.project), full.durationMin ? `${full.durationMin} min` : undefined, full.tags?.includes('optional') ? 'opcional' : undefined].filter(Boolean).join(' · ') || undefined, how: 'created', ref: { collection: 'tasks', id: full.id } })
    order++
  }

  // ── watchlist · waiting → Waiting For ────────────────────────────────────
  const addWaiting = (w: BriefingWatch, block: BriefingBlock) => {
    const who = whoOf(w.title, undefined)
    const sourceKey = `waiting-${slug(who ?? w.title)}-${slug(w.project ?? '')}`
    const projectId = findProject(projects, w.project)?.id
    const same = db.tasks.find(
      (t) => t.waiting && t.status !== 'archived' && (t.source?.sourceKey === sourceKey || (!!who && key(t.waiting.who) === key(who) && (!projectId || !t.projectId || t.projectId === projectId))),
    )
    const label = [who, w.project].filter(Boolean).join(' · ')
    if (same) {
      // Resolved stays resolved; still waiting stays linked — never a second line.
      entries.push({ kind: 'waiting', title: label || w.title, sub: same.status === 'done' ? 'já respondeu ✓' : 'já estava em Esperando', how: same.status === 'done' ? 'kept' : 'linked', ref: { collection: 'tasks', id: same.id } })
      return
    }
    if (imported.has(sourceKey)) {
      entries.push({ kind: 'waiting', title: label || w.title, sub: 'você tirou do app — não volta', how: 'ignored' })
      return
    }
    if (!who) review.push({ title: w.title, reason: 'não deu pra saber de quem é o retorno — ficou em Esperando como “alguém”' })
    const data: Omit<Task, 'createdAt' | 'updatedAt'> = {
      id: uid(),
      title: w.title,
      status: 'waiting',
      waiting: { who: who ?? 'alguém', since: block.date },
      projectId: projectId ?? projectFor(w.project),
      context: 'trabalho',
      notes: w.notes,
      order: order++,
      source: origin(block, sourceKey),
    }
    ops.push({ kind: 'task', data })
    entries.push({ kind: 'waiting', title: label || w.title, sub: 'novo em Esperando', how: 'created', ref: { collection: 'tasks', id: data.id } })
  }

  // ── watchlist · scheduled / recurring → BacklogItem (not a task) ─────────
  const addWatch = (w: BriefingWatch, block: BriefingBlock, kind: BacklogItem['kind']) => {
    const sourceKey = `watch-${slug(w.project ?? '')}-${slug(w.title)}`
    const projectId = findProject(projects, w.project)?.id
    const tripId = key(w.project ?? '') === 'africadosul' ? africa : undefined
    const ctx = contextOf({ title: w.title, project: w.project })
    const window = kind === 'scheduled' ? windowOf(w.notes, block.date) : undefined
    const recognized =
      kind === 'recurring' && /pagamento|despesa|conta|fatura|boleto|gasto/.test(normalize(`${w.title} ${w.notes ?? ''}`))
        ? (() => {
            const n = db.financialCategories.filter((c) => c.bill && !c.archived).length
            return n ? `Pagamentos do mês (${n})` : undefined
          })()
        : undefined
    const existing = db.backlogItems.find((b) => b.source.sourceKey === sourceKey) ?? plannedBacklog.find((b) => b.source.sourceKey === sourceKey)
    const sub = kind === 'recurring' ? (recognized ? `reconhecida: ${recognized}` : 'não encontrei essa recorrência') : (window?.label ?? 'sem data')
    if (existing) {
      // Her state wins: only "seen again" (and a window it didn't have) is updated.
      const patch: Partial<BacklogItem> = { lastSeenBriefing: block.date }
      if (!existing.window && window) patch.window = window
      if (existing.lastSeenBriefing !== block.date || patch.window) ops.push({ kind: 'seen', id: existing.id, patch, title: existing.title })
      entries.push({ kind: kind === 'recurring' ? 'recurring' : 'future', title: existing.title, sub: existing.status === 'open' ? sub : existing.status === 'done' ? 'já resolvido ✓' : existing.status === 'promoted' ? 'já virou tarefa' : 'você tirou da lista', how: 'kept', ref: { collection: 'backlogItems', id: existing.id } })
      return
    }
    if (imported.has(sourceKey)) {
      entries.push({ kind: kind === 'recurring' ? 'recurring' : 'future', title: w.title, sub: 'você tirou do app — não volta', how: 'ignored' })
      return
    }
    // An existing to-do that is the same action (same front, all its words) already carries it.
    const ww = words(w.title)
    const equivalent =
      kind === 'scheduled' && ww.length
        ? [...db.tasks, ...planned].find(
            (t) =>
              t.status !== 'archived' &&
              !t.recurrence &&
              (projectId ? t.projectId === projectId : tripId ? t.tripId === tripId : t.context === ctx.context) &&
              ww.every((x) => hasWord(words(t.title), x)),
          )
        : undefined
    if (kind === 'recurring' && !recognized) review.push({ title: w.title, reason: 'recorrência que ainda não existe no app — crio quando você me disser valor, dia e frequência' })
    const data: Omit<BacklogItem, 'createdAt' | 'updatedAt'> = {
      id: uid(),
      title: w.title,
      kind,
      status: equivalent ? 'promoted' : 'open',
      front: w.project,
      projectId,
      tripId,
      context: ctx.context,
      notes: w.notes,
      window,
      promotedTaskId: equivalent?.id,
      recognizedAs: recognized,
      source: origin(block, sourceKey),
      lastSeenBriefing: block.date,
    }
    plannedBacklog.push(data)
    ops.push({ kind: 'backlog', data })
    entries.push({
      kind: kind === 'recurring' ? 'recurring' : 'future',
      title: w.title,
      sub: equivalent ? `já é a tarefa “${equivalent.title}”${window ? ` · ${window.label}` : ''}` : sub,
      how: equivalent ? 'linked' : 'created',
      ref: { collection: 'backlogItems', id: data.id },
    })
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
    for (const t of block.tasks) {
      if ((t.status ?? '').toLowerCase() === 'waiting') addWaiting({ title: t.title, project: t.project, notes: t.done_criteria }, block)
      else addTask(t, block)
    }
    for (const w of block.backlog_watchlist ?? []) {
      const s = (w.status ?? '').toLowerCase()
      if (s === 'waiting') addWaiting(w, block)
      else if (s === 'recurring') addWatch(w, block, 'recurring')
      else {
        if (s && s !== 'scheduled') review.push({ title: w.title, reason: `status “${w.status}” desconhecido — guardei como item futuro` })
        addWatch(w, block, 'scheduled')
      }
    }
    for (const c of block.recurring_financial_categories ?? []) addBill(c)
    for (const bad of block.invalid ?? []) review.push(bad)
  }
  const last = blocks.at(-1)!
  return { date: last.date, source: last.source, batchId, ops, entries, review, kept, sourceKeys }
}

export function summarize(plan: BriefingPlan) {
  const of = (k: PlanKind) => plan.entries.filter((e) => e.kind === k)
  const tasks = plan.ops.filter((o): o is Extract<BriefingOp, { kind: 'task' }> => o.kind === 'task')
  return {
    today: of('today').length,
    future: of('future').length,
    waiting: of('waiting').length,
    recurring: of('recurring').filter((e) => /reconhecida/.test(e.sub ?? '') || e.how === 'kept').length,
    created: tasks.filter((t) => t.data.status !== 'waiting').length,
    pulled: plan.ops.filter((o) => o.kind === 'pull').length,
    backlog: plan.ops.filter((o) => o.kind === 'backlog' || o.kind === 'seen').length,
    waitingLinked: of('waiting').filter((e) => e.how !== 'ignored').length,
    projects: plan.ops.filter((o) => o.kind === 'project').length,
    bills: plan.ops.filter((o) => o.kind === 'category' || o.kind === 'bill').length,
    kept: plan.kept.length,
    review: plan.review.length,
  }
}
