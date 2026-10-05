/**
 * LifeContextEngine — today, tomorrow and the week, crossing calendar, routine, training, nutrition,
 * work, trips and energy. Pure: (db, now) → context. Everything comes from data (no names hardcoded).
 */
import type { DateKey, DB, Provenance, Confidence, TimelineEntry, Trip, TripItem, TimeHM } from '../types'
import { dayTimeline, endMin, isAnytime, routineBlocks, startMin } from '../timeline'
import { DAY_TYPE_LABEL, contextWorkouts, dayPlanFor, dayTrainingContext } from '../fuel'
import { conflictsOn, modalityGroup, workMode, workOverride, workBlocks } from '../planning'
import { checkinFor, upcomingTrips } from '../selectors'
import { addDays, diffDays, hmToMinutes, minutesToHM, WEEKDAY_LONG, weekday } from '@/lib/date'
import type { DayContext, LifeContext, Now, Sourced } from './types'

const MIN_FREE = 30

export const src = <T>(value: T, provenance: Provenance, confidence: Confidence = 'high'): Sourced<T> => ({ value, provenance, confidence })

// ─── Small shared helpers ───────────────────────────────────────────────────

/** "4h", "1h30", "45 min". */
export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** "hoje", "amanhã", "ontem", "sábado", "12/10". */
export function dayLabel(date: DateKey, today: DateKey): string {
  const d = diffDays(today, date)
  if (d === 0) return 'hoje'
  if (d === 1) return 'amanhã'
  if (d === -1) return 'ontem'
  if (d > 1 && d < 7) return WEEKDAY_LONG[weekday(date)]
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

interface Interval {
  start: number
  end: number
}

/** Busy intervals of a day: trainings, events, work (+ commute), timed tasks and routine blocks. */
export function busyIntervals(db: DB, date: DateKey, timeline: TimelineEntry[] = dayTimeline(db, date)): Interval[] {
  const out: Interval[] = []
  for (const e of timeline) {
    if (isAnytime(e) || e.status === 'cancelled') continue
    if (e.kind !== 'workout' && e.kind !== 'event' && e.kind !== 'work' && e.kind !== 'task') continue
    const s = startMin(e)
    const en = endMin(e)
    if (s !== undefined && en !== undefined) out.push({ start: s, end: Math.max(en, s + 15) })
  }
  for (const b of routineBlocks(db, timeline)) out.push({ start: hmToMinutes(b.start), end: hmToMinutes(b.end) })
  return out.sort((a, b) => a.start - b.start)
}

/** Free windows ≥ `minLen` between `from` and `to` (minutes), given busy intervals. */
export function freeWindows(busy: Interval[], from: number, to: number, minLen = MIN_FREE): { start: TimeHM; end: TimeHM }[] {
  const out: { start: TimeHM; end: TimeHM }[] = []
  let cursor = from
  for (const b of [...busy].sort((a, c) => a.start - c.start)) {
    if (b.end <= cursor) continue
    if (b.start >= to) break
    if (b.start - cursor >= minLen) out.push({ start: minutesToHM(cursor), end: minutesToHM(b.start) })
    cursor = Math.max(cursor, b.end)
  }
  if (to - cursor >= minLen) out.push({ start: minutesToHM(cursor), end: minutesToHM(to) })
  return out
}

export function dayBounds(db: DB): { wake: number; sleep: number } {
  return { wake: hmToMinutes(db.profile.rhythm?.wakeTime ?? '06:00'), sleep: hmToMinutes(db.profile.rhythm?.sleepTime ?? '22:00') }
}

/** Open items of a trip that really need something (bookings, documents, transport…), not wishlists. */
const ACTION_SECTIONS = new Set<TripItem['section']>(['voo', 'hospedagem', 'transporte', 'reserva', 'documento', 'antes_de_ir', 'comprar'])

export function tripOpenItems(db: DB, trip: Trip, today: DateKey): TripItem[] {
  const daysLeft = trip.startDate ? diffDays(today, trip.startDate) : Infinity
  return db.tripItems
    .filter((i) => i.tripId === trip.id && (i.status === 'a_confirmar' || i.status === 'a_fazer'))
    .filter((i) => ACTION_SECTIONS.has(i.section) || !!i.date || (i.section === 'mala' && daysLeft <= 7))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.order - b.order)
}

// ─── Training nouns (for short lines) ───────────────────────────────────────

const GROUP_NOUN: Record<string, [string, 'o' | 'a']> = {
  corrida: ['corrida', 'a'],
  bike: ['pedal', 'o'],
  natacao: ['natação', 'a'],
  forca: ['treino', 'o'],
  mobilidade: ['yoga', 'a'],
  fun: ['treino', 'o'],
  off: ['descanso', 'o'],
}

/** "pedal" / "corrida" + gender, from the modality group. */
export function trainingNoun(db: DB, modality: string): { noun: string; g: 'o' | 'a' } {
  const [noun, g] = GROUP_NOUN[modalityGroup(db.profile, modality)] ?? ['treino', 'o']
  return { noun, g }
}

// ─── Day context ────────────────────────────────────────────────────────────

export function dayContext(db: DB, date: DateKey, now?: Now): DayContext {
  const timeline = dayTimeline(db, date)
  const mode = workMode(db, date)
  const presencial = mode === 'presencial'
  const workouts = contextWorkouts(db, date)
  const trainingCtx = dayTrainingContext(db, date)

  const trainings: DayContext['trainings'] = timeline
    .filter((e) => e.kind === 'workout' && e.status !== 'cancelled')
    .map((e) => {
      const w = workouts.find((x) => (e.ref.type === 'workout' ? x.id === e.ref.id : x.templateId === e.ref.id && x.id.startsWith('template:')))
      const s = startMin(e)
      const en = endMin(e)
      return {
        title: e.title,
        time: e.timeSource !== 'approx' ? e.start : undefined,
        durationMin: w?.durationMin ?? w?.plannedDurationMin ?? (s !== undefined && en !== undefined && e.timeSource !== 'approx' ? en - s : undefined),
        key: !!w?.isKeySession,
        done: e.status === 'done',
        ref: e.ref,
      }
    })

  const commitments: DayContext['commitments'] = timeline
    .filter((e) => (e.kind === 'event' || (e.kind === 'work' && e.key.startsWith('work:work'))) && e.status !== 'cancelled')
    .map((e) => ({ title: e.title, start: isAnytime(e) ? undefined : e.start, end: isAnytime(e) ? undefined : e.end, ...(e.kind === 'event' ? { ref: e.ref } : {}) }))

  const { wake, sleep } = dayBounds(db)
  const from = now && now.date === date ? Math.max(wake, Math.round(now.minutes)) : wake
  const free = freeWindows(busyIntervals(db, date, timeline), from, sleep)

  const plan = dayPlanFor(db, date)
  const nutritionDay = plan || trainingCtx.dayType !== 'descanso' ? DAY_TYPE_LABEL[trainingCtx.dayType] : undefined
  const energy = checkinFor(db, date)?.energia

  // Notes: the few lines worth saying, most relevant first.
  const notes: { s: Sourced<string>; rank: number }[] = []
  const today = now?.date ?? date
  const rel = dayLabel(date, today)
  const first = trainings.find((t) => t.time && !t.done)
  const firstW = first && workouts.find((w) => (first.ref.type === 'workout' ? w.id === first.ref.id : w.templateId === first.ref.id))
  if (first?.time && hmToMinutes(first.time) < 7 * 60 + 30 && firstW) {
    const { noun, g } = trainingNoun(db, firstW.modality)
    const who = g === 'a' ? 'Sua' : 'Seu'
    const real = first.ref.type === 'workout'
    notes.push({ s: src(`${who} ${noun} começa cedo ${rel} (${first.time}).`, 'fact', real ? 'high' : 'medium'), rank: first.key ? 90 : 60 })
  }
  if (trainingCtx.prepFor) {
    const { noun, g } = trainingNoun(db, trainingCtx.prepFor.modality)
    notes.push({ s: src(`${capitalize(rel)} é dia de preparar ${g === 'a' ? 'a' : 'o'} ${noun} do dia seguinte.`, 'inference', 'high'), rank: 70 })
  }
  if (presencial) {
    const leave = workBlocks(db, date)[0]?.start
    const byUser = !!workOverride(db, date)?.workMode
    notes.push({ s: src(`${capitalize(rel)} é presencial${leave ? ` — saída ${leave}` : ''}.`, byUser ? 'user' : 'fact'), rank: 75 })
  } else if (workOverride(db, date)?.workMode) {
    notes.push({ s: src(`${capitalize(rel)} ficou ${mode === 'off' ? 'sem trabalho' : mode}.`, 'user'), rank: 50 })
  }
  for (const c of conflictsOn(db, date).filter((c) => c.severity === 'warn').slice(0, 1)) {
    notes.push({ s: src(c.message, 'inference', 'medium'), rank: 80 })
  }
  if (energy === 'baixa') notes.push({ s: src('Energia baixa — a versão curta do dia já basta.', 'inference', 'medium'), rank: 65 })
  const pending = timeline.filter((e) => e.planType === 'a_confirmar' && e.status === 'pending' && (e.kind === 'event' || e.kind === 'workout'))
  if (pending[0]) notes.push({ s: src(`${pending[0].title} ainda está a confirmar.`, 'fact', 'low'), rank: 30 })
  const evening = free.find((f) => hmToMinutes(f.start) <= 19 * 60 + 30 && hmToMinutes(f.end) >= sleep - 15)
  if (evening && (!now || now.date !== date || now.minutes < sleep - 90)) notes.push({ s: src(`Sua noite está livre${rel === 'hoje' ? '' : ` ${rel}`}.`, 'inference', 'high'), rank: 20 })

  return {
    date,
    workMode: mode,
    presencial,
    trainings,
    commitments,
    nutritionDay,
    free,
    energy,
    notes: notes.sort((a, b) => b.rank - a.rank).map((n) => n.s),
  }
}

export function lifeContext(db: DB, now: Now): LifeContext {
  const week = Array.from({ length: 7 }, (_, i) => dayContext(db, addDays(now.date, i), now))
  const trip = upcomingTrips(db, now.date).find((t: Trip) => t.startDate && diffDays(now.date, t.startDate) <= 45 && (t.endDate ?? t.startDate) >= now.date)
  return {
    now,
    today: week[0],
    tomorrow: week[1],
    week,
    nextTrip: trip?.startDate
      ? { id: trip.id, name: trip.name, startDate: trip.startDate, daysLeft: Math.max(0, diffDays(now.date, trip.startDate)), openItems: tripOpenItems(db, trip, now.date).length }
      : undefined,
  }
}

export { lowerFirst }
