/**
 * Persistence adapter. The app is local-first: the whole DB lives in IndexedDB on the device.
 * A future SupabaseAdapter (or a sync engine on top of this one) only needs to implement this interface.
 */
import { createStore, del, get, set } from 'idb-keyval'
import type { DB } from './types'

export interface StorageAdapter {
  load(): Promise<unknown | null>
  save(db: DB): Promise<void>
  clear(): Promise<void>
}

const DB_KEY = 'db'

export function createIndexedDBAdapter(dbName = 'marina-os', storeName = 'kv'): StorageAdapter {
  const store = createStore(dbName, storeName)
  return {
    async load() {
      return (await get(DB_KEY, store)) ?? null
    },
    async save(db) {
      await set(DB_KEY, db, store)
    },
    async clear() {
      await del(DB_KEY, store)
    },
  }
}

/** In-memory adapter for tests. */
export function createMemoryAdapter(initial: unknown = null): StorageAdapter & { data: unknown } {
  const a = {
    data: initial,
    async load() {
      return a.data
    },
    async save(db: DB) {
      a.data = structuredClone(db)
    },
    async clear() {
      a.data = null
    },
  }
  return a
}
