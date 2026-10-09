/**
 * Check / open an ActionItem from the Home, through the SAME writers the screens use (one source of truth):
 * routine steps, tasks (and their occurrences), Luna, meal-prep checklist, trip to-dos, trainings, plan meals.
 * Every tick is saved to the device right away (not only on the debounce), with "Desfazer".
 */
import { openSheet, toast } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import type { ActionItem } from '@/data/agenda/items'
import { actions, getDB, persist } from '@/data/store'
import type { DateKey } from '@/data/types'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'
import { toggleEaten } from '@/features/nutrition/feedback'
import { openEntryFlow, toggleEntry } from '../timeline/actions'

const save = () => void persist()

function undoable(message: string, undo: () => void) {
  toast(message, {
    action: {
      label: 'Desfazer',
      run: () => {
        undo()
        save()
      },
    },
  })
}

/** Returns the new done state, or undefined when the item isn't something you tick. */
export function checkItem(item: ActionItem): boolean | undefined {
  const db = getDB()
  let done: boolean | undefined
  switch (item.check) {
    case 'none':
      return undefined
    case 'routine': {
      const steps = (item.children ?? []).filter((c) => c.status !== 'cancelled' && c.status !== 'skipped' && c.entry)
      const all = steps.every((c) => c.status === 'done')
      for (const c of steps) if (all || c.status !== 'done') toggleEntry(c.entry!)
      done = !all
      break
    }
    case 'workout': {
      const w = db.workouts.find((x) => x.id === item.refId)
      if (!w) return undefined
      const before = { status: w.status, durationMin: w.durationMin }
      done = w.status !== 'feito'
      actions.update('workouts', w.id, done ? { status: 'feito', durationMin: w.durationMin ?? w.plannedDurationMin } : { status: 'planejado', durationMin: undefined })
      haptic(done ? 'success' : 'light')
      save()
      toast(done ? `${item.title} feito ✓` : `${item.title}: voltou pra planejado`, {
        action: done
          ? { label: 'Registrar detalhes', run: () => openSheet('workoutLog', { id: w.id }) }
          : {
              label: 'Desfazer',
              run: () => {
                actions.update('workouts', w.id, before)
                save()
              },
            },
      })
      return done
    }
    case 'meal': {
      toggleEaten(item.date, item.refId, item.title)
      save()
      return getDB().meals.some((m) => m.date === item.date && m.planMealRef === item.refId && m.done)
    }
    case 'toggle': {
      if (item.entry) {
        done = toggleEntry(item.entry)
        break
      }
      if (item.refType === 'task') {
        const t = db.tasks.find((x) => x.id === item.refId)
        if (!t) return undefined
        if (t.recurrence) done = actions.toggleOccurrence('task', t.id, item.date)
        else {
          done = t.status !== 'done'
          actions.update('tasks', t.id, done ? { status: 'done', completedAt: nowISO() } : { status: 'todo', completedAt: undefined })
        }
        break
      }
      if (item.refType === 'tripItem') {
        const ti = db.tripItems.find((x) => x.id === item.refId)
        if (!ti) return undefined
        const prev = ti.status
        done = prev !== 'feito'
        actions.update('tripItems', ti.id, { status: done ? 'feito' : 'a_fazer' })
        save()
        undoable(done ? `${item.title} ✓` : 'Desmarcado', () => actions.update('tripItems', ti.id, { status: prev }))
        haptic(done ? 'success' : 'light')
        return done
      }
      return undefined
    }
  }
  if (done === undefined) return undefined
  haptic(done ? 'success' : 'light')
  save()
  // Undo = tick again (each writer above is its own inverse).
  const again = { ...item, status: done ? ('done' as const) : ('pending' as const), children: item.children?.map((c) => ({ ...c, status: done ? ('done' as const) : ('pending' as const) })) }
  undoable(done ? `${item.title} ✓` : `${item.title}: desmarcado`, () => {
    checkItem(again)
  })
  return done
}

/** Tap on the row itself: open its own record. */
export function openItem(item: ActionItem, today: DateKey, navigate: (to: string) => void): void {
  haptic('light')
  if (item.entry && item.refType !== 'routine') return openEntryFlow(item.entry, today)
  switch (item.refType) {
    case 'task':
      return openSheet('task', { id: item.refId })
    case 'opportunity':
      return openSheet('opportunity', { id: item.refId })
    case 'contact':
      return openSheet('contact', { id: item.refId })
    case 'tripItem':
      return openSheet('tripItem', { id: item.refId })
    case 'content':
      return openSheet('content', { id: item.refId })
    case 'partnership':
      return openSheet('partnership', { id: item.refId })
    case 'milestone': {
      const m = getDB().milestones.find((x) => x.id === item.refId)
      if (m) navigate(ROUTES.project(m.projectId))
      return
    }
    case 'project':
      return navigate(ROUTES.project(item.refId))
  }
}
