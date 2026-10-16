/**
 * Automatic local snapshots: a full copy of the DB taken right before any import (changes file, Daily
 * Briefing, backup restore). Kept on this device only (its own IndexedDB store, next to the app's), the
 * last few — "voltar para antes da importação" even when an undo can't (e.g. after she edited things).
 */
import { createStore, get, set } from 'idb-keyval'
import { actions, flushNow, getDB } from './store'
import type { DB } from './types'
import { nowISO, uid } from '@/lib/id'

export interface Snapshot {
  id: string
  at: string
  reason: string
  records: number
  db: DB
}
export type SnapshotInfo = Omit<Snapshot, 'db'>

const KEEP = 3
const KEY = 'snapshots'
let store: ReturnType<typeof createStore> | undefined
const kv = () => (store ??= createStore('marina-os-snapshots', 'kv'))

const countRecords = (db: DB) => Object.values(db).reduce((s: number, v) => s + (Array.isArray(v) ? v.length : 0), 0)

async function all(): Promise<Snapshot[]> {
  try {
    return ((await get(KEY, kv())) as Snapshot[] | undefined) ?? []
  } catch {
    return []
  }
}

/** Takes a snapshot of what is in the app now. Never throws: an import is not blocked by a failed copy (it says so). */
export async function takeSnapshot(reason: string): Promise<SnapshotInfo | undefined> {
  try {
    const db = structuredClone(getDB())
    const snap: Snapshot = { id: uid(), at: nowISO(), reason, records: countRecords(db), db }
    const list = [snap, ...(await all())].slice(0, KEEP)
    await set(KEY, list, kv())
    const { db: _db, ...info } = snap
    return info
  } catch (err) {
    console.error('[marina-os] snapshot failed', err instanceof Error ? err.message : 'unknown')
    return undefined
  }
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return (await all()).map(({ db: _db, ...info }) => info)
}

/** Puts the app back exactly as it was at that snapshot (this device's onboarding mark is kept) and saves. */
export async function restoreSnapshot(id: string): Promise<boolean> {
  const snap = (await all()).find((s) => s.id === id)
  if (!snap) return false
  const onboardedAt = getDB().profile.onboardedAt
  actions.replaceDB({ ...snap.db, profile: { ...snap.db.profile, onboardedAt: snap.db.profile.onboardedAt ?? onboardedAt } })
  await flushNow()
  return true
}
