/** Meus alimentos: create/edit a product from its label (porção + 4 números). */
import { useState } from 'react'
import { useDB } from '@/data/store'
import type { FoodItem, ID } from '@/data/types'
import { toast } from '@/app/ui-store'
import { Field, MoreOptions, NumberInput, SheetLayout, TextInput, TitleInput } from '@/components/ui'
import { removeMyFood, saveMyFood, updateMyFood } from '@/data/nutrition'
import { haptic } from '@/lib/haptics'
import { closeNutritionSheet } from './sheet-host'

export function LabelNumbers({ value, onChange }: { value: Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat', number>>; onChange: (v: Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat', number>>) => void }) {
  const set = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => (v: number | undefined) => onChange({ ...value, [k]: v })
  return (
    <div className="grid grid-cols-4 gap-2">
      {(
        [
          ['protein', 'prot. g'],
          ['carbs', 'carbo g'],
          ['fat', 'gord. g'],
          ['kcal', 'kcal'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="block">
          <span className="block text-[11.5px] text-muted mb-1 px-0.5">{label}</span>
          <NumberInput inputMode="decimal" value={value[k]} onChange={set(k)} className="px-2.5 text-center" aria-label={label} />
        </label>
      ))}
    </div>
  )
}

export default function MyFoodSheet({ id, defaults }: { id?: ID; defaults?: Partial<FoodItem> }) {
  const foods = useDB((db) => db.foods)
  const existing = id ? foods.find((f) => f.id === id) : undefined
  const init = existing ?? defaults
  const [name, setName] = useState(init?.name ?? '')
  const [serving, setServing] = useState(init?.serving?.label ?? '1 unidade')
  const [nums, setNums] = useState<Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat', number>>>(init?.nutrients ?? {})
  const [fiber, setFiber] = useState<number | undefined>(init?.nutrients?.fiber)
  const [aliases, setAliases] = useState((init?.aliases ?? []).join(', '))
  const [note, setNote] = useState(init?.sourceNote ?? 'rótulo')

  if (id && !existing) {
    return (
      <SheetLayout title="Meus alimentos" onClose={closeNutritionSheet}>
        <p className="text-muted text-[14px] pb-6">Esse alimento não existe mais.</p>
      </SheetLayout>
    )
  }

  const hasNumbers = nums.protein != null || nums.carbs != null || nums.fat != null || nums.kcal != null
  const save = () => {
    const n = name.trim()
    if (!n) return
    const p = nums.protein ?? 0
    const c = nums.carbs ?? 0
    const g = nums.fat ?? 0
    const nutrients = { kcal: nums.kcal ?? Math.round(p * 4 + c * 4 + g * 9), protein: p, carbs: c, fat: g, ...(fiber != null ? { fiber } : {}) }
    const data = {
      name: n,
      serving: { label: serving.trim() || '1 unidade' },
      nutrients,
      confidence: hasNumbers ? ('label' as const) : ('unknown' as const),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      sourceNote: note.trim() || undefined,
      emoji: init?.emoji,
    }
    if (existing) {
      const undo = updateMyFood(existing.id, data)
      toast('Atualizado ✓', { action: { label: 'Desfazer', run: undo } })
    } else {
      const { undo } = saveMyFood(data)
      haptic('success')
      toast(`${n} salvo em Meus alimentos ✓`, { action: { label: 'Desfazer', run: undo } })
    }
    closeNutritionSheet()
  }

  return (
    <SheetLayout
      eyebrow="meus alimentos"
      title={existing ? 'Editar alimento' : 'Novo alimento'}
      onClose={closeNutritionSheet}
      onDelete={
        existing
          ? () => {
              closeNutritionSheet()
              const undo = removeMyFood(existing.id)
              toast('Apagado', { action: { label: 'Desfazer', run: undo } })
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save, disabled: !name.trim() }}
    >
      <TitleInput autoFocus={!existing} placeholder="Nome (ex.: YoPRO morango)" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="Porção do rótulo">
        <TextInput value={serving} onChange={(e) => setServing(e.target.value)} placeholder="1 garrafa (250 ml)" />
      </Field>
      <Field label="Por porção" hint="Copie do rótulo. Sem números? Pode salvar assim mesmo — fica sem números.">
        <LabelNumbers value={nums} onChange={setNums} />
      </Field>
      <MoreOptions>
        <Field label="Fibra (g)">
          <NumberInput inputMode="decimal" value={fiber} onChange={setFiber} />
        </Field>
        <Field label="Outros nomes" hint="Separados por vírgula — é como você escreve no dia a dia.">
          <TextInput value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="yopro, iogurte proteico" />
        </Field>
        <Field label="Fonte dos números">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="rótulo" />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
