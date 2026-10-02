import { useState } from 'react'
import { X } from 'lucide-react'
import { actions, useDB } from '@/data/store'
import type { NutritionSource } from '@/data/types'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { Chip, ChipSelect, Field, MoreOptions, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { haptic } from '@/lib/haptics'

/** Common training tags a strategy can be linked to (free tags can be added too). */
const COMMON_TAGS: { value: string; label: string }[] = [
  { value: 'long-run', label: '🏃 corrida longa' },
  { value: 'long-ride', label: '🚴 pedal longo' },
  { value: 'long-session', label: 'sessão longa' },
  { value: 'pernas', label: '🦵 pernas' },
  { value: 'leg-day', label: 'leg day' },
  { value: 'key-session', label: '🔥 key session' },
  { value: 'natacao', label: '🏊 natação' },
  { value: 'musculacao', label: '🏋️ musculação' },
  { value: 'corrida', label: 'corrida' },
  { value: 'bike', label: 'bike' },
]

const SOURCES: { value: NutritionSource; label: string }[] = [
  { value: 'nutricionista', label: 'nutricionista' },
  { value: 'usuaria', label: 'eu' },
  { value: 'outro_profissional', label: 'outro profissional' },
]

export default function NutritionStrategySheet({ id }: SheetProps<'nutritionStrategy'>) {
  const existing = useDB((db) => (id ? db.nutritionStrategies.find((s) => s.id === id) : undefined))
  const [name, setName] = useState(existing?.name ?? '')
  const [types, setTypes] = useState<string[]>(existing?.linkedWorkoutTypes ?? [])
  const [freeTag, setFreeTag] = useState('')
  const [prev, setPrev] = useState(existing?.previousDayInstructions ?? '')
  const [pre, setPre] = useState(existing?.preWorkoutInstructions ?? '')
  const [during, setDuring] = useState(existing?.duringWorkoutInstructions ?? '')
  const [post, setPost] = useState(existing?.postWorkoutInstructions ?? '')
  const [timing, setTiming] = useState(existing?.timing ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [source, setSource] = useState<NutritionSource>(existing?.source ?? 'nutricionista')
  const [sourceName, setSourceName] = useState(existing?.sourceName ?? '')

  if (id && !existing) {
    return (
      <SheetLayout title="Estratégia" onClose={closeSheet}>
        <p className="text-muted text-[14px] pb-6">Essa estratégia não existe mais.</p>
      </SheetLayout>
    )
  }

  const toggleType = (t: string) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const addFree = () => {
    const t = freeTag.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !types.includes(t)) setTypes([...types, t])
    setFreeTag('')
  }
  const opt = (s: string) => s.trim() || undefined

  const save = () => {
    if (!name.trim()) return
    const data = {
      name: name.trim(),
      linkedWorkoutTypes: types,
      previousDayInstructions: opt(prev),
      preWorkoutInstructions: opt(pre),
      duringWorkoutInstructions: opt(during),
      postWorkoutInstructions: opt(post),
      timing: opt(timing),
      notes: opt(notes),
      source,
      sourceName: opt(sourceName),
    }
    if (existing) actions.update('nutritionStrategies', existing.id, data)
    else actions.create('nutritionStrategies', data)
    haptic('light')
    toast(existing ? 'Estratégia atualizada' : 'Estratégia salva 🍽️')
    closeSheet()
  }

  const custom = types.filter((t) => !COMMON_TAGS.some((c) => c.value === t))

  return (
    <SheetLayout
      eyebrow="estratégia por treino"
      title={existing ? 'Editar estratégia' : 'Nova estratégia'}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('nutritionStrategies', existing.id, 'Estratégia apagada')
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save, disabled: !name.trim() }}
    >
      <TitleInput autoFocus={!existing} placeholder="Ex.: Corrida longa" value={name} onChange={(e) => setName(e.target.value)} />
      <p className="text-[12.5px] text-muted -mt-2">Guarde aqui o que você ou o nutri definiram. O app só mostra — não calcula nem sugere.</p>

      <Field label="Aparece nos treinos com">
        <div className="flex flex-wrap gap-2">
          {COMMON_TAGS.map((t) => (
            <Chip key={t.value} selected={types.includes(t.value)} onClick={() => toggleType(t.value)}>
              {t.label}
            </Chip>
          ))}
          {custom.map((t) => (
            <Chip key={t} selected onClick={() => toggleType(t)}>
              {t} <X size={13} />
            </Chip>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <TextInput placeholder="outra tag" value={freeTag} onChange={(e) => setFreeTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFree()} />
        </div>
      </Field>

      <Field label="Dia anterior / noite anterior">
        <TextArea rows={3} value={prev} onChange={(e) => setPrev(e.target.value)} />
      </Field>
      <Field label="Antes (pré)">
        <TextArea rows={3} value={pre} onChange={(e) => setPre(e.target.value)} />
      </Field>
      <Field label="Durante (intra)">
        <TextArea rows={3} value={during} onChange={(e) => setDuring(e.target.value)} />
      </Field>
      <Field label="Depois (pós)">
        <TextArea rows={3} value={post} onChange={(e) => setPost(e.target.value)} />
      </Field>

      <MoreOptions defaultOpen={!!existing}>
        <Field label="Horários">
          <TextInput placeholder="Ex.: pré 05:00 · pós 08:00" value={timing} onChange={(e) => setTiming(e.target.value)} />
        </Field>
        <Field label="Notas do nutri">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Quem orientou">
          <ChipSelect value={source} onChange={(v) => v && setSource(v)} options={SOURCES} />
        </Field>
        <Field label="Nome (opcional)">
          <TextInput placeholder="Ex.: nome do profissional" value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
