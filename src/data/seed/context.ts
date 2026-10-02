import type { CollectionKey, DateKey, DB, ItemOf, NewItem, UserProfile } from '../types'
import { uid } from '@/lib/id'

/** What every feature seed receives. */
export interface SeedContext {
  today: DateKey
  now: string
  /** Build a full entity from a payload (id optional). */
  make<K extends CollectionKey>(key: K, data: NewItem<K>): ItemOf<K>
}

/**
 * A feature seed returns only the collections it owns (+ optionally a profile patch).
 * Life-seed rule: every record gets a STABLE id ('seed:<area>:<slug>' or SEED_IDS), so the
 * migration in ./migrate.ts can add new seed records to an existing database without duplicates.
 */
export type FeatureSeed = (ctx: SeedContext) => Partial<Omit<DB, 'schemaVersion' | 'profile'>> & {
  profile?: Partial<UserProfile>
}

/** 'seed:<area>:<slug>' — stable id helper for seed records. */
export function seedId(area: string, slug: string): string {
  return `seed:${area}:${slug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`
}

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
