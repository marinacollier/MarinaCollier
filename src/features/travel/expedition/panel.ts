/**
 * Expedição · painel operacional da Home (during the trip) — pure reads over what is stored, nothing invented:
 *   - itemMoney: total (cotado → valor → estimado), pago and saldo of one booking;
 *   - agenda of today + the next 7 days, the next priority action, bookings with payment pending,
 *     answers awaited from suppliers, deliveries on the way, spend (financialClose), the wallet balance only
 *     when she typed it, conflicts, the countdown to the next flight and the next leg's open items.
 * Nothing here writes; every list is ranked deterministically (priority P0→P2, then deadline/date).
 */
import type { DateKey, Expense, Trip, TripCurrency, TripItem, TripWalletBalance, Workout } from '@/data/types'
import { addDays, diffDays } from '@/lib/date'
import { COMMITTED_STATUSES, bookingStatusOf } from './command'
import { findConflicts, isActive, type Conflict } from './logic'
import { financialClose } from './ops'

const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2 } as const
const rank = (i: TripItem) => (i.priority ? PRIORITY_RANK[i.priority] : 3)
const when = (i: TripItem) => i.deadline ?? i.date ?? '9999'
const byPriority = (a: TripItem, b: TripItem) => rank(a) - rank(b) || when(a).localeCompare(when(b))
const byDate = (a: TripItem, b: TripItem) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.leaveTime ?? a.time ?? '99').localeCompare(b.leaveTime ?? b.time ?? '99') || a.order - b.order
const curOf = (trip: Trip): TripCurrency => trip.expedition?.currency ?? 'BRL'
const open = (i: TripItem) => {
  const s = bookingStatusOf(i)
  return s !== 'concluido' && s !== 'cancelado'
}
/** Still ahead (or undated). */
const ahead = (i: TripItem, today: DateKey) => !i.date || (i.endDate ?? i.date) >= today

// ─── Money of one item ──────────────────────────────────────────────────────

export interface ItemMoney {
  /** Quoted, else the stored value, else her estimate. Undefined = unknown (never guessed). */
  total?: number
  paid: number
  /** total − paid, only when the total is known. */
  balance?: number
  currency: TripCurrency
}

export function itemMoney(i: TripItem, fallback: TripCurrency = 'BRL'): ItemMoney {
  const total = i.quotedCents ?? i.amountCents ?? i.estimatedCents
  const paid = i.paidCents ?? 0
  return { total, paid, balance: total != null ? total - paid : undefined, currency: i.currency ?? fallback }
}

// ─── Lists ──────────────────────────────────────────────────────────────────

/** Trip items of today and the next `days` days (multi-day ones that are still running included). */
export function tripAgenda(items: TripItem[], today: DateKey, days = 7): TripItem[] {
  const last = addDays(today, days)
  return items
    .filter((i) => {
      if (!isActive(i) || !i.date || i.date > last) return false
      if (bookingStatusOf(i) === 'opcional') return false
      // A stay shows on its check-in day, not on every night.
      if (i.section === 'hospedagem') return i.date >= today
      return (i.endDate ?? i.date) >= today
    })
    .sort(byDate)
}

/** The one action to do next: open item with a next action, P0→P2, then the nearest deadline/date. */
export function nextPriorityAction(items: TripItem[], today: DateKey): TripItem | undefined {
  return items.filter((i) => isActive(i) && i.status !== 'feito' && open(i) && !i.optional && !!i.nextAction?.trim() && ahead(i, today)).sort(byPriority)[0]
}

/** Booked (or awaiting) and not fully paid. Explicit "pagamento pendente" always counts while not cancelled. */
const PAY_STATUSES = [...COMMITTED_STATUSES, 'aguardando_resposta' as const]

export interface PendingPayment {
  item: TripItem
  money: ItemMoney
}

export function pendingPayments(trip: Trip, items: TripItem[]): PendingPayment[] {
  const out: PendingPayment[] = []
  for (const i of items) {
    if (!isActive(i) || i.paymentStatus === 'pago' || i.paymentStatus === 'nao_se_aplica') continue
    const s = bookingStatusOf(i)
    const money = itemMoney(i, curOf(trip))
    const flagged = i.paymentStatus === 'pendente' && s !== 'cancelado'
    const owed = PAY_STATUSES.includes(s as (typeof PAY_STATUSES)[number]) && (money.balance ?? 0) > 0
    if (flagged || owed) out.push({ item: i, money })
  }
  return out.sort((a, b) => byPriority(a.item, b.item))
}

/** Waiting for the supplier's answer, still ahead. */
export function awaitingSupplier(items: TripItem[], today: DateKey): TripItem[] {
  return items.filter((i) => isActive(i) && !i.optional && bookingStatusOf(i) === 'aguardando_resposta' && ahead(i, today)).sort(byPriority)
}

/** Bought, delivery pending (nearest expected first; unknown dates last). */
export function pendingDeliveries(expenses: Expense[]): Expense[] {
  return expenses
    .filter((e) => e.delivery?.status === 'pendente' && e.status !== 'cancelled')
    .sort((a, b) => (a.delivery!.expected ?? '9999').localeCompare(b.delivery!.expected ?? '9999') || a.title.localeCompare(b.title, 'pt-BR'))
}

/** The next flight not done yet (today's included until she marks it), with the days left. */
export function nextFlight(items: TripItem[], today: DateKey): { item: TripItem; days: number } | undefined {
  const f = items
    .filter((i) => isActive(i) && i.section === 'voo' && i.status !== 'feito' && !!i.date && i.date >= today)
    .sort(byDate)[0]
  return f ? { item: f, days: diffDays(today, f.date!) } : undefined
}

/** Names of the next leg (Johannesburg, the safari, Pilanesberg). */
export const NEXT_LEG = /joh?anesburg|joanesburgo|\bjnb\b|safari|saf[aá]ri|pilanesberg/i
const LEG_OPEN = ['a_reservar', 'a_cotar', 'aguardando_resposta'] as const

export interface LegHighlight {
  /** "Johannesburg / Safari" — the most common group of the items, else undefined. */
  label?: string
  items: TripItem[]
}

/**
 * The next leg's open items, highlighted until resolved: the leg is named (group/title) or starts with the
 * next flight (everything from the flight's day on belongs to the next city). Open = to book, to quote,
 * awaiting an answer or payment pending.
 */
export function nextLegPending(trip: Trip, items: TripItem[], today: DateKey): LegHighlight {
  const flight = nextFlight(items, today)
  const owing = new Set(pendingPayments(trip, items).map((p) => p.item.id))
  const list = items
    .filter((i) => {
      if (!isActive(i) || i.optional || !ahead(i, today)) return false
      const inLeg = NEXT_LEG.test(i.group ?? '') || NEXT_LEG.test(i.title) || (!!flight && !!i.date && i.date >= flight.item.date! && i.id !== flight.item.id)
      if (!inLeg) return false
      const s = bookingStatusOf(i)
      return (LEG_OPEN as readonly string[]).includes(s) || owing.has(i.id)
    })
    .sort(byPriority)
  const count = new Map<string, number>()
  for (const i of list) if (i.group) count.set(i.group, (count.get(i.group) ?? 0) + 1)
  const label = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
  return { label, items: list }
}

// ─── The panel ──────────────────────────────────────────────────────────────

export interface TripOpsPanel {
  trip: Trip
  date: DateKey
  agenda: TripItem[]
  next?: TripItem
  payments: PendingPayment[]
  awaiting: TripItem[]
  deliveries: Expense[]
  finance: { paid: number; committed: number; estimated: number; currency: TripCurrency }
  /** Only what she typed; undefined = "não informado". */
  wallet?: TripWalletBalance
  conflicts: Conflict[]
  flight?: { item: TripItem; days: number }
  leg: LegHighlight
}

/** The trip whose expedition covers `date` (start ≤ date ≤ end). */
export function activeExpeditionTrip(trips: Trip[], date: DateKey): Trip | undefined {
  return trips.find((t) => !!t.expedition && !!t.startDate && t.startDate <= date && date <= (t.endDate ?? t.startDate) && t.status !== 'concluida')
}

export function tripOpsPanel(trip: Trip, all: TripItem[], expenses: Expense[], workouts: Workout[], date: DateKey): TripOpsPanel {
  const items = all.filter((i) => i.tripId === trip.id)
  const f = financialClose(trip, items, expenses)
  return {
    trip,
    date,
    agenda: tripAgenda(items, date),
    next: nextPriorityAction(items, date),
    payments: pendingPayments(trip, items),
    awaiting: awaitingSupplier(items, date),
    deliveries: pendingDeliveries(expenses),
    finance: { paid: f.paid, committed: f.committed, estimated: f.estimated, currency: f.currency },
    wallet: trip.expedition?.walletBalance,
    conflicts: findConflicts(trip, items, workouts).filter((c) => c.date >= date),
    flight: nextFlight(items, date),
    leg: nextLegPending(trip, items, date),
  }
}
