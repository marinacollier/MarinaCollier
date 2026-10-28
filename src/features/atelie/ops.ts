/**
 * Ateliê Literário — the only writers for works, versions and collections.
 *
 * Version rules (tested in atelie.test.ts):
 * - Autosave writes into ONE working draft (`draft: true`). It never touches an approved or checkpointed version:
 *   when the latest version is not a draft, it starts a new one.
 * - A checkpoint ("Salvar versão" or leaving the editor) turns the draft into a kept version.
 * - Restoring copies an old version into a NEW version. Nothing is overwritten or deleted.
 * - Approving is explicit (the UI asks first) and freezes that version. Editing afterwards starts a new draft.
 */
import { actions, getDB } from '@/data/store'
import type { ID, LiteraryOrigin, LiteraryVersion, LiteraryWork, NewItem } from '@/data/types'
import { nowISO } from '@/lib/id'
import { latestVersion, versionsOf, wordCount } from './model'

export function createWork(data: Partial<NewItem<'literaryWorks'>> & { title?: string; origin?: LiteraryOrigin }): LiteraryWork {
  return actions.create('literaryWorks', {
    title: data.title?.trim() || 'Sem título',
    status: 'rascunho',
    themes: [],
    symbols: [],
    collectionIds: [],
    excerpts: [],
    textPending: false,
    source: 'marina',
    ...data,
  } as NewItem<'literaryWorks'>)
}

export function updateWork(id: ID, patch: Partial<LiteraryWork>): void {
  actions.update('literaryWorks', id, patch)
}

const touchWork = (workId: ID, at: string) => {
  const w = getDB().literaryWorks.find((x) => x.id === workId)
  if (!w) return
  // A real text now exists in the app: it is no longer pending (a fact, not a status change).
  actions.update('literaryWorks', workId, { lastEditedAt: at, ...(w.textPending ? { textPending: false } : {}) })
}

/**
 * Autosave. Returns the version that holds the text now, or undefined when nothing changed.
 * Never edits an approved version; never edits a checkpointed version.
 */
export function saveDraft(workId: ID, body: string): LiteraryVersion | undefined {
  const db = getDB()
  if (!db.literaryWorks.some((w) => w.id === workId)) return undefined
  const last = latestVersion(db, workId)
  if (last && last.body === body) return last
  if (!last && !body.trim()) return undefined
  const now = nowISO()
  if (last?.draft && !last.approvedAt) {
    actions.update('literaryVersions', last.id, { body, wordCount: wordCount(body) })
    touchWork(workId, now)
    return getDB().literaryVersions.find((v) => v.id === last.id)
  }
  const v = actions.create('literaryVersions', { workId, body, wordCount: wordCount(body), source: 'marina', draft: true })
  touchWork(workId, now)
  return v
}

/** Turns the working draft into a kept version (optionally with a note). Starts nothing new. */
export function checkpoint(workId: ID, note?: string): LiteraryVersion | undefined {
  const last = latestVersion(getDB(), workId)
  if (!last?.draft) return last
  actions.update('literaryVersions', last.id, { draft: false, ...(note?.trim() ? { note: note.trim() } : {}) })
  return getDB().literaryVersions.find((v) => v.id === last.id)
}

/** "Salvar versão": saves the current text and keeps it as its own version. */
export function saveVersion(workId: ID, body: string, note?: string): LiteraryVersion | undefined {
  const last = latestVersion(getDB(), workId)
  if (last && !last.draft && last.body === body) {
    // Same text as an existing kept version: just add the note if there was none.
    if (note?.trim() && !last.note && !last.approvedAt) actions.update('literaryVersions', last.id, { note: note.trim() })
    return last
  }
  saveDraft(workId, body)
  return checkpoint(workId, note)
}

/** Copies an old version into a NEW version (the newest). Nothing is overwritten. */
export function restoreVersion(versionId: ID): LiteraryVersion | undefined {
  const db = getDB()
  const src = db.literaryVersions.find((v) => v.id === versionId)
  if (!src) return undefined
  checkpoint(src.workId)
  const n = versionsOf(db, src.workId).findIndex((v) => v.id === src.id) + 1
  const v = actions.create('literaryVersions', {
    workId: src.workId,
    body: src.body,
    wordCount: wordCount(src.body),
    source: 'marina',
    restoredFromId: src.id,
    note: `Restaurada da versão ${n}`,
  })
  touchWork(src.workId, v.createdAt)
  return v
}

/** Her explicit approval (the UI confirms first). Freezes the version; the work becomes "versão final aprovada". */
export function approveVersion(versionId: ID): LiteraryVersion | undefined {
  const v = getDB().literaryVersions.find((x) => x.id === versionId)
  if (!v) return undefined
  const at = v.approvedAt ?? nowISO()
  actions.update('literaryVersions', v.id, { draft: false, approvedAt: at })
  actions.update('literaryWorks', v.workId, { approvedVersionId: v.id, status: 'final_aprovada', provenance: undefined, textPending: false })
  return getDB().literaryVersions.find((x) => x.id === versionId)
}

/** One favorite per work; tapping the favorite again clears it. */
export function toggleFavorite(versionId: ID): boolean {
  const db = getDB()
  const v = db.literaryVersions.find((x) => x.id === versionId)
  if (!v) return false
  const on = !v.favorite
  for (const other of versionsOf(db, v.workId)) if (other.favorite && other.id !== v.id) actions.update('literaryVersions', other.id, { favorite: false })
  actions.update('literaryVersions', v.id, { favorite: on })
  actions.update('literaryWorks', v.workId, { favoriteVersionId: on ? v.id : undefined })
  return on
}

/** Only notes may change on a frozen (approved) version; body edits are refused. */
export function setVersionNote(versionId: ID, note: string): void {
  actions.update('literaryVersions', versionId, { note: note.trim() || undefined })
}

// ─── Collections ────────────────────────────────────────────────────────────

export function createCollection(name: string, description?: string) {
  return actions.create('literaryCollections', { name: name.trim() || 'Nova coleção', description: description?.trim() || undefined, themes: [], workIds: [], source: 'marina' })
}

export function setInCollection(collectionId: ID, workId: ID, inside: boolean): void {
  const db = getDB()
  const c = db.literaryCollections.find((x) => x.id === collectionId)
  const w = db.literaryWorks.find((x) => x.id === workId)
  if (!c || !w) return
  const has = c.workIds.includes(workId)
  if (inside && !has) actions.update('literaryCollections', c.id, { workIds: [...c.workIds, workId] })
  if (!inside && has) actions.update('literaryCollections', c.id, { workIds: c.workIds.filter((x) => x !== workId) })
  const wHas = w.collectionIds.includes(collectionId)
  if (inside && !wHas) actions.update('literaryWorks', w.id, { collectionIds: [...w.collectionIds, collectionId] })
  if (!inside && wHas) actions.update('literaryWorks', w.id, { collectionIds: w.collectionIds.filter((x) => x !== collectionId) })
}

export function moveInCollection(collectionId: ID, workId: ID, delta: -1 | 1): void {
  const c = getDB().literaryCollections.find((x) => x.id === collectionId)
  if (!c) return
  const i = c.workIds.indexOf(workId)
  const j = i + delta
  if (i < 0 || j < 0 || j >= c.workIds.length) return
  const ids = [...c.workIds]
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  actions.update('literaryCollections', c.id, { workIds: ids })
}

/** Deleting a collection never deletes works: they just leave it. */
export function removeCollection(collectionId: ID): void {
  const db = getDB()
  for (const w of db.literaryWorks) if (w.collectionIds.includes(collectionId)) actions.update('literaryWorks', w.id, { collectionIds: w.collectionIds.filter((x) => x !== collectionId) })
  actions.remove('literaryCollections', collectionId)
}

/** Deleting a work removes its versions too (the UI asks first and offers "Desfazer"). */
export function removeWork(workId: ID): { work?: LiteraryWork; versions: LiteraryVersion[] } {
  const db = getDB()
  const versions = versionsOf(db, workId)
  for (const c of db.literaryCollections) if (c.workIds.includes(workId)) actions.update('literaryCollections', c.id, { workIds: c.workIds.filter((x) => x !== workId) })
  for (const v of versions) actions.remove('literaryVersions', v.id)
  const work = actions.remove('literaryWorks', workId)
  return { work, versions }
}

export function undoRemoveWork(saved: { work?: LiteraryWork; versions: LiteraryVersion[] }): void {
  if (!saved.work) return
  actions.restore('literaryWorks', saved.work)
  for (const v of saved.versions) actions.restore('literaryVersions', v)
  for (const cid of saved.work.collectionIds) {
    const c = getDB().literaryCollections.find((x) => x.id === cid)
    if (c && !c.workIds.includes(saved.work.id)) actions.update('literaryCollections', c.id, { workIds: [...c.workIds, saved.work.id] })
  }
}

// ─── Author profile ─────────────────────────────────────────────────────────

export function dismissTip(tip: string): void {
  const p = getDB().literaryProfile[0]
  if (!p) return
  actions.update('literaryProfile', p.id, { dismissedTips: [...new Set([...(p.dismissedTips ?? []), tip])] })
}
