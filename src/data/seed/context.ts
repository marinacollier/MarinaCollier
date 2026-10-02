import type { CollectionKey, DateKey, DB, ItemOf, NewItem } from '../types'
import { uid } from '@/lib/id'

/** What every feature seed receives. */
export interface SeedContext {
  today: DateKey
  now: string
  /** Build a full entity from a payload (id optional). */
  make<K extends CollectionKey>(key: K, data: NewItem<K>): ItemOf<K>
}

/** A feature seed returns only the collections it owns. */
export type FeatureSeed = (ctx: SeedContext) => Partial<Omit<DB, 'schemaVersion' | 'profile'>>

export function createSeedContext(today: DateKey): SeedContext {
  const now = new Date().toISOString()
  return {
    today,
    now,
    make(_key, data) {
      return { ...data, id: data.id ?? uid(), createdAt: now, updatedAt: now } as never
    },
  }
}
