/**
 * Confirm / undo. Applying writes through `actions` only and never deletes: a 'remove' change is
 * written as status 'pulado'. The snapshot taken right before applying restores every touched
 * record exactly (updated ones get their previous fields back; created ones are taken out again).
 */
import { actions, getDB } from '@/data/store'
import type { ID, Workout } from '@/data/types'
import type { ChangePlan } from './types'

export interface ApplySnapshot {
  /** Records as they were before (updated ones). */
  updated: Workout[]
  /** Ids of records this plan created. */
  created: ID[]
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
  return snap
}

export function undoPlan(snap: ApplySnapshot): void {
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
