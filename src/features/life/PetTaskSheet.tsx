import { useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { PetTaskCategory, Recurrence } from '@/data/types'
import {
  ChipSelect,
  DateInput,
  Field,
  MoreOptions,
  RecurrencePicker,
  Segmented,
  SheetLayout,
  TextArea,
  TitleInput,
} from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { haptic } from '@/lib/haptics'
import { lunaOf, PET_CATEGORIES } from './selectors'
import { SEED_IDS } from '@/data/seed/ids'

export default function PetTaskSheet({ id, defaults }: SheetProps<'petTask'>) {
  const existing = useDB((db) => (id ? db.petTasks.find((t) => t.id === id) : undefined))
  const today = useToday()

  const [title, setTitle] = useState(existing?.title ?? defaults?.title ?? '')
  const [category, setCategory] = useState<PetTaskCategory>(existing?.category ?? defaults?.category ?? 'lembrete')
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(existing ? existing.recurrence : defaults?.recurrence)
  const [dueDate, setDueDate] = useState<string | undefined>(existing ? existing.dueDate : defaults?.dueDate)
  const [notes, setNotes] = useState(existing?.notes ?? defaults?.notes ?? '')
  const [active, setActive] = useState(existing?.active ?? defaults?.active ?? true)

  const onRecurrence = (r: Recurrence | undefined) => {
    // "a cada X dias" for pets almost always means "from the last time we did it".
    if (r?.kind === 'every_n_days' && recurrence?.kind !== 'every_n_days') {
      setRecurrence({ ...r, anchor: today, fromLastDone: true })
    } else setRecurrence(r)
  }

  const save = () => {
    const t = title.trim()
    if (!t) return
    const data = {
      title: t,
      category,
      recurrence,
      dueDate: recurrence ? undefined : dueDate,
      notes: notes.trim() || undefined,
      active,
    }
    if (existing) {
      actions.update('petTasks', existing.id, data)
      toast('Salvo 🐾')
    } else {
      const db = getDB()
      actions.create('petTasks', { ...data, petId: defaults?.petId ?? lunaOf(db)?.id ?? SEED_IDS.petLuna, order: nextOrder(db.petTasks) })
      haptic('light')
      toast('Anotado pra Luna 🐾')
    }
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow="Luna 🐾"
      title={existing ? 'Editar cuidado' : 'Novo cuidado'}
      primary={{ label: existing ? 'Salvar' : 'Adicionar', onClick: save, disabled: !title.trim() }}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('petTasks', existing.id, 'Cuidado apagado')
            }
          : undefined
      }
      onClose={closeSheet}
    >
      <TitleInput
        autoFocus={!existing}
        placeholder="O que a Luna precisa?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      <ChipSelect
        value={category}
        onChange={(v) => v && setCategory(v)}
        options={PET_CATEGORIES.map((c) => ({ value: c.value, label: `${c.emoji} ${c.label}` }))}
      />
      <Field label="Repete?">
        <RecurrencePicker value={recurrence} onChange={onRecurrence} allowNone />
      </Field>
      {recurrence?.kind === 'every_n_days' && (
        <p className="text-[13px] text-muted -mt-2 px-0.5">
          {recurrence.fromLastDone
            ? 'Conta a partir da última vez que você marcou como feito.'
            : 'Conta a partir de uma data fixa.'}{' '}
          <button
            type="button"
            className="underline underline-offset-2 text-ink-2"
            onClick={() => setRecurrence({ ...recurrence, fromLastDone: !recurrence.fromLastDone })}
          >
            {recurrence.fromLastDone ? 'usar data fixa' : 'contar da última vez'}
          </button>
        </p>
      )}
      {recurrence?.kind === 'every_n_days' && !recurrence.fromLastDone && (
        <Field label="A partir de">
          <DateInput value={recurrence.anchor} onChange={(v) => v && setRecurrence({ ...recurrence, anchor: v })} />
        </Field>
      )}
      {!recurrence && (
        <Field label="Quando" hint="opcional — sem data fica como anotação, sem cobrança">
          <DateInput value={dueDate} onChange={setDueDate} />
        </Field>
      )}
      <MoreOptions defaultOpen={!!existing && (!!existing.notes || !existing.active)}>
        <Field label="Notas">
          <TextArea placeholder="marca, dose, contato…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Status">
          <Segmented
            value={active ? 'on' : 'off'}
            onChange={(v) => setActive(v === 'on')}
            options={[
              { value: 'on', label: 'Ativo' },
              { value: 'off', label: 'Pausado / feito' },
            ]}
          />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
