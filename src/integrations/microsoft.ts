/**
 * Microsoft 365 calendar — via Edge Functions `oauth-microsoft` + `ms-calendar-events`.
 * The function reads /me/calendarView (or /me/calendars/{id}/calendarView) with $select and
 * returns RemoteEvent[] in São Paulo time. Delegated permission: Calendars.Read (read-only).
 */
import { callBackend, startOAuth } from './backend'
import { PROVIDERS } from './registry'
import type { CalendarProvider, RemoteCalendar, RemoteEvent } from './types'
import { asArray, backendProviderStatus, returnHere } from './common'

export const microsoftCalendar: CalendarProvider = {
  info: PROVIDERS.microsoft,
  status: () => backendProviderStatus('microsoft'),
  connect: () => startOAuth('microsoft', { returnTo: returnHere(), features: ['calendar'] }),
  async listCalendars() {
    const r = await callBackend<{ calendars: RemoteCalendar[] }>('ms-calendar-events', { query: { op: 'calendars' } })
    return asArray<RemoteCalendar>(r.calendars, 'calendars')
  },
  async listEvents(calendarId, range) {
    const r = await callBackend<{ events: RemoteEvent[] }>('ms-calendar-events', {
      query: { op: 'events', calendarId, from: range.from, to: range.to },
    })
    return asArray<RemoteEvent>(r.events, 'events')
  },
}
