/**
 * Life-seed migration. Runs at boot when the stored database has an older `profile.seedVersion`.
 *
 * It is additive and idempotent:
 * - seed records whose id is not in the database are added (stable ids make this safe);
 * - existing records are never overwritten — anything Marina edited stays hers;
 * - profile fields introduced by the seed (rhythm, work, about, homeBase, widget order) are applied
 *   only when the stored profile still has the generic defaults for them.
 */
import type { CollectionKey, DateKey, DB } from '../types'
import { defaultProfile } from '../defaults'
import { buildSeed, LIFE_SEED_VERSION } from '.'

export function needsLifeSeed(db: DB): boolean {
  return (db.profile.seedVersion ?? 1) < LIFE_SEED_VERSION
}

export function applyLifeSeed(db: DB, today: DateKey): DB {
  if (!needsLifeSeed(db)) return db
  const seed = buildSeed(today)
  const out: DB = { ...db }
  for (const key of Object.keys(seed) as (keyof DB)[]) {
    const list = seed[key]
    if (!Array.isArray(list)) continue
    const k = key as CollectionKey
    const existing = new Set((out[k] as { id: string }[]).map((x) => x.id))
    const additions = (list as { id: string }[]).filter((x) => !existing.has(x.id))
    if (additions.length) (out[k] as unknown[]) = [...(out[k] as unknown[]), ...additions]
  }
  const generic = defaultProfile()
  const p = { ...out.profile }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (same(p.rhythm, generic.rhythm)) p.rhythm = seed.profile.rhythm
  if (same(p.work, generic.work)) p.work = seed.profile.work
  if (same(p.homeWidgets, generic.homeWidgets)) p.homeWidgets = seed.profile.homeWidgets
  p.about ??= seed.profile.about
  p.homeBase ??= seed.profile.homeBase
  p.seedVersion = LIFE_SEED_VERSION
  out.profile = p
  return out
}
