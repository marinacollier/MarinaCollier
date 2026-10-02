/**
 * Executive rituals: recurring calendar events that carry a checklist template
 * (Weekly CEO Review, Monthly Board Meeting...). Driven by data — any event with a template counts.
 */
import { useSyncExternalStore } from 'react'
import type { CalendarEvent, DateKey, DB } from '@/data/types'
import { eventOccursOn } from '@/data/planning'
import { addDays } from '@/lib/date'

export interface RitualOccurrence {
  event: CalendarEvent
  date: DateKey
}

/** Next date (>= from) the event happens, honoring recurrence + exdates. */
export function nextEventDate(e: CalendarEvent, from: DateKey, horizon = 400): DateKey | undefined {
  for (let i = 0; i <= horizon; i++) {
    const d = addDays(from, i)
    if (eventOccursOn(e, d)) return d
  }
  return undefined
}

/** Upcoming occurrence of every event with a template (enabled sources only), soonest first. */
export function upcomingRituals(db: DB, today: DateKey): RitualOccurrence[] {
  const enabled = new Set(db.calendarSources.filter((s) => s.enabled).map((s) => s.id))
  const out: RitualOccurrence[] = []
  for (const e of db.events) {
    if (!e.template?.length) continue
    if (db.calendarSources.length && !enabled.has(e.sourceId)) continue
    const date = nextEventDate(e, today)
    if (date) out.push({ event: e, date })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''))
}

// ─── Per-session checklist (one per event occurrence) ───────────────────────
// Occurrence records can't point at events, so the pauta checks live only for this session.

const checks = new Map<string, number[]>()
const listeners = new Set<() => void>()
const EMPTY: number[] = []

export function ritualKey(eventId: string, date: DateKey): string {
  return `${eventId}:${date}`
}

export function getRitualChecks(key: string): number[] {
  return checks.get(key) ?? EMPTY
}

export function toggleRitualCheck(key: string, index: number): void {
  const cur = getRitualChecks(key)
  checks.set(key, cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index])
  listeners.forEach((l) => l())
}

export function resetRitualChecks(): void {
  checks.clear()
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useRitualChecks(key: string): number[] {
  return useSyncExternalStore(
    subscribe,
    () => getRitualChecks(key),
    () => getRitualChecks(key),
  )
}
