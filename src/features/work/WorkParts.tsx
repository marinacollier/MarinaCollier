import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarClock, Flag, Milestone as MilestoneIcon, Package } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import type { DateKey, Project } from '@/data/types'
import { cn } from '@/lib/cn'
import { relativeDay } from '@/lib/date'
import { PriorityDot, ProjectEmoji, StatusPill } from './components'
import { dueLabel, projectById, type DatedItem } from './selectors'

const KIND_ICON: Record<DatedItem['kind'], ReactNode> = {
  deadline: <Flag size={15} />,
  entrega: <Package size={15} />,
  milestone: <MilestoneIcon size={15} />,
  tarefa: <CalendarClock size={15} />,
}
const KIND_LABEL: Record<DatedItem['kind'], string> = {
  deadline: 'deadline',
  entrega: 'entrega',
  milestone: 'milestone',
  tarefa: 'tarefa',
}

export function DatedRow({ item, today, showProject = true }: { item: DatedItem; today: DateKey; showProject?: boolean }) {
  const nav = useNavigate()
  const db = useDB()
  const project = showProject ? projectById(db, item.projectId) : undefined
  const soon = item.date <= today
  return (
    <button
      type="button"
      onClick={() => (item.kind === 'tarefa' ? openSheet('task', { id: item.refId }) : item.projectId && nav(ROUTES.project(item.projectId)))}
      className="w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left active:bg-surface-2 transition-colors"
    >
      <span className="h-8 w-8 rounded-full bg-surface-2 text-ink-2 inline-flex items-center justify-center shrink-0">{KIND_ICON[item.kind]}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-snug truncate">{item.title}</span>
        <span className="block text-[12.5px] text-muted truncate">
          {[KIND_LABEL[item.kind], project ? `${project.emoji} ${project.name}` : undefined].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 h-6 px-2.5 rounded-full text-[12px] font-medium inline-flex items-center whitespace-nowrap',
          soon ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2',
        )}
      >
        {dueLabel(item.date, today)}
      </span>
    </button>
  )
}

export function ProjectCard({
  project,
  today,
  updatedLabel,
  openCount = 0,
  handle,
}: {
  project: Project
  today: DateKey
  updatedLabel: string
  openCount?: number
  handle?: ReactNode
}) {
  const nav = useNavigate()
  const delivery = project.nextDelivery
  return (
    <div className="card mb-2.5 flex items-stretch">
      <button
        type="button"
        onClick={() => nav(ROUTES.project(project.id))}
        className="flex-1 min-w-0 text-left p-4 pr-1 active:opacity-80 transition-opacity"
      >
        <div className="flex items-start gap-3">
          <ProjectEmoji project={project} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-[19px] leading-tight line-clamp-2">{project.name}</span>
              <PriorityDot priority={project.priority} />
            </div>
            {project.role && <div className="text-[13px] text-muted truncate mt-0.5">{project.role}</div>}
          </div>
          <StatusPill status={project.status} />
        </div>
        <div className="mt-3 space-y-1 text-[13.5px]">
          <div className="flex items-start gap-2 text-ink-2">
            <ArrowRight size={14} className="mt-[3px] shrink-0 text-accent" />
            <span className={cn('min-w-0', !project.nextAction && 'text-muted')}>{project.nextAction || 'Definir próxima ação'}</span>
          </div>
          {delivery?.title && (
            <div className="flex items-start gap-2 text-ink-2">
              <Package size={14} className="mt-[3px] shrink-0 text-muted" />
              <span className="min-w-0">
                {delivery.title}
                {delivery.date && <span className="text-muted"> · {relativeDay(delivery.date, today)}</span>}
              </span>
            </div>
          )}
        </div>
        <div className="text-[12px] text-muted mt-2.5">
          {[openCount ? `${openCount} ${openCount === 1 ? 'tarefa aberta' : 'tarefas abertas'}` : undefined, updatedLabel].filter(Boolean).join(' · ')}
        </div>
      </button>
      {handle && <div className="flex items-center pr-2">{handle}</div>}
    </div>
  )
}
