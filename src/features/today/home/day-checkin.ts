/**
 * Check-in do dia + "O que faz sentido agora?" — the writes and the context the Home card plans from.
 * One DayCheckin per local day (db.dayCheckins). Every change is appended to `changes` (with an optional
 * reason) and offers Desfazer; nothing here ever talks about failure.
 */
import { actions, getDB } from '@/data/store'
import type { CalendarEntry } from '@/data/calendar/universal'
import { dayCapacity, type Capacity } from '@/data/priority/capacity'
import type { DayContext, Energy } from '@/data/priority/contract'
import { planDay, type DayPlan } from '@/data/priority/engine'
import type { DateKey, DayChangeAction, DayCheckin, DB, ID, Task } from '@/data/types'
import { addDays, minutesToHM } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { setTaskDone } from '@/features/tasks/ops'

export const ENERGY_LABEL: Record<Energy, string> = {
  1: 'Muito baixa',
  2: 'Baixa',
  3: 'Média',
  4: 'Alta',
  5: 'Muito alta',
}
export const FREE_CHIPS: { min: number; label: string }[] = [
  { min: 15, label: '15 min' },
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1h' },
  { min: 120, label: '2h' },
  { min: 180, label: '3h+' },
]
export const INTEREST_CHIPS = ['Descansar', 'Estudar algo novo', 'Criar', 'Me movimentar', 'Resolver pendências']
/** End-of-day review shows from this local minute on. */
export const REVIEW_FROM_MIN = 20 * 60

export const SKIP_REASON: Partial<Record<DayChangeAction, string>> = {
  hoje_nao: 'Tu tirou de hoje',
  trocar: 'Trocado por outra coisa',
  mais_tarde: 'Mais tarde',
  adiar: 'Adiado',
  concluir: 'Já concluído',
  dividir: 'Dividido em etapas',
}

export function formatMin(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export const checkinOf = (db: Pick<DB, 'dayCheckins'>, date: DateKey): DayCheckin | undefined => (db.dayCheckins ?? []).find((c) => c.date === date)

/** Yesterday's energy, offered as a suggestion (never stored as today's until she confirms). */
export function yesterdayEnergy(db: Pick<DB, 'dayCheckins'>, date: DateKey): Energy | undefined {
  return checkinOf(db, addDays(date, -1))?.energy
}

/** Context for the engine: her answers first, the calendar's capacity otherwise. */
export function dayContextFor(db: DB, date: DateKey, nowMin: number, entries?: CalendarEntry[]): { ctx: DayContext; cap: Capacity; skip: Record<string, string> } {
  const c = checkinOf(db, date)
  const energy: Energy = c?.energy ?? yesterdayEnergy(db, date) ?? 3
  const cap = dayCapacity(db, date, nowMin, energy, entries)
  const skip: Record<string, string> = {}
  for (const ch of c?.changes ?? []) {
    const why = SKIP_REASON[ch.action]
    if (why && ch.key !== 'day') skip[ch.key] = ch.reason ? `${why} · ${ch.reason}` : why
  }
  const interest = [c?.interest, c?.note].filter(Boolean).join(', ') || undefined
  const ctx: DayContext = {
    date,
    freeMin: c?.freeMin ?? cap.freeMin,
    focusMin: c?.focusMin,
    energy,
    now: minutesToHM(nowMin),
    note: c?.note,
    interest,
  }
  return { ctx, cap, skip }
}

export function planFor(db: DB, date: DateKey, nowMin: number, entries?: CalendarEntry[]): DayPlan {
  const { ctx, cap, skip } = dayContextFor(db, date, nowMin, entries)
  return planDay(db, ctx, { windows: cap.windows, skip, entries })
}

// ─── Writes ─────────────────────────────────────────────────────────────────

type Patch = Partial<Omit<DayCheckin, 'id' | 'createdAt' | 'updatedAt' | 'date'>>

/** Create or update the day's check-in. Returns an undo. */
export function saveDayCheckin(date: DateKey, patch: Patch): () => void {
  const before = checkinOf(getDB(), date)
  if (before) {
    actions.update('dayCheckins', before.id, patch)
    return () =>
      actions.update('dayCheckins', before.id, {
        ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])),
        ...before,
      })
  }
  const created = actions.create('dayCheckins', {
    date,
    changes: [],
    ...patch,
  })
  return () => void actions.remove('dayCheckins', created.id)
}

/** Append one change (and the patch it implies). Returns an undo. */
export function logChange(date: DateKey, key: string, action: DayChangeAction, patch: Patch = {}, reason?: string): () => void {
  const prev = checkinOf(getDB(), date)?.changes ?? []
  return saveDayCheckin(date, {
    ...patch,
    changes: [...prev, { at: nowISO(), key, action, ...(reason ? { reason } : {}) }],
  })
}

/** Add a reason to the last change (the small optional field after an action). */
export function reasonForLast(date: DateKey, reason: string): void {
  const c = checkinOf(getDB(), date)
  const text = reason.trim()
  if (!c?.changes.length || !text) return
  const changes = [...c.changes]
  changes[changes.length - 1] = {
    ...changes[changes.length - 1],
    reason: text,
  }
  actions.update('dayCheckins', c.id, { changes })
}

const taskIdOf = (key: string): ID | undefined => (key.startsWith('task:') ? key.slice(5) : undefined)

/** Adiar: a task moves to `to` (default tomorrow) and keeps where it was planned before. */
export function postpone(date: DateKey, key: string, to: DateKey = addDays(date, 1), reason?: string): () => void {
  const id = taskIdOf(key)
  const task = id ? getDB().tasks.find((t) => t.id === id) : undefined
  const undoLog = logChange(date, key, 'adiar', {}, reason)
  if (!task || task.recurrence) return undoLog
  const prev = { date: task.date, postponedFrom: task.postponedFrom }
  actions.update('tasks', task.id, {
    date: to,
    postponedFrom: task.date ?? date,
  })
  return () => {
    actions.update('tasks', task.id, prev)
    undoLog()
  }
}

/** Já concluí: the existing task done action. */
export function complete(date: DateKey, key: string): () => void {
  const id = taskIdOf(key)
  const undoLog = logChange(date, key, 'concluir')
  if (!id) return undoLog
  setTaskDone(id, true, date)
  return () => {
    setTaskDone(id, false, date)
    undoLog()
  }
}

/** Dividir: one child task per line she wrote ("Etapa 1/2: …"). Nothing is created without her text. */
export function split(date: DateKey, key: string, text: string): (() => void) | undefined {
  const steps = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const id = taskIdOf(key)
  const parent: Task | undefined = id ? getDB().tasks.find((t) => t.id === id) : undefined
  if (!steps.length) return undefined
  const order = getDB().tasks.reduce((m, t) => Math.max(m, t.order), -1) + 1
  const made = actions.createMany(
    'tasks',
    steps.map((s, i) => ({
      title: `Etapa ${i + 1}/${steps.length}: ${s}`,
      status: 'todo' as const,
      order: order + i,
      date: i === 0 ? date : undefined,
      projectId: parent?.projectId,
      context: parent?.context,
      lifeArea: parent?.lifeArea,
      goalIds: parent?.goalIds,
      goalId: parent?.goalId,
      origin: parent ? { type: 'task' as const, id: parent.id } : undefined,
    })),
  )
  const undoLog = logChange(date, key, 'dividir')
  return () => {
    for (const t of made) actions.remove('tasks', t.id)
    undoLog()
  }
}
