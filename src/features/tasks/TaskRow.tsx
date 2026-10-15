import { useMemo } from 'react'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { ItemRow, SwipeRow } from '@/components/ui'
import { useDB } from '@/data/store'
import { isTaskDoneOn } from '@/data/selectors'
import type { DateKey, Task } from '@/data/types'
import { cn } from '@/lib/cn'
import { relativeDay, todayKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { describeRecurrence } from '@/lib/recurrence'
import { setTaskDone } from './ops'
import { CONTEXT_EMOJI, contextOf } from './groups'

export interface TaskRowProps {
  task: Task
  /** Day the row represents (recurring tasks complete per day). */
  date?: DateKey
  /** Small kind label before the meta ("ficou de antes"). */
  note?: string
  className?: string
  showContext?: boolean
}

export function completeWithFeedback(task: Task, done: boolean, date: DateKey) {
  setTaskDone(task.id, done, date)
  if (done) {
    haptic('success')
    toast('Feito ✓', { action: { label: 'Desfazer', run: () => setTaskDone(task.id, false, date) } })
  }
}

export function TaskRow({ task, date, note, className, showContext = true }: TaskRowProps) {
  const db = useDB()
  const day = date ?? todayKey()
  const done = isTaskDoneOn(db, task, day)
  // One quiet fact on the meta line (the most useful one), the time/day on the right.
  const meta = useMemo(() => {
    if (note) return note
    if (task.status === 'waiting' && task.waiting) return task.waiting.followUpOn ? `${task.waiting.who} · cobrar ${relativeDay(task.waiting.followUpOn, day)}` : `com ${task.waiting.who}`
    if (task.status === 'review') return 'revisar / confirmar'
    if (task.dueDate && task.dueDate !== task.date) return task.dueDate === day ? 'prazo hoje' : `prazo ${relativeDay(task.dueDate, day)}`
    const project = task.projectId ? db.projects.find((p) => p.id === task.projectId) : undefined
    if (project) return `${project.emoji} ${project.name}`
    const trip = task.tripId ? db.trips.find((t) => t.id === task.tripId) : undefined
    if (trip) return `${trip.flag} ${trip.name}`
    if (task.recurrence) return describeRecurrence(task.recurrence)
    if (task.needsMe && !done) return 'precisa de mim'
    return undefined
  }, [task, db.projects, db.trips, day, note, done])
  const when = task.time ?? (task.date && task.date !== day && !note && task.status !== 'waiting' ? relativeDay(task.date, day) : undefined)

  const ctx = contextOf(task)

  return (
    <SwipeRow
      className={cn('rounded-none', className)}
      onComplete={done ? undefined : () => completeWithFeedback(task, true, day)}
      onDelete={() => removeWithUndo('tasks', task.id, 'Tarefa apagada')}
    >
      <ul>
        <ItemRow
          className="pl-3.5 pr-3"
          title={task.title}
          meta={meta}
          when={when}
          priority={task.priority === 'alta' ? 1 : task.priority === 'media' ? 2 : undefined}
          late={(!!task.dueDate && task.dueDate < day) || (!!note && !done)}
          checked={done}
          onCheck={(v) => completeWithFeedback(task, v, day)}
          onOpen={() => openSheet('task', { id: task.id })}
          trailing={
            showContext && ctx !== 'geral' ? (
              <span className="text-[15px] opacity-70 shrink-0" aria-hidden>
                {CONTEXT_EMOJI[ctx]}
              </span>
            ) : undefined
          }
        />
      </ul>
    </SwipeRow>
  )
}
