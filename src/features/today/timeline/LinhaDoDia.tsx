/**
 * LINHA DO DIA — the unified day on Hoje: rotina + treino + comida + agenda + trabalho + tarefas,
 * one compact time-first list. "Não é uma lista do que eu deveria fazer: acompanha o que realmente
 * aconteceu e reorganiza o que vem depois."
 *
 * - time column (tap → change it just for today), small status dots ○ ● ✓, real time "✓ 05:12";
 * - groups (Despertar, Higiene…) show their range and expand to per-step times;
 * - "Organizar" → drag handles; dropping an item gives it the time of its new slot;
 * - "Acordou agora?" → a short morning proposal that keeps the training/agenda anchors.
 */
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { useDndSensors } from '@/components/ui'
import { reorderDay, replanFrom, type ReplanProposal } from '@/data/schedule'
import { getDB } from '@/data/store'
import { dayTimeline } from '@/data/timeline'
import { minutesToHM } from '@/lib/date'
import { restrictToVerticalAxis } from '@/lib/dnd-modifiers'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { eveningRoutine, morningRoutine, routineMode, setRoutineMode } from '../routine'
import { HeaderLink, Widget, WidgetEmpty, SoftAction, type WidgetCtx } from '../widgets/shared'
import { undoToast } from './actions'
import { TimelineRow, type RowProps } from './TimelineRow'
import { buildView, foldSummary, lateMorning, routineLookup, type RoutineRun } from './view'

function SortableRow(props: RowProps & { organize: boolean }) {
  const { e, organize } = props
  const canDrag = organize && e.editable.reorder
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: e.key,
    disabled: { draggable: !canDrag, droppable: !organize },
  })
  const handle = organize ? (
    canDrag ? (
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Arrastar ${e.title}`}
        className="h-[46px] w-9 -mr-1 inline-flex items-center justify-center text-muted touch-none shrink-0"
      >
        <GripVertical size={16} />
      </button>
    ) : (
      <span className="w-9 -mr-1 shrink-0" />
    )
  ) : undefined
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 rounded-2xl bg-surface shadow-lg')}
    >
      <TimelineRow {...props} handle={handle} />
    </div>
  )
}

/** A later routine as one line; tap → its items. */
function RunRow({ run, onOpen }: { run: RoutineRun; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full flex items-start min-h-[46px] text-left">
      <span className="w-[46px] shrink-0 pt-[15px] font-sport text-[16px] tabular-nums leading-none">{run.start}</span>
      <span className="w-[22px] shrink-0 flex justify-center pt-[17px]">
        <span className="h-[11px] w-[11px] rounded-full border-[1.5px] border-dashed border-muted/70 bg-surface" />
      </span>
      <span className="flex-1 min-w-0 pl-2.5 py-[12px]">
        <span className="flex items-center gap-1.5 text-[15px]">
          {run.emoji && <span className="text-[14px]">{run.emoji}</span>}
          <span className="truncate">{run.title}</span>
        </span>
        <span className="block text-[12px] text-muted mt-0.5 tabular-nums">
          {run.start}–{run.end} · {run.entries.length} itens · <span className="text-accent font-medium">ver horários</span>
        </span>
      </span>
    </button>
  )
}

// ─── "Acordou agora?" ───────────────────────────────────────────────────────

function ReplanCard({ proposal, onClose }: { proposal: ReplanProposal; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-accent-soft/70 px-3.5 pt-3 pb-2 mb-2">
      <p className="text-[14px] leading-snug text-ink">{proposal.message}</p>
      <ul className="mt-2 space-y-0.5">
        {proposal.lines.map((l) => (
          <li key={`${l.ref.type}:${l.ref.id}`} className="flex items-baseline gap-2.5 text-[14px]">
            <span className="w-[42px] shrink-0 font-sport text-[15px] tabular-nums">{l.time}</span>
            <span className={cn('min-w-0 truncate', l.kept && 'text-ink-2')}>
              {l.emoji ? `${l.emoji} ` : ''}
              {l.title}
            </span>
          </li>
        ))}
      </ul>
      {proposal.drops.length > 0 && (
        <p className="text-[12.5px] text-muted mt-2 leading-snug">Fica pra outro dia, sem pressa: {proposal.drops.map((d) => d.title).join(', ')}.</p>
      )}
      <div className="flex items-center gap-2 mt-2.5">
        <button
          type="button"
          onClick={() => {
            haptic('success')
            undoToast('Manhã reorganizada ☀️', proposal.apply())
            onClose()
          }}
          className="h-11 px-4 rounded-full bg-ink text-bg text-[14px] font-medium active:scale-[0.98] transition"
        >
          Usar essa manhã
        </button>
        <button type="button" onClick={onClose} className="h-11 px-3 text-[13.5px] text-muted">
          agora não
        </button>
      </div>
    </motion.div>
  )
}

// ─── Widget ─────────────────────────────────────────────────────────────────

export function LinhaDoDiaWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today, minutes, part } = ctx
  const entries = useMemo(() => dayTimeline(db, today, { nowMinutes: minutes }), [db, today, minutes])
  const [showAll, setShowAll] = useState(false)
  const [openRuns, setOpenRuns] = useState<Set<string>>(() => new Set())
  const routineOf = useMemo(() => routineLookup(db), [db])
  const view = useMemo(() => buildView(entries, minutes, showAll, routineOf, openRuns), [entries, minutes, showAll, routineOf, openRuns])
  const nowKey = view.nowAt !== undefined ? view.visible[view.nowAt]?.key : undefined
  const [organize, setOrganize] = useState(false)
  const [editing, setEditing] = useState<string>()
  const [proposal, setProposal] = useState<ReplanProposal>()
  const late = useMemo(() => lateMorning(db, entries, minutes), [db, entries, minutes])
  const sensors = useDndSensors()
  const routine = part === 'noite' ? eveningRoutine(db) : morningRoutine(db)
  const mode = routine ? routineMode(db, routine, today) : 'completa'

  if (!entries.length) {
    return (
      <Widget id="linha_do_dia" eyebrow="Linha do dia">
        <WidgetEmpty emoji="🌿" text="Dia livre por aqui. Quando quiser, dá um horário pras coisas e elas aparecem nessa linha." />
      </Widget>
    )
  }

  const onDragEnd = (ev: DragEndEvent) => {
    if (!ev.over || ev.active.id === ev.over.id) return
    const keys = view.visible.map((e) => e.key)
    const next = arrayMove(keys, keys.indexOf(String(ev.active.id)), keys.indexOf(String(ev.over.id)))
    const p = reorderDay(getDB(), today, [...view.folded.map((e) => e.key), ...next])
    if (!p.ops.length) return
    haptic('light')
    undoToast(p.summary, p.apply())
  }

  const rowProps = { today, editing, setEditing }
  const nowMarker = (
    <div key="agora" className="flex items-center h-6 -my-0.5" aria-label={`Agora, ${minutesToHM(minutes)}`}>
      <span className="w-[46px] shrink-0">
        <span className="rounded-full bg-accent text-bg text-[10.5px] font-semibold tabular-nums px-1.5 py-[2px] leading-none">{minutesToHM(minutes)}</span>
      </span>
      <span className="w-[22px] flex justify-center">
        <span className="h-[7px] w-[7px] rounded-full bg-accent" />
      </span>
      <span className="flex-1 h-[1.5px] bg-accent/70 rounded-full" />
    </div>
  )

  return (
    <Widget
      id="linha_do_dia"
      eyebrow="Linha do dia"
      action={
        <HeaderLink onClick={() => (setOrganize((o) => !o), setEditing(undefined))} label={organize ? 'Terminar de organizar' : 'Organizar horários'}>
          {organize ? 'Pronto' : 'Organizar'}
        </HeaderLink>
      }
    >
      {late && !proposal && !organize && (
        <div className="rounded-2xl bg-surface-2 pl-3.5 pr-1.5 py-1.5 mb-2 flex items-center gap-2">
          <span className="flex-1 min-w-0 text-[13px] text-ink-2 leading-snug">Acordou agora? Eu reorganizo o resto da manhã ☀️</span>
          <SoftAction className="bg-surface" onClick={() => setProposal(replanFrom(getDB(), today, minutes, { routineId: late }))}>
            Reorganizar
          </SoftAction>
        </div>
      )}
      {proposal && <ReplanCard proposal={proposal} onClose={() => setProposal(undefined)} />}
      {organize && <p className="text-[12.5px] text-muted -mt-1 mb-1.5">Arrasta pelo ⋮⋮ — o item ganha o horário do novo lugar, só hoje.</p>}

      <div className="relative">
        <span aria-hidden className="absolute left-[56.5px] top-3 bottom-3 w-px bg-line" />
        {view.folded.length > 0 && (
          <button type="button" onClick={() => setShowAll(true)} className="relative w-full flex items-center min-h-11 text-left">
            <span className="w-[46px] shrink-0 font-sport text-[15px] text-muted tabular-nums">{view.folded[0].start}</span>
            <span className="w-[22px] flex justify-center">
              <span className="h-[9px] w-[9px] rounded-full bg-line ring-2 ring-surface" />
            </span>
            <span className="pl-2.5 text-[13px] text-muted">
              {foldSummary(view.folded)} · <span className="text-accent font-medium">ver</span>
            </span>
          </button>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
          <SortableContext items={view.visible.map((e) => e.key)} strategy={verticalListSortingStrategy}>
            {view.rows.map((row) => {
              const keys = row.type === 'entry' ? [row.entry.key] : row.run.entries.map((e) => e.key)
              const marker = !organize && nowKey && keys.includes(nowKey) ? nowMarker : null
              if (row.type === 'run')
                return [marker, <RunRow key={row.run.key} run={row.run} onOpen={() => setOpenRuns((s) => new Set([...s, row.run.key]))} />]
              return [marker, <SortableRow key={row.entry.key} e={row.entry} current={row.entry.key === view.currentKey} organize={organize} {...rowProps} />]
            })}
            {view.nowAt === view.visible.length && !organize && nowMarker}
          </SortableContext>
        </DndContext>
        {showAll && (
          <button type="button" onClick={() => setShowAll(false)} className="h-10 text-[12.5px] text-muted ml-[68px]">
            recolher o que já passou
          </button>
        )}
      </div>

      {view.anytime.length > 0 && (
        <div className="mt-2 pt-2 border-t border-line/60">
          <div className="eyebrow mb-0.5">ao longo do dia</div>
          {view.anytime.map((e) => (
            <TimelineRow key={e.key} e={e} {...rowProps} />
          ))}
        </div>
      )}

      {routine && (
        <div className="flex items-center justify-between gap-2 mt-1.5 -mx-2 -mb-1.5">
          {routine.hasEssential && part !== 'dia' ? (
            <button
              type="button"
              onClick={() => {
                haptic('light')
                setRoutineMode(routine.id, today, mode === 'essential' ? 'completa' : 'essential')
                toast(mode === 'essential' ? 'Versão completa ✓' : 'Versão curta hoje ✓ — a rotina continua sua')
              }}
              className="h-11 px-2.5 rounded-full text-[13px] font-medium text-accent active:bg-accent-soft transition"
            >
              {mode === 'essential' ? `${routine.emoji ?? ''} Voltar pra versão completa` : `${routine.emoji ?? ''} Hoje vou de versão curta`}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => openSheet('routineEditor', { routineId: routine.id })}
            className="h-11 px-2.5 rounded-full text-[13px] text-muted inline-flex items-center gap-1.5 active:bg-surface-2"
          >
            <Pencil size={14} /> {routine.name}
          </button>
        </div>
      )}
    </Widget>
  )
}
