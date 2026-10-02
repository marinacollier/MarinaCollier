import { useMemo } from 'react'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { Checkbox, SwipeRow } from '@/components/ui'
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
  const meta = useMemo(() => {
    const parts: string[] = []
    if (task.time) parts.push(task.time)
    if (task.status === 'waiting' && task.waiting) {
      parts.push(`com ${task.waiting.who}`)
      if (task.waiting.followUpOn) parts.push(`cobrar ${relativeDay(task.waiting.followUpOn, day)}`)
    }
    if (task.status === 'review') parts.push('revisar / confirmar')
    if (task.dueDate && task.dueDate !== task.date) parts.push(task.dueDate === day ? 'prazo hoje' : `prazo ${relativeDay(task.dueDate, day)}`)
    if (task.date && task.date !== day && !note && task.status !== 'waiting') parts.push(relativeDay(task.date, day))
    if (task.recurrence) parts.push(describeRecurrence(task.recurrence))
    const project = task.projectId ? db.projects.find((p) => p.id === task.projectId) : undefined
    if (project) parts.push(`${project.emoji} ${project.name}`)
    const trip = task.tripId ? db.trips.find((t) => t.id === task.tripId) : undefined
    if (trip) parts.push(`${trip.flag} ${trip.name}`)
    if (task.needsMe && !done) parts.push('precisa de mim')
    return parts
  }, [task, db.projects, db.trips, day, note, done])

  const ctx = contextOf(task)

  return (
    <SwipeRow
      className={cn('rounded-none', className)}
      onComplete={done ? undefined : () => completeWithFeedback(task, true, day)}
      onDelete={() => removeWithUndo('tasks', task.id, 'Tarefa apagada')}
    >
      <div className="flex items-center gap-3 pl-4 pr-3 min-h-[56px] py-2">
        <Checkbox checked={done} onChange={(v) => completeWithFeedback(task, v, day)} label={`Concluir ${task.title}`} />
        <button type="button" onClick={() => openSheet('task', { id: task.id })} className="flex-1 min-w-0 text-left py-1 pl-1">
          <div className={cn('text-[15px] leading-snug transition-colors', done && 'text-muted line-through decoration-muted/40')}>{task.title}</div>
          {(note || meta.length > 0) && (
            <div className="text-[12.5px] text-muted mt-0.5 truncate">
              {note && <span className="text-sand font-medium">{note}</span>}
              {note && meta.length > 0 && ' · '}
              {meta.join(' · ')}
            </div>
          )}
        </button>
        {showContext && ctx !== 'geral' && (
          <span className="text-[15px] opacity-70 shrink-0" aria-hidden>
            {CONTEXT_EMOJI[ctx]}
          </span>
        )}
      </div>
    </SwipeRow>
  )
}
