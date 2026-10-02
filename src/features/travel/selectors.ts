/**
 * Travel (Trip OS) — pure helpers. No React, no store writes: everything here is testable.
 */
import type { DateKey, DB, Expense, ID, NewItem, Trip, TripItem, TripSection } from '@/data/types'
import { addDays, countdownLabel, diffDays, formatShortDate } from '@/lib/date'
import { normalize } from '@/lib/text'

// ─── Sections ───────────────────────────────────────────────────────────────

export type TripTab =
  | 'visao'
  | TripSection
  | 'orcamento'
  | 'gastos'
  | 'links'
  | 'notas'
  | 'emergencia'

export interface TabMeta {
  id: TripTab
  label: string
  emoji: string
  /** True for tabs backed by TripItem records. */
  items: boolean
  /** Items get a checkbox (done/not done) instead of only a status pill. */
  checkable?: boolean
  /** Empty-state copy. */
  empty?: string
  placeholder?: string
}

export const TRIP_TABS: TabMeta[] = [
  { id: 'visao', label: 'Visão geral', emoji: '🗺️', items: false },
  { id: 'antes_de_ir', label: 'Antes de ir', emoji: '✅', items: true, checkable: true, empty: 'Nada pendente antes de ir.', placeholder: 'Ex.: renovar passaporte' },
  { id: 'voo', label: 'Voos', emoji: '✈️', items: true, empty: 'Nenhum voo por aqui ainda.', placeholder: 'Ex.: voo de ida' },
  { id: 'hospedagem', label: 'Hospedagem', emoji: '🛏️', items: true, empty: 'Onde você vai dormir? Sem pressa.', placeholder: 'Ex.: hostel perto da praia' },
  { id: 'transporte', label: 'Transporte', emoji: '🚐', items: true, empty: 'Carro, trem, transfer… quando der.', placeholder: 'Ex.: transfer do aeroporto' },
  { id: 'reserva', label: 'Reservas', emoji: '🎟️', items: true, empty: 'Nenhuma reserva ainda.', placeholder: 'Ex.: passeio de barco' },
  { id: 'roteiro', label: 'Roteiro', emoji: '🧭', items: true, empty: 'O roteiro nasce aos poucos.', placeholder: 'Ex.: dia de praia' },
  { id: 'quero_ir', label: 'Quero ir', emoji: '📍', items: true, empty: 'Lugares que te chamam ficam aqui.', placeholder: 'Ex.: mirante ao pôr do sol' },
  { id: 'comida', label: 'Comida', emoji: '🍽️', items: true, empty: 'Restaurantes, cafés, comidinhas.', placeholder: 'Ex.: café da esquina' },
  { id: 'esporte', label: 'Esportes', emoji: '🏄‍♀️', items: true, empty: 'Treinos e aventuras da viagem.', placeholder: 'Ex.: corrida na orla' },
  { id: 'mala', label: 'Mala', emoji: '🎒', items: true, checkable: true, empty: 'A mala começa vazia mesmo 😉', placeholder: 'Ex.: protetor solar' },
  { id: 'comprar', label: 'Comprar', emoji: '🛍️', items: true, checkable: true, empty: 'Nada pra comprar por enquanto.', placeholder: 'Ex.: adaptador de tomada' },
  { id: 'documento', label: 'Documentos', emoji: '🪪', items: true, empty: 'Passagens, vouchers, seguro…', placeholder: 'Ex.: apólice do seguro' },
  { id: 'orcamento', label: 'Orçamento', emoji: '💰', items: false },
  { id: 'gastos', label: 'Gastos', emoji: '🧾', items: false },
  { id: 'links', label: 'Links', emoji: '🔗', items: false },
  { id: 'notas', label: 'Notas', emoji: '📝', items: false },
  { id: 'emergencia', label: 'Emergência', emoji: '🆘', items: false },
]

export const SECTION_OPTIONS: { value: TripSection; label: string }[] = TRIP_TABS.filter((t) => t.items).map((t) => ({
  value: t.id as TripSection,
  label: `${t.emoji} ${t.label}`,
}))

export function tabMeta(id: TripTab): TabMeta {
  return TRIP_TABS.find((t) => t.id === id) ?? TRIP_TABS[0]
}

export function isCheckable(section: TripSection): boolean {
  return !!tabMeta(section).checkable
}

/** Default status for a new item: to-dos start "a fazer", everything else starts unproven. */
export function defaultStatusFor(section: TripSection): TripItem['status'] {
  return isCheckable(section) ? 'a_fazer' : 'a_confirmar'
}

export const TRIP_STATUS_LABEL: Record<Trip['status'], string> = {
  sonhando: 'sonhando ✨',
  planejando: 'planejando',
  confirmada: 'confirmada',
  em_andamento: 'em viagem',
  concluida: 'concluída',
}

// ─── Status ─────────────────────────────────────────────────────────────────

export type ItemStatus = TripItem['status']

export const STATUS_META: Record<ItemStatus, { label: string; cls: string }> = {
  a_confirmar: { label: 'A confirmar', cls: 'bg-sand-soft text-[color-mix(in_oklab,var(--sand)_62%,var(--ink))]' },
  a_fazer: { label: 'A fazer', cls: 'bg-surface-2 text-ink-2' },
  confirmado: { label: 'Confirmado', cls: 'bg-sage-soft text-[color-mix(in_oklab,var(--sage)_70%,var(--ink))]' },
  feito: { label: 'Feito', cls: 'bg-sage text-bg' },
  cancelado: { label: 'Cancelado', cls: 'bg-surface-2 text-muted line-through' },
}

export const STATUS_ORDER: ItemStatus[] = ['a_confirmar', 'a_fazer', 'confirmado', 'feito', 'cancelado']

export function isItemDone(i: TripItem): boolean {
  return i.status === 'feito'
}

// ─── Trip dates / countdown ─────────────────────────────────────────────────

/** "22 de out." / "22 de out. → 30 de out." / "out/nov 2026" / "sem data ainda". */
export function tripDatesLabel(t: Trip): string {
  if (t.startDate && t.endDate && t.endDate !== t.startDate) return `${formatShortDate(t.startDate)} → ${formatShortDate(t.endDate)}`
  if (t.startDate) return formatShortDate(t.startDate)
  return t.dateLabel || 'sem data ainda'
}

export type TripPhase = 'futura' | 'em_viagem' | 'passada' | 'sem_data'

/** How many days a trip without endDate is considered "happening" after it starts. */
const OPEN_ENDED_DAYS = 7

export function tripPhase(t: Trip, today: DateKey): TripPhase {
  if (t.status === 'concluida') return 'passada'
  if (t.status === 'em_andamento') return 'em_viagem'
  if (!t.startDate) return 'sem_data'
  if (today < t.startDate) return 'futura'
  const end = t.endDate ?? addDays(t.startDate, OPEN_ENDED_DAYS)
  return today <= end ? 'em_viagem' : 'passada'
}

/** Warm countdown copy. Never invents a date for fuzzy trips. */
export function tripCountdown(t: Trip, today: DateKey): string {
  const phase = tripPhase(t, today)
  if (phase === 'sem_data') return t.dateLabel ? 'data a definir' : 'sem data ainda'
  if (phase === 'futura') return countdownLabel(t.startDate!, today)
  if (phase === 'em_viagem') return t.startDate === today ? 'é hoje! ✨' : 'em viagem 🌴'
  return 'já foi 💛'
}

export function daysToTrip(t: Trip, today: DateKey): number | undefined {
  return t.startDate ? diffDays(today, t.startDate) : undefined
}

// ─── Trip lists ─────────────────────────────────────────────────────────────

/**
 * Upcoming trips (not past, not dreams): dated first (soonest first), fuzzy ones after (by order).
 * Trips happening now come first of all.
 */
export function sortUpcoming(trips: Trip[], today: DateKey): Trip[] {
  return trips
    .filter((t) => t.status !== 'sonhando' && tripPhase(t, today) !== 'passada')
    .sort((a, b) => {
      const ad = a.startDate ? 0 : 1
      const bd = b.startDate ? 0 : 1
      if (ad !== bd) return ad - bd
      if (a.startDate && b.startDate && a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate)
      return a.order - b.order
    })
}

export interface TripBuckets {
  next?: Trip
  upcoming: Trip[]
  dreaming: Trip[]
  past: Trip[]
}

export function tripBuckets(trips: Trip[], today: DateKey): TripBuckets {
  const up = sortUpcoming(trips, today)
  return {
    next: up[0],
    upcoming: up.slice(1),
    dreaming: trips.filter((t) => t.status === 'sonhando' && tripPhase(t, today) !== 'passada').sort((a, b) => a.order - b.order),
    past: trips
      .filter((t) => tripPhase(t, today) === 'passada')
      .sort((a, b) => (b.endDate ?? b.startDate ?? '').localeCompare(a.endDate ?? a.startDate ?? '')),
  }
}

// ─── Items ──────────────────────────────────────────────────────────────────

export function itemsOfTrip(items: TripItem[], tripId: ID): TripItem[] {
  return items.filter((i) => i.tripId === tripId).sort((a, b) => a.order - b.order)
}

export function sectionCounts(items: TripItem[]): Partial<Record<TripSection, { total: number; open: number }>> {
  const out: Partial<Record<TripSection, { total: number; open: number }>> = {}
  for (const i of items) {
    if (i.status === 'cancelado') continue
    const c = (out[i.section] ??= { total: 0, open: 0 })
    c.total++
    if (i.status !== 'feito' && i.status !== 'confirmado') c.open++
  }
  return out
}

/** done/total of the "Antes de ir" checklist (cancelled items don't count). */
export function checklistProgress(items: TripItem[]): { done: number; total: number } {
  const list = items.filter((i) => i.section === 'antes_de_ir' && i.status !== 'cancelado')
  return { done: list.filter(isItemDone).length, total: list.length }
}

/** The first open "Antes de ir" item — the next tiny action. */
export function nextChecklistItem(items: TripItem[]): TripItem | undefined {
  return items
    .filter((i) => i.section === 'antes_de_ir' && i.status !== 'feito' && i.status !== 'cancelado')
    .sort((a, b) => a.order - b.order)[0]
}

export interface ItemGroup {
  key: string
  label?: string
  items: TripItem[]
}

/**
 * Group items for display. Roteiro groups by day (dated first, chronological);
 * everything else groups by `group` in order of first appearance, ungrouped first.
 */
export function groupItems(items: TripItem[], section: TripSection): ItemGroup[] {
  const list = items.filter((i) => i.section === section).sort((a, b) => a.order - b.order)
  const map = new Map<string, ItemGroup>()
  const keyOf = (i: TripItem) => (section === 'roteiro' && i.date ? `d:${i.date}` : `g:${i.group ?? ''}`)
  for (const i of list) {
    const k = keyOf(i)
    if (!map.has(k)) map.set(k, { key: k, label: k.startsWith('d:') ? i.date : i.group || undefined, items: [] })
    map.get(k)!.items.push(i)
  }
  const groups = [...map.values()]
  if (section === 'roteiro') {
    for (const g of groups) if (g.key.startsWith('d:')) g.items.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order)
    return groups.sort((a, b) => {
      const ad = a.key.startsWith('d:')
      const bd = b.key.startsWith('d:')
      if (ad !== bd) return ad ? -1 : 1
      return ad ? a.key.localeCompare(b.key) : 0
    })
  }
  return groups.sort((a, b) => (a.key === 'g:' ? -1 : b.key === 'g:' ? 1 : 0))
}

export function groupsOfTrip(items: TripItem[]): string[] {
  const seen: string[] = []
  for (const i of [...items].sort((a, b) => a.order - b.order)) if (i.group && !seen.includes(i.group)) seen.push(i.group)
  return seen
}

// ─── Default "Antes de ir" checklist ────────────────────────────────────────

interface ChecklistTemplate {
  title: string
  status: ItemStatus
  /** Only makes sense abroad. */
  international?: boolean
}

export const DEFAULT_CHECKLIST: ChecklistTemplate[] = [
  { title: 'Passaporte e validade', status: 'a_fazer', international: true },
  { title: 'Visto/requisitos de entrada', status: 'a_confirmar', international: true },
  { title: 'Seguro viagem', status: 'a_fazer' },
  { title: 'Vacinas/certificados', status: 'a_confirmar', international: true },
  { title: 'Avisar banco/cartões', status: 'a_fazer', international: true },
  { title: 'eSIM/chip', status: 'a_fazer', international: true },
  { title: 'Câmbio/cartão internacional', status: 'a_fazer', international: true },
  { title: 'Cópias dos documentos', status: 'a_fazer' },
  { title: 'Reservas offline', status: 'a_fazer' },
  { title: 'Luna: creche/hotel', status: 'a_fazer' },
  { title: 'Mala esportiva', status: 'a_fazer' },
]

/** Brazilian flag = domestic trip: skip passport/visa/câmbio items. */
export function isDomestic(t: Pick<Trip, 'flag'>): boolean {
  return t.flag.trim() === '🇧🇷'
}

/**
 * Items to create for the default checklist. Idempotent: titles already present in the trip's
 * "Antes de ir" section (accent/case-insensitive) are skipped, so tapping twice never duplicates.
 */
export function defaultChecklistItems(trip: Pick<Trip, 'id' | 'flag'>, existing: TripItem[], startOrder = 0): NewItem<'tripItems'>[] {
  const have = new Set(existing.filter((i) => i.tripId === trip.id && i.section === 'antes_de_ir').map((i) => normalize(i.title)))
  const domestic = isDomestic(trip)
  return DEFAULT_CHECKLIST.filter((c) => !(domestic && c.international))
    .filter((c) => !have.has(normalize(c.title)))
    .map((c, i) => ({ tripId: trip.id, section: 'antes_de_ir' as const, title: c.title, status: c.status, order: startOrder + i }))
}

// ─── Money ──────────────────────────────────────────────────────────────────

export function tripExpenses(expenses: Expense[], tripId: ID): Expense[] {
  return expenses
    .filter((e) => e.tripId === tripId)
    .sort((a, b) => (b.date ?? '9999').localeCompare(a.date ?? '9999') || b.createdAt.localeCompare(a.createdAt))
}

export interface BudgetSummary {
  budgetCents?: number
  spentCents: number
  plannedCents: number
  /** budget - spent (negative = above the plan). Undefined without a budget. */
  leftCents?: number
}

export function budgetSummary(trip: Trip, expenses: Expense[]): BudgetSummary {
  const mine = expenses.filter((e) => e.tripId === trip.id)
  const spentCents = mine.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amountCents, 0)
  const plannedCents = mine.filter((e) => e.status === 'planned_purchase').reduce((s, e) => s + e.amountCents, 0)
  return {
    budgetCents: trip.budgetCents,
    spentCents,
    plannedCents,
    leftCents: trip.budgetCents != null ? trip.budgetCents - spentCents : undefined,
  }
}

export function findTrip(db: Pick<DB, 'trips'>, id: ID | undefined): Trip | undefined {
  return id ? db.trips.find((t) => t.id === id) : undefined
}
