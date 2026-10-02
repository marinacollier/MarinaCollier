import { useState } from 'react'
import { actions, useDB } from '@/data/store'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { DateInput, Field, MoreOptions, NumberInput, SheetLayout, TextArea, TextInput } from '@/components/ui'
import { todayKey } from '@/lib/date'
import { cn } from '@/lib/cn'

export default function BodyCompositionSheet({ id }: SheetProps<'bodyComposition'>) {
  const existing = useDB((db) => (id ? db.bodyComposition.find((b) => b.id === id) : undefined))
  const [date, setDate] = useState<string | undefined>(existing ? existing.date : todayKey())
  const [label, setLabel] = useState(existing?.label ?? '')
  const [weightKg, setWeight] = useState(existing?.weightKg)
  const [bodyFatPct, setFat] = useState(existing?.bodyFatPct)
  const [fatMassKg, setFatMass] = useState(existing?.fatMassKg)
  const [skeletalMuscleKg, setMuscle] = useState(existing?.skeletalMuscleKg)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [historical, setHistorical] = useState(existing?.historical ?? false)

  if (id && !existing) {
    return (
      <SheetLayout title="Composição corporal" onClose={closeSheet}>
        <p className="text-muted text-[14px] pb-6">Esse registro não existe mais.</p>
      </SheetLayout>
    )
  }

  const any = [weightKg, bodyFatPct, fatMassKg, skeletalMuscleKg].some((v) => v != null)
  const save = () => {
    if (!any) return
    const data = {
      date,
      label: label.trim() || undefined,
      weightKg,
      bodyFatPct,
      fatMassKg,
      skeletalMuscleKg,
      notes: notes.trim() || undefined,
      historical: historical || undefined,
    }
    if (existing) actions.update('bodyComposition', existing.id, data)
    else actions.create('bodyComposition', data)
    toast(existing ? 'Registro atualizado' : 'Registro guardado')
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow="corpo · evolução"
      title={existing ? 'Editar registro' : 'Novo registro'}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('bodyComposition', existing.id, 'Registro apagado')
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save, disabled: !any }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Peso (kg)">
          <NumberInput value={weightKg} onChange={setWeight} placeholder="—" />
        </Field>
        <Field label="Gordura (%)">
          <NumberInput value={bodyFatPct} onChange={setFat} placeholder="—" />
        </Field>
        <Field label="Massa de gordura (kg)">
          <NumberInput value={fatMassKg} onChange={setFatMass} placeholder="—" />
        </Field>
        <Field label="Massa muscular (kg)">
          <NumberInput value={skeletalMuscleKg} onChange={setMuscle} placeholder="—" />
        </Field>
      </div>
      <Field label="Data">
        <DateInput value={date} onChange={setDate} />
      </Field>
      <MoreOptions defaultOpen={!!existing?.label || !!existing?.notes}>
        <Field label="Nome">
          <TextInput placeholder="Ex.: Bioimpedância clínica" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Notas">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button
          type="button"
          aria-pressed={historical}
          onClick={() => setHistorical((h) => !h)}
          className={cn('h-10 px-3.5 rounded-full text-[13.5px] border transition', historical ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2')}
        >
          só histórico (não é meta)
        </button>
      </MoreOptions>
    </SheetLayout>
  )
}
