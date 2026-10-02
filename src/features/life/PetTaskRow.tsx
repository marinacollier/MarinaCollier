import { openSheet, toast } from '@/app/ui-store'
import { actions } from '@/data/store'
import type { DateKey } from '@/data/types'
import { Checkbox } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { lastDoneLabel, petCategoryMeta, type PetTaskState } from './selectors'

/** Check a pet task for today. Recurring → occurrence; one-off → inactive (with undo). */
export function completePetTask(state: PetTaskState, today: DateKey): void {
  const t = state.task
  if (t.recurrence) {
    const done = actions.toggleOccurrence('petTask', t.id, today)
    if (done) {
      haptic('success')
      toast('Feito! A Luna agradece 🐾')
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
  showLastDone = true,
}: {
  state: PetTaskState
  today: DateKey
  showEmoji?: boolean
  showLastDone?: boolean
}) {
  const { task } = state
  const meta = petCategoryMeta(task.category)
  const checked = task.recurrence ? state.doneToday : !task.active
  const last = showLastDone && task.recurrence ? lastDoneLabel(state.lastDone, today) : undefined
  const canCheck = task.recurrence ? task.active : true
  return (
    <div className="flex items-center gap-3 min-h-[60px] px-4 py-2.5">
      {canCheck ? (
        <Checkbox
          checked={checked}
          label={checked ? `Desmarcar ${task.title}` : `Concluir ${task.title}`}
          onChange={(next) => {
            if (!task.recurrence && !next) {
              actions.update('petTasks', task.id, { active: true })
              return
            }
            completePetTask(state, today)
          }}
        />
      ) : (
        <span className="w-6" />
      )}
      <button
        type="button"
        onClick={() => openSheet('petTask', { id: task.id })}
        className="flex-1 min-w-0 text-left flex items-center gap-3"
      >
        {showEmoji && (
          <span aria-hidden className="text-[18px] shrink-0">
            {meta.emoji}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[15px] leading-snug', checked && 'text-muted line-through decoration-muted/50', !task.active && task.recurrence && 'text-muted')}>
            {task.title}
          </span>
          <span className="block text-[12.5px] text-muted mt-0.5 truncate">
            {!task.active && task.recurrence ? 'pausado' : state.detail}
            {last && <span className="text-muted/80"> · {last}</span>}
          </span>
        </span>
      </button>
    </div>
  )
}
