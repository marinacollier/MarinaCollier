/**
 * create_calendar_event — the ONE way an event enters the MARINA OS calendar from Lumos, whatever the
 * channel (typed, spoken, or read from a print/PDF). Drafts never carry invented fields: what isn't in
 * the source stays empty and `missing` says what to ask.
 *
 *   eventDraftFromText("aniversário da Ana sábado 20h no Bar X", today)
 *   → { title: 'Aniversário da Ana', date: <next Saturday>, startTime: '20:00', location: 'Bar X', missing: [] }
 */
import { logLife } from '../intel/log'
import { SEED_IDS } from '../seed/ids'
import { actions, getDB } from '../store'
import type { CalendarEvent, DateKey, DB, ID, TimeHM } from '../types'
import { addDays, formatDayMonth, hmToMinutes, minutesToHM, weekday } from '@/lib/date'

/** The seed's own "MARINA OS" calendar (the same one the Agenda saves into). */
export const LOCAL_SOURCE_ID = SEED_IDS.sourceLocal

export type DraftField = 'title' | 'date' | 'month' | 'time'

export interface EventDraft {
  title?: string
  date?: DateKey
  startTime?: TimeHM
  endTime?: TimeHM
  location?: string
  description?: string
  /** Kept only as a reference (name/kind) — the file itself is not stored by this. */
  sourceAttachment?: { name: string; kind: 'image' | 'pdf' | 'other' }
  confidence: 'high' | 'medium' | 'low'
  /** What the source did not say (never filled in by guessing). */
  missing: DraftField[]
  /** For "17 de qual mês?": the day number she has to place. */
  dayOfMonth?: number
}

/** Make sure the local "MARINA OS" calendar exists before saving into it. */
export function ensureLocalSource(): void {
  if (getDB().calendarSources.some((s) => s.id === LOCAL_SOURCE_ID)) return
  actions.create('calendarSources', { id: LOCAL_SOURCE_ID, provider: 'local', name: 'MARINA OS', color: 'var(--accent)', syncDirection: 'none', enabled: true })
}

const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (t: string) => fold(t).replace(/\s+/g, ' ').trim()

/** Same title (accent/case-insensitive) on the same day = the same event. */
export function findSameEvent(db: DB, d: Pick<EventDraft, 'title' | 'date'>): CalendarEvent | undefined {
  if (!d.title || !d.date) return undefined
  return db.events.find((e) => e.date === d.date && norm(e.title) === norm(d.title!))
}

export function draftComplete(d: EventDraft): boolean {
  return !!d.title && !!d.date && !d.missing.includes('month')
}

/** Creates the event (all-day when there's no time) and logs it. Returns an undo. */
export function createCalendarEvent(d: EventDraft, by: 'marina' | 'lumos' = 'lumos'): { event: CalendarEvent; undo: () => void } {
  if (!d.title || !d.date) throw new Error('event draft incomplete')
  ensureLocalSource()
  const event = actions.create('events', {
    sourceId: LOCAL_SOURCE_ID,
    title: d.title,
    date: d.date,
    startTime: d.startTime,
    endTime: d.endTime ?? (d.startTime ? minutesToHM(Math.min(hmToMinutes(d.startTime) + 120, 23 * 60 + 59)) : undefined),
    allDay: !d.startTime,
    location: d.location,
    notes: [d.description, d.sourceAttachment ? `Lido de ${d.sourceAttachment.kind === 'pdf' ? 'um PDF' : 'um print'} (${d.sourceAttachment.name})` : undefined].filter(Boolean).join('\n') || undefined,
    kind: 'pessoal',
  })
  const log = logLife({ kind: 'created', date: d.date, title: `Na agenda: ${d.title} (${formatDayMonth(d.date)}${d.startTime ? ` · ${d.startTime}` : ''})`, area: 'rotina', ref: { type: 'event', id: event.id }, by, provenance: d.sourceAttachment ? 'inference' : 'user' })
  return {
    event,
    undo: () => {
      log.undo()
      actions.remove('events', event.id)
    },
  }
}

export function removeEvent(id: ID): void {
  actions.remove('events', id)
}

// ─── Reading pt-BR text (typed, spoken, or OCR/vision text) ─────────────────

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS: [RegExp, number][] = [
  [/\bdomingo\b/, 0],
  [/\bsegunda(?:-feira)?\b/, 1],
  [/\bterca(?:-feira)?\b/, 2],
  [/\bquarta(?:-feira)?\b/, 3],
  [/\bquinta(?:-feira)?\b/, 4],
  [/\bsexta(?:-feira)?\b/, 5],
  [/\bsabado\b/, 6],
]
const HOUR_WORDS: Record<string, number> = { uma: 1, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, meio: 12 }

const pad = (n: number) => String(n).padStart(2, '0')
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const valid = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export interface DateRead {
  date?: DateKey
  /** A day number with no month and nothing to pin it: ask "17 de qual mês?". */
  needsMonth?: number
}

/**
 * Dates as people write them on invites and say them: "17/10", "17/10/2026", "17 de outubro",
 * "17 out", "sábado, 17 de outubro", "sábado (17)", "amanhã", "hoje", "sábado".
 * `strict` (reading someone else's invite): a bare "dia 17" with no month/weekday is NOT guessed.
 */
export function readDate(text: string, today: DateKey, strict = false): DateRead {
  const n = fold(text)
  const [ty, tm] = today.split('-').map(Number)
  const year = (m: number, d: number, y?: number) => {
    if (y) return y < 100 ? 2000 + y : y
    // The next occurrence of that day (an invite is for the future).
    return key(ty, m, d) >= today ? ty : ty + 1
  }
  let m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(n)
  if (m) {
    const d = +m[1]
    const mo = +m[2]
    const y = year(mo, d, m[3] ? +m[3] : undefined)
    if (valid(y, mo, d)) return { date: key(y, mo, d) }
  }
  m = new RegExp(`\\b(\\d{1,2})(?:º|o)?\\s*(?:de\\s+)?(${MONTHS.join('|')}|${MONTH_ABBR.join('|')})\\.?(?:\\s*(?:de\\s+)?(\\d{4}))?\\b`).exec(n)
  if (m) {
    const d = +m[1]
    const mi = MONTHS.indexOf(m[2]) >= 0 ? MONTHS.indexOf(m[2]) : MONTH_ABBR.indexOf(m[2])
    const y = year(mi + 1, d, m[3] ? +m[3] : undefined)
    if (valid(y, mi + 1, d)) return { date: key(y, mi + 1, d) }
  }
  if (/\bdepois de amanha\b/.test(n)) return { date: addDays(today, 2) }
  if (/\bamanha\b/.test(n)) return { date: addDays(today, 1) }
  if (/\bhoje\b/.test(n)) return { date: today }
  const wd = WEEKDAYS.find(([re]) => re.test(n))?.[1]
  const dayNum = /\b(?:dia\s+)?(\d{1,2})\b(?!\s*(?:h|:|horas|km|min|anos|reais|mil|%|\/))/.exec(n.replace(/\b\d{1,2}(?::\d{2}|h\d{0,2})\b/g, ' '))
  const dom = dayNum && /\bdia\s+\d|,\s*\d{1,2}\b|\(\d{1,2}\)/.test(n) ? +dayNum[1] : undefined
  if (wd !== undefined && dom) {
    // "sábado, dia 17": the month whose 17th is a Saturday (within the next ~3 months) — if exactly one.
    const hits: DateKey[] = []
    for (let i = 0; i < 100; i++) {
      const d = addDays(today, i)
      if (+d.slice(8) === dom && weekday(d) === wd) hits.push(d)
    }
    if (hits.length === 1) return { date: hits[0] }
    return { needsMonth: dom }
  }
  if (wd !== undefined) return { date: addDays(today, (wd - weekday(today) + 7) % 7) }
  if (dom) {
    if (strict) return { needsMonth: dom }
    const y = dom >= +today.slice(8) ? ty : tm === 12 ? ty + 1 : ty
    const mo = dom >= +today.slice(8) ? tm : (tm % 12) + 1
    if (valid(y, mo, dom)) return { date: key(y, mo, dom) }
  }
  return {}
}

/** "20h", "20:00", "20h30", "às 8 da noite", "às oito", "8pm". Never assumes a time that isn't written. */
export function readTime(text: string): { start?: TimeHM; end?: TimeHM } {
  const n = fold(text).replace(/(\d)\s+(h|:)/g, '$1$2')
  // The first end must look like a time ("20h", "19:00") so "sábado, 17 às 20h" is never read as 17–20h.
  const range = /\b(\d{1,2})(?::(\d{2})|h(\d{2})?)\s*(?:-|–|as|ate)\s*(\d{1,2})(?:[:h](\d{2}))?h?\b/.exec(n)
  if (range) return { start: `${pad(+range[1])}:${range[2] ?? range[3] ?? '00'}`, end: `${pad(+range[4])}:${range[5] ?? '00'}` }
  let m = /\b(\d{1,2})(?::(\d{2})|h(\d{2})?|\s*horas?)\b/.exec(n)
  let h: number | undefined
  let min = '00'
  if (m) {
    h = +m[1]
    min = m[2] ?? m[3] ?? '00'
  } else if ((m = /\b(\d{1,2})\s*(am|pm)\b/.exec(n))) {
    h = +m[1] + (m[2] === 'pm' && +m[1] < 12 ? 12 : 0)
  } else if ((m = /\b(?:as|a partir das)\s+(\d{1,2}|uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|meio[- ]dia)\b(?:\s+e\s+(meia|quinze))?/.exec(n))) {
    h = /^\d/.test(m[1]) ? +m[1] : HOUR_WORDS[m[1].replace(/[- ]dia$/, '')]
    if (m[2]) min = m[2] === 'meia' ? '30' : '15'
  }
  if (h === undefined || h > 23 || +min > 59) return {}
  if (/\b(da noite|de noite|da tarde)\b/.test(n) && h < 12) h += 12
  return { start: `${pad(h)}:${min}` }
}

const EVENT_NOUN = /\b(aniversario|niver|festa|jantar|almoco|cafe da manha com|reuniao|consulta|casamento|show|exame|dentista|medico|medica|happy hour|churrasco|evento|palestra|workshop|call|entrevista|batizado|cha de|formatura|encontro|confraternizacao|apresentacao|peca|cinema|teatro)\b/

export function looksLikeEvent(text: string): boolean {
  return EVENT_NOUN.test(fold(text))
}

/** Location after "no/na/em/local:" — her own words, never inferred. */
export function readLocation(text: string): string | undefined {
  const m = /(?:\b[Ll]ocal\s*:\s*|\b[Ee]ndere[cç]o\s*:\s*|\b(?:no|na|em)\s+)((?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w'’.-]*)(?:\s+(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\w'’.-]*|da|de|do|das|dos|e|\d+))*)/.exec(text)
  if (!m) return undefined
  const loc = m[1].replace(/\s+(?:da|de|do|das|dos|e)$/i, '').trim()
  // "na Ana" (a person after "da/na") or a weekday is not a place.
  if (/^(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|agenda)\b/i.test(loc)) return undefined
  return loc.length >= 3 ? loc : undefined
}

/** The event title: the event phrase without the scheduling words around it. */
export function readTitle(text: string): string | undefined {
  // Unicode-aware word edges (\b does not see "á", "ã" as letters).
  const B = '(?<![\\p{L}\\d])'
  const E = '(?![\\p{L}\\d])'
  const re = (src: string, flags = 'giu') => new RegExp(src.replaceAll('<B>', B).replaceAll('<E>', E), flags)
  let t = text
    .replace(re('^\\s*(?:lumos[,\\s]+)?(?:por favor\\s+)?(?:coloca|coloque|adiciona|adicione|bota|marca|marque|agenda|agende|salva|salve|cria|crie|anota|anote|põe|poe)<E>(?:\\s+(?:isso|um|uma|o|a)<E>)?(?:\\s+(?:na|em)\\s+(?:minha\\s+)?agenda<E>)?[:,]?\\s*', 'iu'), '')
    .replace(re('<B>(?:na|em)\\s+(?:minha\\s+)?agenda<E>'), ' ')
  t = t
    .replace(re('<B>(?:hoje|amanhã|amanha|depois de amanhã|depois de amanha|(?:no |na |nesse |neste |este |esse |próximo |proximo |próxima |proxima )?(?:domingo|segunda(?:-feira)?|terça(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|sabado))<E>,?'), ' ')
    .replace(re('<B>(?:dia\\s+)?\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?<E>'), ' ')
    .replace(re('<B>(?:dia\\s+)?\\d{1,2}\\s*(?:de\\s+)?(?:janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)<E>(?:\\s+de\\s+\\d{4})?'), ' ')
    .replace(re('<B>dia\\s+\\d{1,2}<E>'), ' ')
    .replace(re('<B>(?:às|as|a partir das)\\s+(?:\\d{1,2}(?::\\d{2}|h\\d{0,2})?|uma|duas|três|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)<E>(?:\\s+e\\s+(?:meia|quinze))?(?:\\s+(?:da noite|de noite|da tarde|da manhã|da manha))?'), ' ')
    .replace(re('<B>\\d{1,2}(?::\\d{2}|h\\d{0,2})(?:\\s*(?:-|–|às|as|até|ate)\\s*\\d{1,2}(?::\\d{2}|h\\d{0,2})?)?'), ' ')
    .replace(re('(?:<B>local\\s*:|<B>endereço\\s*:|<B>(?:no|na|em)\\s+(?=\\p{Lu}))[^,.\\n]*'), ' ')
    .replace(/[,.;:·•|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return undefined
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** A draft from her own words (typed or spoken). The month of a bare "dia 17" follows the next 17th. */
export function eventDraftFromText(text: string, today: DateKey, opts: { strict?: boolean } = {}): EventDraft {
  const date = readDate(text, today, opts.strict)
  const time = readTime(text)
  const title = readTitle(text)
  const missing: DraftField[] = []
  if (!title) missing.push('title')
  if (date.needsMonth) missing.push('month')
  else if (!date.date) missing.push('date')
  if (!time.start) missing.push('time')
  return {
    title,
    date: date.date,
    startTime: time.start,
    endTime: time.end,
    location: readLocation(text),
    dayOfMonth: date.needsMonth,
    missing,
    confidence: missing.some((f) => f !== 'time') ? 'low' : 'high',
  }
}
