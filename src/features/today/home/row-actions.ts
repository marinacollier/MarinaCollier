/**
 * ONE tap on any line of the day: Concluir (or undo it) and Adiar para amanhã — whatever the line is
 * (a class, a Google event, a task, a planned block, a workout, a trip activity). Each action writes to
 * the line's own record, persists, and returns a sentence + Desfazer. Nothing is deleted.
 *
 * Limits, said out loud instead of faked:
 *  - a booked/paid trip activity is not moved by "Adiar" (the supplier wouldn't know) → say so;
 *  - a Google event can be marked "feito" here (that is hers), but it is moved in the Google Calendar;
 *  - a class can't be postponed — "Faltei" is in its detail.
 */
import { actions, getDB } from '@/data/store'
import type { CalendarEntry } from '@/data/calendar/universal'
import type { DateKey, DB } from '@/data/types'
import { addDays } from '@/lib/date'
import { occurrenceFor } from '@/lib/recurrence'
import { isTaskDoneOn } from '@/data/selectors'
import { setTaskDone } from '@/features/tasks/ops'
import { bookingStatusOf, bookingStatusPatch } from '@/features/travel/expedition/command'
import { canMove, markDone, moveEntry, patchWithUndo, quickSource } from '@/features/agenda/calendar/quick'
import { setTimeOn } from '@/data/schedule'
import { completeBlock, dropBlock, moveBlock, type BlockRow } from './allocation'
import type { DropSlot } from './drag'
import { checkinOf, postpone, saveDayCheckin } from './day-checkin'
import type { LooseRow } from './clean'

export type RowTarget = { kind: 'entry'; e: CalendarEntry; date: DateKey } | { kind: 'block'; b: BlockRow; date: DateKey } | { kind: 'loose'; r: LooseRow; date: DateKey }

export interface RowResult {
  message: string
  undo?: () => void
}

const BOOKED = new Set(['reserva_emitida', 'reservado', 'confirmado', 'aguardando_pagamento'])

/** The task behind a line, when there is one (task, deadline, follow-up, planned task block). */
function taskIdOf(t: RowTarget): string | undefined {
  if (t.kind === 'block') return t.b.key.startsWith('task:') ? t.b.key.slice(5) : undefined
  if (t.kind === 'loose') return t.r.open.kind === 'task' ? t.r.open.id : taskIdOf({ kind: 'entry', e: t.r.open.entry, date: t.date })
  const e = t.e
  if (e.sourceType === 'task' || e.sourceType === 'taskDeadline' || e.sourceType === 'waiting') return e.sourceId
  return undefined
}

export function isRowDone(_db: DB, t: RowTarget): boolean {
  if (t.kind === 'block') return t.b.state === 'feito'
  if (t.kind === 'loose') return !!t.r.done
  return t.e.status === 'feito'
}

/** Can this line be concluded with one tap? (Rituals open their checklist instead.) */
export function canComplete(t: RowTarget): boolean {
  if (t.kind !== 'entry') return true
  const e = t.e
  if (e.absent || e.masked) return false
  return ['school', 'event', 'task', 'tripItem', 'workout', 'taskDeadline', 'tripDeadline', 'waiting', 'meeting'].includes(e.sourceType)
}

/** Concluir (or, when already done, back to not done). */
export function toggleDone(t: RowTarget): RowResult {
  const db = getDB()
  const done = isRowDone(db, t)
  const tid = taskIdOf(t)
  if (t.kind === 'block') {
    if (!done) {
      const r = completeBlock(t.date, t.b)
      return { message: r.message, undo: r.undo }
    }
    const before = checkinOf(db, t.date)?.blocks
    saveDayCheckin(t.date, { blocks: (before ?? []).map((b) => (b.key === t.b.key && b.status === 'feito' ? { ...b, status: 'planejado' as const } : b)) })
    if (tid) setTaskDone(tid, false, t.date)
    const sid = `plan:${t.date}:${t.b.key}`
    const session = db.studySessions.find((s) => s.id === sid)
    if (session) actions.remove('studySessions', sid)
    return { message: `${t.b.title}: voltou para fazer.`, undo: () => (saveDayCheckin(t.date, { blocks: before }), tid && setTaskDone(tid, true, t.date), session && actions.create('studySessions', session)) }
  }
  if (tid) {
    const task = db.tasks.find((x) => x.id === tid)
    if (!task) return { message: 'Não achei essa tarefa.' }
    const now = isTaskDoneOn(db, task, t.date)
    setTaskDone(tid, !now, t.date)
    return { message: now ? `${task.title}: voltou para fazer.` : `Feito ✓ ${task.title}`, undo: () => setTaskDone(tid, now, t.date) }
  }
  const e = t.kind === 'entry' ? t.e : t.r.open.kind === 'entry' ? t.r.open.entry : undefined
  if (!e) return { message: 'Nada para concluir aqui.' }
  if (e.sourceType === 'school') {
    const tripId = e.id.slice('school:'.length, e.id.lastIndexOf(':'))
    actions.toggleOccurrence('school', tripId, t.date)
    const on = occurrenceFor(getDB().occurrences, 'school', tripId, t.date)?.status === 'done'
    return { message: on ? 'Aula marcada como feita ✓' : 'Aula: voltou para não marcada.', undo: () => actions.toggleOccurrence('school', tripId, t.date) }
  }
  if (e.sourceType === 'event') {
    // Any event — hers or synced from Google — can be "feito" on that day (that part is hers).
    actions.toggleOccurrence('event', e.sourceId, t.date)
    const on = occurrenceFor(getDB().occurrences, 'event', e.sourceId, t.date)?.status === 'done'
    return { message: on ? `Feito ✓ ${e.title}` : `${e.title}: voltou para não feito.`, undo: () => actions.toggleOccurrence('event', e.sourceId, t.date) }
  }
  if (e.sourceType === 'workout' && e.sourceId.startsWith('template:')) {
    // A suggested session of the week template becomes a real workout she did.
    const [, tplId] = e.sourceId.split(':')
    const tpl = db.weekTemplate.find((x) => x.id === tplId)
    const made = actions.create('workouts', { date: t.date, modality: tpl?.modalities[0] ?? 'outro', title: e.title, status: 'feito', templateId: tplId, order: 0, time: e.startAt.time } as never)
    return { message: `Treino feito ✓ ${e.title}`, undo: () => actions.remove('workouts', made.id) }
  }
  if (e.sourceType === 'tripDeadline' || e.sourceType === 'tripItem') {
    const i = db.tripItems.find((x) => x.id === e.sourceId)
    if (!i) return { message: 'Não achei esse item da viagem.' }
    if (done) {
      const back = i.confirmationCode || i.paymentStatus === 'pago' ? 'confirmado' : 'planejado'
      const undo = patchWithUndo('tripItems', i.id, bookingStatusPatch(back))
      return { message: `${i.title}: voltou para ${back}.`, undo }
    }
    const undo = patchWithUndo('tripItems', i.id, bookingStatusPatch('concluido'))
    return { message: `Feito ✓ ${i.title}`, undo }
  }
  const src = quickSource(db, e)
  if (!src) return { message: 'Esse item não pode ser concluído por aqui.' }
  if (done && src.key === 'workouts') {
    const undo = patchWithUndo('workouts', src.rec.id, { status: 'planejado' })
    return { message: `${e.title}: voltou para planejado.`, undo }
  }
  const undo = markDone(src, t.date)
  return { message: `Feito ✓ ${e.title}`, undo }
}

/** Adiar para amanhã (when it makes sense for that kind of line); `undefined` = not for this line. */
export function postponeRow(t: RowTarget): RowResult {
  const db = getDB()
  const tomorrow = addDays(t.date, 1)
  if (t.kind === 'block') {
    const r = dropBlock(t.date, t.b, t.b.key.startsWith('task:') ? 'adiar' : 'hoje_nao', tomorrow)
    return { message: t.b.key.startsWith('task:') ? r.message : `${t.b.title} saiu de hoje — o motor volta a propor amanhã.`, undo: r.undo }
  }
  const tid = taskIdOf(t)
  if (tid) {
    const task = db.tasks.find((x) => x.id === tid)
    const undo = postpone(t.date, `task:${tid}`, tomorrow)
    return { message: `${task?.title ?? 'Tarefa'} foi para amanhã.`, undo }
  }
  const e = t.kind === 'entry' ? t.e : t.r.open.kind === 'entry' ? t.r.open.entry : undefined
  if (!e) return { message: 'Nada para adiar aqui.' }
  if (e.sourceType === 'school') return { message: 'Aula não se adia — se não foste, use “Faltei” no detalhe.' }
  if (e.sourceType === 'tripItem' || e.sourceType === 'tripDeadline') {
    const i = db.tripItems.find((x) => x.id === e.sourceId)
    if (i && (BOOKED.has(bookingStatusOf(i)) || i.paymentStatus === 'pago')) return { message: `${i.title} é uma reserva — mudar a data aqui não muda com o fornecedor. Remarque com eles e depois ajuste no detalhe.` }
  }
  const src = quickSource(db, e)
  if (!src) return { message: e.sourceType === 'event' ? 'Evento do Google: mude a data no Google Calendar — aqui atualiza sozinho.' : 'Esse item não pode ser adiado por aqui.' }
  const undo = moveEntry(src, tomorrow, e.startAt.time)
  return { message: `${e.title} foi para amanhã${e.startAt.time ? ` às ${e.startAt.time}` : ''}.`, undo }
}

export function canPostpone(t: RowTarget): boolean {
  if (t.kind !== 'entry') return true
  return !['school', 'meeting'].includes(t.e.sourceType) && !t.e.absent
}

// ─── Arrastar (mudar o horário no mesmo dia) ────────────────────────────────

/**
 * What dropping a line at a new time does:
 *  - move: hers to move → `run()` writes it (with undo);
 *  - confirm: a fixed commitment (a booking, a flight, a meeting) → only after "mover mesmo assim";
 *  - blocked: can't be moved from here (Google is read-only here, a class follows the school) → a sentence, nothing written.
 */
export type MovePlan = { kind: 'move'; run: () => RowResult } | { kind: 'confirm'; message: string; run: () => RowResult } | { kind: 'blocked'; message: string }

export const GOOGLE_READ_ONLY = 'Evento do Google Calendar: mude no Google — aqui atualiza sozinho.'
export const FIXED_CONFIRM = 'É uma reserva/compromisso fixo — mover mesmo assim?'
const CANT_MOVE = 'Esse item não pode ser movido por aqui.'
const FIXED_SECTIONS = new Set(['voo', 'hospedagem'])

export function planMove(t: Exclude<RowTarget, { kind: 'loose' }>, slot: DropSlot): MovePlan {
  const say = (title: string, undo: () => void): RowResult => ({ message: `${title} → ${slot.start}`, undo })
  if (t.kind === 'block') {
    const b = t.b
    return { kind: 'move', run: () => say(b.title, moveBlock(t.date, b, slot.start, b.minutes).undo ?? (() => {})) }
  }
  const e = t.e
  if (!e.startAt.time || e.allDay) return { kind: 'blocked', message: 'Esse item não tem horário para mudar.' }
  if (e.masked) return { kind: 'blocked', message: CANT_MOVE }
  const db = getDB()
  if (e.sourceType === 'event') {
    const rec = db.events.find((x) => x.id === e.sourceId)
    const src = rec && db.calendarSources.find((s) => s.id === rec.sourceId)
    if (!rec || rec.external || (src && src.provider !== 'local')) return { kind: 'blocked', message: GOOGLE_READ_ONLY }
    // Recurring: only that day changes (an override); the rule keeps its time.
    if (rec.recurrence) return { kind: 'move', run: () => say(e.title, setTimeOn(t.date, { type: 'event', id: rec.id }, slot.start)) }
  }
  if (e.sourceType === 'school') return { kind: 'blocked', message: 'Aula segue o horário da escola — se mudou, ajuste na escola da viagem.' }
  // Tasks and workouts: the schedule engine (a one-off record gets its time; a recurring one, that day only).
  if (e.sourceType === 'task') return { kind: 'move', run: () => say(e.title, setTimeOn(t.date, { type: 'task', id: e.sourceId }, slot.start)) }
  if (e.sourceType === 'workout') {
    const ref = e.sourceId.startsWith('template:') ? ({ type: 'weekTemplate', id: e.sourceId.split(':')[1] } as const) : ({ type: 'workout', id: e.sourceId } as const)
    return { kind: 'move', run: () => say(e.title, setTimeOn(t.date, ref, slot.start)) }
  }
  const src = quickSource(db, e)
  if (!src) return { kind: 'blocked', message: CANT_MOVE }
  if (src.key === 'tripItems') {
    const i = src.rec
    const fixed = FIXED_SECTIONS.has(i.section) || BOOKED.has(bookingStatusOf(i)) || BOOKED.has(i.bookingStatus ?? '') || i.paymentStatus === 'pago'
    // A stay spans days: only its check-in time changes (the check-out stays as it is).
    const run = i.section === 'hospedagem' ? () => say(e.title, patchWithUndo('tripItems', i.id, { time: slot.start })) : () => say(e.title, moveEntry(src, t.date, slot.start))
    return fixed ? { kind: 'confirm', message: FIXED_CONFIRM, run } : { kind: 'move', run }
  }
  if (!canMove(src)) return { kind: 'blocked', message: CANT_MOVE }
  const run = () => say(e.title, moveEntry(src, t.date, slot.start))
  return src.key === 'meetings' ? { kind: 'confirm', message: FIXED_CONFIRM, run } : { kind: 'move', run }
}
