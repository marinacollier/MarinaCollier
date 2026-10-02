import type { ReactNode } from 'react'
import { useDB } from '@/data/store'
import type { DateKey, Task } from '@/data/types'
import { isTaskDoneOn } from '@/data/selectors'
import { openSheet } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { Checkbox, SwipeRow } from '@/components/ui'
import { describeRecurrence } from '@/lib/recurrence'
import { cn } from '@/lib/cn'
import { toggleTaskDone } from './mutations'
import { dueLabel, projectById } from './selectors'

/**
 * One work task: swipe right to complete, left to delete (with undo), tap to edit.
 * `showProject` adds the project's emoji + name in the subtitle.
 */
export function WorkTaskRow({
  task,
  today,
  showProject = true,
  extra,
  swipe = true,
}: {
  task: Task
  today: DateKey
  showProject?: boolean
  extra?: ReactNode
  swipe?: boolean
}) {
  const db = useDB()
  const done = isTaskDoneOn(db, task, today)
  const project = showProject ? projectById(db, task.projectId) : undefined
  const bits = [
    project ? `${project.emoji} ${project.name}` : undefined,
    task.recurrence ? describeRecurrence(task.recurrence) : undefined,
    task.time,
    task.dueDate && !done ? `entrega ${dueLabel(task.dueDate, today)}` : undefined,
    task.status === 'review' ? 'revisar' : undefined,
  ].filter(Boolean)

  const row = (
    <div className="flex items-start gap-3 px-4 py-3 min-h-[56px]">
      <div className="pt-0.5">
        <Checkbox checked={done} onChange={() => toggleTaskDone(task, today)} label={`Concluir ${task.title}`} />
      </div>
      <button type="button" className="flex-1 min-w-0 text-left" onClick={() => openSheet('task', { id: task.id })}>
        <div className={cn('text-[15px] leading-snug', done && 'text-muted line-through decoration-muted/50')}>{task.title}</div>
        {bits.length > 0 && <div className="text-[12.5px] text-muted mt-0.5 truncate">{bits.join(' · ')}</div>}
        {extra}
      </button>
    </div>
  )
  if (!swipe) return row
  return (
    <SwipeRow
      className="rounded-none"
      onComplete={done ? undefined : () => toggleTaskDone(task, today)}
      onDelete={task.recurrence ? undefined : () => removeWithUndo('tasks', task.id, 'Tarefa apagada')}
    >
      {row}
    </SwipeRow>
  )
}
