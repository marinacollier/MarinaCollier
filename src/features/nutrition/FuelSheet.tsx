import { useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { actions, useDB } from '@/data/store'
import type { FuelPhase, NutritionSource } from '@/data/types'
import { closeSheet, openSheet } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { Button, EmptyState, SheetLayout } from '@/components/ui'
import { durationReviewSuggested, strategyFor } from '@/data/fuel'
import { relativeDay } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { durationRange, sourceLine, workoutEmoji, workoutTitle } from './format'
import { DONE_LABEL, fuelStages, hasGuidance, STAGE_LABEL, type FuelStage } from './logic'
import { PlannedMealBlock, SourceNote } from './components'
import { toggleFuelMark } from './mutations'

export default function FuelSheet({ workoutId }: SheetProps<'fuel'>) {
  const db = useDB()
  const w = db.workouts.find((x) => x.id === workoutId)
  const stages = useMemo(() => (w ? fuelStages(db, w) : []), [db, w])
  const strategy = useMemo(() => (w ? strategyFor(db, w) : undefined), [db, w])
  const review = useMemo(() => (w ? durationReviewSuggested(db, w) : false), [db, w])

  if (!w) {
    return (
      <SheetLayout title="Estratégia do treino" onClose={closeSheet}>
        <p className="text-muted text-[14px] pb-6">Esse treino não existe mais.</p>
      </SheetLayout>
    )
  }

  const done = w.fuelDone ?? []
  const toggle = (p: FuelPhase) => {
    if (toggleFuelMark(w.id, p)) haptic('success')
  }
  const range = durationRange(w)
  const guided = hasGuidance(stages)
  const markable = stages.filter((s): s is FuelStage & { phase: FuelPhase } => s.phase !== 'treino')

  return (
    <SheetLayout eyebrow={`${relativeDay(w.date)}${w.time ? ` · ${w.time}` : ''}`} title="Estratégia do treino" onClose={closeSheet}>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-surface-2 flex items-center justify-center text-2xl shrink-0" aria-hidden>
          {workoutEmoji(db.profile, w)}
        </div>
        <div className="min-w-0">
          <div className="font-display text-[20px] leading-tight">
            {workoutTitle(db.profile, w)}
            {w.isKeySession && <span className="ml-1.5" aria-label="sessão principal">🔥</span>}
          </div>
          <div className="text-[13px] text-muted">{[w.time, range].filter(Boolean).join(' · ') || 'sem horário definido'}</div>
        </div>
      </div>

      {review && (
        <div className="rounded-2xl bg-sand-soft px-4 py-3">
          <p className="text-[14px] leading-snug">A duração mudou bastante. Quer revisar a estratégia nutricional associada?</p>
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" variant="primary" onClick={() => actions.update('workouts', w.id, { strategyReviewedAtMin: w.plannedDurationMin })}>
              Revisei ✓
            </Button>
            <Button size="sm" variant="outline" onClick={() => openSheet('nutritionStrategy', { id: strategy?.id })}>
              Editar estratégia
            </Button>
          </div>
        </div>
      )}

      {/* Timeline header: ONTEM → PRÉ → TREINO → INTRA → PÓS (only relevant stages) */}
      <div className="flex items-center gap-1.5 flex-wrap text-[11.5px] font-semibold tracking-[0.08em] uppercase text-muted" aria-label="Linha do tempo">
        {stages.map((s, i) => (
          <span key={s.phase} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>→</span>}
            <span className={cn(s.phase === 'treino' && 'text-accent')}>{STAGE_LABEL[s.phase]}</span>
          </span>
        ))}
      </div>

      {!guided ? (
        <EmptyState
          compact
          emoji="🍽️"
          title="Ainda não tem estratégia cadastrada pra esse treino"
          text="Quando você ou o nutri registrarem a orientação, ela aparece aqui."
          action={
            <Button size="sm" variant="soft" onClick={() => openSheet('nutritionStrategy', {})}>
              Cadastrar
            </Button>
          }
        />
      ) : (
        <ol className="relative">
          {stages.map((s, i) => (
            <StageItem key={s.phase} stage={s} last={i === stages.length - 1} trainingLine={[w.time, range].filter(Boolean).join(' · ')} strategySource={strategy?.source} />
          ))}
        </ol>
      )}

      {guided && (
        <div>
          <div className="eyebrow mb-2">o que já fiz</div>
          <div className="flex flex-wrap gap-2">
            {markable.map((s) => {
              const on = done.includes(s.phase)
              return (
                <button
                  key={s.phase}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.phase)}
                  className={cn(
                    'h-10 px-3.5 rounded-full text-[13.5px] border inline-flex items-center gap-1.5 transition active:scale-[0.97]',
                    on ? 'bg-sage-soft border-sage text-ink' : 'bg-surface border-line text-ink-2',
                  )}
                >
                  <Check size={14} className={on ? 'text-sage' : 'text-muted/60'} /> {DONE_LABEL[s.phase]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {strategy && (
        <button type="button" onClick={() => openSheet('nutritionStrategy', { id: strategy.id })} className="text-[13px] text-muted underline underline-offset-4 decoration-line min-h-10">
          Estratégia “{strategy.name}” · editar
        </button>
      )}
    </SheetLayout>
  )
}

function StageItem({ stage, last, trainingLine, strategySource }: { stage: FuelStage; last: boolean; trainingLine: string; strategySource?: NutritionSource }) {
  const [showText, setShowText] = useState(false)
  const isTraining = stage.phase === 'treino'
  const hasMeals = stage.meals.length > 0
  return (
    <li className="relative pl-6 pb-5">
      {!last && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-line" aria-hidden />}
      <span className={cn('absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2', isTraining ? 'bg-accent border-accent' : 'bg-surface border-ink-2/50')} aria-hidden />
      <div className="eyebrow">{stage.phase === 'ontem' ? 'Ontem · véspera' : STAGE_LABEL[stage.phase]}</div>
      {isTraining ? (
        <div className="text-[14px] text-ink-2 mt-0.5">{trainingLine || 'Hora do treino'} — bom treino 💪</div>
      ) : (
        <div className="mt-1 space-y-2">
          {hasMeals ? (
            stage.meals.map((m, i) => <PlannedMealBlock key={`${m.time}-${i}`} meal={m} compact />)
          ) : stage.text ? (
            <p className="text-[14px] leading-relaxed whitespace-pre-line">{stage.text}</p>
          ) : (
            <p className="text-[13px] text-muted">sem orientação cadastrada pra essa etapa</p>
          )}
          {hasMeals && stage.text && (
            <div>
              <button type="button" onClick={() => setShowText((o) => !o)} className="inline-flex items-center gap-1 text-[12.5px] text-muted min-h-8" aria-expanded={showText}>
                <ChevronDown size={14} className={cn('transition-transform', showText && 'rotate-180')} /> texto da estratégia
              </button>
              {showText && <p className="text-[13px] text-ink-2 leading-relaxed whitespace-pre-line mt-1">{stage.text}</p>}
            </div>
          )}
          {(hasMeals || stage.text) && <SourceNote>{hasMeals ? sourceLine(stage.plan?.source, stage.plan?.prescribedAt) : sourceLine(strategySource)}{stage.phase === 'ontem' && stage.plan ? ` · plano de ${stage.plan.name.toLowerCase()}` : ''}</SourceNote>}
        </div>
      )}
    </li>
  )
}
