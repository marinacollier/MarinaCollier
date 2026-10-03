import { useMemo, useState } from 'react'
import { ArrowUp, ChevronDown, Trash2 } from 'lucide-react'
import { closeSheet } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { Chip, ChipSelect, EmptyState, Field, MoreOptions, NumberInput, SheetLayout, SortableList, TimeInput, TitleInput, WeekdayPicker } from '@/components/ui'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { Recurrence, RoutineItem, TimeMode, Weekday } from '@/data/types'
import { itemDuration, itemTimeMode } from '@/data/timeline'
import { describeRecurrence } from '@/lib/recurrence'
import { cn } from '@/lib/cn'
import { lastGrapheme } from './refs'

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

function weekdaysOf(r: Recurrence): Weekday[] {
  if (r.kind === 'daily') return ALL_DAYS
  if (r.kind === 'weekly') return r.weekdays
  return ALL_DAYS
}

const MODES: { value: TimeMode; label: string }[] = [
  { value: 'fixed', label: 'Horário fixo' },
  { value: 'sequence', label: 'Em sequência' },
  { value: 'window', label: 'Janela' },
  { value: 'anytime', label: 'Qualquer momento' },
]

/** "04:40", "em sequência · 10 min", "05:00–05:30", "qualquer momento". */
export function timeLabel(item: RoutineItem): string {
  const mode = itemTimeMode(item)
  if (mode === 'fixed' && item.time) return item.time
  if (mode === 'window' && item.window) return `${item.window.start}–${item.window.end}`
  if (mode === 'anytime') return 'qualquer hora'
  return `em seq. · ${itemDuration(item)}min`
}

/** Time settings of one item: mode, time/window, duration; step minutes in "mais opções". */
function TimeFields({ item }: { item: RoutineItem }) {
  const mode = itemTimeMode(item)
  const set = (patch: Partial<RoutineItem>) => actions.update('routineItems', item.id, patch)
  const steps = item.steps ?? []
  return (
    <div className="space-y-3">
      <ChipSelect
        value={mode}
        onChange={(m) => {
          if (!m) return
          if (m === 'fixed') set({ timeMode: m, time: item.time ?? item.window?.start ?? '06:00' })
          else if (m === 'window') set({ timeMode: m, window: item.window ?? { start: item.time ?? '06:00', end: item.time ? item.time : '06:30' } })
          else set({ timeMode: m })
        }}
        options={MODES}
      />
      <div className="flex items-end gap-2">
        {mode === 'fixed' && (
          <Field label="Horário" className="flex-1">
            <TimeInput value={item.time} onChange={(time) => time && set({ time })} />
          </Field>
        )}
        {mode === 'window' && (
          <>
            <Field label="De" className="flex-1">
              <TimeInput value={item.window?.start} onChange={(start) => start && set({ window: { start, end: item.window?.end ?? start } })} />
            </Field>
            <Field label="Até" className="flex-1">
              <TimeInput value={item.window?.end} onChange={(end) => end && set({ window: { start: item.window?.start ?? end, end } })} />
            </Field>
          </>
        )}
        {mode !== 'anytime' && (
          <Field label="Minutos" className="w-[96px] shrink-0">
            <NumberInput value={item.durationMin} placeholder={String(itemDuration(item))} onChange={(n) => set({ durationMin: n && n > 0 ? Math.round(n) : undefined })} />
          </Field>
        )}
      </div>
      {mode === 'sequence' && <p className="text-[12.5px] text-muted -mt-1">Começa quando o item anterior termina — o horário se ajusta sozinho.</p>}
      {mode === 'anytime' && <p className="text-[12.5px] text-muted -mt-1">Aparece em “ao longo do dia”, sem horário.</p>}
      {(steps.length > 0 || mode !== 'anytime') && (
        <MoreOptions label="passos e flexibilidade">
          {steps.length > 0 && (
            <div className="space-y-1.5">
              <div className="eyebrow">Minutos por passo</div>
              {steps.map((st, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-[14px] text-ink-2">{st}</span>
                  <NumberInput
                    aria-label={`Minutos de ${st}`}
                    value={item.stepDurations?.[i]}
                    className="w-[76px] min-h-11"
                    onChange={(n) => {
                      const next = steps.map((_, j) => item.stepDurations?.[j] ?? 0)
                      next[i] = n && n > 0 ? Math.round(n) : 0
                      set({ stepDurations: next.some((x) => x > 0) ? next : undefined })
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          <Chip selected={!!item.timeFlexible} onClick={() => set({ timeFlexible: !item.timeFlexible })}>
            {item.timeFlexible ? '✓ Pode deslizar' : 'Pode deslizar'}
          </Chip>
        </MoreOptions>
      )}
    </div>
  )
}

function ItemEditor({ item, handle }: { item: RoutineItem; handle: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const days = weekdaysOf(item.recurrence)
  return (
    <div className="rounded-2xl bg-surface-2">
      <div className="flex items-center gap-1.5 pl-2 pr-1 min-h-[54px]">
        <input
          value={item.emoji ?? ''}
          onChange={(e) => actions.update('routineItems', item.id, { emoji: lastGrapheme(e.target.value) || undefined })}
          aria-label="Emoji"
          placeholder="•"
          className="w-10 h-10 rounded-xl bg-surface text-center outline-none text-[18px]"
        />
        <input
          value={item.title}
          onChange={(e) => actions.update('routineItems', item.id, { title: e.target.value })}
          onBlur={(e) => !e.target.value.trim() && actions.update('routineItems', item.id, { title: 'Item' })}
          aria-label="Nome do item"
          className={cn('flex-1 min-w-0 bg-transparent outline-none py-2 pl-1.5 text-[16px]', !item.active && 'text-muted')}
        />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="h-11 pl-1.5 pr-1 inline-flex items-center gap-0.5 text-[12px] text-muted whitespace-nowrap">
          <span className="tabular-nums">{item.active ? timeLabel(item) : 'pausado'}</span>
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
        {handle}
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          <TimeFields item={item} />
          <div className="eyebrow pt-1">Dias · {describeRecurrence(item.recurrence)}</div>
          <WeekdayPicker value={days} onChange={(weekdays) => actions.update('routineItems', item.id, { recurrence: { kind: 'weekly', weekdays } })} />
          <div className="flex items-center justify-between">
            <Chip selected={item.active} onClick={() => actions.update('routineItems', item.id, { active: !item.active })}>
              {item.active ? 'Ativo' : 'Pausado'}
            </Chip>
            <button
              type="button"
              onClick={() => removeWithUndo('routineItems', item.id, 'Item removido')}
              className="h-9 px-3 rounded-full text-[13px] text-accent inline-flex items-center gap-1.5 active:bg-accent-soft"
            >
              <Trash2 size={15} /> Remover
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RoutineEditorSheet({ routineId }: SheetProps<'routineEditor'>) {
  const routine = useDB((db) => db.routines.find((r) => r.id === routineId))
  const allItems = useDB((db) => db.routineItems)
  const items = useMemo(() => allItems.filter((i) => i.routineId === routineId).sort((a, b) => a.order - b.order), [allItems, routineId])
  const [draft, setDraft] = useState('')

  if (!routine) {
    return (
      <SheetLayout title="Rotina" onClose={closeSheet}>
        <EmptyState emoji="🌿" title="Essa rotina não existe mais" compact />
      </SheetLayout>
    )
  }

  const add = () => {
    const title = draft.trim()
    if (!title) return
    actions.create('routineItems', {
      routineId: routine.id,
      title,
      recurrence: { kind: 'weekly', weekdays: ALL_DAYS },
      // Gets a time right away: it follows the previous item (editable to fixed / janela / qualquer momento).
      timeMode: 'sequence',
      durationMin: 10,
      source: 'marina',
      order: nextOrder(getDB().routineItems.filter((i) => i.routineId === routine.id)),
      active: true,
    })
    setDraft('')
  }

  return (
    <SheetLayout eyebrow="Rotina" title="Editar rotina" onClose={closeSheet} primary={{ label: 'Pronto', onClick: closeSheet }}>
      <div className="flex items-center gap-2">
        <input
          value={routine.emoji ?? ''}
          onChange={(e) => actions.update('routines', routine.id, { emoji: lastGrapheme(e.target.value) || undefined })}
          aria-label="Emoji da rotina"
          placeholder="☀️"
          className="w-12 h-12 rounded-2xl bg-surface-2 text-center outline-none text-[22px] shrink-0"
        />
        <TitleInput
          value={routine.name}
          onChange={(e) => actions.update('routines', routine.id, { name: e.target.value })}
          onBlur={(e) => !e.target.value.trim() && actions.update('routines', routine.id, { name: 'Minha rotina' })}
          aria-label="Nome da rotina"
        />
      </div>
      <div className="flex items-center gap-2">
        <Chip selected={routine.active} onClick={() => actions.update('routines', routine.id, { active: !routine.active })}>
          {routine.active ? '✓ Aparece no Hoje' : 'Pausada'}
        </Chip>
        <span className="text-[12.5px] text-muted">toque no horário de um item para ajustar tempo e dias</span>
      </div>

      {items.length > 0 ? (
        <SortableList items={items} onReorder={(ids) => actions.reorder('routineItems', ids)} className="space-y-2" renderItem={(it, handle) => <ItemEditor item={it} handle={handle} />} />
      ) : (
        <p className="text-[14px] text-muted">Nenhum item ainda. Comece com uma coisa só.</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="flex items-center gap-2 rounded-2xl border border-dashed border-line pl-4 pr-1.5 min-h-[52px]"
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="+ novo item (ex.: alongar)" enterKeyHint="done" className="flex-1 min-w-0 bg-transparent outline-none py-3" />
        <button type="submit" disabled={!draft.trim()} aria-label="Adicionar item" className="h-10 w-10 rounded-full bg-ink text-bg inline-flex items-center justify-center disabled:opacity-30 transition">
          <ArrowUp size={18} />
        </button>
      </form>
    </SheetLayout>
  )
}
