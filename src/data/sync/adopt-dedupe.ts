/**
 * A device adopting a cloud that already has her data (first run on this device, or its sync bookkeeping
 * was lost) may hold records the cloud never saw that are NOT hers to add: copies of things the cloud
 * already has under another id. They come from boot-time imports/seeds that ran on this device before
 * the cloud answered — or long ago, on an old copy of the app's storage that was never synced:
 *
 *  - a bundled Daily Briefing applied again (random ids; same `source.sourceKey` as the cloud's items);
 *  - the import batch of a briefing the cloud profile already lists in `briefingsApplied`, and the records
 *    it created that were never touched since;
 *  - the UGC migration's Brand for a name the cloud already has (+ its opportunity);
 *  - week-template workouts (deterministic `seed:<area>:w-<date>-…` ids) for days already past;
 *  - seed records she deleted (cloud profile.removedSeedIds).
 *
 * Those are dropped instead of pushed as new copies. Everything else only on this device is still sent.
 * Nothing the cloud has is touched; a local copy edited after the cloud's version is kept as a sync
 * conflict for her to review (never silently lost).
 */
import { matchBrand } from '../ugc/crm'
import type { Brand, DateKey, ImportBatch } from '../types'
import { normalize } from '@/lib/text'
import type { RemoteRow } from './transport'

type Rec = Record<string, unknown> & { id: string }

export interface AdoptDrop {
  collection: string
  id: string
  /** The local copy (kept as a conflict when it was edited after the cloud's counterpart). */
  data: Rec
  /** The local copy carries edits newer than what the cloud has → keep it as a conflict. */
  newer: boolean
}

export interface AdoptDedupe {
  /** Collections whose list changed (dropped records, brandId remapped to the cloud's brand). */
  lists: Record<string, Rec[]>
  dropped: AdoptDrop[]
}

const DATED_SEED = /^seed:[^:]+:w-(\d{4}-\d{2}-\d{2})-/
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const untouched = (r: Rec) => !!r.createdAt && r.createdAt === r.updatedAt
const sourceKeyOf = (r: Rec) => str((r.source as { sourceKey?: unknown } | undefined)?.sourceKey)
const titleKey = (v: unknown) => normalize(str(v)).replace(/[^a-z0-9]+/g, '')

/**
 * @param lists  the device's collections after the merge (collection → records)
 * @param rows   everything pulled from the cloud on this adopt (tombstones included)
 * @param cloudProfile the cloud's profile (if any)
 * @param today  her today (past dated seed workouts are not sent)
 */
export function dedupeAdopted(lists: Record<string, Rec[]>, rows: RemoteRow[], cloudProfile: Record<string, unknown> | undefined, today: DateKey): AdoptDedupe {
  const inCloud = new Set(rows.map((r) => `${r.collection}/${r.id}`))
  const cloud = new Map<string, Rec[]>()
  for (const r of rows) {
    if (r.deleted || !r.data || typeof r.data !== 'object') continue
    const list = cloud.get(r.collection) ?? []
    list.push(r.data as Rec)
    cloud.set(r.collection, list)
  }
  const localOnly = (c: string, it: Rec) => !inCloud.has(`${c}/${it.id}`)
  const drops = new Map<string, AdoptDrop>()
  const drop = (c: string, it: Rec, counterpart?: Rec) => {
    const key = `${c}/${it.id}`
    if (drops.has(key)) return
    // Only an edit (not the copy's own creation) newer than the cloud's version is worth her review.
    const newer = !untouched(it) && (!counterpart || str(it.updatedAt) > str(counterpart.updatedAt))
    drops.set(key, { collection: c, id: it.id, data: it, newer })
  }

  // Brands: same name (or a known alias) as one in the cloud → the cloud's brand; links follow it.
  const brandMap = new Map<string, string>()
  const cloudBrands = (cloud.get('brands') ?? []) as unknown as Brand[]
  for (const b of lists.brands ?? []) {
    if (!localOnly('brands', b) || !str(b.name)) continue
    const same = matchBrand(cloudBrands, str(b.name))
    if (!same) continue
    brandMap.set(b.id, same.id)
    drop('brands', b, same as unknown as Rec)
  }
  const out: Record<string, Rec[]> = {}
  if (brandMap.size) {
    for (const [c, list] of Object.entries(lists)) {
      let changed = false
      const next = list.map((it) => {
        const to = it && localOnly(c, it) ? brandMap.get(str(it.brandId)) : undefined
        if (!to) return it
        changed = true
        return { ...it, brandId: to }
      })
      if (changed) out[c] = next
    }
  }
  const listOf = (c: string) => out[c] ?? lists[c] ?? []

  // Imported items: the same sourceKey in the same collection is the same thing.
  for (const c of Object.keys(lists)) {
    const keys = new Map<string, Rec>()
    for (const r of cloud.get(c) ?? []) if (sourceKeyOf(r)) keys.set(sourceKeyOf(r), r)
    if (!keys.size) continue
    for (const it of listOf(c)) {
      const k = it && localOnly(c, it) ? sourceKeyOf(it) : ''
      if (k && keys.has(k)) drop(c, it, keys.get(k))
    }
  }

  // UGC opportunities: same brand + same title as one in the cloud.
  const cloudOpps = cloud.get('ugcOpportunities') ?? []
  for (const o of listOf('ugcOpportunities')) {
    if (!localOnly('ugcOpportunities', o) || !str(o.brandId)) continue
    const same = cloudOpps.find((x) => x.brandId === o.brandId && titleKey(x.title) === titleKey(o.title))
    if (same) drop('ugcOpportunities', o, same)
  }

  // A briefing the cloud already received: this device's batch of it, and what that batch created untouched.
  const applied = new Set((cloudProfile?.briefingsApplied as string[] | undefined) ?? [])
  const cloudBatches = (cloud.get('importBatches') ?? []) as unknown as ImportBatch[]
  for (const b of listOf('importBatches') as unknown as (ImportBatch & Rec)[]) {
    if (!localOnly('importBatches', b) || b.kind === 'changes' || !b.briefingDate) continue
    const twin = cloudBatches.find((x) => x.kind !== 'changes' && x.briefingDate === b.briefingDate && x.source === b.source)
    if (!applied.has(b.briefingDate) && !twin) continue
    drop('importBatches', b, twin as unknown as Rec | undefined)
    for (const ch of b.changes ?? []) {
      if (ch.op !== 'created') continue
      const it = listOf(ch.collection).find((x) => x?.id === ch.id)
      if (it && localOnly(ch.collection, it) && it.updatedAt === ch.stamp) drop(ch.collection, it, it)
    }
  }

  // Week-template workouts for days already past that the cloud never had: not news, never sent.
  for (const w of listOf('workouts')) {
    const day = w && DATED_SEED.exec(w.id)?.[1]
    if (day && day < today && localOnly('workouts', w) && untouched(w)) drop('workouts', w)
  }

  // Seed records she deleted (on another device): never brought back.
  const removed = new Set((cloudProfile?.removedSeedIds as string[] | undefined) ?? [])
  if (removed.size) {
    for (const c of Object.keys(lists)) for (const it of listOf(c)) if (it && removed.has(it.id) && localOnly(c, it)) drop(c, it)
  }

  if (drops.size) {
    for (const c of new Set([...drops.values()].map((d) => d.collection))) out[c] = listOf(c).filter((it) => !drops.has(`${c}/${it?.id}`))
  }
  return { lists: out, dropped: [...drops.values()] }
}
