/** Radar de vagas — the one write: store a pasted newsletter (deduped). See radar.ts for the shape. */
import { actions, getDB } from '@/data/store'
import type { DateKey, StudyItem } from '@/data/types'
import { extractSkills, pasteHash, RADAR_SOURCE, RADAR_TAG, radarItems } from './radar'

// ─── Write ──────────────────────────────────────────────────────────────────

export type AddResult = { status: 'added'; item: StudyItem; skills: number } | { status: 'duplicate'; item: StudyItem } | { status: 'empty' }

/** Stores one paste (or reports the identical one already stored). */
export function addNewsletter(text: string, date: DateKey, source = RADAR_SOURCE): AddResult {
  const raw = text.trim()
  if (!raw) return { status: 'empty' }
  const db = getDB()
  const h = pasteHash(raw)
  const dup = radarItems(db).find((i) => pasteHash(i.notes ?? '') === h)
  if (dup) return { status: 'duplicate', item: dup }
  const item = actions.create('studyItems', {
    title: `Newsletter de vagas · ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`,
    kind: 'newsletter',
    reference: true,
    source,
    status: 'finalizado',
    progress: 0,
    notes: raw,
    finishedAt: date,
    tags: [RADAR_TAG],
    order: 0,
  })
  return { status: 'added', item, skills: Object.keys(extractSkills(raw)).length }
}
