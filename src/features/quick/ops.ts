/**
 * Quick registration WITHOUT Lumos: each writer goes to the same collection / service Lumos and the screens use
 * (tasks, expenses, workouts, logFood, checkins, ensureProspect) and returns `undo`. No toasts here — the sheet
 * waits for the device to hold the change (saveConfirmed) and only then says "✓ · Desfazer".
 */
import { actions, getDB, nextOrder } from '@/data/store'
import type { DailyCheckIn, DateKey, ID, Task, TimeHM } from '@/data/types'
import { logFood } from '@/data/nutrition'
import { ensureProspect } from '@/data/ugc/ops'
import { upsertCheckin } from '@/features/body/mutations'
import { EMPTY_HABITS } from '@/features/body/selectors'
import { hmToMinutes, toTimeHM } from '@/lib/date'

export type Undo = () => void

// ─── Tarefa ─────────────────────────────────────────────────────────────────

export type QuickArea = 'vida' | 'trabalho' | 'casa' | 'luna' | 'estudo'
export const QUICK_AREAS: { value: QuickArea; label: string }[] = [
  { value: 'vida', label: 'Vida' },
  { value: 'trabalho', label: 'Trabalho' },
  { value: 'casa', label: 'Casa' },
  { value: 'luna', label: 'Luna' },
  { value: 'estudo', label: 'Estudo' },
]
const AREA_FIELDS: Record<QuickArea, Pick<Task, 'context' | 'area'>> = {
  vida: { context: 'geral', area: 'pessoal' },
  trabalho: { context: 'trabalho', area: 'profissional' },
  casa: { context: 'vida_real', area: 'pessoal' },
  luna: { context: 'luna', area: 'pessoal' },
  estudo: { context: 'estudo', area: 'estudo' },
}

export function quickTask(input: { title: string; date?: DateKey; time?: TimeHM; area?: QuickArea; notes?: string }): { id: ID; undo: Undo } {
  const t = actions.create('tasks', {
    title: input.title.trim(),
    status: 'todo',
    date: input.date,
    time: input.time || undefined,
    notes: input.notes?.trim() || undefined,
    ...AREA_FIELDS[input.area ?? 'vida'],
    order: nextOrder(getDB().tasks),
  })
  return { id: t.id, undo: () => void actions.remove('tasks', t.id) }
}

// ─── Despesa ────────────────────────────────────────────────────────────────

export function quickExpense(input: { amountCents: number; title?: string; categoryId: ID; date: DateKey }): { id: ID; undo: Undo } {
  const cat = getDB().financialCategories.find((c) => c.id === input.categoryId)
  const e = actions.create('expenses', {
    title: input.title?.trim() || cat?.name || 'Gasto',
    amountCents: input.amountCents,
    categoryId: input.categoryId,
    date: input.date,
    status: 'paid',
    origin: 'manual',
  })
  return { id: e.id, undo: () => void actions.remove('expenses', e.id) }
}

// ─── Treino livre (the planned one is ticked through the Home's checkItem) ──

export function quickWorkout(input: { modality: string; durationMin?: number; date: DateKey; now?: Date }): { id: ID; undo: Undo } {
  const db = getDB()
  const order = db.workouts.filter((w) => w.date === input.date).reduce((m, w) => Math.max(m, w.order), -1) + 1
  const w = actions.create('workouts', {
    date: input.date,
    time: toTimeHM(input.now ?? new Date()),
    modality: input.modality,
    status: 'feito',
    durationMin: input.durationMin,
    plannedDurationMin: input.durationMin,
    order,
  })
  return { id: w.id, undo: () => void actions.remove('workouts', w.id) }
}

// ─── Refeição livre (same logFood Lumos uses; the planned one via checkItem) ─

export function quickMeal(input: { text: string; date: DateKey; now?: Date }): { id: ID; undo: Undo } {
  const r = logFood({ foods: [], description: input.text, date: input.date, now: input.now, via: 'formulario', noAdapt: true })
  return { id: r.meal.id, undo: r.undo }
}

// ─── Check-in: sono · humor · água ──────────────────────────────────────────

type CheckinPatch = Partial<Omit<DailyCheckIn, 'id' | 'createdAt' | 'updatedAt' | 'date'>>

/** upsertCheckin + an exact undo (restores the fields it touched, or removes the day it created). */
function patchCheckin(date: DateKey, patch: CheckinPatch): Undo {
  const before = getDB().checkins.find((c) => c.date === date)
  upsertCheckin(date, patch)
  if (!before) {
    const created = getDB().checkins.find((c) => c.date === date)
    return () => void (created && actions.remove('checkins', created.id))
  }
  const restore = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof DailyCheckIn]])) as CheckinPatch
  return () => actions.update('checkins', before.id, restore)
}

/** Hours between lying down and waking up (crosses midnight). */
export function sleepHours(bed: TimeHM, wake: TimeHM): number {
  let d = hmToMinutes(wake) - hmToMinutes(bed)
  if (d <= 0) d += 24 * 60
  return Math.round((d / 60) * 10) / 10
}

/** Quality 1–5 also fills the old 3-level `sono` (what the check-in and history already read). */
const SONO_OF: Record<number, DailyCheckIn['sono']> = { 1: 'ruim', 2: 'ruim', 3: 'ok', 4: 'bom', 5: 'bom' }

export function quickSleep(input: { date: DateKey; bed?: TimeHM; wake?: TimeHM; hours?: number; quality?: 1 | 2 | 3 | 4 | 5 }): Undo {
  const hours = input.bed && input.wake ? sleepHours(input.bed, input.wake) : input.hours
  const sleep: NonNullable<DailyCheckIn['sleep']> = { bed: input.bed || undefined, wake: input.wake || undefined, hours, quality: input.quality }
  return patchCheckin(input.date, { sleep, ...(input.quality ? { sono: SONO_OF[input.quality] } : {}) })
}

export function quickMood(input: { date: DateKey; humor: 1 | 2 | 3 | 4 | 5; nota?: string }): Undo {
  return patchCheckin(input.date, { humor: input.humor, ...(input.nota?.trim() ? { nota: input.nota.trim() } : {}) })
}

/** One more glass (≈250 ml) on the same counter as Corpo → Hoje. Returns the new count. */
export function addWater(date: DateKey, glasses = 1): { count: number; undo: Undo } {
  const before = getDB().checkins.find((c) => c.date === date)
  const prev = before?.habits.agua ?? 0
  const count = Math.max(0, prev + glasses)
  const undo = patchCheckin(date, { habits: { ...EMPTY_HABITS, ...(before?.habits ?? {}), agua: count } })
  return { count, undo }
}

// ─── Marca UGC ──────────────────────────────────────────────────────────────

export function quickBrand(name: string): { brandId: ID; created: boolean; undo: Undo } {
  const r = ensureProspect(name.trim())
  return { brandId: r.brand.id, created: r.createdBrand || r.createdOpportunity, undo: r.undo }
}

// ─── Sono e humor: last 7 days (for the history section) ────────────────────

export interface SleepMoodWeek {
  days: { date: DateKey; hours?: number; quality?: number; humor?: number }[]
  avgHours?: number
  avgQuality?: number
  avgHumor?: number
}

function avg(values: (number | undefined)[]): number | undefined {
  const xs = values.filter((x): x is number => typeof x === 'number' && x > 0)
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : undefined
}

export function sleepMoodWeek(checkins: DailyCheckIn[], today: DateKey, from: DateKey): SleepMoodWeek {
  const days = checkins
    .filter((c) => c.date <= today && c.date >= from && (c.sleep?.hours || c.sleep?.quality || c.humor))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((c) => ({ date: c.date, hours: c.sleep?.hours, quality: c.sleep?.quality, humor: c.humor }))
  return {
    days,
    avgHours: avg(days.map((d) => d.hours)),
    avgQuality: avg(days.map((d) => d.quality)),
    avgHumor: avg(days.map((d) => d.humor)),
  }
}
