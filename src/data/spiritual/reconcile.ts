/**
 * Bíblia — reconciliations she reviews before anything changes ("Atualização de 15/10 pronta para revisar").
 *
 * - `previewUpdate` is pure: it reads the DB and lists what WOULD change (and what stays as is). Nothing written.
 * - `applyUpdate` runs once per install (profile.spiritualUpdatesApplied), only after she taps Aplicar.
 * - A session that already has a status/date is preserved; reflections are never invented — a missing one is
 *   shown as a gentle "ainda não salvas" line, not filled in.
 */
import { actions, getDB } from '../store'
import type { DB, ID, SpiritualSession } from '../types'
import { sessionSeedId } from '../seed/spiritual'

export type ChangeKind = 'mark_done' | 'set_keyword' | 'keep' | 'missing_reflection'

export interface ProposedChange {
  kind: ChangeKind
  sessionId: ID
  reference: string
  /** One line, in Portuguese, of what happens. */
  text: string
  /** Only `mark_done` / `set_keyword` write. */
  writes: boolean
}

export interface SpiritualUpdate {
  id: string
  title: string
  changes: ProposedChange[]
  applied: boolean
}

interface MarkDone {
  session: string
  note: string
}

interface UpdateSpec {
  id: string
  title: string
  /** Sessions already confirmed (shown as "mantido"). */
  keepDone: string[]
  /** Sessions explicitly left pending (no confirmation). */
  keepPending: string[]
  /** Confirmed without a date (completedAt stays unknown). */
  markDone: MarkDone[]
  /** Keywords she stated (written only when the notebook's keyword is empty). */
  keywords: { session: string; keyword: string }[]
  /** Reflections she said exist but are not in the app (never invented). */
  missingReflections: string[]
}

export const UPDATE_1015: UpdateSpec = {
  id: '2026-10-15',
  title: 'Atualização de 15/10',
  keepDone: [1, 2, 3, 4, 5].map((n) => sessionSeedId('exodo', n)),
  keepPending: [sessionSeedId('exodo', 6)],
  markDone: [{ session: sessionSeedId('profetas', 'amos-5'), note: 'leitura confirmada por foto (versículos destacados)' }],
  keywords: [{ session: sessionSeedId('profetas', 'amos-5'), keyword: 'Justiça' }],
  missingReflections: [sessionSeedId('profetas', 'amos-5')],
}

export const SPIRITUAL_UPDATES: UpdateSpec[] = [UPDATE_1015]

const find = (db: DB, id: ID): SpiritualSession | undefined => db.spiritualSessions.find((s) => s.id === id)
const currentEntry = (db: DB, sessionId: ID) =>
  db.spiritualJournal.filter((j) => j.sessionId === sessionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
/** Any reflection text (a keyword alone is not a reflection). */
export const hasReflection = (db: DB, sessionId: ID) =>
  db.spiritualJournal.some((j) => j.sessionId === sessionId && !!(j.reflectionGod || j.reflectionHumanity || j.personalReflection || j.notes))

export function previewUpdate(db: DB, spec: UpdateSpec = UPDATE_1015): SpiritualUpdate {
  const changes: ProposedChange[] = []
  const keepDone = spec.keepDone.map((id) => find(db, id)).filter((s): s is SpiritualSession => !!s && s.status === 'concluido')
  if (keepDone.length) {
    const first = keepDone[0].scriptureReference
    const last = keepDone[keepDone.length - 1].scriptureReference.replace(/^.*\s/, '')
    changes.push({ kind: 'keep', sessionId: keepDone[0].id, reference: keepDone.length > 1 ? `${first}–${last}` : first, text: 'concluídos — mantidos como estão', writes: false })
  }
  for (const id of spec.keepPending) {
    const s = find(db, id)
    if (s && s.status !== 'concluido') changes.push({ kind: 'keep', sessionId: s.id, reference: s.scriptureReference, text: 'continua pendente (sem confirmação)', writes: false })
  }
  for (const m of spec.markDone) {
    const s = find(db, m.session)
    if (!s) continue
    if (s.status === 'concluido') changes.push({ kind: 'keep', sessionId: s.id, reference: s.scriptureReference, text: 'já estava concluído — mantido como está', writes: false })
    else changes.push({ kind: 'mark_done', sessionId: s.id, reference: s.scriptureReference, text: `marcar como concluído (data não informada) · ${m.note}`, writes: true })
  }
  for (const k of spec.keywords) {
    const s = find(db, k.session)
    if (!s) continue
    const current = currentEntry(db, s.id)
    if (current?.keyword) changes.push({ kind: 'keep', sessionId: s.id, reference: s.scriptureReference, text: `palavra-chave “${current.keyword}” — mantida (seu texto)`, writes: false })
    else changes.push({ kind: 'set_keyword', sessionId: s.id, reference: s.scriptureReference, text: `palavra-chave no caderno: “${k.keyword}”`, writes: true })
  }
  for (const id of spec.missingReflections) {
    const s = find(db, id)
    if (s && !hasReflection(db, id))
      changes.push({ kind: 'missing_reflection', sessionId: s.id, reference: s.scriptureReference, text: `Reflexões de ${s.scriptureReference} ainda não salvas — cole ou escreva`, writes: false })
  }
  return { id: spec.id, title: spec.title, changes, applied: !!db.profile.spiritualUpdatesApplied?.includes(spec.id) }
}

/** The card shows only when there is something to write and she hasn't applied it yet. */
export function pendingUpdate(db: DB): SpiritualUpdate | undefined {
  for (const spec of SPIRITUAL_UPDATES) {
    const u = previewUpdate(db, spec)
    if (!u.applied && u.changes.some((c) => c.writes)) return u
  }
  return undefined
}

/** Apply once (after she confirms). Returns the number of records changed (0 when already applied). */
export function applyUpdate(spec: UpdateSpec = UPDATE_1015): number {
  const db = getDB()
  if (db.profile.spiritualUpdatesApplied?.includes(spec.id)) return 0
  let n = 0
  for (const m of spec.markDone) {
    const s = find(db, m.session)
    if (!s || s.status === 'concluido') continue // a status/date she already has is kept
    actions.update('spiritualSessions', s.id, { status: 'concluido', completedAt: undefined, doneNote: s.doneNote ?? m.note })
    n++
  }
  for (const k of spec.keywords) {
    const s = find(getDB(), k.session)
    if (!s) continue
    const current = currentEntry(getDB(), s.id)
    if (current?.keyword) continue // her keyword wins
    if (current) actions.update('spiritualJournal', current.id, { keyword: k.keyword })
    else actions.create('spiritualJournal', { sessionId: s.id, planId: s.planId, reference: s.scriptureReference, keyword: k.keyword })
    n++
  }
  actions.setProfile({ spiritualUpdatesApplied: [...(getDB().profile.spiritualUpdatesApplied ?? []), spec.id] })
  return n
}
