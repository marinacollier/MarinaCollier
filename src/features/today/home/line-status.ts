/**
 * ONE vocabulary for every line of the day — class, Google event, task, planned block, workout, trip activity, routine:
 *   concluído · parcial · faltei · replanejado   (+ editar, excluir)
 *
 * "Concluído" writes to the line's own record (row-actions `toggleDone`). The other three are about THAT day and
 * live in an Occurrence of the line (parentType 'item', keyed by the line), so nothing is invented in the source:
 *   parcial → status 'partial' · faltei → 'skipped' (a class uses the school absence record) · replanejado → 'moved'
 *   on the NEW day ("veio de 11/11 09:00"). Every action returns a sentence + Desfazer. Fixed things are never
 *   moved or deleted silently: Google is read-only here, a class follows the school, a booking asks first.
 */
import { actions, getDB } from '@/data/store'
import type { DateKey, DB, Occurrence, TimeHM } from '@/data/types'
import { formatDayMonth } from '@/lib/date'
import { markAbsence, unmarkAbsence } from '@/features/travel/expedition/absence'
import { bookingStatusPatch } from '@/features/travel/expedition/command'
import { moveEntry, patchWithUndo, quickSource } from '@/features/agenda/calendar/quick'
import { dropBlock, moveBlock } from './allocation'
import { isRowDone, planMove, toggleDone, GOOGLE_READ_ONLY, type RowResult, type RowTarget } from './row-actions'

export type LineState = 'parcial' | 'faltei' | 'replanejado'
const TO_STATUS: Record<LineState, Occurrence['status']> = { parcial: 'partial', faltei: 'skipped', replanejado: 'moved' }
const FROM_STATUS: Partial<Record<Occurrence['status'], LineState>> = { partial: 'parcial', skipped: 'faltei', moved: 'replanejado' }

/** Stable key of a line (independent of the day), so its state follows it. */
export function lineKey(t: RowTarget | { kind: 'routine'; id: string; date: DateKey }): string {
  if (t.kind === 'routine') return `routine:${t.id}`
  if (t.kind === 'block') return t.b.key.startsWith('task:') ? t.b.key : `block:${t.b.key}`
  if (t.kind === 'loose') return t.r.open.kind === 'task' ? `task:${t.r.open.id}` : `${t.r.open.entry.sourceType}:${t.r.open.entry.sourceId}`
  return t.e.sourceType === 'task' ? `task:${t.e.sourceId}` : `${t.e.sourceType}:${t.e.sourceId}`
}

const occOf = (db: Pick<DB, 'occurrences'>, key: string, date: DateKey) => db.occurrences.find((o) => o.parentType === 'item' && o.parentId === key && o.date === date)

/** The day's state of a line (besides "concluído", which belongs to the record itself). */
export function lineStateOf(db: Pick<DB, 'occurrences'>, key: string, date: DateKey): LineState | undefined {
  const o = occOf(db, key, date)
  return o ? FROM_STATUS[o.status] : undefined
}

/** Writes (or clears, with `undefined`) the day's state; returns the undo. */
function writeState(key: string, date: DateKey, s: LineState | undefined, note?: string): () => void {
  const before = occOf(getDB(), key, date)
  if (before) actions.remove('occurrences', before.id)
  const made = s ? actions.create('occurrences', { parentType: 'item', parentId: key, date, status: TO_STATUS[s], ...(note ? { note } : {}) } as never) : undefined
  return () => {
    if (made) actions.remove('occurrences', (made as Occurrence).id)
    if (before) actions.create('occurrences', before as never)
  }
}

const titleOf = (t: RowTarget) => (t.kind === 'block' ? t.b.title : t.kind === 'loose' ? t.r.title : t.e.title)

/** Parcial / Faltei (toggle: choosing the current one clears it). A done line stops being done first. */
export function setLineState(t: RowTarget, s: 'parcial' | 'faltei'): RowResult {
  const key = lineKey(t)
  const title = titleOf(t)
  const current = lineStateOf(getDB(), key, t.date)
  const undos: (() => void)[] = []
  if (isRowDone(getDB(), t)) {
    const r = toggleDone(t)
    if (r.undo) undos.push(r.undo)
  }
  // A class: "faltei" is the school absence (the counter and the trip already know it).
  if (s === 'faltei' && t.kind === 'entry' && t.e.sourceType === 'school') {
    const tripId = t.e.sourceId
    if (t.e.absent) {
      unmarkAbsence(tripId, t.date)
      return { message: 'Falta desfeita: aula de volta', undo: () => markAbsence(tripId, t.date) }
    }
    markAbsence(tripId, t.date)
    return { message: 'Falta registrada', undo: () => (unmarkAbsence(tripId, t.date), undos.forEach((u) => u())) }
  }
  const next = current === s ? undefined : s
  undos.unshift(writeState(key, t.date, next))
  const message = next === 'parcial' ? `${title}: parcial` : next === 'faltei' ? `${title}: não rolou hoje` : `${title}: voltou para fazer`
  return { message, undo: () => undos.forEach((u) => u()) }
}

export type ReschedulePlan = { kind: 'ok'; run: () => RowResult } | { kind: 'confirm'; message: string; run: () => RowResult } | { kind: 'blocked'; message: string }

/** Replanejar: another time today, or another day (with or without a time). The line gets "replanejado" there. */
export function planReschedule(t: Exclude<RowTarget, { kind: 'loose' }> | Extract<RowTarget, { kind: 'loose' }>, toDate: DateKey, toTime?: TimeHM): ReschedulePlan {
  const key = lineKey(t)
  const from = `${formatDayMonth(t.date)}${t.kind === 'entry' && t.e.startAt.time ? ` ${t.e.startAt.time}` : t.kind === 'block' ? ` ${t.b.start}` : ''}`
  const mark = (r: RowResult): RowResult => {
    const u = writeState(key, toDate, 'replanejado', `veio de ${from}`)
    const when = `${toDate === t.date ? 'hoje' : formatDayMonth(toDate)}${toTime ? ` às ${toTime}` : ''}`
    return { message: `${titleOf(t)} → ${when}`, undo: () => (u(), r.undo?.()) }
  }
  // Same day with a time: exactly what dragging does (fixed things ask / are blocked).
  if (toDate === t.date && toTime && t.kind !== 'loose') {
    const p = planMove(t, { start: toTime })
    if (p.kind === 'blocked') return p
    return p.kind === 'confirm' ? { kind: 'confirm', message: p.message, run: () => mark(p.run()) } : { kind: 'ok', run: () => mark(p.run()) }
  }
  const db = getDB()
  // Tasks (also a planned task block, or a loose task): the task's own day/time.
  const taskId = key.startsWith('task:') ? key.slice(5) : undefined
  if (taskId && db.tasks.some((x) => x.id === taskId)) {
    return { kind: 'ok', run: () => mark({ message: '', undo: patchWithUndo('tasks', taskId, { date: toDate, ...(toTime ? { time: toTime } : {}) }) }) }
  }
  if (t.kind === 'block') {
    if (toDate !== t.date) return { kind: 'ok', run: () => mark({ message: '', undo: dropBlock(t.date, t.b, 'adiar', toDate).undo }) }
    return { kind: 'ok', run: () => mark({ message: '', undo: moveBlock(t.date, t.b, toTime ?? t.b.start, t.b.minutes).undo }) }
  }
  const e = t.kind === 'entry' ? t.e : t.r.open.kind === 'entry' ? t.r.open.entry : undefined
  if (!e) return { kind: 'blocked', message: 'Esse item não pode ser replanejado por aqui.' }
  if (e.sourceType === 'school') return { kind: 'blocked', message: 'Aula segue o horário da escola — se não foi, use “Faltei”.' }
  if (e.sourceType === 'event') {
    const rec = db.events.find((x) => x.id === e.sourceId)
    if (!rec || rec.external) return { kind: 'blocked', message: GOOGLE_READ_ONLY }
  }
  const src = quickSource(db, e)
  if (!src) return { kind: 'blocked', message: 'Esse item não pode ser replanejado por aqui.' }
  const run = () => mark({ message: '', undo: moveEntry(src, toDate, toTime ?? e.startAt.time) })
  const booked = src.key === 'tripItems' && (src.rec.paymentStatus === 'pago' || ['reservado', 'reserva_emitida', 'confirmado'].includes(src.rec.bookingStatus ?? '') || ['voo', 'hospedagem'].includes(src.rec.section))
  return booked ? { kind: 'confirm', message: 'É uma reserva — mudar a data aqui não muda com o fornecedor. Replanejar mesmo assim?', run } : { kind: 'ok', run }
}

export type DeletePlan = { kind: 'ok'; label: string; run: () => RowResult } | { kind: 'blocked'; message: string }

/** Excluir: what it means for this kind of line (a booking is cancelled — kept in history —, never erased). */
export function planDelete(t: RowTarget): DeletePlan {
  const db = getDB()
  const key = lineKey(t)
  const title = titleOf(t)
  const taskId = key.startsWith('task:') ? key.slice(5) : undefined
  const task = taskId ? db.tasks.find((x) => x.id === taskId) : undefined
  if (task) {
    return {
      kind: 'ok',
      label: 'Excluir tarefa',
      run: () => {
        actions.remove('tasks', task.id)
        return { message: `${title} excluída`, undo: () => void actions.create('tasks', task as never) }
      },
    }
  }
  if (t.kind === 'block') return { kind: 'ok', label: 'Tirar do dia', run: () => ({ message: `${title} saiu de hoje`, undo: dropBlock(t.date, t.b, 'hoje_nao').undo }) }
  const e = t.kind === 'entry' ? t.e : t.r.open.kind === 'entry' ? t.r.open.entry : undefined
  if (!e) return { kind: 'blocked', message: 'Esse item não pode ser excluído por aqui.' }
  if (e.sourceType === 'school') return { kind: 'blocked', message: 'Aula vem da escola — se não foi, use “Faltei”.' }
  if (e.sourceType === 'event') {
    const rec = db.events.find((x) => x.id === e.sourceId)
    if (!rec || rec.external) return { kind: 'blocked', message: 'Evento do Google Calendar: exclua no Google — aqui some sozinho.' }
    if (rec.recurrence) return { kind: 'blocked', message: 'Evento que se repete: use “Faltei” para hoje ou edite a repetição.' }
    return {
      kind: 'ok',
      label: 'Excluir evento',
      run: () => {
        actions.remove('events', rec.id)
        return { message: `${title} excluído`, undo: () => void actions.create('events', rec as never) }
      },
    }
  }
  if (e.sourceType === 'tripItem') {
    const i = db.tripItems.find((x) => x.id === e.sourceId)
    if (!i) return { kind: 'blocked', message: 'Não achei esse item da viagem.' }
    return { kind: 'ok', label: 'Cancelar (fica no histórico)', run: () => ({ message: `${title} cancelado — fica no histórico da viagem`, undo: patchWithUndo('tripItems', i.id, bookingStatusPatch('cancelado')) }) }
  }
  if (e.sourceType === 'workout' && !e.sourceId.startsWith('template:')) {
    const w = db.workouts.find((x) => x.id === e.sourceId)
    if (w)
      return {
        kind: 'ok',
        label: 'Excluir treino',
        run: () => {
          actions.remove('workouts', w.id)
          return { message: `${title} excluído`, undo: () => void actions.create('workouts', w as never) }
        },
      }
  }
  return { kind: 'blocked', message: 'Esse item não pode ser excluído por aqui — use “Faltei” para hoje.' }
}

/** Routine line: "concluído" = every item of the day ticked; "faltei" = the day's state (items untouched). */
export function routineDone(itemIds: string[], date: DateKey, done: boolean): RowResult {
  const db = getDB()
  const changed: string[] = []
  for (const id of itemIds) {
    const on = db.occurrences.some((o) => o.parentType === 'routineItem' && o.parentId === id && o.date === date && o.status === 'done')
    if (on !== done) {
      actions.toggleOccurrence('routineItem', id, date)
      changed.push(id)
    }
  }
  return { message: done ? 'Rotina concluída ✓' : 'Rotina: voltou para fazer', undo: () => changed.forEach((id) => actions.toggleOccurrence('routineItem', id, date)) }
}

export function routineState(routineId: string, date: DateKey, s: 'faltei' | undefined): RowResult {
  const u = writeState(`routine:${routineId}`, date, s)
  return { message: s ? 'Rotina: não rolou hoje' : 'Rotina: voltou para fazer', undo: u }
}
