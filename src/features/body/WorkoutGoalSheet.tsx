import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { actions, useDB } from '@/data/store'
import type { Milestone, WorkoutGoal } from '@/data/types'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { ChipSelect, DateInput, WeekdayPicker, Field, IconButton, MoreOptions, NumberInput, Select, SheetLayout, TextArea, TitleInput } from '@/components/ui'
import { todayKey } from '@/lib/date'
import { uid } from '@/lib/id'
import { cn } from '@/lib/cn'
import { GOAL_KINDS, MODALITY_GROUPS } from './constants'
import { orderedModalities } from './selectors'

const STATUS_OPTIONS: { value: WorkoutGoal['status']; label: string }[] = [
  { value: 'ativa', label: 'ativo' },
  { value: 'pausada', label: 'pausado' },
  { value: 'concluida', label: 'concluído' },
]

export default function WorkoutGoalSheet({ id }: SheetProps<'workoutGoal'>) {
  const db = useDB()
  const existing = id ? db.workoutGoals.find((g) => g.id === id) : undefined
  const [draft, setDraft] = useState<Partial<WorkoutGoal>>(() => existing ?? { kind: 'sessions', startDate: todayKey(), milestones: [], status: 'ativa' })
  const [newMilestone, setNewMilestone] = useState('')
  const set = (p: Partial<WorkoutGoal>) => setDraft((d) => ({ ...d, ...p }))
  const modalityOptions = useMemo(
    () => [
      ...MODALITY_GROUPS.map((g) => ({ value: g.key, label: `${g.emoji} ${g.label}` })),
      ...orderedModalities(db.profile.modalities, { keep: draft.modality }).map((m) => ({ value: m.id, label: `${m.emoji} ${m.label}` })),
    ],
    [db.profile.modalities, draft.modality],
  )

  if (id && !existing) {
    return (
      <SheetLayout title="Objetivo" onClose={closeSheet}>
        <p className="text-muted text-[14px] pb-6">Esse objetivo não existe mais.</p>
      </SheetLayout>
    )
  }

  const kind = draft.kind ?? 'sessions'
  const milestones = draft.milestones ?? []

  const addMilestone = () => {
    const title = newMilestone.trim()
    if (!title) return
    set({ milestones: [...milestones, { id: uid(), title, done: false }] })
    setNewMilestone('')
  }
  const patchMilestone = (mid: string, p: Partial<Milestone>) => set({ milestones: milestones.map((m) => (m.id === mid ? { ...m, ...p } : m)) })

  const save = () => {
    const title = draft.title?.trim()
    if (!title) return
    const pending = newMilestone.trim()
    const data = {
      title,
      kind,
      modality: draft.modality,
      target: kind === 'event' ? undefined : draft.target,
      unit: kind === 'distance' ? ('km' as const) : kind === 'event' ? undefined : ('sessoes' as const),
      startDate: draft.startDate ?? todayKey(),
      deadline: draft.deadline,
      preparation: draft.preparation?.trim() || undefined,
      milestones: pending ? [...milestones, { id: uid(), title: pending, done: false }] : milestones,
      notes: draft.notes?.trim() || undefined,
      status: draft.status ?? 'ativa',
      tripId: draft.tripId,
      perWeek: kind === 'habit' ? (draft.perWeek ?? draft.target) : undefined,
      obligation: kind === 'habit' ? draft.obligation : undefined,
      preferredWeekdays: draft.preferredWeekdays?.length ? draft.preferredWeekdays : undefined,
      planType: draft.planType,
    }
    if (existing) {
      actions.update('workoutGoals', existing.id, data)
      toast('Objetivo atualizado')
    } else {
      actions.create('workoutGoals', data)
      toast('Objetivo criado 🎯')
    }
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow="objetivo esportivo"
      title={existing ? 'Editar objetivo' : 'Novo objetivo'}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('workoutGoals', existing.id, 'Objetivo apagado')
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save, disabled: !draft.title?.trim() }}
    >
      <TitleInput autoFocus={!existing} placeholder="Qual é o objetivo?" value={draft.title ?? ''} onChange={(e) => set({ title: e.target.value })} />

      <div className="grid grid-cols-2 gap-2">
        {GOAL_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => set({ kind: k.value })}
            className={cn('rounded-2xl px-3.5 py-3 text-left border transition active:scale-[0.98]', kind === k.value ? 'bg-accent-soft border-accent/60' : 'bg-surface-2 border-transparent')}
          >
            <div className="text-[14.5px] font-medium">
              {k.emoji} {k.label}
            </div>
            <div className="text-[12px] text-muted mt-0.5">{k.hint}</div>
          </button>
        ))}
      </div>

      {kind !== 'event' && (
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Modalidade">
            <Select value={draft.modality} onChange={(modality) => set({ modality })} placeholder="qualquer uma" options={modalityOptions} />
          </Field>
          <Field label={kind === 'distance' ? 'Meta (km)' : kind === 'habit' ? 'Vezes/semana' : 'Sessões'}>
            <NumberInput
              value={kind === 'habit' ? (draft.perWeek ?? draft.target) : draft.target}
              onChange={(target) => set(kind === 'habit' ? { target, perWeek: target } : { target })} placeholder={kind === 'distance' ? '100' : kind === 'habit' ? '2' : '12'} />
          </Field>
        </div>
      )}

      {kind === 'event' && (
        <>
          <Field label="Preparação">
            <TextArea value={draft.preparation ?? ''} onChange={(e) => set({ preparation: e.target.value })} rows={2} placeholder="o que essa preparação precisa?" />
          </Field>
          <div>
            <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Marcos</div>
            <div className="space-y-1.5">
              {milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-2xl bg-surface-2 pl-3.5 pr-1">
                  <button type="button" onClick={() => patchMilestone(m.id, { done: !m.done })} className={cn('h-5 w-5 rounded-full border-[1.5px] shrink-0', m.done ? 'bg-sage border-sage' : 'border-muted/60')} aria-label={m.done ? 'Desmarcar' : 'Marcar'} />
                  <input value={m.title} onChange={(e) => patchMilestone(m.id, { title: e.target.value })} className="flex-1 min-w-0 bg-transparent outline-none h-11 text-[15px]" />
                  <IconButton label="Remover marco" size="sm" onClick={() => set({ milestones: milestones.filter((x) => x.id !== m.id) })}>
                    <X size={16} />
                  </IconButton>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  className="input"
                  placeholder="novo marco (ex: trilha longa no fim de semana)"
                  value={newMilestone}
                  onChange={(e) => setNewMilestone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMilestone())}
                />
                <IconButton label="Adicionar marco" variant="soft" onClick={addMilestone}>
                  <Plus size={18} />
                </IconButton>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Começa em">
          <DateInput value={draft.startDate} onChange={(v) => set({ startDate: v ?? draft.startDate })} />
        </Field>
        <Field label={kind === 'event' ? 'Data (se tiver)' : 'Até (opcional)'}>
          <DateInput value={draft.deadline} onChange={(deadline) => set({ deadline })} />
        </Field>
      </div>

      <MoreOptions defaultOpen={!!existing?.tripId || !!existing?.preferredWeekdays?.length}>
        {kind === 'habit' && (
          <>
            <Field label="Dias que costumo preferir" hint="as sugestões de janela começam por eles">
              <WeekdayPicker value={draft.preferredWeekdays ?? []} onChange={(preferredWeekdays) => set({ preferredWeekdays })} />
            </Field>
            <Field label="É compromisso da semana?" hint="diversão não vira cobrança: sem lembrete de “ainda sem lugar”">
              <ChipSelect
                value={draft.obligation === false ? 'nao' : 'sim'}
                onChange={(v) => set({ obligation: v === 'nao' ? false : undefined })}
                options={[
                  { value: 'sim', label: 'sim, quero encaixar' },
                  { value: 'nao', label: 'não, é diversão' },
                ]}
              />
            </Field>
          </>
        )}
        {db.trips.length > 0 && (
          <Field label="Ligado a uma viagem" hint="sem data própria, a contagem usa o início da viagem">
            <Select value={draft.tripId} onChange={(tripId) => set({ tripId })} placeholder="nenhuma" options={db.trips.map((t) => ({ value: t.id, label: `${t.flag} ${t.name}` }))} />
          </Field>
        )}
        {kind !== 'event' && (
          <Field label="Preparação / contexto">
            <TextArea value={draft.preparation ?? ''} onChange={(e) => set({ preparation: e.target.value })} rows={2} />
          </Field>
        )}
        <Field label="Status">
          <ChipSelect value={draft.status} onChange={(status) => set({ status: status ?? 'ativa' })} options={STATUS_OPTIONS} />
        </Field>
        <Field label="Notas">
          <TextArea value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
