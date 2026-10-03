/**
 * UI glue for the Linha do dia: check / open / time edits with a "Desfazer" toast.
 * The rules live in data/schedule.ts + data/timeline.ts; this only wires them to taps.
 */
import { openSheet, toast } from '@/app/ui-store'
import { actions, getDB } from '@/data/store'
import { applyOps, cancelOn, clearOverride, planSetDefault, setAnytimeOn, setTimeOn, type Undo } from '@/data/schedule'
import { overrideFor, slotForTime, type ScheduleRef } from '@/data/timeline'
import type { DateKey, TimeHM, TimelineEntry } from '@/data/types'
import { emptyPlanData } from '@/data/mealprep'
import { startOfWeek } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'
import { occurrenceFor } from '@/lib/recurrence'
import { toggleItem, toggleStep } from '../routine'

export function undoToast(message: string, undo: Undo) {
  toast(message, { action: { label: 'Desfazer', run: undo } })
}

/** Stamp the real completion time on an Occurrence created by toggleOccurrence. */
function stampOccurrence(parentType: 'task' | 'petTask', id: string, date: DateKey) {
  const occ = occurrenceFor(getDB().occurrences, parentType, id, date)
  if (occ) actions.update('occurrences', occ.id, { completedAt: nowISO() })
}

/** Check / uncheck a row. Returns the new done state (undefined when the row isn't checkable). */
export function toggleEntry(e: TimelineEntry): boolean | undefined {
  const db = getDB()
  let done: boolean | undefined
  if (e.ref.type === 'routineItem') {
    const item = db.routineItems.find((i) => i.id === e.ref.id)
    if (item) done = toggleItem(item, e.date)
  } else if (e.ref.type === 'routineStep') {
    const [itemId, idx] = e.ref.id.split('#')
    const item = db.routineItems.find((i) => i.id === itemId)
    if (item) {
      toggleStep(item, Number(idx), e.date)
      done = e.status !== 'done'
    }
  } else if (e.ref.type === 'task') {
    const t = db.tasks.find((x) => x.id === e.ref.id)
    if (t?.recurrence) {
      done = actions.toggleOccurrence('task', t.id, e.date)
      if (done) stampOccurrence('task', t.id, e.date)
    } else if (t) {
      done = t.status !== 'done'
      actions.update('tasks', t.id, done ? { status: 'done', completedAt: nowISO() } : { status: 'todo', completedAt: undefined })
    }
  } else if (e.ref.type === 'petTask') {
    done = actions.toggleOccurrence('petTask', e.ref.id, e.date)
    if (done) stampOccurrence('petTask', e.ref.id, e.date)
  } else if (e.ref.type === 'mealPrep') {
    // Prep keys carry their own date ('mealprep:<date>:<slug>'); the tick lives in that week's plan.
    const week = startOfWeek(e.ref.id.split(':')[1] ?? e.date)
    const plan = db.mealPrepPlans.find((p) => p.weekStart === week) ?? actions.create('mealPrepPlans', emptyPlanData(week, 'marina'))
    done = !plan.checked.includes(e.ref.id)
    actions.update('mealPrepPlans', plan.id, { checked: done ? [...plan.checked, e.ref.id] : plan.checked.filter((k) => k !== e.ref.id) })
  }
  if (done) haptic('success')
  return done
}

/** Tap on a row that isn't a checkbox: open its own flow. */
export function openEntryFlow(e: TimelineEntry, today: DateKey) {
  const db = getDB()
  haptic('light')
  switch (e.ref.type) {
    case 'workout':
      return openSheet(e.date > today ? 'workout' : 'workoutLog', { id: e.ref.id } as never)
    case 'weekTemplate': {
      const t = db.weekTemplate.find((x) => x.id === e.ref.id)
      return openSheet('workout', {
        date: e.date,
        defaults: t ? { modality: t.modalities[0], time: e.start, title: t.title, plannedDurationMin: t.durationMin, planType: t.planType, templateId: t.id, tags: t.tags } : { time: e.start },
      })
    }
    case 'planMeal': {
      const eaten = e.ref.id.startsWith('meal:') ? db.meals.find((m) => m.id === e.ref.id.slice(5)) : db.meals.find((m) => m.date === e.date && m.planMealRef === e.ref.id)
      if (eaten) return openSheet('meal', { id: eaten.id })
      const w = db.workouts.find((x) => x.date === e.date && x.status !== 'pulado' && x.status !== 'descanso')
      // A planned meal opens its detail (plan, trocas, comi, Lumos); fuel around a training opens the fuel sheet.
      if (!e.ref.id.startsWith('meal:') && e.ref.id.includes('#')) return openSheet('mealDetail', { date: e.date, ref: e.ref.id })
      if (e.phase && e.phase !== 'refeicao' && w) return openSheet('fuel', { workoutId: w.id })
      return openSheet('meal', { date: e.date, slot: slotForTime(e.start, e.phase) })
    }
    case 'event':
      if (e.kind === 'work') return
      return openSheet('event', { id: e.ref.id, date: e.date })
    case 'task':
      return openSheet('task', { id: e.ref.id })
    case 'petTask':
      return openSheet('petTask', { id: e.ref.id })
  }
}

// ─── Time edits (one day; "mudar o padrão" only when she picks it) ──────────

export function hasOverride(e: TimelineEntry): boolean {
  return !!overrideFor(getDB(), e.date, e.ref.type, e.ref.id)
}

export function editTimeToday(e: TimelineEntry, time: TimeHM) {
  if (!time || time === e.start) return
  haptic('light')
  undoToast(`${e.title} às ${time} — só nesse dia`, setTimeOn(e.date, e.ref, time))
}

export function editTimeDefault(e: TimelineEntry, time: TimeHM) {
  haptic('light')
  undoToast(`${e.title} às ${time} a partir de agora`, applyOps(planSetDefault(getDB(), e.date, e.ref, time)))
}

export function makeAnytime(e: TimelineEntry) {
  haptic('light')
  undoToast(`${e.title} · qualquer momento hoje`, setAnytimeOn(e.date, e.ref))
}

export function cancelToday(e: TimelineEntry) {
  haptic('light')
  const p = cancelOn(getDB(), e.date, e.ref)
  undoToast(p.cancelled.length > 1 ? `${e.title} fica de fora hoje (e o preparo junto)` : `${e.title} fica de fora hoje`, p.apply())
}

export function restoreDefault(e: TimelineEntry) {
  haptic('light')
  undoToast(`${e.title} de volta ao horário de sempre`, clearOverride(e.date, e.ref as ScheduleRef))
}
