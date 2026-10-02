import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DndContext, DragOverlay, closestCenter, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, Plus, Sparkles, X } from 'lucide-react'
import { getDB, useDB } from '@/data/store'
import type { DateKey, DB, ID, Workout } from '@/data/types'
import { modalityOf } from '@/data/selectors'
import { conflictsBetween, isPresencial, type Conflict, type TemplateProposal } from '@/data/planning'
import { openSheet, toast } from '@/app/ui-store'
import { ConflictCard } from '@/components/planning/ConflictCard'
import { Button, IconButton, tone, useDndSensors } from '@/components/ui'
import { WEEKDAY_SHORT, addDays, formatShortDate, relativeDay, startOfWeek, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import { PlanTypeTag, whenLabel } from './components'
import { bringWeekBase, fitGoalAt, moveToWindow, moveWorkoutChecked, pickTemplateChoice, repeatLastWeek } from './mutations'
import {
  conflictsByDay,
  dayLabel,
  goalNudges,
  goalsThatLeft,
  materializeWeek,
  nudgeMessage,
  openMoveConflicts,
  openProposals,
  relocateSuggestion,
  templateItem,
  weekTrainingChips,
  type GoalNudge,
} from './planner'
import { isDone, weekLabel, workoutsBetween, workoutsByDay } from './selectors'
import WeekRules from './WeekRules'

/** Workout whose conflicts we're showing after a drag / a pick. */
interface Watch {
  id: ID
  date: DateKey
}

export default function WeekTab({ today }: { today: DateKey }) {
  const db = useDB()
  const [weekStart, setWeekStartRaw] = useState(() => startOfWeek(today))
  const setWeekStart = (ws: DateKey) => {
    setWeekStartRaw(ws)
    setLeft(new Set())
    setWatch(null)
  }
  const weekEnd = addDays(weekStart, 6)
  const [dragging, setDragging] = useState<Workout | null>(null)
  const [watch, setWatch] = useState<Watch | null>(null)
  const sensors = useDndSensors()

  // Remember flexible goals that lost their place in this week after a change ("A yoga saiu da semana").
  const [prevDb, setPrevDb] = useState(db)
  const [left, setLeft] = useState<Set<ID>>(() => new Set())
  if (prevDb !== db) {
    const lost = goalsThatLeft(prevDb, db, weekStart)
    if (lost.length) setLeft((s) => new Set([...s, ...lost]))
    setPrevDb(db)
  }

  const byDay = useMemo(() => workoutsByDay(db, weekStart), [db, weekStart])
  const proposals = useMemo(() => openProposals(db, weekStart, today), [db, weekStart, today])
  const baseCount = useMemo(() => materializeWeek(db, weekStart, today).length, [db, weekStart, today])
  const training = useMemo(() => weekTrainingChips(db, weekStart), [db, weekStart])
  const conflicts = useMemo(() => conflictsBetween(db, weekStart < today ? today : weekStart, weekEnd), [db, weekStart, weekEnd, today])
  const conflictDays = useMemo(() => conflictsByDay(conflicts), [conflicts])
  const nudges = useMemo(() => goalNudges(db, weekStart, today, left), [db, weekStart, today, left])
  const prevCount = useMemo(() => workoutsBetween(db, addDays(weekStart, -7), addDays(weekStart, -1)).length, [db, weekStart])
  const isFuture = weekStart > startOfWeek(today)
  const days = Object.keys(byDay)

  const showConflictsOf = (id: ID, date: DateKey, verb: string) => {
    // getDB(): right after a write the render-time `db` is one step behind.
    const list = openMoveConflicts(getDB(), id, date)
    if (list.length) setWatch({ id, date })
    else toast(`${verb} ${relativeDay(date, today)} ✓`)
  }

  const onDragStart = (e: DragStartEvent) => setDragging(db.workouts.find((w) => w.id === e.active.id) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    if (!e.over) return
    const id = String(e.active.id)
    const to = String(e.over.id)
    const result = moveWorkoutChecked(id, to)
    if (result === null) return
    if (result.length) setWatch({ id, date: to })
    else toast(`Movido pra ${relativeDay(to, today)} ✓`)
  }

  const onPick = (p: TemplateProposal, modality?: string) => {
    const w = pickTemplateChoice(p.templateId, p.date, modality)
    if (w) showConflictsOf(w.id, w.date, modality ? 'Combinado pra' : 'Descanso')
  }

  return (
    <div>
      <div className="flex items-center justify-between -mx-1.5 mb-3">
        <IconButton label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft size={22} />
        </IconButton>
        <button type="button" className="text-center min-w-0" onClick={() => setWeekStart(startOfWeek(today))}>
          <div className="eyebrow">{`${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`}</div>
          <div className="font-display text-[22px] leading-tight">{weekLabel(weekStart, today)}</div>
        </button>
        <IconButton label="Próxima semana" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight size={22} />
        </IconButton>
      </div>

      <TrainingCard chips={training.chips} line={training.line} empty={isFuture ? 'Semana em branco — bora desenhar?' : 'Nada por aqui ainda.'} />

      {baseCount > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 card p-3.5 flex items-center gap-3">
          <span className="h-10 w-10 rounded-2xl bg-accent-soft inline-flex items-center justify-center shrink-0 text-accent">
            <Sparkles size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] leading-snug">Sua base da semana</div>
            <div className="text-[12.5px] text-muted">
              {baseCount} {baseCount === 1 ? 'item fixo/base' : 'itens fixos/base'} do seu template · editável depois
            </div>
          </div>
          <Button size="sm" onClick={() => bringWeekBase(weekStart, today)}>
            Trazer
          </Button>
        </motion.div>
      )}

      {nudges.map((n) => (
        <NudgeCard key={n.goal.id} db={db} nudge={n} />
      ))}

      {conflicts.length > 0 && <AttentionSection conflicts={conflicts} from={weekStart < today ? today : weekStart} to={weekEnd} />}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="mt-4 space-y-2">
          {days.map((d, i) => (
            <motion.div key={d} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
              <DayRow db={db} date={d} today={today} workouts={byDay[d]} proposals={proposals[d] ?? []} conflicts={conflictDays[d] ?? []} onPick={onPick} />
            </motion.div>
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180 }}>{dragging ? <ChipBody db={db} workout={dragging} lifted /> : null}</DragOverlay>
      </DndContext>

      <p className="text-[12px] text-muted text-center mt-3">segure e arraste um treino pra mudar o dia — eu aviso se algo bater</p>

      {prevCount > 0 && (
        <div className="flex justify-center mt-5">
          <Button variant="outline" icon={<Copy size={15} />} onClick={() => repeatLastWeek(weekStart)}>
            Repetir semana passada
          </Button>
        </div>
      )}

      <WeekRules />

      <MovePanel db={db} watch={watch} today={today} onClose={() => setWatch(null)} />
    </div>
  )
}

// ─── "Meu treino da semana" ─────────────────────────────────────────────────

function TrainingCard({ chips, line, empty }: { chips: ReturnType<typeof weekTrainingChips>['chips']; line: string; empty: string }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">meu treino da semana</div>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {chips.map((c) => (
          <span
            key={c.group}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 pl-2 pr-2.5 rounded-full text-[12.5px] whitespace-nowrap',
              c.count ? 'bg-surface-2 text-ink' : 'bg-transparent border border-line/80 text-muted',
            )}
          >
            <span className={cn('text-[14px] leading-none', !c.count && 'grayscale opacity-60')}>{c.emoji}</span>
            <span className="uppercase tracking-[0.06em] text-[10.5px] font-semibold">{c.label}</span>
            {c.count > 0 && <span className="font-display text-[15px] leading-none">{c.count}</span>}
          </span>
        ))}
      </div>
      <p className="text-[13.5px] text-ink-2 mt-3 leading-relaxed">{line || empty}</p>
    </div>
  )
}

// ─── Flexible goal nudge ────────────────────────────────────────────────────

function NudgeCard({ db, nudge }: { db: DB; nudge: GoalNudge }) {
  const s = nudge.suggestions[0]
  const m = modalityOf(db, nudge.goal.modality!)
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('mt-3 rounded-[22px] p-3.5', tone(m.tone).soft)}>
      <div className="flex gap-3">
        <span className="text-[22px] leading-none mt-0.5" aria-hidden>
          {m.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] leading-snug">{nudgeMessage(db, nudge)}</div>
          <div className="text-[12px] text-ink-2/80 mt-0.5">
            {nudge.goal.title}
            {s ? ` · ${s.reason}` : ' · sem janela livre que respeite as regras — quando der'}
          </div>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {nudge.suggestions.map((x, i) => (
              <Button key={x.date + x.start} size="sm" variant={i === 0 ? 'primary' : 'soft'} onClick={() => fitGoalAt(nudge.goal, x)}>
                {dayLabel(x.date)} {x.start}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Pontos de atenção ──────────────────────────────────────────────────────

function AttentionSection({ conflicts, from, to }: { conflicts: Conflict[]; from: DateKey; to: DateKey }) {
  const first = conflicts.slice(0, 2)
  return (
    <div className="mt-3 card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="eyebrow">pontos de atenção</div>
        <button type="button" className="text-[13px] text-ink-2 h-8 px-1" onClick={() => openSheet('conflicts', { from, to })}>
          ver {conflicts.length > 2 ? `todos (${conflicts.length})` : 'na lista'}
        </button>
      </div>
      <div className="space-y-2 mt-2">
        {first.map((c) => {
          const w = c.refs.find((r) => r.type === 'workout')
          return <ConflictCard key={c.key} conflict={c} compact onMove={w ? () => openSheet('workout', { id: w.id }) : undefined} />
        })}
      </div>
    </div>
  )
}

// ─── Panel after a move / a pick ────────────────────────────────────────────

function MovePanel({ db, watch, today, onClose }: { db: DB; watch: Watch | null; today: DateKey; onClose: () => void }) {
  const list = useMemo(() => (watch ? openMoveConflicts(db, watch.id, watch.date) : []), [db, watch])
  const moved = watch ? db.workouts.find((w) => w.id === watch.id) : undefined
  const open = !!watch && !!moved && moved.date === watch.date && list.length > 0
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed left-0 right-0 z-[80] px-4 pointer-events-none"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
        >
          <div className="pointer-events-auto mx-auto max-w-[440px] rounded-[24px] bg-surface border border-line shadow-2xl p-3 max-h-[52vh] overflow-y-auto">
            <div className="flex items-center gap-2 pl-1">
              <AlertTriangle size={15} className="text-sand" />
              <div className="flex-1 text-[13px] text-ink-2">
                Movido pra {relativeDay(watch!.date, today)} — só um aviso, nada foi bloqueado
              </div>
              <IconButton label="Fechar aviso" size="sm" onClick={onClose}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="space-y-2 mt-1.5">
              {list.map((c) => (
                <div key={c.key}>
                  <ConflictCard
                    conflict={c}
                    onMove={() => {
                      onClose()
                      openSheet('workout', { id: watch!.id })
                    }}
                  />
                  <RelocateHint db={db} conflict={c} movedId={watch!.id} today={today} />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** "Levar 🧘 yoga pra sábado 07:00?" for the other, flexible workout of the conflict. */
function RelocateHint({ db, conflict, movedId, today }: { db: DB; conflict: Conflict; movedId: ID; today: DateKey }) {
  const other = conflict.refs.find((r) => r.type === 'workout' && r.id !== movedId)
  const s = useMemo(() => (other ? relocateSuggestion(db, other.id, today) : undefined), [db, other, today])
  if (!other || !s) return null
  const w = db.workouts.find((x) => x.id === other.id)!
  const m = modalityOf(db, w.modality)
  return (
    <button
      type="button"
      onClick={() => moveToWindow(other.id, s)}
      className="mt-1.5 w-full flex items-center gap-2 rounded-2xl bg-surface-2 px-3.5 min-h-11 text-left text-[13.5px] text-ink-2 active:bg-line"
    >
      <span className="text-[16px]">{m.emoji}</span>
      <span className="flex-1">
        Levar {m.label.toLowerCase()} pra {relativeDay(s.date, today)} {s.start}?
      </span>
      <Check size={15} className="text-sage" />
    </button>
  )
}

// ─── Day row ────────────────────────────────────────────────────────────────

function DayRow({
  db,
  date,
  today,
  workouts,
  proposals,
  conflicts,
  onPick,
}: {
  db: DB
  date: DateKey
  today: DateKey
  workouts: Workout[]
  proposals: TemplateProposal[]
  conflicts: Conflict[]
  onPick: (p: TemplateProposal, modality?: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date })
  const isToday = date === today
  const past = date < today
  const presencial = isPresencial(db.profile, date)
  const location = db.profile.work?.location
  const ghosts = proposals.filter((p) => p.choice === 'fixed' || p.choice === 'rest' || p.choice === 'optional')
  const choices = proposals.filter((p) => p.choice === 'one_of')
  const rest = workouts.find((w) => w.status === 'descanso')
  const notes = [...new Set(workouts.filter((w) => w.templateId && w.notes).map((w) => w.notes!))]

  return (
    <div
      ref={setNodeRef}
      id={`dia-${date}`}
      className={cn(
        'flex items-start gap-3 rounded-[20px] pl-3 pr-1.5 py-2 min-h-[64px] transition-colors border',
        isOver ? 'bg-accent-soft border-accent/40' : isToday ? 'bg-surface border-line shadow-[var(--shadow)]' : 'bg-surface/55 border-transparent',
        past && !isOver && 'opacity-80',
      )}
    >
      <div className="w-10 shrink-0 pt-1.5">
        <span className={cn('block text-[10.5px] font-semibold tracking-[0.12em]', isToday ? 'text-accent' : 'text-muted')}>{WEEKDAY_SHORT[weekday(date)]}</span>
        <span className="block font-display text-[20px] leading-none mt-0.5">{Number(date.slice(8))}</span>
      </div>

      <div className="flex-1 min-w-0 py-1">
        {(presencial || conflicts.length > 0) && (
          <div className="flex items-center gap-2 mb-1.5 min-w-0">
            {presencial && (
              <span className="text-[11.5px] text-ink-2 truncate">
                📍 presencial{location ? ` · ${location}` : ''}
              </span>
            )}
            {conflicts.length > 0 && (
              <button
                type="button"
                onClick={() => openSheet('conflicts', { from: date, to: date })}
                className="ml-auto shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-sand-soft text-[11px] font-medium text-ink-2"
                aria-label={`${conflicts.length} ponto(s) de atenção`}
              >
                <AlertTriangle size={11} className="text-sand" /> {conflicts.length}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {workouts.map((w) => (
            <DraggableChip key={w.id} db={db} workout={w} />
          ))}
          {ghosts.map((p) => (
            <GhostChip key={p.templateId} db={db} proposal={p} onPick={onPick} />
          ))}
          {!workouts.length && !proposals.length && <span className="text-[13px] text-muted/80 py-2">livre</span>}
        </div>

        {rest && !past && <div className="text-[12px] text-muted mt-1.5">começa como descanso, mas não é bloqueado</div>}
        {notes.map((n) => (
          <div key={n} className="text-[12px] text-muted mt-1 leading-snug">
            {n}
          </div>
        ))}

        {choices.map((p) => (
          <ChoiceBlock key={p.templateId} db={db} proposal={p} onPick={onPick} />
        ))}
      </div>

      <IconButton label={`Adicionar em ${WEEKDAY_SHORT[weekday(date)]}`} className="shrink-0" onClick={() => openSheet('workout', { date })}>
        <Plus size={18} />
      </IconButton>
    </div>
  )
}

/** one_of line: "manhã · 🚴 bike ou 🏃 corrida?" with option chips (+ descanso). */
function ChoiceBlock({ db, proposal: p, onPick }: { db: DB; proposal: TemplateProposal; onPick: (p: TemplateProposal, modality?: string) => void }) {
  const t = templateItem(db, p.templateId)
  const options = (p.options ?? []).map((id) => modalityOf(db, id))
  const when = t ? whenLabel(t) : ''
  const question = options.length <= 3 ? `${options.map((m) => `${m.emoji} ${m.label.toLowerCase()}`).join(' ou ')}?` : (t?.title ?? 'O que vai ser?')
  return (
    <div className="mt-2 rounded-2xl bg-surface-2/70 p-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[13.5px] leading-snug flex-1 min-w-0">
          {when && <span className="text-muted">{when} · </span>}
          {question}
        </span>
        <PlanTypeTag planType={p.planType} />
      </div>
      {p.note && <div className="text-[12px] text-muted mt-0.5 leading-snug">{p.note}</div>}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {options.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(p, m.id)}
            className={cn('inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] border border-line bg-surface active:scale-[0.97] transition')}
          >
            <span className="text-[15px] leading-none">{m.emoji}</span>
            {m.label}
          </button>
        ))}
        <button type="button" onClick={() => onPick(p)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] text-muted active:scale-[0.97] transition">
          😴 descanso
        </button>
      </div>
    </div>
  )
}

/** Template line not on the plan yet (fixed / rest / optional): dashed, tap to add. */
function GhostChip({ db, proposal: p, onPick }: { db: DB; proposal: TemplateProposal; onPick: (p: TemplateProposal, modality?: string) => void }) {
  const t = templateItem(db, p.templateId)
  if (p.choice === 'rest') {
    return (
      <button type="button" onClick={() => onPick(p)} className="inline-flex items-center gap-1.5 h-10 pl-2.5 pr-3 rounded-full text-[13px] border border-dashed border-line text-ink-2">
        <span className="text-[15px] leading-none">😴</span>
        {t?.title ?? 'OFF'}
        <PlanTypeTag planType={p.planType} />
      </button>
    )
  }
  const m = modalityOf(db, p.options?.[0] ?? t?.modalities[0] ?? 'outro')
  const optional = p.choice === 'optional'
  return (
    <button
      type="button"
      onClick={() => onPick(p, m.id)}
      title={p.note}
      className={cn(
        'inline-flex items-center gap-1.5 h-10 pl-2.5 pr-3 rounded-full text-[13px] border border-dashed max-w-full',
        optional ? 'border-line/80 text-muted' : 'border-line text-ink-2',
      )}
    >
      <Plus size={13} className="shrink-0" />
      <span className="text-[15px] leading-none">{m.emoji}</span>
      <span className="truncate">
        {m.label.toLowerCase()}
        {optional ? '?' : ''}
      </span>
      {t && whenLabel(t) && <span className="text-muted">{whenLabel(t)}</span>}
      {!optional && <PlanTypeTag planType={p.planType} />}
    </button>
  )
}

function DraggableChip({ db, workout }: { db: DB; workout: Workout }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: workout.id })
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => openSheet('workout', { id: workout.id })}
      className={cn('touch-manipulation select-none max-w-full', isDragging && 'opacity-30')}
      style={{ WebkitTouchCallout: 'none' }}
    >
      <ChipBody db={db} workout={workout} />
    </button>
  )
}

function ChipBody({ db, workout: w, lifted }: { db: DB; workout: Workout; lifted?: boolean }) {
  const m = modalityOf(db, w.modality)
  const t = tone(m.tone)
  const rest = w.status === 'descanso'
  const done = isDone(w)
  const when = whenLabel(w)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-10 pl-2.5 pr-3 rounded-full text-[13.5px] font-medium whitespace-nowrap max-w-full',
        rest ? 'bg-ocean-soft text-ink-2' : t.soft,
        w.status === 'pulado' && 'opacity-55',
        lifted && 'shadow-xl scale-105',
      )}
    >
      <span className="text-[16px] leading-none">{rest ? '😴' : m.emoji}</span>
      <span className="truncate">{rest ? (w.title ?? 'descanso') : w.title || m.label}</span>
      {when && !rest && <span className="text-[12px] font-normal text-ink-2/80">{when}</span>}
      <PlanTypeTag planType={w.planType} />
      {done && (
        <span className={cn('h-[18px] w-[18px] rounded-full inline-flex items-center justify-center text-white shrink-0', w.status === 'adaptado' ? 'bg-sand' : 'bg-sage')}>
          <Check size={11} strokeWidth={3.2} />
        </span>
      )}
    </span>
  )
}
