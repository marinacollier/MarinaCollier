import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button, IconButton, Page } from '@/components/ui'
import { useDB } from '@/data/store'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { useToday } from '@/hooks/useToday'
import { addDays, formatDayMonth, formatFullDate, startOfWeek, toDateKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { commitPlan } from './commit'
import { buildOps, confirmedPlan, defaultWeekStart, emptyDraft, planDays, plannedSummaryLine, plannedWorkouts, STEPS, trainingLines, type WeekDraft } from './plan'
import { StepConfirmo } from './steps/StepConfirmo'
import { StepConflitos } from './steps/StepConflitos'
import { StepDeadlines } from './steps/StepDeadlines'
import { StepEstudos } from './steps/StepEstudos'
import { StepFixos } from './steps/StepFixos'
import { StepTreinos } from './steps/StepTreinos'
import { StepVida } from './steps/StepVida'
import type { StepProps } from './steps/types'

/** "Montar minha semana" — 7 calm steps; nothing is written until the last one. */
export default function WeekPlannerPage() {
  const nav = useNavigate()
  const db = useDB()
  const today = useToday()
  const [weekStart, setWeekStart] = useState(() => defaultWeekStart(today))
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<WeekDraft>(() => emptyDraft(weekStart))
  const [done, setDone] = useState<string | null>(null)

  const days = useMemo(() => planDays(weekStart, today), [weekStart, today])
  const lines = useMemo(() => trainingLines(db, weekStart, today), [db, weekStart, today])
  const planned = useMemo(() => plannedWorkouts(db, draft, lines), [db, draft, lines])
  const ops = useMemo(() => buildOps(db, draft, lines), [db, draft, lines])
  const already = confirmedPlan(db, weekStart)
  const minWeek = startOfWeek(today)

  const changeWeek = (delta: number) => {
    const next = addDays(weekStart, delta * 7)
    if (next < minWeek) return
    setWeekStart(next)
    setDraft(emptyDraft(next))
    setStep(0)
    setDone(null)
  }

  const go = (n: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)))
    window.scrollTo({ top: 0 })
  }

  const confirm = () => {
    const summary = plannedSummaryLine(db, weekStart, planned)
    commitPlan(ops)
    haptic('success')
    toast('Semana montada ✨', { tone: 'win' })
    setDone(summary)
    window.scrollTo({ top: 0 })
  }

  const props: StepProps = { db, today, weekStart, days, draft, setDraft, lines, planned }
  const s = STEPS[step]
  const weekLabel = `${formatDayMonth(weekStart)} – ${formatDayMonth(addDays(weekStart, 6))}`
  const isCurrent = weekStart === minWeek

  return (
    <Page>
      <header className="pt-2 pb-3">
        <div className="flex items-center justify-between min-h-11 -mx-1.5">
          <IconButton label="Sair" onClick={() => (history.length > 1 ? nav(-1) : nav(ROUTES.today))}>
            <X size={22} />
          </IconButton>
          <div className="flex items-center gap-0.5">
            <IconButton label="Semana anterior" size="sm" disabled={weekStart <= minWeek} className="disabled:opacity-30" onClick={() => changeWeek(-1)}>
              <ChevronLeft size={18} />
            </IconButton>
            <div className="text-center min-w-[118px]">
              <div className="text-[13.5px] font-medium tabular-nums">{weekLabel}</div>
              <div className="text-[11px] text-muted -mt-0.5">{isCurrent ? 'esta semana' : weekStart === addDays(minWeek, 7) ? 'próxima semana' : 'mais pra frente'}</div>
            </div>
            <IconButton label="Próxima semana" size="sm" disabled={weekStart >= addDays(minWeek, 28)} className="disabled:opacity-30" onClick={() => changeWeek(1)}>
              <ChevronRight size={18} />
            </IconButton>
          </div>
        </div>
        <div className="eyebrow mt-2">Montar minha semana</div>
        {!done && (
          <div className="flex items-center gap-1.5 mt-2.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Passo ${step + 1} de ${STEPS.length}`}>
            {STEPS.map((x, i) => (
              <button
                key={x.key}
                type="button"
                aria-label={`Ir para ${x.label}`}
                onClick={() => go(i)}
                className="h-6 flex items-center"
              >
                <span className={cn('block h-1.5 rounded-full transition-all duration-300', i === step ? 'w-6 bg-accent' : i < step ? 'w-1.5 bg-ink-2' : 'w-1.5 bg-line')} />
              </button>
            ))}
            <span className="text-[12px] text-muted ml-1.5">
              {step + 1}/{STEPS.length} · {s.label}
            </span>
          </div>
        )}
      </header>

      {done !== null ? (
        <Done summary={done} weekLabel={weekLabel} onAgenda={() => nav(ROUTES.agenda)} onToday={() => nav(ROUTES.today)} />
      ) : (
        <>
          {already && step === 0 && (
            <div className="rounded-2xl bg-sage-soft px-4 py-3 mb-4 text-[13.5px] text-ink-2 leading-snug">
              Você montou essa semana em {formatFullDate(toDateKey(new Date(already.confirmedAt!)))}. Dá pra ajustar e confirmar de novo — nada duplica.
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${weekStart}:${s.key}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
              <h1 className="font-display text-[28px] leading-[1.1] tracking-tight">{s.title}</h1>
              <p className="text-muted text-[14.5px] mt-1.5 mb-5 leading-snug">{s.lede}</p>
              {s.key === 'fixos' && <StepFixos {...props} />}
              {s.key === 'treinos' && <StepTreinos {...props} />}
              {s.key === 'estudos' && <StepEstudos {...props} />}
              {s.key === 'deadlines' && <StepDeadlines {...props} />}
              {s.key === 'vida' && <StepVida {...props} />}
              {s.key === 'conflitos' && <StepConflitos {...props} />}
              {s.key === 'confirmo' && <StepConfirmo {...props} ops={ops} />}
            </motion.div>
          </AnimatePresence>
          <div className="h-24" aria-hidden />

          <div className="fixed left-0 right-0 z-[45] bg-bg border-t border-line/70" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 60px)' }}>
            <div className="mx-auto max-w-[640px] px-4 py-2.5 flex gap-2.5">
              <Button variant="soft" onClick={() => go(step - 1)} disabled={step === 0} className="w-[96px]">
                Voltar
              </Button>
              {step < STEPS.length - 1 ? (
                <Button variant="primary" block onClick={() => go(step + 1)} className="flex-1">
                  Próximo · {STEPS[step + 1].label}
                </Button>
              ) : (
                <Button variant="accent" block onClick={confirm} className="flex-1">
                  Montar semana ✨
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  )
}

function Done({ summary, weekLabel, onAgenda, onToday }: { summary: string; weekLabel: string; onAgenda: () => void; onToday: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex flex-col items-center text-center pt-10 px-4">
      <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.7 }} className="text-[56px]" aria-hidden>
        ✨
      </motion.div>
      <h1 className="font-display text-[30px] leading-tight mt-2">Semana montada</h1>
      <p className="text-muted text-[15px] mt-1.5">{weekLabel}</p>
      {summary && <p className="text-[15px] text-ink-2 mt-4 max-w-[30ch]">{summary}</p>}
      <p className="text-[13.5px] text-muted mt-4 max-w-[32ch] leading-relaxed">É base, não regra. Se a semana mudar, ela muda junto.</p>
      <div className="flex flex-col gap-2.5 w-full max-w-[320px] mt-8">
        <Button variant="primary" block onClick={onAgenda}>
          Ver na agenda
        </Button>
        <Button variant="ghost" block onClick={onToday}>
          Ir pro Hoje
        </Button>
      </div>
    </motion.div>
  )
}
