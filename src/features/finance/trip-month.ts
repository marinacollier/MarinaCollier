/**
 * Finanças · Viagem: trip statement lines in another currency (ZAR), for the month, in their own currency.
 *
 * - Single source: the same lines the Expedição reads (`tripLedger`: paid, dated, linked to the trip, never
 *   income, never 'cancelled').
 * - Only lines in a currency other than BRL: BRL lines are already in the Finanças totals (no double count).
 * - Never summed into the BRL totals. A BRL equivalent appears only when the trip has a documented
 *   conversion (`expedition.fxRates`) — the latest by date, with its source. Without one: no BRL figure.
 */
import type { DateKey, Expense, Place, Trip, TripBudgetCategory, TripCurrency, TripFxRate } from '@/data/types'
import { endOfMonth, startOfMonth } from '@/lib/date'
import { tripLedger } from '@/features/travel/expedition/command'

export interface TripMonthCategory {
  category: TripBudgetCategory
  cents: number
  count: number
}

export interface TripMonthSpend {
  trip: Trip
  /** "África do Sul": the country she linked to the trip in Lugares; else the trip's name. */
  label: string
  currency: Exclude<TripCurrency, 'BRL'>
  /** Total in the trip currency (cents). */
  cents: number
  count: number
  byCategory: TripMonthCategory[]
  /** Only with a documented rate. */
  brl?: { cents: number; rate: TripFxRate }
}

/** The most recent documented conversion (by date; ties keep the later entry). */
export function latestFxRate(trip: Trip): TripFxRate | undefined {
  const rates = (trip.expedition?.fxRates ?? []).filter((r) => Number.isFinite(r.brlPerUnit) && r.brlPerUnit > 0 && !!r.date)
  return rates.reduce<TripFxRate | undefined>((best, r) => (!best || r.date >= best.date ? r : best), undefined)
}

/** "taxa da conversão Wise de 06/11" */
export function fxRateLabel(r: TripFxRate): string {
  const [, m, d] = r.date.split('-')
  const src = r.source.trim().replace(/^taxa d[ae]\s+/i, '')
  return `taxa da ${src || 'conversão'} de ${d}/${m}`
}

/** The country linked to the trip (Lugares que conheci), else the trip name. */
export function tripPlaceLabel(trip: Trip, places: Place[] = []): string {
  return places.find((p) => p.kind === 'pais' && p.tripIds?.includes(trip.id))?.name ?? trip.name
}

export function tripMonthSpend(trips: Trip[], expenses: Expense[], today: DateKey, places: Place[] = []): TripMonthSpend[] {
  const from = startOfMonth(today)
  const to = endOfMonth(today)
  const out: TripMonthSpend[] = []
  for (const trip of trips) {
    const cur = trip.expedition?.currency
    if (!cur || cur === 'BRL') continue
    // Lines in the trip currency only: another foreign currency can't be summed with it.
    const lines = tripLedger(trip, expenses).filter((e) => e.currency === cur && e.date! >= from && e.date! <= to)
    if (!lines.length) continue
    const cats = new Map<TripBudgetCategory, TripMonthCategory>()
    let cents = 0
    for (const e of lines) {
      cents += e.amountCents
      const c = e.tripCategory ?? 'compras'
      const row = cats.get(c) ?? { category: c, cents: 0, count: 0 }
      row.cents += e.amountCents
      row.count += 1
      cats.set(c, row)
    }
    const rate = latestFxRate(trip)
    out.push({
      trip,
      label: tripPlaceLabel(trip, places),
      currency: cur,
      cents,
      count: lines.length,
      byCategory: [...cats.values()].sort((a, b) => b.cents - a.cents),
      brl: rate ? { cents: Math.round(cents * rate.brlPerUnit), rate } : undefined,
    })
  }
  return out
}
