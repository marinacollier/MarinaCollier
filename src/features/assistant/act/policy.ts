/**
 * ACTION CONFIRMATION — one place decides whether Lumos just does it (+ Desfazer) or asks first.
 *
 * Internal, simple, personal → execute directly, offer Undo:
 *   mark a task, update a book, log food, move a training, change her own day, pantry, capture,
 *   memory/state updates, resolve a Waiting For, pick today's priorities.
 * Sensitive or external → confirm first:
 *   cancel / change an event that lives in an external or corporate calendar, send a message or
 *   e-mail, register an external transaction, change a recurring DEFAULT (template), apply a whole
 *   week plan (many records at once).
 * Relevant ambiguity always becomes a question with options (handled by the handlers themselves).
 */
import type { Conflict } from '@/data/planning'
import type { ScheduleOp } from '@/data/schedule'
import type { CalendarEvent, DB } from '@/data/types'

export type ActionKind =
  | 'complete_task'
  | 'resolve_waiting'
  | 'update_book'
  | 'log_food'
  | 'move_training'
  | 'personal_schedule'
  | 'pantry'
  | 'capture'
  | 'memory'
  | 'day_priorities'
  | 'work_mode'
  | 'plan_week'
  | 'change_default'
  | 'cancel_external_event'
  | 'change_corporate_event'
  | 'send_message'
  | 'external_transaction'

const SENSITIVE: ReadonlySet<ActionKind> = new Set<ActionKind>([
  'plan_week',
  'change_default',
  'cancel_external_event',
  'change_corporate_event',
  'send_message',
  'external_transaction',
])

export function policyFor(kind: ActionKind): 'direct' | 'confirm' {
  return SENSITIVE.has(kind) ? 'confirm' : 'direct'
}

/** An event Marina doesn't own alone: mirrored from an external calendar or a work/corporate one. */
export function isExternalEvent(db: DB, e: CalendarEvent | undefined): boolean {
  if (!e) return false
  if (e.external && e.external.provider !== 'local') return true
  const source = db.calendarSources.find((s) => s.id === e.sourceId)
  if (source && source.provider !== 'local') return true
  return e.kind === 'trabalho'
}

/** The kind of a day change (ChangePlan) for the policy: cancelling/moving an external event is sensitive. */
export function scheduleOpsKind(db: DB, ops: ScheduleOp[] | undefined): ActionKind {
  for (const op of ops ?? []) {
    const id = op.op === 'update' ? (op.collection === 'events' ? op.id : undefined) : op.ref.type === 'event' ? op.ref.id : undefined
    if (!id) continue
    const ev = db.events.find((e) => e.id === id)
    if (isExternalEvent(db, ev)) return op.op === 'override' && op.patch.cancelled ? 'cancel_external_event' : 'change_corporate_event'
  }
  return 'personal_schedule'
}

/** A day/training plan is applied directly unless it touches something sensitive or a real conflict shows up. */
export function planMode(db: DB, plan: { scheduleOps?: ScheduleOp[]; warnings: Conflict[]; needsChoice?: unknown }): 'direct' | 'confirm' {
  if (plan.needsChoice) return 'confirm'
  if (plan.warnings.some((w) => w.severity === 'warn')) return 'confirm'
  return policyFor(scheduleOpsKind(db, plan.scheduleOps))
}
