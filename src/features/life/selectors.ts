/**
 * Life-admin + Luna selectors. Pure functions of (db, today) — use inside useMemo.
 */
import type {
  DateKey,
  DB,
  Expense,
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
import { describeRecurrence, isDue, lastDoneDate, nextOccurrence, occurrenceFor } from '@/lib/recurrence'

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
  /** Shows on "Hoje" (due, or checked today). */
  dueToday: boolean
  lastDone?: DateKey
  /** Next date it's expected (recurring: after today when done today). */
  next?: DateKey
  /** "a cada 15 dias · próximo: sex, 10/10" */
  detail: string
}

export function petTaskState(db: DB, task: PetTask, today: DateKey): PetTaskState {
  const lastDone = lastDoneDate(db.occurrences, 'petTask', task.id)
  if (task.recurrence) {
    const doneToday = !!occurrenceFor(db.occurrences, 'petTask', task.id, today)
    const due = task.active && (doneToday || isDue(task.recurrence, today, lastDone))
    const from = doneToday ? addDays(today, 1) : today
    const next = nextOccurrence(task.recurrence, from, lastDone)
    const parts = [describeRecurrence(task.recurrence)]
    if (task.recurrence.kind === 'weekly' && task.recurrence.weekdays.length === 7) {
      // daily-ish: "próximo" is noise
    } else if (next) parts.push(`próximo: ${nextDateLabel(next, today)}`)
    return { task, doneToday, dueToday: due, lastDone, next, detail: parts.join(' · ') }
  }
  const doneOneOff = !task.active
  const dueToday = task.active && !!task.dueDate && task.dueDate <= today
  let detail: string
  if (doneOneOff) detail = 'feito ✓'
  else if (task.dueDate) detail = task.dueDate < today ? `ficou de ${formatDayMonth(task.dueDate)}` : nextDateLabel(task.dueDate, today)
  else detail = 'sem data — quando der'
  return { task, doneToday: false, dueToday, lastDone, next: task.dueDate, detail }
}

/** Pet tasks for "Hoje": due today or already checked today (so the list doesn't jump). */
export function lunaToday(db: DB, today: DateKey): PetTaskState[] {
  return db.petTasks
    .map((t) => petTaskState(db, t, today))
    .filter((s) => s.dueToday)
    .sort((a, b) => Number(a.doneToday) - Number(b.doneToday) || a.task.order - b.task.order)
}

/** Pending count for the hub ("2 coisinhas hoje"). */
export function lunaPendingToday(db: DB, today: DateKey): number {
  return lunaToday(db, today).filter((s) => !s.doneToday).length
}

/** Pet tasks grouped by area in a fixed order; only non-empty areas. */
export function petTasksByArea(db: DB, today: DateKey) {
  return PET_CATEGORIES.map((c) => ({
    ...c,
    items: db.petTasks
      .filter((t) => t.category === c.value)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.order - b.order)
      .map((t) => petTaskState(db, t, today)),
  })).filter((g) => g.items.length > 0)
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

export const LIFE_CATEGORIES: { value: LifeAdminCategory; label: string; emoji: string }[] = [
  { value: 'casa', label: 'Casa', emoji: '🏡' },
  { value: 'carro', label: 'Carro', emoji: '🚗' },
  { value: 'bike', label: 'Bike', emoji: '🚲' },
  { value: 'documentos', label: 'Documentos', emoji: '📄' },
  { value: 'manutencao', label: 'Manutenção', emoji: '🔧' },
  { value: 'compras', label: 'Compras', emoji: '🛒' },
  { value: 'assinaturas', label: 'Assinaturas', emoji: '🔁' },
  { value: 'burocracia', label: 'Burocracias', emoji: '🗂️' },
  { value: 'consultas', label: 'Consultas', emoji: '🗓️' },
  { value: 'outros', label: 'Outros', emoji: '✨' },
]

export function lifeCategoryMeta(c: LifeAdminCategory | undefined) {
  return LIFE_CATEGORIES.find((x) => x.value === c) ?? LIFE_CATEGORIES[LIFE_CATEGORIES.length - 1]
}

export type LifeGroup = 'hoje' | 'semana' | 'review' | 'waiting' | 'algum_dia'

export const LIFE_GROUPS: { id: LifeGroup; title: string; hint?: string }[] = [
  { id: 'hoje', title: 'Hoje' },
  { id: 'semana', title: 'Esta semana' },
  { id: 'review', title: 'Revisar / confirmar', hint: 'ainda não sei se precisa — dá uma olhada quando der' },
  { id: 'waiting', title: 'Esperando alguém', hint: 'a bola está com outra pessoa' },
  { id: 'algum_dia', title: 'Algum dia' },
]

export interface LifeItem {
  task: Task
  group: LifeGroup
  /** Recurring: next expected date. */
  next?: DateKey
  doneToday: boolean
  /** One-line context under the title (without the category). */
  detail: string
}

function lifeItem(db: DB, t: Task, today: DateKey): LifeItem | undefined {
  if (t.status === 'archived') return undefined
  const weekEnd = endOfWeek(today)
  if (t.recurrence) {
    const lastDone = lastDoneDate(db.occurrences, 'task', t.id)
    const doneToday = !!occurrenceFor(db.occurrences, 'task', t.id, today)
    const next = nextOccurrence(t.recurrence, doneToday ? addDays(today, 1) : today, lastDone)
    const due = !doneToday && isDue(t.recurrence, today, lastDone)
    let group: LifeGroup = due || doneToday ? 'hoje' : next && next <= weekEnd ? 'semana' : 'algum_dia'
    if (t.status === 'waiting') group = 'waiting'
    if (t.status === 'review') group = 'review'
    const detail = [describeRecurrence(t.recurrence), next ? `próximo: ${nextDateLabel(next, today)}` : undefined]
      .filter(Boolean)
      .join(' · ')
    return { task: t, group, next, doneToday, detail }
  }
  if (t.status === 'done') {
    // Keep things checked today visible (struck through) so the list doesn't jump.
    if (t.completedAt && toDateKey(new Date(t.completedAt)) === today) {
      return { task: t, group: 'hoje', doneToday: true, detail: 'feito ✓' }
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
  return { task: t, group, doneToday: false, detail: parts.join(' · ') }
}

export function lifeAdminItems(db: DB, today: DateKey, category?: LifeAdminCategory): LifeItem[] {
  return db.tasks
    .filter((t) => t.context === 'vida_real')
    .filter((t) => !category || (t.lifeAdminCategory ?? 'outros') === category)
    .map((t) => lifeItem(db, t, today))
    .filter((x): x is LifeItem => !!x)
    .sort((a, b) => Number(a.doneToday) - Number(b.doneToday) || (a.next ?? '9999').localeCompare(b.next ?? '9999') || a.task.order - b.task.order)
}

export function groupLifeAdmin(db: DB, today: DateKey, category?: LifeAdminCategory): Record<LifeGroup, LifeItem[]> {
  const out: Record<LifeGroup, LifeItem[]> = { hoje: [], semana: [], review: [], waiting: [], algum_dia: [] }
  for (const it of lifeAdminItems(db, today, category)) out[it.group].push(it)
  return out
}

/** Open counts per category (for chips). */
export function lifeCategoryCounts(db: DB, today: DateKey): Partial<Record<LifeAdminCategory, number>> {
  const out: Partial<Record<LifeAdminCategory, number>> = {}
  for (const it of lifeAdminItems(db, today)) {
    if (it.doneToday) continue
    const c = it.task.lifeAdminCategory ?? 'outros'
    out[c] = (out[c] ?? 0) + 1
  }
  return out
}

/** Hub counts: open today / this week (week includes today). */
export function lifeAdminCounts(db: DB, today: DateKey): { hoje: number; semana: number; review: number } {
  const g = groupLifeAdmin(db, today)
  const hoje = g.hoje.filter((i) => !i.doneToday).length
  return { hoje, semana: hoje + g.semana.length, review: g.review.length }
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
