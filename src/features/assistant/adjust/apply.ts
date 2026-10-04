/**
 * Confirm / undo. Applying writes through `actions` only and never deletes: a 'remove' change is
 * written as status 'pulado'. The snapshot taken right before applying restores every touched
 * record exactly (updated ones get their previous fields back; created ones are taken out again).
 *
 * Order: workouts → per-day schedule ops (data/schedule.ts, all by 'lumos') → checklist tasks.
 * Undo runs in reverse, so one "Desfazer" puts the whole plan back as a single unit.
 */
import { saveAdjustment } from '@/data/nutrition'
import { applyOps, type Undo } from '@/data/schedule'
import { actions, getDB } from '@/data/store'
import type { ID, Workout } from '@/data/types'
import type { ChangePlan } from './types'

export interface ApplySnapshot {
  /** Records as they were before (updated ones). */
  updated: Workout[]
  /** Ids of records this plan created. */
  created: ID[]
  /** Undo of the schedule ops (overrides, exdates, plan meal times). */
  undoOps?: Undo
  /** Checklist tasks this plan created. */
  createdTasks?: ID[]
  /** Undo of the meal overlays (nutrition engine). */
  undoMeals?: Undo[]
}

export function applyPlan(plan: ChangePlan): ApplySnapshot {
  const snap: ApplySnapshot = { updated: [], created: [] }
  for (const c of plan.changes) {
    const current = c.kind === 'create' ? undefined : getDB().workouts.find((w) => w.id === (c.id ?? c.after.id))
    if (c.kind === 'create') {
      if (getDB().workouts.some((w) => w.id === c.after.id)) continue
      actions.create('workouts', c.after)
      snap.created.push(c.after.id)
      continue
    }
    if (!current) continue
    snap.updated.push(current)
    if (c.kind === 'remove') {
      actions.update('workouts', current.id, { status: 'pulado' })
      continue
    }
    const { id: _id, ...after } = c.after
    const patch: Record<string, unknown> = { ...after }
    for (const k of Object.keys(current)) if (!(k in after) && k !== 'createdAt' && k !== 'updatedAt' && k !== 'id') patch[k] = undefined
    actions.update('workouts', current.id, patch as Partial<Workout>)
  }
  if (plan.scheduleOps?.length) snap.undoOps = applyOps(plan.scheduleOps)
  if (plan.taskCreates?.length) {
    snap.createdTasks = []
    for (const t of plan.taskCreates) {
      if (getDB().tasks.some((x) => x.id === t.id)) continue
      actions.create('tasks', t)
      snap.createdTasks.push(t.id)
    }
  }
  if (plan.mealAdjustments?.length) snap.undoMeals = plan.mealAdjustments.map((d) => saveAdjustment(d).undo)
  return snap
}

export function undoPlan(snap: ApplySnapshot): void {
  for (const u of [...(snap.undoMeals ?? [])].reverse()) u()
  for (const id of snap.createdTasks ?? []) actions.remove('tasks', id)
  snap.undoOps?.()
  for (const id of snap.created) actions.remove('workouts', id)
  if (!snap.updated.length) return
  const now = getDB().workouts
  actions.upsertMany(
    'workouts',
    snap.updated.map((before) => {
      const cur = now.find((w) => w.id === before.id)
      const cleared: Record<string, unknown> = {}
      for (const k of Object.keys(cur ?? {})) if (!(k in before)) cleared[k] = undefined
      return { ...cleared, ...before } as Workout
    }),
  )
}

/** True when confirming the plan would change something. */
export function hasWork(plan: ChangePlan): boolean {
  return plan.changes.length > 0 || !!plan.scheduleOps?.length || !!plan.taskCreates?.length || !!plan.mealAdjustments?.length
}
