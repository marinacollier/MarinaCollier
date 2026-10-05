/**
 * Every Lumos write leaves a trace in the life timeline (db.lifeLog) so "o que mudou?" and history
 * questions work — and undo takes the trace away together with the change.
 */
import type { LifeEventDraft, Now } from '@/data/intel'
import { actions, getDB } from '@/data/store'
import type { CollectionKey, DateKey, ID, ItemOf, LifeEvent, NewItem } from '@/data/types'
import { minutesToHM, toInstant } from '@/lib/date'
import type { Undo } from './types'

export function isoOf(now: Now): string {
  return now.iso ?? toInstant(now.date, minutesToHM(Math.max(0, Math.min(24 * 60 - 1, Math.round(now.minutes))))).toISOString()
}

export type EventInput = Omit<LifeEventDraft, 'at' | 'date' | 'by' | 'provenance'> & Partial<Pick<LifeEventDraft, 'at' | 'date' | 'by' | 'provenance'>>

/** A Lumos event: by 'lumos', provenance 'user' (she told it) unless said otherwise. */
export function eventDraft(now: Now, e: EventInput): LifeEventDraft {
  return { by: 'lumos', provenance: 'user', confidence: 'high', ...e, at: e.at ?? isoOf(now), date: e.date ?? now.date }
}

/** Writes events; returns their undo. Caused events point at the first one (ActionGraph chain). */
export function logEvents(drafts: LifeEventDraft[]): Undo {
  const ids: ID[] = []
  let root: ID | undefined
  for (const d of drafts) {
    const ev = actions.create('lifeLog', { ...d, causedBy: d.causedBy ?? root } as NewItem<'lifeLog'>) as LifeEvent
    root ??= ev.id
    ids.push(ev.id)
  }
  return () => {
    for (const id of ids.reverse()) actions.remove('lifeLog', id)
  }
}

/** Runs the writes, logs the events, returns ONE undo that removes both. */
export function runLogged(write: () => Undo | void, drafts: LifeEventDraft[]): Undo {
  const undoWrite = write()
  const undoLog = logEvents(drafts)
  return () => {
    undoLog()
    undoWrite?.()
  }
}

// ─── Small undoable writers (everything through `actions`) ─────────────────

export function createUndoable<K extends CollectionKey>(key: K, data: NewItem<K>): { item: ItemOf<K>; undo: Undo } {
  const item = actions.create(key, data)
  return { item, undo: () => void actions.remove(key, item.id) }
}

export function updateUndoable<K extends CollectionKey>(key: K, id: ID, patch: Partial<ItemOf<K>>): Undo {
  const before = (getDB()[key] as ItemOf<K>[]).find((r) => r.id === id) as Record<string, unknown> | undefined
  if (!before) return () => {}
  const restore = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])) as Partial<ItemOf<K>>
  actions.update(key, id, patch)
  return () => actions.update(key, id, restore)
}

export function removeUndoable<K extends CollectionKey>(key: K, id: ID): Undo {
  const removed = actions.remove(key, id)
  return () => {
    if (removed) actions.restore(key, removed)
  }
}

export function all(undos: Undo[]): Undo {
  return () => {
    for (const u of [...undos].reverse()) u()
  }
}

export function eventDate(now: Now, date?: DateKey): DateKey {
  return date ?? now.date
}
