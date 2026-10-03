import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { FoodTag, MealPurpose, MealSlot } from '@/data/types'
import { modalityOf } from '@/data/selectors'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { ChipSelect, DateInput, Field, MoreOptions, MultiChipSelect, SheetLayout, TimeInput, TitleInput } from '@/components/ui'
import { consumedTimeOf } from '@/data/nutrition'
import { hmToMinutes, minutesOfDay, relativeDay, toInstant, todayKey } from '@/lib/date'
import { MEAL_PURPOSE_LABEL, SLOT_MINUTES, suggestMealLink } from './mealLink'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { FOOD_TAGS, SLOT_LABEL } from './constants'
import { applyMealTags } from './mutations'
import { slotForMinutes } from './selectors'
import { FoodComposer } from '@/features/nutrition/FoodComposer'

const SLOT_OPTIONS: { value: MealSlot; label: string }[] = (['cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'extra'] as MealSlot[]).map((s) => ({
  value: s,
  label: SLOT_LABEL[s],
}))

const PURPOSES: MealPurpose[] = ['pre_treino', 'intra_treino', 'pos_treino', 'recovery', 'prep_dia_anterior', 'pre_long_run', 'post_long_run', 'pre_long_ride', 'post_long_ride', 'geral']

/** New meal → the smart composer ("o que você comeu?"); existing meal → edit form. */
export default function MealSheet(props: SheetProps<'meal'>) {
  return props.id ? <EditMealSheet {...props} /> : <FoodComposer date={props.date} slot={props.slot} />
}

function EditMealSheet({ id, date, slot }: SheetProps<'meal'>) {
  const db = useDB()
  const existing = id ? db.meals.find((m) => m.id === id) : undefined
  const [mealDate, setMealDate] = useState(existing?.date ?? date ?? todayKey())
  const [mealSlot, setSlot] = useState<MealSlot>(existing?.slot ?? slot ?? slotForMinutes(minutesOfDay()))
  const [description, setDescription] = useState(existing?.description ?? '')
  const [tags, setTags] = useState<FoodTag[]>(existing?.tags ?? [])
  const [planned, setPlanned] = useState(existing?.planned ?? false)
  const [templateId, setTemplateId] = useState(existing?.templateId)
  const [saveAsFavorite, setSaveAsFavorite] = useState(false)
  const [purpose, setPurpose] = useState<MealPurpose | undefined>(existing?.purpose)
  const [workoutId, setWorkoutId] = useState<string | undefined>(existing?.workoutId)
  const [linkTouched, setLinkTouched] = useState(!!existing)
  const [timeVal, setTimeVal] = useState<string | undefined>(existing ? consumedTimeOf(existing) : undefined)
  const suggestion = useMemo(() => suggestMealLink(db, mealDate, existing?.time ? hmToMinutes(existing.time) : SLOT_MINUTES[mealSlot]), [db, mealDate, mealSlot, existing?.time])
  // Until Marina touches it, follow the suggestion (moment of the day changes → suggestion changes).
  const linkedId = linkTouched ? workoutId : suggestion?.workout.id
  const linkedPurpose = linkTouched ? purpose : suggestion?.purpose
  const linked = linkedId ? db.workouts.find((w) => w.id === linkedId) : undefined
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
    const timeChanged = !!existing && timeVal !== consumedTimeOf(existing)
    const data = {
      date: mealDate,
      slot: mealSlot,
      description: text,
      tags,
      planned,
      templateId,
      done: true,
      purpose: linkedPurpose,
      workoutId: linked?.id,
      ...(timeChanged ? { time: timeVal, consumedAt: timeVal ? toInstant(mealDate, timeVal).toISOString() : undefined } : {}),
    }
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

      {(linked || suggestion || linkedPurpose) && (
        <div className="rounded-2xl bg-surface-2 p-3 space-y-2.5">
          {linked ? (
            <div className="flex items-center gap-2 text-[13.5px]">
              <span className="text-[16px]">{modalityOf(db, linked.modality).emoji}</span>
              <span className="flex-1 min-w-0 truncate">
                ligada a {(linked.title ?? modalityOf(db, linked.modality).label).toLowerCase()}
                {linked.date !== mealDate ? ` (${relativeDay(linked.date)})` : ''}
                {linked.time ? ` · ${linked.time}` : ''}
              </span>
              <button
                type="button"
                className="h-8 px-2.5 text-[12.5px] text-muted"
                onClick={() => {
                  setLinkTouched(true)
                  setWorkoutId(undefined)
                  setPurpose(linkedPurpose)
                }}
              >
                desligar
              </button>
            </div>
          ) : suggestion ? (
            <button
              type="button"
              className="text-[13.5px] text-ink-2 h-8"
              onClick={() => {
                setLinkTouched(true)
                setWorkoutId(suggestion.workout.id)
                setPurpose(suggestion.purpose)
              }}
            >
              + ligar a {(suggestion.workout.title ?? modalityOf(db, suggestion.workout.modality).label).toLowerCase()}
            </button>
          ) : null}
          <ChipSelect
            value={linkedPurpose}
            clearable
            onChange={(v) => {
              setLinkTouched(true)
              setWorkoutId(linkedId)
              setPurpose(v)
            }}
            options={PURPOSES.map((p) => ({ value: p, label: MEAL_PURPOSE_LABEL[p] }))}
          />
        </div>
      )}

      {existing?.foods && existing.foods.length > 0 && (
        <div className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
          <div className="eyebrow mb-1">o que entrou</div>
          <ul className="space-y-1">
            {existing.foods.map((f, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="min-w-0 truncate">
                  {f.qty !== 1 ? `${f.qty} × ` : ''}
                  {f.name}
                </span>
                <span className="text-[12px] text-muted shrink-0">
                  {f.nutrients ? `P ${Math.round(f.nutrients.protein)} · C ${Math.round(f.nutrients.carbs)} · G ${Math.round(f.nutrients.fat)}` : 'sem números'}
                  {f.confidence === 'estimated' ? ' · estimativa' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Field label="Horário" hint={existing?.plannedTime ? `planejado ${existing.plannedTime}` : undefined}>
        <TimeInput value={timeVal} onChange={setTimeVal} />
      </Field>

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
