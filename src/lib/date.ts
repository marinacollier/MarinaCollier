/**
 * Date helpers. All calendar math happens on `DateKey` strings ('YYYY-MM-DD') interpreted
 * in America/Sao_Paulo, so the device timezone never shifts "today".
 * Internally keys are converted to UTC-midnight Date objects purely for arithmetic.
 */
import type { DateKey, TimeHM, Weekday } from '@/data/types'

export const TIMEZONE = 'America/Sao_Paulo'

const keyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** DateKey for an instant (default: now) in São Paulo. */
export function toDateKey(d: Date = new Date()): DateKey {
  return keyFormatter.format(d)
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now)
}

/** 'HH:mm' for an instant in São Paulo. */
export function toTimeHM(d: Date = new Date()): TimeHM {
  return timeFormatter.format(d)
}

/** Minutes since midnight in São Paulo for an instant. */
export function minutesOfDay(d: Date = new Date()): number {
  return hmToMinutes(toTimeHM(d))
}

export function hmToMinutes(hm: TimeHM): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutesToHM(min: number): TimeHM {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function keyToUTC(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function utcToKey(d: Date): DateKey {
  return d.toISOString().slice(0, 10)
}

export function isDateKey(v: unknown): v is DateKey {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = keyToUTC(key)
  d.setUTCDate(d.getUTCDate() + n)
  return utcToKey(d)
}

export function addMonths(key: DateKey, n: number): DateKey {
  const d = keyToUTC(key)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  d.setUTCDate(Math.min(day, daysInMonth(utcToKey(d))))
  return utcToKey(d)
}

/** Whole days from a to b (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((keyToUTC(b).getTime() - keyToUTC(a).getTime()) / 86_400_000)
}

export function weekday(key: DateKey): Weekday {
  return keyToUTC(key).getUTCDay() as Weekday
}

/** Monday of the week containing `key` (weeks start on Monday in Brazil's planner culture). */
export function startOfWeek(key: DateKey): DateKey {
  const wd = weekday(key)
  return addDays(key, wd === 0 ? -6 : 1 - wd)
}

export function endOfWeek(key: DateKey): DateKey {
  return addDays(startOfWeek(key), 6)
}

/** The 7 DateKeys Monday..Sunday of the week containing `key`. */
export function weekDays(key: DateKey): DateKey[] {
  const start = startOfWeek(key)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function startOfMonth(key: DateKey): DateKey {
  return key.slice(0, 8) + '01'
}

export function daysInMonth(key: DateKey): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function endOfMonth(key: DateKey): DateKey {
  return key.slice(0, 8) + String(daysInMonth(key)).padStart(2, '0')
}

export function monthKey(key: DateKey): string {
  return key.slice(0, 7)
}

export function isBetween(key: DateKey, from: DateKey, to: DateKey): boolean {
  return key >= from && key <= to
}

/** Combine a DateKey + TimeHM in São Paulo into a real instant. São Paulo has no DST since 2019 (UTC-3). */
export function toInstant(key: DateKey, time: TimeHM = '00:00'): Date {
  return new Date(`${key}T${time}:00-03:00`)
}

// ─── Formatting (pt-BR) ─────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = JSON.stringify(opts)
  let f = fmtCache.get(k)
  if (!f) {
    f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...opts })
    fmtCache.set(k, f)
  }
  return f
}

/** "quinta-feira, 2 de outubro" */
export function formatLongDate(key: DateKey): string {
  return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(keyToUTC(key))
}

/** "2 de out." */
export function formatShortDate(key: DateKey): string {
  return fmt({ day: 'numeric', month: 'short' }).format(keyToUTC(key))
}

/** "02/10" */
export function formatDayMonth(key: DateKey): string {
  return fmt({ day: '2-digit', month: '2-digit' }).format(keyToUTC(key))
}

/** "02/10/2026" */
export function formatFullDate(key: DateKey): string {
  return fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(keyToUTC(key))
}

/** "outubro de 2026" */
export function formatMonth(key: DateKey): string {
  return fmt({ month: 'long', year: 'numeric' }).format(keyToUTC(key))
}

export const WEEKDAY_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const
export const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const
export const WEEKDAY_LONG = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const
export const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/** "hoje", "amanhã", "ontem", "sexta", or "12 de out." */
export function relativeDay(key: DateKey, today: DateKey = todayKey()): string {
  const d = diffDays(today, key)
  if (d === 0) return 'hoje'
  if (d === 1) return 'amanhã'
  if (d === -1) return 'ontem'
  if (d > 1 && d < 7) return WEEKDAY_LONG[weekday(key)]
  return formatShortDate(key)
}

/** "faltam 20 dias", "é amanhã!", "é hoje! ✨" */
export function countdownLabel(key: DateKey, today: DateKey = todayKey()): string {
  const d = diffDays(today, key)
  if (d === 0) return 'é hoje! ✨'
  if (d === 1) return 'é amanhã!'
  if (d < 0) return `foi há ${-d} ${-d === 1 ? 'dia' : 'dias'}`
  return `faltam ${d} dias`
}

/** "em 40 min", "em 2h", "em 1h20" */
export function inMinutesLabel(min: number): string {
  if (min <= 0) return 'agora'
  if (min < 60) return `em ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `em ${h}h${String(m).padStart(2, '0')}` : `em ${h}h`
}

export type DayPart = 'manha' | 'dia' | 'noite'

export function dayPart(
  minutes: number,
  parts: { morningStart: number; middayStart: number; eveningStart: number } = {
    morningStart: 4,
    middayStart: 11,
    eveningStart: 18,
  },
): DayPart {
  const h = minutes / 60
  if (h >= parts.morningStart && h < parts.middayStart) return 'manha'
  if (h >= parts.middayStart && h < parts.eveningStart) return 'dia'
  return 'noite'
}

export function greeting(minutes: number): string {
  const h = minutes / 60
  if (h >= 4 && h < 12) return 'Bom dia'
  if (h >= 12 && h < 18) return 'Boa tarde'
  return 'Boa noite'
}
