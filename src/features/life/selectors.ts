/**
 * Life-admin + Luna + Vida hub selectors. Pure functions of (db, today) — use inside useMemo.
 * Nothing here knows Marina's data by name: categories, kinds and flexibility come from the records.
 */
import type {
  CalendarEvent,
  DateKey,
  DayPriority,
  DB,
  Expense,
  ID,
  LifeAdminCategory,
  ModuleId,
  Pet,
  PetTask,
  PetTaskCategory,
  Task,
  UserProfile,
} from '@/data/types'
import { SEED_IDS } from '@/data/seed/ids'
import { expensesBetween } from '@/data/selectors'
import { eventOccursOn, PERIOD_LABEL } from '@/data/planning'
import {
  addDays,
  diffDays,
  endOfMonth,
  endOfWeek,
  formatDayMonth,
  startOfMonth,
  startOfWeek,
  toDateKey,
  weekday,
} from '@/lib/date'
import { describeRecurrence, isDue, lastDoneDate, nextOccurrence, occurrenceFor, occursOn } from '@/lib/recurrence'

// ─── Generic ────────────────────────────────────────────────────────────────

export function isModuleVisible(profile: UserProfile, id: ModuleId): boolean {
  const m = profile.modules.find((x) => x.id === id)
  return m ? m.visible : true
}

const WD_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/** "hoje", "amanhã", or "sex, 10/10". */
export function nextDateLabel(date: DateKey, today: DateKey): string {
  const d = diffDays(today, date)
  if (d <= 0) return 'hoje'
  if (d === 1) return 'amanhã'
  return `${WD_SHORT[weekday(date)]}, ${formatDayMonth(date)}`
}

/** "feito hoje", "feito ontem", "feito há 5 dias", "feito em 02/08". */
export function lastDoneLabel(date: DateKey | undefined, today: DateKey): string | undefined {
  if (!date) return undefined
  const d = diffDays(date, today)
  if (d <= 0) return 'feito hoje'
  if (d === 1) return 'feito ontem'
  if (d < 45) return `feito há ${d} dias`
  return `feito em ${formatDayMonth(date)}`
}

// ─── Luna ───────────────────────────────────────────────────────────────────

export const PET_CATEGORIES: { value: PetTaskCategory; label: string; emoji: string }[] = [
  { value: 'alimentacao', label: 'Alimentação', emoji: '🥣' },
  { value: 'passeio', label: 'Passeio', emoji: '🦮' },
  { value: 'creche', label: 'Creche / hotel', emoji: '🏡' },
  { value: 'banho', label: 'Banho', emoji: '🛁' },
  { value: 'veterinario', label: 'Veterinário', emoji: '🩺' },
  { value: 'medicacao', label: 'Medicação', emoji: '💊' },
  { value: 'compras', label: 'Compras', emoji: '🛍️' },
  { value: 'lembrete', label: 'Lembretes', emoji: '📝' },
  { value: 'documento', label: 'Documentos', emoji: '📄' },
]

export function petCategoryMeta(c: PetTaskCategory) {
  return PET_CATEGORIES.find((x) => x.value === c) ?? PET_CATEGORIES[7]
}

export function lunaOf(db: DB): Pet | undefined {
  return db.pets.find((p) => p.id === SEED_IDS.petLuna) ?? db.pets[0]
}

export interface PetTaskState {
  task: PetTask
  doneToday: boolean
  /** "Fora da rotina" today (skipped occurrence) — never counts as missed. */
  skippedToday: boolean
  /** Shows on "Hoje" (due, or checked today). Skipped days are not due. */
  dueToday: boolean
  /** Daily/weekly routine (walks, food): gentle check, never nags. */
  flexible: boolean
  lastDone?: DateKey
  /** Next date it's expected (recurring: after today when done today). */
  next?: DateKey
  /** "a cada 15 dias · próximo: sex, 10/10" */
  detail: string
}

/** Daily / weekly pet routines are flexible: gentle checks, no "last done" pressure. */
export function isFlexiblePetTask(t: PetTask): boolean {
  return !!t.recurrence && (t.recurrence.kind === 'daily' || t.recurrence.kind === 'weekly')
}

function everyDay(t: PetTask): boolean {
  const r = t.recurrence
  return !!r && (r.kind === 'daily' || (r.kind === 'weekly' && r.weekdays.length === 7))
}

export function petTaskState(db: DB, task: PetTask, today: DateKey): PetTaskState {
  const lastDone = lastDoneDate(db.occurrences, 'petTask', task.id)
  const flexible = isFlexiblePetTask(task)
  if (task.recurrence) {
    const o = occurrenceFor(db.occurrences, 'petTask', task.id, today)
    const doneToday = o?.status === 'done'
    const skippedToday = o?.status === 'skipped'
    const dueToday = task.active && !skippedToday && (doneToday || isDue(task.recurrence, today, lastDone))
    const next = nextOccurrence(task.recurrence, doneToday || skippedToday ? addDays(today, 1) : today, lastDone)
    const parts: string[] = []
    if (skippedToday) parts.push('fora da rotina hoje')
    parts.push(describeRecurrence(task.recurrence))
    // Daily things: "próximo" is noise.
    if (!everyDay(task) && next) parts.push(`próximo: ${nextDateLabel(next, today)}`)
    return { task, doneToday, skippedToday, dueToday, flexible, lastDone, next, detail: parts.join(' · ') }
  }
  // One-offs without a date are slots/notes ("quando quiser"): never due.
  const dueToday = task.active && !!task.dueDate && task.dueDate <= today
  let detail: string
  if (!task.active) detail = 'feito ✓'
  else if (task.dueDate) detail = task.dueDate < today ? `ficou de ${formatDayMonth(task.dueDate)}` : nextDateLabel(task.dueDate, today)
  else detail = 'sem data — quando quiser'
  return { task, doneToday: false, skippedToday: false, dueToday, flexible, lastDone, next: task.dueDate, detail }
}

/** Pet tasks for "Hoje": due today or already checked today (so the list doesn't jump). */
export function lunaToday(db: DB, today: DateKey): PetTaskState[] {
  return db.petTasks
    .map((t) => petTaskState(db, t, today))
    .filter((s) => s.dueToday)
    .sort((a, b) => Number(a.flexible) - Number(b.flexible) || Number(a.doneToday) - Number(b.doneToday) || a.task.order - b.task.order)
}

/** Today split: flexible routines (gentle) vs. life-admin things that actually came due. */
export function lunaTodaySplit(db: DB, today: DateKey): { routines: PetTaskState[]; due: PetTaskState[] } {
  const all = lunaToday(db, today)
  return {
    routines: all.filter((s) => s.flexible).sort((a, b) => a.task.order - b.task.order),
    due: all.filter((s) => !s.flexible),
  }
}

/**
 * Things that ask for attention ("1 coisinha pra resolver").
 * Flexible routines never count — a walk not ticked yet is not a pending item.
 */
export function lunaPendingToday(db: DB, today: DateKey): number {
  return lunaToday(db, today).filter((s) => !s.flexible && !s.doneToday).length
}

/** Active flexible routines scheduled for `date` (regardless of done/skipped). */
export function flexibleRoutinesOn(db: DB, date: DateKey): PetTask[] {
  return db.petTasks
    .filter((t) => t.active && t.recurrence && isFlexiblePetTask(t) && occursOn(t.recurrence, date))
    .sort((a, b) => a.order - b.order)
}

/** True when the day's flexible routines that aren't done were marked "fora da rotina". */
export function isLunaOutOfRoutine(db: DB, date: DateKey): boolean {
  let skipped = 0
  for (const t of flexibleRoutinesOn(db, date)) {
    const o = occurrenceFor(db.occurrences, 'petTask', t.id, date)
    if (!o) return false
    if (o.status === 'skipped') skipped++
  }
  return skipped > 0
}

/**
 * What toggling "fora da rotina" changes: skipped occurrences to create (routines without any record
 * that day) or skipped occurrences to remove. Done checks are never touched.
 */
export function outOfRoutinePlan(db: DB, date: DateKey, on: boolean): { create: ID[]; remove: ID[] } {
  const create: ID[] = []
  const remove: ID[] = []
  for (const t of flexibleRoutinesOn(db, date)) {
    const o = occurrenceFor(db.occurrences, 'petTask', t.id, date)
    if (on && !o) create.push(t.id)
    if (!on && o?.status === 'skipped') remove.push(o.id)
  }
  return { create, remove }
}

/** Life-admin side of Luna: everything that isn't a flexible routine (slots, dated, interval rules). */
export function lunaAreas(db: DB, today: DateKey): PetTaskState[] {
  return db.petTasks
    .filter((t) => !isFlexiblePetTask(t))
    .map((t) => petTaskState(db, t, today))
    .sort(
      (a, b) =>
        Number(!a.task.active) - Number(!b.task.active) || Number(b.dueToday) - Number(a.dueToday) || a.task.order - b.task.order,
    )
}

/** Flexible routines (incl. paused) for the "Rotina" list. */
export function lunaRoutines(db: DB, today: DateKey): PetTaskState[] {
  return db.petTasks
    .filter(isFlexiblePetTask)
    .map((t) => petTaskState(db, t, today))
    .sort((a, b) => Number(!a.task.active) - Number(!b.task.active) || a.task.order - b.task.order)
}

export const LUNA_CATEGORY_ID = 'cat-luna'

export function lunaExpensesThisMonth(db: DB, today: DateKey): { list: Expense[]; total: number } {
  const list = expensesBetween(db, startOfMonth(today), endOfMonth(today)).filter((e) => e.categoryId === LUNA_CATEGORY_ID)
  return { list, total: list.reduce((s, e) => s + e.amountCents, 0) }
}

/** "3 anos e 2 meses", "8 meses", "2 semanas". */
export function petAge(birthDate: DateKey | undefined, today: DateKey): string | undefined {
  if (!birthDate || birthDate > today) return undefined
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let months = (ty - by) * 12 + (tm - bm)
  if (td < bd) months -= 1
  if (months < 1) {
    const w = Math.max(1, Math.floor(diffDays(birthDate, today) / 7))
    return `${w} ${w === 1 ? 'semana' : 'semanas'}`
  }
  const y = Math.floor(months / 12)
  const m = months % 12
  const ys = y ? `${y} ${y === 1 ? 'ano' : 'anos'}` : ''
  const ms = m ? `${m} ${m === 1 ? 'mês' : 'meses'}` : ''
  return [ys, ms].filter(Boolean).join(' e ')
}

// ─── Vida real ──────────────────────────────────────────────────────────────

/** The categories Marina sees. Anything else (legacy / created elsewhere) lands in "Outros". */
export const LIFE_CATEGORIES: { value: LifeAdminCategory; label: string; emoji: string; hint: string }[] = [
  { value: 'casa', label: 'Casa', emoji: '🏠', hint: 'consertos, compras, contas da casa' },
  { value: 'carro', label: 'Carro', emoji: '🚗', hint: 'revisão, seguro, documentos' },
  { value: 'bike', label: 'Bike', emoji: '🚲', hint: 'revisão, peças, acessórios' },
  { value: 'surf', label: 'Surf', emoji: '🏄', hint: 'prancha, parafina, roupa' },
  { value: 'running', label: 'Running', emoji: '🏃', hint: 'tênis, provas, acessórios' },
  { value: 'luna', label: 'Luna', emoji: '🐾', hint: 'o que não é rotina dela' },
  { value: 'viagens', label: 'Viagens', emoji: '✈️', hint: 'coisas práticas entre viagens' },
  { value: 'documentos', label: 'Documentos', emoji: '📑', hint: 'RG, passaporte, papéis' },
]

export const OTHER_CATEGORY = { value: 'outros' as LifeAdminCategory, label: 'Outros', emoji: '✨', hint: 'o resto da vida prática' }

const MAIN = new Set(LIFE_CATEGORIES.map((c) => c.value))

/** Main category for display/filter; legacy values collapse into 'outros'. */
export function lifeCategoryOf(t: Pick<Task, 'lifeAdminCategory'>): LifeAdminCategory {
  const c = t.lifeAdminCategory
  return c && MAIN.has(c) ? c : 'outros'
}

export function lifeCategoryMeta(c: LifeAdminCategory | undefined) {
  return LIFE_CATEGORIES.find((x) => x.value === c) ?? OTHER_CATEGORY
}

export type AdminKind = 'manutencao' | 'comprar' | 'resolver' | 'waiting'

export const ADMIN_KINDS: { value: AdminKind; label: string; add: string; emoji: string }[] = [
  { value: 'manutencao', label: 'Manutenção', add: 'manutenção', emoji: '🔧' },
  { value: 'comprar', label: 'Comprar', add: 'comprar', emoji: '🛒' },
  { value: 'resolver', label: 'Resolver', add: 'resolver', emoji: '✅' },
  { value: 'waiting', label: 'Esperando', add: 'esperando', emoji: '⏳' },
]

/** manutenção / comprar / resolver / waiting. Waiting = status; untyped items are "resolver". */
export function adminKindOf(t: Task): AdminKind {
  if (t.status === 'waiting') return 'waiting'
  if (t.adminKind) return t.adminKind
  if (t.lifeAdminCategory === 'manutencao') return 'manutencao'
  if (t.lifeAdminCategory === 'compras') return 'comprar'
  return 'resolver'
}

export function adminKindMeta(k: AdminKind) {
  return ADMIN_KINDS.find((x) => x.value === k)!
}

/** Task defaults for a quick add in a category/kind. */
export function lifeTaskDefaults(category: LifeAdminCategory | undefined, kind: AdminKind | undefined, today: DateKey): Partial<Task> {
  const d: Partial<Task> = { context: 'vida_real', lifeAdminCategory: category ?? 'outros', bucket: 'semana' }
  if (kind === 'waiting') {
    d.status = 'waiting'
    d.waiting = { who: '', since: today }
  } else if (kind) d.adminKind = kind
  return d
}

export type LifeGroup = 'hoje' | 'semana' | 'review' | 'waiting' | 'algum_dia'

export const LIFE_GROUPS: { id: LifeGroup; title: string; hint?: string }[] = [
  { id: 'hoje', title: 'Hoje' },
  { id: 'semana', title: 'Esta semana' },
  { id: 'review', title: 'Revisar / confirmar', hint: 'ainda não sei se precisa — dá uma olhada quando der' },
  { id: 'waiting', title: 'Esperando alguém', hint: 'a bola está com outra pessoa' },
  { id: 'algum_dia', title: 'Quando der' },
]

export interface LifeItem {
  task: Task
  group: LifeGroup
  kind: AdminKind
  /** Recurring: next expected date. */
  next?: DateKey
  doneToday: boolean
  /** One-line context under the title (without the category). */
  detail: string
}

function lifeItem(db: DB, t: Task, today: DateKey): LifeItem | undefined {
  if (t.status === 'archived') return undefined
  const kind = adminKindOf(t)
  const weekEnd = endOfWeek(today)
  if (t.recurrence) {
    const lastDone = lastDoneDate(db.occurrences, 'task', t.id)
    const doneToday = occurrenceFor(db.occurrences, 'task', t.id, today)?.status === 'done'
    const next = nextOccurrence(t.recurrence, doneToday ? addDays(today, 1) : today, lastDone)
    const due = !doneToday && isDue(t.recurrence, today, lastDone)
    let group: LifeGroup = due || doneToday ? 'hoje' : next && next <= weekEnd ? 'semana' : 'algum_dia'
    if (t.status === 'waiting') group = 'waiting'
    if (t.status === 'review') group = 'review'
    const detail = [describeRecurrence(t.recurrence), next ? `próximo: ${nextDateLabel(next, today)}` : undefined]
      .filter(Boolean)
      .join(' · ')
    return { task: t, group, kind, next, doneToday, detail }
  }
  if (t.status === 'done') {
    // Keep things checked today visible (struck through) so the list doesn't jump.
    if (t.completedAt && toDateKey(new Date(t.completedAt)) === today) {
      return { task: t, group: 'hoje', kind, doneToday: true, detail: 'feito ✓' }
    }
    return undefined
  }
  const when = t.date ?? t.dueDate
  let group: LifeGroup
  if (t.status === 'waiting') group = 'waiting'
  else if (t.status === 'review') group = 'review'
  else if ((when && when <= today) || t.bucket === 'hoje') group = 'hoje'
  else if ((when && when <= weekEnd) || t.bucket === 'semana') group = 'semana'
  else group = 'algum_dia'
  const parts: string[] = []
  if (t.status === 'waiting' && t.waiting?.who) parts.push(`com ${t.waiting.who}`)
  if (when) parts.push(when < today ? 'ficou de antes' : nextDateLabel(when, today))
  return { task: t, group, kind, doneToday: false, detail: parts.join(' · ') }
}

export interface LifeFilter {
  category?: LifeAdminCategory
  kind?: AdminKind
}

export function lifeAdminItems(db: DB, today: DateKey, filter: LifeFilter = {}): LifeItem[] {
  return db.tasks
    .filter((t) => t.context === 'vida_real')
    .filter((t) => !filter.category || lifeCategoryOf(t) === filter.category)
    .map((t) => lifeItem(db, t, today))
    .filter((x): x is LifeItem => !!x)
    .filter((x) => !filter.kind || x.kind === filter.kind)
    .sort(
      (a, b) =>
        Number(a.doneToday) - Number(b.doneToday) ||
        (a.next ?? '9999').localeCompare(b.next ?? '9999') ||
        a.task.order - b.task.order,
    )
}

export function groupLifeAdmin(db: DB, today: DateKey, filter: LifeFilter = {}): Record<LifeGroup, LifeItem[]> {
  const out: Record<LifeGroup, LifeItem[]> = { hoje: [], semana: [], review: [], waiting: [], algum_dia: [] }
  for (const it of lifeAdminItems(db, today, filter)) out[it.group].push(it)
  return out
}

/** Open counts per main category ('outros' included) for the grid. */
export function lifeCategoryCounts(db: DB, today: DateKey): Partial<Record<LifeAdminCategory, number>> {
  const out: Partial<Record<LifeAdminCategory, number>> = {}
  for (const it of lifeAdminItems(db, today)) {
    if (it.doneToday) continue
    const c = lifeCategoryOf(it.task)
    out[c] = (out[c] ?? 0) + 1
  }
  return out
}

/** Open counts per kind inside a category (for the sub-filter chips). */
export function lifeKindCounts(db: DB, today: DateKey, category?: LifeAdminCategory): Record<AdminKind, number> {
  const out: Record<AdminKind, number> = { manutencao: 0, comprar: 0, resolver: 0, waiting: 0 }
  for (const it of lifeAdminItems(db, today, { category })) if (!it.doneToday) out[it.kind]++
  return out
}

/** Hub counts: open today / this week (week includes today). */
export function lifeAdminCounts(db: DB, today: DateKey): { hoje: number; semana: number; review: number; waiting: number } {
  const g = groupLifeAdmin(db, today)
  const hoje = g.hoje.filter((i) => !i.doneToday).length
  return { hoje, semana: hoje + g.semana.length, review: g.review.length, waiting: g.waiting.length }
}

// ─── Hub ────────────────────────────────────────────────────────────────────

export function weekGoalsSummary(db: DB, today: DateKey) {
  const week = startOfWeek(today)
  const goals = db.goals
    .filter((g) => g.level === 'semana' && g.period === week && g.status !== 'solta')
    .sort((a, b) => Number(b.big) - Number(a.big) || a.order - b.order)
  return { goals, done: goals.filter((g) => g.status === 'feita').length, total: goals.length }
}

/** "2 de 4 feitas", "nenhuma ainda — que tal escolher 1?", "todas feitas! ✨" */
export function weekGoalsLabel(done: number, total: number): string {
  if (total === 0) return 'nenhuma meta ainda — que tal escolher uma?'
  if (done === total) return total === 1 ? 'feita! ✨' : `todas as ${total} feitas! ✨`
  if (done === 0) return total === 1 ? '1 meta pra essa semana' : `${total} metas pra essa semana`
  return `${done} de ${total} feitas`
}

/** Friday, Saturday or Sunday. */
export function isReviewTime(today: DateKey): boolean {
  const wd = weekday(today)
  return wd === 5 || wd === 6 || wd === 0
}

export function isWeekend(today: DateKey): boolean {
  const wd = weekday(today)
  return wd === 6 || wd === 0
}

/** "Montar minha semana" is the main move on Sunday and Monday. */
export function isPlanningDay(today: DateKey): boolean {
  const wd = weekday(today)
  return wd === 0 || wd === 1
}

/** Week being planned: on Sunday it's the coming week; otherwise the current one. */
export function planningWeekStart(today: DateKey): DateKey {
  return weekday(today) === 0 ? addDays(today, 1) : startOfWeek(today)
}

export function weekPlanConfirmed(db: DB, today: DateKey): boolean {
  const ws = planningWeekStart(today)
  return db.weekPlans.some((w) => w.weekStart === ws && !!w.confirmedAt)
}

export type HubBlock = 'capture' | 'weekend' | 'plan' | 'top3' | 'creative' | 'week' | 'self' | 'home' | 'world' | 'month'

/**
 * Hub order. Weekdays: capture → plan → Top 3 → week → creativity → care → home → world.
 * Weekend mode (§44): lead with activity/fun, travel and the weekly review; chores come last.
 */
export function hubOrder(today: DateKey): HubBlock[] {
  if (isWeekend(today)) {
    return ['capture', 'weekend', 'week', 'plan', 'world', 'top3', 'creative', 'self', 'home', 'month']
  }
  if (isPlanningDay(today)) return ['capture', 'plan', 'top3', 'week', 'creative', 'self', 'home', 'world', 'month']
  return ['capture', 'top3', 'creative', 'week', 'plan', 'self', 'home', 'world', 'month']
}

/** Top 3 Vida: domain 'vida' priorities of the day (max 3). */
export function vidaPriorities(db: DB, today: DateKey): DayPriority[] {
  return db.priorities
    .filter((p) => p.date === today && p.domain === 'vida')
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
}

export function isCreativeEvent(e: CalendarEvent): boolean {
  return e.kind === 'criatividade' || /criatividade/i.test(e.category ?? '')
}

export interface CreativeSlot {
  event: CalendarEvent
  date: DateKey
  /** "seg, 05/10 · noite" / "hoje · 19:00" */
  when: string
  /** Cancelled for this week only (exdate). */
  cancelled: boolean
  recurring: boolean
}

/** Creative events in the next 7 days (today included), with week-only cancellations kept visible. */
export function creativeThisWeek(db: DB, today: DateKey): CreativeSlot[] {
  const enabled = new Set(db.calendarSources.filter((s) => s.enabled).map((s) => s.id))
  const events = db.events.filter((e) => isCreativeEvent(e) && (!db.calendarSources.length || enabled.has(e.sourceId)))
  const out: CreativeSlot[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i)
    for (const e of events) {
      const cancelled = !!e.exdates?.includes(date)
      const occurs = cancelled ? eventOccursOn({ ...e, exdates: undefined }, date) : eventOccursOn(e, date)
      if (!occurs) continue
      const time = e.startTime ?? (e.period ? PERIOD_LABEL[e.period] : e.allDay ? 'dia todo' : undefined)
      out.push({
        event: e,
        date,
        when: [nextDateLabel(date, today), time].filter(Boolean).join(' · '),
        cancelled,
        recurring: !!e.recurrence,
      })
    }
  }
  return out
}
