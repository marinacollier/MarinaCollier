/**
 * Confirm / undo. Applying writes through `actions` only and never deletes: a 'remove' change is
 * written as status 'pulado'. The snapshot taken right before applying restores every touched
 * record exactly (updated ones get their previous fields back; created ones are taken out again).
 *
 * Order: workouts → per-day schedule ops (data/schedule.ts, all by 'lumos') → checklist tasks.
 * Undo runs in reverse, so one "Desfazer" puts the whole plan back as a single unit.
 */
import type { Now } from '@/data/intel'
import { saveAdjustment } from '@/data/nutrition'
import { findModality } from '@/data/planning'
import { applyOps, type Undo } from '@/data/schedule'
import { actions, getDB } from '@/data/store'
import type { ID, LifeEvent, Workout } from '@/data/types'
import { minutesOfDay, todayKey } from '@/lib/date'
import { eventDraft, logEvents } from '../act/log'
import { observe } from '../act/memory'
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
  /** The LifeEvent(s) + observed patterns this plan wrote. */
  undoLog?: Undo
}

function nowOf(): Now {
  const d = new Date()
  return { date: todayKey(d), minutes: minutesOfDay(d), iso: d.toISOString() }
}

function eventKind(plan: ChangePlan): LifeEvent['kind'] {
  if (plan.scheduleOps?.some((o) => o.op === 'override' && o.patch.cancelled) || plan.changes.some((c) => c.kind === 'remove' || c.after.status === 'pulado')) return 'cancelled'
  if (plan.changes.some((c) => c.before && (c.before.time !== c.after.time || c.before.date !== c.after.date))) return 'moved'
  if (plan.taskCreates?.length && !plan.scheduleOps?.length && !plan.changes.length) return 'created'
  return 'changed'
}

/** One LifeEvent for the whole plan + "observed" (never confirmed) training-time patterns. */
function logPlan(plan: ChangePlan, now: Now): Undo {
  const title = (plan.doneTitle?.split('✓')[0].trim() || plan.summary).replace(/\s+/g, ' ').slice(0, 140)
  const date = plan.dayDate ?? plan.changes[0]?.after.date ?? now.date
  const undos: Undo[] = [logEvents([eventDraft(now, { kind: eventKind(plan), date, title, area: plan.changes.length ? 'esportes' : 'rotina' })])]
  for (const c of plan.changes) {
    if (c.implicit || !c.after.time || c.after.status === 'pulado' || (c.before && c.before.time === c.after.time)) continue
    if (!c.before) continue
    const label = findModality(getDB().profile, c.after.modality)?.label ?? c.after.modality
    undos.push(observe(now, `training.time.${c.after.modality}.${c.after.time}`, `Você costuma preferir ${label.toLowerCase()} às ${c.after.time}`, 'esportes').undo)
  }
  return () => {
    for (const u of undos.reverse()) u()
  }
}

export function applyPlan(plan: ChangePlan, now: Now = nowOf()): ApplySnapshot {
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
  if (hasWork(plan)) snap.undoLog = logPlan(plan, now)
  return snap
}

export function undoPlan(snap: ApplySnapshot): void {
  snap.undoLog?.()
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
