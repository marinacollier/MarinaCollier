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
 * - a never-edited record with a seed id that the current seed no longer has (a generic example
 *   replaced by her real data) is retired. Week-scoped seed workouts are left alone (their ids
 *   carry a date, so last week's are legitimately absent from today's seed);
 * - profile fields introduced by the seed (rhythm, work, about, homeBase, widget order) are applied
 *   only when the stored profile still has the generic defaults for them.
 */
import type { CollectionKey, DateKey, DB } from '../types'
import { defaultProfile } from '../defaults'
import { buildSeed, LIFE_SEED_VERSION } from '.'
import { SEED_IDS } from './ids'
import { normalize } from '@/lib/text'

/** Named seed ids, plus ids kept from the first seed (goals). */
const STABLE_SEED_IDS = new Set<string>([...Object.values(SEED_IDS), 'goal-africa-pronta'])

/** Ids only the seed produces: 'seed:<area>:<slug>' and the named SEED_IDS. */
export function isSeedRecordId(id: string): boolean {
  return id.startsWith('seed:') || STABLE_SEED_IDS.has(id)
}

/** Collections whose seed ids are scoped to a date (regenerated each week, never "dropped"). */
const DATED_SEED_COLLECTIONS = new Set<CollectionKey>(['workouts'])

/**
 * A seed addition Marina already has under her own id (she added the book herself, Lumos already
 * learned that key) is skipped instead of duplicated.
 */
const norm = (v: unknown) => (typeof v === 'string' ? normalize(v) : undefined)
const SAME_AS: Partial<Record<CollectionKey, (a: Record<string, unknown>, b: Record<string, unknown>) => boolean>> = {
  books: (a, b) => !!norm(a.title) && norm(a.title) === norm(b.title),
  memory: (a, b) => !!a.key && a.key === b.key,
}

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
      } else if (!upgraded && r.createdAt === r.updatedAt && isSeedRecordId(r.id) && !DATED_SEED_COLLECTIONS.has(k)) {
        // A seed record the life seed dropped (e.g. "Temas de IA para aprofundar"), never edited → retired.
      } else kept.push(r)
    }
    const ids = new Set(kept.map((x) => x.id))
    const sameAs = SAME_AS[k]
    for (const r of list as Rec[]) {
      if (ids.has(r.id)) continue
      if (sameAs && kept.some((x) => sameAs(x as unknown as Record<string, unknown>, r as unknown as Record<string, unknown>))) continue
      kept.push(r)
    }
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
