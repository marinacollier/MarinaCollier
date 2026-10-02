import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { IconButton } from '@/components/ui'
import { todayTasks } from '@/features/tasks/groups'
import { TaskRow } from '@/features/tasks/TaskRow'
import { HeaderLink, Widget, type WidgetCtx } from './shared'

const LIMIT = 5

export function TasksWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const nav = useNavigate()
  const { open, carried, done } = useMemo(() => {
    // Tasks already in the Top 3 don't need to show twice.
    const inTop3 = new Set(db.priorities.filter((p) => p.date === today && p.ref?.type === 'task').map((p) => p.ref!.id))
    const t = todayTasks(db, today)
    const keep = (list: typeof t.open) => list.filter((x) => !inTop3.has(x.id))
    return { open: keep(t.open), carried: keep(t.carried), done: keep(t.done) }
  }, [db, today])

  if (open.length + carried.length + done.length === 0) return null

  const rows = [...open.map((t) => ({ t, note: undefined as string | undefined })), ...carried.map((t) => ({ t, note: 'ficou de antes' }))]
  const shown = rows.slice(0, LIMIT)
  const hidden = rows.length - shown.length

  return (
    <Widget
      id="tarefas"
      eyebrow="Tarefas de hoje"
      flush
      action={
        <div className="flex items-center">
          <HeaderLink onClick={() => nav(ROUTES.tasks)}>ver todas</HeaderLink>
          <IconButton label="Nova tarefa" onClick={() => openSheet('task', { defaults: { date: today } })}>
            <Plus size={18} />
          </IconButton>
        </div>
      }
    >
      {shown.length === 0 ? (
        <p className="px-4 pb-4 pt-1 text-[14px] text-ink-2">
          Tudo feito por hoje ✓ <span className="text-muted">— {done.length} {done.length === 1 ? 'tarefa' : 'tarefas'}</span>
        </p>
      ) : (
        <div className="divide-y divide-line/60">
          {shown.map(({ t, note }) => (
            <TaskRow key={t.id} task={t} date={today} note={note} />
          ))}
        </div>
      )}
      {(hidden > 0 || (done.length > 0 && shown.length > 0)) && (
        <button type="button" onClick={() => nav(ROUTES.tasks)} className="w-full text-left px-4 py-3 border-t border-line/60 text-[13px] text-muted active:bg-surface-2">
          {[hidden > 0 ? `+ ${hidden} pra ver` : '', done.length > 0 ? `${done.length} ${done.length === 1 ? 'feita' : 'feitas'} hoje ✓` : ''].filter(Boolean).join(' · ')}
        </button>
      )}
    </Widget>
  )
}
