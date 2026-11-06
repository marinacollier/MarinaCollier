/**
 * Home limpa (MARINA OS 2.0) — pure picks for the five things Home shows, nothing else:
 *   header "Sexta, 6 nov · Cape Town" · Hoje · Próximos dias · Precisa de você (max 3) · one trip chip line.
 * Hoje / Próximos dias read the SAME projection as the Agenda (data/calendar/universal.ts); Precisa de você
 * reads the trip ops derivations (features/travel/expedition/panel.ts) during a trip and the day's queue
 * otherwise. Every row is one line: long text (notes, next actions) stays in the item's own sheet.
 */
import type { ActionItem } from '@/data/agenda/items'
import type { AttentionItem } from '@/data/intel'
import type { CalendarEntry } from '@/data/calendar/universal'
import type { DateKey, DB, TripItem } from '@/data/types'
import { addDays, MONTHS, WEEKDAY_LONG, weekday } from '@/lib/date'
import { bookingStatusOf } from '@/features/travel/expedition/command'
import { formatMoney } from '@/features/travel/expedition/logic'
import type { TripOpsPanel } from '@/features/travel/expedition/panel'

/** Max length of a one-line row title on Home (the rest lives in the sheet). */
export const ROW_MAX = 40
/** Precisa de você: never more than this on Home. */
export const NEEDS_MAX = 3
/** Próximos dias: days and rows per day. */
export const NEXT_DAYS = 3
export const NEXT_PER_DAY = 3

/** "R4.000" (rand) · "R$ 1.200" (real): whole units, short enough for a chip. */
export function shortMoney(cents: number, currency: string): string {
  const n = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(cents / 100))
  if (currency === 'ZAR') return `R${n}`
  if (currency === 'BRL') return `R$ ${n}`
  return formatMoney(cents, currency as Parameters<typeof formatMoney>[1])
}

const cap = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1)

/** "Sexta, 6 nov". */
export function headerDate(date: DateKey): string {
  const m = Number(date.slice(5, 7)) - 1
  return `${cap(WEEKDAY_LONG[weekday(date)])}, ${Number(date.slice(8, 10))} ${MONTHS[m].slice(0, 3)}`
}

/** A title that fits one line: no parenthetical, no "— subtitle", capped at ROW_MAX with an ellipsis. */
export function shortTitle(title: string, max = ROW_MAX): string {
  let t = title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (t.length > max) {
    const head = t.split(/\s[—–·-]\s/)[0]?.trim()
    if (head && head.length >= 6 && head.length <= max) t = head
  }
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

// ─── Hoje / Próximos dias ───────────────────────────────────────────────────

/**
 * What counts as a commitment on Home: things she goes to or does at a moment (events, classes, workouts,
 * trip bookings, timed tasks, work blocks, Luna, meetings). Deadlines, bills, receivables and pipeline
 * follow-ups are to-dos — they live in Agenda / "Precisa de você", not in the day's list.
 */
const COMMITMENT = new Set<CalendarEntry['sourceType']>(['event', 'workout', 'task', 'tripItem', 'school', 'work', 'petTask', 'petBirthday', 'meeting'])

/** A commitment worth a line on Home: no background base (work hours), no trip span, no undecided extras. */
export function isHomeEntry(e: CalendarEntry): boolean {
  if (e.base || e.optional || e.status === 'cancelado') return false
  return COMMITMENT.has(e.sourceType)
}

const timeOf = (e: CalendarEntry) => (e.allDay || e.endAt.date > e.startAt.date ? undefined : e.startAt.time)

/** The day's rows, all-day first, then by time. Spans (a stay) show on their first day only. */
export function dayRows(entries: CalendarEntry[], date: DateKey): CalendarEntry[] {
  return entries
    .filter((e) => isHomeEntry(e) && e.startAt.date === date)
    .sort((a, b) => (timeOf(a) ?? '').localeCompare(timeOf(b) ?? '') || a.title.localeCompare(b.title, 'pt-BR'))
}

/** "dia todo" or "09:00". */
export function rowTime(e: CalendarEntry): string {
  return timeOf(e) ?? 'dia todo'
}

export interface NextDay {
  date: DateKey
  rows: CalendarEntry[]
}

/** The next `days` days (after `date`, within `horizon`) that have something, `perDay` rows each. */
export function nextDays(entries: CalendarEntry[], date: DateKey, days = NEXT_DAYS, perDay = NEXT_PER_DAY, horizon = 14): NextDay[] {
  const out: NextDay[] = []
  for (let i = 1; i <= horizon && out.length < days; i++) {
    const d = addDays(date, i)
    const rows = dayRows(entries, d)
    if (rows.length) out.push({ date: d, rows: rows.slice(0, perDay) })
  }
  return out
}

/** "Amanhã" · "Domingo, 8 nov". */
export function dayHeader(d: DateKey, today: DateKey): string {
  return d === addDays(today, 1) ? 'Amanhã' : headerDate(d)
}

/** Tiny status chip of a row ("a confirmar", "pago", "reservar"…), or nothing when all is fine. */
export function entryChip(db: Pick<DB, 'tripItems'>, e: CalendarEntry): string | undefined {
  if (e.status === 'feito') return 'feito'
  if (e.sourceType === 'tripItem') {
    const i = db.tripItems.find((x) => x.id === e.sourceId)
    if (i) {
      const chip = tripChip(i)
      if (chip) return chip
      if (i.paymentStatus === 'pago') return 'pago'
    }
  }
  return e.status === 'pendente' ? 'a confirmar' : undefined
}

function tripChip(i: TripItem): string | undefined {
  switch (bookingStatusOf(i)) {
    case 'a_reservar':
      return 'reservar'
    case 'a_cotar':
      return 'cotar'
    case 'aguardando_resposta':
      return 'aguardando'
    case 'aguardando_pagamento':
      return 'a pagar'
    default:
      return undefined
  }
}

// ─── Precisa de você ────────────────────────────────────────────────────────

export type NeedOpen = { kind: 'tripItem'; id: string } | { kind: 'item'; item: ActionItem } | { kind: 'ask'; text: string } | { kind: 'route'; to: string }

export interface Need {
  key: string
  title: string
  chip: string
  open: NeedOpen
}

const RANK = { P0: 0, P1: 1, P2: 2 } as const
const rankOf = (i: TripItem) => (i.priority ? RANK[i.priority] : 3)

/**
 * During the trip: unpaid committed bookings, the next leg (Johannesburg / safari) still open and answers
 * awaited from suppliers — P0 first, one row per booking, at most `max`.
 */
export function tripNeeds(panel: TripOpsPanel, opts: { hideMoney?: boolean; max?: number } = {}): Need[] {
  const seen = new Set<string>()
  const list: { item: TripItem; chip: string; order: number }[] = []
  const add = (item: TripItem, chip: string, order: number) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    list.push({ item, chip, order })
  }
  for (const { item, money } of panel.payments) {
    const owed = money.balance != null && money.balance > 0 && !opts.hideMoney
    add(item, owed ? `pagar ${shortMoney(money.balance!, money.currency)}` : 'pagar', 0)
  }
  for (const i of panel.leg.items) add(i, tripChip(i) ?? 'resolver', 1)
  for (const i of panel.awaiting) add(i, 'aguardando', 2)
  return list
    .sort((a, b) => rankOf(a.item) - rankOf(b.item) || a.order - b.order || (a.item.deadline ?? a.item.date ?? '9999').localeCompare(b.item.deadline ?? b.item.date ?? '9999'))
    .slice(0, opts.max ?? NEEDS_MAX)
    .map(({ item, chip }) => ({ key: `trip:${item.id}`, title: shortTitle(item.title), chip, open: { kind: 'tripItem', id: item.id } }))
}

const ATTENTION_CHIP: Record<AttentionItem['kind'], string> = {
  ambiguity: 'confirmar',
  conflict: 'conflito',
  decision: 'decidir',
  confirm_pattern: 'confirmar',
  waiting_reply: 'responder',
}

/** Outside a trip (or to fill up): what is overdue from the day's list, then the attention queue. */
export function lifeNeeds(items: ActionItem[], attention: AttentionItem[], max = NEEDS_MAX): Need[] {
  const late: Need[] = items
    .filter((i) => i.carried && i.status === 'pending')
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
    .map((i) => ({ key: `item:${i.key}`, title: shortTitle(i.title), chip: 'atrasada', open: { kind: 'item', item: i } }))
  const asks: Need[] = attention.map((a) => ({ key: `att:${a.key}`, title: shortTitle(a.title), chip: ATTENTION_CHIP[a.kind], open: { kind: 'ask', text: a.options?.[0]?.ask ?? a.title } }))
  return [...late, ...asks].slice(0, max)
}

// ─── Trip chip line ─────────────────────────────────────────────────────────

/** "SA366" from "Voo SA366 Cape Town → Johannesburg"; the short title when there is no flight code. */
export function flightName(title: string): string {
  const code = title.match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/)
  return code ? `${code[1]}${code[2]}` : shortTitle(title.replace(/^voo\s+/i, ''), 24)
}

/** "em 7 dias" · "amanhã" · "hoje". */
export function inDays(n: number): string {
  if (n <= 0) return 'hoje'
  return n === 1 ? 'amanhã' : `em ${n} dias`
}
