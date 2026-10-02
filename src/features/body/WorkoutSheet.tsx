import { useMemo, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { DayPeriod, Workout, WorkoutStatus } from '@/data/types'
import { isPresencial, PERIOD_LABEL } from '@/data/planning'
import { closeSheet, replaceSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { Button, Chip, ChipSelect, DateInput, Field, MoreOptions, NumberInput, Select, SheetLayout, TextArea, TextInput, TimeInput, tone } from '@/components/ui'
import { todayKey, relativeDay } from '@/lib/date'
import { cn } from '@/lib/cn'
import { INTENSITY, REST_MODALITY, STATUS_META } from './constants'
import { orderedModalities } from './selectors'
import { draftConflicts, PLAN_TYPE_LABEL, PLAN_TYPES } from './planner'

const DURATIONS = [30, 45, 60, 90]
const PERIODS: DayPeriod[] = ['manha', 'almoco', 'tarde', 'noite']
const STATUSES: WorkoutStatus[] = ['planejado', 'feito', 'adaptado', 'descanso', 'pulado']

export default function WorkoutSheet({ id, date, defaults }: SheetProps<'workout'>) {
  const db = useDB()
  const existing = id ? db.workouts.find((w) => w.id === id) : undefined
  const [draft, setDraft] = useState<Partial<Workout>>(
    () =>
      existing ?? {
        status: 'planejado',
        modality: orderedModalities(getDB().profile.modalities)[0]?.id ?? 'corrida',
        ...defaults,
        date: defaults?.date ?? date ?? todayKey(),
      },
  )
  const set = (p: Partial<Workout>) => setDraft((d) => ({ ...d, ...p }))
  const modalities = useMemo(() => orderedModalities(db.profile.modalities, { keep: draft.modality }), [db.profile.modalities, draft.modality])
  const current = modalities.find((m) => m.id === draft.modality)
  const [showAll, setShowAll] = useState(false)
  const hiddenCount = modalities.filter((m) => !m.favorite && m.id !== draft.modality).length
  const shown = showAll ? modalities : modalities.filter((m) => m.favorite || m.id === draft.modality)
  const isRest = draft.status === 'descanso'
  const goals = db.workoutGoals.filter((g) => g.status === 'ativa' || g.id === draft.workoutGoalId)
  // Live, informational: what would this plan bump into? (never blocks saving)
  const conflicts = useMemo(
    () => (draft.date && draft.modality && !isRest ? draftConflicts(db, { ...draft, date: draft.date, modality: draft.modality }, existing?.id) : []),
    [db, draft, isRest, existing?.id],
  )
  const presencial = draft.date ? isPresencial(db.profile, draft.date) : false

  if (id && !existing) {
    return (
      <SheetLayout title="Treino" onClose={closeSheet}>
        <p className="text-muted text-[14px] pb-6">Esse treino não existe mais.</p>
      </SheetLayout>
    )
  }

  const save = () => {
    const d = draft.date ?? todayKey()
    const data = {
      ...draft,
      date: d,
      modality: draft.modality ?? REST_MODALITY,
      status: draft.status ?? 'planejado',
      plannedDistanceKm: current?.hasDistance ? draft.plannedDistanceKm : undefined,
      goal: draft.goal?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      title: draft.title?.trim() || undefined,
    }
    if (existing) {
      actions.update('workouts', existing.id, data)
      toast('Treino atualizado')
    } else {
      const dayItems = getDB().workouts.filter((w) => w.date === d)
      actions.create('workouts', { ...data, order: nextOrder(dayItems) } as Omit<Workout, 'id' | 'createdAt' | 'updatedAt'>)
      toast(isRest ? `Descanso marcado ${relativeDay(d)} 😴` : `Planejado pra ${relativeDay(d)} ✨`)
    }
    closeSheet()
  }

  const canLog = existing && existing.status !== 'descanso' && existing.date <= todayKey()

  return (
    <SheetLayout
      eyebrow={existing ? relativeDay(existing.date) : 'planejar'}
      title={existing ? 'Editar treino' : 'Novo treino'}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('workouts', existing.id, 'Treino apagado')
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save }}
      footerExtra={
        canLog ? (
          <Button variant="soft" size="lg" className="!w-auto flex-none px-5" icon={<Check size={17} />} onClick={() => replaceSheet('workoutLog', { id: existing.id })}>
            Registrar
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-2">
        {shown.map((m) => {
          const on = !isRest && draft.modality === m.id
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => set({ modality: m.id, status: isRest ? 'planejado' : draft.status })}
              className={cn(
                'inline-flex items-center gap-1.5 h-11 pl-3 pr-3.5 rounded-full text-[14px] border transition active:scale-[0.97]',
                on ? cn(tone(m.tone).soft, 'border-ink/60 font-medium text-ink') : 'bg-surface border-line text-ink-2',
              )}
            >
              <span className="text-[17px] leading-none">{m.emoji}</span>
              {m.label}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={isRest}
          onClick={() => set(isRest ? { status: 'planejado' } : { status: 'descanso', modality: REST_MODALITY })}
          className={cn(
            'inline-flex items-center gap-1.5 h-11 pl-3 pr-3.5 rounded-full text-[14px] border transition',
            isRest ? 'bg-ocean-soft border-ink/60 font-medium' : 'bg-surface border-dashed border-line text-ink-2',
          )}
        >
          <span className="text-[17px] leading-none">😴</span>
          Descanso
        </button>
        {!showAll && hiddenCount > 0 && (
          <button type="button" onClick={() => setShowAll(true)} className="h-11 px-3.5 rounded-full text-[13.5px] text-muted">
            + {hiddenCount} {hiddenCount === 1 ? 'outra' : 'outras'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Dia">
          <DateInput value={draft.date} onChange={(v) => set({ date: v ?? draft.date })} />
        </Field>
        {!isRest && (
          <Field label="Horário">
            <TimeInput value={draft.time} onChange={(time) => set({ time, ...(time ? { period: undefined } : {}) })} />
          </Field>
        )}
      </div>

      {!isRest && !draft.time && (
        <Field label="Sem horário? Escolhe um período">
          <ChipSelect value={draft.period} clearable onChange={(period) => set({ period })} options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
        </Field>
      )}

      {(presencial || conflicts.length > 0) && (
        <div className="space-y-2">
          {presencial && <div className="text-[12.5px] text-ink-2 px-0.5">📍 dia presencial{db.profile.work?.location ? ` · ${db.profile.work.location}` : ''}</div>}
          {conflicts.map((c) => (
            <div key={c.key} className={cn('rounded-2xl px-3.5 py-2.5 flex gap-2.5', c.severity === 'warn' ? 'bg-sand-soft' : 'bg-surface-2')} role="status">
              <AlertTriangle size={15} className={cn('shrink-0 mt-0.5', c.severity === 'warn' ? 'text-sand' : 'text-muted')} />
              <div className="text-[13px] leading-snug text-ink-2">
                {c.message.replace(/^⚠️\s*/, '')} <span className="text-muted">Dá pra salvar mesmo assim.</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isRest && (
        <Field label="Duração prevista">
          <div className="flex gap-2 items-center">
            {DURATIONS.map((m) => (
              <Chip key={m} selected={draft.plannedDurationMin === m} onClick={() => set({ plannedDurationMin: draft.plannedDurationMin === m ? undefined : m })}>
                {m < 60 ? `${m}min` : m === 60 ? '1h' : '1h30'}
              </Chip>
            ))}
            <NumberInput
              aria-label="Outra duração em minutos"
              placeholder="min"
              value={draft.plannedDurationMin && !DURATIONS.includes(draft.plannedDurationMin) ? draft.plannedDurationMin : undefined}
              onChange={(v) => set({ plannedDurationMin: v ? Math.round(v) : undefined })}
              className="w-[72px] h-9 py-0 text-center"
            />
          </div>
        </Field>
      )}

      {!isRest && (
        <Field label="Firmeza">
          <ChipSelect value={draft.planType} clearable onChange={(planType) => set({ planType })} options={PLAN_TYPES.map((p) => ({ value: p, label: PLAN_TYPE_LABEL[p].toLowerCase() }))} />
        </Field>
      )}

      <MoreOptions defaultOpen={!!existing && !!(existing.goal || existing.notes)}>
        {!isRest && current?.hasDistance && (
          <Field label="Distância prevista (km)">
            <NumberInput value={draft.plannedDistanceKm} onChange={(plannedDistanceKm) => set({ plannedDistanceKm })} placeholder="ex: 8" />
          </Field>
        )}
        {!isRest && (
          <Field label="Objetivo do treino">
            <TextInput value={draft.goal ?? ''} onChange={(e) => set({ goal: e.target.value })} placeholder="técnica, leve, rodagem, subidas…" />
          </Field>
        )}
        {!isRest && (
          <Field label="Intensidade">
            <ChipSelect value={draft.intensity} onChange={(intensity) => set({ intensity })} options={INTENSITY} clearable />
          </Field>
        )}
        <Field label="Status">
          <ChipSelect
            value={draft.status}
            onChange={(s) => set({ status: s ?? 'planejado', ...(s === 'descanso' ? { modality: REST_MODALITY } : {}) })}
            options={STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))}
          />
        </Field>
        {!isRest && (
          <Field label="Nome (opcional)">
            <TextInput value={draft.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={current?.label} />
          </Field>
        )}
        <Field label="Notas">
          <TextArea value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="treino da semana, local, playlist…" rows={2} />
        </Field>
        {goals.length > 0 && !isRest && (
          <Field label="Faz parte de um objetivo?">
            <Select
              value={draft.workoutGoalId}
              onChange={(workoutGoalId) => set({ workoutGoalId })}
              placeholder="nenhum"
              options={goals.map((g) => ({ value: g.id, label: g.title }))}
            />
          </Field>
        )}
      </MoreOptions>
    </SheetLayout>
  )
}
