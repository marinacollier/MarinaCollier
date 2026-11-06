/**
 * Expedição · operations (brief operacional 01/11) — pure reads over her data, nothing invented, nothing written:
 *   - daySpend: what a day cost (the bank statement when it covers the day, else the items' paid + Uber);
 *   - toBook: "o que falta reservar?" by urgency P0→P2, with link, value, deadline and what it depends on —
 *     a planned item is never shown as reserved;
 *   - tomorrowChecklist: clothes/equipment by activity, documents, food/water, transport, departure, bookings;
 *   - financialClose: paid (statement + paid items, never twice), committed (reserved, not paid), estimated
 *     (planned/quoted), remaining vs her original budget (a reference, never assumed available), overrun risk
 *     and savings that follow her rules (never cut essential logistics; never count twice).
 */
import type { DateKey, Expense, Occurrence, Trip, TripBookingStatus, TripCurrency, TripItem, Workout } from '@/data/types'
import { addDays } from '@/lib/date'
import { BOOKING_STATUS_META, bookingStatusOf, categoryOf, hasProof, isCommittedStatus, isShopping, ledgerDays, tripLedger } from './command'
import { blockWhen, countsAsTraining, dailyPlan } from './daily'
import { CHECKLISTS, convert, formatMoney, isActive, withMargin } from './logic'

const curOf = (trip: Trip): TripCurrency => trip.expedition?.currency ?? 'BRL'
/** In the trip currency; undefined when it can't be converted (no rate) — never guessed. */
const toTrip = (trip: Trip, cents: number, from: TripCurrency | undefined) => (trip.expedition ? convert(cents, from ?? curOf(trip), curOf(trip), trip.expedition) : cents)
const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2 } as const
const rank = (i: TripItem) => (i.priority ? PRIORITY_RANK[i.priority] : 3)

// ─── Spend of a day ─────────────────────────────────────────────────────────

/** What the day cost, in the trip currency. Statement lines win on the days they cover. Undefined = nothing logged. */
export function daySpend(trip: Trip, items: TripItem[], expenses: Expense[], date: DateKey): { cents: number; source: 'extrato' | 'itens' } | undefined {
  if (ledgerDays(trip, expenses).has(date)) {
    const cents = tripLedger(trip, expenses)
      .filter((e) => e.date === date)
      .reduce((s, e) => s + (toTrip(trip, e.amountCents, (e.currency ?? 'BRL') as TripCurrency) ?? 0), 0)
    return { cents, source: 'extrato' }
  }
  let cents = 0
  let any = false
  for (const i of items) {
    if (i.tripId !== trip.id || i.date !== date || !isActive(i)) continue
    const paid = (i.paidCents ?? 0) + (i.status === 'feito' ? i.uberCents ?? 0 : 0)
    if (!paid) continue
    const v = toTrip(trip, paid, i.currency)
    if (v == null) continue
    cents += v
    any = true
  }
  return any ? { cents, source: 'itens' } : undefined
}

// ─── What is left to book ───────────────────────────────────────────────────

const TO_BOOK: TripBookingStatus[] = ['a_cotar', 'a_reservar', 'aguardando_resposta']
const RESERVABLE: TripItem['section'][] = ['voo', 'hospedagem', 'transporte', 'reserva']

export interface ToBookRow {
  item: TripItem
  status: TripBookingStatus
  /** Quoted, else her reference — never "pago". */
  value?: { cents: number; currency: TripCurrency; kind: 'cotado' | 'referência' }
  deadline?: DateKey
  overdue: boolean
  dependsOn: string[]
}

export interface ToBook {
  rows: ToBookRow[]
  /** She treats them as booked (confirmed) but there is no voucher/code/confirmation: never counted as reserved. */
  noProof: TripItem[]
}

const DEPENDS = /\b(depois|ap[oó]s|vem junto|depende|s[oó] se|sem autoriza|aguardar)\b/i

export function toBook(trip: Trip, items: TripItem[], today: DateKey): ToBook {
  const ahead = (i: TripItem) => !i.date || (i.endDate ?? i.date) >= today
  const mine = items.filter((i) => i.tripId === trip.id && isActive(i) && !i.optional && ahead(i))
  const rows: ToBookRow[] = []
  const noProof: TripItem[] = []
  for (const i of mine) {
    const status = bookingStatusOf(i)
    if (TO_BOOK.includes(status)) {
      const v = i.quotedCents ?? i.estimatedCents
      const dependsOn: string[] = []
      if (i.clearance === 'pendente' || i.clearance === 'nao_liberada') dependsOn.push('liberação médica')
      if (i.certainty === 'clima') dependsOn.push('clima (vento/mar)')
      if (i.nextAction && DEPENDS.test(i.nextAction)) dependsOn.push(i.nextAction)
      rows.push({
        item: i,
        status,
        value: v != null ? { cents: v, currency: i.currency ?? curOf(trip), kind: i.quotedCents != null ? 'cotado' : 'referência' } : undefined,
        deadline: i.deadline,
        overdue: !!i.deadline && i.deadline < today,
        dependsOn,
      })
    } else if (status === 'planejado' && RESERVABLE.includes(i.section) && (i.status === 'confirmado' || i.booking === 'confirmado' || i.booking === 'pago') && !hasProof(i)) {
      noProof.push(i)
    }
  }
  rows.sort((a, b) => rank(a.item) - rank(b.item) || (a.deadline ?? a.item.date ?? '9999').localeCompare(b.deadline ?? b.item.date ?? '9999'))
  return { rows, noProof }
}

// ─── Tomorrow's checklist ───────────────────────────────────────────────────

export interface DayChecklist {
  date: DateKey
  departure?: { at: string; title: string; wake?: string }
  gear: string[]
  documents: string[]
  food: string[]
  transport: string[]
  bookings: string[]
  blocks: string[]
  empty: boolean
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]

export function tomorrowChecklist(trip: Trip, items: TripItem[], workouts: Workout[], occurrences: Occurrence[], today: DateKey): DayChecklist {
  const date = addDays(today, 1)
  const day = items
    .filter((i) => i.tripId === trip.id && isActive(i) && i.status !== 'feito' && i.date === date && !i.optional)
    .sort((a, b) => (a.leaveTime ?? a.time ?? '99').localeCompare(b.leaveTime ?? b.time ?? '99'))
  const out = day.filter((i) => i.section !== 'hospedagem')
  const first = out.find((i) => i.leaveTime ?? i.time)
  const gear: string[] = []
  for (const i of out) {
    if (i.checklistKind) gear.push(...CHECKLISTS[i.checklistKind])
    else if (countsAsTraining(i)) gear.push('Roupa e tênis de treino')
    if (i.outfit) gear.push(`${i.title}: ${i.outfit}`)
  }
  const plan = dailyPlan(trip, items, workouts, occurrences, date)
  const training = plan?.blocks.find((b) => b.kind === 'treino')
  if (training && !training.filledBy && !training.recovery) gear.push('Roupa e tênis de treino')
  const documents = ['Passaporte (ou cópia) e cartão']
  for (const i of day) {
    if (i.voucherUrl) documents.push(`Voucher offline: ${i.title}`)
    else if (isCommittedStatus(bookingStatusOf(i))) documents.push(`Confirmação salva: ${i.title}`)
  }
  const food = ['Garrafa de água']
  for (const i of out) if (countsAsTraining(i) || i.leaveTime || i.returnTime || i.checklistKind) food.push(`Lanche para ${i.title}`)
  const transport: string[] = []
  for (const i of out) {
    if (i.route) transport.push(`${i.title}: ${i.route}`)
    else if (i.pickup) transport.push(`${i.title}: ${i.pickup}`)
    else if (i.address) transport.push(`${i.title}: Uber até ${i.address}`)
    if (i.needsPickup && !i.pickupConfirmed) transport.push(`${i.title}: pickup ainda não confirmado`)
  }
  const bookings = day.map((i) => {
    const s = bookingStatusOf(i)
    const warn = TO_BOOK.includes(s) || (RESERVABLE.includes(i.section) && s === 'planejado') ? ' — ainda não reservado' : ''
    return `${i.title}: ${BOOKING_STATUS_META[s].label}${warn}`
  })
  const blocks = plan ? plan.blocks.filter((b) => b.core).map((b) => `${b.title} · ${blockWhen(b)}`) : []
  return {
    date,
    departure: first ? { at: (first.leaveTime ?? first.time)!, title: first.title, wake: first.wakeTime } : undefined,
    gear: uniq(gear),
    documents: uniq(documents),
    food: uniq(food),
    transport: uniq(transport),
    bookings,
    blocks,
    empty: !day.length,
  }
}

// ─── Financial close ────────────────────────────────────────────────────────

export interface CloseLine {
  item: TripItem
  cents: number
  kind: 'cotado' | 'referência'
}

export type OverrunRisk = 'alto' | 'atencao' | 'ok' | 'sem_orcamento' | 'sem_cotacao'

export interface FinancialClose {
  currency: TripCurrency
  /** Paid so far = statement lines + items paid on days the statement doesn't cover (+ Uber of what she did). */
  paid: number
  paidLedger: number
  paidItems: number
  /** Booked (reserva emitida / reservado with proof / confirmado), not paid yet: quoted, else reference. */
  committed: number
  committedLines: CloseLine[]
  /** Planned / to quote / to book / awaiting an answer: quoted, else reference (+ Uber planned). */
  estimated: number
  estimatedLines: CloseLine[]
  uberEstimated: number
  projected: number
  projectedWithMargin: number
  marginPct: number
  /** Open items that cost money and have no value yet (the total goes up when they get one). */
  withoutValue: TripItem[]
  /** Statement lines in another currency without a rate: kept apart, in their own currency. */
  unconverted: { cents: number; currency: string }[]
  budget?: {
    /** Original budget in the trip currency (her "R30.000" is rand). */
    cents: number
    /** In the trip currency (undefined: no rate to compare). */
    inTrip?: number
    /** budget − paid − committed − estimated (trip currency). */
    remaining?: number
    /** budget − paid. */
    remainingAfterPaid?: number
  }
  risk: OverrunRisk
  savings: string[]
}

const PAID_CATS = new Set(['tours', 'safari', 'treinos', 'transfers', 'hospedagem'])
/** On the calendar and of a kind that is paid for (a booking, or a tour/safari/training category on the itinerary). */
const costsMoney = (i: TripItem) =>
  !!i.date && !isShopping(i) && (RESERVABLE.includes(i.section) || ((i.section === 'roteiro' || i.section === 'quero_ir') && PAID_CATS.has(i.category ?? '') && i.category !== 'hospedagem'))
const ESSENTIAL_SECTIONS: TripItem['section'][] = ['voo', 'hospedagem', 'transporte']
const ESSENTIAL_CATS = new Set(['hospedagem', 'transfers', 'safari'])
/** Flights, stays, transfers, the safari and anything P0: never offered as a saving. */
export const isEssential = (i: TripItem) => ESSENTIAL_SECTIONS.includes(i.section) || ESSENTIAL_CATS.has(categoryOf(i) ?? '') || i.priority === 'P0'

export function financialClose(trip: Trip, items: TripItem[], expenses: Expense[] = []): FinancialClose {
  const cur = curOf(trip)
  const exp = trip.expedition
  const mine = items.filter((i) => i.tripId === trip.id && isActive(i))
  const covered = ledgerDays(trip, expenses)
  const fmtCur = (e: Expense) => (e.currency ?? 'BRL') as TripCurrency

  // Paid: statement lines (truth on their days) + items paid elsewhere. Never both for one day.
  let paidLedger = 0
  const unconv = new Map<string, number>()
  for (const e of tripLedger(trip, expenses)) {
    const v = toTrip(trip, e.amountCents, fmtCur(e))
    if (v == null) unconv.set(fmtCur(e), (unconv.get(fmtCur(e)) ?? 0) + e.amountCents)
    else paidLedger += v
  }
  let paidItems = 0
  for (const i of mine) {
    if (i.date && covered.has(i.date)) continue
    const v = (i.paidCents ?? 0) + (i.status === 'feito' ? i.uberCents ?? 0 : 0)
    if (v) paidItems += toTrip(trip, v, i.currency) ?? 0
  }

  const committedLines: CloseLine[] = []
  const estimatedLines: CloseLine[] = []
  const withoutValue: TripItem[] = []
  let uberEstimated = 0
  for (const i of mine) {
    if (i.optional) continue
    // A day the statement covers already happened: its real money is in the statement.
    if (i.date && covered.has(i.date)) continue
    const s = bookingStatusOf(i)
    if (s === 'concluido' || s === 'cancelado' || s === 'opcional') continue
    if (i.paidCents != null) {
      // Partly paid booking (deposit): what is still owed stays committed. Fully paid: nothing more.
      const total = i.quotedCents ?? i.estimatedCents
      if (isCommittedStatus(s) && i.paymentStatus !== 'pago' && total != null && total > i.paidCents) {
        const cents = toTrip(trip, total - i.paidCents, i.currency)
        if (cents != null) committedLines.push({ item: i, cents, kind: i.quotedCents != null ? 'cotado' : 'referência' })
      }
      continue
    }
    if (i.uberCents != null) uberEstimated += toTrip(trip, i.uberCents, i.currency) ?? 0
    const raw = i.quotedCents ?? i.estimatedCents
    if (raw == null) {
      if (costsMoney(i)) withoutValue.push(i)
      continue
    }
    const cents = toTrip(trip, raw, i.currency)
    if (cents == null) continue
    const line: CloseLine = { item: i, cents, kind: i.quotedCents != null ? 'cotado' : 'referência' }
    if (isCommittedStatus(s)) committedLines.push(line)
    else estimatedLines.push(line)
  }
  const sum = (ls: CloseLine[]) => ls.reduce((t, l) => t + l.cents, 0)
  const paid = paidLedger + paidItems
  const committed = sum(committedLines)
  const estimated = sum(estimatedLines) + uberEstimated
  const projected = paid + committed + estimated
  const marginPct = exp?.marginPct ?? 0
  const projectedWithMargin = withMargin(projected, marginPct)

  let budget: FinancialClose['budget']
  let risk: OverrunRisk = 'sem_orcamento'
  if (exp?.budgetCents != null) {
    const inTrip: number | undefined = exp.budgetCents
    budget = { cents: exp.budgetCents, inTrip }
    if (inTrip == null) risk = 'sem_cotacao'
    else {
      budget.remaining = inTrip - projected
      budget.remainingAfterPaid = inTrip - paid
      risk = projected > inTrip ? 'alto' : projectedWithMargin > inTrip || (withoutValue.length > 0 && projected > inTrip * 0.85) ? 'atencao' : 'ok'
    }
  }

  // Savings from her rules: extras first, then P2 not booked, Uber, shopping — never essential logistics.
  const savings: string[] = []
  const fmt = (c: number) => formatMoney(c, cur)
  const extras = mine
    .filter((i) => i.optional && i.status !== 'feito' && i.paidCents == null)
    .map((i) => ({ i, v: toTrip(trip, i.quotedCents ?? i.estimatedCents ?? 0, i.currency) ?? 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
  if (extras.length) savings.push(`Extras opcionais somam ${fmt(extras.reduce((t, x) => t + x.v, 0))} (${extras.slice(0, 3).map((x) => x.i.title).join(', ')}): são os primeiros a sair.`)
  const p2 = estimatedLines.filter((l) => l.item.priority === 'P2' && !isEssential(l.item))
  if (p2.length) savings.push(`P2 ainda sem reserva: ${p2.map((l) => `${l.item.title} (${fmt(l.cents)})`).join(', ')} — dá para adiar ou cortar.`)
  const uberPaid = tripLedger(trip, expenses).filter((e) => e.tripCategory === 'uber').reduce((t, e) => t + (toTrip(trip, e.amountCents, fmtCur(e)) ?? 0), 0) + mine.filter((i) => i.status === 'feito' && !(i.date && covered.has(i.date))).reduce((t, i) => t + (toTrip(trip, i.uberCents ?? 0, i.currency) ?? 0), 0)
  if (uberPaid > 0) savings.push(`Uber já soma ${fmt(uberPaid)}: agrupar deslocamentos no mesmo dia/região.`)
  const shopping = mine.filter((i) => isShopping(i) && i.status !== 'feito')
  if (shopping.length) savings.push(`Compras e presentes (${shopping.length} em aberto): definir um teto antes de comprar.`)
  savings.push('Logística essencial (voos, hospedagem, transfers, safári e itens P0) fica fora dos cortes.')
  savings.push('Sem contagem dupla: nos dias cobertos pelo extrato, só o extrato conta.')

  return {
    currency: cur,
    paid,
    paidLedger,
    paidItems,
    committed,
    committedLines,
    estimated,
    estimatedLines,
    uberEstimated,
    projected,
    projectedWithMargin,
    marginPct,
    withoutValue,
    unconverted: [...unconv.entries()].map(([currency, cents]) => ({ currency, cents })),
    budget,
    risk,
    savings,
  }
}

export const RISK_LABEL: Record<OverrunRisk, string> = {
  alto: 'Risco alto de estourar',
  atencao: 'Atenção: perto do limite',
  ok: 'Dentro do orçamento (com o que está registrado)',
  sem_orcamento: 'Sem orçamento definido',
  sem_cotacao: 'Sem cotação para comparar com o orçamento em reais',
}
