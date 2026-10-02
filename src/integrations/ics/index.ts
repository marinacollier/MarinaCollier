/**
 * ICS (iCalendar, RFC 5545) import/export. Works fully offline, no backend.
 * Owner: Integrations agent. Signatures are part of the shared contract (Agenda calls them).
 *
 * Supported on import: line unfolding, VEVENT (VALARM ignored), SUMMARY/LOCATION/URL/UID,
 * DTSTART/DTEND/DURATION, all-day (VALUE=DATE, exclusive DTEND), UTC 'Z', TZID (IANA, Windows
 * names from Outlook, vendor-prefixed ids), floating times (= São Paulo), STATUS:CANCELLED,
 * RRULE DAILY/WEEKLY/MONTHLY/YEARLY:
 *   - open-ended and representable → `recurrence` (Recurrence rule)
 *   - finite (COUNT/UNTIL) → expanded into dated instances (with EXDATE and RECURRENCE-ID overrides)
 *   - anything else → first occurrence only.
 */
import { actions, getDB } from '@/data/store'
import type { CalendarEvent, DateKey, Recurrence, TimeHM, Weekday } from '@/data/types'
import { addDays, daysInMonth, diffDays, startOfWeek, toInstant, weekday } from '@/lib/date'
import { normalize } from '@/lib/text'
import { applyCalendarEvents, isHiddenBySync, syncHash } from '../sync'
import { resolveTimeZone, toSaoPaulo, wallTimeToInstant } from '../tz'
import type { RemoteEvent, SyncReport } from '../types'

// ─── Lexing ─────────────────────────────────────────────────────────────────

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

function unfold(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter((l) => l.trim() !== '')
}

function splitOutsideQuotes(s: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (ch === sep && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function parseLine(line: string): Prop | null {
  let quoted = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') quoted = !quoted
    else if (ch === ':' && !quoted) {
      colon = i
      break
    }
  }
  if (colon < 0) return null
  const [rawName, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ';')
  const params: Record<string, string> = {}
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: rawName.toUpperCase(), params, value: line.slice(colon + 1) }
}

export function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

export function escapeText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// ─── Values ─────────────────────────────────────────────────────────────────

type DateVal = { kind: 'date'; date: DateKey } | { kind: 'datetime'; instant: Date }

function parseDateValue(value: string, params: Record<string, string>): DateVal | null {
  const v = value.trim()
  const d = v.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (d || params.VALUE === 'DATE') {
    if (!d) return null
    return { kind: 'date', date: `${d[1]}-${d[2]}-${d[3]}` }
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/)
  if (!m) return null
  const [y, mo, da, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number)
  if (m[7]) return { kind: 'datetime', instant: new Date(Date.UTC(y, mo - 1, da, h, mi, s)) }
  const tz = resolveTimeZone(params.TZID) ?? 'America/Sao_Paulo'
  return { kind: 'datetime', instant: wallTimeToInstant(y, mo, da, h, mi, s, tz) }
}

/** RFC 5545 DURATION → { days, ms } (weeks/days kept separate from clock time). */
export function parseDuration(v: string): { days: number; ms: number } | null {
  const m = v.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const days = (Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * sign
  const ms = ((Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)) * 60 + Number(m[6] ?? 0)) * 1000 * sign
  return { days, ms }
}

const BYDAY: Record<string, Weekday> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
const BYDAY_REV = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | string
  interval: number
  byDay?: string[]
  byMonthDay?: number[]
  count?: number
  until?: DateKey
  other: string[]
}

function parseRRule(v: string): RRule {
  const parts: Record<string, string> = {}
  for (const kv of v.split(';')) {
    const [k, val] = kv.split('=')
    if (k && val !== undefined) parts[k.toUpperCase()] = val
  }
  let until: DateKey | undefined
  if (parts.UNTIL) {
    const u = parseDateValue(parts.UNTIL, {})
    until = u ? (u.kind === 'date' ? u.date : toSaoPaulo(u.instant).date) : undefined
  }
  const known = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'COUNT', 'UNTIL', 'WKST'])
  return {
    freq: parts.FREQ ?? '',
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    byDay: parts.BYDAY ? parts.BYDAY.split(',').map((s) => s.trim().toUpperCase()) : undefined,
    byMonthDay: parts.BYMONTHDAY ? parts.BYMONTHDAY.split(',').map(Number) : undefined,
    count: parts.COUNT ? Number(parts.COUNT) : undefined,
    until,
    other: Object.keys(parts).filter((k) => !known.has(k)),
  }
}

function plainWeekdays(byDay: string[] | undefined): Weekday[] | null {
  if (!byDay) return null
  const out: Weekday[] = []
  for (const d of byDay) {
    if (!(d in BYDAY)) return null // e.g. "2TU" (ordinal) → not a plain weekly rule
    out.push(BYDAY[d])
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/** Open-ended rule → Recurrence, when it maps exactly. */
function toRecurrence(rule: RRule, start: DateKey): Recurrence | null {
  if (rule.count !== undefined || rule.until || rule.other.length) return null
  switch (rule.freq) {
    case 'DAILY':
      if (rule.byDay || rule.byMonthDay) return null
      return rule.interval === 1 ? { kind: 'daily' } : { kind: 'every_n_days', days: rule.interval, anchor: start }
    case 'WEEKLY': {
      if (rule.interval !== 1 || rule.byMonthDay) return null
      const days = rule.byDay ? plainWeekdays(rule.byDay) : [weekday(start)]
      return days && days.length ? { kind: 'weekly', weekdays: days } : null
    }
    case 'MONTHLY': {
      if (rule.interval !== 1 || rule.byDay) return null
      const md = rule.byMonthDay ?? [Number(start.slice(8, 10))]
      if (md.length !== 1) return null
      if (md[0] === -1) return { kind: 'monthly', dayOfMonth: 'last' }
      return md[0] >= 1 && md[0] <= 31 ? { kind: 'monthly', dayOfMonth: md[0] } : null
    }
    default:
      return null
  }
}

const MAX_INSTANCES = 400
const MAX_SPAN_DAYS = 3 * 366

/** Finite rule → dated instances (or null when the pattern is not supported). */
function expandRule(rule: RRule, start: DateKey): DateKey[] | null {
  if (rule.count === undefined && !rule.until) return null
  if (rule.other.length) return null
  const startDom = Number(start.slice(8, 10))
  let matches: (d: DateKey) => boolean
  switch (rule.freq) {
    case 'DAILY':
      if (rule.byDay || rule.byMonthDay) return null
      matches = (d) => diffDays(start, d) % rule.interval === 0
      break
    case 'WEEKLY': {
      const days = rule.byDay ? plainWeekdays(rule.byDay) : [weekday(start)]
      if (!days || rule.byMonthDay) return null
      const w0 = startOfWeek(start)
      matches = (d) => days.includes(weekday(d)) && (diffDays(w0, startOfWeek(d)) / 7) % rule.interval === 0
      break
    }
    case 'MONTHLY': {
      if (rule.byDay) return null
      const mds = rule.byMonthDay ?? [startDom]
      matches = (d) => {
        const months = (Number(d.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(start.slice(5, 7))
        if (months % rule.interval !== 0) return false
        const dom = Number(d.slice(8, 10))
        const dim = daysInMonth(d)
        return mds.some((m) => (m > 0 ? m === dom : dim + m + 1 === dom))
      }
      break
    }
    case 'YEARLY':
      if (rule.byDay || rule.byMonthDay) return null
      matches = (d) => d.slice(5) === start.slice(5) && (Number(d.slice(0, 4)) - Number(start.slice(0, 4))) % rule.interval === 0
      break
    default:
      return null
  }
  const out: DateKey[] = []
  for (let i = 0; i <= MAX_SPAN_DAYS && out.length < MAX_INSTANCES; i++) {
    const d = addDays(start, i)
    if (rule.until && d > rule.until) break
    if (i > 0 && !matches(d)) continue
    out.push(d)
    if (rule.count !== undefined && out.length >= rule.count) break
  }
  return out
}

// ─── Parse ──────────────────────────────────────────────────────────────────

interface RawEvent {
  props: Prop[]
}

function first(ev: RawEvent, name: string): Prop | undefined {
  return ev.props.find((p) => p.name === name)
}

function all(ev: RawEvent, name: string): Prop[] {
  return ev.props.filter((p) => p.name === name)
}

interface Built {
  uid: string
  event: RemoteEvent
  rule?: RRule
  exdates: Set<DateKey>
  recurrenceId?: DateKey
}

function buildEvent(ev: RawEvent): Built | null {
  const dtstart = first(ev, 'DTSTART')
  if (!dtstart) return null
  const start = parseDateValue(dtstart.value, dtstart.params)
  if (!start) return null
  const title = unescapeText(first(ev, 'SUMMARY')?.value ?? '').trim() || '(sem título)'
  const location = unescapeText(first(ev, 'LOCATION')?.value ?? '').trim() || undefined
  const url = first(ev, 'URL')?.value.trim() || undefined
  const dtend = first(ev, 'DTEND')
  const end = dtend ? parseDateValue(dtend.value, dtend.params) : null
  const duration = first(ev, 'DURATION') ? parseDuration(first(ev, 'DURATION')!.value) : null

  let event: Omit<RemoteEvent, 'externalId'>
  if (start.kind === 'date') {
    let endDate: DateKey | undefined
    if (end?.kind === 'date') endDate = addDays(end.date, -1)
    else if (duration && duration.days > 1) endDate = addDays(start.date, duration.days - 1)
    event = { title, date: start.date, allDay: true, endDate: endDate && endDate > start.date ? endDate : undefined }
  } else {
    const s = toSaoPaulo(start.instant)
    let endInstant: Date | undefined
    if (end) endInstant = end.kind === 'datetime' ? end.instant : toInstant(end.date)
    else if (duration) endInstant = new Date(start.instant.getTime() + duration.days * 86_400_000 + duration.ms)
    let endTime: TimeHM | undefined
    let endDate: DateKey | undefined
    if (endInstant && endInstant > start.instant) {
      const e = toSaoPaulo(endInstant)
      if (e.date === s.date) endTime = e.time
      else if (e.time === '00:00' && diffDays(s.date, e.date) === 1) endTime = '23:59'
      else {
        endDate = e.date
        endTime = e.time
      }
    }
    event = { title, date: s.date, startTime: s.time, endTime, endDate, allDay: false }
  }

  const status = first(ev, 'STATUS')?.value.trim().toUpperCase()
  const lastMod = first(ev, 'LAST-MODIFIED')
  const lm = lastMod ? parseDateValue(lastMod.value, lastMod.params) : null
  const rawUid = first(ev, 'UID')?.value.trim()
  const uid = rawUid || `marina-${syncHash({ title, d: dtstart.value })}`
  const rrule = first(ev, 'RRULE')
  const exdates = new Set<DateKey>()
  for (const p of all(ev, 'EXDATE')) {
    for (const v of p.value.split(',')) {
      const x = parseDateValue(v, p.params)
      if (x) exdates.add(x.kind === 'date' ? x.date : toSaoPaulo(x.instant).date)
    }
  }
  const rid = first(ev, 'RECURRENCE-ID')
  const ridVal = rid ? parseDateValue(rid.value, rid.params) : null

  return {
    uid,
    rule: rrule ? parseRRule(rrule.value) : undefined,
    exdates,
    recurrenceId: ridVal ? (ridVal.kind === 'date' ? ridVal.date : toSaoPaulo(ridVal.instant).date) : undefined,
    event: {
      ...event,
      externalId: uid,
      globalId: rawUid || undefined,
      location,
      url,
      updatedAt: lm?.kind === 'datetime' ? lm.instant.toISOString() : undefined,
      deleted: status === 'CANCELLED' || undefined,
    },
  }
}

/** Parse an .ics file into normalized events (São Paulo dates/times). */
export function parseICS(text: string): RemoteEvent[] {
  const lines = unfold(text)
  const raws: RawEvent[] = []
  let current: RawEvent | null = null
  let nested = 0
  for (const line of lines) {
    const p = parseLine(line)
    if (!p) continue
    if (p.name === 'BEGIN') {
      const comp = p.value.trim().toUpperCase()
      if (comp === 'VEVENT' && !current) current = { props: [] }
      else if (current) nested++
      continue
    }
    if (p.name === 'END') {
      const comp = p.value.trim().toUpperCase()
      if (current && nested > 0) nested--
      else if (current && comp === 'VEVENT') {
        raws.push(current)
        current = null
      }
      continue
    }
    if (current && nested === 0) current.props.push(p)
  }

  const built = raws.map(buildEvent).filter((b): b is Built => !!b)
  const overrides = new Map<string, Built>()
  for (const b of built) if (b.recurrenceId) overrides.set(`${b.uid}::${b.recurrenceId}`, b)

  const out: RemoteEvent[] = []
  for (const b of built) {
    if (b.recurrenceId) continue // handled with its master below
    const ev = b.event
    if (!b.rule || ev.deleted) {
      out.push(ev)
      continue
    }
    const rec = toRecurrence(b.rule, ev.date)
    if (rec) {
      out.push({ ...ev, recurrence: rec })
      continue
    }
    const dates = expandRule(b.rule, ev.date)
    if (!dates) {
      out.push(ev) // not representable: first occurrence only
      continue
    }
    const span = ev.endDate ? diffDays(ev.date, ev.endDate) : 0
    for (const d of dates) {
      if (b.exdates.has(d)) continue
      const id = `${b.uid}::${d}`
      const ov = overrides.get(id)
      if (ov) {
        out.push({ ...ov.event, externalId: id, globalId: ev.globalId })
        continue
      }
      out.push({ ...ev, externalId: id, date: d, endDate: span ? addDays(d, span) : undefined })
    }
  }
  return out
}

// ─── Serialize ──────────────────────────────────────────────────────────────

const enc = new TextEncoder()

/** Fold a content line at 75 octets without splitting UTF-8 characters (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    const limit = out.length === 0 ? 75 : 74 // continuation lines start with a space
    if (bytes + n > limit) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

const dateStamp = (k: DateKey) => k.replace(/-/g, '')

function rrule(rec: Recurrence): string {
  switch (rec.kind) {
    case 'daily':
      return 'FREQ=DAILY'
    case 'weekly':
      return `FREQ=WEEKLY;BYDAY=${rec.weekdays.map((w) => BYDAY_REV[w]).join(',')}`
    case 'monthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${rec.dayOfMonth === 'last' ? -1 : rec.dayOfMonth}`
    case 'every_n_days':
      return `FREQ=DAILY;INTERVAL=${rec.days}`
  }
}

/** Serialize events to an .ics document. Events deleted remotely are left out. */
export function toICS(events: CalendarEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MARINA OS//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const e of events) {
    if (isHiddenBySync(e)) continue
    const uid = e.external?.globalId ?? (e.external?.provider === 'ics' ? e.external.externalId : `${e.id}@marina-os`)
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${utcStamp(new Date(e.updatedAt || Date.now()))}`)
    if (e.allDay || !e.startTime) {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(e.date)}`)
      lines.push(`DTEND;VALUE=DATE:${dateStamp(addDays(e.endDate ?? e.date, 1))}`)
    } else {
      lines.push(`DTSTART:${utcStamp(toInstant(e.date, e.startTime))}`)
      if (e.endTime) {
        let endDate = e.endDate ?? e.date
        if (!e.endDate && e.endTime < e.startTime) endDate = addDays(e.date, 1)
        lines.push(`DTEND:${utcStamp(toInstant(endDate, e.endTime))}`)
      }
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`)
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`)
    if (e.notes) lines.push(`DESCRIPTION:${escapeText(e.notes)}`)
    if (e.url) lines.push(`URL:${e.url}`)
    if (e.recurrence) lines.push(`RRULE:${rrule(e.recurrence)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

// ─── Import into the store ──────────────────────────────────────────────────

/** Find (by normalized name) or create the CalendarSource for an imported .ics. Returns its id. */
export function ensureICSSource(sourceName: string, icsUrl?: string): string {
  const name = sourceName.trim() || 'Agenda importada'
  const existing = getDB().calendarSources.find((s) => s.provider === 'ics' && normalize(s.name) === normalize(name))
  if (existing) return existing.id
  return actions.create('calendarSources', {
    provider: 'ics',
    name,
    syncDirection: 'read',
    color: 'ocean',
    enabled: true,
    icsUrl,
  }).id
}

/**
 * Import an .ics text into the store as a CalendarSource (provider 'ics') + events,
 * deduplicating by provider/externalId and globalId (iCalUID). Returns what happened.
 * Re-importing the same calendar updates it; events missing from the new file are hidden
 * (syncStatus 'deleted_remotely'), never hard-deleted.
 */
export function importICSText(text: string, sourceName: string): SyncReport {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Esse arquivo não parece um calendário .ics')
  const events = parseICS(text)
  const sourceId = ensureICSSource(sourceName)
  return applyCalendarEvents(sourceId, events, { fullSync: true })
}
