/**
 * Lumos Intelligence Layer — public API (CONTRACT).
 *
 * Owned by the intelligence agent; Home and the Lumos chat import ONLY from here.
 * The implementations below are minimal placeholders so other screens can be built in parallel;
 * the intelligence agent replaces them with the real engines (same signatures).
 *
 * Engines: LifeContextEngine · TemporalMemory · NeedsAttention · ChangeFeed · ActionGraph ·
 * SmartPlanner · Universal Capture · Proactive Lumos · Life timeline (db.lifeLog) · Confidence + Provenance.
 * Central rule: if Lumos can solve it without interrupting Marina, it solves and offers Undo;
 * relevant ambiguity or sensitive external action → ask.
 */
import type {
  Confidence,
  DateKey,
  DB,
  ID,
  ISODateTime,
  LifeEvent,
  MemoryItem,
  Provenance,
  ScheduleRefType,
  TimeHM,
  WorkDayMode,
} from '../types'

/** "Now" is always passed in (deterministic, testable). minutes = minutes since 00:00 in São Paulo. */
export interface Now {
  date: DateKey
  minutes: number
  iso?: ISODateTime
}

/** A value plus where it came from. */
export interface Sourced<T> {
  value: T
  provenance: Provenance
  confidence: Confidence
}

// ─── LifeContextEngine ──────────────────────────────────────────────────────

export interface DayContext {
  date: DateKey
  workMode: WorkDayMode
  presencial: boolean
  /** Trainings of the day (planned or done), compact. */
  trainings: { title: string; time?: TimeHM; durationMin?: number; key: boolean; done: boolean; ref: { type: ScheduleRefType; id: string } }[]
  /** Fixed commitments (calendar, work blocks), compact. */
  commitments: { title: string; start?: TimeHM; end?: TimeHM; ref?: { type: ScheduleRefType; id: string } }[]
  /** Nutrition day type label (from the plan chosen by trainings), if any. */
  nutritionDay?: string
  /** Free windows ≥ 30 min between wake and sleep. */
  free: { start: TimeHM; end: TimeHM }[]
  /** Energy check-in when known. */
  energy?: 'baixa' | 'media' | 'alta'
  /** Things worth one line ("Seu pedal começa cedo amanhã."). Most relevant first. */
  notes: Sourced<string>[]
}

export interface LifeContext {
  now: Now
  today: DayContext
  tomorrow: DayContext
  /** Next 7 days from today, compact. */
  week: DayContext[]
  /** Next trip within ~45 days. */
  nextTrip?: { id: ID; name: string; startDate: DateKey; daysLeft: number; openItems: number }
}

export function lifeContext(db: DB, now: Now): LifeContext {
  void db
  const empty = (date: DateKey): DayContext => ({ date, workMode: 'remoto', presencial: false, trainings: [], commitments: [], free: [], notes: [] })
  return { now, today: empty(now.date), tomorrow: empty(now.date), week: [] }
}

// ─── Proactive Lumos (Home) ─────────────────────────────────────────────────

/** One short line under the greeting, or nothing. */
export function dailyBrief(db: DB, now: Now): string | undefined {
  void db
  void now
  return undefined
}

/** Max 3 context suggestions under the composer ("prepara meu pedal de amanhã"). Never generic. */
export function homeSuggestions(db: DB, now: Now): string[] {
  void db
  void now
  return []
}

export interface Insight {
  key: string
  text: string
  /** Sentence sent to Lumos when tapped. */
  ask?: string
  provenance: Provenance
  priority: number
}

/** 0–3 really relevant insights. Never a notification feed. */
export function proactiveInsights(db: DB, now: Now, max = 3): Insight[] {
  void db
  void now
  void max
  return []
}

// ─── NeedsAttention ─────────────────────────────────────────────────────────

export interface AttentionItem {
  /** Stable key (AttentionAck.key). */
  key: string
  kind: 'ambiguity' | 'conflict' | 'decision' | 'confirm_pattern' | 'waiting_reply'
  title: string
  detail?: string
  /** Tappable answers; `ask` is the sentence sent to Lumos. */
  options?: { label: string; ask: string }[]
  provenance: Provenance
  ref?: { type: string; id: string }
}

/** ONE queue: only ambiguities, conflicts or decisions that really need Marina. Usually short or empty. */
export function needsAttention(db: DB, now: Now): AttentionItem[] {
  void db
  void now
  return []
}

// ─── ChangeFeed ─────────────────────────────────────────────────────────────

export interface ChangeItem {
  at: ISODateTime
  title: string
  by: LifeEvent['by']
  provenance: Provenance
  ref?: LifeEvent['ref']
}

/** Real deltas since `since` (default: profile.lumosLastSeenAt). */
export function changeFeed(db: DB, now: Now, since?: ISODateTime): { since?: ISODateTime; items: ChangeItem[]; summary: string } {
  void db
  void now
  return { since, items: [], summary: 'Nada mudou desde a última vez.' }
}

// ─── ActionGraph ────────────────────────────────────────────────────────────

/** A change and everything it drags along, previewable before applying. */
export interface GraphPlan {
  /** Human lines of what will change (first = the change itself, then dependencies). */
  lines: { text: string; provenance: Provenance }[]
  /** Apply all writes + log LifeEvents; returns undo for the whole unit. */
  apply: () => () => void
  /** Needs Marina's confirmation (sensitive/external) instead of direct apply + Undo. */
  sensitive: boolean
}

export type GraphChange =
  | { kind: 'moveWorkout'; date: DateKey; ref: { type: ScheduleRefType; id: string }; toTime?: TimeHM; toDate?: DateKey }
  | { kind: 'setDuration'; date: DateKey; ref: { type: ScheduleRefType; id: string }; durationMin: number }
  | { kind: 'cancel'; date: DateKey; ref: { type: ScheduleRefType; id: string } }
  | { kind: 'workMode'; date: DateKey; mode: WorkDayMode }
  | { kind: 'activityDone'; date: DateKey; workoutId: ID; activity: { durationMin?: number; distanceKm?: number; source: 'strava' | 'manual' } }

export function planChange(db: DB, change: GraphChange, now: Now): GraphPlan {
  void db
  void change
  void now
  return { lines: [], apply: () => () => {}, sensitive: false }
}

// ─── SmartPlanner ───────────────────────────────────────────────────────────

export interface WeekProposal {
  weekStart: DateKey
  /** Per day, ordered: fixed → key sessions → fuel prep → deadlines → study → life; rest + free space kept. */
  days: { date: DateKey; items: { time?: TimeHM; title: string; layer: 'fixo' | 'treino_chave' | 'preparo' | 'prazo' | 'estudo' | 'vida' | 'descanso'; provenance: Provenance; isNew: boolean }[]; free: { start: TimeHM; end: TimeHM }[] }[]
  conflicts: { date: DateKey; text: string }[]
  summary: string
  apply: () => () => void
}

export function planWeek(db: DB, now: Now, weekStart?: DateKey): WeekProposal {
  void db
  return { weekStart: weekStart ?? now.date, days: [], conflicts: [], summary: '', apply: () => () => {} }
}

// ─── TemporalMemory ─────────────────────────────────────────────────────────

/** Permanent facts, preferences, temporary states, one-occurrence exceptions, observed patterns. */
export type MemoryLayer = 'fact' | 'preference' | 'state' | 'exception' | 'pattern'

export interface MemoryView {
  layer: MemoryLayer
  text: string
  provenance: Provenance
  confidence: Confidence
  /** Stored item (exceptions come from ScheduleOverrides, patterns from observed MemoryItems). */
  item?: MemoryItem
  validUntil?: DateKey
}

export function memoryView(db: DB, now: Now): MemoryView[] {
  void now
  return db.memory.filter((m) => m.status !== 'archived').map((m) => ({ layer: m.status === 'observed' ? 'pattern' : m.kind === 'history' ? 'fact' : m.kind, text: m.text, provenance: m.source === 'marina' ? 'user' : 'fact', confidence: 'high', item: m }))
}

// ─── Universal Capture ──────────────────────────────────────────────────────

export type CaptureInput =
  | { kind: 'text'; text: string }
  | { kind: 'voice'; transcript?: string; audio?: Blob }
  | { kind: 'image' | 'screenshot' | 'file'; file: Blob; name?: string; caption?: string }

/** Normalize any input into something Lumos can route. Unsupported kinds say so honestly. */
export function normalizeCapture(input: CaptureInput): { text?: string; attachments: { kind: string; name?: string }[]; supported: boolean; note?: string } {
  if (input.kind === 'text') return { text: input.text, attachments: [], supported: true }
  if (input.kind === 'voice' && input.transcript) return { text: input.transcript, attachments: [], supported: true }
  return { text: 'caption' in input ? input.caption : undefined, attachments: [{ kind: input.kind, name: 'name' in input ? input.name : undefined }], supported: false, note: 'Ainda não leio esse tipo de arquivo — me conta em texto o que tem nele.' }
}

// ─── Life timeline (db.lifeLog) ─────────────────────────────────────────────

export type LifeEventDraft = Omit<LifeEvent, 'id' | 'createdAt' | 'updatedAt'>

/** Past events for a period / area ("quando terminei o último livro?"). */
export function lifeHistory(db: DB, opts: { from?: DateKey; to?: DateKey; area?: LifeEvent['area']; text?: string } = {}): LifeEvent[] {
  return db.lifeLog
    .filter((e) => (!opts.from || e.date >= opts.from) && (!opts.to || e.date <= opts.to) && (!opts.area || e.area === opts.area))
    .sort((a, b) => b.at.localeCompare(a.at))
}
