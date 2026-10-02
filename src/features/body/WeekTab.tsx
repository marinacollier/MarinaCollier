import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { DndContext, DragOverlay, closestCenter, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { Check, ChevronLeft, ChevronRight, Copy, Plus } from 'lucide-react'
import { useDB } from '@/data/store'
import type { DateKey, Workout } from '@/data/types'
import { modalityOf } from '@/data/selectors'
import { openSheet } from '@/app/ui-store'
import { Button, IconButton, tone, useDndSensors } from '@/components/ui'
import { WEEKDAY_SHORT, addDays, formatShortDate, startOfWeek, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import { moveWorkout, repeatLastWeek } from './mutations'
import { isDone, summaryParts, weekLabel, weekSummary, workoutsBetween, workoutsByDay } from './selectors'

export default function WeekTab({ today }: { today: DateKey }) {
  const db = useDB()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today))
  const [dragging, setDragging] = useState<Workout | null>(null)
  const sensors = useDndSensors()
  const byDay = useMemo(() => workoutsByDay(db, weekStart), [db, weekStart])
  const summary = useMemo(() => weekSummary(workoutsBetween(db, weekStart, addDays(weekStart, 6))), [db, weekStart])
  const prevCount = useMemo(() => workoutsBetween(db, addDays(weekStart, -7), addDays(weekStart, -1)).length, [db, weekStart])
  const isFuture = weekStart > startOfWeek(today)
  const days = Object.keys(byDay)
  const parts = summaryParts(summary)

  const onDragStart = (e: DragStartEvent) => setDragging(db.workouts.find((w) => w.id === e.active.id) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    if (e.over) moveWorkout(String(e.active.id), String(e.over.id))
  }

  return (
    <div>
      <div className="flex items-center justify-between -mx-1.5 mb-3">
        <IconButton label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft size={22} />
        </IconButton>
        <button type="button" className="text-center min-w-0" onClick={() => setWeekStart(startOfWeek(today))}>
          <div className="eyebrow">{isFuture ? 'planejamento' : `${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`}</div>
          <div className="font-display text-[22px] leading-tight">{weekLabel(weekStart, today)}</div>
        </button>
        <IconButton label="Próxima semana" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight size={22} />
        </IconButton>
      </div>

      {/* Week strip */}
      <div className="card p-2 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const list = byDay[d]
          const isToday = d === today
          return (
            <button
              key={d}
              type="button"
              onClick={() => document.getElementById(`dia-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className={cn('flex flex-col items-center rounded-2xl py-2 transition-colors', isToday ? 'bg-ink text-bg' : 'active:bg-surface-2')}
            >
              <span className={cn('text-[10px] font-semibold tracking-[0.1em]', isToday ? 'opacity-70' : 'text-muted')}>{WEEKDAY_SHORT[weekday(d)]}</span>
              <span className="font-display text-[19px] leading-tight mt-0.5">{Number(d.slice(8))}</span>
              <span className="flex gap-[3px] mt-1.5 h-1.5">
                {list.slice(0, 3).map((w) => (
                  <span
                    key={w.id}
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      w.status === 'descanso' ? 'bg-ocean/50' : isDone(w) ? tone(modalityOf(db, w.modality).tone).dot : cn('ring-1 ring-inset', isToday ? 'ring-bg/60' : 'ring-muted/60'),
                    )}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-[13.5px] text-ink-2 mt-3 px-1 leading-relaxed">
        {parts.length ? parts.join(' · ') : summary.restDays ? 'Semana de descanso 🌿' : isFuture ? 'Semana em branco — bora desenhar?' : 'Nada por aqui ainda.'}
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="mt-4 space-y-2">
          {days.map((d, i) => (
            <motion.div key={d} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
              <DayRow date={d} today={today} workouts={byDay[d]} />
            </motion.div>
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180 }}>{dragging ? <ChipBody workout={dragging} lifted /> : null}</DragOverlay>
      </DndContext>

      <p className="text-[12px] text-muted text-center mt-3">segure e arraste uma atividade pra mudar o dia</p>

      {prevCount > 0 && (
        <div className="flex justify-center mt-5">
          <Button variant="outline" icon={<Copy size={15} />} onClick={() => repeatLastWeek(weekStart)}>
            Repetir semana passada
          </Button>
        </div>
      )}
    </div>
  )
}

function DayRow({ date, today, workouts }: { date: DateKey; today: DateKey; workouts: Workout[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: date })
  const isToday = date === today
  return (
    <div
      ref={setNodeRef}
      id={`dia-${date}`}
      className={cn(
        'flex items-stretch gap-3 rounded-[20px] pl-3 pr-1.5 py-1.5 min-h-[60px] transition-colors border',
        isOver ? 'bg-accent-soft border-accent/40' : isToday ? 'bg-surface border-line shadow-[var(--shadow)]' : 'bg-surface/55 border-transparent',
      )}
    >
      <div className="w-10 shrink-0 flex flex-col justify-center">
        <span className={cn('text-[10.5px] font-semibold tracking-[0.12em]', isToday ? 'text-accent' : 'text-muted')}>{WEEKDAY_SHORT[weekday(date)]}</span>
        <span className="font-display text-[20px] leading-none mt-0.5">{Number(date.slice(8))}</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 py-1">
        {workouts.map((w) => (
          <DraggableChip key={w.id} workout={w} />
        ))}
        {!workouts.length && <span className="text-[13px] text-muted/80">livre</span>}
      </div>
      <IconButton label={`Adicionar em ${WEEKDAY_SHORT[weekday(date)]}`} className="self-center" onClick={() => openSheet('workout', { date })}>
        <Plus size={18} />
      </IconButton>
    </div>
  )
}

function DraggableChip({ workout }: { workout: Workout }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: workout.id })
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => openSheet('workout', { id: workout.id })}
      className={cn('touch-manipulation select-none', isDragging && 'opacity-30')}
      style={{ WebkitTouchCallout: 'none' }}
    >
      <ChipBody workout={workout} />
    </button>
  )
}

function ChipBody({ workout: w, lifted }: { workout: Workout; lifted?: boolean }) {
  const db = useDB()
  const m = modalityOf(db, w.modality)
  const t = tone(m.tone)
  const rest = w.status === 'descanso'
  const done = isDone(w)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-10 pl-2.5 pr-3 rounded-full text-[13.5px] font-medium whitespace-nowrap max-w-[220px]',
        rest ? 'bg-ocean-soft text-ink-2' : t.soft,
        w.status === 'pulado' && 'opacity-55',
        lifted && 'shadow-xl scale-105',
      )}
    >
      <span className="text-[16px] leading-none">{rest ? '😴' : m.emoji}</span>
      <span className="truncate">{rest ? 'descanso' : w.title || m.label}</span>
      {done && (
        <span className={cn('h-[18px] w-[18px] rounded-full inline-flex items-center justify-center text-white', w.status === 'adaptado' ? 'bg-sand' : 'bg-sage')}>
          <Check size={11} strokeWidth={3.2} />
        </span>
      )}
    </span>
  )
}
