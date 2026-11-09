/**
 * Minutes counted ONCE. Every study minute comes from exactly one entry:
 *   - a StudySession (whatever number of domains, skills, topics or goals it touches), or
 *   - a class the calendar shows (the expedition's English school) that already happened and that no
 *     session points to (`linkedEventId`) or stands for (a session with source 'aula' that day, same track).
 * Suggested base-day blocks ('idiomas' / 'faculdade') are plans, never minutes; and on a class day the
 * calendar already hides the suggestion (dropCoveredSuggestions).
 */
import { classLineOn } from '@/data/travel-mode'
import type { DateKey, DB, ID, StudySession } from '@/data/types'
import { addDays, hmToMinutes } from '@/lib/date'
import { counts, domainOfTrackId, LANG_DOMAIN, TRACK_EN, TRACK_ES } from './model'

export interface StudyEntry {
  /** 'session:<id>' or the calendar class id ('school:<trip>:<date>'). */
  key: string
  date: DateKey
  minutes: number
  domain: string
  relatedDomains: string[]
  trackId?: ID
  skills: string[]
  topics: string[]
  source: 'sessao' | 'aula'
  session?: StudySession
  title?: string
}

/** The class the calendar shows that day, as an entry id (same id the calendar uses). */
export const classEntryId = (tripId: ID, date: DateKey) => `school:${tripId}:${date}`

function classTrack(name: string): ID {
  return /espanhol|spanish|espa[nñ]ol/i.test(name) ? TRACK_ES : TRACK_EN
}

export function sessionEntry(db: Pick<DB, 'profile' | 'studyTracks'>, s: StudySession): StudyEntry {
  const domain = s.domain || (s.trackId ? domainOfTrackId(db, s.trackId) : 'outros')
  return {
    key: `session:${s.id}`,
    date: s.date,
    minutes: Math.max(0, Math.round(s.minutes || 0)),
    domain,
    relatedDomains: (s.relatedDomains ?? []).filter((d) => d !== domain),
    trackId: s.trackId,
    skills: s.skills ?? [],
    topics: s.topics ?? [],
    source: 'sessao',
    session: s,
    title: s.title,
  }
}

/**
 * Every counted study entry in [from, to] (inclusive). `now` decides which classes already happened
 * (a class counts once it ended). Pure.
 */
export function studyEntries(db: DB, from: DateKey, to: DateKey, now?: { date: DateKey; minutes: number }): StudyEntry[] {
  const sessions = (db.studySessions ?? []).filter((s) => s.date >= from && s.date <= to && counts(s))
  const out = sessions.map((s) => sessionEntry(db, s))
  const linked = new Set(sessions.map((s) => s.linkedEventId).filter(Boolean))
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (now && (d > now.date)) break
    const cls = classLineOn(db, d)
    if (!cls || cls.absent) continue
    const end = hmToMinutes(cls.end)
    if (now && d === now.date && end > now.minutes) continue
    const id = classEntryId(cls.trip.id, d)
    const trackId = classTrack(cls.name)
    if (linked.has(id)) continue
    if (sessions.some((s) => s.date === d && s.source === 'aula' && s.trackId === trackId)) continue
    out.push({ key: id, date: d, minutes: Math.max(0, end - hmToMinutes(cls.start)), domain: LANG_DOMAIN, relatedDomains: [], trackId, skills: [], topics: [], source: 'aula', title: `Aula · ${cls.name}` })
  }
  return out
}

export const totalMinutes = (entries: StudyEntry[]) => entries.reduce((s, e) => s + e.minutes, 0)

export function minutesBy<K extends string>(entries: StudyEntry[], key: (e: StudyEntry) => K | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of entries) {
    const k = key(e)
    if (k === undefined) continue
    out[k] = (out[k] ?? 0) + e.minutes
  }
  return out
}

/**
 * Minutes per skill, each session's minutes split evenly over the skills she named (so the bars add up to
 * the total — never counted twice). Entries without skills go to 'nao_informado'.
 */
export function minutesBySkill(entries: StudyEntry[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of entries) {
    if (!e.skills.length) {
      out.nao_informado = (out.nao_informado ?? 0) + e.minutes
      continue
    }
    const part = e.minutes / e.skills.length
    for (const s of e.skills) out[s] = (out[s] ?? 0) + part
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k])
  return out
}
