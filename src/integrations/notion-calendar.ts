/**
 * Google Calendar → MARINA OS, read-only, through her claude.ai connector (Notion Calendar reads her Google
 * account). The page calls the connector with HER credentials via the artifact `mcp` capability — no token
 * ever touches this app or the browser storage. When the capability or the connector is not available the
 * status says "desconectado" and nothing is simulated.
 *
 * Source of truth: Google, for the fields it owns (title, day, time, duration, place, link, participants,
 * cancellation). Local-only data (notes, trip, project, language…) is kept. Identity: Google's event id
 * (never the title). The first time a Google event shows up, an equal local record she already had (same
 * day + same Meet link, or same time / clearly the same title) is ADOPTED instead of duplicated, and a trip
 * item that represented it is linked (it stays, with its data, but the synced event is what is shown).
 *
 * Times: the connector gives an instant + the event's IANA zone; we store the wall time in the zone she
 * LIVES in that day (the trip's zone while traveling, home otherwise) — the same convention as the rest of
 * the calendar — plus `timeZone`, so every view (Dia, Semana, Mês, Lista, Hoje) shows the right hour.
 */
import { actions, getDB } from '@/data/store'
import type { CalendarEvent, CalendarSource, DateKey, DB, EventAttendee, TripItem } from '@/data/types'
import { travelTripOn } from '@/data/travel-mode'
import { addDays } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'
import { applyCalendarEvents } from './sync'
import type { RemoteEvent, SyncReport } from './types'

export const GCAL_SOURCE_ID = 'gcal-google'
export const GCAL_SERVER = 'Notion'
export const GCAL_TOOL = 'notion-calendar-list-events'
/** How far the sync reads: yesterday … +60 days (cancellations inside this window are detected). */
export const GCAL_WINDOW = { back: 1, ahead: 60 } as const

// ─── Connector payload (shape observed from a real read call) ───────────────

interface NcPeriod {
  type: 'DATE_TIME' | 'DATE' | string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
}
interface NcEvent {
  eventId: string
  summary?: string
  description?: string
  location?: string
  webUrl?: string
  conferencingUrl?: string
  period: NcPeriod
  isAutoBlock?: boolean
  eventStatus?: string
  responseStatus?: string
  attendees?: { email: string; displayName?: string; isSelf?: boolean; isOrganizer?: boolean; responseStatus?: string }[]
  calendar?: { calendarId: string }
}
interface NcCalendar {
  calendarId: string
  name?: string
  isPrimary?: boolean
  events?: NcEvent[]
}
export interface NcPayload {
  accounts?: { providerName?: string; email?: string; calendars?: NcCalendar[] }[]
  errors?: unknown[]
}

// ─── Time zones ─────────────────────────────────────────────────────────────

/** Wall date/time of an instant in an IANA zone. */
export function wallTime(instant: Date, tz: string): { date: DateKey; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/** The zone she lives in on the day of `instant`: the trip's while traveling, home otherwise. */
export function viewZoneFor(db: Pick<DB, 'trips' | 'profile'>, instant: Date): string {
  const home = db.profile.timezone ?? 'America/Sao_Paulo'
  const day = wallTime(instant, home).date
  return travelTripOn(db, day)?.expedition?.timeZone ?? home
}

const RESPONSE: Record<string, EventAttendee['responseStatus']> = { accepted: 'accepted', declined: 'declined', tentative: 'tentative', needsAction: 'needsAction' }

/** Connector payload → RemoteEvent[] (Google accounts only; declined invites and auto-blocks skipped). */
export function mapPayload(payload: NcPayload, db: Pick<DB, 'trips' | 'profile'>): RemoteEvent[] {
  const out: RemoteEvent[] = []
  for (const acc of payload.accounts ?? []) {
    if (acc.providerName !== 'google') continue
    for (const cal of acc.calendars ?? []) {
      for (const e of cal.events ?? []) {
        if (!e.eventId || e.isAutoBlock) continue
        const cancelled = e.eventStatus === 'cancelled' || e.responseStatus === 'declined'
        const base = {
          externalId: e.eventId,
          title: (e.summary ?? '').trim() || '(sem título)',
          location: e.location || undefined,
          url: e.conferencingUrl || undefined,
          webUrl: e.webUrl,
          deleted: cancelled || undefined,
          attendees: e.attendees?.length
            ? e.attendees.map((a) => ({ email: a.email, name: a.displayName || undefined, responseStatus: a.responseStatus ? RESPONSE[a.responseStatus] : undefined, self: a.isSelf || undefined, organizer: a.isOrganizer || undefined }))
            : undefined,
        }
        if (e.period.type === 'DATE' || (!e.period.start.dateTime && e.period.start.date)) {
          const date = e.period.start.date!
          // Google's all-day end is exclusive.
          const endEx = e.period.end.date
          const endDate = endEx && endEx > date ? addDays(endEx, -1) : undefined
          out.push({ ...base, date, endDate: endDate !== date ? endDate : undefined, allDay: true })
          continue
        }
        const start = new Date(e.period.start.dateTime!)
        const end = new Date(e.period.end.dateTime ?? e.period.start.dateTime!)
        if (Number.isNaN(start.getTime())) continue
        const tz = viewZoneFor(db, start)
        const s = wallTime(start, tz)
        const en = wallTime(end, tz)
        out.push({ ...base, date: s.date, startTime: s.time, endTime: en.time, endDate: en.date !== s.date ? en.date : undefined, allDay: false, timeZone: tz })
      }
    }
  }
  return out
}

// ─── Adoption: never a second copy of something she already had ────────────

const STOP = new Set(['reuniao', 'meeting', 'call', 'introductory', 'with', 'com', 'para', 'the', 'and', 'das', 'dos', 'confirmar', 'lembrete', 'evento'])
const words = (s: string) => new Set(normalize(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))
const shared = (a: string, b: string) => {
  const A = words(a)
  return [...words(b)].filter((w) => A.has(w)).length
}
const sameUrl = (a?: string, b?: string) => !!a && !!b && a.replace(/[?#].*$/, '').toLowerCase() === b.replace(/[?#].*$/, '').toLowerCase()

export interface Adoption {
  /** Local events (not yet linked to Google) that ARE this Google event → moved under the Google source. */
  events: { local: CalendarEvent; remote: RemoteEvent }[]
  /** Trip items that represent this Google event → linked (kept, shown through the synced event). */
  tripItems: { item: TripItem; remote: RemoteEvent }[]
}

export function planAdoption(db: Pick<DB, 'events' | 'tripItems'>, remote: RemoteEvent[]): Adoption {
  const linked = new Set(db.events.filter((e) => e.external?.provider === 'google').map((e) => e.external!.externalId))
  const linkedItems = new Set(db.tripItems.map((i) => i.linkedExternalId).filter(Boolean))
  const out: Adoption = { events: [], tripItems: [] }
  const taken = new Set<string>()
  for (const r of remote) {
    if (r.deleted || linked.has(r.externalId)) continue
    const ev = db.events.find(
      (e) =>
        !e.external &&
        !e.recurrence &&
        !taken.has(e.id) &&
        e.date === r.date &&
        (sameUrl(e.url, r.url) || (!!e.startTime && e.startTime === r.startTime && shared(e.title, r.title) >= 1) || shared(e.title, r.title) >= 2),
    )
    if (ev) {
      taken.add(ev.id)
      out.events.push({ local: ev, remote: r })
      continue
    }
    if (linkedItems.has(r.externalId)) continue
    const item = db.tripItems.find(
      (i) => !i.linkedExternalId && i.date === r.date && i.status !== 'cancelado' && !taken.has(i.id) && (shared(i.title, r.title) >= 2 || (!!i.time && i.time === r.startTime && shared(i.title, r.title) >= 1)),
    )
    if (item) {
      taken.add(item.id)
      out.tripItems.push({ item, remote: r })
    }
  }
  return out
}

// ─── Run ────────────────────────────────────────────────────────────────────

export type GcalState = 'desconectado' | 'sincronizando' | 'conectado' | 'erro'
export interface GcalStatus {
  state: GcalState
  /** Why (pt-BR), when not connected / on error. */
  message?: string
  lastSync?: string
  report?: SyncReport & { adopted: number; linked: number }
}

/** The minimal slice of the mcp namespace this needs (claude.d.ts / mcp.d.ts, contract 0.2.82). */
export interface McpLike {
  callTool(server: string, tool: string, input?: unknown, options?: { cache?: false }): Promise<{ payload?: unknown }>
}

function ensureSource(db: DB): void {
  if (db.calendarSources.some((s) => s.id === GCAL_SOURCE_ID)) return
  actions.create('calendarSources', { id: GCAL_SOURCE_ID, provider: 'google', name: 'Google Calendar', syncDirection: 'read', color: 'var(--ocean)', enabled: true } as Omit<CalendarSource, 'createdAt' | 'updatedAt'> as never)
}

const ERROR_TEXT: Record<string, string> = {
  needs_reauth: 'A conexão do Notion Calendar expirou — reconecte em claude.ai → Ajustes → Conectores.',
  server_not_connected: 'O conector Notion (que lê teu Google Calendar) não está conectado em claude.ai → Ajustes → Conectores.',
  not_in_manifest: 'Tu não permitiste o conector para este app. Permite em “Permissões” do artifact para sincronizar.',
  approval_required: 'Falta tua aprovação para ler o calendário — toca em “Sincronizar agora”.',
  not_granted: 'Este modo de abrir o app não tem acesso a conectores — abra pelo claude.ai.',
  capability_disabled: 'Este modo de abrir o app não tem acesso a conectores — abra pelo claude.ai.',
}

/** One real sync: read Google (via the connector), adopt equal local records, reconcile, record the time. */
export async function syncGoogleCalendar(mcp: McpLike, today: DateKey): Promise<GcalStatus> {
  const from = addDays(today, -GCAL_WINDOW.back)
  const to = addDays(today, GCAL_WINDOW.ahead)
  let payload: NcPayload
  try {
    const r = await mcp.callTool(GCAL_SERVER, GCAL_TOOL, { timeMin: `${from}T00:00:00Z`, timeMax: `${to}T23:59:59Z`, timeZone: 'UTC' }, { cache: false })
    payload = (r.payload ?? {}) as NcPayload
  } catch (e) {
    const code = (e as { code?: string })?.code ?? 'upstream_error'
    return { state: ERROR_TEXT[code] && code !== 'approval_required' ? 'desconectado' : 'erro', message: ERROR_TEXT[code] ?? `Não consegui ler o Google Calendar agora (${code}). Nada foi alterado.` }
  }
  const db = getDB()
  if (!payload.accounts?.some((a) => a.providerName === 'google')) return { state: 'desconectado', message: 'O Notion Calendar não tem uma conta Google conectada.' }
  ensureSource(db)
  const remote = mapPayload(payload, db)
  const now = nowISO()
  // Adopt what she already had, so nothing is duplicated.
  const adoption = planAdoption(getDB(), remote)
  for (const { local, remote: r } of adoption.events) {
    actions.update('events', local.id, { sourceId: GCAL_SOURCE_ID, external: { provider: 'google', externalId: r.externalId, syncStatus: 'synced', syncHash: '', lastSyncedAt: now, webUrl: r.webUrl } })
  }
  const fromItem = new Map(adoption.tripItems.map((x) => [x.remote.externalId, x.item]))
  for (const { item, remote: r } of adoption.tripItems) actions.update('tripItems', item.id, { linkedExternalId: r.externalId })
  const report = applyCalendarEvents(GCAL_SOURCE_ID, remote, {
    fullSync: true,
    range: { from, to },
    now,
    remoteWins: true,
    seed: (r) => {
      const item = fromItem.get(r.externalId)
      const trip = travelTripOn(getDB(), r.date)
      return {
        tripId: item?.tripId ?? trip?.id,
        notes: item ? [item.notes, item.contact ? `Contato: ${item.contact}` : undefined].filter(Boolean).join('\n') || undefined : undefined,
        kind: item ? 'trabalho' : undefined,
      }
    },
  })
  return { state: 'conectado', lastSync: now, report: { ...report, adopted: adoption.events.length, linked: adoption.tripItems.length } }
}
