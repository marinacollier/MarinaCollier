/**
 * One expandable card per routine ("Milagre da manhã — 5/8 · 04:40–06:45"). Never 15 tasks on Home.
 * Collapsed: name, count, time range and a calm segmented bar. Expanded: the same compact time-first
 * rows as the Linha do dia (each item with its time, steps with derived times, "✓ 05:12"), with the
 * training and its fuel in place on a training morning, and "Hoje vou de versão curta".
 */
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Pencil } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { IconButton } from '@/components/ui'
import { dayTimeline, isAnytime } from '@/data/timeline'
import type { DateKey, DB, Routine } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { essentialSuggestion, routineView, setRoutineMode, type RoutineMode } from '../routine'
import { TimelineRow } from '../timeline/TimelineRow'
import { routineCardEntries } from '../timeline/view'

/** ▮▮▮▯▯ — one segment per item, no percentages. */
export function SegmentBar({ done, total, tone = 'sand' }: { done: number; total: number; tone?: 'sand' | 'sage' | 'plum' }) {
  const fill = tone === 'sage' ? 'bg-sage' : tone === 'plum' ? 'bg-plum' : 'bg-sand'
  return (
    <div className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: Math.max(total, 1) }, (_, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ opacity: i < done ? 1 : 0.35 }}
          className={cn('h-1.5 flex-1 rounded-full', i < done ? fill : 'bg-line')}
        />
      ))}
    </div>
  )
}

export interface RoutineCardProps {
  db: DB
  routine: Routine
  date: DateKey
  widgetId: string
  /** Tone of the bar + icon bubble. */
  tone?: 'sand' | 'plum'
  /** Short win message when the last item is checked. */
  doneToast?: string
  doneTitle?: string
}

export function RoutineCard({ db, routine, date, widgetId, tone = 'sand', doneToast, doneTitle }: RoutineCardProps) {
  const view = useMemo(() => routineView(db, routine, date), [db, routine, date])
  const suggestion = useMemo(() => essentialSuggestion(db, routine, date), [db, routine, date])
  const rows = useMemo(() => routineCardEntries(db, dayTimeline(db, date), routine.id), [db, date, routine.id])
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState<string>()
  const essential = view.mode === 'essential'
  const timed = rows.filter((e) => e.kind === 'routineItem' && !isAnytime(e))
  const range = timed.length ? `${timed[0].start}–${timed.at(-1)!.end ?? timed.at(-1)!.start}` : undefined
  const training = rows.find((e) => e.kind === 'workout')

  // A small celebration when the routine gets complete (only on the transition).
  const [wasComplete, setWasComplete] = useState(view.complete)
  useEffect(() => {
    if (view.complete && !wasComplete) {
      haptic('success')
      if (doneToast) toast(doneToast, { tone: 'win' })
    }
    setWasComplete(view.complete)
  }, [view.complete, wasComplete, doneToast])

  const name = `${routine.name}${essential ? ` · ${routine.essentialName ?? 'Essential'}` : ''}`
  const soft = tone === 'plum' ? 'bg-plum-soft' : 'bg-sand-soft'

  const chooseMode = (mode: RoutineMode) => {
    haptic('light')
    setRoutineMode(routine.id, date, mode)
    toast(mode === 'essential' ? 'Versão curta hoje ✓ — a rotina continua sua' : 'Versão completa ✓')
  }

  return (
    <section id={`w-${widgetId}`} className="card scroll-mt-4 overflow-hidden" aria-label={routine.name}>
      <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="w-full text-left px-4 pt-3.5 pb-3.5 active:bg-surface-2/60 transition-colors">
        <div className="flex items-center gap-3">
          <span className={cn('h-10 w-10 rounded-full flex items-center justify-center text-[19px] shrink-0', view.complete ? 'bg-sage-soft' : soft)} aria-hidden>
            {routine.emoji ?? '☀️'}
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-baseline gap-2">
              <span className="font-display text-[18px] leading-tight truncate">{view.complete && doneTitle ? doneTitle : name}</span>
              <span className={cn('text-[14px] tabular-nums shrink-0', view.complete ? 'text-sage font-medium' : 'text-ink-2')}>
                {view.done}/{view.total}
                {view.complete ? ' ✓' : ''}
              </span>
            </span>
            <span className="block mt-2">
              <SegmentBar done={view.done} total={view.total} tone={view.complete ? 'sage' : tone} />
            </span>
            {range && !view.complete && (
              <span className="block text-[12.5px] text-muted mt-1.5 tabular-nums">
                {range}
                {training ? ` · ${training.emoji ?? ''} ${training.title} às ${training.start}` : ''}
              </span>
            )}
          </span>
          <ChevronDown size={18} className={cn('text-muted shrink-0 transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {suggestion && !view.complete && (
        <div className="mx-4 mb-3.5 -mt-0.5 rounded-2xl bg-surface-2 pl-3.5 pr-1.5 py-1.5 flex items-center gap-2">
          <span className="flex-1 min-w-0 text-[13px] text-ink-2 leading-snug">{suggestion}</span>
          <button type="button" onClick={() => chooseMode('essential')} className="h-9 px-3 rounded-full bg-surface text-[12.5px] font-medium shrink-0 active:scale-[0.97] transition">
            versão curta
          </button>
          <button type="button" onClick={() => setRoutineMode(routine.id, date, 'completa')} className="h-9 px-2 text-[12.5px] text-muted shrink-0">
            agora não
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-line/60 px-4 pt-1 pb-1">
              {rows.length === 0 ? (
                <p className="text-[14px] text-muted py-3">Nada nessa rotina hoje. Dia livre 🌿</p>
              ) : (
                <div className="relative">
                  <span aria-hidden className="absolute left-[56.5px] top-3 bottom-3 w-px bg-line" />
                  {rows.map((e) => (
                    <TimelineRow key={e.key} e={e} today={date} editing={editing} setEditing={setEditing} />
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
              {routine.hasEssential ? (
                <button
                  type="button"
                  onClick={() => chooseMode(essential ? 'completa' : 'essential')}
                  className="h-11 px-3 rounded-full text-[13.5px] font-medium text-accent active:bg-accent-soft transition"
                >
                  {essential ? 'Voltar pra versão completa' : 'Hoje vou de versão curta'}
                </button>
              ) : (
                <span />
              )}
              <IconButton label="Editar rotina" onClick={() => openSheet('routineEditor', { routineId: routine.id })}>
                <Pencil size={16} />
              </IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
