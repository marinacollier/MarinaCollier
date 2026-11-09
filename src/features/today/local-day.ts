/**
 * The day she is living in. At home it is São Paulo's calendar day; while traveling it is the trip's
 * local day (the calendar stores trip times in the trip's zone). Shared by Home and Lumos' daily briefing.
 */
import { travelTripOn } from '@/data/travel-mode'
import type { DateKey, DB } from '@/data/types'
import { localNow } from '@/features/travel/expedition/logic'

export interface ActiveDay {
  date: DateKey
  /** Minutes since local midnight in the active zone. */
  minutes: number
  /** The trip's IANA zone when a trip sets the clock that day. */
  timeZone?: string
}

/** `today` is the home calendar day of `clock`; `homeMinutes` its local minutes (when known). */
export function activeDay(db: Pick<DB, 'trips'>, today: DateKey, clock: Date, homeMinutes?: number): ActiveDay {
  const tz = travelTripOn(db, today)?.expedition?.timeZone
  const home = homeMinutes ?? clock.getHours() * 60 + clock.getMinutes()
  if (!tz) return { date: today, minutes: home }
  try {
    const local = localNow(tz, clock)
    return { date: local.date, minutes: local.minutes, timeZone: tz }
  } catch {
    return { date: today, minutes: home }
  }
}

/** Just the date (Home's "today"). */
export function activeDate(db: Pick<DB, 'trips'>, today: DateKey, clock: Date): DateKey {
  return activeDay(db, today, clock).date
}
