/**
 * Daily Briefings that ship with the app (her real ones, sent outside the app) reach the device THROUGH
 * the importer — planBriefing → applyPlan, one ImportBatch — never as seed records. So the same rules
 * apply to her persisted data: done stays done, moved stays moved, nothing is duplicated.
 *
 * - runs at boot, after the stored DB is loaded and migrated (bootWithBriefings, used by main.tsx);
 * - each bundled briefing runs once per install (profile.briefingsApplied), and only during its own week
 *   (a briefing from weeks ago is not news); re-running is a no-op anyway (sourceKeys);
 * - "Desfazer importação" is respected: the date stays recorded, so it is never re-applied.
 */
import { actions, getDB, hydrate, markFreshSeed, persist } from '../store'
import type { StorageAdapter } from '../storage'
import type { DateKey, DB } from '../types'
import type { ChangesDoc } from '../changes/contract'
import { addDays, todayKey } from '@/lib/date'
import { BRIEFING_2026_10_12 } from '../seed/briefing-1012'
import { SYNC_2026_10_15 } from '../seed/sync/sync-2026-10-15'
import { applyPlan } from './apply'
import { planBriefing, type BriefingBlock } from './import'

export const BUNDLED_BRIEFINGS: BriefingBlock[] = [BRIEFING_2026_10_12]

/** The bundled briefing of that day (what "Importa meu Daily Briefing de hoje" uses without a pasted JSON). */
export const bundledBriefingFor = (date: DateKey): BriefingBlock | undefined => BUNDLED_BRIEFINGS.find((b) => b.date === date)

/** Applies the bundled briefings this install has not received yet. Returns the dates applied now. */
export function applyBundledBriefings(today: DateKey = todayKey()): DateKey[] {
  const done: DateKey[] = []
  for (const block of BUNDLED_BRIEFINGS) {
    const db = getDB()
    if (db.profile.briefingsApplied?.includes(block.date)) continue
    if (today < block.date || today > addDays(block.date, 6)) continue
    const plan = planBriefing(db, [block])
    if (plan?.ops.length) applyPlan(plan)
    actions.setProfile({ briefingsApplied: [...(getDB().profile.briefingsApplied ?? []), block.date] })
    done.push(block.date)
  }
  return done
}

// ─── Bundled weekly syncs (marina-os/changes@1) ─────────────────────────────
// Unlike a briefing, a sync is NEVER applied at boot: Home offers it once, she reviews it in the Central
// Universal and only her "Confirmar" writes (one batch). Confirmed once = never offered again (even if
// she later undoes that import); offered only inside its own window.

export const BUNDLED_SYNCS = [SYNC_2026_10_15]
export type BundledSync = (typeof BUNDLED_SYNCS)[number]

/** The sync Home should offer today, if any. */
export function pendingSync(db: DB, today: DateKey = todayKey()): BundledSync | undefined {
  return BUNDLED_SYNCS.find((s) => today >= s.from && today <= s.until && !db.profile.syncsApplied?.includes(s.id))
}

/** The bundled sync this changes file is (same source and version), if any. */
export const bundledSyncOf = (doc: Pick<ChangesDoc, 'source' | 'generatedAt'>): BundledSync | undefined => BUNDLED_SYNCS.find((s) => s.doc.source === doc.source && s.doc.generatedAt === doc.generatedAt)

/** Records the sync as reviewed and confirmed on this install (profile flag, persisted with the DB). */
export function markSyncApplied(id: string): void {
  const done = getDB().profile.syncsApplied ?? []
  if (!done.includes(id)) actions.setProfile({ syncsApplied: [...done, id] })
}

let bootDone: () => void = () => {}
/** Resolves once boot (load + bundled briefings) finished: the cloud's first merge waits for it. */
export const bootFinished = new Promise<void>((r) => (bootDone = r))

/** Boot: load + migrate the device's DB, then run the bundled briefings through the importer and save. */
export async function bootWithBriefings(storage?: StorageAdapter, today: DateKey = todayKey()): Promise<void> {
  try {
    await bootSteps(storage, today)
  } finally {
    bootDone()
  }
}

async function bootSteps(storage: StorageAdapter | undefined, today: DateKey): Promise<void> {
  await hydrate(storage)
  if (applyBundledBriefings(today).length) {
    markFreshSeed()
    await persist()
  }
}
