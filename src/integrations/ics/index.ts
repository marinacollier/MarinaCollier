/**
 * ICS (iCalendar, RFC 5545) import/export. Works fully offline, no backend.
 * Owner: Integrations agent. Signatures are part of the shared contract (Agenda calls them).
 */
import type { CalendarEvent } from '@/data/types'
import type { RemoteEvent, SyncReport } from '../types'
import { EMPTY_REPORT } from '../types'

/** Parse an .ics file into normalized events (São Paulo dates/times). */
export function parseICS(_text: string): RemoteEvent[] {
  return []
}

/** Serialize events to an .ics document. */
export function toICS(_events: CalendarEvent[]): string {
  return ''
}

/**
 * Import an .ics text into the store as a CalendarSource (provider 'ics') + events,
 * deduplicating by provider/externalId and globalId (iCalUID). Returns what happened.
 */
export function importICSText(_text: string, _sourceName: string): SyncReport {
  return { ...EMPTY_REPORT }
}
