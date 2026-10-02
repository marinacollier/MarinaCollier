import { useState } from 'react'
import { useDB } from '@/data/store'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { ChipSelect, Field, SheetLayout, TextArea } from '@/components/ui'
import { relativeDay } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { workoutEmoji, workoutTitle } from './format'
import { savePostCheckin, type CheckinPatch as Patch } from './mutations'

const ENERGIA = [
  { value: 'baixa', label: 'baixa' },
  { value: 'ok', label: 'ok' },
  { value: 'otima', label: 'ótima' },
] as const
const TREINO = [
  { value: 'mais_facil', label: 'mais fácil' },
  { value: 'esperado', label: 'esperado' },
  { value: 'mais_dificil', label: 'mais difícil' },
] as const
const NUTRICAO = [
  { value: 'funcionou', label: 'funcionou' },
  { value: 'ajustar', label: 'ajustar' },
  { value: 'nao_usei', label: 'não usei' },
] as const
const RECUPERACAO = [
  { value: 'boa', label: 'boa' },
  { value: 'atencao', label: 'atenção' },
] as const

export default function PostWorkoutCheckinSheet({ workoutId }: SheetProps<'postWorkoutCheckin'>) {
  const w = useDB((db) => db.workouts.find((x) => x.id === workoutId))
  const profile = useDB((db) => db.profile)
  const [nota, setNota] = useState(w?.postCheckin?.nota ?? '')

  if (!w) {
    return (
      <SheetLayout title="Como foi?" onClose={closeSheet}>
        <p className="text-muted text-[14px] pb-6">Esse treino não existe mais.</p>
      </SheetLayout>
    )
  }
  const c = w.postCheckin
  const set = (patch: Patch) => {
    haptic('light')
    savePostCheckin(w.id, patch)
  }
  const finish = () => {
    if (nota.trim() !== (c?.nota ?? '')) savePostCheckin(w.id, { nota: nota.trim() || undefined })
    toast('Anotado 💛')
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow={`${workoutEmoji(profile, w)} ${workoutTitle(profile, w)} · ${relativeDay(w.date)}`}
      title="Como foi?"
      onClose={closeSheet}
      primary={{ label: 'Pronto', onClick: finish }}
    >
      <Field label="Energia">
        <ChipSelect clearable value={c?.energia} onChange={(v) => set({ energia: v })} options={[...ENERGIA]} />
      </Field>
      <Field label="Treino">
        <ChipSelect clearable value={c?.treino} onChange={(v) => set({ treino: v })} options={[...TREINO]} />
      </Field>
      <Field label="Nutrição">
        <ChipSelect clearable value={c?.nutricao} onChange={(v) => set({ nutricao: v })} options={[...NUTRICAO]} />
      </Field>
      <Field label="Recuperação">
        <ChipSelect clearable value={c?.recuperacao} onChange={(v) => set({ recuperacao: v })} options={[...RECUPERACAO]} />
      </Field>
      <Field label="Nota (opcional)">
        <TextArea rows={2} placeholder="algo pra lembrar ou contar pro nutri" value={nota} onChange={(e) => setNota(e.target.value)} />
      </Field>
    </SheetLayout>
  )
}
