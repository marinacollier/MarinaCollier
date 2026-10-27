/**
 * Expedição — pure helpers over a Trip with `expedition` settings and its TripItems.
 * No React, no store writes, no network: days, classes, conflicts, budget, replanning, exports.
 *
 * Honesty rules live here too: certainty is never upgraded by the app (an item that still depends
 * on a booking or a medical clearance never reads "confirmado"), totals say what is missing, and
 * replanning only suggests.
 */
import type {
  DateKey,
  Expense,
  TimeHM,
  Trip,
  TripBooking,
  TripCertainty,
  TripChecklistKind,
  TripCurrency,
  TripExpedition,
  TripItem,
} from '@/data/types'
import { addDays, diffDays, hmToMinutes, minutesToHM, weekday } from '@/lib/date'
import { wallTimeToInstant } from '@/integrations/tz'
import { escapeText, foldLine } from '@/integrations/ics'
import { toCSV } from '@/features/settings/csv'

// ─── Certainty & booking ────────────────────────────────────────────────────

export const CERTAINTY_META: Record<TripCertainty, { label: string; short: string; cls: string }> = {
  confirmado: { label: 'Confirmado', short: 'CONFIRMADO', cls: 'bg-sage-soft text-[color-mix(in_oklab,var(--sage)_70%,var(--ink))]' },
  estimado: { label: 'Estimado', short: 'ESTIMADO', cls: 'bg-surface-2 text-ink-2' },
  clima: { label: 'Depende do clima', short: 'DEPENDE DO CLIMA', cls: 'bg-ocean-soft text-[color-mix(in_oklab,var(--ocean)_72%,var(--ink))]' },
  pendente: { label: 'Pendente', short: 'PENDENTE', cls: 'bg-sand-soft text-[color-mix(in_oklab,var(--sand)_62%,var(--ink))]' },
}
export const CERTAINTY_ORDER: TripCertainty[] = ['confirmado', 'estimado', 'clima', 'pendente']

export const BOOKING_META: Record<TripBooking, { label: string }> = {
  nao_pesquisado: { label: 'Não pesquisado' },
  cotacao_solicitada: { label: 'Cotação solicitada' },
  aguardando: { label: 'Aguardando confirmação' },
  confirmado: { label: 'Confirmado' },
  pago: { label: 'Pago' },
  concluido: { label: 'Concluído' },
  cancelado: { label: 'Cancelado' },
}
export const BOOKING_ORDER: TripBooking[] = ['nao_pesquisado', 'cotacao_solicitada', 'aguardando', 'confirmado', 'pago', 'concluido', 'cancelado']
export const PENDING_BOOKINGS: TripBooking[] = ['nao_pesquisado', 'cotacao_solicitada', 'aguardando']

/** Booking state as stored, or read from the older fields when they say enough. */
export function bookingOf(i: TripItem): TripBooking | undefined {
  if (i.booking) return i.booking
  if (i.status === 'cancelado') return 'cancelado'
  if (i.status === 'feito') return 'concluido'
  if (i.status === 'confirmado') return i.paymentStatus === 'pago' ? 'pago' : 'confirmado'
  return undefined
}

/** Picking a booking state keeps `status`/`paymentStatus` in step, so Home, Agenda and Revisar agree. */
export function bookingPatch(b: TripBooking): Partial<TripItem> {
  const status: TripItem['status'] = b === 'cancelado' ? 'cancelado' : b === 'concluido' ? 'feito' : b === 'confirmado' || b === 'pago' ? 'confirmado' : 'a_confirmar'
  return b === 'pago' ? { booking: b, status, paymentStatus: 'pago' } : { booking: b, status }
}

/**
 * What the screen says about how sure an item is. Stored certainty first; never "confirmado" while it
 * still waits for a reservation or a medical clearance.
 */
export function certaintyOf(i: TripItem): TripCertainty {
  const base: TripCertainty = i.certainty ?? (i.status === 'confirmado' || i.status === 'feito' ? 'confirmado' : 'pendente')
  if (base !== 'confirmado') return base
  if (i.clearance === 'pendente' || i.clearance === 'nao_liberada') return 'pendente'
  const b = bookingOf(i)
  if (b && PENDING_BOOKINGS.includes(b)) return 'pendente'
  return 'confirmado'
}

export const isActive = (i: TripItem) => i.status !== 'cancelado'
const isOpen = (i: TripItem) => i.status !== 'cancelado' && i.status !== 'feito'

// ─── Local clock ────────────────────────────────────────────────────────────

const zoneFmt = new Map<string, Intl.DateTimeFormat>()
/** Date and time right now where the trip happens (activities are stored in that local time). */
export function localNow(timeZone: string, now: Date = new Date()): { date: DateKey; time: TimeHM; minutes: number } {
  let f = zoneFmt.get(timeZone)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    } catch {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    }
    zoneFmt.set(timeZone, f)
  }
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(now)) p[part.type] = part.value
  const time = `${p.hour === '24' ? '00' : p.hour}:${p.minute}`
  return { date: `${p.year}-${p.month}-${p.day}`, time, minutes: hmToMinutes(time) }
}

// ─── Days, classes and busy windows ─────────────────────────────────────────

export function tripDays(trip: Pick<Trip, 'startDate' | 'endDate'>): DateKey[] {
  if (!trip.startDate) return []
  const end = trip.endDate ?? trip.startDate
  const out: DateKey[] = []
  for (let d = trip.startDate; d <= end && out.length < 120; d = addDays(d, 1)) out.push(d)
  return out
}

export interface ClassBlock {
  start: TimeHM
  end: TimeHM
}

export function classOn(exp: TripExpedition | undefined, date: DateKey): ClassBlock | undefined {
  const s = exp?.school
  if (!s || date < s.from || date > s.until) return undefined
  const d = s.days.find((x) => x.weekday === weekday(date))
  return d ? { start: d.start, end: d.end } : undefined
}

/** Items that touch a day (multi-day items on every day of their span). */
export function itemsOnDay(items: TripItem[], date: DateKey): TripItem[] {
  return items
    .filter((i) => i.date && i.date <= date && (i.endDate ?? i.date) >= date)
    .sort((a, b) => (startOf(a, date) ?? '99').localeCompare(startOf(b, date) ?? '99') || a.order - b.order)
}

const startOf = (i: TripItem, date: DateKey) => (i.date === date ? i.leaveTime ?? i.time : i.date && i.date < date ? '00:00' : undefined)

/**
 * The minutes an item keeps her busy on a day: from leaving (or start) to return (or end).
 * Only timed items have one. A start without an end is a single moment.
 */
export function busyWindow(i: TripItem, date: DateKey): { start: number; end: number } | undefined {
  if (!i.date || !i.time) return undefined
  const last = i.endDate ?? i.date
  if (date < i.date || date > last) return undefined
  const s = date === i.date ? hmToMinutes(i.leaveTime ?? i.time) : 0
  const endHM = i.returnTime ?? i.endTime
  let e: number
  if (date !== last) e = 24 * 60
  else if (endHM) e = hmToMinutes(endHM)
  else e = i.date === last ? s : 24 * 60
  if (e < s && date === i.date && date === last) e = 24 * 60 // ends after midnight
  return { start: s, end: e }
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start === a.end ? a.start >= b.start && a.start < b.end : b.start === b.end ? b.start >= a.start && b.start < a.end : a.start < b.end && b.start < a.end

const classWindow = (c: ClassBlock) => ({ start: hmToMinutes(c.start), end: hmToMinutes(c.end) })

const isFlight = (i: TripItem) => i.section === 'voo' || i.checklistKind === 'voo'

// ─── School ─────────────────────────────────────────────────────────────────

export interface SchoolDay {
  date: DateKey
  block: ClassBlock
  impact: 'nenhum' | 'parcial' | 'dia'
  madeUp: boolean
  /** Items that declared an impact on this class day. */
  absences: TripItem[]
  /** Timed items over class hours that did not declare an impact. */
  conflicts: TripItem[]
}

export function schoolDays(trip: Trip, items: TripItem[]): SchoolDay[] {
  const exp = trip.expedition
  if (!exp?.school) return []
  const out: SchoolDay[] = []
  for (let d = exp.school.from; d <= exp.school.until && out.length < 200; d = addDays(d, 1)) {
    const block = classOn(exp, d)
    if (!block) continue
    const day = itemsOnDay(items.filter(isActive), d)
    const absences = day.filter((i) => i.schoolImpact)
    const impact = absences.some((i) => i.schoolImpact === 'dia') ? 'dia' : absences.length ? 'parcial' : 'nenhum'
    const cw = classWindow(block)
    const conflicts = day.filter((i) => !i.schoolImpact && !isFlight(i) && (() => {
      const w = busyWindow(i, d)
      return !!w && overlaps(w, cw)
    })())
    out.push({ date: d, block, impact, madeUp: absences.length > 0 && absences.every((i) => i.schoolMadeUp), absences, conflicts })
  }
  return out
}

export interface SchoolSummary {
  total: number
  preserved: number
  partial: number
  lost: number
  madeUp: number
  /** Absences that still depend on something (booking, weather, clearance). */
  uncertain: number
}

export function schoolSummary(days: SchoolDay[]): SchoolSummary {
  const s: SchoolSummary = { total: days.length, preserved: 0, partial: 0, lost: 0, madeUp: 0, uncertain: 0 }
  for (const d of days) {
    if (d.impact === 'nenhum') s.preserved++
    else if (d.madeUp) s.madeUp++
    else if (d.impact === 'dia') s.lost++
    else s.partial++
    if (d.impact !== 'nenhum' && d.absences.some((i) => certaintyOf(i) !== 'confirmado')) s.uncertain++
  }
  return s
}

/** Warning before booking something: the class it would cross (date + hours), if any. */
export function classClash(trip: Trip, draft: Partial<Pick<TripItem, 'date' | 'endDate' | 'time' | 'endTime' | 'leaveTime' | 'returnTime' | 'schoolImpact' | 'section'>>): { date: DateKey; block: ClassBlock } | undefined {
  if (!draft.date || draft.schoolImpact || draft.section === 'voo') return undefined
  const fake = { ...draft, id: '_', tripId: trip.id, title: '', status: 'a_fazer', order: 0, createdAt: '', updatedAt: '' } as TripItem
  for (let d = draft.date; d <= (draft.endDate ?? draft.date); d = addDays(d, 1)) {
    const block = classOn(trip.expedition, d)
    const w = busyWindow(fake, d)
    if (block && w && overlaps(w, classWindow(block))) return { date: d, block }
  }
  return undefined
}

// ─── Conflicts & pendências ─────────────────────────────────────────────────

export type ConflictKind = 'aula' | 'sobreposicao' | 'voo' | 'mergulho_voo'

export interface Conflict {
  key: string
  kind: ConflictKind
  date: DateKey
  items: TripItem[]
  text: string
}

/** Hours without flying after a recreational dive (DAN general guidance; the instructor has the last word). */
export const NO_FLY_AFTER_DIVE_HOURS = 18

export function findConflicts(trip: Trip, items: TripItem[]): Conflict[] {
  const out: Conflict[] = []
  const active = items.filter(isActive)
  for (const d of schoolDays(trip, items)) {
    for (const i of d.conflicts) out.push({ key: `aula:${i.id}:${d.date}`, kind: 'aula', date: d.date, items: [i], text: `${i.title} cruza a aula (${d.block.start}–${d.block.end}) e não diz o que acontece com ela.` })
  }
  const days = new Set(active.flatMap((i) => (i.date ? spanDays(i) : [])))
  for (const date of [...days].sort()) {
    const timed = itemsOnDay(active, date)
      .filter((i) => i.section !== 'hospedagem')
      .map((i) => ({ i, w: busyWindow(i, date) }))
      .filter((x): x is { i: TripItem; w: { start: number; end: number } } => !!x.w)
    for (let a = 0; a < timed.length; a++) {
      for (let b = a + 1; b < timed.length; b++) {
        const A = timed[a]
        const B = timed[b]
        // A multi-day item (safari) and something on its own days, or two items at the same time.
        if (!overlaps(A.w, B.w)) continue
        if (A.w.start === A.w.end && B.w.start === B.w.end && A.w.start !== B.w.start) continue
        const flight = isFlight(A.i) ? A.i : isFlight(B.i) ? B.i : undefined
        const other = flight === A.i ? B.i : A.i
        out.push(
          flight
            ? { key: `voo:${A.i.id}:${B.i.id}:${date}`, kind: 'voo', date, items: [other, flight], text: `${other.title} encosta no ${flight.title}.` }
            : { key: `sob:${A.i.id}:${B.i.id}:${date}`, kind: 'sobreposicao', date, items: [A.i, B.i], text: `${A.i.title} e ${B.i.title} no mesmo horário.` },
        )
      }
    }
  }
  // Diving then flying too soon.
  const flights = active.filter((i) => isFlight(i) && i.date && i.time)
  for (const dive of active.filter((i) => i.checklistKind === 'scuba' && i.date)) {
    const diveEnd = absMinutes(dive.endDate ?? dive.date!, dive.returnTime ?? dive.endTime ?? dive.time ?? '23:59')
    for (const f of flights) {
      const gap = absMinutes(f.date!, f.time!) - diveEnd
      if (gap >= 0 && gap < NO_FLY_AFTER_DIVE_HOURS * 60) {
        out.push({ key: `dive:${dive.id}:${f.id}`, kind: 'mergulho_voo', date: f.date!, items: [dive, f], text: `${f.title} sai menos de ${NO_FLY_AFTER_DIVE_HOURS} h depois do mergulho.` })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

const absMinutes = (date: DateKey, time: TimeHM) => diffDays('2026-01-01', date) * 1440 + hmToMinutes(time)

function spanDays(i: TripItem): DateKey[] {
  const out: DateKey[] = []
  for (let d = i.date!; d <= (i.endDate ?? i.date!) && out.length < 60; d = addDays(d, 1)) out.push(d)
  return out
}

const RESERVABLE: TripItem['section'][] = ['voo', 'hospedagem', 'transporte', 'reserva']

export interface Pendencies {
  conflicts: Conflict[]
  weather: TripItem[]
  clearance: TripItem[]
  bookings: TripItem[]
  payments: TripItem[]
  pickups: TripItem[]
  /** Extras not decided yet (shown apart, never as pending work). */
  extras: TripItem[]
  total: number
}

/** The executive panel: what still needs her, from today on (past days drop off). */
export function pendencies(trip: Trip, items: TripItem[], today: DateKey): Pendencies {
  const over = !!trip.endDate && today > trip.endDate
  const ahead = items.filter((i) => isOpen(i) && (i.date ? (i.endDate ?? i.date) >= today : !over))
  const base = ahead.filter((i) => !i.optional)
  const conflicts = findConflicts(trip, items).filter((c) => c.date >= today)
  const weather = base.filter((i) => certaintyOf(i) === 'clima')
  const clearance = ahead.filter((i) => i.clearance === 'pendente' || i.clearance === 'nao_liberada')
  const bookings = base.filter((i) => {
    const b = bookingOf(i)
    if (b) return PENDING_BOOKINGS.includes(b)
    return i.status === 'a_confirmar' && RESERVABLE.includes(i.section)
  })
  const payments = base.filter((i) => {
    const b = bookingOf(i)
    if (b !== 'confirmado') return false
    if (i.paymentStatus === 'pago' || i.paymentStatus === 'nao_se_aplica') return false
    return i.paymentStatus === 'pendente' || ((i.quotedCents ?? i.estimatedCents) != null && i.paidCents == null)
  })
  const pickups = ahead.filter((i) => i.needsPickup && !i.pickupConfirmed)
  const extras = ahead.filter((i) => i.optional)
  return {
    conflicts,
    weather,
    clearance,
    bookings,
    payments,
    pickups,
    extras,
    total: conflicts.length + weather.length + clearance.length + bookings.length + payments.length + pickups.length,
  }
}

// ─── Budget ─────────────────────────────────────────────────────────────────

/** Converts between the trip currency and BRL with her rate. Undefined when there is no rate. */
export function convert(cents: number, from: TripCurrency, to: TripCurrency, exp: Pick<TripExpedition, 'currency' | 'rateToBRL'>): number | undefined {
  if (from === to) return cents
  const r = exp.rateToBRL
  if (!r || r <= 0) return undefined
  if (from === exp.currency && to === 'BRL') return Math.round(cents * r)
  if (from === 'BRL' && to === exp.currency) return Math.round(cents / r)
  return undefined
}

export interface ExpeditionBudget {
  currency: TripCurrency
  rateToBRL?: number
  marginPct: number
  estimated: number
  quoted: number
  paid: number
  uber: number
  /** Best known value per item: pago → cotado → estimado. */
  projected: number
  /** (projected + uber) with the margin. */
  totalWithMargin: number
  /** The extras, if she did all of them (best known values; uber included). */
  extras: number
  /** Base items on the calendar without any value yet. */
  withoutValue: TripItem[]
  /** Values in another currency that could not be converted (no rate), in that currency. */
  unconverted: number
  /** Real expenses she logged (BRL, from Dinheiro) for this trip. */
  realBRL: number
  realInTripCurrency?: number
}

const bestOf = (i: TripItem) => i.paidCents ?? i.quotedCents ?? i.estimatedCents
const COSTLY: TripItem['section'][] = ['voo', 'hospedagem', 'transporte', 'reserva', 'roteiro', 'esporte', 'quero_ir', 'comida']

export function expeditionBudget(trip: Trip, items: TripItem[], expenses: Expense[] = []): ExpeditionBudget | undefined {
  const exp = trip.expedition
  if (!exp) return undefined
  const cur = exp.currency
  const b: ExpeditionBudget = { currency: cur, rateToBRL: exp.rateToBRL, marginPct: exp.marginPct, estimated: 0, quoted: 0, paid: 0, uber: 0, projected: 0, totalWithMargin: 0, extras: 0, withoutValue: [], unconverted: 0, realBRL: 0 }
  const add = (cents: number | undefined, from: TripCurrency) => (cents == null ? 0 : convert(cents, from, cur, exp) ?? 0)
  for (const i of items) {
    if (!isActive(i)) continue
    const from = i.currency ?? cur
    if (convert(1, from, cur, exp) == null) {
      // Another currency and no rate yet: kept apart, in its own currency, never guessed.
      b.unconverted += (bestOf(i) ?? 0) + (i.uberCents ?? 0)
      continue
    }
    if (i.optional) {
      b.extras += add(bestOf(i), from) + add(i.uberCents, from)
      continue
    }
    b.estimated += add(i.estimatedCents, from)
    b.quoted += add(i.quotedCents, from)
    b.paid += add(i.paidCents, from)
    b.uber += add(i.uberCents, from)
    b.projected += add(bestOf(i), from)
    if (bestOf(i) == null && i.date && COSTLY.includes(i.section) && i.status !== 'feito') b.withoutValue.push(i)
  }
  b.totalWithMargin = withMargin(b.projected + b.uber, exp.marginPct)
  b.realBRL = expenses.filter((e) => e.tripId === trip.id && e.type !== 'income' && e.status === 'paid').reduce((s, e) => s + e.amountCents, 0)
  b.realInTripCurrency = convert(b.realBRL, 'BRL', cur, exp)
  return b
}

export const withMargin = (cents: number, pct: number) => Math.round(cents * (1 + pct / 100))

/** What a day costs (best known values + uber), in the trip currency. */
export function dayCost(trip: Trip, items: TripItem[], date: DateKey): { cents: number; uber: number; missing: number } {
  const exp = trip.expedition
  const out = { cents: 0, uber: 0, missing: 0 }
  if (!exp) return out
  for (const i of items) {
    if (!isActive(i) || i.date !== date || i.optional) continue
    const from = i.currency ?? exp.currency
    const best = bestOf(i)
    if (best != null) out.cents += convert(best, from, exp.currency, exp) ?? 0
    else if (COSTLY.includes(i.section) && i.section !== 'hospedagem') out.missing++
    if (i.uberCents != null) out.uber += convert(i.uberCents, from, exp.currency, exp) ?? 0
  }
  return out
}

const zar = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
/** "ZAR 4.000" / "R$ 1.240" (whole units: these are plans, not receipts). */
export function formatMoney(cents: number, currency: TripCurrency): string {
  return (currency === 'ZAR' ? zar : brl).format(Math.round(cents / 100)).replace(/\s/g, ' ')
}

// ─── Replanning ─────────────────────────────────────────────────────────────

export interface ReplanSuggestion {
  item: TripItem
  /** The free window it would go into. */
  window: { date: DateKey; start: TimeHM; end: TimeHM }
  /** 'cabe' when its duration is known and fits; otherwise she checks the duration. */
  fit: 'cabe' | 'duracao_a_confirmar'
  why: string
}

export const WEATHER_REASONS: NonNullable<TripItem['cancelReason']>[] = ['vento', 'chuva', 'mar']
export const CANCEL_REASON_LABEL: Record<NonNullable<TripItem['cancelReason']>, string> = { vento: 'vento', chuva: 'chuva', mar: 'mar', outro: 'outro motivo' }

/** The free stretch left on that day once classes, flights and other plans are taken out. */
export function freeWindow(trip: Trip, items: TripItem[], cancelled: TripItem): { date: DateKey; start: number; end: number } | undefined {
  const date = cancelled.date
  if (!date) return undefined
  const s = hmToMinutes(cancelled.leaveTime ?? cancelled.time ?? '09:00')
  const endHM = cancelled.returnTime ?? cancelled.endTime
  const e = endHM ? hmToMinutes(endHM) : s + 180
  if (e <= s) return undefined
  const busy: { start: number; end: number }[] = []
  const block = classOn(trip.expedition, date)
  if (block) busy.push(classWindow(block))
  for (const i of itemsOnDay(items.filter(isActive), date)) {
    if (i.id === cancelled.id || i.section === 'hospedagem') continue
    const w = busyWindow(i, date)
    if (!w) continue
    // Keep a margin before a flight (getting to the airport); a moment item blocks a minimal slot.
    busy.push(isFlight(i) ? { start: w.start - 180, end: 24 * 60 } : { start: w.start, end: Math.max(w.end, w.start + 30) })
  }
  // Longest gap inside [s, e] not covered by any busy block.
  const cuts = busy.filter((b) => b.end > s && b.start < e).sort((a, b) => a.start - b.start)
  let best: { start: number; end: number } | undefined
  let cursor = s
  for (const c of cuts) {
    if (c.start > cursor && (!best || c.start - cursor > best.end - best.start)) best = { start: cursor, end: Math.min(c.start, e) }
    cursor = Math.max(cursor, c.end)
  }
  if (cursor < e && (!best || e - cursor > best.end - best.start)) best = { start: cursor, end: e }
  return best && best.end - best.start >= 60 ? { date, ...best } : undefined
}

/**
 * Deterministic swap ideas after a cancellation: flexible or optional items of the same area that are not
 * weather-dependent, not tied to a confirmed booking on another day, and fit the free window without crossing
 * classes or flights. Suggestions only — nothing is moved here.
 */
export function replanSuggestions(trip: Trip, items: TripItem[], cancelled: TripItem, today?: DateKey, limit = 4): ReplanSuggestion[] {
  const win = freeWindow(trip, items, cancelled)
  if (!win) return []
  const length = win.end - win.start
  const rain = cancelled.cancelReason === 'chuva'
  const out: (ReplanSuggestion & { rank: number })[] = []
  for (const i of items) {
    if (i.id === cancelled.id || !isOpen(i) || !(i.flexible || i.optional)) continue
    if (i.date === win.date) continue
    if (today && i.date && (i.endDate ?? i.date) < today) continue
    if (i.endDate && i.endDate !== i.date) continue
    if ((i.group ?? '') !== (cancelled.group ?? '')) continue
    if (certaintyOf(i) === 'clima') continue
    const b = bookingOf(i)
    if (b === 'confirmado' || b === 'pago') continue
    if (i.clearance === 'pendente' || i.clearance === 'nao_liberada') continue
    const dur = i.time && (i.endTime ?? i.returnTime) ? hmToMinutes((i.endTime ?? i.returnTime)!) - hmToMinutes(i.leaveTime ?? i.time) : undefined
    if (dur != null && (dur <= 0 || dur > length)) continue
    const fit = dur != null ? 'cabe' : 'duracao_a_confirmar'
    const why = [
      dur != null ? `cabe em ${Math.round(dur / 60 * 10) / 10} h` : 'confira a duração',
      rain && i.indoor ? 'lugar coberto' : undefined,
      i.optional ? 'extra' : i.date ? 'trocaria de dia' : undefined,
    ]
      .filter(Boolean)
      .join(' · ')
    const rank = (fit === 'cabe' ? 0 : 2) + (rain && !i.indoor ? 1 : 0) + (i.optional ? 0.5 : 0)
    out.push({ item: i, window: { date: win.date, start: minutesToHM(win.start), end: minutesToHM(win.end) }, fit, why, rank })
  }
  return out
    .sort((a, b) => a.rank - b.rank || a.item.order - b.item.order)
    .slice(0, limit)
    .map(({ rank: _rank, ...s }) => s)
}

// ─── Checklists ─────────────────────────────────────────────────────────────

export const CHECKLIST_LABEL: Record<TripChecklistKind, { label: string; emoji: string }> = {
  trilha: { label: 'Trilha', emoji: '🥾' },
  corrida: { label: 'Corrida', emoji: '🏃‍♀️' },
  natacao: { label: 'Natação', emoji: '🏊‍♀️' },
  surf: { label: 'Surf', emoji: '🏄‍♀️' },
  bike: { label: 'Bike', emoji: '🚴‍♀️' },
  scuba: { label: 'Mergulho', emoji: '🤿' },
  safari: { label: 'Safári', emoji: '🦁' },
  voo: { label: 'Voo', emoji: '✈️' },
  voluntariado: { label: 'Voluntariado', emoji: '🤝' },
}

export const CHECKLISTS: Record<TripChecklistKind, string[]> = {
  trilha: ['Água', 'Lanterna de cabeça', 'Corta-vento', 'Tênis de trilha', 'Protetor solar', 'Lanche', 'Celular carregado', 'Avisar alguém do horário de volta', 'Descer em grupo, antes de escurecer'],
  corrida: ['Tênis', 'Relógio carregado', 'Água', 'Celular', 'Protetor solar', 'Roupa visível', 'Rota com movimento, de dia'],
  natacao: ['Maiô', 'Touca', 'Óculos', 'Toalha', 'Chinelo', 'Roupa seca', 'Protetor solar'],
  surf: ['Long john', 'Protetor solar resistente à água', 'Toalha ou poncho', 'Roupa seca', 'Água', 'Aula ou aluguel de prancha confirmado'],
  bike: ['Capacete', 'Luvas', 'Garrafinhas', 'Óculos', 'Câmara e kit de reparo', 'Lanche', 'Protetor solar', 'Celular carregado', 'Rota baixada offline'],
  scuba: ['Maiô', 'Toalha', 'Questionário médico preenchido', 'Documento', 'Agasalho para depois', `Nada de voo nas ${NO_FLY_AFTER_DIVE_HOURS} h seguintes`],
  safari: ['Roupas em tons neutros', 'Casaco para o game drive cedo', 'Chapéu', 'Binóculo', 'Protetor solar', 'Repelente', 'Power bank', 'Documento', 'Dinheiro para gorjetas'],
  voo: ['Passaporte', 'Cartão de embarque', 'Power bank na bagagem de mão', 'Garrafa vazia', 'Casaco', 'Remédios na bagagem de mão', 'Horário de saída para o aeroporto'],
  voluntariado: ['Projeto guiado pela comunidade (confirmado)', 'Regras de proteção infantil lidas', 'Sem fotos de crianças sem autorização', 'Roupa discreta', 'Documento', 'Transporte de ida e volta combinado'],
}

export function checklistOf(i: TripItem): { text: string; done: boolean }[] {
  if (!i.checklistKind) return []
  const done = new Set(i.checked ?? [])
  return CHECKLISTS[i.checklistKind].map((text) => ({ text, done: done.has(text) }))
}

export function toggleChecked(i: TripItem, text: string): string[] {
  const cur = i.checked ?? []
  return cur.includes(text) ? cur.filter((x) => x !== text) : [...cur, text]
}

// ─── Next departure / today ─────────────────────────────────────────────────

export interface Departure {
  item: TripItem
  date: DateKey
  at: TimeHM
  /** Minutes from now (local clock). */
  inMinutes: number
}

/** The next time she has to leave (leave time, else start), today or the next days. */
export function nextDeparture(items: TripItem[], now: { date: DateKey; minutes: number }, horizonDays = 3): Departure | undefined {
  for (let k = 0; k <= horizonDays; k++) {
    const date = addDays(now.date, k)
    const list = items
      .filter((i) => isOpen(i) && i.date === date && (i.leaveTime ?? i.time) && i.section !== 'hospedagem')
      .map((i) => ({ i, at: (i.leaveTime ?? i.time)! }))
      .filter((x) => k > 0 || hmToMinutes(x.at) >= now.minutes)
      .sort((a, b) => a.at.localeCompare(b.at))
    if (list[0]) return { item: list[0].i, date, at: list[0].at, inMinutes: k * 1440 + hmToMinutes(list[0].at) - now.minutes }
  }
  return undefined
}

// ─── Maps ───────────────────────────────────────────────────────────────────

/** Google Maps directions link (no API, opens the app on the phone). */
export function directionsUrl(destination: string, origin?: string): string {
  const q = new URLSearchParams({ api: '1', destination })
  if (origin) q.set('origin', origin)
  return `https://www.google.com/maps/dir/?${q.toString()}`
}

// ─── Exports ────────────────────────────────────────────────────────────────

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const dateStamp = (k: DateKey) => k.replace(/-/g, '')

function instant(date: DateKey, time: TimeHM, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return wallTimeToInstant(y, m, d, h, mi, 0, tz)
}

/** Calendar file of the itinerary (+ the class days that stay), in the activities' local time. */
export function expeditionICS(trip: Trip, items: TripItem[], now: Date = new Date()): string {
  const tz = trip.expedition?.timeZone ?? 'America/Sao_Paulo'
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MARINA OS//Expedicao//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(trip.name)}`]
  const dtstamp = stamp(now)
  for (const i of items) {
    if (!isActive(i) || !i.date) continue
    const c = CERTAINTY_META[certaintyOf(i)].short
    lines.push('BEGIN:VEVENT', `UID:${i.id}@marina-os`, `DTSTAMP:${dtstamp}`)
    if (i.time) {
      lines.push(`DTSTART:${stamp(instant(i.date, i.time, tz))}`)
      const end = i.endTime ?? i.returnTime
      if (end) lines.push(`DTEND:${stamp(instant(i.endDate ?? i.date, end, tz))}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(i.date)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(i.endDate ?? i.date, 1))}`)
    }
    lines.push(`SUMMARY:${escapeText(`${i.title} [${c}]`)}`)
    if (i.address) lines.push(`LOCATION:${escapeText(i.address)}`)
    const desc = [i.notes, i.pickup && `Pickup: ${i.pickup}`, i.planB && `Plano B: ${i.planB}`, i.contact && `Contato: ${i.contact}`].filter(Boolean).join('\n')
    if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`)
    if (i.url) lines.push(`URL:${i.url}`)
    lines.push('END:VEVENT')
  }
  for (const d of schoolDays(trip, items)) {
    if (d.impact === 'dia') continue
    const s = trip.expedition!.school!
    lines.push(
      'BEGIN:VEVENT',
      `UID:aula-${d.date}@marina-os`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(instant(d.date, d.block.start, tz))}`,
      `DTEND:${stamp(instant(d.date, d.block.end, tz))}`,
      `SUMMARY:${escapeText(`Aula — ${s.name}${d.impact === 'parcial' ? ' (parcial)' : ''}`)}`,
    )
    if (s.address) lines.push(`LOCATION:${escapeText(s.address)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

const IMPACT_LABEL = { parcial: 'parte do dia', dia: 'dia inteiro' } as const
const CLEARANCE_LABEL = { pendente: 'pendente', liberada: 'liberada', nao_liberada: 'não liberada' } as const

export function expeditionCSV(trip: Trip, items: TripItem[]): string {
  const cur = trip.expedition?.currency ?? 'BRL'
  const money = (v?: number) => (v == null ? '' : (v / 100).toFixed(2).replace('.', ','))
  const headers = ['Data', 'Até', 'Início', 'Fim', 'Despertar', 'Preparo', 'Saída', 'Retorno', 'Título', 'Grupo', 'Certeza', 'Reserva', 'Status', 'Pagamento', 'Extra', 'Endereço', 'Rota / transporte', 'Deslocamento (min)', 'Moeda', 'Estimado', 'Cotado', 'Pago', 'Uber', 'Fornecedor', 'Contato', 'Voucher', 'Cancelamento', 'Pickup', 'Risco', 'Plano B', 'Escola', 'Liberação médica', 'Notas']
  const rows = [...items]
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order)
    .map((i) => [
      i.date,
      i.endDate,
      i.time,
      i.endTime,
      i.wakeTime,
      i.prepTime,
      i.leaveTime,
      i.returnTime,
      i.title,
      i.group,
      CERTAINTY_META[certaintyOf(i)].label,
      bookingOf(i) ? BOOKING_META[bookingOf(i)!].label : '',
      i.status,
      i.paymentStatus,
      i.optional ? 'sim' : '',
      i.address,
      i.route,
      i.travelMinutes,
      i.currency ?? cur,
      money(i.estimatedCents),
      money(i.quotedCents),
      money(i.paidCents),
      money(i.uberCents),
      i.supplier,
      i.contact,
      i.voucherUrl,
      i.cancellationPolicy,
      i.pickup,
      i.risk,
      i.planB,
      i.schoolImpact ? IMPACT_LABEL[i.schoolImpact] : '',
      i.clearance ? CLEARANCE_LABEL[i.clearance] : '',
      i.notes,
    ])
  return toCSV(headers, rows)
}

/** Plain text itinerary to share with the trusted contact. */
export function itineraryText(trip: Trip, items: TripItem[], from?: DateKey): string {
  const exp = trip.expedition
  const out: string[] = [`${trip.flag} ${trip.name}`]
  if (exp?.residence) out.push(`Base: ${exp.residence.name} — ${exp.residence.address}`)
  if (exp?.school) out.push(`Escola: ${exp.school.name}${exp.school.address ? ` — ${exp.school.address}` : ''}`)
  out.push(`Horários no fuso local${exp ? ` (${exp.timeZone})` : ''}.`, '')
  for (const d of tripDays(trip)) {
    if (from && d < from) continue
    const day = itemsOnDay(items.filter(isActive), d).filter((i) => i.date === d || i.section !== 'hospedagem')
    const block = classOn(exp, d)
    if (!day.length && !block) continue
    out.push(`${d.slice(8)}/${d.slice(5, 7)}`)
    if (block) out.push(`  ${block.start}–${block.end} aula`)
    for (const i of day) out.push(`  ${i.date === d && i.time ? `${i.time} ` : ''}${i.title} (${CERTAINTY_META[certaintyOf(i)].label.toLowerCase()})${i.address ? ` — ${i.address}` : ''}`)
  }
  return out.join('\n')
}
