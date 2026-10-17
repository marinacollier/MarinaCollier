/**
 * Offline-first cloud sync. The local store stays the source for the UI; this only reconciles it with
 * the `records` table.
 *
 * - base:   what this device last agreed with the cloud, per record → {version, content hash}.
 * - outbox: local changes not yet in the cloud, found by DIFFING base vs the current DB after each save
 *           (no action is instrumented). Persisted, so changes made offline survive a restart.
 * - sync(): pull rows changed since the cursor → merge per record → push the outbox.
 *   Merge: only one side changed → take it. Both changed → the higher version (updatedAt ms) wins and
 *   the other version goes to profile.syncConflicts for her to review. Never silently dropped.
 * - Deletes travel as tombstones (deleted = true); nothing is hard-deleted in the cloud.
 *
 * Pure of app wiring (deps injected); the cloud is a SyncTransport (Supabase PostgREST or the Claude
 * Artifact db), each with an in-memory fake for tests.
 */
import { isSeedRecordId } from '../seed/ids'
import type { DB, SyncConflict, UserProfile } from '../types'
import { hashData } from './hash'
import type { RemoteRow, SyncTransport } from './transport'

export const PROFILE_COLLECTION = '_profile'
export const PROFILE_ID = 'me'
/** Profile fields that never leave this device (PIN hash / passkey id, sync state). */
const DEVICE_ONLY: (keyof UserProfile)[] = ['privacyLock', 'cloudSync', 'cloudSyncSince', 'syncConflicts']

export interface BaseEntry {
  v: number
  /** Content hash; '' = deleted. */
  h: string
}
export interface OutboxEntry {
  collection: string
  id: string
  version: number
  h: string
  deleted: boolean
}
export interface SyncMeta {
  /** Highest server seq applied. */
  cursor: number
  base: Record<string, BaseEntry>
  outbox: Record<string, OutboxEntry>
  lastSyncedAt?: string
  /** Set by a verified first upload on this device; sync refuses to run without it. */
  migratedAt?: string
  /** Set by adopt(): the next merge lets the cloud win every record this device never synced. */
  adopt?: boolean
  /**
   * Set by adopt() on a fresh install (the device had nothing stored): records that exist only here and
   * were not touched after this moment are the fresh seed / bundled imports, not her data — they are
   * dropped instead of pushed, so every wipe of the device does not add another copy to the cloud.
   */
  replaceBefore?: string
}
export interface MetaStore {
  load(): Promise<SyncMeta | null>
  save(m: SyncMeta): Promise<void>
}

export interface SyncDeps {
  api: SyncTransport
  meta: MetaStore
  getDB(): DB
  /** Put the merged DB in the app and make sure it reached the device before the cursor moves. */
  commitDB(db: DB): Promise<void>
  now?(): number
  newId?(): string
}

export interface SyncResult {
  status: 'ok' | 'not-migrated'
  pulled: number
  pushed: number
  conflicts: number
  /** Records the cloud could not take (too big); they stay only on this device. */
  skipped: string[]
}

export interface CollectionCompare {
  collection: string
  local: number
  cloud: number
}
export interface MigrationIssue {
  collection: string
  id: string
  /**
   * missing / different → the upload did not land as sent (blocks turning sync on).
   * cloud-newer / cloud-deleted → another device already had a newer version (expected; merges on sync).
   * too-big → over the cloud's document size limit: stays only on this device (does not block).
   */
  kind: 'missing' | 'different' | 'cloud-newer' | 'cloud-deleted' | 'too-big'
}
export interface MigrationReport {
  ok: boolean
  uploaded: number
  matched: number
  collections: CollectionCompare[]
  issues: MigrationIssue[]
  /** Records in the cloud that this device doesn't have (from another device); they arrive on the first sync. */
  onlyInCloud: number
}

interface LocalRec {
  collection: string
  id: string
  data: Record<string, unknown>
  h: string
}

export const recordKey = (collection: string, id: string) => `${collection}/${id}`

export function emptyMeta(): SyncMeta {
  return { cursor: 0, base: {}, outbox: {} }
}

/** DB keys holding entity arrays (everything but schemaVersion/profile). */
export function syncCollections(db: DB): string[] {
  return Object.keys(db).filter((k) => Array.isArray((db as unknown as Record<string, unknown>)[k]))
}

export function profileForCloud(p: UserProfile): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p }
  for (const k of DEVICE_ONLY) delete out[k]
  return out
}

function localRecords(db: DB): Map<string, LocalRec> {
  const map = new Map<string, LocalRec>()
  const raw = db as unknown as Record<string, unknown>
  for (const c of syncCollections(db)) {
    for (const it of raw[c] as Record<string, unknown>[]) {
      if (!it || typeof it.id !== 'string') continue
      map.set(recordKey(c, it.id), { collection: c, id: it.id, data: it, h: hashData(it) })
    }
  }
  const p = profileForCloud(db.profile)
  map.set(recordKey(PROFILE_COLLECTION, PROFILE_ID), { collection: PROFILE_COLLECTION, id: PROFILE_ID, data: p, h: hashData(p) })
  return map
}

export function createSyncEngine(deps: SyncDeps) {
  const now = deps.now ?? Date.now
  const newId = deps.newId ?? (() => Math.random().toString(36).slice(2) + now().toString(36))
  let meta: SyncMeta | null = null
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn)
    chain = p.catch(() => undefined)
    return p
  }
  const loadMeta = async () => (meta ??= (await deps.meta.load()) ?? emptyMeta())

  /**
   * Version of a local change. Untouched seed records and a profile never synced from this device are 0,
   * so a fresh install never overrides what another device already has.
   */
  function versionFor(l: LocalRec, base: BaseEntry | undefined): number {
    if (l.collection === PROFILE_COLLECTION) return base ? Math.max(now(), base.v + 1) : 0
    if (!base && isSeedRecordId(l.id) && l.data.updatedAt === l.data.createdAt) return 0
    let t = Date.parse(String(l.data.updatedAt))
    if (!Number.isFinite(t)) t = now()
    if (base && t <= base.v) t = Math.max(now(), base.v + 1)
    return t
  }

  /** Recompute the outbox from base vs the DB. Returns whether it changed. */
  function diff(m: SyncMeta, locals: Map<string, LocalRec>): boolean {
    let changed = false
    for (const [key, l] of locals) {
      const base = m.base[key]
      if (base && base.h === l.h) {
        if (m.outbox[key]) {
          delete m.outbox[key]
          changed = true
        }
        continue
      }
      const cur = m.outbox[key]
      if (cur && !cur.deleted && cur.h === l.h) continue
      m.outbox[key] = { collection: l.collection, id: l.id, h: l.h, deleted: false, version: versionFor(l, base) }
      changed = true
    }
    for (const [key, base] of Object.entries(m.base)) {
      if (locals.has(key)) continue
      const cur = m.outbox[key]
      if (base.h === '') {
        if (cur) {
          delete m.outbox[key]
          changed = true
        }
        continue
      }
      if (cur?.deleted) continue
      const [collection, ...rest] = key.split('/')
      m.outbox[key] = { collection, id: rest.join('/'), h: '', deleted: true, version: Math.max(now(), base.v + 1) }
      changed = true
    }
    for (const key of Object.keys(m.outbox)) {
      if (!locals.has(key) && !m.base[key]) {
        delete m.outbox[key]
        changed = true
      }
    }
    return changed
  }

  function merge(m: SyncMeta, db: DB, rows: RemoteRow[]): { next: DB; conflicts: number } {
    const known = new Set(syncCollections(db))
    const locals = localRecords(db)
    const changes = new Map<string, Map<string, Record<string, unknown> | null>>()
    let profile: Record<string, unknown> | undefined
    const conflicts: SyncConflict[] = []
    const apply = (r: RemoteRow) => {
      const data = r.deleted ? null : (r.data as Record<string, unknown>)
      if (r.collection === PROFILE_COLLECTION) {
        if (data) profile = data
        return
      }
      let c = changes.get(r.collection)
      if (!c) changes.set(r.collection, (c = new Map()))
      c.set(r.id, data)
    }
    for (const r of rows) {
      if (r.collection !== PROFILE_COLLECTION && !known.has(r.collection)) continue // newer app version's data: stays in the cloud
      const key = recordKey(r.collection, r.id)
      const rh = r.deleted ? '' : hashData(r.data)
      const base = m.base[key]
      if (base && base.v === r.version && base.h === rh) continue
      const out = m.outbox[key]
      m.base[key] = { v: r.version, h: rh }
      if (!out) {
        apply(r)
        continue
      }
      if (out.h === rh) {
        delete m.outbox[key]
        continue
      }
      // Adopting an existing cloud: the cloud wins anything this device never synced (a fresh install
      // never overwrites her data); a real local edit that loses is kept as a conflict.
      const adopting = !!m.adopt && !base
      const localWins = !adopting && out.version > r.version
      if (adopting ? out.version > 0 : Math.min(out.version, r.version) > 0) {
        const local = locals.get(key)
        conflicts.push({
          id: newId(),
          collection: r.collection,
          recordId: r.id,
          at: new Date(now()).toISOString(),
          kept: localWins ? 'local' : 'remote',
          other: localWins ? ((r.data as Record<string, unknown>) ?? null) : out.deleted ? null : (local?.data ?? null),
          otherVersion: localWins ? r.version : out.version,
        })
      }
      if (!localWins) {
        delete m.outbox[key]
        apply(r)
      }
    }
    if (!changes.size && !profile && !conflicts.length) return { next: db, conflicts: 0 }
    const next = { ...db } as unknown as Record<string, unknown>
    for (const [c, map] of changes) {
      const list = next[c] as Record<string, unknown>[]
      const seen = new Set<string>()
      const out: Record<string, unknown>[] = []
      for (const it of list) {
        const id = it?.id as string
        if (!map.has(id)) {
          out.push(it)
          continue
        }
        seen.add(id)
        const v = map.get(id)
        if (v) out.push(v)
      }
      for (const [id, v] of map) if (v && !seen.has(id)) out.push(v)
      next[c] = out
    }
    const localOnly: Partial<UserProfile> = {}
    for (const k of DEVICE_ONLY) if (db.profile[k] !== undefined) (localOnly as Record<string, unknown>)[k] = db.profile[k]
    const p = { ...(profile ? (profile as unknown as UserProfile) : db.profile), ...localOnly }
    if (conflicts.length) p.syncConflicts = [...(db.profile.syncConflicts ?? []), ...conflicts]
    next.profile = p
    return { next: next as unknown as DB, conflicts: conflicts.length }
  }

  /** Fresh install adopting the cloud: drop the local-only records nobody touched since the seed. */
  function dropFreshSeed(m: SyncMeta, db: DB, rows: RemoteRow[], before: string): DB {
    const inCloud = new Set(rows.map((r) => recordKey(r.collection, r.id)))
    const raw = db as unknown as Record<string, unknown>
    let next: Record<string, unknown> | null = null
    for (const c of syncCollections(db)) {
      const list = raw[c] as Record<string, unknown>[]
      const kept = list.filter((it) => {
        if (!it || typeof it.id !== 'string') return true
        const key = recordKey(c, it.id)
        if (inCloud.has(key)) return true
        const touched = String(it.updatedAt ?? it.createdAt ?? '')
        if (touched && touched > before) return true // she changed it after the seed: hers, keep
        delete m.outbox[key]
        return false
      })
      if (kept.length !== list.length) (next ??= { ...raw })[c] = kept
    }
    return next ? (next as unknown as DB) : db
  }

  async function pushOutbox(m: SyncMeta): Promise<{ pushed: number; skipped: string[] }> {
    const locals = localRecords(deps.getDB())
    diff(m, locals)
    const entries = Object.values(m.outbox)
    const BATCH = 200
    let pushed = 0
    const skipped: string[] = []
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH)
      const res = await deps.api.push(
        chunk.map((e) => ({ collection: e.collection, id: e.id, version: e.version, deleted: e.deleted, data: e.deleted ? null : locals.get(recordKey(e.collection, e.id))?.data })),
      )
      const skip = new Set((res?.skipped ?? []).map((x) => recordKey(x.collection, x.id)))
      skipped.push(...skip)
      for (const e of chunk) {
        const key = recordKey(e.collection, e.id)
        if (skip.has(key)) continue // stays in the outbox: goes out if it shrinks
        m.base[key] = { v: e.version, h: e.h }
        if (m.outbox[key] === e) delete m.outbox[key]
      }
      pushed += chunk.length - skip.size
      await deps.meta.save(m)
    }
    return { pushed, skipped }
  }

  return {
    /** After each local save: note what changed (persisted). Returns the number of pending changes. */
    refreshOutbox(): Promise<number> {
      return serial(async () => {
        const m = await loadMeta()
        if (m.migratedAt && diff(m, localRecords(deps.getDB()))) await deps.meta.save(m)
        return Object.keys(m.outbox).length
      })
    },

    pending(): number {
      return meta ? Object.keys(meta.outbox).length : 0
    },

    async meta(): Promise<SyncMeta> {
      return loadMeta()
    },

    /** Pull → merge → push. Throws SyncError on network/auth problems; the outbox stays for the retry. */
    sync(): Promise<SyncResult> {
      return serial(async () => {
        const m = await loadMeta()
        if (!m.migratedAt) return { status: 'not-migrated', pulled: 0, pushed: 0, conflicts: 0, skipped: [] }
        // The transport re-reads a small overlap before the cursor (re-reading an applied row is a no-op).
        const rows = await deps.api.pull(m.cursor)
        // Read the DB and merge with no await in between, so an edit made meanwhile is never overwritten.
        const db = deps.getDB()
        diff(m, localRecords(db))
        const merged = merge(m, db, rows)
        const conflicts = merged.conflicts
        let next = merged.next
        if (m.adopt && m.replaceBefore) next = dropFreshSeed(m, next, rows, m.replaceBefore)
        if (next !== db) await deps.commitDB(next)
        for (const r of rows) if (r.seq !== undefined && r.seq > m.cursor) m.cursor = r.seq
        delete m.adopt
        delete m.replaceBefore
        await deps.meta.save(m)
        const { pushed, skipped } = await pushOutbox(m)
        m.lastSyncedAt = new Date(now()).toISOString()
        await deps.meta.save(m)
        return { status: 'ok', pulled: rows.length, pushed, conflicts, skipped }
      })
    },

    /**
     * First time on this device when the cloud already has her data: start tracking with nothing agreed
     * yet, so the next sync pulls everything and lets the cloud win every record (local-only records are
     * then pushed; differing local edits are kept as conflicts). The caller snapshots the DB first.
     */
    adopt(opts: { replaceBefore?: string } = {}): Promise<void> {
      return serial(async () => {
        meta = { cursor: 0, base: {}, outbox: {}, migratedAt: new Date(now()).toISOString(), adopt: true }
        if (opts.replaceBefore) meta.replaceBefore = opts.replaceBefore
        await deps.meta.save(meta)
      })
    },

    /**
     * First time on this device: upload every record, download everything back and compare (counts per
     * collection + content hash per record). Local data is never changed or deleted here. Only when the
     * comparison is clean does it start tracking (the caller then turns profile.cloudSync on).
     */
    uploadAll(): Promise<MigrationReport> {
      return serial(async () => {
        const locals = localRecords(deps.getDB())
        const sent = new Map<string, number>()
        const rows: RemoteRow[] = []
        for (const [key, l] of locals) {
          const v = versionFor(l, undefined)
          sent.set(key, v)
          rows.push({ collection: l.collection, id: l.id, data: l.data, version: v, deleted: false })
        }
        const res = await deps.api.push(rows)
        const tooBig = new Set((res?.skipped ?? []).map((x) => recordKey(x.collection, x.id)))
        const remote = new Map<string, RemoteRow>()
        for (const r of await deps.api.pull(0)) remote.set(recordKey(r.collection, r.id), r)

        const counts = new Map<string, CollectionCompare>()
        const count = (c: string) => counts.get(c) ?? (counts.set(c, { collection: c, local: 0, cloud: 0 }), counts.get(c)!)
        for (const l of locals.values()) count(l.collection).local++
        for (const r of remote.values()) if (!r.deleted) count(r.collection).cloud++

        const issues: MigrationIssue[] = []
        const base: Record<string, BaseEntry> = {}
        let matched = 0
        for (const [key, l] of locals) {
          const r = remote.get(key)
          const v = sent.get(key)!
          // v 0 = an untouched seed / never-synced profile: whatever the cloud has is legitimately preferred.
          const cloudWins = !!r && (r.version > v || v === 0)
          if (tooBig.has(key) && (!r || r.version < v)) issues.push({ collection: l.collection, id: l.id, kind: 'too-big' })
          else if (!r) issues.push({ collection: l.collection, id: l.id, kind: 'missing' })
          else if (r.deleted) issues.push({ collection: l.collection, id: l.id, kind: cloudWins ? 'cloud-deleted' : 'missing' })
          else if (hashData(r.data) === l.h) {
            matched++
            base[key] = { v: r.version, h: l.h }
          } else issues.push({ collection: l.collection, id: l.id, kind: cloudWins ? 'cloud-newer' : 'different' })
        }
        let onlyInCloud = 0
        for (const [key, r] of remote) if (!locals.has(key) && !r.deleted) onlyInCloud++
        const ok = !issues.some((i) => i.kind === 'missing' || i.kind === 'different')
        if (ok) {
          // Cursor 0: the first sync re-reads everything once and brings in what only the cloud had.
          meta = { cursor: 0, base, outbox: {}, migratedAt: new Date(now()).toISOString() }
          diff(meta, localRecords(deps.getDB()))
          await deps.meta.save(meta)
        }
        return { ok, uploaded: rows.length - tooBig.size, matched, collections: [...counts.values()].sort((a, b) => a.collection.localeCompare(b.collection)), issues, onlyInCloud }
      })
    },
  }
}

export type SyncEngine = ReturnType<typeof createSyncEngine>
