import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions, nextOrder, useDB } from '@/data/store'
import type { Area, DateKey, Goal, GoalLevel } from '@/data/types'
import {
  Button,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  IconButton,
  ListCard,
  Page,
  PageHeader,
  ProgressRing,
  SectionTitle,
  Segmented,
  SwipeRow,
} from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { addDays, formatLongDate, formatShortDate, startOfWeek } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import {
  AREAS,
  bigRivals,
  doneCount,
  goalsIn,
  LEVELS,
  MAX_BIG,
  progressLabel,
  progressWords,
  showMondayNudge,
  splitBig,
  subGoals,
  weekLabel,
} from './logic'
import { AreaTag } from './components'

export default function GoalsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (LEVELS.some((l) => l.value === params.get('n')) ? params.get('n') : 'semana') as GoalLevel
  const [area, setArea] = useState<Area | undefined>()
  const goals = useDB((db) => db.goals)
  const today = useToday()
  const [weekStart, setWeekStart] = useState<DateKey>(() => startOfWeek(today))

  return (
    <Page>
      <PageHeader title="Metas" subtitle="Poucas e boas: o que realmente importa." />
      <Segmented
        value={tab}
        onChange={(v) => setParams(v === 'semana' ? {} : { n: v }, { replace: true })}
        options={LEVELS}
      />
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 mt-3" aria-label="Filtrar por categoria">
        <Chip selected={!area} onClick={() => setArea(undefined)}>
          Todas
        </Chip>
        {AREAS.map((a) => (
          <Chip
            key={a.value}
            selected={area === a.value}
            onClick={() => setArea(area === a.value ? undefined : a.value)}
          >
            <span aria-hidden>{a.emoji}</span>
            {a.label}
          </Chip>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {tab === 'dia' && <DayTab goals={goals} today={today} area={area} />}
        {tab === 'semana' && (
          <WeekTab goals={goals} today={today} area={area} weekStart={weekStart} setWeekStart={setWeekStart} />
        )}
        {tab === 'maior' && <BiggerTab goals={goals} area={area} />}
      </motion.div>
    </Page>
  )
}

// ─── Actions ────────────────────────────────────────────────────────────────

function toggleDone(g: Goal) {
  const done = g.status !== 'feita'
  actions.update('goals', g.id, {
    status: done ? 'feita' : 'ativa',
    ...(done && g.level === 'maior' ? { progress: 100 } : {}),
  })
  if (done) {
    haptic('success')
    toast(g.big ? 'Que bom! Uma grande feita ✨' : 'Feita ✓', g.big ? { tone: 'win' } : {})
  }
}

function remove(g: Goal) {
  removeWithUndo('goals', g.id, 'Meta apagada')
}

const filterArea = (list: Goal[], area?: Area) => (area ? list.filter((g) => g.category === area) : list)

// ─── Tabs ───────────────────────────────────────────────────────────────────

function DayTab({ goals, today, area }: { goals: Goal[]; today: DateKey; area?: Area }) {
  const list = useMemo(() => filterArea(goalsIn(goals, 'dia', today), area), [goals, today, area])
  const { big, small } = splitBig(list)
  const all = goalsIn(goals, 'dia', today)
  return (
    <>
      <div className="mt-6 px-1 flex items-baseline justify-between">
        <div>
          <div className="eyebrow">Hoje</div>
          <div className="font-display text-[22px] leading-tight mt-0.5 first-letter:uppercase">
            {formatLongDate(today)}
          </div>
        </div>
        {all.length > 0 && (
          <span className="text-[13px] text-muted">{progressWords(doneCount(all).done, all.length)}</span>
        )}
      </div>
      <GoalSections
        big={big}
        small={small}
        level="dia"
        emptyBig={{
          emoji: '☀️',
          title: 'O que faria hoje valer a pena?',
          text: 'Uma, duas, no máximo três. O resto pode esperar.',
        }}
        filtered={!!area}
      />
    </>
  )
}

function WeekTab({
  goals,
  today,
  area,
  weekStart,
  setWeekStart,
}: {
  goals: Goal[]
  today: DateKey
  area?: Area
  weekStart: DateKey
  setWeekStart: (k: DateKey) => void
}) {
  const all = useMemo(() => goalsIn(goals, 'semana', weekStart), [goals, weekStart])
  const list = useMemo(() => filterArea(all, area), [all, area])
  const { big, small } = splitBig(list)
  const { done, total } = doneCount(all)
  const current = startOfWeek(today)
  const isCurrent = weekStart === current
  const prevWeekOpen = useMemo(
    () => (isCurrent ? goalsIn(goals, 'semana', addDays(weekStart, -7)).filter((g) => g.status === 'ativa') : []),
    [goals, weekStart, isCurrent],
  )

  const bringOver = () => {
    let slots = MAX_BIG - bigRivals(goals, { level: 'semana', period: weekStart }).length
    for (const g of prevWeekOpen) {
      const keepBig = g.big && slots > 0
      if (keepBig) slots--
      actions.update('goals', g.id, { period: weekStart, big: keepBig })
    }
    haptic('light')
    toast(
      prevWeekOpen.length === 1
        ? 'Trouxe 1 meta pra essa semana'
        : `Trouxe ${prevWeekOpen.length} metas pra essa semana`,
    )
  }

  return (
    <>
      <Card className="mt-6 flex items-center gap-3">
        <IconButton
          label="Semana anterior"
          size="sm"
          variant="soft"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
        >
          <ChevronLeft size={18} />
        </IconButton>
        <div className="flex-1 min-w-0 text-center">
          <div className="eyebrow">
            {isCurrent ? 'Sua semana' : weekStart < current ? 'Semana que passou' : 'Semana que vem'}
          </div>
          <div className="font-display text-[20px] leading-tight mt-0.5">{weekLabel(weekStart)}</div>
          {!isCurrent && (
            <button className="text-[12.5px] text-accent mt-0.5 h-7" onClick={() => setWeekStart(current)}>
              voltar pra essa semana
            </button>
          )}
        </div>
        <IconButton label="Próxima semana" size="sm" variant="soft" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight size={18} />
        </IconButton>
      </Card>

      {total > 0 && (
        <div className="flex items-center gap-3 mt-3 px-1">
          <div className="shrink-0">
            <ProgressRing value={done} max={total} size={40} tone="sage" />
          </div>
          <div className="text-[14px] text-ink-2">
            {progressWords(done, total)}
            <span className="text-muted"> · {done === total ? 'que semana!' : 'um passo de cada vez'}</span>
          </div>
        </div>
      )}

      {showMondayNudge(goals, today, weekStart) && (
        <Card className="mt-4 bg-accent-soft border-transparent">
          <div className="font-display text-[18px] leading-snug">Segunda é dia de escolher 3 grandes metas ✨</div>
          <div className="text-[14px] text-ink-2 mt-1">O que faria essa semana valer a pena?</div>
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            icon={<Plus size={16} />}
            onClick={() => openSheet('goal', { level: 'semana' })}
          >
            Escolher a primeira
          </Button>
        </Card>
      )}

      {prevWeekOpen.length > 0 && (
        <button
          onClick={bringOver}
          className="mt-3 w-full flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 min-h-12 text-left text-[14px] text-ink-2 active:scale-[0.99] transition"
        >
          <span>
            {prevWeekOpen.length === 1 ? '1 meta ficou' : `${prevWeekOpen.length} metas ficaram`} da semana passada
          </span>
          <span className="text-accent font-medium shrink-0">trazer</span>
        </button>
      )}

      <GoalSections
        big={big}
        small={small}
        level="semana"
        emptyBig={{
          emoji: '🎯',
          title: isCurrent ? 'Quais são as 3 grandes dessa semana?' : 'Nenhuma grande por aqui',
          text: isCurrent
            ? 'Escolha o que realmente importa. O resto entra como menor.'
            : 'Tudo bem — semana é pra viver.',
        }}
        filtered={!!area}
        canAdd={isCurrent || weekStart > current}
      />
    </>
  )
}

function BiggerTab({ goals, area }: { goals: Goal[]; area?: Area }) {
  const list = useMemo(() => filterArea(goalsIn(goals, 'maior'), area), [goals, area])
  const { big, small } = splitBig(list)
  return (
    <>
      <p className="mt-6 px-1 text-[14px] text-muted">Os horizontes. Sem pressa, mas com direção.</p>
      <SectionTitle className="mt-4">Grandes</SectionTitle>
      {big.length === 0 ? (
        <Card>
          <EmptyState
            compact
            emoji="🏔️"
            title={area ? 'Nada nessa categoria' : 'Onde você quer chegar?'}
            text="Uma viagem pronta, um idioma, um projeto no ar."
            action={
              <Button size="sm" icon={<Plus size={16} />} onClick={() => openSheet('goal', { level: 'maior' })}>
                Nova meta maior
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {big.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <BiggerCard goal={g} goals={goals} />
            </motion.div>
          ))}
        </div>
      )}
      {small.length > 0 && (
        <>
          <SectionTitle>Também no radar</SectionTitle>
          <div className="space-y-3">
            {small.map((g) => (
              <BiggerCard key={g.id} goal={g} goals={goals} compact />
            ))}
          </div>
        </>
      )}
      <AddRow level="maior" />
    </>
  )
}

// ─── Building blocks ────────────────────────────────────────────────────────

function GoalSections({
  big,
  small,
  level,
  emptyBig,
  filtered,
  canAdd = true,
}: {
  big: Goal[]
  small: Goal[]
  level: GoalLevel
  emptyBig: { emoji: string; title: string; text: string }
  filtered: boolean
  canAdd?: boolean
}) {
  return (
    <>
      <SectionTitle>{`Grandes · ${big.length} de ${MAX_BIG}`}</SectionTitle>
      {big.length === 0 ? (
        <Card>
          <EmptyState
            compact
            emoji={filtered ? '🔍' : emptyBig.emoji}
            title={filtered ? 'Nada nessa categoria' : emptyBig.title}
            text={filtered ? undefined : emptyBig.text}
            action={
              canAdd && !filtered ? (
                <Button size="sm" icon={<Plus size={16} />} onClick={() => openSheet('goal', { level })}>
                  Escolher meta
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {big.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <BigGoalCard goal={g} index={i + 1} />
            </motion.div>
          ))}
        </div>
      )}

      {small.length > 0 && (
        <>
          <SectionTitle>Menores</SectionTitle>
          <ListCard>
            {small.map((g) => (
              <SmallGoalRow key={g.id} goal={g} />
            ))}
          </ListCard>
        </>
      )}
      {canAdd && <AddRow level={level} />}
    </>
  )
}

function AddRow({ level }: { level: GoalLevel }) {
  return (
    <button
      onClick={() => openSheet('goal', { level })}
      className="mt-3 w-full flex items-center gap-2 h-12 px-4 rounded-2xl border border-dashed border-line text-[14px] text-muted active:bg-surface-2 transition"
    >
      <Plus size={16} />
      {level === 'maior' ? 'Nova meta maior' : level === 'dia' ? 'Nova meta de hoje' : 'Nova meta da semana'}
    </button>
  )
}

function BigGoalCard({ goal, index }: { goal: Goal; index: number }) {
  const done = goal.status === 'feita'
  return (
    <SwipeRow
      onComplete={() => toggleDone(goal)}
      onDelete={() => remove(goal)}
      completeLabel={done ? 'Reabrir' : 'Feita'}
      className="rounded-[22px]"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => openSheet('goal', { id: goal.id })}
        onKeyDown={(e) => e.key === 'Enter' && openSheet('goal', { id: goal.id })}
        className={cn('card flex items-start gap-3 p-4 pl-3 cursor-pointer', done && 'opacity-75')}
      >
        <span className="font-display text-[26px] leading-none text-sand w-6 text-center pt-0.5 shrink-0" aria-hidden>
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              'font-display text-[19px] leading-snug',
              done && 'line-through decoration-muted/60 text-muted',
            )}
          >
            {goal.title}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <AreaTag area={goal.category} />
            {goal.deadline && <span className="text-[12px] text-muted">até {formatShortDate(goal.deadline)}</span>}
            {goal.notes && <span className="text-[12px] text-muted truncate max-w-[16ch]">· {goal.notes}</span>}
          </div>
        </div>
        <Checkbox
          checked={done}
          onChange={() => toggleDone(goal)}
          label={done ? 'Reabrir meta' : 'Marcar como feita'}
          className="mt-0.5 mr-0"
        />
      </div>
    </SwipeRow>
  )
}

function SmallGoalRow({ goal }: { goal: Goal }) {
  const done = goal.status === 'feita'
  return (
    <SwipeRow
      onComplete={() => toggleDone(goal)}
      onDelete={() => remove(goal)}
      completeLabel={done ? 'Reabrir' : 'Feita'}
      className="rounded-none"
    >
      <div className="flex items-center gap-3 min-h-[52px] px-4 py-2">
        <Checkbox
          checked={done}
          onChange={() => toggleDone(goal)}
          label={done ? 'Reabrir meta' : 'Marcar como feita'}
          size="sm"
          className="ml-0"
        />
        <button className="flex-1 min-w-0 text-left py-1" onClick={() => openSheet('goal', { id: goal.id })}>
          <div className={cn('text-[15px] leading-snug', done && 'line-through text-muted decoration-muted/50')}>
            {goal.title}
          </div>
        </button>
        <AreaTag area={goal.category} />
      </div>
    </SwipeRow>
  )
}

function BiggerCard({ goal, goals, compact }: { goal: Goal; goals: Goal[]; compact?: boolean }) {
  const done = goal.status === 'feita'
  const subs = useMemo(() => subGoals(goals, goal.id), [goals, goal.id])
  const [adding, setAdding] = useState('')
  const progress = goal.progress ?? 0

  const addSub = () => {
    const t = adding.trim()
    if (!t) return
    actions.create('goals', {
      title: t,
      level: 'maior',
      category: goal.category,
      big: false,
      status: 'ativa',
      parentId: goal.id,
      order: nextOrder(goals),
    })
    setAdding('')
    haptic('light')
  }

  return (
    <div className={cn('card p-4', done && 'opacity-80')}>
      <div className="flex items-start gap-3">
        <button className="flex-1 min-w-0 text-left" onClick={() => openSheet('goal', { id: goal.id })}>
          <div
            className={cn(
              'font-display leading-snug',
              compact ? 'text-[17px]' : 'text-[21px]',
              done && 'line-through decoration-muted/60',
            )}
          >
            {goal.title}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <AreaTag area={goal.category} />
            {goal.deadline && <span className="text-[12px] text-muted">até {formatShortDate(goal.deadline)}</span>}
          </div>
        </button>
        <Checkbox
          checked={done}
          onChange={() => toggleDone(goal)}
          label={done ? 'Reabrir meta' : 'Marcar como feita'}
          className="mr-0"
        />
      </div>

      {!compact && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[12.5px] text-muted">
            <span>{progressLabel(progress)}</span>
            <span>arraste pra atualizar</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            aria-label={`Progresso de ${goal.title}`}
            onChange={(e) =>
              actions.update('goals', goal.id, {
                progress: Number(e.target.value),
              })
            }
            onPointerUp={() => haptic('light')}
            className="w-full h-9 accent-accent"
          />
        </div>
      )}

      {(subs.length > 0 || !compact) && (
        <div className="mt-2 border-t border-line/70 pt-2">
          {subs.map((s) => (
            <SubGoalRow key={s.id} goal={s} />
          ))}
          {!compact && (
            <form
              className="flex items-center gap-2 mt-1"
              onSubmit={(e) => {
                e.preventDefault()
                addSub()
              }}
            >
              <Plus size={16} className="text-muted shrink-0 ml-0.5" />
              <input
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                placeholder="Adicionar um passo"
                className="flex-1 min-w-0 bg-transparent outline-none h-11 placeholder:text-muted/80"
                aria-label="Adicionar sub-meta"
              />
              {adding.trim() && (
                <Button size="sm" type="submit">
                  Ok
                </Button>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  )
}

function SubGoalRow({ goal }: { goal: Goal }) {
  const done = goal.status === 'feita'
  const tag: ReactNode =
    goal.level === 'semana' && goal.period
      ? `semana ${weekLabel(goal.period)}`
      : goal.level === 'dia' && goal.period
        ? formatShortDate(goal.period)
        : null
  return (
    <div className="flex items-center gap-3 min-h-11">
      <Checkbox
        checked={done}
        onChange={() => toggleDone(goal)}
        label={done ? 'Reabrir passo' : 'Marcar passo como feito'}
        size="sm"
        className="ml-0"
      />
      <button className="flex-1 min-w-0 text-left" onClick={() => openSheet('goal', { id: goal.id })}>
        <span className={cn('text-[14.5px] leading-snug', done && 'line-through text-muted decoration-muted/50')}>
          {goal.title}
        </span>
        {tag && <span className="block text-[12px] text-muted">{tag}</span>}
      </button>
    </div>
  )
}
