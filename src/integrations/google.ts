/**
 * Google Calendar (API v3) — via Edge Functions `oauth-google` + `google-calendar-events`.
 * The function calls calendarList.list / events.list (singleEvents=true, timeMin/timeMax, or the
 * stored syncToken) and returns RemoteEvent[] already converted to São Paulo dates.
 * Read-only scopes only. Inactive until the backend is configured.
 */
import { callBackend, startOAuth } from './backend'
import { PROVIDERS } from './registry'
import type { CalendarProvider, RemoteCalendar, RemoteEvent } from './types'
import { asArray, backendProviderStatus, returnHere } from './common'

export const googleCalendar: CalendarProvider & {
  listChanges(calendarId: string): Promise<{ events: RemoteEvent[]; full: boolean }>
} = {
  info: PROVIDERS.google,
  status: () => backendProviderStatus('google'),
  connect: () => startOAuth('google', { returnTo: returnHere() }),
  async listCalendars() {
    const r = await callBackend<{ calendars: RemoteCalendar[] }>('google-calendar-events', { query: { op: 'calendars' } })
    return asArray<RemoteCalendar>(r.calendars, 'calendars')
  },
  async listEvents(calendarId, range) {
    const r = await callBackend<{ events: RemoteEvent[] }>('google-calendar-events', {
      query: { op: 'events', calendarId, from: range.from, to: range.to },
    })
    return asArray<RemoteEvent>(r.events, 'events')
  },
  /**
   * Incremental sync using the syncToken stored server-side (sync_state).
   * `full` = there was no token or it expired (HTTP 410) and a full listing was returned instead.
   */
  async listChanges(calendarId) {
    const r = await callBackend<{ events: RemoteEvent[]; full: boolean }>('google-calendar-events', {
      query: { op: 'changes', calendarId },
    })
    return { events: asArray<RemoteEvent>(r.events, 'events'), full: !!r.full }
  },
}
