/**
 * English C1 Accelerator — the CONTRACT for authored content (lessons, diagnostic, library, plan). Pure data, no
 * store access. Content files live in ./content/*.ts and export values of these types; the engine (./model.ts) and
 * the UI only read them. Answer keys are kept apart from prompts so the UI can show them only after an attempt.
 */
import type { DateKey } from '@/data/types'

export type Cefr = 'A2' | 'B1' | 'B1+' | 'B2' | 'B2+' | 'C1' | 'C2'
export type Skill = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'writing' | 'speaking' | 'pronunciation'

/** What kind of issue a correction is about — not every less idiomatic sentence is a grammar error. */
export type IssueType = 'gramatical' | 'vocabulario' | 'pouco_natural' | 'tom_registro' | 'estilo_valido'

/** How a learner answer is checked by code. 'self' = she compares with the model answer and marks it herself. */
export type CheckMode = 'exact' | 'any_of' | 'choice' | 'self'

/** One item she answers. `accept` holds accepted answers for exact/any_of (compared normalized: case, spaces, final punctuation, curly quotes). */
export interface ExerciseItem {
  id: string
  /** Instruction or prompt shown BEFORE the attempt. */
  prompt: string
  /** Optional sentence/context to work on (e.g. the wrong sentence to correct). */
  given?: string
  /** For 'choice'. */
  options?: string[]
  check: CheckMode
  /** Answer key — shown only after an attempt or when she asks for the explanation. */
  key: {
    /** exact / any_of: accepted answers. choice: the correct option text. self: a model answer. */
    accept: string[]
    /** Short explanation in Portuguese. */
    explanationPt: string
    /** What it targets ("present continuous", "indirect questions"). */
    target: string
    issue?: IssueType
    level?: Cefr
  }
  /** Links back to the Error Tracker seed (E001…) when the item comes from one of her real mistakes. */
  fromErrorCode?: string
}

export interface RubricCriterion {
  id: string
  label: string
  /** What each band means, low → high (3–5 bands). */
  bands: string[]
}

export interface Lesson {
  /** 'L01'…'L10' */
  code: string
  title: string
  skills: Skill[]
  level: Cefr
  minutes: number
  /** Objective in one sentence (PT). */
  objective: string
  /** Step-by-step instructions (PT, may quote English). */
  instructions: string[]
  /** Warm-up question(s) in English. */
  warmUp?: string[]
  items: ExerciseItem[]
  /** For open production (speaking/writing): criteria she or a tutor scores; never auto-scored by code. */
  rubric?: RubricCriterion[]
  /** True when the lesson needs audio (listening/speaking) — the app must say so honestly. */
  needsAudio?: boolean
  /** External authentic sources for listening lessons (real, stable URLs only). */
  sources?: { title: string; url: string; note?: string }[]
  /** Which Bayswater/English Coach topics it revisits. */
  revisits?: string[]
}

export type DiagnosticModuleId = 'A' | 'B' | 'C' | 'D' | 'E'

export interface DiagnosticModule {
  id: DiagnosticModuleId
  title: string
  skill: Skill | 'use_of_english'
  /** How it is scored: 'auto' = code scores items (A, B); 'rubric' = she/tutor scores criteria (D, E); 'external' = needs audio/licensed material (C). */
  scoring: 'auto' | 'rubric' | 'external'
  instructions: string[]
  /** For A and B: items grouped by level; for B also the texts. */
  items?: (ExerciseItem & { level: Cefr })[]
  texts?: { id: string; title: string; level: Cefr; body: string }[]
  /** For D and E: tasks and the rubric. */
  tasks?: { id: string; title: string; prompt: string; minWords?: number; seconds?: number }[]
  rubric?: RubricCriterion[]
  sources?: { title: string; url: string; note?: string }[]
  /** Honest limits shown next to the result. */
  limitations: string[]
}

export interface PlanPhase {
  n: 1 | 2 | 3 | 4 | 5
  title: string
  from: DateKey
  to: DateKey
  goals: string[]
}

/** Her weekly routine (base load). weekday: 0 = domingo. */
export interface RoutineBlock {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  minutes: number
  title: string
  focus: string
  /** 'cambly' = the tutor class (needs a confirmed active contract to count as available). */
  kind: 'self' | 'cambly' | 'review'
}

export interface LibraryResource {
  id: string
  title: string
  provider: string
  url: string
  category:
    | 'grammar_recovery'
    | 'advanced_grammar'
    | 'business'
    | 'product_ai'
    | 'real_life'
    | 'listening_pronunciation'
    | 'reading_critical'
    | 'writing_argumentation'
    | 'cefr_assessment'
    | 'bayswater'
    | 'australia_prep'
  level: Cefr | 'todos'
  skills: Skill[]
  objective: string
  /** Free / paid / needs account — never claim access she doesn't have. */
  access: 'gratuito' | 'conta_gratuita' | 'pago' | 'material_dela'
}

/** A topic already studied (Bayswater / English Coach) — history, never a completed exercise or a result. */
export interface StudiedTopic {
  id: string
  area: 'grammar' | 'vocabulary_reading' | 'professional_speaking' | 'everyday'
  title: string
  source: 'Bayswater' | 'English Coach' | 'Bayswater / English Coach'
}

/** Seed of a real mistake she made (E001…). */
export interface SeedError {
  code: string
  context: string
  original: string
  correction: string
  explanationPt: string
  category: string
  issue: IssueType
  focus: string
  source: string
}
