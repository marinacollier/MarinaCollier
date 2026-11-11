/**
 * The day organizes itself around what is FIXED.
 *
 *  - FIXO: meetings and events with a time, classes, flights, bookings with a confirmed time — never moved by the app.
 *  - FLEXÍVEL: tasks, studies, individual work, workouts without a booking, plans she marked flexible.
 *  - ROTINA ADAPTATIVA: "Encerrar o dia", "Preparar o dia seguinte", reviews, Dormir — follow the real agenda.
 *
 * Evening rule (the 21:00 "Encerrar o dia" before a 21:30 interview): the closing routine happens after the LAST
 * fixed commitment of the day; sleep is re-evaluated after it. A meeting with no end time is not given one — the
 * routine goes "depois de X (fim não informado)". Nothing fixed is shortened or moved. Pure.
 */
import type { CalendarEntry } from '@/data/calendar/universal'
import { hmToMinutes, minutesToHM } from '@/lib/date'
import { normalize } from '@/lib/text'

export type Fixity = 'fixo' | 'flexivel' | 'rotina'

const FIXED_SOURCES = new Set(['event', 'school', 'meeting', 'tripItem'])
const BOOKED = /\b(reservad|confirmad|emitid|pago|voo|flight)/

/** What kind of line this is for the reorganizer. */
export function fixityOf(e: CalendarEntry): Fixity {
  if (e.sourceType === 'dayBlock' || e.base) return 'rotina'
  if (e.flexible || e.suggested || e.optional || e.light || e.approx) return 'flexivel'
  if (!FIXED_SOURCES.has(e.sourceType)) return 'flexivel'
  if (e.sourceType === 'tripItem') {
    const words = normalize(`${e.statusLabel ?? ''} ${e.status} ${e.title}`)
    return e.status === 'confirmado' || BOOKED.test(words) ? 'fixo' : 'flexivel'
  }
  return 'fixo'
}

export interface Anchor {
  title: string
  start: number
  /** Known end (minutes); missing = the source did not say. */
  end?: number
}

/** The last fixed, timed, still-on commitment that STARTS on `date` (all-day and cancelled ignored). */
export function lastFixed(entries: CalendarEntry[], date: string): Anchor | undefined {
  let best: Anchor | undefined
  for (const e of entries) {
    if (e.allDay || !e.startAt.time || e.startAt.date !== date) continue
    if (e.status === 'cancelado' || e.status === 'feito' || e.masked) continue
    if (fixityOf(e) !== 'fixo') continue
    const start = hmToMinutes(e.startAt.time)
    const end = e.endAt?.time && e.endAt.date === date ? hmToMinutes(e.endAt.time) : e.endAt?.time && e.endAt.date > date ? 24 * 60 : undefined
    const key = end ?? start
    if (!best || key > (best.end ?? best.start)) best = { title: e.title, start, end: end !== undefined && end > start ? end : undefined }
  }
  return best
}

const ADAPTIVE = /\b(encerrar|fechamento|preparar (o )?(dia|amanha)|revis|desacelerar)/

export const isAdaptiveRoutine = (name: string) => ADAPTIVE.test(normalize(name))

export interface EveningShift {
  /** Original and adapted start (HH:MM). */
  from: string
  to: string
  /** "depois de Entrevista Técnica (22:15)" / "depois de X — fim não informado". */
  reason: string
  /** The anchor had no end time: `to` is its start, shown as "depois de". */
  unknownEnd?: boolean
}

export interface EveningPlan {
  closing?: EveningShift
  sleep?: EveningShift & { tight: boolean; hours?: number }
}

const up5 = (m: number) => Math.ceil(m / 5) * 5

/**
 * Where the closing routine and sleep go today, given the real agenda.
 * `closingAt` = the routine's planned start; `closingMin` = its expected length; `sleepAt`/`wakeAt` from her rhythm.
 */
export function eveningPlan(entries: CalendarEntry[], date: string, p: { closingAt?: string; closingMin?: number; sleepAt?: string; wakeAt?: string }): EveningPlan {
  const out: EveningPlan = {}
  const anchor = lastFixed(entries, date)
  if (!anchor) return out
  const anchorEnd = anchor.end ?? anchor.start
  const label = (s: string) => {
    const t = s.replace(/\s*[|·—-].*$/, '').trim() || s
    return t.length > 26 ? `${t.slice(0, 24).trim()}…` : t
  }
  let closingStart = p.closingAt ? hmToMinutes(p.closingAt) : undefined
  if (closingStart !== undefined && anchorEnd > closingStart) {
    const to = up5(anchorEnd)
    out.closing = {
      from: p.closingAt!,
      to: minutesToHM(Math.min(to, 23 * 60 + 55)),
      reason: anchor.end !== undefined ? `depois de ${label(anchor.title)}` : `depois de ${label(anchor.title)} — fim não informado`,
      unknownEnd: anchor.end === undefined || undefined,
    }
    closingStart = to
  }
  if (p.sleepAt) {
    const sleep = hmToMinutes(p.sleepAt)
    const needed = Math.max(closingStart !== undefined ? closingStart + (p.closingMin ?? 30) : 0, anchorEnd)
    if (needed > sleep) {
      const to = up5(needed)
      const wake = p.wakeAt ? hmToMinutes(p.wakeAt) : undefined
      const hours = wake !== undefined ? Math.round(((24 * 60 - to + wake) / 60) * 10) / 10 : undefined
      out.sleep = {
        from: p.sleepAt,
        to: minutesToHM(Math.min(to, 23 * 60 + 55)),
        reason: out.closing ? 'depois do encerramento ajustado' : `depois de ${label(anchor.title)}`,
        tight: hours !== undefined && hours < 7,
        hours,
      }
    }
  }
  return out
}

/**
 * Fingerprint of the day's FIXED commitments (what, when, state). When it changes — a meeting added, cancelled,
 * moved or done — the flexible plan around it is recalculated; flexible and routine lines do not count.
 */
export function fixedSignature(entries: CalendarEntry[], date: string): string {
  return entries
    .filter((e) => e.startAt.date === date && !e.allDay && !!e.startAt.time && fixityOf(e) === 'fixo')
    .map((e) => `${e.id}@${e.startAt.time}-${e.endAt?.time ?? ''}:${e.status}`)
    .sort()
    .join('|')
}
