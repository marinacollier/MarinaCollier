/**
 * Life-seed migration. Runs at boot when the stored database has an older `profile.seedVersion`.
 *
 * It is additive and idempotent:
 * - seed records whose id is not in the database are added (stable ids make this safe);
 * - records Marina created or edited are never overwritten or removed;
 * - records from the previous example seed that were never touched (same creation stamp as the
 *   original seed and createdAt === updatedAt) are upgraded to the new seed version, or retired
 *   when the new seed no longer has them — so generic examples don't linger next to her real life;
 * - any record with a seed id that was never edited (createdAt === updatedAt) is refreshed to the
 *   current seed version, so corrections to the life seed reach existing installs;
 * - profile fields introduced by the seed (rhythm, work, about, homeBase, widget order) are applied
 *   only when the stored profile still has the generic defaults for them.
 */
import type { CollectionKey, DateKey, DB } from '../types'
import { defaultProfile } from '../defaults'
import { buildSeed, LIFE_SEED_VERSION } from '.'

/**
 * The first-run seed stamps every record (and the default categories) with the same timestamp.
 * We read it from the default categories, which every seed creates.
 */
function oldSeedStamp(db: DB): string | undefined {
  const c = db.financialCategories.find((x) => x.id === 'cat-casa')
  return c && c.createdAt === c.updatedAt ? c.createdAt : undefined
}

export function needsLifeSeed(db: DB): boolean {
  return (db.profile.seedVersion ?? 1) < LIFE_SEED_VERSION
}

export function applyLifeSeed(db: DB, today: DateKey): DB {
  if (!needsLifeSeed(db)) return db
  const seed = buildSeed(today)
  const out: DB = { ...db }
  const stamp = oldSeedStamp(db)
  type Rec = { id: string; createdAt: string; updatedAt: string }
  const untouchedOldSeed = (r: Rec) => !!stamp && r.createdAt === stamp && r.updatedAt === stamp
  for (const key of Object.keys(seed) as (keyof DB)[]) {
    const list = seed[key]
    if (!Array.isArray(list)) continue
    const k = key as CollectionKey
    if (k === 'financialCategories' || k === 'integrations') {
      const existing = new Set((out[k] as Rec[]).map((x) => x.id))
      const additions = (list as Rec[]).filter((x) => !existing.has(x.id))
      if (additions.length) (out[k] as unknown[]) = [...(out[k] as unknown[]), ...additions]
      continue
    }
    const fresh = new Map((list as Rec[]).map((x) => [x.id, x]))
    const kept: Rec[] = []
    for (const r of out[k] as Rec[]) {
      const upgraded = fresh.get(r.id)
      if (untouchedOldSeed(r)) {
        if (upgraded) kept.push(upgraded) // untouched example → new version
        // else: untouched example the new seed dropped → retired
      } else if (upgraded && r.createdAt === r.updatedAt) {
        // A seed record (stable id) Marina never edited → refreshed with corrected seed data
        // (e.g. a trip date she later corrected in the brief). Edited records are never touched.
        kept.push(upgraded)
      } else kept.push(r)
    }
    const ids = new Set(kept.map((x) => x.id))
    for (const r of list as Rec[]) if (!ids.has(r.id)) kept.push(r)
    ;(out[k] as unknown[]) = kept
  }
  // Occurrences pointing at retired records are dropped too.
  const alive = new Set([...out.tasks, ...out.routineItems, ...out.petTasks].map((x) => x.id))
  out.occurrences = out.occurrences.filter((o) => alive.has(o.parentId))
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
