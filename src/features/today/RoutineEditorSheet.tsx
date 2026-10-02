import { useMemo, useState } from 'react'
import { ArrowUp, ChevronDown, Trash2 } from 'lucide-react'
import { closeSheet } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { Chip, EmptyState, SheetLayout, SortableList, TitleInput, WeekdayPicker } from '@/components/ui'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { Recurrence, RoutineItem, Weekday } from '@/data/types'
import { describeRecurrence } from '@/lib/recurrence'
import { cn } from '@/lib/cn'
import { lastGrapheme } from './refs'

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

function weekdaysOf(r: Recurrence): Weekday[] {
  if (r.kind === 'daily') return ALL_DAYS
  if (r.kind === 'weekly') return r.weekdays
  return ALL_DAYS
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
          {item.active ? describeRecurrence(item.recurrence) : 'pausado'}
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
        {handle}
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3">
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
        <span className="text-[12.5px] text-muted">toque no dia de cada item para escolher quando aparece</span>
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
