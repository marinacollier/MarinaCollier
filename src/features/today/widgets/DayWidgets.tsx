/** Corpo + dinheiro widgets on Hoje: treino, refeições, gastos. */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { DAY_TYPE_LABEL, dayPlanFor, dayTrainingContext } from '@/data/fuel'
import { hmToMinutes } from '@/lib/date'
import { Pill, TONE, tone as toneOf } from '@/components/ui'
import { categoryOf, expensesBetween, mealsOn, modalityOf, sumCents, workoutsOn } from '@/data/selectors'
import { consumedTimeOf, dayMeals, shortFood, slotForPlannedMeal as engineSlotForPlannedMeal, type PlanMealView } from '@/data/nutrition'
import { NutritionSheetHost, openNutritionSheet } from '@/features/nutrition/sheet-host'
import { AdjustmentCard, SourceBadge } from '@/features/nutrition/nutri-ui'
import { toggleEaten } from '@/features/nutrition/feedback'
import type { MealSlot, PlannedMeal, Workout, WorkoutStatus } from '@/data/types'
import { formatBRL } from '@/lib/money'
import { cn } from '@/lib/cn'
import { HeaderLink, SoftAction, Widget, WidgetEmpty, type WidgetCtx } from './shared'

// ─── Treino ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<WorkoutStatus, { label: string; className: string }> = {
  planejado: { label: 'planejado', className: 'bg-surface-2 text-ink-2' },
  feito: { label: 'feito ✓', className: 'bg-sage-soft text-sage' },
  adaptado: { label: 'adaptado ✓', className: 'bg-sage-soft text-sage' },
  descanso: { label: 'descanso', className: 'bg-sage-soft text-sage' },
  pulado: { label: 'fica pra outro dia', className: 'bg-surface-2 text-muted' },
}

function WorkoutBlock({ w, ctx }: { w: Workout; ctx: WidgetCtx }) {
  const m = modalityOf(ctx.db, w.modality)
  const t = toneOf(m.tone)
  const dur = w.durationMin ?? w.plannedDurationMin
  const status = STATUS_LABEL[w.status]
  const facts = [w.time, dur ? `${dur} min${w.durationMin ? '' : ' previstos'}` : undefined, w.plannedDistanceKm && !w.distanceKm ? `${w.plannedDistanceKm} km` : w.distanceKm ? `${w.distanceKm} km` : undefined].filter(Boolean)
  return (
    <div className="flex gap-3.5">
      <button type="button" onClick={() => openSheet('workout', { id: w.id })} className={cn('h-14 w-14 rounded-2xl flex items-center justify-center text-[28px] shrink-0 active:scale-95 transition', t.soft)} aria-label={`Editar ${m.label}`}>
        <span aria-hidden>{m.emoji}</span>
      </button>
      <div className="flex-1 min-w-0">
        <button type="button" onClick={() => openSheet('workout', { id: w.id })} className="text-left w-full">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-[20px] leading-tight">{w.title || m.label}</span>
            <Pill className={status.className}>{status.label}</Pill>
          </div>
          {facts.length > 0 && <div className="text-[13.5px] text-ink-2 mt-0.5">{facts.join(' · ')}</div>}
          {w.goal && <div className="text-[13.5px] text-muted mt-0.5">🎯 {w.goal}</div>}
          {w.notes && <div className="text-[13px] text-muted mt-1 line-clamp-2">{w.notes}</div>}
        </button>
        {w.status === 'planejado' && (
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => openSheet('workoutLog', { id: w.id })} className={cn('h-9 px-4 rounded-full text-[13px] font-semibold active:scale-[0.97] transition', TONE.ink.solid)}>
              Registrar treino
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function TreinoWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const workouts = useMemo(() => workoutsOn(db, today), [db, today])
  const active = workouts.filter((w) => w.status !== 'descanso')
  const rest = workouts.length > 0 && active.length === 0
  return (
    <Widget id="treino" eyebrow="Treino de hoje" action={workouts.length ? <HeaderLink onClick={() => openSheet('workout', { date: today })}>+ outro</HeaderLink> : undefined}>
      {rest ? (
        <WidgetEmpty emoji="🌿" text={<><span className="font-display text-[17px] text-ink block">Dia de descanso</span>recuperar também é treino.</>} />
      ) : active.length === 0 ? (
        <WidgetEmpty
          emoji="🏃‍♀️"
          text="Nenhum treino planejado pra hoje."
          action={<SoftAction onClick={() => openSheet('workout', { date: today })}>Planejar</SoftAction>}
        />
      ) : (
        <div className="space-y-4">
          {active.map((w) => (
            <WorkoutBlock key={w.id} w={w} ctx={ctx} />
          ))}
        </div>
      )}
    </Widget>
  )
}

// ─── Refeições ──────────────────────────────────────────────────────────────

const SLOTS: { slot: MealSlot; label: string; emoji: string }[] = [
  { slot: 'cafe', label: 'Café da manhã', emoji: '☕' },
  { slot: 'lanche_manha', label: 'Lanche', emoji: '🍎' },
  { slot: 'almoco', label: 'Almoço', emoji: '🥗' },
  { slot: 'lanche_tarde', label: 'Lanche', emoji: '🥜' },
  { slot: 'jantar', label: 'Jantar', emoji: '🍲' },
]

export function currentMealSlot(minutes: number): MealSlot {
  if (minutes < 10 * 60 + 30) return 'cafe'
  if (minutes < 11 * 60 + 45) return 'lanche_manha'
  if (minutes < 15 * 60) return 'almoco'
  if (minutes < 18 * 60 + 30) return 'lanche_tarde'
  return 'jantar'
}

export function RefeicoesWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const plan = useMemo(() => dayPlanFor(db, today), [db, today])
  return plan ? <DietaWidget ctx={ctx} /> : <SlotsWidget ctx={ctx} />
}

/** Which slot a prescribed meal falls into (training meals go to 'extra'). */
export const slotForPlannedMeal = (m: PlannedMeal): MealSlot => engineSlotForPlannedMeal(m)

/** Index of the meal to highlight: the last one whose time has started, or the first. */
export function currentPlannedMeal(meals: PlannedMeal[], minutes: number): number {
  let idx = 0
  meals.forEach((m, i) => {
    if (m.time && hmToMinutes(m.time) <= minutes) idx = i
  })
  return idx
}

/** "cuscuz · ovo · queijo muçarela" — the meal in a few words. */
export function mealSummary(items: { food: string }[], max = 3): string {
  const names = [...new Set(items.map((i) => shortFood(i.food)))]
  return names.length > max ? `${names.slice(0, max).join(' · ')} +${names.length - max}` : names.join(' · ')
}

/** The meal that deserves the "comi" emphasis: the first not eaten whose time has started (or the next). */
export function focusMeal(meals: PlanMealView[], minutes: number): string | undefined {
  const lastDone = meals.reduce((acc, m, i) => (m.status === 'consumed' || m.status === 'skipped' ? i : acc), -1)
  const open = meals.filter((m, i) => i > lastDone && (m.status === 'future' || m.status === 'past'))
  const started = open.filter((m) => m.plannedTime && hmToMinutes(m.plannedTime) <= minutes + 30)
  return (started[started.length - 1] ?? open[0])?.ref
}

const PHASE_LABEL: Partial<Record<NonNullable<PlannedMeal['phase']>, string>> = { pre: 'pré', intra: 'intra', pos: 'pós' }

/** "Dieta de hoje": the nutritionist's plan for today's training type — light, one line per meal. */
function DietaWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today, minutes } = ctx
  const nav = useNavigate()
  const context = useMemo(() => dayTrainingContext(db, today), [db, today])
  const day = useMemo(() => dayMeals(db, today, minutes), [db, today, minutes])
  const focus = focusMeal(day.meals, minutes)
  const proposal = day.meals.find((m) => m.proposed)?.proposed
  const open = (ref: string) => openNutritionSheet('mealDetail', { date: today, ref })

  return (
    <Widget
      id="refeicoes"
      eyebrow="Dieta de hoje"
      flush
      action={
        <HeaderLink onClick={() => nav(ROUTES.nutrition)} label="Detalhes do dia">
          detalhes
        </HeaderLink>
      }
    >
      <NutritionSheetHost />
      <div className="px-4 pb-1.5 -mt-1 text-[12.5px] text-muted">
        {DAY_TYPE_LABEL[context.dayType]} · plano “{day.plan!.name}” do nutri
      </div>
      <ul className="divide-y divide-line/50">
        {day.meals.map((m) => {
          const eaten = m.status === 'consumed'
          const isFocus = m.ref === focus
          const phase = m.phase ? PHASE_LABEL[m.phase] : undefined
          return (
            <li key={m.ref} className={cn('flex items-center gap-3 pl-4 pr-3 min-h-[54px] py-1.5', isFocus && 'bg-accent-soft/35')}>
              <button type="button" onClick={() => open(m.ref)} className="flex-1 min-w-0 flex items-center gap-3 text-left active:opacity-70">
                <span className={cn('font-sport text-[14.5px] w-11 shrink-0 tabular-nums', isFocus ? 'text-accent' : 'text-muted')}>{m.plannedTime ?? ''}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn('text-[14.5px] leading-snug truncate', eaten ? 'text-ink-2' : m.status === 'skipped' ? 'text-muted' : isFocus ? 'font-semibold text-ink' : 'text-ink')}>{m.name}</span>
                    {phase && <span className="text-[10.5px] font-sport uppercase tracking-wider text-sand shrink-0">{phase}</span>}
                    {m.badge !== 'nutri' && <SourceBadge source={m.badge} />}
                  </span>
                  <span className="block text-[12.5px] text-muted truncate">{m.status === 'skipped' ? 'fora hoje' : mealSummary(m.items)}</span>
                </span>
              </button>
              {eaten ? (
                <button type="button" onClick={() => toggleEaten(today, m.ref, m.name)} aria-label={`Desmarcar ${m.name}`} className="shrink-0 h-11 px-2 text-[13px] text-sage font-medium tabular-nums">
                  ✓ {m.consumedTime}
                </button>
              ) : m.status !== 'skipped' ? (
                <button
                  type="button"
                  onClick={() => toggleEaten(today, m.ref, m.name)}
                  aria-label={`Comi ${m.name}`}
                  className={cn('shrink-0 h-9 px-3.5 rounded-full text-[13px] font-medium transition active:scale-95', isFocus ? 'bg-ink text-bg' : 'text-muted border border-line/80')}
                >
                  comi
                </button>
              ) : null}
            </li>
          )
        })}
        {day.extras.map((x) => (
          <li key={x.id}>
            <button type="button" onClick={() => openSheet('meal', { id: x.id })} className="w-full flex items-center gap-3 pl-4 pr-4 min-h-[48px] text-left active:bg-surface-2">
              <span className="font-sport text-[14.5px] w-11 text-muted tabular-nums">{consumedTimeOf(x) ?? '+'}</span>
              <span className="flex-1 min-w-0 text-[14px] text-ink-2 truncate">{x.description}</span>
              <span className="text-[11px] text-muted uppercase tracking-wider">extra</span>
              <span className="text-sage text-[13px]">✓</span>
            </button>
          </li>
        ))}
      </ul>
      {proposal && (
        <div className="px-3 pt-3">
          <AdjustmentCard db={db} adj={proposal} nowMinutes={minutes} />
        </div>
      )}
      <div className="px-4 py-2.5 mt-1 border-t border-line/60">
        <button type="button" onClick={() => openSheet('meal', { date: today })} className="text-[14px] font-medium text-accent inline-flex items-center gap-1.5 h-10">
          <Plus size={16} /> registrar outra coisa
        </button>
      </div>
    </Widget>
  )
}

/** Fallback when there is no prescribed plan for today's training type. */
function SlotsWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today, minutes } = ctx
  const meals = useMemo(() => mealsOn(db, today), [db, today])
  const now = currentMealSlot(minutes)
  const extras = meals.filter((m) => m.slot === 'extra')
  return (
    <Widget id="refeicoes" eyebrow="Refeições" flush>
      <div className="divide-y divide-line/60">
        {SLOTS.map((s) => {
          const list = meals.filter((m) => m.slot === s.slot)
          const done = list.filter((m) => m.done)
          const planned = list.find((m) => !m.done)
          const first = done[0] ?? planned
          const isNow = s.slot === now && done.length === 0
          return (
            <button
              key={s.slot}
              type="button"
              onClick={() => (first ? openSheet('meal', { id: first.id }) : openSheet('meal', { slot: s.slot, date: today }))}
              className="w-full flex items-center gap-3 px-4 min-h-[50px] py-2 text-left active:bg-surface-2 transition-colors"
            >
              <span className={cn('text-[17px] w-6 text-center transition-opacity', done.length === 0 && !isNow && 'opacity-50')} aria-hidden>
                {s.emoji}
              </span>
              <span className="w-[104px] shrink-0">
                <span className={cn('block text-[14px]', isNow ? 'font-semibold text-ink' : 'text-ink-2')}>{s.label}</span>
              </span>
              <span className="flex-1 min-w-0 text-[13.5px] truncate text-right">
                {done.length > 0 ? (
                  <span className="text-ink-2">
                    {done.map((m) => m.description).join(' + ')} <span className="text-sage">✓</span>
                  </span>
                ) : planned ? (
                  <span className="text-muted italic">planejado: {planned.description}</span>
                ) : (
                  <span className={cn('inline-flex items-center gap-1', isNow ? 'text-accent font-medium' : 'text-muted/70')}>
                    <Plus size={14} /> {isNow ? 'registrar' : ''}
                  </span>
                )}
              </span>
            </button>
          )
        })}
        {extras.map((m) => (
          <button key={m.id} type="button" onClick={() => openSheet('meal', { id: m.id })} className="w-full flex items-center gap-3 px-4 min-h-[48px] text-left active:bg-surface-2">
            <span className="text-[17px] w-6 text-center" aria-hidden>
              ✨
            </span>
            <span className="w-[104px] shrink-0 text-[14px] text-ink-2">Extra</span>
            <span className="flex-1 min-w-0 text-[13.5px] text-ink-2 truncate text-right">{m.description}</span>
          </button>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-line/60">
        <button type="button" onClick={() => openSheet('meal', { slot: now, date: today })} className="text-[14px] font-medium text-accent inline-flex items-center gap-1.5 h-9">
          <Plus size={16} /> registrar refeição
        </button>
      </div>
    </Widget>
  )
}

// ─── Gastos ─────────────────────────────────────────────────────────────────

export function GastosWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const list = useMemo(() => expensesBetween(db, today, today), [db, today])
  const total = sumCents(list)
  return (
    <Widget id="gastos" eyebrow="Gastos de hoje" action={<HeaderLink onClick={() => openSheet('expense')} label="Registrar gasto"><Plus size={15} /> gasto</HeaderLink>}>
      {list.length === 0 ? (
        <WidgetEmpty emoji="💸" text="Nenhum gasto registrado hoje." action={<SoftAction onClick={() => openSheet('expense')}>Registrar</SoftAction>} />
      ) : (
        <>
          <p className="text-[15px] text-ink-2">
            Hoje você gastou <span className="font-display text-[22px] text-ink tabular-nums">{formatBRL(total)}</span>
          </p>
          <ul className="mt-2.5 -mx-1">
            {list.slice(0, 4).map((e) => {
              const cat = categoryOf(db, e.categoryId)
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => openSheet('expense', { id: e.id })} className="w-full flex items-center gap-3 px-1 min-h-[44px] text-left active:opacity-70">
                    <span className={cn('h-8 w-8 rounded-full flex items-center justify-center text-[15px] shrink-0', toneOf(cat?.tone).soft)} aria-hidden>
                      {cat?.emoji ?? '•'}
                    </span>
                    <span className="flex-1 min-w-0 text-[14.5px] truncate">{e.title}</span>
                    <span className="text-[14px] tabular-nums text-ink-2">{formatBRL(e.amountCents)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {list.length > 4 && <p className="text-[12.5px] text-muted mt-1 px-0.5">+ {list.length - 4} outros</p>}
        </>
      )}
    </Widget>
  )
}
