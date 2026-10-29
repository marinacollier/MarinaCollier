/**
 * The trip day (modo viagem) as Home and Lumos read it: classes, activities, training of the trip,
 * the next departure and what she spent — instead of the São Paulo routine.
 * Pure: reads the DB, never writes. Built on the expedition logic (classOn / schoolDays / nextDeparture).
 */
import type { DateKey, DB, Trip, TripCurrency, TripItem } from '@/data/types'
import { travelTripOn } from '@/data/travel-mode'
import { diffDays, hmToMinutes } from '@/lib/date'
import { classOn, convert, isActive, itemsOnDay, nextDeparture, schoolDays, type ClassBlock, type Departure } from './expedition/logic'

const SPORT_KINDS = new Set(['trilha', 'corrida', 'natacao', 'surf', 'bike', 'scuba'])

/** An activity that is the day's training (surf, corrida, trilha, bike, mergulho…). */
export function isTripSport(i: TripItem): boolean {
  return i.section === 'esporte' || (!!i.checklistKind && SPORT_KINDS.has(i.checklistKind))
}

export interface TripDay {
  trip: Trip
  date: DateKey
  /** The local clock (minutes) the day was read at — trip items are in the trip's local time. */
  minutes: number
  /** 1-based day of the trip and how many days it has. */
  dayNumber: number
  totalDays: number
  school?: { name: string; block: ClassBlock; impact: 'nenhum' | 'parcial' | 'dia' }
  /** Active items touching the day (multi-day stays included), in time order. */
  items: TripItem[]
  /** The ones that start that day (what she does). */
  activities: TripItem[]
  sports: TripItem[]
  next?: Departure
  currency: TripCurrency
  /** Paid that day (activities, food, Uber), in the trip currency. Undefined when nothing logged. */
  spentCents?: number
}

/** The trip day for `date` when modo viagem covers it. `minutes` = local clock for "próxima saída". */
export function tripDayOf(db: DB, date: DateKey, minutes = 0): TripDay | undefined {
  const trip = travelTripOn(db, date)
  if (!trip) return undefined
  const all = db.tripItems.filter((i) => i.tripId === trip.id)
  const items = itemsOnDay(all.filter(isActive), date)
  const activities = items.filter((i) => i.date === date && i.section !== 'hospedagem' && !(i.schoolImpact && i.title === 'Falta na escola'))
  const exp = trip.expedition
  const block = classOn(exp, date)
  const sd = block ? schoolDays(trip, all).find((d) => d.date === date) : undefined
  const currency: TripCurrency = exp?.currency ?? 'BRL'
  let spent = 0
  let any = false
  for (const i of all) {
    if (i.date !== date || !isActive(i)) continue
    const from = i.currency ?? currency
    const paid = (i.paidCents ?? 0) + (i.status === 'feito' ? (i.uberCents ?? 0) : 0)
    if (!paid) continue
    const v = exp ? convert(paid, from, currency, exp) : paid
    if (v == null) continue
    spent += v
    any = true
  }
  return {
    trip,
    date,
    minutes,
    dayNumber: diffDays(trip.startDate!, date) + 1,
    totalDays: diffDays(trip.startDate!, trip.endDate ?? trip.startDate!) + 1,
    school: block && exp?.school ? { name: exp.school.name, block, impact: sd?.impact ?? 'nenhum' } : undefined,
    items,
    activities,
    sports: activities.filter(isTripSport),
    next: nextDeparture(all, { date, minutes }),
    currency,
    spentCents: any ? spent : undefined,
  }
}

/** "Aula 09:00–15:10" / "Falta na aula hoje" / undefined. */
export function schoolLine(d: TripDay): string | undefined {
  if (!d.school) return undefined
  const { block, impact, name } = d.school
  if (impact === 'dia') return `Sem aula hoje (ausência planejada) · ${name}`
  return `Aula ${block.start}–${block.end}${impact === 'parcial' ? ' (saída parcial)' : ''} · ${name}`
}

/** One line per thing of the day, time order: classes first when they start first. */
export interface TripDayRow {
  time?: string
  /** When it ends (the class), so a class in progress still counts as "ainda hoje". */
  end?: string
  text: string
  emoji: string
  sport?: boolean
  school?: boolean
}

export function tripDayRows(d: TripDay): TripDayRow[] {
  const rows: TripDayRow[] = []
  if (d.school && d.school.impact !== 'dia') rows.push({ time: d.school.block.start, end: d.school.block.end, text: `Aula · ${d.school.name} até ${d.school.block.end}`, emoji: '🏫', school: true })
  for (const i of d.activities) rows.push({ time: i.leaveTime ?? i.time, text: i.title, emoji: isTripSport(i) ? '🏄‍♀️' : i.section === 'voo' ? '✈️' : '📍', sport: isTripSport(i) })
  return rows.sort((a, b) => (a.time ? hmToMinutes(a.time) : 9999) - (b.time ? hmToMinutes(b.time) : 9999))
}
