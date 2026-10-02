/**
 * The app store. One zustand store holds the whole DB; all writes go through `actions`.
 *
 * Rules for feature code
 * - Read: `const db = useDB()` then derive with useMemo, or `useDB(s => s.tasks)` for a single
 *   collection. NEVER return a freshly built array/object from the selector (zustand v5 would loop).
 * - Write: `actions.create('tasks', {...})`, `actions.update('tasks', id, patch)`, `actions.remove(...)`.
 * - Persistence is automatic (debounced to IndexedDB). Feature code never touches storage directly.
 */
import { create } from 'zustand'
import { emptyDB, migrate } from './defaults'
import { buildSeed } from './seed'
import { applyLifeSeed } from './seed/migrate'
import { createIndexedDBAdapter, type StorageAdapter } from './storage'
import type {
  CollectionKey,
  DateKey,
  DB,
  ID,
  ItemOf,
  NewItem,
  Occurrence,
  OccurrenceParent,
  UserProfile,
} from './types'
import { nowISO, uid } from '@/lib/id'
import { todayKey } from '@/lib/date'

interface StoreState {
  db: DB
  hydrated: boolean
}

export const useStore = create<StoreState>(() => ({ db: emptyDB(), hydrated: false }))

/** Whole DB (stable reference until something changes). */
export function useDB(): DB
/** A slice of the DB. The selector must return something already in the DB (no new arrays). */
export function useDB<T>(selector: (db: DB) => T): T
export function useDB<T>(selector?: (db: DB) => T) {
  return useStore((s) => (selector ? selector(s.db) : s.db))
}

export function getDB(): DB {
  return useStore.getState().db
}

function commit(mutator: (db: DB) => DB) {
  useStore.setState((s) => ({ db: mutator(s.db) }))
}

function stamp<T extends object>(data: T, id?: string) {
  const now = nowISO()
  return { ...data, id: id ?? uid(), createdAt: now, updatedAt: now }
}

export const actions = {
  create<K extends CollectionKey>(key: K, data: NewItem<K>): ItemOf<K> {
    const item = stamp(data, data.id) as unknown as ItemOf<K>
    commit((db) => ({ ...db, [key]: [...(db[key] as ItemOf<K>[]), item] }))
    return item
  },

  createMany<K extends CollectionKey>(key: K, data: NewItem<K>[]): ItemOf<K>[] {
    const items = data.map((d) => stamp(d, d.id) as unknown as ItemOf<K>)
    commit((db) => ({ ...db, [key]: [...(db[key] as ItemOf<K>[]), ...items] }))
    return items
  },

  update<K extends CollectionKey>(key: K, id: ID, patch: Partial<ItemOf<K>>): void {
    commit((db) => ({
      ...db,
      [key]: (db[key] as ItemOf<K>[]).map((it) =>
        it.id === id ? { ...it, ...patch, id, updatedAt: nowISO() } : it,
      ),
    }))
  },

  /** Removes and returns the item (keep it to offer "desfazer"). */
  remove<K extends CollectionKey>(key: K, id: ID): ItemOf<K> | undefined {
    const found = (getDB()[key] as ItemOf<K>[]).find((it) => it.id === id)
    if (!found) return undefined
    commit((db) => ({ ...db, [key]: (db[key] as ItemOf<K>[]).filter((it) => it.id !== id) }))
    return found
  },

  /** Put back a removed item (undo). */
  restore<K extends CollectionKey>(key: K, item: ItemOf<K>): void {
    commit((db) => {
      const list = db[key] as ItemOf<K>[]
      if (list.some((it) => it.id === item.id)) return db
      return { ...db, [key]: [...list, item] }
    })
  },

  /** Persist a new order: items whose ids are listed get order = index. */
  reorder<K extends CollectionKey>(key: K, orderedIds: ID[]): void {
    const pos = new Map(orderedIds.map((id, i) => [id, i]))
    commit((db) => ({
      ...db,
      [key]: (db[key] as ItemOf<K>[]).map((it) =>
        pos.has(it.id) ? { ...it, order: pos.get(it.id), updatedAt: nowISO() } : it,
      ),
    }))
  },

  /** Insert or update by id (used by sync/imports). */
  upsertMany<K extends CollectionKey>(key: K, items: ItemOf<K>[]): void {
    commit((db) => {
      const map = new Map((db[key] as ItemOf<K>[]).map((it) => [it.id, it]))
      for (const it of items) map.set(it.id, { ...map.get(it.id), ...it })
      return { ...db, [key]: [...map.values()] }
    })
  },

  setProfile(patch: Partial<UserProfile>): void {
    commit((db) => ({ ...db, profile: { ...db.profile, ...patch } }))
  },

  /**
   * Toggle the done-state of a recurring thing on a given day.
   * Creates/removes an Occurrence; the rule itself is never touched.
   */
  toggleOccurrence(parentType: OccurrenceParent, parentId: ID, date: DateKey = todayKey()): boolean {
    const existing = getDB().occurrences.find(
      (o) => o.parentType === parentType && o.parentId === parentId && o.date === date,
    )
    if (existing) {
      commit((db) => ({ ...db, occurrences: db.occurrences.filter((o) => o.id !== existing.id) }))
      return false
    }
    const occ: Occurrence = stamp({ parentType, parentId, date, status: 'done' as const })
    commit((db) => ({ ...db, occurrences: [...db.occurrences, occ] }))
    return true
  },

  replaceDB(next: unknown): void {
    useStore.setState({ db: migrate(next) })
  },

  resetToSeed(): void {
    useStore.setState({ db: buildSeed(todayKey()) })
  },
}

// ─── Persistence wiring ─────────────────────────────────────────────────────

let adapter: StorageAdapter | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined
let unsubscribe: (() => void) | undefined

function flush() {
  if (!adapter) return
  clearTimeout(saveTimer)
  saveTimer = undefined
  void adapter.save(getDB()).catch((err) => console.error('[marina-os] save failed', err))
}

/**
 * Load from storage (or seed on first run) and start auto-saving.
 * Call once at boot; tests pass a memory adapter.
 */
export async function hydrate(storage: StorageAdapter = createIndexedDBAdapter()): Promise<void> {
  adapter = storage
  unsubscribe?.()
  let raw: unknown = null
  try {
    raw = await storage.load()
  } catch (err) {
    console.error('[marina-os] load failed, starting from seed', err)
  }
  const migrated = raw ? migrate(raw) : null
  const db = migrated ? applyLifeSeed(migrated, todayKey()) : buildSeed(todayKey())
  useStore.setState({ db, hydrated: true })
  if (!raw || db !== migrated) await storage.save(db)

  unsubscribe = useStore.subscribe((s, prev) => {
    if (s.db === prev.db) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, 250)
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }
}

/** Force pending writes (tests, before export). */
export async function flushNow(): Promise<void> {
  if (!adapter) return
  clearTimeout(saveTimer)
  saveTimer = undefined
  await adapter.save(getDB())
}

/** Next `order` value for a collection (append at the end). */
export function nextOrder(items: { order: number }[]): number {
  return items.reduce((m, it) => Math.max(m, it.order), -1) + 1
}
