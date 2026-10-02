/**
 * Routine logic for Hoje (Milagre da Manhã, Encerrar o dia).
 *
 * - An item counts as done only when its Occurrence has status 'done'.
 *   Partial sub-steps (or text written before checking) live in an Occurrence with status 'skipped'
 *   until the item is complete — they never count as done.
 * - Optional items are never counted as missing: they only join the total once checked.
 * - "Hoje vou de versão curta" = DailyCheckIn.routineModes[routineId] = 'essential' for that day.
 *   It never breaks the routine; switching back is one tap.
 * Pure helpers first (tested), writes at the bottom.
 */
import { actions, getDB } from '@/data/store'
import { checkinFor, routineItemsFor, workoutsOn } from '@/data/selectors'
import { isPresencial } from '@/data/planning'
import { SEED_IDS } from '@/data/seed/ids'
import type { DateKey, DB, ID, Occurrence, Routine, RoutineItem } from '@/data/types'
import { hmToMinutes } from '@/lib/date'
import { occurrenceFor } from '@/lib/recurrence'
import { ensureCheckin } from './closing'

export type RoutineMode = 'completa' | 'essential'

export function morningRoutine(db: DB): Routine | undefined {
  return db.routines.find((r) => r.id === SEED_IDS.routineMorning) ?? db.routines.find((r) => r.period === 'manha')
}

export function eveningRoutine(db: DB): Routine | undefined {
  return db.routines.filter((r) => r.period === 'noite').sort((a, b) => a.order - b.order)[0]
}

export function routineMode(db: DB, routine: Routine, date: DateKey): RoutineMode {
  if (!routine.hasEssential) return 'completa'
  return checkinFor(db, date)?.routineModes?.[routine.id] ?? 'completa'
}

/** The mode was chosen explicitly today (so we stop suggesting). */
export function modeChosen(db: DB, routine: Routine, date: DateKey): boolean {
  return !!checkinFor(db, date)?.routineModes?.[routine.id]
}

export function itemOccurrence(db: DB, item: RoutineItem, date: DateKey): Occurrence | undefined {
  return occurrenceFor(db.occurrences, 'routineItem', item.id, date)
}

export function isItemDone(db: DB, item: RoutineItem, date: DateKey): boolean {
  return itemOccurrence(db, item, date)?.status === 'done'
}

export function stepsDoneOf(db: DB, item: RoutineItem, date: DateKey): number[] {
  const occ = itemOccurrence(db, item, date)
  if (occ?.status === 'done' && item.steps?.length && !occ.stepsDone) return item.steps.map((_, i) => i)
  return occ?.stepsDone ?? []
}

export interface RoutineView {
  routine: Routine
  mode: RoutineMode
  /** Items shown in the current mode. */
  items: RoutineItem[]
  done: number
  /** Required items + optional items already done. */
  total: number
  complete: boolean
}

export function routineView(db: DB, routine: Routine, date: DateKey): RoutineView {
  const mode = routineMode(db, routine, date)
  const all = routineItemsFor(db, routine.id, date)
  const items = mode === 'essential' ? all.filter((i) => i.essential) : all
  let done = 0
  let total = 0
  for (const it of items) {
    const d = isItemDone(db, it, date)
    if (d) done++
    if (!it.optional || d) total++
  }
  return { routine, mode, items, done, total, complete: total > 0 && done >= total }
}

export function itemLabel(item: RoutineItem, mode: RoutineMode): string {
  return mode === 'essential' && item.essentialLabel ? item.essentialLabel : item.title
}

/** "07:00" → "07h", "06:30" → "06h30". */
export function shortTime(t: string): string {
  const [h, m] = t.split(':')
  return m === '00' ? `${h}h` : `${h}h${m}`
}

/**
 * §38: when the day starts with an early workout (≤ 07:30) or is presencial, gently suggest the short version.
 * Returns the copy, or undefined. Never forces anything; once a mode is chosen, it stays quiet.
 */
export function essentialSuggestion(db: DB, routine: Routine, date: DateKey): string | undefined {
  if (!routine.hasEssential || modeChosen(db, routine, date)) return undefined
  const early = workoutsOn(db, date).find((w) => w.status === 'planejado' && w.time && hmToMinutes(w.time) <= 7 * 60 + 30)
  if (early) return `Treino às ${shortTime(early.time!)} — que tal a versão curta hoje?`
  if (isPresencial(db.profile, date)) return 'Dia presencial — que tal a versão curta hoje?'
  return undefined
}

// ─── Writes ─────────────────────────────────────────────────────────────────

function upsertOccurrence(item: RoutineItem, date: DateKey, patch: Partial<Occurrence>): void {
  const existing = itemOccurrence(getDB(), item, date)
  if (existing) actions.update('occurrences', existing.id, patch)
  else actions.create('occurrences', { parentType: 'routineItem', parentId: item.id, date, status: 'skipped', ...patch })
}

function cleanupIfEmpty(item: RoutineItem, date: DateKey): void {
  const occ = itemOccurrence(getDB(), item, date)
  if (occ && occ.status !== 'done' && !occ.note && !occ.stepsDone?.length) actions.remove('occurrences', occ.id)
}

/** Tap on the item itself: checks it directly (steps don't need to be ticked). Returns the new state. */
export function toggleItem(item: RoutineItem, date: DateKey): boolean {
  const done = isItemDone(getDB(), item, date)
  upsertOccurrence(item, date, { status: done ? 'skipped' : 'done' })
  if (done) cleanupIfEmpty(item, date)
  return !done
}

/** Toggle one sub-step. The item auto-checks when every step is done (and unchecks if one is undone). */
export function toggleStep(item: RoutineItem, index: number, date: DateKey): { itemDone: boolean } {
  const steps = item.steps ?? []
  const current = new Set(stepsDoneOf(getDB(), item, date))
  const removing = current.has(index)
  if (removing) current.delete(index)
  else current.add(index)
  const stepsDone = [...current].sort((a, b) => a - b)
  const all = steps.length > 0 && steps.every((_, i) => current.has(i))
  const wasDone = isItemDone(getDB(), item, date)
  // Adding a step never undoes the item; un-ticking a step of a done item reopens it.
  const status: Occurrence['status'] = all || (wasDone && !removing) ? 'done' : 'skipped'
  upsertOccurrence(item, date, { stepsDone, status })
  cleanupIfEmpty(item, date)
  return { itemDone: status === 'done' }
}

/** Journaling text for the day (Occurrence.note). Doesn't change the done state. */
export function setItemNote(item: RoutineItem, date: DateKey, note: string): void {
  const clean = note.replace(/\s+$/, '')
  const existing = itemOccurrence(getDB(), item, date)
  if (!clean && !existing) return
  upsertOccurrence(item, date, { note: clean || undefined })
  cleanupIfEmpty(item, date)
}

export function setRoutineMode(routineId: ID, date: DateKey, mode: RoutineMode): void {
  const c = ensureCheckin(date)
  const fresh = getDB().checkins.find((x) => x.id === c.id) ?? c
  actions.update('checkins', c.id, { routineModes: { ...(fresh.routineModes ?? {}), [routineId]: mode } })
}
