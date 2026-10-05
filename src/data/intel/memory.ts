/**
 * TemporalMemory — what Lumos knows, in layers:
 *   fact (permanent) · preference · state (current, temporary) · exception (one occurrence: a
 *   ScheduleOverride / an exdate) · pattern (observed, NEVER a rule until Marina confirms).
 * Writes are store writes with undo and a LifeEvent ("Lumos guardou…"), so history and "o que mudou" work.
 */
import type { Confidence, DateKey, DB, MemoryArea, MemoryItem, Provenance, ScheduleOverride } from '../types'
import { actions, getDB } from '../store'
import { modalityOf, readingNow } from '../selectors'
import { overrideFor } from '../timeline'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'
import { dayLabel, fmtDuration } from './context'
import { logLife } from './log'
import type { MemoryLayer, MemoryView, Now, Undo } from './types'

/** Evidence needed before Lumos asks "quer que eu considere isso como preferência?". */
export const PATTERN_EVIDENCE = 3

const LAYER_ORDER: MemoryLayer[] = ['fact', 'preference', 'state', 'exception', 'history', 'pattern']

/**
 * Provenance: observed -> inference; seed (her brief) -> 'fact' for facts, 'user' for preferences/state/
 * history (she said it, it's not a verified fact); Marina -> user; Lumos-written -> inference.
 */
function provenanceOf(m: MemoryItem): Provenance {
  if (m.status === 'observed') return 'inference'
  if (m.source === 'seed') return m.kind === 'fact' ? 'fact' : 'user'
  if (m.source === 'marina') return 'user'
  return 'inference'
}

function confidenceOf(m: MemoryItem): Confidence {
  if (m.status === 'observed') return (m.evidence ?? 0) >= PATTERN_EVIDENCE ? 'medium' : 'low'
  return m.source === 'lumos' ? 'medium' : 'high'
}

function layerOf(m: MemoryItem): MemoryLayer {
  return m.status === 'observed' ? 'pattern' : m.kind
}

/** Short human description of a one-day exception. */
function describeOverride(db: DB, o: ScheduleOverride, today: DateKey): string | undefined {
  const when = dayLabel(o.date, today)
  let title: string | undefined
  switch (o.refType) {
    case 'workout': {
      const w = db.workouts.find((x) => x.id === o.refId)
      title = w ? w.title || modalityOf(db, w.modality).label : undefined
      break
    }
    case 'weekTemplate':
      title = db.weekTemplate.find((x) => x.id === o.refId)?.title
      break
    case 'event':
      title = db.events.find((x) => x.id === o.refId)?.title
      break
    case 'routineItem':
      title = db.routineItems.find((x) => x.id === o.refId)?.title
      break
    case 'task':
      title = db.tasks.find((x) => x.id === o.refId)?.title
      break
    case 'planMeal': {
      const [planId, idx] = o.refId.split('#')
      title = db.nutritionDayPlans.find((p) => p.id === planId)?.meals[Number(idx)]?.name
      break
    }
    case 'work':
      return o.workMode ? `${when}: trabalho ${o.workMode === 'off' ? 'off' : o.workMode}` : o.cancelled ? `${when}: sem trabalho` : undefined
    default:
      title = undefined
  }
  if (!title) return undefined
  if (o.cancelled) return `${when}: ${title} cancelado (só nesse dia)`
  const parts = [o.time ? `às ${o.time}` : undefined, o.durationMin ? fmtDuration(o.durationMin) : undefined, o.anytime ? 'qualquer momento' : undefined].filter(Boolean)
  return parts.length ? `${when}: ${title} ${parts.join(', ')} (só nesse dia)` : undefined
}

/** Everything Lumos knows, by layer (fact → preference → state → exception → pattern). */
export function memoryView(db: DB, now: Now): MemoryView[] {
  const out: MemoryView[] = (db.memory ?? [])
    .filter((m) => m.status !== 'archived')
    .map((m) => ({ layer: layerOf(m), text: m.text, provenance: provenanceOf(m), confidence: confidenceOf(m), item: m }))

  // Current state that lives in the data even when no memory item says it yet.
  const known = normalize(out.map((v) => v.text).join(' | '))
  for (const b of readingNow(db)) {
    if (!known.includes(normalize(b.title))) out.push({ layer: 'state', text: `Lendo ${b.title}${b.author ? ` (${b.author})` : ''}${b.currentChapter ? ` — ${b.currentChapter}` : ''}`, provenance: 'fact', confidence: 'high' })
  }

  // Exceptions: one-occurrence changes from today on (ScheduleOverrides + exdates).
  const seen = new Set<string>()
  for (const o of db.scheduleOverrides ?? []) {
    if (o.date < now.date) continue
    const latest = overrideFor(db, o.date, o.refType, o.refId)
    if (latest?.id !== o.id) continue
    const text = describeOverride(db, o, now.date)
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push({ layer: 'exception', text, provenance: 'user', confidence: 'high', validUntil: o.date })
  }
  for (const e of db.events) {
    for (const d of e.exdates ?? []) {
      if (d < now.date) continue
      out.push({ layer: 'exception', text: `${dayLabel(d, now.date)}: ${e.title} cancelado (só nesse dia)`, provenance: 'user', confidence: 'high', validUntil: d })
    }
  }
  return out.sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer) || (a.validUntil ?? '').localeCompare(b.validUntil ?? ''))
}

/** Memory items of a layer that Lumos may rely on (confirmed only — patterns never count as rules). */
export function confirmedMemory(db: DB, area?: MemoryArea): MemoryItem[] {
  return (db.memory ?? []).filter((m) => m.status === 'confirmed' && (!area || m.area === area))
}

export function memoryByKey(db: DB, key: string): MemoryItem | undefined {
  return (db.memory ?? []).find((m) => m.key === key)
}

// ─── Writes (logged + undoable) ─────────────────────────────────────────────

function upsert(key: string | undefined, data: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt'>): { item: MemoryItem; undo: Undo } {
  const existing = key ? memoryByKey(getDB(), key) : undefined
  if (existing) {
    const before = { ...existing }
    actions.update('memory', existing.id, data)
    return { item: getDB().memory.find((m) => m.id === existing.id)!, undo: () => actions.update('memory', existing.id, before) }
  }
  const item = actions.create('memory', data)
  return { item, undo: () => void actions.remove('memory', item.id) }
}

const chain =
  (...undos: Undo[]): Undo =>
  () => {
    for (const u of [...undos].reverse()) u()
  }

export interface RememberOptions {
  area: MemoryArea
  key?: string
  kind?: 'fact' | 'preference' | 'history'
  ref?: MemoryItem['ref']
}

/** "Lembra que…": a fact / preference Marina said. Updates by key instead of duplicating. */
export function rememberFact(text: string, opts: RememberOptions): { item: MemoryItem; undo: Undo } {
  const { item, undo } = upsert(opts.key, { kind: opts.kind ?? 'fact', area: opts.area, text, key: opts.key, status: 'confirmed', source: 'marina', lastSeenAt: nowISO(), ...(opts.ref ? { ref: opts.ref } : {}) })
  const log = logLife({ kind: 'learned', title: `Lumos guardou: ${text}`, area: opts.area, ref: { type: 'memory', id: item.id }, by: 'lumos', provenance: 'user', confidence: 'high' })
  return { item, undo: chain(undo, log.undo) }
}

/**
 * Current state ("lendo X", "não faço mais yoga na terça"). `text: null` ends the state.
 * `history` keeps what ended as a history item ("terminou X em 05/10").
 */
export function updateState(key: string, text: string | null, opts: { area: MemoryArea; ref?: MemoryItem['ref']; history?: string }): { item?: MemoryItem; undo: Undo } {
  const undos: Undo[] = []
  let item: MemoryItem | undefined
  if (text === null) {
    const existing = memoryByKey(getDB(), key)
    if (existing && existing.status !== 'archived') {
      actions.update('memory', existing.id, { status: 'archived' })
      undos.push(() => actions.update('memory', existing.id, { status: existing.status }))
    }
  } else {
    const r = upsert(key, { kind: 'state', area: opts.area, text, key, status: 'confirmed', source: 'marina', lastSeenAt: nowISO(), ...(opts.ref ? { ref: opts.ref } : {}) })
    item = r.item
    undos.push(r.undo)
  }
  if (opts.history) {
    const h = actions.create('memory', { kind: 'history', area: opts.area, text: opts.history, status: 'confirmed', source: 'marina', ...(opts.ref ? { ref: opts.ref } : {}) })
    undos.push(() => void actions.remove('memory', h.id))
  }
  const log = logLife({ kind: text === null ? 'resolved' : 'learned', title: text ?? opts.history ?? 'Estado encerrado', area: opts.area, ref: item ? { type: 'memory', id: item.id } : undefined, by: 'lumos', provenance: 'user' })
  undos.push(log.undo)
  return { item, undo: chain(...undos) }
}

/**
 * One more observation of a pattern ("moveu o treino pras 06:00 de novo"). Increments evidence; never
 * becomes 'confirmed' by itself. A pattern Marina already rejected (archived) is not re-learned.
 * `readyToAsk` = enough evidence and Lumos never asked.
 */
export function observe(key: string, text: string, area: MemoryArea = 'habitos'): { item?: MemoryItem; undo: Undo; readyToAsk: boolean } {
  const existing = memoryByKey(getDB(), key)
  if (existing && existing.status !== 'observed') return { item: existing, undo: () => {}, readyToAsk: false }
  const evidence = (existing?.evidence ?? 0) + 1
  const { item, undo } = upsert(key, { kind: 'preference', area, text, key, status: 'observed', source: 'observed', evidence, lastSeenAt: nowISO(), ...(existing?.askedAt ? { askedAt: existing.askedAt } : {}) })
  const log = logLife({ kind: 'learned', title: `Lumos notou: ${text} (${evidence}×)`, area, ref: { type: 'memory', id: item.id }, by: 'lumos', provenance: 'inference', confidence: 'low' })
  return { item, undo: chain(undo, log.undo), readyToAsk: evidence >= PATTERN_EVIDENCE && !item.askedAt }
}

/** Lumos asked once ("quer que eu considere isso como preferência?") — it won't ask again. */
export function markPatternAsked(id: string): Undo {
  const m = getDB().memory.find((x) => x.id === id)
  if (!m) return () => {}
  actions.update('memory', id, { askedAt: nowISO() })
  return () => actions.update('memory', id, { askedAt: m.askedAt })
}

/** Marina's answer: yes → confirmed preference (her rule now); no → archived (never asked again). */
export function confirmPattern(id: string, accept = true): Undo {
  const m = getDB().memory.find((x) => x.id === id)
  if (!m) return () => {}
  const before = { status: m.status, source: m.source, askedAt: m.askedAt }
  actions.update('memory', id, accept ? { status: 'confirmed', source: 'marina', askedAt: m.askedAt ?? nowISO() } : { status: 'archived', askedAt: m.askedAt ?? nowISO() })
  const log = logLife({ kind: 'learned', title: accept ? `Virou preferência: ${m.text}` : `Não é preferência: ${m.text}`, area: m.area, ref: { type: 'memory', id }, by: 'lumos', provenance: 'user' })
  return chain(() => actions.update('memory', id, before), log.undo)
}

/** "Corrige isso" from the memory screen or the chat. */
export function correctMemory(id: string, text: string): Undo {
  const m = getDB().memory.find((x) => x.id === id)
  if (!m) return () => {}
  actions.update('memory', id, { text, source: 'marina', status: m.status === 'observed' ? 'observed' : 'confirmed' })
  const log = logLife({ kind: 'changed', title: `Lumos corrigiu: ${text}`, area: m.area, ref: { type: 'memory', id }, by: 'marina', provenance: 'user' })
  return chain(() => actions.update('memory', id, { text: m.text, source: m.source, status: m.status }), log.undo)
}

/** "Esquece isso." Removes the item (undo puts it back). */
export function forget(id: string): Undo {
  const removed = actions.remove('memory', id)
  if (!removed) return () => {}
  const log = logLife({ kind: 'changed', title: `Lumos esqueceu: ${removed.text}`, area: removed.area, by: 'marina', provenance: 'user' })
  return chain(() => actions.restore('memory', removed), log.undo)
}

