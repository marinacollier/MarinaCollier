/** Corpo + dinheiro widgets on Hoje: treino, refeições, gastos. */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { ROUTES } from '@/app/routes'
import { removeWithUndo } from '@/app/undo'
import { actions } from '@/data/store'
import { DAY_TYPE_LABEL, dayPlanFor, dayTrainingContext } from '@/data/fuel'
import { hmToMinutes } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { Pill, TONE, tone as toneOf } from '@/components/ui'
import { categoryOf, expensesBetween, mealsOn, modalityOf, sumCents, workoutsOn } from '@/data/selectors'
import type { MealSlot, NutritionDayPlan, PlannedMeal, Workout, WorkoutStatus } from '@/data/types'
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
  return plan ? <DietaWidget ctx={ctx} plan={plan} /> : <SlotsWidget ctx={ctx} />
}

/** Which slot a prescribed meal falls into (training meals go to 'extra'). */
export function slotForPlannedMeal(m: PlannedMeal): MealSlot {
  if (m.phase === 'pre' || m.phase === 'intra') return 'extra'
  const min = m.time ? hmToMinutes(m.time) : 12 * 60
  if (min < 10 * 60 + 30) return 'cafe'
  if (min < 11 * 60 + 30) return 'lanche_manha'
  if (min < 15 * 60) return 'almoco'
  if (min < 18 * 60 + 30) return 'lanche_tarde'
  return 'jantar'
}

/** Index of the meal to highlight: the last one whose time has started, or the first. */
export function currentPlannedMeal(meals: PlannedMeal[], minutes: number): number {
  let idx = 0
  meals.forEach((m, i) => {
    if (m.time && hmToMinutes(m.time) <= minutes) idx = i
  })
  return idx
}

const PHASE_LABEL: Partial<Record<NonNullable<PlannedMeal['phase']>, string>> = { pre: 'pré-treino', intra: 'intra', pos: 'pós-treino' }

/** "Dieta de hoje": the nutritionist's plan for today's training type, meal by meal. */
function DietaWidget({ ctx, plan }: { ctx: WidgetCtx; plan: NutritionDayPlan }) {
  const { db, today, minutes } = ctx
  const nav = useNavigate()
  const [open, setOpen] = useState<number | null>(null)
  const context = useMemo(() => dayTrainingContext(db, today), [db, today])
  const logged = useMemo(() => mealsOn(db, today), [db, today])
  const keyWorkout = context.key ?? context.workouts[0]
  const current = currentPlannedMeal(plan.meals, minutes)
  const refOf = (i: number) => `${plan.id}#${i}`

  const markEaten = (m: PlannedMeal, i: number) => {
    const existing = logged.find((x) => x.planMealRef === refOf(i))
    if (existing) {
      removeWithUndo('meals', existing.id, 'Desmarcado')
      return
    }
    const phase = m.phase
    actions.create('meals', {
      date: today,
      slot: slotForPlannedMeal(m),
      time: m.time,
      description: m.items.map((it) => it.food).join(' + '),
      done: true,
      planned: true,
      tags: [],
      planMealRef: refOf(i),
      purpose: phase === 'pre' ? 'pre_treino' : phase === 'intra' ? 'intra_treino' : phase === 'pos' ? 'pos_treino' : 'geral',
      workoutId: phase && phase !== 'refeicao' ? keyWorkout?.id : undefined,
    })
    haptic('success')
    toast(`${m.name} ✓`)
  }

  const extras = logged.filter((x) => !x.planMealRef)
  return (
    <Widget
      id="refeicoes"
      eyebrow="Dieta de hoje"
      flush
      action={
        <HeaderLink onClick={() => nav(ROUTES.nutrition)} label="Ver estratégia nutricional">
          plano
        </HeaderLink>
      }
    >
      <div className="px-4 pb-2 -mt-1 text-[13px] text-muted">
        {DAY_TYPE_LABEL[context.dayType]} · plano “{plan.name}” do nutri
      </div>
      <div className="divide-y divide-line/60">
        {plan.meals.map((m, i) => {
          const eaten = logged.some((x) => x.planMealRef === refOf(i))
          const isNow = i === current && !eaten
          const expanded = open === i
          const phaseLabel = m.phase ? PHASE_LABEL[m.phase] : undefined
          return (
            <div key={i} className={cn(isNow && 'bg-accent-soft/40')}>
              <div className="flex items-start gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : i)}
                  aria-expanded={expanded}
                  className="flex-1 min-w-0 flex items-start gap-3 text-left"
                >
                  <span className={cn('font-sport text-[15px] w-11 shrink-0 pt-0.5', isNow ? 'text-accent' : 'text-muted')}>{m.time ?? ''}</span>
                  <span className="min-w-0">
                    <span className={cn('block text-[14.5px] leading-snug', eaten ? 'text-muted line-through decoration-muted/40' : isNow ? 'font-semibold text-ink' : 'text-ink-2')}>
                      {m.name}
                      {phaseLabel && <span className="ml-1.5 align-middle text-[11px] font-sport uppercase tracking-wider text-sand">{phaseLabel}</span>}
                    </span>
                    <span className={cn('block text-[13px] text-muted', !expanded && 'truncate')}>{m.items.map((it) => it.food).join(' · ')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => markEaten(m, i)}
                  aria-pressed={eaten}
                  aria-label={eaten ? `Desmarcar ${m.name}` : `Marcar ${m.name} como feito`}
                  className={cn(
                    'shrink-0 h-9 px-3 rounded-full text-[13px] font-medium transition active:scale-95',
                    eaten ? 'bg-sage-soft text-sage' : isNow ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2',
                  )}
                >
                  {eaten ? '✓ feito' : 'comi'}
                </button>
              </div>
              {expanded && (
                <div className="px-4 pb-3 pl-[4.25rem] space-y-1.5">
                  {m.items.map((it, j) => (
                    <div key={j} className="text-[13.5px]">
                      <span className="text-ink">{it.food}</span>
                      {it.qty && <span className="text-muted"> — {it.qty}</span>}
                      {!!it.substitutions?.length && (
                        <details className="mt-0.5">
                          <summary className="text-[12.5px] text-accent cursor-pointer">trocas possíveis</summary>
                          <ul className="mt-1 space-y-0.5 text-[12.5px] text-muted">
                            {it.substitutions.map((sub, k) => (
                              <li key={k}>{sub}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))}
                  {m.notes && <div className="text-[12.5px] text-ink-2 italic">{m.notes}</div>}
                  {m.phase && m.phase !== 'refeicao' && keyWorkout && !keyWorkout.id.startsWith('template:') && (
                    <button type="button" onClick={() => openSheet('fuel', { workoutId: keyWorkout.id })} className="text-[13px] font-medium text-accent h-8">
                      ver estratégia do treino →
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {extras.map((m) => (
          <button key={m.id} type="button" onClick={() => openSheet('meal', { id: m.id })} className="w-full flex items-center gap-3 px-4 min-h-[44px] text-left active:bg-surface-2">
            <span className="font-sport text-[15px] w-11 text-muted">{m.time ?? '+'}</span>
            <span className="flex-1 min-w-0 text-[13.5px] text-ink-2 truncate">{m.description}</span>
            <span className="text-sage text-[13px]">✓</span>
          </button>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-line/60">
        <button type="button" onClick={() => openSheet('meal', { date: today })} className="text-[14px] font-medium text-accent inline-flex items-center gap-1.5 h-9">
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
