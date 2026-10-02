/**
 * Google Calendar API v3 (read-only).
 *   GET ?op=calendars                         → calendarList.list
 *   GET ?op=events&calendarId&from&to         → events.list(singleEvents=true, timeMin, timeMax, showDeleted)
 *   GET ?op=changes&calendarId                → events.list(syncToken) incremental; on 410 Gone re-runs a full
 *                                               sync (timeMin = 30 days ago) and stores the new nextSyncToken.
 * Returns minimized RemoteEvent-shaped JSON (no descriptions, attendees, attachments).
 * Docs: https://developers.google.com/workspace/calendar/api/v3/reference/events/list
 *       https://developers.google.com/workspace/calendar/api/guides/sync
 */
import { accessToken, getCursor, providerGet, requireUser, saveAccount, setCursor } from '../_shared/db.ts'
import { HttpError, json, serve } from '../_shared/http.ts'
import { mapGoogleCalendar, mapGoogleEvent, type GoogleCalendarListEntry, type GoogleEvent } from '../_shared/mappers.ts'
import { addDays, spMidnightISO } from '../_shared/tz.ts'

const API = 'https://www.googleapis.com/calendar/v3'
const EVENT_FIELDS = 'items(id,iCalUID,status,summary,location,htmlLink,updated,start,end),nextPageToken,nextSyncToken'

interface EventsPage {
  items?: GoogleEvent[]
  nextPageToken?: string
  nextSyncToken?: string
}

async function listAll(token: string, calendarId: string, params: Record<string, string>) {
  const items: GoogleEvent[] = []
  let pageToken: string | undefined
  let syncToken: string | undefined
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ ...params, maxResults: '250', fields: EVENT_FIELDS })
    if (pageToken) q.set('pageToken', pageToken)
    const page = await providerGet<EventsPage>(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${q}`, token)
    items.push(...(page.items ?? []))
    pageToken = page.nextPageToken
    syncToken = page.nextSyncToken ?? syncToken
    if (!pageToken) break
  }
  return { items, syncToken }
}

const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)

serve(async (req, url) => {
  const user = await requireUser(req)
  const token = await accessToken(user.id, 'google')
  const op = url.searchParams.get('op')

  if (op === 'calendars') {
    const r = await providerGet<{ items?: GoogleCalendarListEntry[] }>(
      `${API}/users/me/calendarList?fields=items(id,summary,summaryOverride,backgroundColor,primary)`,
      token,
    )
    return json(req, { calendars: (r.items ?? []).map(mapGoogleCalendar) })
  }

  const calendarId = url.searchParams.get('calendarId') || 'primary'

  if (op === 'events') {
    const from = isoDate(url.searchParams.get('from'))
    const to = isoDate(url.searchParams.get('to'))
    if (!from || !to) throw new HttpError('bad_request', 'from/to inválidos')
    const { items } = await listAll(token, calendarId, {
      singleEvents: 'true', // expand recurring events into instances
      showDeleted: 'true',
      timeMin: spMidnightISO(from),
      timeMax: spMidnightISO(addDays(to, 1)),
    })
    await saveAccount(user.id, 'google', { status: 'connected', lastSyncAt: new Date().toISOString() })
    return json(req, { events: items.map(mapGoogleEvent) })
  }

  if (op === 'changes') {
    const stored = await getCursor(user.id, 'google', calendarId)
    let full = !stored
    let result
    try {
      result = stored
        ? await listAll(token, calendarId, { singleEvents: 'true', syncToken: stored })
        : null
    } catch (err) {
      // 410 Gone: the sync token is no longer valid → wipe and do a full sync.
      if ((err as { upstreamStatus?: number }).upstreamStatus !== 410) throw err
      result = null
      full = true
    }
    if (!result) {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
      result = await listAll(token, calendarId, { singleEvents: 'true', timeMin: since })
    }
    await setCursor(user.id, 'google', calendarId, result.syncToken ?? null)
    await saveAccount(user.id, 'google', { status: 'connected', lastSyncAt: new Date().toISOString() })
    return json(req, { events: result.items.map(mapGoogleEvent), full })
  }

  throw new HttpError('bad_request', 'op desconhecida')
})
