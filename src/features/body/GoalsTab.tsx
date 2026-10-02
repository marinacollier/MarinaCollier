import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { actions, useDB } from '@/data/store'
import type { DateKey, DB, WorkoutGoal } from '@/data/types'
import { modalityOf } from '@/data/selectors'
import { openSheet } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { Button, Card, Checkbox, EmptyState, Pill, ProgressBar, SectionTitle } from '@/components/ui'
import { addDays, countdownLabel, formatShortDate, relativeDay, startOfWeek } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { GOAL_KINDS, MODALITY_GROUPS } from './constants'
import { goalProgress } from './selectors'
import ModalitiesEditor from './ModalitiesEditor'
import { dayLabel, goalCoverage, goalSuggestions } from './planner'
import { fitGoalAt } from './mutations'

export default function GoalsTab({ today }: { today: DateKey }) {
  const goals = useDB((db) => db.workoutGoals)
  const active = useMemo(() => goals.filter((g) => g.status === 'ativa'), [goals])
  const others = useMemo(() => goals.filter((g) => g.status !== 'ativa'), [goals])
  const [showOthers, setShowOthers] = useState(false)

  return (
    <div>
      {active.length ? (
        <div className="space-y-3">
          {active.map((g, i) => (
            <motion.div key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <GoalCard goal={g} today={today} />
            </motion.div>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            emoji="🎯"
            title="Um objetivo de cada vez"
            text="Treinar 2x por semana, pedalar 100 km, preparar uma viagem. O progresso se calcula sozinho."
            action={
              <Button icon={<Plus size={16} />} onClick={() => openSheet('workoutGoal', {})}>
                Criar objetivo
              </Button>
            }
          />
        </Card>
      )}
      {active.length > 0 && (
        <div className="flex justify-center mt-4">
          <Button variant="soft" icon={<Plus size={16} />} onClick={() => openSheet('workoutGoal', {})}>
            Novo objetivo
          </Button>
        </div>
      )}

      {others.length > 0 && (
        <>
          <SectionTitle
            action={
              <button type="button" className="text-[13px] text-muted h-8" onClick={() => setShowOthers((s) => !s)}>
                {showOthers ? 'esconder' : `ver ${others.length}`}
              </button>
            }
          >
            Pausados e concluídos
          </SectionTitle>
          {showOthers && (
            <div className="space-y-3">
              {others.map((g) => (
                <GoalCard key={g.id} goal={g} today={today} />
              ))}
            </div>
          )}
        </>
      )}

      <SectionTitle>Ajustes</SectionTitle>
      <ModalitiesEditor />
    </div>
  )
}

function modalityLabel(db: DB, key?: string): string | undefined {
  if (!key) return undefined
  const g = MODALITY_GROUPS.find((x) => x.key === key)
  if (g) return `${g.emoji} ${g.label.toLowerCase()}`
  const m = modalityOf(db, key)
  return `${m.emoji} ${m.label.toLowerCase()}`
}

function GoalCard({ goal: g, today }: { goal: WorkoutGoal; today: DateKey }) {
  const db = useDB()
  const nav = useNavigate()
  const p = useMemo(() => goalProgress(db, g, today), [db, g, today])
  const kind = GOAL_KINDS.find((k) => k.value === g.kind)!
  const trip = g.tripId ? db.trips.find((t) => t.id === g.tripId) : undefined
  const mod = modalityLabel(db, g.modality)
  const fun = g.obligation === false
  const unitLabel = p.unit === 'km' ? 'km' : p.current === 1 && !p.target ? 'sessão' : 'sessões'
  const toggleMilestone = (id: string) => {
    const milestones = g.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m))
    if (milestones.find((m) => m.id === id)?.done) haptic('success')
    actions.update('workoutGoals', g.id, { milestones })
  }

  return (
    <div className={cn('card overflow-hidden', g.status !== 'ativa' && 'opacity-75')}>
      <button type="button" className="w-full text-left p-4 pb-2" onClick={() => openSheet('workoutGoal', { id: g.id })}>
        <div className="flex items-center justify-between gap-2">
          <div className="eyebrow truncate">
            {kind.emoji} {kind.label}
            {mod && ` · ${mod}`}
          </div>
          {p.deadline ? (
            <Pill className={cn(p.daysLeft !== undefined && p.daysLeft >= 0 && p.daysLeft <= 14 ? 'bg-accent-soft text-accent' : '')}>{countdownLabel(p.deadline, today)}</Pill>
          ) : g.status !== 'ativa' ? (
            <Pill>{g.status === 'concluida' ? 'concluído ✓' : 'pausado'}</Pill>
          ) : null}
        </div>
        <div className="font-display text-[22px] leading-[1.15] mt-1.5">{g.title}</div>
        {fun && <div className="text-[12.5px] text-ink-2 mt-1">🎈 diversão — conta como alegria, não como obrigação</div>}
        {g.preparation && <div className="text-[13.5px] text-muted mt-1 leading-snug">{g.preparation}</div>}
      </button>

      <div className="px-4 pb-4">
        {(g.kind === 'sessions' || g.kind === 'distance') && (
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[30px] leading-none tracking-tight">{String(p.current).replace('.', ',')}</span>
              <span className="text-[14px] text-muted">
                {p.target ? `de ${p.target} ${unitLabel}` : unitLabel}
                {g.deadline ? ` até ${formatShortDate(g.deadline)}` : ''}
              </span>
            </div>
            {p.target ? <ProgressBar value={p.current} max={p.target} tone="accent" className="mt-2.5 h-2" /> : null}
            <div className="text-[12px] text-muted mt-2">contando treinos feitos desde {formatShortDate(g.startDate)}</div>
          </div>
        )}

        {g.kind === 'habit' && p.weeks && (
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[30px] leading-none">{p.current}</span>
                <span className="text-[14px] text-muted">{fun ? 'esta semana · sem obrigação' : p.target ? `de ${p.target} esta semana` : 'esta semana'}</span>
              </div>
            </div>
            <div className="flex items-end gap-1.5" aria-label="últimas semanas">
              {p.weeks.map((w, i, arr) => (
                <div key={w.weekStart} className="flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      'h-7 w-7 rounded-full inline-flex items-center justify-center text-[12px] font-semibold',
                      !fun && p.target && w.count >= p.target ? 'bg-sage text-white' : w.count ? 'bg-sage-soft text-ink-2' : 'bg-surface-2 text-muted',
                    )}
                  >
                    {w.count}
                  </span>
                  <span className="text-[10px] text-muted">{i === arr.length - 1 ? 'agora' : formatShortDate(w.weekStart).replace(' de ', '/').replace('.', '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {g.kind === 'habit' && !fun && g.modality && <WindowSuggestions goal={g} today={today} />}

        {g.kind === 'event' && (
          <div className="mt-1">
            {g.milestones.length > 0 ? (
              <ul className="space-y-0.5">
                {g.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 min-h-11">
                    <Checkbox size="sm" checked={m.done} onChange={() => toggleMilestone(m.id)} label={m.title} className="ml-0.5" />
                    <span className={cn('text-[14.5px] leading-snug flex-1', m.done && 'text-muted line-through decoration-muted/40')}>{m.title}</span>
                    {m.date && <span className="text-[12px] text-muted">{formatShortDate(m.date)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <button type="button" className="text-[13.5px] text-muted h-10" onClick={() => openSheet('workoutGoal', { id: g.id })}>
                + adicionar marcos da preparação
              </button>
            )}
          </div>
        )}

        {trip && (
          <button
            type="button"
            onClick={() => nav(ROUTES.trip(trip.id))}
            className="mt-3 w-full flex items-center gap-2.5 rounded-2xl bg-surface-2 px-3.5 h-11 text-[13.5px] text-ink-2 active:bg-line"
          >
            <span className="text-[16px]">{trip.flag}</span>
            <span className="flex-1 text-left truncate">{trip.name}</span>
            <span className="text-[12px] text-muted">{trip.dateLabel ?? (trip.startDate ? formatShortDate(trip.startDate) : '')}</span>
            <ChevronRight size={16} className="text-muted" />
          </button>
        )}
      </div>
    </div>
  )
}

/** "Sugestões de janela" for a weekly flexible goal: free windows that respect check-in limits and the calendar. */
function WindowSuggestions({ goal: g, today }: { goal: WorkoutGoal; today: DateKey }) {
  const db = useDB()
  const ws = startOfWeek(today)
  const want = g.perWeek ?? g.target ?? 1
  const planned = useMemo(
    () =>
      db.workouts
        .filter((w) => w.date >= ws && w.date <= addDays(ws, 6) && w.status !== 'pulado' && w.status !== 'descanso' && (w.workoutGoalId === g.id || w.modality === g.modality))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [db.workouts, ws, g.id, g.modality],
  )
  const covered = useMemo(() => goalCoverage(db, g, ws, today), [db, g, ws, today])
  const suggestions = useMemo(() => (covered < want ? goalSuggestions(db, g, today) : []), [db, g, today, covered, want])

  if (covered >= want) {
    return (
      <div className="mt-3 rounded-2xl bg-sage-soft px-3.5 py-2.5 text-[13.5px] text-ink-2">
        {planned.length
          ? `✓ Já tem lugar nesta semana: ${planned.map((w) => `${relativeDay(w.date, today)}${w.time ? ` ${w.time}` : ''}`).join(', ')}`
          : '✓ Faz parte da sua semana base. Se sair do lugar, eu sugiro outra janela.'}
      </div>
    )
  }
  return (
    <div className="mt-3">
      <div className="eyebrow mb-1.5">sugestões de janela</div>
      {suggestions.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.date + s.start}
              type="button"
              onClick={() => fitGoalAt(g, s)}
              className="inline-flex flex-col items-start rounded-2xl bg-surface-2 px-3.5 py-2 min-h-11 text-left active:bg-line"
            >
              <span className="text-[14px] font-medium">
                {dayLabel(s.date)} · {s.start}
              </span>
              <span className="text-[11.5px] text-muted">{s.reason}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-[13px] text-muted">Semana cheia — sem janela que respeite as regras. Tudo bem, fica pra próxima. 🌿</div>
      )}
    </div>
  )
}
