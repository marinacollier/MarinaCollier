/**
 * What Lumos knows about Marina (db.memory) — the conversation's small, undoable writers.
 *
 * Rules: facts / preferences / current state / history are separate kinds; updates use a stable
 * `key` so Lumos replaces instead of duplicating. An OBSERVED pattern is never a rule: it only gains
 * evidence; after enough evidence Lumos asks once ("quer que eu considere isso como preferência?").
 */
import type { Now } from '@/data/intel'
import { actions, getDB } from '@/data/store'
import type { DB, MemoryArea, MemoryItem, MemoryKind } from '@/data/types'
import { normalize } from '@/lib/text'
import { isoOf, updateUndoable } from './log'
import type { Undo } from './types'

/** Evidence needed before Lumos asks to turn a pattern into a preference. */
export const PATTERN_ASK_AT = 3

export function memoryByKey(db: DB, key: string): MemoryItem | undefined {
  return db.memory.find((m) => m.key === key && m.status !== 'archived')
}

/** Upsert by key (or create). Returns the undo. */
export function remember(now: Now, m: { key?: string; kind: MemoryKind; area: MemoryArea; text: string; ref?: MemoryItem['ref'] }): Undo {
  const existing = m.key ? memoryByKey(getDB(), m.key) : undefined
  if (existing) return updateUndoable('memory', existing.id, { text: m.text, kind: m.kind, area: m.area, status: 'confirmed', source: 'marina', lastSeenAt: isoOf(now), ref: m.ref ?? existing.ref })
  const item = actions.create('memory', { ...m, status: 'confirmed', source: 'marina', lastSeenAt: isoOf(now) })
  return () => void actions.remove('memory', item.id)
}

export function archiveMemory(id: string): Undo {
  return updateUndoable('memory', id, { status: 'archived' })
}

/**
 * One more observation of a pattern (never confirmed here). Returns the undo and whether it is now
 * ripe to ask about.
 */
export function observe(now: Now, key: string, text: string, area: MemoryArea): { undo: Undo; ripe: boolean } {
  const db = getDB()
  const existing = db.memory.find((m) => m.key === key)
  if (existing && existing.status !== 'observed') return { undo: () => {}, ripe: false }
  if (existing) {
    const evidence = (existing.evidence ?? 1) + 1
    const undo = updateUndoable('memory', existing.id, { evidence, lastSeenAt: isoOf(now), text })
    return { undo, ripe: evidence >= PATTERN_ASK_AT && !existing.askedAt }
  }
  const item = actions.create('memory', { key, kind: 'preference', area, text, status: 'observed', source: 'observed', evidence: 1, lastSeenAt: isoOf(now) })
  return { undo: () => void actions.remove('memory', item.id), ripe: false }
}

/** Observed patterns that are ripe and were never asked about. */
export function ripePatterns(db: DB): MemoryItem[] {
  return db.memory.filter((m) => m.status === 'observed' && (m.evidence ?? 0) >= PATTERN_ASK_AT && !m.askedAt)
}

/** The question Lumos asks once about a pattern. */
export function patternQuestion(m: MemoryItem): string {
  const t = m.text.replace(/\.$/, '')
  return `${t}. Quer que eu considere isso como preferência?`
}

/** Finds a memory item by (part of) its text. */
export function findMemoryByText(db: DB, text: string): MemoryItem | undefined {
  const q = normalize(text).replace(/[.?!]+$/g, '').trim()
  if (!q) return undefined
  return db.memory.find((m) => normalize(m.text).replace(/[.?!]+$/g, '').trim() === q) ?? db.memory.find((m) => normalize(m.text).includes(q))
}
