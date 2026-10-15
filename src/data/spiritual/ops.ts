/**
 * Bíblia, Graça & Liberdade — the only writers. The module screens AND the Home call these, so a session
 * has one done-state (single source of truth). Unchecking never deletes reflections or studies.
 */
import { actions, getDB } from '../store'
import type { BibleStudyContent, ID, NewItem, SpiritualJournalEntry, SpiritualPrayerCategory, SpiritualSession } from '../types'
import { nowISO } from '@/lib/id'

function hasWork(sessionId: ID): boolean {
  const db = getDB()
  return db.spiritualJournal.some((j) => j.sessionId === sessionId) || db.spiritualStudies.some((s) => s.sessionId === sessionId)
}

/** Check / uncheck a session (retroactive allowed). Returns the new done state, or undefined if missing. */
export function setSessionDone(id: ID, done: boolean): boolean | undefined {
  const s = getDB().spiritualSessions.find((x) => x.id === id)
  if (!s) return undefined
  const patch: Partial<SpiritualSession> = done
    ? { status: 'concluido', completedAt: s.status === 'concluido' ? s.completedAt : nowISO() }
    : { status: hasWork(id) ? 'em_andamento' : 'pendente', completedAt: undefined, importedDone: undefined, doneNote: undefined }
  actions.update('spiritualSessions', id, patch)
  return done
}

export function toggleSession(id: ID): boolean | undefined {
  const s = getDB().spiritualSessions.find((x) => x.id === id)
  if (!s) return undefined
  return setSessionDone(id, s.status !== 'concluido')
}

/** Writing in the notebook or generating a study moves a pending session to "em andamento" (never to done). */
function touch(sessionId: ID) {
  const s = getDB().spiritualSessions.find((x) => x.id === sessionId)
  if (s && s.status === 'pendente') actions.update('spiritualSessions', s.id, { status: 'em_andamento' })
}

export type JournalFields = Pick<SpiritualJournalEntry, 'reflectionGod' | 'reflectionHumanity' | 'personalReflection' | 'keyword' | 'prayer' | 'notes'>

const clean = (f: JournalFields): JournalFields => {
  const out: JournalFields = {}
  for (const [k, v] of Object.entries(f) as [keyof JournalFields, string | undefined][]) out[k] = v?.trim() ? v.trim() : undefined
  return out
}

export const isEmptyJournal = (f: JournalFields) => Object.values(clean(f)).every((v) => !v)

/** Create (no entryId) or edit an entry of the session's notebook. */
export function saveJournal(sessionId: ID, fields: JournalFields, entryId?: ID): SpiritualJournalEntry | undefined {
  const db = getDB()
  const s = db.spiritualSessions.find((x) => x.id === sessionId)
  if (!s || isEmptyJournal(fields)) return undefined
  const data = clean(fields)
  if (entryId && db.spiritualJournal.some((j) => j.id === entryId)) {
    actions.update('spiritualJournal', entryId, data)
    return getDB().spiritualJournal.find((j) => j.id === entryId)
  }
  const entry = actions.create('spiritualJournal', { sessionId, planId: s.planId, reference: s.scriptureReference, ...data })
  touch(sessionId)
  return entry
}

export function saveStudy(sessionId: ID, content: BibleStudyContent, userNotes?: string) {
  const data: NewItem<'spiritualStudies'> = { sessionId, content, contentSource: 'lumos', generatedAt: nowISO() }
  if (userNotes?.trim()) data.userNotes = userNotes.trim()
  const study = actions.create('spiritualStudies', data)
  touch(sessionId)
  return study
}

export function savePrayer(fields: { title?: string; content: string; category: SpiritualPrayerCategory }, id?: ID) {
  const content = fields.content.trim()
  if (!content) return undefined
  const title = fields.title?.trim() || undefined
  if (id) {
    actions.update('spiritualPrayers', id, { title, content, category: fields.category })
    return getDB().spiritualPrayers.find((p) => p.id === id)
  }
  return actions.create('spiritualPrayers', { title, content, category: fields.category })
}

/**
 * Retroactive marking ("li e não registrei"): several sessions at once, with the date she picks or none
 * (unknown — never invented). Sessions already done keep their status/date. Returns how many changed.
 */
export function markSessionsDone(ids: ID[], date?: string): number {
  let n = 0
  for (const id of ids) {
    const s = getDB().spiritualSessions.find((x) => x.id === id)
    if (!s || s.status === 'concluido') continue
    actions.update('spiritualSessions', id, date ? { status: 'concluido', completedAt: new Date(`${date}T12:00:00`).toISOString() } : { status: 'concluido', completedAt: undefined, doneNote: s.doneNote ?? 'data desconhecida' })
    n++
  }
  return n
}

/** The notebook record the study page edits: the most recent entry of the session. */
export function currentJournal(sessionId: ID): SpiritualJournalEntry | undefined {
  return getDB()
    .spiritualJournal.filter((j) => j.sessionId === sessionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

/**
 * Autosave of the notebook: ONE record per session (the current one), created on the first non-empty text
 * and then updated in place — never duplicated. Clearing a field clears it (her choice); the record itself
 * is never deleted here. Returns the record (undefined while there is nothing to write).
 */
export function saveJournalDraft(sessionId: ID, fields: JournalFields): SpiritualJournalEntry | undefined {
  const s = getDB().spiritualSessions.find((x) => x.id === sessionId)
  if (!s) return undefined
  const current = currentJournal(sessionId)
  const data = clean(fields)
  if (current) {
    const changed = (Object.keys(data) as (keyof JournalFields)[]).some((k) => current[k] !== data[k])
    if (changed) actions.update('spiritualJournal', current.id, data)
    return getDB().spiritualJournal.find((j) => j.id === current.id)
  }
  if (isEmptyJournal(fields)) return undefined
  const entry = actions.create('spiritualJournal', { sessionId, planId: s.planId, reference: s.scriptureReference, ...data })
  touch(sessionId)
  return entry
}
