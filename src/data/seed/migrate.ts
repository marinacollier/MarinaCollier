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
import { isSeedRecordId } from './ids'
import { seedBacklog } from './backlog'
import { createSeedContext } from './context'
import { normalize } from '@/lib/text'

export { isSeedRecordId }

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
  // Her backlog: a task she already wrote herself (same title, open or done) is not added again.
  tasks: (a, b) => !!norm(a.title) && norm(a.title) === norm(b.title) && a.status !== 'archived',
  projects: (a, b) => !!norm(a.name) && norm(a.name) === norm(b.name),
}

const sameName = (a: { name: string }, b: { name: string }) => normalize(a.name).replace(/[^a-z0-9]+/g, '') === normalize(b.name).replace(/[^a-z0-9]+/g, '')

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
  // A seed record is only ever ADDED once: never again after she deleted it, never re-added because it
  // is missing. Installs from before this bookkeeping (seed v8) had everything except the backlog (v9).
  const allSeedIds = seedRecordIds(seed)
  const removed = new Set(db.profile.removedSeedIds ?? [])
  const received = new Set(db.profile.seedIds ?? ((db.profile.seedVersion ?? 1) >= 8 ? allSeedIds.filter((id) => !ADDED_IN_9().has(id)) : []))
  const mayAdd = (id: string) => !received.has(id) && !removed.has(id)
  const stamp = oldSeedStamp(db)
  type Rec = { id: string; createdAt: string; updatedAt: string }
  const untouchedOldSeed = (r: Rec) => !!stamp && r.createdAt === stamp && r.updatedAt === stamp
  for (const key of Object.keys(seed) as (keyof DB)[]) {
    const list = seed[key]
    if (!Array.isArray(list)) continue
    const k = key as CollectionKey
    if (k === 'financialCategories') {
      // Additive only. A category she already has (same id or same name) only gains the payment check
      // (`bill`) when it has none — name, emoji, budget and everything else stay hers.
      const cats = [...out.financialCategories]
      for (const c of seed.financialCategories) {
        const i = cats.findIndex((x) => x.id === c.id || sameName(x, c))
        if (i < 0) {
          if (mayAdd(c.id)) cats.push(c)
        }
        else if (c.bill && !cats[i].bill) cats[i] = { ...cats[i], bill: c.bill }
      }
      out.financialCategories = cats
      continue
    }
    if (k === 'integrations') {
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
      if (ids.has(r.id) || !mayAdd(r.id)) continue
      if (sameAs && kept.some((x) => sameAs(x as unknown as Record<string, unknown>, r as unknown as Record<string, unknown>))) continue
      kept.push(r)
    }
    ;(out[k] as unknown[]) = kept
  }
  // Occurrences pointing at retired records are dropped too. Every other check she gave is kept as is
  // (events, follow-up lines and payments included) — a new deploy never un-ticks anything.
  const alive = new Set([...out.tasks, ...out.routineItems, ...out.petTasks, ...out.events, ...out.financialCategories].map((x) => x.id))
  out.occurrences = out.occurrences.filter((o) => o.parentType === 'item' || alive.has(o.parentId))
  const generic = defaultProfile()
  const p = { ...out.profile }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (same(p.rhythm, generic.rhythm)) p.rhythm = seed.profile.rhythm
  if (same(p.work, generic.work)) p.work = seed.profile.work
  if (same(p.homeWidgets, generic.homeWidgets)) p.homeWidgets = seed.profile.homeWidgets
  p.about ??= seed.profile.about
  p.homeBase ??= seed.profile.homeBase
  p.seedVersion = LIFE_SEED_VERSION
  p.seedIds = [...new Set([...received, ...allSeedIds])]
  out.profile = p
  return out
}

/** Every record id the seed produces (collections only). */
function seedRecordIds(seed: DB): string[] {
  const ids: string[] = []
  for (const list of Object.values(seed)) if (Array.isArray(list)) for (const r of list) if (r && typeof r === 'object' && 'id' in r) ids.push(String((r as { id: unknown }).id))
  return ids
}

/** Records introduced by seed v9 (her backlog of 09/10 and the payments). */
let added9: Set<string> | undefined
function ADDED_IN_9(): Set<string> {
  if (added9) return added9
  const part = seedBacklog(createSeedContext('2026-10-09'))
  added9 = new Set(Object.values(part).flatMap((l) => (Array.isArray(l) ? l.map((r) => (r as { id: string }).id) : [])))
  return added9
}
