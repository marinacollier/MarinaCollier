import { useState } from 'react'
import { Star } from 'lucide-react'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { FoodTag, MealSlot } from '@/data/types'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { ChipSelect, DateInput, Field, MoreOptions, MultiChipSelect, SheetLayout, TitleInput } from '@/components/ui'
import { minutesOfDay, relativeDay, todayKey } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { FOOD_TAGS, SLOT_LABEL } from './constants'
import { applyMealTags } from './mutations'
import { slotForMinutes } from './selectors'

const SLOT_OPTIONS: { value: MealSlot; label: string }[] = (['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'extra'] as MealSlot[]).map((s) => ({
  value: s,
  label: SLOT_LABEL[s],
}))

export default function MealSheet({ id, date, slot }: SheetProps<'meal'>) {
  const db = useDB()
  const existing = id ? db.meals.find((m) => m.id === id) : undefined
  const [mealDate, setMealDate] = useState(existing?.date ?? date ?? todayKey())
  const [mealSlot, setSlot] = useState<MealSlot>(existing?.slot ?? slot ?? slotForMinutes(minutesOfDay()))
  const [description, setDescription] = useState(existing?.description ?? '')
  const [tags, setTags] = useState<FoodTag[]>(existing?.tags ?? [])
  const [planned, setPlanned] = useState(existing?.planned ?? false)
  const [templateId, setTemplateId] = useState(existing?.templateId)
  const [saveAsFavorite, setSaveAsFavorite] = useState(false)
  const templates = [...db.mealTemplates].sort((a, b) => a.order - b.order)

  if (id && !existing) {
    return (
      <SheetLayout title="Refeição" onClose={closeSheet}>
        <p className="text-muted text-[14px] pb-6">Essa refeição não existe mais.</p>
      </SheetLayout>
    )
  }

  const save = () => {
    const text = description.trim()
    if (!text) return
    const data = { date: mealDate, slot: mealSlot, description: text, tags, planned, templateId, done: true }
    if (existing) actions.update('meals', existing.id, data)
    else actions.create('meals', data)
    applyMealTags(mealDate, tags, planned)
    if (saveAsFavorite && !getDB().mealTemplates.some((t) => t.description.toLowerCase() === text.toLowerCase())) {
      actions.create('mealTemplates', { name: text.slice(0, 40), description: text, slot: mealSlot, tags, order: nextOrder(getDB().mealTemplates) })
    }
    haptic('light')
    toast(existing ? 'Refeição atualizada' : `${SLOT_LABEL[mealSlot]} registrado 🥗`)
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow={relativeDay(mealDate)}
      title={existing ? 'Editar refeição' : 'Registrar refeição'}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('meals', existing.id, 'Refeição apagada')
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save, disabled: !description.trim() }}
    >
      <ChipSelect value={mealSlot} onChange={(v) => v && setSlot(v)} options={SLOT_OPTIONS.filter((o) => o.value !== 'extra')} />

      {templates.length > 0 && !existing && (
        <div>
          <div className="eyebrow mb-2">favoritas</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  haptic('light')
                  setDescription(t.description)
                  setTags(t.tags)
                  setTemplateId(t.id)
                  if (t.slot) setSlot(t.slot)
                }}
                className={cn(
                  'shrink-0 max-w-[200px] text-left rounded-2xl px-3.5 py-2.5 border transition active:scale-[0.98]',
                  templateId === t.id ? 'bg-sage-soft border-sage' : 'bg-surface-2 border-transparent',
                )}
              >
                <div className="text-[14px] font-medium truncate">{t.name}</div>
                <div className="text-[12px] text-muted truncate">{FOOD_TAGS.filter((f) => t.tags.includes(f.value)).map((f) => f.emoji).join(' ') || t.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <TitleInput
        autoFocus={!existing}
        placeholder="O que comi?"
        value={description}
        onChange={(e) => {
          setDescription(e.target.value)
          setTemplateId(undefined)
        }}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />

      <MultiChipSelect
        value={tags}
        onChange={setTags}
        options={FOOD_TAGS.map((t) => ({
          value: t.value,
          label: (
            <>
              <span>{t.emoji}</span>
              {t.label}
            </>
          ),
        }))}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={planned}
          onClick={() => setPlanned((p) => !p)}
          className={cn('h-10 px-3.5 rounded-full text-[13.5px] border transition', planned ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2')}
        >
          📝 foi planejada
        </button>
        {!templateId && (
          <button
            type="button"
            aria-pressed={saveAsFavorite}
            onClick={() => setSaveAsFavorite((s) => !s)}
            className={cn('h-10 px-3.5 rounded-full text-[13.5px] border transition inline-flex items-center gap-1.5', saveAsFavorite ? 'bg-sand-soft border-sand text-ink' : 'bg-surface border-line text-ink-2')}
          >
            <Star size={14} className={saveAsFavorite ? 'fill-sand text-sand' : ''} /> salvar como favorita
          </button>
        )}
      </div>

      <MoreOptions>
        <Field label="Dia">
          <DateInput value={mealDate} onChange={(v) => v && setMealDate(v)} />
        </Field>
        <Field label="Outro momento">
          <ChipSelect value={mealSlot} onChange={(v) => v && setSlot(v)} options={SLOT_OPTIONS.filter((o) => o.value === 'extra')} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
