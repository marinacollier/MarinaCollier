/**
 * Microsoft Graph calendar (delegated Calendars.Read, read-only).
 *   GET ?op=calendars                      → /me/calendars
 *   GET ?op=events&calendarId&from&to      → /me/calendarView (or /me/calendars/{id}/calendarView) with $select
 *   GET ?op=changes&from&to                → /me/calendarView/delta, deltaLink kept in sync_state
 *                                            (delta does not support $select: fields are dropped by the mapper)
 * Times are requested in UTC (Prefer: outlook.timezone="UTC") and converted to São Paulo.
 * Docs: https://learn.microsoft.com/en-us/graph/api/user-list-calendarview
 *       https://learn.microsoft.com/en-us/graph/api/event-delta
 */
import { accessToken, getCursor, providerGet, requireUser, saveAccount, setCursor } from '../_shared/db.ts'
import { HttpError, json, serve } from '../_shared/http.ts'
import { mapGraphCalendar, mapGraphEvent, type GraphCalendar, type GraphEvent } from '../_shared/mappers.ts'
import { addDays, spMidnightISO } from '../_shared/tz.ts'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const SELECT = 'id,iCalUId,subject,isAllDay,isCancelled,start,end,location,webLink,lastModifiedDateTime'
const PREFER = { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=100' }

interface Page<T> {
  value: T[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

async function follow<T>(first: string, token: string) {
  const items: T[] = []
  let next: string | undefined = first
  let deltaLink: string | undefined
  for (let i = 0; next && i < 30; i++) {
    const page: Page<T> = await providerGet<Page<T>>(next, token, PREFER)
    items.push(...page.value)
    next = page['@odata.nextLink']
    deltaLink = page['@odata.deltaLink'] ?? deltaLink
  }
  return { items, deltaLink }
}

const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)

serve(async (req, url) => {
  const user = await requireUser(req)
  const token = await accessToken(user.id, 'microsoft')
  const op = url.searchParams.get('op')

  if (op === 'calendars') {
    const { items } = await follow<GraphCalendar>(`${GRAPH}/me/calendars?$select=id,name,hexColor,isDefaultCalendar`, token)
    return json(req, { calendars: items.map(mapGraphCalendar) })
  }

  const from = isoDate(url.searchParams.get('from'))
  const to = isoDate(url.searchParams.get('to'))
  if (!from || !to) throw new HttpError('bad_request', 'from/to inválidos')
  const range = `startDateTime=${encodeURIComponent(spMidnightISO(from))}&endDateTime=${encodeURIComponent(spMidnightISO(addDays(to, 1)))}`

  if (op === 'events') {
    const calendarId = url.searchParams.get('calendarId')
    const base = calendarId ? `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/calendarView` : `${GRAPH}/me/calendarView`
    const { items } = await follow<GraphEvent>(`${base}?${range}&$select=${SELECT}&$top=100`, token)
    await saveAccount(user.id, 'microsoft', { status: 'connected', lastSyncAt: new Date().toISOString() })
    return json(req, { events: items.map(mapGraphEvent) })
  }

  if (op === 'changes') {
    const resource = `calendarView:${from}:${to}`
    const stored = await getCursor(user.id, 'microsoft', resource)
    const full = !stored
    const { items, deltaLink } = await follow<GraphEvent>(stored ?? `${GRAPH}/me/calendarView/delta?${range}`, token)
    await setCursor(user.id, 'microsoft', resource, deltaLink ?? null)
    await saveAccount(user.id, 'microsoft', { status: 'connected', lastSyncAt: new Date().toISOString() })
    return json(req, { events: items.map(mapGraphEvent), full })
  }

  throw new HttpError('bad_request', 'op desconhecida')
})
