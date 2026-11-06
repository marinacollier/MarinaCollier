/**
 * Expedição · command center (Atualização mestre 31/10) — pure helpers, no React, no writes.
 *
 * - Her status vocabulary (CONCLUÍDO, RESERVADO, AGUARDANDO RESPOSTA, A COTAR, A RESERVAR, OPCIONAL,
 *   CANCELADO) + PLANEJADO, mapped onto the older fields (status/booking/optional) so every older screen
 *   keeps agreeing. RESERVADO needs a voucher, a code or the supplier's confirmation (`proof`): without
 *   one an item never reads RESERVADO, whatever the older fields say.
 * - The dashboard strip (next commitment, 3 priorities, pending bookings, awaited answers, confirmed
 *   spend, days to the flight), budget by category, shopping by person, trip workouts and work blocks.
 */
import type {
  DateKey,
  Expense,
  Task,
  Trip,
  TripBookingStatus,
  TripBudgetCategory,
  TripItem,
  TripPriority,
  Workout,
} from '@/data/types'
import { SEED_IDS } from '@/data/seed/ids'
import { addDays, diffDays, hmToMinutes } from '@/lib/date'
import { convert, isActive, nextDeparture, type Departure } from './logic'

// ─── Status vocabulary ──────────────────────────────────────────────────────

export const BOOKING_STATUS_META: Record<TripBookingStatus, { label: string; cls: string }> = {
  concluido: { label: 'CONCLUÍDO', cls: 'bg-sage text-bg' },
  reservado: { label: 'RESERVADO', cls: 'bg-sage-soft text-[color-mix(in_oklab,var(--sage)_70%,var(--ink))]' },
  aguardando_resposta: { label: 'AGUARDANDO RESPOSTA', cls: 'bg-ocean-soft text-[color-mix(in_oklab,var(--ocean)_72%,var(--ink))]' },
  a_cotar: { label: 'A COTAR', cls: 'bg-sand-soft text-[color-mix(in_oklab,var(--sand)_62%,var(--ink))]' },
  a_reservar: { label: 'A RESERVAR', cls: 'bg-sand-soft text-[color-mix(in_oklab,var(--sand)_62%,var(--ink))]' },
  opcional: { label: 'OPCIONAL', cls: 'bg-plum-soft text-ink-2' },
  cancelado: { label: 'CANCELADO', cls: 'bg-surface-2 text-muted line-through' },
  planejado: { label: 'PLANEJADO', cls: 'bg-surface-2 text-ink-2' },
  reserva_emitida: { label: 'RESERVA EMITIDA', cls: 'bg-sage-soft text-[color-mix(in_oklab,var(--sage)_70%,var(--ink))]' },
  confirmado: { label: 'CONFIRMADO', cls: 'bg-sage text-bg' },
}
export const BOOKING_STATUS_ORDER: TripBookingStatus[] = ['planejado', 'a_cotar', 'a_reservar', 'aguardando_resposta', 'reserva_emitida', 'reservado', 'confirmado', 'concluido', 'opcional', 'cancelado']

/**
 * Booked: money is committed until it is paid. RESERVA EMITIDA (reference issued, operation/payment may be
 * pending), RESERVADO (with proof) and CONFIRMADO (supplier confirmed the details).
 */
export const COMMITTED_STATUSES: TripBookingStatus[] = ['reserva_emitida', 'reservado', 'confirmado']
export const isCommittedStatus = (s: TripBookingStatus) => COMMITTED_STATUSES.includes(s)

/** Voucher, booking code or the supplier's confirmation in words. */
export const hasProof = (i: Pick<TripItem, 'voucherUrl' | 'confirmationCode' | 'proof'>) => !!(i.voucherUrl?.trim() || i.confirmationCode?.trim() || i.proof?.trim())

const RESERVABLE: TripItem['section'][] = ['voo', 'hospedagem', 'transporte', 'reserva']

/**
 * The status as she reads it. Done/cancelled on the older screens win (a swipe there is her word);
 * then the stored status; then what the older fields say. Never RESERVADO without proof.
 */
export function bookingStatusOf(i: TripItem): TripBookingStatus {
  if (i.status === 'cancelado' || i.booking === 'cancelado') return 'cancelado'
  if (i.status === 'feito' || i.booking === 'concluido') return 'concluido'
  const stored = i.bookingStatus
  if (stored === 'reservado') return hasProof(i) ? 'reservado' : 'planejado'
  if (stored && stored !== 'concluido' && stored !== 'cancelado') return stored
  if (i.optional) return 'opcional'
  const b = i.booking
  if (b === 'confirmado' || b === 'pago' || i.status === 'confirmado') return hasProof(i) ? 'reservado' : 'planejado'
  if (b === 'aguardando' || b === 'cotacao_solicitada') return 'aguardando_resposta'
  if (b === 'nao_pesquisado') return 'a_cotar'
  if (i.status === 'a_confirmar' && RESERVABLE.includes(i.section)) return 'a_reservar'
  return 'planejado'
}

/** Picking a status keeps the older fields in step (Home, Agenda, Revisar and Pendências agree). */
export function bookingStatusPatch(s: TripBookingStatus): Partial<TripItem> {
  switch (s) {
    case 'concluido':
      return { bookingStatus: s, status: 'feito', booking: 'concluido' }
    case 'reservado':
    case 'reserva_emitida':
    case 'confirmado':
      return { bookingStatus: s, status: 'confirmado', booking: 'confirmado' }
    case 'aguardando_resposta':
      return { bookingStatus: s, status: 'a_confirmar', booking: 'aguardando' }
    case 'a_cotar':
      return { bookingStatus: s, status: 'a_confirmar', booking: 'nao_pesquisado' }
    case 'a_reservar':
      return { bookingStatus: s, status: 'a_confirmar', booking: undefined }
    case 'opcional':
      return { bookingStatus: s, status: 'a_confirmar', booking: undefined, optional: true }
    case 'cancelado':
      return { bookingStatus: s, status: 'cancelado', booking: 'cancelado' }
    case 'planejado':
      return { bookingStatus: s, status: 'a_fazer', booking: undefined }
  }
}

export const PENDING_STATUSES: TripBookingStatus[] = ['a_cotar', 'a_reservar']
const OPEN = (s: TripBookingStatus) => s !== 'concluido' && s !== 'cancelado'

// ─── Priority & category ────────────────────────────────────────────────────

export const PRIORITIES: TripPriority[] = ['P0', 'P1', 'P2']
const TASK_PRIORITY: Record<NonNullable<Task['priority']>, TripPriority> = { alta: 'P0', media: 'P1', baixa: 'P2' }
export const taskPriority = (t: Task): TripPriority | undefined => (t.priority ? TASK_PRIORITY[t.priority] : undefined)
const rankOf = (p?: TripPriority) => (p ? PRIORITIES.indexOf(p) : 3)

export const CATEGORY_META: Record<TripBudgetCategory, { label: string; emoji: string }> = {
  hospedagem: { label: 'Hospedagem', emoji: '🛏️' },
  safari: { label: 'Safári', emoji: '🦁' },
  transfers: { label: 'Transfers', emoji: '🚐' },
  tours: { label: 'Tours', emoji: '🧭' },
  alimentacao: { label: 'Alimentação', emoji: '🍽️' },
  uber: { label: 'Uber', emoji: '🚕' },
  treinos: { label: 'Treinos e atividades', emoji: '🏄‍♀️' },
  compras: { label: 'Compras', emoji: '🛍️' },
  presentes: { label: 'Presentes', emoji: '🎁' },
  bagagem: { label: 'Bagagem extra', emoji: '🧳' },
  emergencia: { label: 'Reserva de emergência', emoji: '🛟' },
}
export const CATEGORY_ORDER = Object.keys(CATEGORY_META) as TripBudgetCategory[]

/** Stored category, or the one the section implies. */
export function categoryOf(i: TripItem): TripBudgetCategory | undefined {
  if (i.category) return i.category
  if (i.checklistKind === 'safari') return 'safari'
  switch (i.section) {
    case 'hospedagem':
      return 'hospedagem'
    case 'transporte':
      return 'transfers'
    case 'comida':
      return 'alimentacao'
    case 'esporte':
      return 'treinos'
    case 'reserva':
    case 'roteiro':
    case 'quero_ir':
      return 'tours'
    case 'comprar':
      return 'compras'
    default:
      return undefined
  }
}

// ─── Money ──────────────────────────────────────────────────────────────────

const tripCur = (trip: Trip) => trip.expedition?.currency ?? 'BRL'
const inTrip = (trip: Trip, cents: number | undefined, from: TripItem['currency']) =>
  cents == null ? 0 : trip.expedition ? convert(cents, from ?? tripCur(trip), tripCur(trip), trip.expedition) ?? 0 : cents

/** Real spending lines (bank statement) of this trip, in the trip currency. */
export const tripLedger = (trip: Trip, expenses: Expense[] = []) =>
  expenses.filter((e) => e.tripId === trip.id && e.type !== 'income' && e.status === 'paid' && !!e.date)
const ledgerCents = (trip: Trip, e: Expense) => inTrip(trip, e.amountCents, (e.currency ?? 'BRL') as TripItem['currency'])
/** Days the statement covers: there the statement is the truth and the items' paid/uber are not counted again. */
export const ledgerDays = (trip: Trip, expenses: Expense[] = []) => new Set(tripLedger(trip, expenses).map((e) => e.date!))

/** Confirmed spend: what was actually paid (paid values + Uber of what she did), in the trip currency. */
export function confirmedSpend(trip: Trip, items: TripItem[], expenses: Expense[] = []): number {
  const covered = ledgerDays(trip, expenses)
  let s = tripLedger(trip, expenses).reduce((t, e) => t + ledgerCents(trip, e), 0)
  for (const i of items) {
    if (!isActive(i) || (i.date && covered.has(i.date))) continue
    s += inTrip(trip, i.paidCents, i.currency)
    if (i.status === 'feito') s += inTrip(trip, i.uberCents, i.currency)
  }
  return s
}

export interface CategoryRow {
  category: TripBudgetCategory
  estimated: number
  quoted: number
  paid: number
  items: TripItem[]
}

/** Estimated vs quoted vs paid per category (trip currency; extras left out). Uber is its own row. */
export function budgetByCategory(trip: Trip, items: TripItem[], expenses: Expense[] = []): CategoryRow[] {
  const rows = new Map<TripBudgetCategory, CategoryRow>(CATEGORY_ORDER.map((c) => [c, { category: c, estimated: 0, quoted: 0, paid: 0, items: [] }]))
  const covered = ledgerDays(trip, expenses)
  for (const e of tripLedger(trip, expenses)) rows.get(e.tripCategory ?? 'compras')!.paid += ledgerCents(trip, e)
  for (const i of items) {
    if (!isActive(i) || i.optional) continue
    if (i.date && covered.has(i.date)) {
      // The statement already holds that day's real money: keep only the plan values.
      const c = categoryOf(i)
      if (c) {
        const r = rows.get(c)!
        r.estimated += inTrip(trip, i.estimatedCents, i.currency)
        r.quoted += inTrip(trip, i.quotedCents, i.currency)
      }
      continue
    }
    const c = categoryOf(i)
    if (c) {
      const r = rows.get(c)!
      r.estimated += inTrip(trip, i.estimatedCents, i.currency)
      r.quoted += inTrip(trip, i.quotedCents, i.currency)
      r.paid += inTrip(trip, i.paidCents, i.currency)
      if (i.estimatedCents != null || i.quotedCents != null || i.paidCents != null) r.items.push(i)
    }
    if (i.uberCents != null) {
      const u = rows.get('uber')!
      const v = inTrip(trip, i.uberCents, i.currency)
      if (i.status === 'feito') u.paid += v
      else u.estimated += v
      u.items.push(i)
    }
  }
  return [...rows.values()]
}

// ─── Shopping ───────────────────────────────────────────────────────────────

export interface ShoppingGroup {
  key: string
  items: TripItem[]
  estimated: number
  paid: number
  open: number
}

const SHOPPING_CATS: TripBudgetCategory[] = ['compras', 'presentes', 'bagagem']
export const isShopping = (i: TripItem) => i.section === 'comprar' || (!!i.category && SHOPPING_CATS.includes(i.category))

/** Shopping grouped by person ("sem pessoa" last) or by category. */
export function shoppingBy(trip: Trip, items: TripItem[], by: 'person' | 'category'): ShoppingGroup[] {
  const map = new Map<string, ShoppingGroup>()
  for (const i of items) {
    if (!isActive(i) || !isShopping(i)) continue
    const key = by === 'person' ? i.person?.trim() || 'Sem pessoa' : CATEGORY_META[categoryOf(i) ?? 'compras'].label
    const g = map.get(key) ?? { key, items: [], estimated: 0, paid: 0, open: 0 }
    g.items.push(i)
    g.estimated += inTrip(trip, i.quotedCents ?? i.estimatedCents, i.currency)
    g.paid += inTrip(trip, i.paidCents, i.currency)
    if (i.status !== 'feito') g.open++
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) => (a.key === 'Sem pessoa' ? 1 : b.key === 'Sem pessoa' ? -1 : a.key.localeCompare(b.key, 'pt-BR')))
}

// ─── Training, study and work ───────────────────────────────────────────────

export const inTripDates = (trip: Trip, date?: DateKey) => !!date && !!trip.startDate && date >= trip.startDate && date <= (trip.endDate ?? trip.startDate)

/** Workouts on the trip's days (the trip's own plan; the SP template stays paused). */
export function tripWorkouts(trip: Trip, workouts: Workout[]): Workout[] {
  return workouts.filter((w) => inTripDates(trip, w.date)).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
}

export interface WorkBlock {
  date: DateKey
  minutes: number
  tasks: Task[]
}

/** Fashion Finder work planned on the trip's days, one block per day (45–90 min each). */
export function workBlocks(trip: Trip, tasks: Task[], projectId: string = SEED_IDS.projFashionFinder): WorkBlock[] {
  const map = new Map<DateKey, WorkBlock>()
  for (const t of tasks) {
    if (t.projectId !== projectId || !t.date || !inTripDates(trip, t.date) || t.status === 'archived') continue
    const b = map.get(t.date) ?? { date: t.date, minutes: 0, tasks: [] }
    b.tasks.push(t)
    b.minutes += t.durationMin ?? 0
    map.set(t.date, b)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const taskOpen = (t: Task) => t.status !== 'done' && t.status !== 'archived'

/** Alerts = open trip tasks with a deadline (section 14), nearest first. */
export function tripAlerts(trip: Trip, tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.tripId === trip.id && taskOpen(t) && t.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || rankOf(taskPriority(a)) - rankOf(taskPriority(b)))
}

// ─── Dashboard strip ────────────────────────────────────────────────────────

export interface Priority {
  key: string
  title: string
  priority?: TripPriority
  /** Deadline (task dueDate / item deadline) or the day it's planned for. */
  due?: DateKey
  kind: 'task' | 'tripItem'
  id: string
}

export interface TripDashboard {
  next?: Departure
  priorities: Priority[]
  pendingBookings: TripItem[]
  awaiting: TripItem[]
  spentCents: number
  currency: NonNullable<Trip['expedition']>['currency']
  /** The last flight of the trip (the return). */
  flight?: TripItem
  daysToFlight?: number
}

/** The return flight: the last flight on the calendar, else the trip's end. */
export function returnFlight(items: TripItem[]): TripItem | undefined {
  return items.filter((i) => isActive(i) && i.section === 'voo' && i.date).sort((a, b) => b.date!.localeCompare(a.date!))[0]
}

/**
 * What is most pressing today: open trip tasks and items due within 2 days (or overdue), planned for today,
 * or P0 — ranked by priority, then deadline. Three at most.
 */
export function dayPriorities(trip: Trip, items: TripItem[], tasks: Task[], today: DateKey, limit = 3): Priority[] {
  const soon = addDays(today, 2)
  const out: Priority[] = []
  for (const t of tasks) {
    if (t.tripId !== trip.id || !taskOpen(t) || t.status === 'waiting') continue
    const due = t.dueDate ?? t.date
    if (!due || !(due <= soon || t.date === today)) continue
    out.push({ key: `t:${t.id}`, title: t.title, priority: taskPriority(t), due, kind: 'task', id: t.id })
  }
  for (const i of items) {
    if (!isActive(i) || i.optional) continue
    const s = bookingStatusOf(i)
    // Booked items wait for their day; RESERVA EMITIDA still counts when she set a deadline (payment/operation).
    if (!OPEN(s) || s === 'reservado' || s === 'confirmado') continue
    const due = i.deadline ?? (i.date && (s === 'planejado' ? i.date : undefined))
    if (!due || due > soon) continue
    if (s === 'planejado' && !i.priority) continue
    out.push({ key: `i:${i.id}`, title: i.nextAction ? `${i.title}: ${i.nextAction}` : i.title, priority: i.priority, due, kind: 'tripItem', id: i.id })
  }
  return out.sort((a, b) => rankOf(a.priority) - rankOf(b.priority) || (a.due ?? '9999').localeCompare(b.due ?? '9999')).slice(0, limit)
}

export function tripDashboard(trip: Trip, items: TripItem[], tasks: Task[], now: { date: DateKey; minutes: number }, expenses: Expense[] = []): TripDashboard {
  const active = items.filter(isActive)
  const statusOf = new Map(active.map((i) => [i.id, bookingStatusOf(i)]))
  const byDeadline = (a: TripItem, b: TripItem) => rankOf(a.priority) - rankOf(b.priority) || (a.deadline ?? a.date ?? '9999').localeCompare(b.deadline ?? b.date ?? '9999')
  const ahead = (i: TripItem) => !i.date || (i.endDate ?? i.date) >= now.date
  const flight = returnFlight(items)
  return {
    next: nextDeparture(active.filter((i) => OPEN(statusOf.get(i.id)!)), now, 7),
    priorities: dayPriorities(trip, items, tasks, now.date),
    pendingBookings: active.filter((i) => PENDING_STATUSES.includes(statusOf.get(i.id)!) && ahead(i)).sort(byDeadline),
    awaiting: active.filter((i) => statusOf.get(i.id) === 'aguardando_resposta' && ahead(i)).sort(byDeadline),
    spentCents: confirmedSpend(trip, items, expenses),
    currency: tripCur(trip),
    flight,
    daysToFlight: flight?.date ? diffDays(now.date, flight.date) : trip.endDate ? diffDays(now.date, trip.endDate) : undefined,
  }
}

/** "em 16 dias" / "amanhã" / "hoje". */
export function daysLabel(n: number): string {
  if (n <= 0) return n === 0 ? 'hoje' : 'já passou'
  return n === 1 ? 'amanhã' : `em ${n} dias`
}

/** Minutes of a block as "1h30". */
export function minutesLabel(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`
}

/** Sort helper for a day's mixed rows (items, workouts, tasks): time first, untimed last. */
export const byTime = (a?: string, b?: string) => (a ? hmToMinutes(a) : 9999) - (b ? hmToMinutes(b) : 9999)
