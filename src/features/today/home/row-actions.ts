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
import { markDone, moveEntry, patchWithUndo, quickSource } from '@/features/agenda/calendar/quick'
import { completeBlock, dropBlock, type BlockRow } from './allocation'
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
