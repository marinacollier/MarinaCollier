/**
 * "Ajustar por conversa" — the contract between whoever understands the sentence (today the
 * deterministic planner in ./planner.ts; later, maybe, a server-side model — see ../llm.ts) and
 * the preview → confirm → undo flow. A ChangePlan is ALWAYS shown before anything changes.
 */
import type { Conflict } from '@/data/planning'
import type { ID, Workout } from '@/data/types'

/** A workout as it will be written (create) or as it will look after the update. */
export type WorkoutDraft = Omit<Workout, 'createdAt' | 'updatedAt'>

export interface PlanChange {
  /**
   * create = a new record (also used to "materialize" a session that only existed in the weekly
   * template); update = patch an existing record; remove = NEVER deletes — applied as status 'pulado'.
   */
  kind: 'create' | 'update' | 'remove'
  collection: 'workouts'
  /** Record id (update/remove) or the id the new record will get (create). */
  id?: ID
  /** How it looked before (a template session shows here even though it had no record yet). */
  before?: Workout
  after: WorkoutDraft
  /** Where each default came from ("duração pelo seu histórico: ~90 min nas últimas 4 sessões"). */
  sources?: string[]
  /**
   * Bookkeeping only: another session of the same day written down exactly as the template had it,
   * so it doesn't disappear once the day gets real records. Not shown as a before → after row.
   */
  implicit?: boolean
}

export interface PlanChoiceOption {
  label: string
  plan: ChangePlan
}

export interface ChangePlan {
  /** One line, Lumos's voice: "Amanhã: 🚴 Pedal longo → 🏄‍♀️ Surf". */
  summary: string
  changes: PlanChange[]
  /** What else moves with it (day type / nutritionist's day plan / PREP / strategy). */
  consequences: string[]
  /** Planning conflicts the change would create (TotalPass, presencial, horário…). */
  warnings: Conflict[]
  /** Two or more possible readings: ask before building anything. */
  needsChoice?: { question: string; options: PlanChoiceOption[] }
  /** A new session without registered nutrition strategy where one existed before — offer to register. */
  offerStrategy?: boolean
}
