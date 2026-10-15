import type { ReactNode } from 'react'
import { useDB } from '@/data/store'
import type { DateKey, Task } from '@/data/types'
import { isTaskDoneOn } from '@/data/selectors'
import { openSheet } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { ItemRow, SwipeRow } from '@/components/ui'
import { describeRecurrence } from '@/lib/recurrence'
import { toggleTaskDone } from './mutations'
import { dueLabel, projectById } from './selectors'

/**
 * One work task: swipe right to complete, left to delete (with undo), tap to edit.
 * `showProject` puts the project's emoji + name in the meta line; `extra` (legacy) shows the task's section there.
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
  // One quiet fact; the time/delivery goes on the right.
  const meta = extra && task.group ? task.group : project ? `${project.emoji} ${project.name}` : task.status === 'review' ? 'revisar' : task.recurrence ? describeRecurrence(task.recurrence) : undefined
  const when = task.time ?? (task.dueDate && !done ? dueLabel(task.dueDate, today) : undefined)

  const row = (
    <ul>
      <ItemRow
        className="pl-3.5 pr-4"
        title={task.title}
        meta={meta}
        when={when}
        priority={task.priority === 'alta' ? 1 : task.priority === 'media' ? 2 : undefined}
        late={!!task.dueDate && task.dueDate < today}
        checked={done}
        onCheck={() => toggleTaskDone(task, today)}
        onOpen={() => openSheet('task', { id: task.id })}
      />
    </ul>
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
