/**
 * Provider payload → minimized wire shapes. Pure, no Deno APIs (unit-tested from
 * src/integrations/server-mappers.test.ts). Fields we do not need (descriptions, attendees,
 * bodies, previews) are dropped here and never leave the function.
 */
import { classifyMessage } from './classify.ts'
import { addDays, toSaoPaulo } from './tz.ts'
import type { WireAccount, WireActionCandidate, WireCalendar, WireCategory, WireEvent, WireTransaction } from './types.ts'

// ─── Google Calendar API v3 ─────────────────────────────────────────────────
// https://developers.google.com/workspace/calendar/api/v3/reference/events

export interface GoogleEventDateTime {
  date?: string
  dateTime?: string
  timeZone?: string
}

export interface GoogleEvent {
  id: string
  iCalUID?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  location?: string
  htmlLink?: string
  updated?: string
  start?: GoogleEventDateTime
  end?: GoogleEventDateTime
}

export interface GoogleCalendarListEntry {
  id: string
  summary?: string
  summaryOverride?: string
  backgroundColor?: string
  primary?: boolean
}

export function mapGoogleCalendar(c: GoogleCalendarListEntry): WireCalendar {
  return { externalId: c.id, name: c.summaryOverride ?? c.summary ?? c.id, color: c.backgroundColor, primary: !!c.primary }
}

function timedRange(startISO: string, endISO?: string) {
  const s = toSaoPaulo(new Date(startISO))
  const out: Pick<WireEvent, 'date' | 'startTime' | 'endTime' | 'endDate'> = { date: s.date, startTime: s.time }
  if (endISO) {
    const endD = new Date(endISO)
    if (endD.getTime() > new Date(startISO).getTime()) {
      const e = toSaoPaulo(endD)
      if (e.date === s.date) out.endTime = e.time
      else if (e.time === '00:00' && addDays(s.date, 1) === e.date) out.endTime = '23:59'
      else {
        out.endDate = e.date
        out.endTime = e.time
      }
    }
  }
  return out
}

export function mapGoogleEvent(e: GoogleEvent): WireEvent {
  if (e.status === 'cancelled') {
    // Incremental sync returns cancelled items possibly without start/end.
    const date = e.start?.date ?? (e.start?.dateTime ? toSaoPaulo(new Date(e.start.dateTime)).date : '')
    return { externalId: e.id, globalId: e.iCalUID, title: e.summary ?? '', date, allDay: !!e.start?.date, deleted: true }
  }
  const base = {
    externalId: e.id,
    globalId: e.iCalUID,
    title: e.summary?.trim() || '(sem título)',
    location: e.location || undefined,
    url: e.htmlLink,
    updatedAt: e.updated,
  }
  if (e.start?.date) {
    const endInclusive = e.end?.date ? addDays(e.end.date, -1) : e.start.date
    return { ...base, date: e.start.date, allDay: true, endDate: endInclusive > e.start.date ? endInclusive : undefined }
  }
  return { ...base, allDay: false, ...timedRange(e.start!.dateTime!, e.end?.dateTime) }
}

// ─── Microsoft Graph ────────────────────────────────────────────────────────
// https://learn.microsoft.com/en-us/graph/api/resources/event

export interface GraphDateTimeTimeZone {
  dateTime: string
  timeZone: string
}

export interface GraphEvent {
  id: string
  iCalUId?: string
  subject?: string
  isAllDay?: boolean
  isCancelled?: boolean
  start?: GraphDateTimeTimeZone
  end?: GraphDateTimeTimeZone
  location?: { displayName?: string }
  webLink?: string
  lastModifiedDateTime?: string
  '@removed'?: { reason: string }
}

/** Requests are sent with `Prefer: outlook.timezone="UTC"`, so dateTime is UTC wall-clock without offset. */
function graphUTC(dt: string): string {
  return `${dt.slice(0, 19)}Z`
}

export function mapGraphEvent(e: GraphEvent): WireEvent {
  if (e['@removed'] || e.isCancelled) {
    const date = e.start ? (e.isAllDay ? e.start.dateTime.slice(0, 10) : toSaoPaulo(new Date(graphUTC(e.start.dateTime))).date) : ''
    return { externalId: e.id, globalId: e.iCalUId, title: e.subject ?? '', date, allDay: !!e.isAllDay, deleted: true }
  }
  const base = {
    externalId: e.id,
    globalId: e.iCalUId,
    title: e.subject?.trim() || '(sem título)',
    location: e.location?.displayName || undefined,
    url: e.webLink,
    updatedAt: e.lastModifiedDateTime,
  }
  if (e.isAllDay) {
    // All-day events are midnight-to-midnight dates; end is exclusive.
    const date = e.start!.dateTime.slice(0, 10)
    const endInclusive = e.end ? addDays(e.end.dateTime.slice(0, 10), -1) : date
    return { ...base, date, allDay: true, endDate: endInclusive > date ? endInclusive : undefined }
  }
  return { ...base, allDay: false, ...timedRange(graphUTC(e.start!.dateTime), e.end ? graphUTC(e.end.dateTime) : undefined) }
}

export interface GraphCalendar {
  id: string
  name: string
  hexColor?: string
  isDefaultCalendar?: boolean
}

export function mapGraphCalendar(c: GraphCalendar): WireCalendar {
  return { externalId: c.id, name: c.name, color: c.hexColor || undefined, primary: !!c.isDefaultCalendar }
}

/** Fields requested with $select (Mail.ReadBasic never returns body/bodyPreview anyway). */
export const GRAPH_MESSAGE_SELECT = 'id,subject,from,receivedDateTime,webLink,importance,flag,isRead'

export interface GraphMessage {
  id: string
  subject?: string
  from?: { emailAddress?: { name?: string; address?: string } }
  receivedDateTime: string
  webLink?: string
  importance?: 'low' | 'normal' | 'high'
  flag?: { flagStatus?: 'notFlagged' | 'flagged' | 'complete' }
  isRead?: boolean
}

/** Only actionable-looking messages become candidates. */
export function mapGraphMessage(m: GraphMessage): WireActionCandidate | null {
  const subject = m.subject?.trim() || '(sem assunto)'
  const kind = classifyMessage({ subject, flagged: m.flag?.flagStatus === 'flagged', importance: m.importance })
  if (!kind) return null
  return {
    externalId: m.id,
    source: 'outlook',
    subject,
    sender: m.from?.emailAddress?.name || m.from?.emailAddress?.address,
    receivedAt: m.receivedDateTime,
    webUrl: m.webLink,
    suggestedKind: kind,
  }
}

// https://learn.microsoft.com/en-us/graph/api/resources/chatmessage
export interface GraphChatMessage {
  id: string
  createdDateTime: string
  webUrl?: string
  messageType?: string
  deletedDateTime?: string | null
  from?: { user?: { id?: string; displayName?: string } | null } | null
  mentions?: { mentioned?: { user?: { id?: string } | null } | null }[]
}

export interface GraphChat {
  id: string
  topic?: string | null
  chatType?: 'oneOnOne' | 'group' | 'meeting'
  webUrl?: string
}

/** A chat message that @mentions `meId` → candidate. The message text is never read into the output. */
export function mapTeamsMention(chat: GraphChat, msg: GraphChatMessage, meId: string): WireActionCandidate | null {
  if (msg.deletedDateTime || (msg.messageType && msg.messageType !== 'message')) return null
  const mentioned = (msg.mentions ?? []).some((m) => m.mentioned?.user?.id === meId)
  if (!mentioned) return null
  const who = msg.from?.user?.displayName
  const where = chat.topic || (chat.chatType === 'oneOnOne' ? `Chat com ${who ?? 'alguém'}` : 'Chat em grupo')
  return {
    externalId: `${chat.id}/${msg.id}`,
    source: 'teams',
    subject: `Menção em ${where}`,
    sender: who,
    receivedAt: msg.createdDateTime,
    webUrl: msg.webUrl ?? chat.webUrl,
    suggestedKind: 'mencao',
  }
}

// ─── Organizze API v2 ───────────────────────────────────────────────────────
// https://github.com/organizze/api-doc

export interface OrganizzeAccount {
  id: number
  name: string
  type?: 'checking' | 'savings' | 'other' | string
  archived?: boolean
}

export interface OrganizzeCreditCard {
  id: number
  name: string
  closing_day?: number
  due_day?: number
  archived?: boolean
}

export interface OrganizzeCategory {
  id: number
  name: string
}

export interface OrganizzeTransaction {
  id: number
  description: string
  date: string
  paid: boolean
  amount_cents: number
  account_id?: number
  account_type?: 'Account' | 'CreditCard' | string
  category_id?: number
  updated_at?: string
}

export const organizzeAccountId = (id: number) => `acc-${id}`
export const organizzeCardId = (id: number) => `cc-${id}`

export function mapOrganizzeAccount(a: OrganizzeAccount): WireAccount {
  return { externalId: organizzeAccountId(a.id), name: a.name, kind: a.type === 'other' ? 'outro' : 'conta' }
}

export function mapOrganizzeCard(c: OrganizzeCreditCard): WireAccount {
  return { externalId: organizzeCardId(c.id), name: c.name, kind: 'cartao', closingDay: c.closing_day, dueDay: c.due_day }
}

export function mapOrganizzeCategory(c: OrganizzeCategory): WireCategory {
  return { externalId: String(c.id), name: c.name }
}

export function mapOrganizzeTransaction(t: OrganizzeTransaction): WireTransaction {
  const acc =
    t.account_id === undefined ? undefined : t.account_type === 'CreditCard' ? organizzeCardId(t.account_id) : organizzeAccountId(t.account_id)
  return {
    externalId: String(t.id),
    description: t.description ?? '',
    amountCents: t.amount_cents,
    date: t.date,
    paid: !!t.paid,
    categoryExternalId: t.category_id === undefined || t.category_id === null ? undefined : String(t.category_id),
    accountExternalId: acc,
    updatedAt: t.updated_at,
  }
}
