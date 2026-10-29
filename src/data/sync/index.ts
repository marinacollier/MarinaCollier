/**
 * App wiring for cloud sync. Two transports for the same engine:
 *  - Claude Artifact db: when the page runs inside a claude.ai Artifact whose `claude.use("db")` resolves,
 *    sync turns on by itself (no sign-in, no button) — see docs/CLAUDE_DB.md. Preferred when present.
 *  - Supabase: INERT unless all of these hold:
 *   1. the build has VITE_SUPABASE_URL (or VITE_MARINA_API_URL) + VITE_SUPABASE_ANON_KEY,
 *   2. she is signed in (Conta do MARINA OS),
 *   3. she turned it on on this device (profile.cloudSync, set only after a verified "Enviar meus dados").
 * Otherwise no request is ever made and the status stays 'local-only' ("Salvo só neste aparelho").
 */
import { createStore, del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { actions, applyModuleSeeds, flushNow, freshInstallAt, getDB, hasStorage, onSaved, useStore } from '../store'
import { bootFinished } from '../briefing/bundled'
import { takeSnapshot } from '../snapshots'
import { accessToken, authAvailable, authBaseUrl, useAuth } from '@/integrations/auth'
import { getArtifactDb, type ArtifactDB } from '@/integrations/artifact-db'
import { readBackendEnv } from '@/integrations/backend'
import { claudeFirstRun, createArtifactTransport, type ArtifactTransport } from './artifact-db'
import { createSyncEngine, type MetaStore, type MigrationReport, type SyncEngine, type SyncMeta } from './engine'
import { createRecordsApi, SyncError } from './postgrest'
import { nowISO } from '@/lib/id'

export type CloudStatus = 'local-only' | 'syncing' | 'synced' | 'error'
/** claude = the Artifact's own document store (preferred when present); supabase = her own server. */
export type CloudTarget = 'claude' | 'supabase'

export interface CloudSyncState {
  status: CloudStatus
  target?: CloudTarget
  lastSyncedAt?: string
  pending: number
  error?: string
  /** Not an error: e.g. a record too big for the cloud stayed only on this device. */
  warning?: string
}

export const useCloudSync = create<CloudSyncState>(() => ({
  status: 'local-only',
  pending: 0,
}))

function ago(iso: string, nowMs: number): string {
  const min = Math.floor((nowMs - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(min) || min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  return `em ${new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
}

/** The honest one-liner for the UI. */
export function cloudLabel(s: CloudSyncState, nowMs = Date.now()): string {
  if (s.status === 'local-only') return 'Salvo só neste aparelho'
  if (s.target === 'claude') {
    if (s.status === 'syncing') return 'Sincronizando com o Claude…'
    if (s.status === 'error') return `Salvo só neste aparelho · Claude: ${s.error ?? 'erro'}`
    const line = `Sincronizado com o Claude · ${s.lastSyncedAt ? ago(s.lastSyncedAt, nowMs) : 'agora'}`
    return s.pending > 0 ? `${line} · ${s.pending} alteração(ões) para enviar` : line
  }
  if (s.status === 'syncing') return 'Salvo neste aparelho · sincronizando…'
  if (s.status === 'error') return `Salvo neste aparelho · nuvem: ${s.error ?? 'erro'}`
  if (s.pending > 0) return `Salvo neste aparelho · ${s.pending} alteração(ões) para enviar`
  const t = s.lastSyncedAt
    ? new Date(s.lastSyncedAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  return t ? `Sincronizado às ${t}` : 'Sincronizado'
}

// ——— Claude Artifact store state ———

let artifact: { transport: ArtifactTransport; engine: SyncEngine } | null = null
let artifactDead = false

export const cloudConfigured = (): boolean => authAvailable()
export const cloudReady = (): boolean => cloudConfigured() && useAuth.getState().signedIn
/** The Claude Artifact store is in use on this view (auto-enabled; no sign-in). */
export const artifactActive = (): boolean => !!artifact && !artifactDead
export const cloudEnabled = (): boolean => artifactActive() || (cloudReady() && getDB().profile.cloudSync === true)

function jwtSub(token: string): string | undefined {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return (JSON.parse(atob(part)) as { sub?: string }).sub
  } catch {
    return undefined
  }
}

/** Sync bookkeeping lives in its own IndexedDB store, per account — never in the DB or in backups. */
function idbMetaStore(userId: string): MetaStore {
  const kv = createStore('marina-os-sync', 'kv')
  const key = `meta:${userId}`
  return {
    load: async () => ((await get(key, kv)) as SyncMeta | undefined) ?? null,
    save: (m) => set(key, m, kv),
  }
}

let engine: SyncEngine | null = null
let engineUser: string | undefined

async function supabaseEngine(): Promise<SyncEngine | null> {
  if (!cloudReady()) return null
  const token = await accessToken()
  const sub = token ? jwtSub(token) : undefined
  const baseUrl = authBaseUrl()
  const anonKey = readBackendEnv().anonKey
  if (!sub || !baseUrl || !anonKey) return null
  if (engine && engineUser === sub) return engine
  engineUser = sub
  engine = createSyncEngine({
    api: createRecordsApi({ baseUrl, anonKey, token: accessToken }),
    meta: idbMetaStore(sub),
    getDB,
    commitDB: async (db) => {
      useStore.setState({ db })
      await flushNow()
    },
  })
  return engine
}

const RETRY_MS = [15_000, 60_000, 5 * 60_000, 15 * 60_000]
let retryTimer: ReturnType<typeof setTimeout> | undefined
let retries = 0
let debounce: ReturnType<typeof setTimeout> | undefined

function scheduleRetry() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => void syncNow(), RETRY_MS[Math.min(retries++, RETRY_MS.length - 1)])
}

let inflight: Promise<void> | null = null
let again = false

/** One sync round now (no-op when not enabled). Calls made meanwhile coalesce into one more round. */
export function syncNow(): Promise<void> {
  if (inflight) {
    again = true
    return inflight
  }
  inflight = (async () => {
    do {
      again = false
      await syncOnce()
    } while (again)
  })().finally(() => (inflight = null))
  return inflight
}

async function syncOnce(): Promise<void> {
  if (!cloudEnabled()) {
    useCloudSync.setState({ status: 'local-only', error: undefined })
    return
  }
  const claude = artifactActive()
  if (claude && !useStore.getState().hydrated) return // the hydrated listener syncs right after
  const e = claude ? artifact!.engine : await supabaseEngine()
  if (!e) return
  useCloudSync.setState({
    status: 'syncing',
    target: claude ? 'claude' : 'supabase',
  })
  try {
    let tooBig = 0
    if (claude && !(await e.meta()).migratedAt) tooBig = await firstRunClaude(e)
    const r = await e.sync()
    if (r.status === 'not-migrated') {
      // e.g. a backup with cloudSync on restored onto a new device: needs its own verified upload first.
      actions.setProfile({ cloudSync: false })
      useCloudSync.setState({
        status: 'local-only',
        pending: 0,
        error: undefined,
      })
      return
    }
    retries = 0
    clearTimeout(retryTimer)
    const skipped = Math.max(tooBig, r.skipped.length)
    const m = await e.meta()
    useCloudSync.setState({
      status: 'synced',
      lastSyncedAt: m.lastSyncedAt,
      pending: Math.max(0, e.pending() - r.skipped.length),
      error: undefined,
      warning: skipped ? `${skipped} registro(s) grande(s) demais para a nuvem ficaram só neste aparelho` : undefined,
    })
  } catch (err) {
    useCloudSync.setState({
      status: 'error',
      pending: e.pending(),
      error: err instanceof SyncError ? err.message : 'erro inesperado',
    })
    if (err instanceof SyncError && err.code === 'auth') {
      if (claude) artifactDead = true // revoked / not granted: terminal for this page load
    } else scheduleRetry()
  }
}

async function firstRunClaude(e: SyncEngine): Promise<number> {
  // A wiped device must finish seeding before the merge decides what is seed and what is hers.
  if (freshInstallAt()) await Promise.race([bootFinished, new Promise((r) => setTimeout(r, 3000))])
  return claudeFirstRun(e, artifact!.transport, async () => {
    try {
      await flushNow()
    } catch {
      /* the device store is failing: the cloud copy is what protects her now */
    }
    await takeSnapshot('Antes da primeira sincronização com o Claude')
  }, freshInstallAt())
}

/** Ajustes → Dados → "Enviar meus dados para a nuvem". Turns sync on only when the comparison is clean. */
export async function migrateToCloud(): Promise<MigrationReport> {
  const e = await supabaseEngine()
  if (!e) throw new Error('Entre na sua conta primeiro')
  await flushNow()
  useCloudSync.setState({ status: 'syncing', target: 'supabase' })
  try {
    const report = await e.uploadAll()
    if (report.ok) {
      actions.setProfile({ cloudSync: true, cloudSyncSince: nowISO() })
      await flushNow()
      await syncNow()
    } else useCloudSync.setState({ status: 'local-only' })
    return report
  } catch (err) {
    useCloudSync.setState({ status: 'local-only' })
    throw err
  }
}

/** Pause on this device (nothing is deleted anywhere). */
export function pauseCloudSync(): void {
  actions.setProfile({ cloudSync: false })
  useCloudSync.setState({ status: 'local-only', error: undefined })
}

/** Resume after a pause — only if this device already did its verified upload. */
export async function resumeCloudSync(): Promise<boolean> {
  const e = await supabaseEngine()
  if (!e || !(await e.meta()).migratedAt) return false
  actions.setProfile({ cloudSync: true })
  await syncNow()
  return true
}

/** True when this device already did its verified first upload for the signed-in account. */
export async function hasMigrated(): Promise<boolean> {
  const e = await supabaseEngine()
  return !!e && !!(await e.meta()).migratedAt
}

// ——— Claude Artifact store wiring ———

let applyingRemote = false

function deviceId(): string {
  const make = () => `d${Math.random().toString(36).slice(2, 10)}`
  try {
    const k = 'marina-os-device-id'
    const cur = localStorage.getItem(k)
    if (cur) return cur
    const id = make()
    localStorage.setItem(k, id)
    return id
  } catch {
    return make()
  }
}

/**
 * Sync bookkeeping for the Claude store. It may only persist while the app's own save to the device
 * works: bookkeeping saying "synced" next to a DB that never reached the device would turn into
 * deletions on the next start. So on any device-save failure it drops the persisted copy (the next start
 * re-adopts the cloud, which is safe) and lives in memory.
 */
function artifactMetaStore() {
  const kv = createStore('marina-os-sync', 'kv')
  const key = 'meta:claude-artifact'
  let memory: SyncMeta | null = null
  let degraded = !hasStorage()
  return {
    async load(): Promise<SyncMeta | null> {
      if (degraded) return memory
      try {
        return ((await get(key, kv)) as SyncMeta | undefined) ?? null
      } catch {
        degraded = true
        return memory
      }
    },
    async save(m: SyncMeta): Promise<void> {
      memory = m
      if (degraded) return
      try {
        await set(key, m, kv)
      } catch {
        degraded = true
      }
    },
    degrade() {
      degraded = true
      void del(key, kv).catch(() => undefined)
    },
  }
}

let liveDebounce: ReturnType<typeof setTimeout> | undefined
let unwatch: (() => void) | undefined

function watchLive() {
  unwatch?.()
  unwatch = artifact!.transport.watch(
    () => {
      clearTimeout(liveDebounce)
      liveDebounce = setTimeout(() => void syncNow(), 400)
    },
    (err) => {
      if (['revoked', 'not_granted', 'capability_disabled', 'capability_removed'].includes(err.code)) {
        artifactDead = true
        useCloudSync.setState({ status: 'local-only', error: undefined })
      } else setTimeout(() => artifactActive() && watchLive(), 60_000) // re-subscribe later
    },
  )
}

function startArtifact(db: ArtifactDB) {
  const meta = artifactMetaStore()
  const transport = createArtifactTransport({ db, deviceId: deviceId() })
  const e = createSyncEngine({
    api: transport,
    meta,
    getDB,
    // Her texts must survive the Claude app wiping the device; the store is readable only by her.
    includePrivate: () => getDB().profile.privateWritingCloud !== false,
    // The adopted cloud may predate a module (Expedição, Universo, Ateliê): its seeds come back right away.
    reseed: applyModuleSeeds,
    commitDB: async (next) => {
      applyingRemote = true
      useStore.setState({ db: next })
      applyingRemote = false
      try {
        await flushNow()
      } catch {
        meta.degrade()
      }
    },
  })
  artifact = { transport, engine: e }
  useCloudSync.setState({ target: 'claude' })
  listen()
  // Push after every change (debounced), not only after a device save: here the device store is the
  // unreliable part and the cloud copy is the safety net.
  useStore.subscribe((s, prev) => {
    if (s.db === prev.db || applyingRemote || !artifactActive()) return
    clearTimeout(debounce)
    debounce = setTimeout(() => void syncNow(), 2000)
  })
  watchLive()
  void syncNow()
}

// ——— boot ———

let listening = false
function listen() {
  if (listening) return
  listening = true
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  useStore.subscribe((s, prev) => {
    if (s.hydrated && !prev.hydrated) void syncNow()
  })
}

let started = false
/**
 * Call once at boot. Inside a claude.ai Artifact that grants its db, sync turns on by itself. Otherwise,
 * without Supabase configuration, it listens to nothing and makes no request.
 */
export function initCloudSync(): void {
  if (started || typeof window === 'undefined') return
  started = true
  void getArtifactDb().then((db) => db && startArtifact(db))
  if (!cloudConfigured()) return
  listen()
  onSaved(() => {
    if (artifactActive() || !cloudEnabled()) return
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      void supabaseEngine().then(async (e) => {
        if (!e) return
        useCloudSync.setState({ pending: await e.refreshOutbox() })
        await syncNow()
      })
    }, 2000)
  })
  useAuth.subscribe((s, prev) => {
    if (s.signedIn && !prev.signedIn) void syncNow()
    if (!s.signedIn) {
      engine = null
      if (!artifactActive()) useCloudSync.setState({ status: 'local-only', error: undefined })
    }
  })
  if (useStore.getState().hydrated) void syncNow()
}
