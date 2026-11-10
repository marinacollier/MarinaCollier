/**
 * UMA timeline: the day's flexible things are ALLOCATED onto the same day as the fixed commitments.
 *
 *   entity (task · study · prep)  →  PlannedBlock in DayCheckin.blocks (key + start/end + status)  →  execution
 *
 * - The engine (data/priority/engine.ts) still chooses WHAT; this module decides WHEN, around the calendar
 *   (fixed commitments are busy and never moved) and around blocks already placed.
 * - A block never copies the entity: Concluir completes the task itself / records one StudySession; the
 *   Home, Tarefas, Projetos and Aprendizagem read that same record.
 * - Persisted in the day's check-in, so reopening the app shows the same plan (no recompute-on-render drift).
 * - Every write returns an undo and a sentence saying what really changed (or why nothing could).
 */
import { actions, getDB } from '@/data/store'
import type { CalendarEntry } from '@/data/calendar/universal'
import { dayCapacity, type Capacity } from '@/data/priority/capacity'
import type { Candidate, Energy } from '@/data/priority/contract'
import { planDay, rankCandidates, type DayPlan } from '@/data/priority/engine'
import type { DateKey, DB, DayChangeAction, PlannedBlock } from '@/data/types'
import { addDays, hmToMinutes, minutesToHM } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { setTaskDone } from '@/features/tasks/ops'
import { checkinOf, dayContextFor, formatMin, logChange, postpone, saveDayCheckin } from './day-checkin'

export type ApplyMode = 'auto' | 'preview'
export const applyModeOf = (db: Pick<DB, 'profile'>): ApplyMode => db.profile.planApply ?? 'auto'

const live = (b: PlannedBlock) => b.status !== 'removido'
const minutesOf = (b: Pick<PlannedBlock, 'start' | 'end'>) => hmToMinutes(b.end) - hmToMinutes(b.start)
const taskId = (key: string) => (key.startsWith('task:') ? key.slice(5) : undefined)

export interface Proposal {
  blocks: PlannedBlock[]
  plan: DayPlan
  cap: Capacity
  /** Minutes the new blocks may use (her capacity minus what is already placed). */
  budget: number
  /** Why nothing new was placed: no fitting activity, or no real free window. */
  empty?: 'sem_candidata' | 'sem_espaco'
}

/** The engine's proposal for the rest of the day, around everything already placed. */
export function propose(db: DB, date: DateKey, nowMin: number, entries?: CalendarEntry[], freeMin?: number): Proposal {
  const c = checkinOf(db, date)
  const placed = (c?.blocks ?? []).filter(live)
  const { ctx, skip } = dayContextFor(db, date, nowMin, entries)
  const cap = dayCapacity(db, date, nowMin, ctx.energy, entries, placed.map((b) => ({ start: b.start, end: b.end })))
  for (const b of c?.blocks ?? []) skip[b.key] = b.status === 'feito' ? 'Já concluído' : b.status === 'removido' ? (skip[b.key] ?? 'Tu tirou de hoje') : 'Já está no teu dia'
  const pending = placed.filter((b) => b.status === 'planejado' && hmToMinutes(b.end) > nowMin)
  const budget = Math.max(0, (freeMin ?? ctx.freeMin) - pending.reduce((s, b) => s + Math.max(0, hmToMinutes(b.end) - Math.max(nowMin, hmToMinutes(b.start))), 0))
  const plan = planDay(db, { ...ctx, freeMin: budget, focusMin: undefined }, { windows: cap.windows, skip, entries })
  const picked = [plan.primary, ...plan.secondary].filter((i): i is NonNullable<typeof i> => !!i)
  const at = nowISO()
  const blocks = picked.filter((i) => i.slot).map((i): PlannedBlock => ({ key: i.c.key, start: i.slot!.start, end: i.slot!.end, status: 'planejado', by: 'motor', title: i.c.title, at }))
  return { blocks, plan, cap, budget, empty: !picked.length ? 'sem_candidata' : !blocks.length ? 'sem_espaco' : undefined }
}

// ─── Reading: the blocks as timeline rows ───────────────────────────────────

export interface BlockRow {
  key: string
  start: string
  end: string
  minutes: number
  title: string
  /** planejado (on her day) · sugestao (engine's proposal, not applied) · feito. */
  state: 'planejado' | 'sugestao' | 'feito'
  by: PlannedBlock['by']
  c?: Candidate
}

/** Placed blocks (resolved against their entity) + the not-yet-applied proposal when there is one. */
export function blockRows(db: DB, date: DateKey, nowMin: number, entries?: CalendarEntry[]): { rows: BlockRow[]; proposal?: Proposal } {
  const c = checkinOf(db, date)
  const { ctx } = dayContextFor(db, date, nowMin, entries)
  const byKey = new Map(rankCandidates(db, ctx, entries).map((x) => [x.key, x]))
  const rows: BlockRow[] = []
  for (const b of (c?.blocks ?? []).filter(live)) {
    const id = taskId(b.key)
    const task = id ? db.tasks.find((t) => t.id === id) : undefined
    if (id && (!task || task.status === 'archived')) continue // the entity is gone: nothing to show
    const done = b.status === 'feito' || task?.status === 'done'
    rows.push({ key: b.key, start: b.start, end: b.end, minutes: minutesOf(b), title: task?.title ?? byKey.get(b.key)?.title ?? b.title, state: done ? 'feito' : 'planejado', by: b.by, c: byKey.get(b.key) })
  }
  // Preview mode, or nothing applied yet today: show what the engine proposes, marked as suggestion.
  const showProposal = applyModeOf(db) === 'preview' || c?.blocks === undefined
  const proposal = showProposal ? propose(db, date, nowMin, entries) : undefined
  for (const b of proposal?.blocks ?? []) rows.push({ key: b.key, start: b.start, end: b.end, minutes: minutesOf(b), title: b.title, state: 'sugestao', by: 'motor', c: byKey.get(b.key) })
  return { rows: rows.sort((a, b) => a.start.localeCompare(b.start)), proposal }
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export interface Outcome {
  /** What she reads ("Reorganizei teu dia: …" or why nothing changed). */
  message: string
  changed: boolean
  undo?: () => void
}

const timeList = (bs: PlannedBlock[]) => bs.map((b) => `${b.title} às ${b.start}`).join(' · ')

function setBlocks(date: DateKey, next: PlannedBlock[], patch: Parameters<typeof saveDayCheckin>[1] = {}): () => void {
  return saveDayCheckin(date, { ...patch, blocks: next })
}

/** Applies the engine's proposal to the day (keeps everything already placed). */
export function applyProposal(date: DateKey, nowMin: number, entries?: CalendarEntry[]): Outcome {
  const db = getDB()
  const p = propose(db, date, nowMin, entries)
  const before = checkinOf(db, date)?.blocks
  if (!p.blocks.length) {
    if (before === undefined) setBlocks(date, [])
    return { message: emptyWhy(p), changed: false }
  }
  const undo = setBlocks(date, [...(before ?? []), ...p.blocks])
  return { message: `Coloquei no teu dia: ${timeList(p.blocks)}.`, changed: true, undo }
}

/** Replanejar o resto do dia: the engine's own future blocks are redone; hers and the done ones stay. */
export function replanRest(date: DateKey, nowMin: number, entries?: CalendarEntry[], patch: Parameters<typeof saveDayCheckin>[1] = {}): Outcome {
  const db = getDB()
  const c = checkinOf(db, date)
  const kept = (c?.blocks ?? []).filter((b) => !(b.by === 'motor' && b.status === 'planejado' && hmToMinutes(b.end) > nowMin))
  const dropped = (c?.blocks ?? []).filter((b) => !kept.includes(b))
  const undoBase = saveDayCheckin(date, { ...patch, blocks: kept })
  const p = propose(getDB(), date, nowMin, entries)
  saveDayCheckin(date, { blocks: [...kept, ...p.blocks] })
  const undo = () => undoBase()
  const was = new Set(dropped.map((b) => `${b.key}@${b.start}`))
  const same = p.blocks.length === dropped.length && p.blocks.every((b) => was.has(`${b.key}@${b.start}`))
  if (same) return { message: p.blocks.length ? 'Revi o resto do dia — o plano continua o melhor para agora.' : emptyWhy(p), changed: Object.keys(patch).length > 0, undo }
  const added = p.blocks.filter((b) => !dropped.some((d) => d.key === b.key))
  const removed = dropped.filter((d) => !p.blocks.some((b) => b.key === d.key))
  const parts = [added.length ? `entrou ${timeList(added)}` : '', removed.length ? `saiu ${removed.map((b) => b.title).join(' · ')}` : '', !added.length && !removed.length ? 'mudei os horários' : '']
  return { message: `Reorganizei o resto do dia: ${parts.filter(Boolean).join('; ')}.`, changed: true, undo }
}

/** "Tenho mais N minutos": more capacity → look for real free time and a fitting activity. */
export function addCapacity(date: DateKey, nowMin: number, extra: number, entries?: CalendarEntry[]): Outcome {
  const db = getDB()
  const { ctx } = dayContextFor(db, date, nowMin, entries)
  const freeMin = Math.max(0, ctx.freeMin + extra)
  const undoFree = logChange(date, 'day', extra > 0 ? 'mais_tempo' : 'menos_tempo', { freeMin })
  if (extra < 0) {
    // Less time: the engine's latest future blocks leave first; hers and fixed things are never touched.
    const c = checkinOf(getDB(), date)
    const blocks = [...(c?.blocks ?? [])]
    let over = -extra
    const removed: PlannedBlock[] = []
    for (const b of [...blocks].reverse()) {
      if (over <= 0) break
      if (b.by !== 'motor' || b.status !== 'planejado' || hmToMinutes(b.start) < nowMin) continue
      blocks.splice(blocks.indexOf(b), 1)
      removed.push(b)
      over -= minutesOf(b)
    }
    if (removed.length) saveDayCheckin(date, { blocks })
    return {
      message: removed.length ? `Menos ${formatMin(-extra)}: tirei ${removed.map((b) => b.title).join(' · ')} de hoje (continua no backlog).` : `Menos ${formatMin(-extra)} anotado — nada planejado precisou sair.`,
      changed: true,
      undo: () => {
        if (removed.length) saveDayCheckin(date, { blocks: c?.blocks })
        undoFree()
      },
    }
  }
  const p = propose(getDB(), date, nowMin, entries, freeMin)
  if (!p.blocks.length) return { message: `Agora tu tens mais ${formatMin(extra)} de capacidade. ${emptyWhy(p)}`, changed: true, undo: undoFree }
  const before = checkinOf(getDB(), date)?.blocks
  saveDayCheckin(date, { blocks: [...(before ?? []), ...p.blocks] })
  return {
    message: `Reorganizei teu planejamento: +${formatMin(extra)} disponíveis e encaixei ${timeList(p.blocks)}.`,
    changed: true,
    undo: () => {
      saveDayCheckin(date, { blocks: before })
      undoFree()
    },
  }
}

/** "Estou cansada": energy one step down; heavy engine blocks ahead give way to lighter ones. Fixed things stay. */
export function lowerEnergy(date: DateKey, nowMin: number, entries?: CalendarEntry[]): Outcome {
  const db = getDB()
  const { ctx } = dayContextFor(db, date, nowMin, entries)
  const energy = Math.max(1, ctx.energy - 1) as Energy
  const r = replanRest(date, nowMin, entries, { energy })
  return { ...r, message: `Energia ajustada para ${energy <= 2 ? 'baixa' : 'média'}. ${r.message} Descansar também vale — nada fixo foi mexido.` }
}

function emptyWhy(p: Proposal): string {
  if (p.empty === 'sem_espaco') return 'Não há uma janela livre na agenda que caiba o que faria sentido agora — não forcei nada.'
  if (p.budget < 10) return 'Teu tempo para coisas flexíveis já está ocupado com o que está planejado.'
  return 'Não encontrei uma atividade adequada para esse tempo — não vou inventar tarefa só para preencher.'
}

// ─── One block: Concluir · Replanejar · tirar · adiar · trocar ──────────────

function updateBlock(date: DateKey, key: string, patch: Partial<PlannedBlock>, extra?: PlannedBlock): () => void {
  const c = checkinOf(getDB(), date)
  const blocks = c?.blocks ?? []
  const exists = blocks.some((b) => b.key === key && live(b))
  const next = exists ? blocks.map((b) => (b.key === key && live(b) ? { ...b, ...patch } : b)) : extra ? [...blocks, { ...extra, ...patch }] : blocks
  return setBlocks(date, next)
}

/** Concluir: the entity itself is completed (task done / one StudySession); the block shows "feito". */
export function completeBlock(date: DateKey, row: Pick<BlockRow, 'key' | 'start' | 'end' | 'title' | 'minutes' | 'c'>): Outcome {
  const undos: (() => void)[] = []
  const id = taskId(row.key)
  if (id) {
    setTaskDone(id, true, date)
    undos.push(() => setTaskDone(id, false, date))
  } else if (row.c?.study && row.key !== 'study:review') {
    // One real session in Aprendizagem (deterministic id: concluding twice never counts twice).
    const sid = `plan:${date}:${row.key}`
    if (!getDB().studySessions.some((s) => s.id === sid)) {
      actions.create('studySessions', { id: sid, date, startTime: row.start, minutes: row.minutes, domain: row.c.study.domain, trackId: row.c.study.trackId, title: row.title, status: 'concluido', context: 'Bloco planejado na Home' } as never)
      undos.push(() => actions.remove('studySessions', sid))
    }
  }
  undos.push(updateBlock(date, row.key, { status: 'feito' }, { key: row.key, start: row.start, end: row.end, status: 'feito', by: 'motor', title: row.title, at: nowISO() }))
  undos.push(logChange(date, row.key, 'concluir'))
  return { message: `Feito ✓ ${row.title}`, changed: true, undo: () => undos.reverse().forEach((u) => u()) }
}

/** Replanejar: new time/length today (her decision — a later replan never moves it). */
export function moveBlock(date: DateKey, row: Pick<BlockRow, 'key' | 'title' | 'start' | 'end'>, start: string, minutes: number): Outcome {
  const end = minutesToHM(Math.min(24 * 60 - 1, hmToMinutes(start) + minutes))
  const undo = updateBlock(date, row.key, { start, end, by: 'marina' }, { key: row.key, start, end, status: 'planejado', by: 'marina', title: row.title, at: nowISO() })
  return { message: `${row.title}: ${start}–${end}.`, changed: true, undo }
}

/** Tirar de hoje / Trocar / Adiar (task → another day). The entity is never deleted. */
export function dropBlock(date: DateKey, row: Pick<BlockRow, 'key' | 'title'>, action: Extract<DayChangeAction, 'hoje_nao' | 'trocar' | 'adiar'>, to?: DateKey, nowMin?: number, entries?: CalendarEntry[]): Outcome {
  const undoBlock = updateBlock(date, row.key, { status: 'removido' })
  const undoLog = action === 'adiar' ? postpone(date, row.key, to ?? addDays(date, 1)) : logChange(date, row.key, action)
  let message = action === 'adiar' ? `${row.title} foi para ${to ?? 'amanhã'}.` : `${row.title} saiu de hoje (continua no backlog).`
  if (action === 'trocar' && nowMin !== undefined) {
    const r = applyProposal(date, nowMin, entries)
    message = r.changed ? `Troquei: ${r.message.replace(/^Coloquei no teu dia: /, '')}` : `${row.title} saiu. ${r.message}`
  }
  return {
    message,
    changed: true,
    undo: () => {
      undoLog()
      undoBlock()
    },
  }
}
