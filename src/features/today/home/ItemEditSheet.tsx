/**
 * ONE sheet for every Home row: quick edits on top (Dia · Hora · Obs · importante hoje), routine steps
 * when it's a routine, and "Abrir completo" for the record's own sheet/page. Writes go through
 * ./edit.ts (records + schedule rules) and always offer "Desfazer".
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { closeSheet, openSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { Button, Chip, ItemList, ItemRow, SheetLayout, AREA_TAG } from '@/components/ui'
import { dayItems, type ActionItem } from '@/data/agenda/items'
import { actions, getDB, persist, useDB } from '@/data/store'
import type { DateKey, TimeHM } from '@/data/types'
import { addDays, formatDayMonth } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { addPriority } from '../priorities'
import { checkItem, openItem } from './act'
import { editSpec, type Scope } from './edit'
import { areaOf } from './rows'

type Undo = () => void

function done(message: string, undos: Undo[]) {
  void persist()
  haptic('success')
  toast(message, {
    action: {
      label: 'Desfazer',
      run: () => {
        for (const u of [...undos].reverse()) u()
        void persist()
      },
    },
  })
}

function Label({ children, note }: { children: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-1.5">
      <span className="eyebrow">{children}</span>
      {note && <span className="text-[12px] text-muted text-right leading-snug">{note}</span>}
    </div>
  )
}

/** The day's main Top 3 entry pointing at this row (by ref, or by title). */
function priorityOf(item: ActionItem) {
  return getDB().priorities.find((p) => p.date === item.date && !p.domain && ((p.ref && p.ref.type === item.refType && p.ref.id === item.refId) || p.title.trim().toLowerCase() === item.title.trim().toLowerCase()))
}

export default function ItemEditSheet({ item: initial, today }: SheetProps<'itemEdit'>) {
  const db = useDB()
  const navigate = useNavigate()
  // Live copy (routine steps tick here); falls back to what was tapped.
  const item = useMemo(() => dayItems(db, initial.date, today).find((i) => i.key === initial.key) ?? initial, [db, initial, today])
  const spec = useMemo(() => editSpec(db, item), [db, item])
  const [start, setStart] = useState<TimeHM | undefined>(spec.time?.start)
  const [end, setEnd] = useState<TimeHM | undefined>(spec.time?.end)
  const [scope, setScope] = useState<Scope>(spec.time?.scopes[0] ?? 'always')
  const [notes, setNotes] = useState(spec.notes?.value ?? '')
  const area = AREA_TAG[areaOf(item)]
  const tomorrow = addDays(today, 1)
  const isPriority = !!priorityOf(item)

  const moveTo = (d: DateKey) => {
    if (!spec.day || d === spec.day.value) return
    const undo = spec.day.set(d)
    closeSheet()
    done(`${initial.title} → ${d === today ? 'hoje' : d === tomorrow ? 'amanhã' : formatDayMonth(d)} ✓`, [undo])
  }

  const timeChanged = !!start && (start !== spec.time?.start || (spec.time?.withEnd && end !== spec.time?.end))
  const notesChanged = !!spec.notes && notes.trim() !== spec.notes.value.trim()
  const save = () => {
    const undos: Undo[] = []
    const bits: string[] = []
    if (timeChanged && spec.time && start) {
      undos.push(spec.time.set(scope, start, end))
      bits.push(`às ${start}${spec.time.scopes.length > 1 ? (scope === 'today' ? ' só hoje' : ' sempre') : ''}`)
    }
    if (notesChanged) {
      undos.push(spec.notes!.set(notes))
      bits.push('obs salva')
    }
    closeSheet()
    if (undos.length) done(`${initial.title}: ${bits.join(' · ')} ✓`, undos)
  }

  const togglePriority = () => {
    const p = priorityOf(item)
    if (p) {
      actions.remove('priorities', p.id)
      done('Saiu das importantes de hoje', [() => actions.restore('priorities', p)])
      return
    }
    const ref = item.refType === 'task' ? { type: 'task' as const, id: item.refId } : undefined
    const r = addPriority(item.date, initial.title, ref)
    if (!r.ok) {
      toast(r.reason === 'full' ? 'Já tem três importantes hoje — tira uma antes.' : 'Já está nas importantes.')
      return
    }
    done('Importante hoje ✓', [() => actions.remove('priorities', r.priority.id)])
  }

  const openFull = () => {
    closeSheet()
    if (item.refType === 'routine') return openSheet('routineEditor', { routineId: item.refId })
    openItem(item, today, navigate)
  }

  const steps = item.check === 'routine' ? (item.children ?? []) : []
  return (
    <SheetLayout
      eyebrow={<span className={area.cls}>{area.label || 'Item'}</span>}
      title={initial.title}
      onClose={closeSheet}
      primary={{ label: 'Salvar', onClick: save, disabled: !timeChanged && !notesChanged }}
      footerExtra={
        <Button variant="outline" onClick={openFull}>
          Abrir completo
        </Button>
      }
    >
      <section aria-label="Dia">
        <Label note={spec.dayNote}>Dia</Label>
        {spec.day && (
          <div className="flex flex-wrap gap-1.5">
            <Chip selected={spec.day.value === today} onClick={() => moveTo(today)}>
              Hoje
            </Chip>
            <Chip selected={spec.day.value === tomorrow} onClick={() => moveTo(tomorrow)}>
              Amanhã
            </Chip>
            <label className={cn('relative inline-flex items-center h-9 px-3.5 rounded-full text-[13.5px] border', spec.day.value && spec.day.value !== today && spec.day.value !== tomorrow ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2')}>
              {spec.day.value && spec.day.value !== today && spec.day.value !== tomorrow ? formatDayMonth(spec.day.value) : 'Escolher dia'}
              <input type="date" aria-label="Escolher dia" className="absolute inset-0 opacity-0" value={spec.day.value ?? ''} onChange={(e) => e.target.value && moveTo(e.target.value)} />
            </label>
          </div>
        )}
      </section>

      <section aria-label="Hora">
        <Label note={spec.timeNote}>Hora</Label>
        {spec.time && (
          <>
            <div className="flex items-center gap-2">
              <input type="time" aria-label="Início" value={start ?? ''} onChange={(e) => setStart(e.target.value || undefined)} className="input appearance-none min-h-11 w-[120px] tabular-nums" />
              {spec.time.withEnd && (
                <>
                  <span className="text-muted text-[13px]">até</span>
                  <input type="time" aria-label="Fim" value={end ?? ''} onChange={(e) => setEnd(e.target.value || undefined)} className="input appearance-none min-h-11 w-[120px] tabular-nums" />
                </>
              )}
            </div>
            {spec.time.scopes.length > 1 && (
              <div className="flex gap-1.5 mt-2" role="radiogroup" aria-label="Vale pra">
                <Chip selected={scope === 'today'} onClick={() => setScope('today')}>
                  Só hoje
                </Chip>
                <Chip selected={scope === 'always'} onClick={() => setScope('always')}>
                  Sempre
                </Chip>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-label="Observação">
        <Label note={spec.notesNote ?? spec.notes?.hint}>Obs</Label>
        {spec.notes && <textarea aria-label="Obs" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="alguma observação…" className="input w-full text-[15px] leading-snug" />}
      </section>

      {steps.length > 0 && (
        <section aria-label="Itens da rotina">
          <Label note={item.sub}>Itens</Label>
          <ItemList>
            {steps.map((c) => (
              <ItemRow key={c.key} title={c.title} when={c.start} checked={c.status === 'done'} onCheck={c.check === 'none' ? undefined : () => checkItem(c)} />
            ))}
          </ItemList>
        </section>
      )}

      {item.date >= today && item.check !== 'none' && (
        <button type="button" onClick={togglePriority} aria-pressed={isPriority} className="h-11 -ml-1 px-1 inline-flex items-center gap-2 text-[14px] text-ink-2 active:opacity-70">
          <span className={cn('h-2 w-2 rounded-full', isPriority ? 'bg-accent' : 'border border-muted')} />
          {isPriority ? 'Importante hoje — tirar' : 'Marcar como importante'}
        </button>
      )}
    </SheetLayout>
  )
}
