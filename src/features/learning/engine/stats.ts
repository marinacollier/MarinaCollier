/**
 * Reports from real history only. A session's minutes count in its MAIN domain; the other domains it
 * touched are listed as "também tocou" (never added). No level is ever inferred from hours.
 */
import type { DateKey, DB, ID, LearningError, StudySession } from '@/data/types'
import { addDays, startOfWeek } from '@/lib/date'
import { minutesBy, minutesBySkill, studyEntries, totalMinutes, type StudyEntry } from './minutes'
import { languageTracks, LANG_DOMAIN, planOf, PRACTICE_SKILLS, THEORY_SKILLS } from './model'
import { dueCards, recurring } from './srs'

export interface DomainRow {
  domain: string
  minutes: number
  sessions: number
  /** Minutes of sessions whose main domain is another one but that also touched this one (shown, never summed). */
  alsoTouched: number
}

export function domainReport(entries: StudyEntry[]): DomainRow[] {
  const rows = new Map<string, DomainRow>()
  const row = (d: string) => rows.get(d) ?? rows.set(d, { domain: d, minutes: 0, sessions: 0, alsoTouched: 0 }).get(d)!
  for (const e of entries) {
    const r = row(e.domain)
    r.minutes += e.minutes
    r.sessions += 1
    for (const d of e.relatedDomains) row(d).alsoTouched += e.minutes
  }
  return [...rows.values()].sort((a, b) => b.minutes - a.minutes || b.alsoTouched - a.alsoTouched)
}

export interface Period {
  from: DateKey
  to: DateKey
}

export const weekOf = (date: DateKey): Period => ({ from: startOfWeek(date), to: addDays(startOfWeek(date), 6) })

export interface LearningStats {
  period: Period
  total: number
  sessions: number
  /** Sessions counted with 0 minutes because their duration is not confirmed. */
  unknownDuration: number
  classes: number
  byDomain: DomainRow[]
  /** Language minutes per language track (inside 'idiomas'). */
  byTrack: Record<ID, number>
  /** Language split she planned vs what happened (shares 0..1 of language minutes). */
  split: { trackId: ID; planned: number; actual: number; minutes: number }[]
  bySkill: Record<string, number>
  theory: number
  practice: number
  topics: { topic: string; count: number }[]
  pendingReviews: number
  recurringErrors: LearningError[]
  evidence: StudySession[]
}

export interface StatsFilter {
  domain?: string
  topic?: string
  resourceType?: string
}

export function filterEntries(entries: StudyEntry[], f: StatsFilter = {}): StudyEntry[] {
  return entries.filter(
    (e) =>
      (!f.domain || e.domain === f.domain || e.relatedDomains.includes(f.domain)) &&
      (!f.topic || e.topics.some((t) => t.toLowerCase() === f.topic!.toLowerCase())) &&
      (!f.resourceType || e.session?.resourceType === f.resourceType || (f.resourceType === 'aula' && e.source === 'aula')),
  )
}

export function learningStats(db: DB, period: Period, now: { date: DateKey; minutes: number }, filter: StatsFilter = {}): LearningStats {
  const entries = filterEntries(studyEntries(db, period.from, period.to, now), filter)
  const lang = entries.filter((e) => e.domain === LANG_DOMAIN)
  const byTrack = minutesBy(lang, (e) => e.trackId)
  const langTotal = totalMinutes(lang)
  const plan = planOf(db)
  const split = languageTracks(db).map((t) => ({ trackId: t, planned: plan.split[t] ?? 0, actual: langTotal ? (byTrack[t] ?? 0) / langTotal : 0, minutes: byTrack[t] ?? 0 }))
  const bySkill = minutesBySkill(entries.filter((e) => e.skills.length || e.domain === LANG_DOMAIN))
  let theory = 0
  let practice = 0
  for (const [k, v] of Object.entries(bySkill)) {
    if (THEORY_SKILLS.has(k)) theory += v
    else if (PRACTICE_SKILLS.has(k)) practice += v
  }
  const topicCount = new Map<string, number>()
  for (const e of entries) for (const t of e.topics) topicCount.set(t, (topicCount.get(t) ?? 0) + 1)
  const cards = (db.learningErrors ?? []).filter((c) => !filter.domain || (c.domain ?? (c.trackId ? LANG_DOMAIN : undefined)) === filter.domain)
  return {
    period,
    total: totalMinutes(entries),
    sessions: entries.filter((e) => e.source === 'sessao').length,
    unknownDuration: entries.filter((e) => e.minutesUnknown).length,
    classes: entries.filter((e) => e.source === 'aula').length,
    byDomain: domainReport(entries),
    byTrack,
    split,
    bySkill,
    theory,
    practice,
    topics: [...topicCount.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count),
    pendingReviews: dueCards(cards, now.date, Number.MAX_SAFE_INTEGER).length,
    recurringErrors: recurring(cards, 3),
    evidence: entries.map((e) => e.session).filter((s): s is StudySession => !!s?.evidence),
  }
}

/** Today's counted minutes for a track (classes included). */
export function minutesToday(db: DB, now: { date: DateKey; minutes: number }, trackId: ID): number {
  return totalMinutes(studyEntries(db, now.date, now.date, now).filter((e) => e.trackId === trackId))
}
