/**
 * Time-zone helpers for imported calendar data.
 * Everything ends up as DateKey + TimeHM in America/Sao_Paulo (see src/lib/date.ts).
 *
 * NOTE: supabase/functions/_shared/tz.ts holds a copy of this logic for the Edge Functions
 * (Deno cannot resolve the app's `@/` alias). Keep both in sync.
 */
import { toDateKey, toTimeHM } from '@/lib/date'
import type { DateKey, TimeHM } from '@/data/types'

/** Windows zone names found in Outlook/Exchange .ics exports → IANA. Only the ones Marina is likely to see. */
const WINDOWS_TZ: Record<string, string> = {
  'E. South America Standard Time': 'America/Sao_Paulo',
  'SA Eastern Standard Time': 'America/Cayenne',
  'Bahia Standard Time': 'America/Bahia',
  'Tocantins Standard Time': 'America/Araguaina',
  'Central Brazilian Standard Time': 'America/Cuiaba',
  'SA Western Standard Time': 'America/La_Paz',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'Pacific SA Standard Time': 'America/Santiago',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest',
  'GTB Standard Time': 'Europe/Bucharest',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Tokyo Standard Time': 'Asia/Tokyo',
  UTC: 'UTC',
  'Coordinated Universal Time': 'UTC',
}

const validCache = new Map<string, boolean>()
function isValidZone(tz: string): boolean {
  let ok = validCache.get(tz)
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      ok = true
    } catch {
      ok = false
    }
    validCache.set(tz, ok)
  }
  return ok
}

/**
 * Resolve a TZID parameter to an IANA zone. Handles quoted ids, Windows names and
 * vendor-prefixed ids like "/citadel.org/20190914_1/America/Sao_Paulo". Unknown → undefined
 * (callers then treat the time as São Paulo "floating" time).
 */
export function resolveTimeZone(tzid: string | undefined): string | undefined {
  if (!tzid) return undefined
  const id = tzid.replace(/^"|"$/g, '').trim()
  if (WINDOWS_TZ[id]) return WINDOWS_TZ[id]
  if (isValidZone(id)) return id
  const m = id.match(/([A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/)
  if (m && isValidZone(m[1])) return m[1]
  return undefined
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>()
/** Offset (ms) of `tz` at instant `utcMs`: local wall clock − UTC. */
function zoneOffsetMs(utcMs: number, tz: string): number {
  let f = offsetFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    offsetFormatters.set(tz, f)
  }
  const parts: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(utcMs))) if (p.type !== 'literal') parts[p.type] = Number(p.value)
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second)
  return asUTC - Math.floor(utcMs / 1000) * 1000
}

/** Wall-clock time in `tz` → real instant. */
export function wallTimeToInstant(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  let ms = guess - zoneOffsetMs(guess, tz)
  // Second pass fixes the guess when it fell on the other side of a DST change.
  ms = guess - zoneOffsetMs(ms, tz)
  return new Date(ms)
}

/** Instant → São Paulo date/time. */
export function toSaoPaulo(d: Date): { date: DateKey; time: TimeHM } {
  return { date: toDateKey(d), time: toTimeHM(d) }
}
