import { useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB, nextOrder } from '@/data/store'
import type { Meeting } from '@/data/types'
import { DateInput, Field, MoreOptions, Select, SheetLayout, TextArea, TimeInput, TitleInput } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { todayKey } from '@/lib/date'
import { uid } from '@/lib/id'
import { AddLine } from './components'

type ActionItem = Meeting['actionItems'][number]

export default function MeetingSheet({ id, projectId }: SheetProps<'meeting'>) {
  const existing = id ? getDB().meetings.find((m) => m.id === id) : undefined
  const projects = getDB().projects
  const meetingId = useRef(existing?.id ?? uid())
  const persisted = useRef(!!existing)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [date, setDate] = useState(existing?.date ?? todayKey())
  const [startTime, setStartTime] = useState(existing?.startTime)
  const [project, setProject] = useState(existing?.projectId ?? projectId)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [decisions, setDecisions] = useState<string[]>(existing?.decisions ?? [])
  const [items, setItems] = useState<ActionItem[]>(existing?.actionItems ?? [])

  const payload = (actionItems = items) => ({
    title: title.trim() || 'Reunião',
    date: date ?? todayKey(),
    startTime,
    projectId: project,
    notes: notes.trim() || undefined,
    decisions,
    actionItems,
    links: existing?.links ?? [],
  })

  const persist = (actionItems = items) => {
    if (persisted.current) actions.update('meetings', meetingId.current, payload(actionItems))
    else {
      actions.create('meetings', { ...payload(actionItems), id: meetingId.current })
      persisted.current = true
    }
  }

  const save = () => {
    persist()
    toast(existing ? 'Reunião atualizada' : 'Reunião registrada 📝')
    closeSheet()
  }

  const toTask = (index: number) => {
    const it = items[index]
    if (!it || it.taskId) return
    const task = actions.create('tasks', {
      title: it.text,
      status: 'todo',
      context: 'trabalho',
      area: 'profissional',
      projectId: project,
      origin: { type: 'meeting', id: meetingId.current },
      order: nextOrder(getDB().tasks),
    })
    const next = items.map((x, i) => (i === index ? { ...x, taskId: task.id } : x))
    setItems(next)
    persist(next)
    haptic('success')
    toast('Virou tarefa ✓')
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'Reunião' : 'Nova reunião'}
      onClose={closeSheet}
      primary={{ label: 'Salvar', onClick: save, disabled: !title.trim() }}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('meetings', existing.id, 'Reunião apagada')
            }
          : undefined
      }
    >
      <TitleInput autoFocus={!existing} placeholder="Sobre o que foi?" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dia">
          <DateInput value={date} onChange={(v) => setDate(v ?? todayKey())} />
        </Field>
        <Field label="Hora">
          <TimeInput value={startTime} onChange={setStartTime} />
        </Field>
      </div>
      <Field label="Notas">
        <TextArea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que importa lembrar" />
      </Field>

      <div>
        <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Decisões</div>
        {decisions.length > 0 && (
          <ul className="mb-2 space-y-1">
            {decisions.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-[14.5px] bg-surface-2 rounded-xl pl-3 pr-1 py-1.5">
                <span className="flex-1 pt-1.5">{d}</span>
                <button type="button" aria-label="Remover decisão" className="h-9 w-9 inline-flex items-center justify-center text-muted" onClick={() => setDecisions(decisions.filter((_, j) => j !== i))}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddLine placeholder="Nova decisão" onAdd={(t) => setDecisions([...decisions, t])} />
      </div>

      <div>
        <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Próximos passos</div>
        {items.length > 0 && (
          <ul className="mb-2 space-y-1">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-2 text-[14.5px] bg-surface-2 rounded-xl pl-3 pr-1 py-1">
                <span className="flex-1 min-w-0 py-1.5">{it.text}</span>
                {it.taskId ? (
                  <span className="text-[12px] text-sage font-medium inline-flex items-center gap-1 px-2">
                    <Check size={13} /> tarefa
                  </span>
                ) : (
                  <button type="button" onClick={() => toTask(i)} className="h-9 px-3 rounded-full bg-surface text-[12.5px] font-medium text-ink shrink-0">
                    virar tarefa
                  </button>
                )}
                <button type="button" aria-label="Remover item" className="h-9 w-9 inline-flex items-center justify-center text-muted shrink-0" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddLine placeholder="Quem faz o quê" onAdd={(t) => setItems([...items, { text: t }])} />
      </div>

      <MoreOptions defaultOpen={!!existing && !!existing.projectId}>
        <Field label="Projeto">
          <Select value={project} onChange={setProject} placeholder="Sem projeto" options={projects.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` }))} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
