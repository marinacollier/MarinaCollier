/**
 * Write units for the intelligence layer. Every Lumos change is built as a list of ops first, so it can be
 * PREVIEWED on a copy of the DB (to explain what it drags along) and then COMMITTED through `actions`
 * with ONE undo for the whole unit (LifeEvents included — undo takes them out too).
 */
import type { CollectionKey, DateKey, DB, ID, ScheduleOverride, ScheduleRefType, UserProfile } from '../types'
import { actions, getDB } from '../store'
import { overrideFor } from '../timeline'
import type { ScheduleOp } from '../schedule'
import { nowISO, uid } from '@/lib/id'
import type { Undo } from './types'

export type OverrideFields = Partial<Pick<ScheduleOverride, 'time' | 'endTime' | 'cancelled' | 'anytime' | 'durationMin' | 'workMode' | 'reason'>>

export type IntelOp =
  | { op: 'create'; collection: CollectionKey; item: { id: ID } & Record<string, unknown> }
  | { op: 'patch'; collection: CollectionKey; id: ID; patch: Record<string, unknown> }
  | { op: 'delete'; collection: CollectionKey; id: ID }
  | { op: 'override'; date: DateKey; ref: { type: ScheduleRefType; id: string }; patch: OverrideFields; by: ScheduleOverride['by'] }
  | { op: 'clearOverride'; date: DateKey; ref: { type: ScheduleRefType; id: string } }
  | { op: 'profile'; patch: Partial<UserProfile> }

/** Ops from the schedule engine (planSetTime, cancelOn, replanFrom…) in this format. */
export function fromScheduleOps(ops: ScheduleOp[]): IntelOp[] {
  return ops.map((o): IntelOp => {
    if (o.op === 'update') return { op: 'patch', collection: o.collection, id: o.id, patch: o.patch }
    if (o.op === 'clear') return { op: 'clearOverride', date: o.date, ref: o.ref }
    return { op: 'override', date: o.date, ref: o.ref, patch: o.patch, by: o.by }
  })
}

export const createOp = <T extends Record<string, unknown>>(collection: CollectionKey, data: T & { id?: ID }): IntelOp & { op: 'create' } => ({
  op: 'create',
  collection,
  item: { ...data, id: data.id ?? uid() },
})

type Row = { id: ID } & Record<string, unknown>

/** Applies ops to a copy of the DB (nothing written). Used for previews and the dependency lines. */
export function previewOps(db: DB, ops: IntelOp[], stamp: string = nowISO()): DB {
  let out: DB = { ...db, scheduleOverrides: [...(db.scheduleOverrides ?? [])] }
  for (const op of ops) {
    switch (op.op) {
      case 'create': {
        const list = out[op.collection] as unknown as Row[]
        out = { ...out, [op.collection]: [...list, { createdAt: stamp, updatedAt: stamp, ...op.item }] }
        break
      }
      case 'patch': {
        const list = out[op.collection] as unknown as Row[]
        out = { ...out, [op.collection]: list.map((r) => (r.id === op.id ? { ...r, ...op.patch, updatedAt: stamp } : r)) }
        break
      }
      case 'delete': {
        const list = out[op.collection] as unknown as Row[]
        out = { ...out, [op.collection]: list.filter((r) => r.id !== op.id) }
        break
      }
      case 'override': {
        const existing = overrideFor(out, op.date, op.ref.type, op.ref.id)
        out.scheduleOverrides = existing
          ? out.scheduleOverrides.map((o) => (o.id === existing.id ? { ...o, ...op.patch, by: op.by, updatedAt: stamp } : o))
          : [...out.scheduleOverrides, { id: uid(), createdAt: stamp, updatedAt: stamp, date: op.date, refType: op.ref.type, refId: op.ref.id, by: op.by, ...op.patch }]
        break
      }
      case 'clearOverride': {
        const existing = overrideFor(out, op.date, op.ref.type, op.ref.id)
        if (existing) out.scheduleOverrides = out.scheduleOverrides.filter((o) => o.id !== existing.id)
        break
      }
      case 'profile':
        out = { ...out, profile: { ...out.profile, ...op.patch } }
        break
    }
  }
  return out
}

/** Writes the ops through `actions`; the returned undo puts everything back (reverse order). */
export function commitOps(ops: IntelOp[]): Undo {
  const undos: Undo[] = []
  for (const op of ops) {
    switch (op.op) {
      case 'create': {
        const created = actions.create(op.collection, op.item as never)
        undos.push(() => void actions.remove(op.collection, created.id))
        break
      }
      case 'patch': {
        const before = (getDB()[op.collection] as unknown as Row[]).find((r) => r.id === op.id)
        if (!before) break
        const restore = Object.fromEntries(Object.keys(op.patch).map((k) => [k, before[k]]))
        actions.update(op.collection, op.id, op.patch as never)
        undos.push(() => actions.update(op.collection, op.id, restore as never))
        break
      }
      case 'delete': {
        const removed = actions.remove(op.collection, op.id)
        if (removed) undos.push(() => actions.restore(op.collection, removed))
        break
      }
      case 'override': {
        const existing = overrideFor(getDB(), op.date, op.ref.type, op.ref.id)
        if (existing) {
          const keys = [...Object.keys(op.patch), 'by'] as (keyof ScheduleOverride)[]
          const restore = Object.fromEntries(keys.map((k) => [k, existing[k]]))
          actions.update('scheduleOverrides', existing.id, { ...op.patch, by: op.by })
          undos.push(() => actions.update('scheduleOverrides', existing.id, restore))
        } else {
          const created = actions.create('scheduleOverrides', { date: op.date, refType: op.ref.type, refId: op.ref.id, by: op.by, ...op.patch })
          undos.push(() => void actions.remove('scheduleOverrides', created.id))
        }
        break
      }
      case 'clearOverride': {
        const existing = overrideFor(getDB(), op.date, op.ref.type, op.ref.id)
        if (!existing) break
        actions.remove('scheduleOverrides', existing.id)
        undos.push(() => actions.restore('scheduleOverrides', existing))
        break
      }
      case 'profile': {
        const before = getDB().profile
        const restore = Object.fromEntries(Object.keys(op.patch).map((k) => [k, before[k as keyof UserProfile]])) as Partial<UserProfile>
        actions.setProfile(op.patch)
        undos.push(() => actions.setProfile(restore))
        break
      }
    }
  }
  return () => {
    for (const u of undos.reverse()) u()
  }
}
