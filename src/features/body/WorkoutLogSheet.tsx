import { useState } from 'react'
import { actions, useDB } from '@/data/store'
import type { Workout } from '@/data/types'
import { modalityOf } from '@/data/selectors'
import { closeSheet, replaceSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { Field, NumberInput, SheetLayout, TextArea } from '@/components/ui'
import { relativeDay } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { FEELINGS } from './constants'
import { EmojiScale, ModalityIcon } from './components'

export default function WorkoutLogSheet({ id }: SheetProps<'workoutLog'>) {
  const db = useDB()
  const w = db.workouts.find((x) => x.id === id)
  const [status, setStatus] = useState<'feito' | 'adaptado'>(w?.status === 'adaptado' ? 'adaptado' : 'feito')
  const [durationMin, setDuration] = useState<number | undefined>(w?.durationMin ?? w?.plannedDurationMin)
  const [distanceKm, setDistance] = useState<number | undefined>(w?.distanceKm ?? w?.plannedDistanceKm)
  const [feeling, setFeeling] = useState<Workout['feeling']>(w?.feeling)
  const [notes, setNotes] = useState(w?.notes ?? '')

  if (!w) {
    return (
      <SheetLayout title="Registrar treino" onClose={closeSheet}>
        <p className="text-muted text-[14px] pb-6">Esse treino não existe mais.</p>
      </SheetLayout>
    )
  }
  const m = modalityOf(db, w.modality)

  const save = () => {
    actions.update('workouts', w.id, {
      status,
      durationMin: durationMin ? Math.round(durationMin) : undefined,
      distanceKm: m.hasDistance ? distanceKm : undefined,
      feeling,
      notes: notes.trim() || undefined,
    })
    haptic('success')
    toast('Treino registrado 💪', { tone: 'win' })
    // Key sessions get a quick "como foi?" (energia, treino, nutrição, recuperação) — never mandatory.
    if (w.isKeySession && (status === 'feito' || status === 'adaptado') && !w.postCheckin) replaceSheet('postWorkoutCheckin', { workoutId: w.id })
    else closeSheet()
  }

  return (
    <SheetLayout eyebrow={relativeDay(w.date)} title={w.title || m.label} onClose={closeSheet} primary={{ label: 'Salvar registro', onClick: save }}>
      <div className="flex items-center gap-3">
        <ModalityIcon modality={m} />
        <div className="text-[14px] text-muted leading-snug">{w.goal ? `objetivo: ${w.goal}` : 'Como foi? Só o essencial.'}</div>
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como foi">
        {(
          [
            { v: 'feito', label: 'Concluído', emoji: '✓', hint: 'como planejado' },
            { v: 'adaptado', label: 'Adaptado', emoji: '↺', hint: 'mudou no caminho' },
          ] as const
        ).map((o) => {
          const on = status === o.v
          return (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setStatus(o.v)}
              className={cn(
                'rounded-2xl p-3.5 text-left transition active:scale-[0.98] border',
                on ? (o.v === 'feito' ? 'bg-sage-soft border-sage' : 'bg-sand-soft border-sand') : 'bg-surface-2 border-transparent',
              )}
            >
              <div className="font-display text-[19px] leading-tight">
                {o.emoji} {o.label}
              </div>
              <div className="text-[12.5px] text-muted mt-0.5">{o.hint}</div>
            </button>
          )
        })}
      </div>

      <div className={cn('grid gap-3', m.hasDistance ? 'grid-cols-2' : 'grid-cols-1')}>
        <Field label="Duração (min)">
          <NumberInput value={durationMin} onChange={setDuration} placeholder="45" />
        </Field>
        {m.hasDistance && (
          <Field label="Distância (km)">
            <NumberInput value={distanceKm} onChange={setDistance} placeholder="ex: 6,5" />
          </Field>
        )}
      </div>

      <Field label="Como me senti">
        <EmojiScale label="Como me senti" options={FEELINGS} value={feeling} onChange={setFeeling} />
      </Field>

      <Field label="Observação">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="o que vale lembrar? (opcional)" />
      </Field>
    </SheetLayout>
  )
}
