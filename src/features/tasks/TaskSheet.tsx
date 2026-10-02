import { useState } from 'react'
import { Check, Hourglass } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import {
  Button,
  Chip,
  ChipSelect,
  DateInput,
  Field,
  MoreOptions,
  RecurrencePicker,
  Select,
  SheetLayout,
  TextArea,
  TextInput,
  TimeInput,
  TitleInput,
} from '@/components/ui'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { Area, LifeAdminCategory, Priority, Task, TaskStatus } from '@/data/types'
import { addDays, todayKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { CONTEXT_EMOJI, CONTEXT_LABEL, type TaskContext } from './groups'
import { setTaskDone } from './ops'

type When = 'hoje' | 'amanha' | 'semana' | 'algum_dia'

const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'amanha', label: 'Amanhã' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'algum_dia', label: 'Algum dia' },
]

const AREA_OPTIONS: { value: Area; label: string }[] = [
  { value: 'pessoal', label: 'Pessoal' },
  { value: 'corpo', label: 'Corpo' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'estudo', label: 'Estudo' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'viagem', label: 'Viagem' },
  { value: 'conteudo', label: 'Conteúdo' },
]

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Média' },
  { value: 'baixa', label: 'Baixa' },
]

const STATUS_OPTIONS: { value: Exclude<TaskStatus, 'archived'>; label: string }[] = [
  { value: 'todo', label: 'A fazer' },
  { value: 'doing', label: 'Fazendo' },
  { value: 'waiting', label: 'Esperando' },
  { value: 'review', label: 'Revisar / confirmar' },
  { value: 'done', label: 'Feita' },
]

const LIFE_OPTIONS: { value: LifeAdminCategory; label: string }[] = [
  { value: 'casa', label: '🏡 Casa' },
  { value: 'carro', label: '🚗 Carro' },
  { value: 'bike', label: '🚲 Bike' },
  { value: 'documentos', label: '📄 Documentos' },
  { value: 'manutencao', label: '🔧 Manutenção' },
  { value: 'compras', label: '🛍️ Compras' },
  { value: 'assinaturas', label: '🔁 Assinaturas' },
  { value: 'burocracia', label: '🗂️ Burocracia' },
  { value: 'consultas', label: '🩺 Consultas' },
  { value: 'outros', label: '• Outros' },
]

const CONTEXTS = Object.keys(CONTEXT_LABEL) as TaskContext[]

type Draft = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>

function whenOf(d: Draft, today: string): When | undefined {
  if (d.date === today || (!d.date && d.bucket === 'hoje')) return 'hoje'
  if (d.date === addDays(today, 1)) return 'amanha'
  if (!d.date && d.bucket === 'semana') return 'semana'
  if (!d.date && d.bucket === 'algum_dia') return 'algum_dia'
  return undefined
}

function initialDraft(existing: Task | undefined, defaults: Partial<Task> | undefined, today: string): Draft {
  if (existing) {
    const { id: _id, createdAt: _c, updatedAt: _u, order: _o, ...rest } = existing
    return rest
  }
  const d: Draft = { title: '', status: 'todo', ...(defaults ?? {}) } as Draft
  const hasWhen = !!(defaults?.date || defaults?.bucket || defaults?.dueDate || defaults?.recurrence)
  if (!hasWhen) {
    if (d.status === 'waiting') {
      /* waiting-for lives in its own list, no date */
    } else if (defaults?.projectId || defaults?.tripId) d.bucket = 'semana'
    else d.date = today
  }
  if (d.status === 'waiting' && !d.waiting) d.waiting = { who: '', since: today }
  return d
}

export default function TaskSheet({ id, defaults }: SheetProps<'task'>) {
  const today = todayKey()
  const existing = useDB((db) => (id ? db.tasks.find((t) => t.id === id) : undefined))
  const projects = useDB((db) => db.projects)
  const trips = useDB((db) => db.trips)
  const [d, setD] = useState<Draft>(() => initialDraft(existing, defaults, today))
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))
  const when = whenOf(d, today)
  const waitingFirst = !existing && defaults?.status === 'waiting'

  const setWhen = (w: When | undefined) => {
    if (w === 'hoje') set({ date: today, bucket: 'hoje' })
    else if (w === 'amanha') set({ date: addDays(today, 1), bucket: undefined })
    else if (w === 'semana') set({ date: undefined, bucket: 'semana' })
    else if (w === 'algum_dia') set({ date: undefined, bucket: 'algum_dia' })
    else set({ date: undefined, bucket: undefined })
  }

  const setStatus = (s: TaskStatus | undefined) => {
    const status = s ?? 'todo'
    set({
      status,
      waiting: status === 'waiting' ? d.waiting ?? { who: '', since: today } : d.waiting,
      completedAt: status === 'done' ? d.completedAt ?? new Date().toISOString() : undefined,
    })
  }

  const save = () => {
    const title = d.title.trim()
    if (!title) return
    const payload: Draft = { ...d, title }
    if (payload.status === 'waiting') {
      payload.waiting = { who: payload.waiting?.who.trim() || 'alguém', since: payload.waiting?.since ?? today, followUpOn: payload.waiting?.followUpOn }
    }
    if (payload.context !== 'vida_real') payload.lifeAdminCategory = undefined
    if (existing) {
      actions.update('tasks', existing.id, payload)
      toast('Salvo ✓')
    } else {
      actions.create('tasks', { ...payload, order: nextOrder(getDB().tasks) })
      haptic('light')
      toast(payload.status === 'waiting' ? 'Anotado no “esperando” ⏳' : 'Anotado ✓')
    }
    closeSheet()
  }

  const isOpen = existing && existing.status !== 'done' && existing.status !== 'archived' && !existing.recurrence

  const waitingFields = d.status === 'waiting' && (
    <div className="rounded-2xl bg-sand-soft p-3.5 space-y-3">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
        <Hourglass size={15} className="text-sand" /> Esperando alguém
      </div>
      <Field label="Esperando quem?">
        <TextInput
          value={d.waiting?.who ?? ''}
          autoFocus={waitingFirst && !!d.title}
          placeholder="ex.: Ana do financeiro"
          onChange={(e) => set({ waiting: { since: d.waiting?.since ?? today, ...d.waiting, who: e.target.value } })}
        />
      </Field>
      <Field label="Lembrar de cobrar em" hint="sem pressa — só pra não esquecer">
        <DateInput
          value={d.waiting?.followUpOn}
          onChange={(v) => set({ waiting: { who: d.waiting?.who ?? '', since: d.waiting?.since ?? today, followUpOn: v } })}
        />
      </Field>
    </div>
  )

  return (
    <SheetLayout
      eyebrow={existing ? 'Tarefa' : waitingFirst ? 'Esperando' : 'Nova tarefa'}
      title={existing ? 'Editar' : waitingFirst ? 'Esperando alguém' : 'O que precisa ser feito?'}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              removeWithUndo('tasks', existing.id, 'Tarefa apagada')
              closeSheet()
            }
          : undefined
      }
      primary={{ label: existing ? 'Salvar' : 'Adicionar', onClick: save, disabled: !d.title.trim() }}
      footerExtra={
        isOpen ? (
          <Button
            variant="soft"
            size="md"
            icon={<Check size={16} />}
            onClick={() => {
              setTaskDone(existing.id, true)
              haptic('success')
              toast('Feito ✓', { action: { label: 'Desfazer', run: () => setTaskDone(existing.id, false) } })
              closeSheet()
            }}
          >
            Concluir
          </Button>
        ) : undefined
      }
    >
      <TitleInput
        autoFocus={!existing}
        placeholder={waitingFirst ? 'O que você está esperando?' : 'Ex.: mandar proposta'}
        value={d.title}
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && !waitingFirst && save()}
        enterKeyHint="done"
      />

      {d.status !== 'waiting' && <ChipSelect value={when} onChange={setWhen} options={WHEN_OPTIONS} clearable wrap={false} />}

      {waitingFields}

      <MoreOptions defaultOpen={!!existing && !!(d.notes || d.time || d.dueDate)}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hora">
            <TimeInput value={d.time} onChange={(v) => set({ time: v, date: v && !d.date ? today : d.date })} />
          </Field>
          <Field label="Prazo">
            <DateInput value={d.dueDate} onChange={(v) => set({ dueDate: v })} />
          </Field>
        </div>
        <Field label="Dia planejado">
          <DateInput value={d.date} onChange={(v) => set({ date: v, bucket: v ? undefined : d.bucket })} />
        </Field>
        <Field label="Contexto">
          <ChipSelect
            value={d.context}
            onChange={(v) => set({ context: v })}
            clearable
            options={CONTEXTS.map((c) => ({ value: c, label: `${CONTEXT_EMOJI[c]} ${CONTEXT_LABEL[c]}` }))}
          />
        </Field>
        {d.context === 'vida_real' && (
          <Field label="Categoria da vida real">
            <ChipSelect value={d.lifeAdminCategory} onChange={(v) => set({ lifeAdminCategory: v })} clearable options={LIFE_OPTIONS} />
          </Field>
        )}
        <Field label="Status">
          <ChipSelect value={d.status === 'archived' ? undefined : d.status} onChange={setStatus} options={STATUS_OPTIONS} />
        </Field>
        {d.status !== 'waiting' && (
          <div className="flex flex-wrap gap-2">
            <Chip selected={!!d.needsMe} onClick={() => set({ needsMe: !d.needsMe })}>
              🙋‍♀️ Precisa de mim
            </Chip>
          </div>
        )}
        <Field label="Prioridade">
          <ChipSelect value={d.priority} onChange={(v) => set({ priority: v })} clearable options={PRIORITY_OPTIONS} />
        </Field>
        <Field label="Área">
          <ChipSelect value={d.area} onChange={(v) => set({ area: v })} clearable options={AREA_OPTIONS} />
        </Field>
        {projects.length > 0 && (
          <Field label="Projeto">
            <Select
              value={d.projectId}
              onChange={(v) => set({ projectId: v })}
              placeholder="Nenhum"
              options={projects.map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` }))}
            />
          </Field>
        )}
        {trips.length > 0 && (
          <Field label="Viagem">
            <Select
              value={d.tripId}
              onChange={(v) => set({ tripId: v })}
              placeholder="Nenhuma"
              options={trips.map((t) => ({ value: t.id, label: `${t.flag} ${t.name}` }))}
            />
          </Field>
        )}
        <Field label="Repetir">
          <RecurrencePicker value={d.recurrence} onChange={(r) => set({ recurrence: r })} />
        </Field>
        <Field label="Notas">
          <TextArea value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder="Detalhes, links, contexto…" />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
