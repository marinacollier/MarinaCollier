import { useDB } from '@/data/store'
import type { DateKey, Task } from '@/data/types'
import { openSheet } from '@/app/ui-store'
import { relativeDay } from '@/lib/date'
import { Hourglass } from 'lucide-react'
import { followUpToday, waitingArrived } from './mutations'
import { projectById, waitingLabel } from './selectors'

/** "Aguardando retorno de X · há N dias" + follow-up date + quick actions. */
export function WaitingRow({ task, today, showProject = true }: { task: Task; today: DateKey; showProject?: boolean }) {
  const db = useDB()
  const project = showProject ? projectById(db, task.projectId) : undefined
  const follow = task.waiting?.followUpOn
  return (
    <div className="px-4 py-3">
      <button type="button" className="w-full text-left flex items-start gap-3" onClick={() => openSheet('task', { id: task.id })}>
        <span className="h-8 w-8 rounded-full bg-sand-soft text-sand inline-flex items-center justify-center shrink-0 mt-0.5">
          <Hourglass size={15} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] leading-snug">{task.title}</span>
          <span className="block text-[12.5px] text-muted mt-0.5">{waitingLabel(task, today)}</span>
          {(project || follow) && (
            <span className="block text-[12.5px] text-muted truncate">
              {[project ? `${project.emoji} ${project.name}` : undefined, follow ? `follow-up ${relativeDay(follow, today)}` : undefined]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </span>
      </button>
      <div className="flex gap-2 mt-2 pl-11">
        {follow !== today && (
          <button
            type="button"
            onClick={() => followUpToday(task)}
            className="h-9 px-3.5 rounded-full bg-surface-2 text-[13px] text-ink-2 active:bg-line"
          >
            follow-up hoje
          </button>
        )}
        <button
          type="button"
          onClick={() => waitingArrived(task)}
          className="h-9 px-3.5 rounded-full bg-sage-soft text-sage text-[13px] font-medium active:opacity-80"
        >
          chegou ✓
        </button>
      </div>
    </div>
  )
}
