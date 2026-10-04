/**
 * "Ajustar por conversa" — the contract between whoever understands the sentence (today the
 * deterministic planner in ./planner.ts; later, maybe, a server-side model — see ../llm.ts) and
 * the preview → confirm → undo flow. A ChangePlan is ALWAYS shown before anything changes.
 */
import type { Conflict } from '@/data/planning'
import type { ScheduleOp } from '@/data/schedule'
import type { DateKey, ID, MealAdjustment, Task, TimeHM, Workout } from '@/data/types'

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

  // ── The day itself (Lumos controls the day) ──────────────────────────────
  /**
   * Per-day time edits (data/schedule.ts): set a time, cancel an occurrence (+ its prep), move after
   * something, slide a routine, "acordei agora", re-time plan meals around a moved training.
   * Always written with by: 'lumos'; applied after the workout changes, undone first.
   */
  scheduleOps?: ScheduleOp[]
  /** Checklist / prep items created as dated Tasks with a time (origin meal when it serves one). */
  taskCreates?: TaskDraft[]
  /** One-day meal overlays from the nutrition engine ("tira o lanche de amanhã" = a 'pular'). */
  mealAdjustments?: MealAdjustmentDraft[]
  /** What changes on the day's line, for the preview (computed from the real timeline). */
  dayRows?: DayRow[]
  /** The day the rows belong to. */
  dayDate?: DateKey
  /** Lumos's sentence before confirming ("São 05:12. Seu treino continua às 06:00…"). */
  previewTitle?: string
  /** …and once applied ("Inglês de amanhã cancelado ✓ Seu horário das 19h ficou livre."). */
  doneTitle?: string
  /** Label of the confirm button ("Aplicar" for "acordei agora"). */
  confirmLabel?: string
  /** Read-only checklist of the day (meals + prep), shown with the plan. */
  checklist?: ChecklistLine[]
  /** Small line under the title ("KIT TERÇA — PRESENCIAL · …"). */
  subtitle?: string
  /** A screen that goes deeper (Meal prep). */
  link?: { label: string; to: string }
}

export type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'updatedAt'> & { id: ID }
export type MealAdjustmentDraft = Omit<MealAdjustment, 'id' | 'createdAt' | 'updatedAt'>

export interface DayRow {
  key: string
  title: string
  emoji?: string
  state: 'moved' | 'cancelled' | 'new' | 'kept' | 'free'
  from?: TimeHM
  to?: TimeHM
  /** Changed by Lumos (badge). */
  lumos?: boolean
  /** The thing she asked about (vs. what slid along with it). */
  primary?: boolean
  note?: string
}

export interface ChecklistLine {
  key: string
  time?: TimeHM
  title: string
  emoji?: string
  kind: 'meal' | 'prep'
  done: boolean
  cancelled?: boolean
  badge?: 'nutri' | 'troca' | 'lumos' | 'marina'
}
