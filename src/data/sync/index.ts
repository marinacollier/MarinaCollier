/**
 * App wiring for cloud sync. INERT unless all of these hold:
 *   1. the build has VITE_SUPABASE_URL (or VITE_MARINA_API_URL) + VITE_SUPABASE_ANON_KEY,
 *   2. she is signed in (Conta do MARINA OS),
 *   3. she turned it on on this device (profile.cloudSync, set only after a verified "Enviar meus dados").
 * Otherwise no request is ever made and the status stays 'local-only' ("Salvo neste aparelho").
 */
import { createStore, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { actions, flushNow, getDB, onSaved, useStore } from '../store'
import { accessToken, authAvailable, authBaseUrl, useAuth } from '@/integrations/auth'
import { readBackendEnv } from '@/integrations/backend'
import { createSyncEngine, type MetaStore, type MigrationReport, type SyncEngine, type SyncMeta } from './engine'
import { createRecordsApi, SyncError } from './postgrest'
import { nowISO } from '@/lib/id'

export type CloudStatus = 'local-only' | 'syncing' | 'synced' | 'error'

export interface CloudSyncState {
  status: CloudStatus
  lastSyncedAt?: string
  pending: number
  error?: string
}

export const useCloudSync = create<CloudSyncState>(() => ({ status: 'local-only', pending: 0 }))

/** The honest one-liner for the UI. */
export function cloudLabel(s: CloudSyncState): string {
  if (s.status === 'local-only') return 'Salvo neste aparelho'
  if (s.status === 'syncing') return 'Salvo neste aparelho · sincronizando…'
  if (s.status === 'error') return `Salvo neste aparelho · nuvem: ${s.error ?? 'erro'}`
  if (s.pending > 0) return `Salvo neste aparelho · ${s.pending} alteração(ões) para enviar`
  const t = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  return t ? `Sincronizado às ${t}` : 'Sincronizado'
}

export const cloudConfigured = (): boolean => authAvailable()
export const cloudReady = (): boolean => cloudConfigured() && useAuth.getState().signedIn
export const cloudEnabled = (): boolean => cloudReady() && getDB().profile.cloudSync === true

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

async function getEngine(): Promise<SyncEngine | null> {
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

/** One sync round now (no-op when not enabled). */
export async function syncNow(): Promise<void> {
  if (!cloudEnabled()) {
    useCloudSync.setState({ status: 'local-only', error: undefined })
    return
  }
  const e = await getEngine()
  if (!e) return
  useCloudSync.setState({ status: 'syncing' })
  try {
    const r = await e.sync()
    if (r.status === 'not-migrated') {
      // e.g. a backup with cloudSync on restored onto a new device: needs its own verified upload first.
      actions.setProfile({ cloudSync: false })
      useCloudSync.setState({ status: 'local-only', pending: 0, error: undefined })
      return
    }
    retries = 0
    clearTimeout(retryTimer)
    const m = await e.meta()
    useCloudSync.setState({ status: 'synced', lastSyncedAt: m.lastSyncedAt, pending: e.pending(), error: undefined })
  } catch (err) {
    useCloudSync.setState({ status: 'error', pending: e.pending(), error: err instanceof SyncError ? err.message : 'erro inesperado' })
    if (!(err instanceof SyncError && err.code === 'auth')) scheduleRetry()
  }
}

/** Ajustes → Dados → "Enviar meus dados para a nuvem". Turns sync on only when the comparison is clean. */
export async function migrateToCloud(): Promise<MigrationReport> {
  const e = await getEngine()
  if (!e) throw new Error('Entre na sua conta primeiro')
  await flushNow()
  useCloudSync.setState({ status: 'syncing' })
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
  const e = await getEngine()
  if (!e || !(await e.meta()).migratedAt) return false
  actions.setProfile({ cloudSync: true })
  await syncNow()
  return true
}

/** True when this device already did its verified first upload for the signed-in account. */
export async function hasMigrated(): Promise<boolean> {
  const e = await getEngine()
  return !!e && !!(await e.meta()).migratedAt
}

let started = false
/** Call once at boot. Without configuration it returns immediately and listens to nothing. */
export function initCloudSync(): void {
  if (started || !cloudConfigured() || typeof window === 'undefined') return
  started = true
  onSaved(() => {
    if (!cloudEnabled()) return
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      void getEngine().then(async (e) => {
        if (!e) return
        useCloudSync.setState({ pending: await e.refreshOutbox() })
        await syncNow()
      })
    }, 2000)
  })
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  useAuth.subscribe((s, prev) => {
    if (s.signedIn && !prev.signedIn) void syncNow()
    if (!s.signedIn) {
      engine = null
      useCloudSync.setState({ status: 'local-only', error: undefined })
    }
  })
  useStore.subscribe((s, prev) => {
    if (s.hydrated && !prev.hydrated) void syncNow()
  })
  if (useStore.getState().hydrated) void syncNow()
}
