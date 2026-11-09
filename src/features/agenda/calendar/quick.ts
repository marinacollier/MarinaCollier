/**
 * First-level actions of the entry detail (no form): move, done, cancel, confirm, prep task, postpone, retag.
 * Each one writes to the SOURCE record in its own vocabulary and returns an undo ("Desfazer").
 * Nothing is deleted (cancel = status) and nothing is marked paid/booked implicitly: a trip item only
 * changes status through `bookingStatusPatch`, the same helper the trip screens use.
 */
import { actions, getDB, nextOrder } from '@/data/store'
import type { CalendarEvent, DateKey, DB, EntryKind, ID, Meeting, Task, TimeHM, TripItem, Workout } from '@/data/types'
import type { CalendarEntry } from '@/data/calendar/universal'
import { upsertOverride } from '@/data/schedule'
import { isTaskDoneOn } from '@/data/selectors'
import { occurrenceFor } from '@/lib/recurrence'
import { diffDays, addDays, hmToMinutes, minutesToHM } from '@/lib/date'
import { setTaskDone } from '@/features/tasks/ops'
import { bookingStatusPatch } from '@/features/travel/expedition/command'

export type Undo = () => void

/** The record behind an entry that these actions may write to. */
export type QuickSource =
  | { key: 'events'; rec: CalendarEvent }
  | { key: 'tasks'; rec: Task }
  | { key: 'tripItems'; rec: TripItem }
  | { key: 'workouts'; rec: Workout }
  | { key: 'meetings'; rec: Meeting }

type Key = QuickSource['key']

/** Editable here: her own records (not external events, not the weekly template, not a private masked line). */
export function quickSource(db: DB, e: CalendarEntry): QuickSource | undefined {
  if (e.masked) return undefined
  switch (e.sourceType) {
    case 'event': {
      const rec = db.events.find((x) => x.id === e.sourceId)
      if (!rec || rec.external) return undefined
      const src = db.calendarSources.find((s) => s.id === rec.sourceId)
      if (src && src.provider !== 'local') return undefined
      return { key: 'events', rec }
    }
    case 'task': {
      const rec = db.tasks.find((x) => x.id === e.sourceId)
      return rec ? { key: 'tasks', rec } : undefined
    }
    case 'tripItem': {
      const rec = db.tripItems.find((x) => x.id === e.sourceId)
      return rec ? { key: 'tripItems', rec } : undefined
    }
    case 'workout': {
      const rec = db.workouts.find((x) => x.id === e.sourceId)
      return rec ? { key: 'workouts', rec } : undefined
    }
    case 'meeting': {
      const rec = (db.meetings ?? []).find((x) => x.id === e.sourceId)
      return rec && !rec.external ? { key: 'meetings', rec } : undefined
    }
    default:
      return undefined
  }
}

/** Writes `patch` and returns the undo that puts back exactly the touched fields. */
export function patchWithUndo(key: Key, id: ID, patch: Record<string, unknown>): Undo {
  const rec = (getDB()[key] as unknown as Record<string, unknown>[]).find((r) => r.id === id)
  if (!rec) return () => {}
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, rec[k]]))
  actions.update(key, id, patch as never)
  return () => actions.update(key, id, before as never)
}

const isRecurring = (s: QuickSource) => (s.key === 'events' || s.key === 'tasks') && !!s.rec.recurrence

/** "Mudar dia/hora" fits records with one date of their own (not a recurring rule, not a stay of many days). */
export function canMove(s: QuickSource): boolean {
  if (isRecurring(s)) return false
  if (s.key === 'tripItems' && s.rec.section === 'hospedagem') return false
  return true
}

const shiftHM = (hm: TimeHM | undefined, delta: number): TimeHM | undefined => (hm ? minutesToHM(Math.max(0, Math.min(23 * 60 + 59, hmToMinutes(hm) + delta))) : undefined)

/** Moves the record to another day/time; an end date/time keeps its distance from the start. */
export function moveEntry(s: QuickSource, date: DateKey, time: TimeHM | undefined): Undo {
  const r = s.rec
  switch (s.key) {
    case 'events': {
      const e = s.rec
      const days = diffDays(e.date, date)
      const delta = e.startTime && time ? hmToMinutes(time) - hmToMinutes(e.startTime) : 0
      return patchWithUndo('events', r.id, {
        date,
        endDate: e.endDate ? addDays(e.endDate, days) : undefined,
        ...(e.allDay ? {} : { startTime: time, endTime: time ? (e.startTime ? shiftHM(e.endTime, delta) : undefined) : undefined }),
      })
    }
    case 'tripItems': {
      const i = s.rec
      const delta = i.time && time ? hmToMinutes(time) - hmToMinutes(i.time) : 0
      return patchWithUndo('tripItems', r.id, {
        date,
        time,
        endDate: i.endDate && i.date ? addDays(i.endDate, diffDays(i.date, date)) : i.endDate,
        endTime: time ? (i.time ? shiftHM(i.endTime, delta) : undefined) : undefined,
      })
    }
    case 'tasks':
      return patchWithUndo('tasks', r.id, { date, time })
    case 'workouts':
      return patchWithUndo('workouts', r.id, { date, time })
    case 'meetings': {
      const m = s.rec
      const delta = m.startTime && time ? hmToMinutes(time) - hmToMinutes(m.startTime) : 0
      return patchWithUndo('meetings', r.id, { date, startTime: time, endTime: time && m.startTime ? shiftHM(m.endTime, delta) : undefined })
    }
  }
}

/** "Feito" in the source's own words: occurrence done, task done, CONCLUÍDO, treino feito. */
export function canMarkDone(s: QuickSource): boolean {
  return s.key !== 'meetings'
}

export function markDone(s: QuickSource, date: DateKey): Undo {
  switch (s.key) {
    case 'events': {
      const id = s.rec.id
      if (occurrenceFor(getDB().occurrences, 'event', id, date)?.status === 'done') return () => {}
      actions.toggleOccurrence('event', id, date)
      return () => {
        if (occurrenceFor(getDB().occurrences, 'event', id, date)?.status === 'done') actions.toggleOccurrence('event', id, date)
      }
    }
    case 'tasks': {
      const id = s.rec.id
      if (isTaskDoneOn(getDB(), s.rec, date)) return () => {}
      setTaskDone(id, true, date)
      return () => setTaskDone(id, false, date)
    }
    case 'tripItems':
      return patchWithUndo('tripItems', s.rec.id, bookingStatusPatch('concluido'))
    case 'workouts':
      return patchWithUndo('workouts', s.rec.id, { status: 'feito' })
    case 'meetings':
      return () => {}
  }
}

/** "Cancelar": a status, never a delete. One day of something recurring only. */
export function cancelEntry(s: QuickSource, date: DateKey): Undo {
  switch (s.key) {
    case 'events':
      if (s.rec.recurrence) return patchWithUndo('events', s.rec.id, { exdates: [...new Set([...(s.rec.exdates ?? []), date])].sort() })
      return upsertOverride(date, { type: 'event', id: s.rec.id }, { cancelled: true })
    case 'tasks':
      if (s.rec.recurrence) return upsertOverride(date, { type: 'task', id: s.rec.id }, { cancelled: true })
      return patchWithUndo('tasks', s.rec.id, { status: 'archived' })
    case 'tripItems':
      return patchWithUndo('tripItems', s.rec.id, bookingStatusPatch('cancelado'))
    case 'workouts':
      return patchWithUndo('workouts', s.rec.id, { status: 'pulado' })
    case 'meetings':
      return () => {}
  }
}

export const canCancel = (s: QuickSource) => s.key !== 'meetings'

/** Meeting "Confirmar": confirmed, with no booking language and no payment touched. */
export function confirmEntry(s: QuickSource): Undo {
  switch (s.key) {
    case 'events':
      return patchWithUndo('events', s.rec.id, { planType: 'fixo' })
    case 'tasks':
      return patchWithUndo('tasks', s.rec.id, { planType: 'fixo', status: s.rec.status === 'review' ? 'todo' : s.rec.status })
    case 'tripItems':
      return patchWithUndo('tripItems', s.rec.id, bookingStatusPatch('confirmado'))
    default:
      return () => {}
  }
}

export const canConfirm = (s: QuickSource) => s.key === 'events' || s.key === 'tasks' || s.key === 'tripItems'

/** Tag that links a prep task to its entry (one prep task per entry). */
export const prepTag = (e: CalendarEntry) => `preparo:${e.id}`

export function prepTaskOf(db: DB, e: CalendarEntry): Task | undefined {
  const tag = prepTag(e)
  return db.tasks.find((t) => t.tags?.includes(tag) && t.status !== 'archived')
}

/** "Criar tarefa de preparo": one task for today, linked to the entry (tags + notes). */
export function createPrepTask(s: QuickSource | undefined, e: CalendarEntry, today: DateKey): { task: Task; undo: Undo } | undefined {
  const db = getDB()
  if (prepTaskOf(db, e)) return undefined
  const tripId = s?.key === 'tripItems' ? s.rec.tripId : s?.key === 'events' || s?.key === 'tasks' ? s.rec.tripId : undefined
  const task = actions.create('tasks', {
    title: `Preparar: ${e.title}`,
    status: 'todo',
    date: today,
    notes: `Preparo para “${e.title}” (${e.startAt.date.split('-').reverse().join('/')}${e.startAt.time ? ` · ${e.startAt.time}` : ''}).`,
    tags: ['preparo', prepTag(e)],
    tripId,
    projectId: e.linkedProjectId,
    order: nextOrder(db.tasks),
  })
  return { task, undo: () => actions.remove('tasks', task.id) }
}

/** Task "Adiar para amanhã". */
export function postponeTask(s: QuickSource, from: DateKey): Undo {
  if (s.key !== 'tasks') return () => {}
  return patchWithUndo('tasks', s.rec.id, { date: addDays(from, 1), postponedFrom: from })
}

/** "Mudar tipo": her retag on the record (undefined = back to the derived tipo). */
export const canRetag = (s: QuickSource) => s.key === 'events' || s.key === 'tasks' || s.key === 'tripItems'

export function setEntryKind(s: QuickSource, kind: EntryKind | undefined): Undo {
  if (!canRetag(s)) return () => {}
  return patchWithUndo(s.key, s.rec.id, { entryKind: kind })
}
