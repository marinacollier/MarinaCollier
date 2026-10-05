/**
 * Shared types of the Lumos Intelligence Layer (re-exported by ./index.ts — the public contract).
 */
import type { Confidence, DateKey, ID, ISODateTime, LifeEvent, MemoryItem, Provenance, ScheduleRefType, TimeHM, WorkDayMode } from '../types'

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

export type Undo = () => void

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

// ─── Proactive ──────────────────────────────────────────────────────────────

export interface Insight {
  key: string
  text: string
  /** Sentence sent to Lumos when tapped. */
  ask?: string
  provenance: Provenance
  priority: number
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

// ─── ChangeFeed ─────────────────────────────────────────────────────────────

export interface ChangeItem {
  at: ISODateTime
  title: string
  by: LifeEvent['by']
  provenance: Provenance
  ref?: LifeEvent['ref']
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

// ─── SmartPlanner ───────────────────────────────────────────────────────────

export type PlanLayer = 'fixo' | 'treino_chave' | 'preparo' | 'prazo' | 'estudo' | 'vida' | 'descanso'

export interface WeekProposalItem {
  time?: TimeHM
  title: string
  layer: PlanLayer
  provenance: Provenance
  isNew: boolean
}

export interface WeekProposal {
  weekStart: DateKey
  /** Per day, ordered: fixed → key sessions → fuel prep → deadlines → study → life; rest + free space kept. */
  days: { date: DateKey; items: WeekProposalItem[]; free: { start: TimeHM; end: TimeHM }[] }[]
  conflicts: { date: DateKey; text: string }[]
  summary: string
  apply: () => () => void
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

// ─── Universal Capture ──────────────────────────────────────────────────────

export type CaptureInput =
  | { kind: 'text'; text: string }
  | { kind: 'voice'; transcript?: string; audio?: Blob }
  | { kind: 'image' | 'screenshot' | 'file'; file: Blob; name?: string; caption?: string }

// ─── Life timeline ──────────────────────────────────────────────────────────

export type LifeEventDraft = Omit<LifeEvent, 'id' | 'createdAt' | 'updatedAt'>
