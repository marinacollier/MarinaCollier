import { minutesOfDay, todayKey } from '@/lib/date'
import type { Now } from './types'

/** The intelligence layer's "now" for a real instant (default: this moment, São Paulo). */
export function nowFor(d: Date = new Date()): Now {
  return { date: todayKey(d), minutes: minutesOfDay(d), iso: d.toISOString() }
}
