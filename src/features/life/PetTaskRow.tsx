import { openSheet, toast } from '@/app/ui-store'
import { actions, getDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { ItemRow } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { occurrenceFor } from '@/lib/recurrence'
import { lastDoneLabel, petCategoryMeta, type PetTaskState } from './selectors'

/** Check a pet task for today. Recurring → occurrence; one-off → inactive (with undo). */
export function completePetTask(state: PetTaskState, today: DateKey): void {
  const t = state.task
  if (t.recurrence) {
    // A "fora da rotina" skip turns into a real check.
    const skip = occurrenceFor(getDB().occurrences, 'petTask', t.id, today)
    if (skip?.status === 'skipped') actions.remove('occurrences', skip.id)
    const done = actions.toggleOccurrence('petTask', t.id, today)
    if (done) {
      haptic('success')
      toast(state.flexible ? 'Feito 🐾' : 'Feito! A Luna agradece 🐾')
    }
    return
  }
  actions.update('petTasks', t.id, { active: false })
  haptic('success')
  toast('Feito 🐾', { action: { label: 'Desfazer', run: () => actions.update('petTasks', t.id, { active: true }) } })
}

export function PetTaskRow({
  state,
  today,
  showEmoji = true,
}: {
  state: PetTaskState
  today: DateKey
  showEmoji?: boolean
}) {
  const { task } = state
  const meta = petCategoryMeta(task.category)
  const checked = task.recurrence ? state.doneToday : !task.active
  // Flexible routines never show "feito há X dias" — no pressure.
  const last = task.recurrence && !state.flexible ? lastDoneLabel(state.lastDone, today) : undefined
  const canCheck = task.recurrence ? task.active : true
  const muted = (!task.active && !!task.recurrence) || state.skippedToday
  const title = `${showEmoji ? `${meta.emoji} ` : ''}${task.title}`
  return (
    <ul>
      <ItemRow
        className={cn('px-4', muted && !checked && 'text-muted')}
        title={title}
        meta={[!task.active && task.recurrence ? 'pausado' : state.detail, last].filter(Boolean).join(' · ') || undefined}
        checked={checked}
        onCheck={
          canCheck
            ? (next) => {
                if (!task.recurrence && !next) {
                  actions.update('petTasks', task.id, { active: true })
                  return
                }
                completePetTask(state, today)
              }
            : undefined
        }
        onOpen={() => openSheet('petTask', { id: task.id })}
      />
    </ul>
  )
}
