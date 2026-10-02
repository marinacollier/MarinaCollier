/** Test helpers: build a small DB with entities stamped with sensible defaults. */
import { createSeedContext } from '@/data/seed/context'
import { defaultCategories, emptyDB } from '@/data/defaults'
import type { CollectionKey, DB, NewItem } from '@/data/types'

export function makeDB(): { db: DB; add: <K extends CollectionKey>(key: K, data: NewItem<K>) => void } {
  const ctx = createSeedContext('2026-10-02')
  const db = emptyDB()
  db.financialCategories = defaultCategories(ctx.now)
  return {
    db,
    add(key, data) {
      ;(db[key] as unknown[]).push(ctx.make(key, data))
    },
  }
}

/** ISO timestamp for a time in São Paulo on a given day. */
export const at = (key: string, time = '12:00') => new Date(`${key}T${time}:00-03:00`).toISOString()
