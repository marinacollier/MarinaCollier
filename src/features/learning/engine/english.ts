/**
 * English Coach — an honest read of English evolution. Pure, no store access.
 *
 * Rules (hers, literal):
 * - Every number comes from a real record (session, review card, memory item, task). No evidence →
 *   "sem evidência ainda". No score, and NO CEFR computed from hours: the level is the track's own
 *   `level` / `goalLevel`, always labelled provisório.
 * - `minutesUnknown` sessions count as sessions, never as minutes ("duração não confirmada").
 * - `assisted` practice is practice, never independent mastery.
 * - "Domínio demonstrado" only from review cards with ≥2 consecutive spaced successes (`streak` ≥ 2:
 *   a wrong answer resets it, early reviews never advance it).
 * - Recurring error PATTERNS are memory items with key `english.pattern.<categoria>` (kind 'state',
 *   area 'estudos'). Examples inside their text are history, not new errors; the card count shown
 *   comes only from real cards whose `category` matches the key suffix.
 * - Upcoming review TASKS carry the tag `revisao-ingles` (created elsewhere; only counted/listed here).
 */
import type { DateKey, DB, LearningError, MemoryItem, StudyContentArea, StudySession, StudySessionOrigin, Task } from '@/data/types'
import { includesNormalized, normalize } from '@/lib/text'
import { sessionMinutes, studyEntries } from './minutes'
import { counts, TRACK_EN } from './model'
import { weekOf } from './stats'

export const NO_EVIDENCE = 'sem evidência ainda'
export const UNKNOWN_DURATION = 'duração não confirmada'
export const PATTERN_PREFIX = 'english.pattern.'
/** MemoryItem kind used for recurring English error patterns (MemoryKind has no 'pattern'). */
export const PATTERN_KIND = 'state' as const
export const REVIEW_TASK_TAG = 'revisao-ingles'
export const PASSIVE_LABEL = 'passivo até usar em produção própria'
export const AUDIO_PENDING = 'pendente de evidência em áudio'

export const ORIGIN_LABEL: Record<StudySessionOrigin, string> = {
  escola: 'escola',
  independente: 'estudo independente',
  reuniao: 'reunião',
  conversa: 'conversa',
  mensagem: 'mensagem',
  outro: 'outro',
}

export const AREA_LABEL: Record<StudyContentArea, string> = {
  reading: 'Reading',
  speaking: 'Speaking',
  listening: 'Listening',
  writing: 'Writing',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  pronunciation: 'Pronunciation',
}

/** Lowercase, no accents, non-alphanumerics → '-' ("Preposições" → "preposicoes", "Present Perfect" → "present-perfect"). */
export const slug = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`)

// ── Sessions ────────────────────────────────────────────────────────────────

export function isEnglishSession(s: Pick<StudySession, 'trackId' | 'contentLanguage'>): boolean {
  return s.trackId === TRACK_EN || (!s.trackId && s.contentLanguage === 'en')
}

/** Real English sessions (planned / abandoned excluded), newest first. */
export function englishSessions(db: Pick<DB, 'studySessions'>): StudySession[] {
  return (db.studySessions ?? [])
    .filter((s) => counts(s) && isEnglishSession(s))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startTime ?? '').localeCompare(a.startTime ?? '') || b.id.localeCompare(a.id))
}

/** "45 min" or "duração não confirmada" — never an invented time. */
export function durationLabel(s: Pick<StudySession, 'minutes' | 'minutesUnknown'>): string {
  return s.minutesUnknown ? UNKNOWN_DURATION : hm(sessionMinutes(s))
}

// ── Nível ───────────────────────────────────────────────────────────────────

export interface EnglishLevel {
  /** The track's own level ("B1+–B2"), undefined when not set. */
  current?: string
  goal: string
  /** "B1+–B2 (provisório) → objetivo C1" / "nível: a avaliar → objetivo C1". */
  label: string
}

export function englishLevel(db: Pick<DB, 'studyTracks'>): EnglishLevel {
  const t = db.studyTracks.find((x) => x.id === TRACK_EN)
  const current = t?.level?.trim() || undefined
  const goal = t?.goalLevel?.trim() || 'C1'
  const left = current ? (/provis/i.test(current) ? current : `${current} (provisório)`) : 'nível: a avaliar'
  return { current, goal, label: `${left} → objetivo ${goal}` }
}

// ── Evidências recentes ─────────────────────────────────────────────────────

export interface EvidenceRow {
  id: string
  date: DateKey
  title: string
  origin?: string
  assisted: boolean
  minutesUnknown: boolean
  duration: string
  content: { area: StudyContentArea; label: string; title: string; items: string[] }[]
  skills: string[]
  evidence?: string
}

function sessionTitle(s: StudySession): string {
  return s.title ?? s.content?.[0]?.title ?? 'Sessão de inglês'
}

export function evidenceRow(s: StudySession): EvidenceRow {
  return {
    id: s.id,
    date: s.date,
    title: sessionTitle(s),
    origin: s.origin ? ORIGIN_LABEL[s.origin] : undefined,
    assisted: !!s.assisted,
    minutesUnknown: !!s.minutesUnknown,
    duration: durationLabel(s),
    content: (s.content ?? []).map((c) => ({ area: c.area, label: AREA_LABEL[c.area] ?? c.area, title: c.title, items: c.items ?? [] })),
    skills: s.skills ?? [],
    evidence: s.evidence,
  }
}

export function recentEvidence(db: Pick<DB, 'studySessions'>, n = 8): EvidenceRow[] {
  return englishSessions(db).slice(0, n).map(evidenceRow)
}

// ── Cards / domínio ─────────────────────────────────────────────────────────

export function englishCards(db: Pick<DB, 'learningErrors'>): LearningError[] {
  return (db.learningErrors ?? []).filter((c) => c.trackId === TRACK_EN)
}

/** Demonstrated mastery = ≥2 consecutive successful spaced reviews of HER OWN answers. Nothing else. */
export const demonstratesMastery = (c: Pick<LearningError, 'streak'>) => (c.streak ?? 0) >= 2

export type GrammarStatus = 'dominio_demonstrado' | 'praticado'

export interface GrammarRow {
  structure: string
  status: GrammarStatus
  /** "domínio demonstrado (2 acertos seguidos)" / "praticado, ainda sem avaliação" / "praticado com ajuda, ainda sem avaliação". */
  label: string
  lastPracticed?: DateKey
  sessions: number
  /** Every practice of it was assisted. */
  assistedOnly: boolean
  /** Review cards whose category matches the structure. */
  cards: number
}

export interface GrammarReport {
  rows: GrammarRow[]
  /** English cards with ≥2 correct in a row (any category). */
  masteredCards: LearningError[]
  empty: boolean
}

const cardMatches = (c: LearningError, key: string) => !!c.category && slug(c.category) === key

export function grammarReport(db: Pick<DB, 'studySessions' | 'learningErrors'>): GrammarReport {
  const cards = englishCards(db)
  const byKey = new Map<string, { structure: string; dates: DateKey[]; assisted: boolean[] }>()
  for (const s of englishSessions(db)) {
    for (const c of s.content ?? []) {
      if (c.area !== 'grammar') continue
      const structures = c.items?.length ? c.items : c.title ? [c.title] : []
      for (const st of structures) {
        const key = slug(st)
        if (!key) continue
        const cur = byKey.get(key) ?? byKey.set(key, { structure: st, dates: [], assisted: [] }).get(key)!
        cur.dates.push(s.date)
        cur.assisted.push(!!s.assisted)
      }
    }
  }
  const rows: GrammarRow[] = [...byKey.entries()].map(([key, v]) => {
    const related = cards.filter((c) => cardMatches(c, key))
    const best = Math.max(0, ...related.map((c) => c.streak ?? 0))
    const assistedOnly = v.assisted.every(Boolean)
    const mastered = related.some(demonstratesMastery)
    return {
      structure: v.structure,
      status: mastered ? 'dominio_demonstrado' : 'praticado',
      label: mastered ? `domínio demonstrado (${best} acertos seguidos na revisão)` : assistedOnly ? 'praticado com ajuda, ainda sem avaliação' : 'praticado, ainda sem avaliação',
      lastPracticed: [...v.dates].sort().at(-1),
      sessions: v.dates.length,
      assistedOnly,
      cards: related.length,
    }
  })
  rows.sort((a, b) => (b.lastPracticed ?? '').localeCompare(a.lastPracticed ?? '') || a.structure.localeCompare(b.structure))
  const masteredCards = cards.filter(demonstratesMastery)
  return { rows, masteredCards, empty: !rows.length && !masteredCards.length }
}

// ── Vocabulário ─────────────────────────────────────────────────────────────

export interface VocabRow {
  word: string
  firstSeen: DateKey
  /** Only true when a session she did WITHOUT help names the word in its `evidence`. */
  active: boolean
  label: string
}

export function vocabularyReport(db: Pick<DB, 'studySessions'>): VocabRow[] {
  const sessions = englishSessions(db)
  const seen = new Map<string, { word: string; date: DateKey }>()
  for (const s of [...sessions].reverse()) {
    for (const c of s.content ?? []) {
      if (c.area !== 'vocabulary') continue
      for (const w of c.items ?? []) {
        const k = normalize(w)
        if (k && !seen.has(k)) seen.set(k, { word: w.trim(), date: s.date })
      }
    }
  }
  return [...seen.values()]
    .map(({ word, date }) => {
      const active = sessions.some((s) => !s.assisted && s.date >= date && includesNormalized(s.evidence, word))
      return { word, firstSeen: date, active, label: active ? 'ativo (usou em produção própria)' : PASSIVE_LABEL }
    })
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.word.localeCompare(b.word))
}

// ── Speaking / Business / Naturalidade / Listening / Pronúncia ──────────────

export interface SkillEvidence {
  speaking: EvidenceRow[]
  business: EvidenceRow[]
  /** Real use outside exercises (reunião, conversa, mensagem), without help. */
  naturalidade: EvidenceRow[]
  /** Practice only: assessment stays "pendente de evidência em áudio". */
  listening: EvidenceRow[]
  pronunciation: EvidenceRow[]
}

const hasArea = (s: StudySession, a: StudyContentArea) => (s.content ?? []).some((c) => c.area === a)
const hasSkill = (s: StudySession, k: string) => (s.skills ?? []).some((x) => normalize(x) === k)
const BUSINESS = /business|negoci|reuni|meeting|pitch|stakeholder|e-?mail/
const isBusiness = (s: StudySession) =>
  s.origin === 'reuniao' || [...(s.skills ?? []), ...(s.topics ?? []), ...(s.tags ?? []), ...(s.content ?? []).map((c) => c.title), s.title ?? ''].some((x) => BUSINESS.test(normalize(x)))

export function skillEvidence(db: Pick<DB, 'studySessions'>): SkillEvidence {
  const ss = englishSessions(db)
  const pick = (f: (s: StudySession) => boolean) => ss.filter(f).map(evidenceRow)
  return {
    speaking: pick((s) => hasArea(s, 'speaking') || hasSkill(s, 'speaking') || s.learningMode === 'speaking'),
    business: pick(isBusiness),
    naturalidade: pick((s) => !s.assisted && (s.origin === 'reuniao' || s.origin === 'conversa' || s.origin === 'mensagem')),
    listening: pick((s) => hasArea(s, 'listening') || hasSkill(s, 'listening') || s.learningMode === 'listening'),
    pronunciation: pick((s) => hasArea(s, 'pronunciation') || hasSkill(s, 'pronunciation')),
  }
}

// ── Erros recorrentes (padrões) ─────────────────────────────────────────────

export interface PatternRow {
  id: string
  key: string
  /** Key suffix = the card category it groups ("preposicoes"). */
  category: string
  text: string
  status: MemoryItem['status']
  /** Real English review cards whose category matches. */
  cards: number
  /** Sum of those cards' `count` (times she made the mistake, as recorded). */
  occurrences: number
}

export function patternReport(db: Pick<DB, 'memory' | 'learningErrors'>): PatternRow[] {
  const cards = englishCards(db)
  return (db.memory ?? [])
    .filter((m) => m.key?.startsWith(PATTERN_PREFIX) && m.status !== 'archived')
    .map((m) => {
      const category = m.key!.slice(PATTERN_PREFIX.length)
      const related = cards.filter((c) => !!c.category && (slug(c.category) === category || category.startsWith(`${slug(c.category)}.`)))
      return { id: m.id, key: m.key!, category, text: m.text, status: m.status, cards: related.length, occurrences: related.reduce((n, c) => n + (c.count || 0), 0) }
    })
    .sort((a, b) => b.cards - a.cards || b.occurrences - a.occurrences || a.key.localeCompare(b.key))
}

// ── Revisões ────────────────────────────────────────────────────────────────

export interface ReviewReport {
  cards: number
  due: number
  /** Cards she has reviewed at least once. */
  reviewed: number
  mastered: number
  upcomingTasks: Task[]
  doneTasks: number
}

const taskDay = (t: Task) => t.date ?? t.dueDate ?? ''

export function reviewReport(db: Pick<DB, 'learningErrors' | 'tasks'>, today: DateKey): ReviewReport {
  const cards = englishCards(db)
  const tasks = (db.tasks ?? []).filter((t) => t.tags?.includes(REVIEW_TASK_TAG))
  return {
    cards: cards.length,
    due: cards.filter((c) => c.nextReview <= today).length,
    reviewed: cards.filter((c) => !!c.lastReviewed).length,
    mastered: cards.filter(demonstratesMastery).length,
    upcomingTasks: tasks.filter((t) => t.status !== 'done' && t.status !== 'archived').sort((a, b) => taskDay(a).localeCompare(taskDay(b)) || a.title.localeCompare(b.title)),
    doneTasks: tasks.filter((t) => t.status === 'done').length,
  }
}

// ── Objetivo semanal ────────────────────────────────────────────────────────

export interface WeeklyGoal {
  /** profile.learningPlan.weeklyAutonomousMin (languages, classes not included) — undefined = "sem objetivo definido". */
  targetMin?: number
  label: string
  /** This week's CONFIRMED English minutes outside class/school. */
  confirmedMin: number
  sessions: number
  unknownDuration: number
}

export function weeklyGoal(db: DB, now: { date: DateKey; minutes: number }): WeeklyGoal {
  const target = db.profile.learningPlan?.weeklyAutonomousMin
  const wk = weekOf(now.date)
  const entries = studyEntries(db, wk.from, now.date, now).filter((e) => e.session && isEnglishSession(e.session) && e.session.source !== 'aula' && e.session.origin !== 'escola')
  return {
    targetMin: target && target > 0 ? target : undefined,
    label: target && target > 0 ? `${hm(target)} de estudo autônomo de idiomas por semana (plano)` : 'sem objetivo definido',
    confirmedMin: entries.reduce((n, e) => n + e.minutes, 0),
    sessions: entries.length,
    unknownDuration: entries.filter((e) => e.minutesUnknown).length,
  }
}

export { hm as englishHM }
