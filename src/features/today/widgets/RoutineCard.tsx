/**
 * One expandable card per routine ("Milagre da manhã — 5/8"). Never 15 tasks on Home.
 * Collapsed: name, count and a calm segmented bar. Expanded: items with base times,
 * sub-steps, inline journaling, and "Hoje vou de versão curta".
 */
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, PenLine, Pencil } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { Checkbox, IconButton } from '@/components/ui'
import { modalityOf } from '@/data/selectors'
import type { DateKey, DB, Routine, RoutineItem } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import {
  essentialSuggestion,
  isItemDone,
  itemLabel,
  itemOccurrence,
  routineView,
  setItemNote,
  setRoutineMode,
  stepsDoneOf,
  toggleItem,
  toggleStep,
  type RoutineMode,
} from '../routine'
import { trainingMorning } from '../training'

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

function ItemRow({ db, item, date, mode }: { db: DB; item: RoutineItem; date: DateKey; mode: RoutineMode }) {
  const done = isItemDone(db, item, date)
  const steps = mode === 'essential' ? [] : (item.steps ?? [])
  const stepsDone = useMemo(() => new Set(stepsDoneOf(db, item, date)), [db, item, date])
  const savedNote = itemOccurrence(db, item, date)?.note ?? ''
  const hasDetail = steps.length > 0 || !!item.acceptsText
  const [open, setOpen] = useState(!!item.acceptsText && !!savedNote)
  const [note, setNote] = useState(savedNote)
  useEffect(() => setNote(savedNote), [savedNote])

  const label = itemLabel(item, mode)
  const onToggle = () => {
    const on = toggleItem(item, date)
    if (on) haptic('light')
  }

  return (
    <li className="py-0.5">
      <div className="flex items-center gap-3 min-h-[48px]">
        <Checkbox checked={done} onChange={onToggle} label={`Marcar ${label}`} className="ml-0.5" />
        <button type="button" onClick={onToggle} className="flex-1 min-w-0 text-left py-1.5 flex items-center gap-2.5">
          {item.time && <span className="shrink-0 text-[12px] tabular-nums text-muted">{item.time}</span>}
          <span className="text-[16px] shrink-0" aria-hidden>
            {item.emoji ?? '•'}
          </span>
          <span className="min-w-0">
            <span className={cn('block text-[15px] leading-snug transition-colors', done && 'text-muted line-through decoration-muted/40')}>{label}</span>
            {(item.hint || item.optional) && mode === 'completa' && (
              <span className="block text-[12px] text-muted leading-snug">{item.hint ?? 'opcional'}</span>
            )}
          </span>
        </button>
        {hasDetail && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={item.acceptsText ? 'Escrever' : 'Ver passos'}
            className="h-11 w-10 -mr-1.5 inline-flex items-center justify-center text-muted shrink-0"
          >
            {item.acceptsText ? (
              <PenLine size={16} className={cn(open && 'text-accent')} />
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[11.5px] tabular-nums">
                {stepsDone.size}/{steps.length}
                <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
              </span>
            )}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && hasDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-[38px] pb-2">
              {steps.length > 0 && (
                <ul>
                  {steps.map((s, i) => {
                    const on = stepsDone.has(i)
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => {
                            const r = toggleStep(item, i, date)
                            if (!on) haptic(r.itemDone ? 'success' : 'light')
                          }}
                          className="w-full flex items-center gap-2.5 min-h-[40px] text-left"
                        >
                          <span
                            className={cn(
                              'h-[18px] w-[18px] rounded-md border-[1.5px] shrink-0 transition-colors flex items-center justify-center text-[11px] text-bg',
                              on ? 'bg-sage border-sage' : 'border-muted/50',
                            )}
                            aria-hidden
                          >
                            {on ? '✓' : ''}
                          </span>
                          <span className={cn('text-[14px]', on ? 'text-muted' : 'text-ink-2')}>{s}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {item.acceptsText && (
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => note !== savedNote && setItemNote(item, date, note)}
                  rows={3}
                  placeholder="Escreve do jeito que vier…"
                  aria-label={`${item.title} de hoje`}
                  className="w-full mt-1 bg-surface-2 rounded-2xl px-3.5 py-3 outline-none resize-none leading-relaxed text-[16px] placeholder:text-muted/80 border border-transparent focus:border-accent/40 field-sizing-content min-h-[84px]"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

/** Info row for a fuel stage: shows only registered guidance, links to the training's strategy. */
function FuelRow({ label, detail, workoutId }: { label: string; detail?: string; workoutId: string }) {
  return (
    <li>
      <button type="button" onClick={() => openSheet('fuel', { workoutId })} className="w-full flex items-center gap-3 min-h-[48px] text-left active:opacity-70">
        <span className="w-6 shrink-0 ml-0.5 text-center text-[15px]" aria-hidden>
          🍌
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] leading-snug">{label}</span>
          {detail && <span className="block text-[12.5px] text-muted leading-snug line-clamp-2">{detail}</span>}
        </span>
        <span className="text-[12.5px] text-accent font-medium shrink-0 pr-0.5">estratégia</span>
      </button>
    </li>
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
  const [expanded, setExpanded] = useState(false)
  const essential = view.mode === 'essential'
  const tm = useMemo(() => (routine.period === 'manha' ? trainingMorning(db, date, view.items) : undefined), [db, date, routine.period, view.items])

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
            {tm && !view.complete && <span className="block text-[12.5px] text-muted mt-1.5">{tm.title} primeiro — o resto vem depois</span>}
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
            <div className="border-t border-line/60 px-4 pt-1.5 pb-2">
              {view.items.length === 0 ? (
                <p className="text-[14px] text-muted py-3">Nada nessa rotina hoje. Dia livre 🌿</p>
              ) : tm ? (
                <ul>
                  {tm.before.map((it) => (
                    <ItemRow key={it.id} db={db} item={it} date={date} mode={view.mode} />
                  ))}
                  <FuelRow label="Pré-treino" detail={tm.pre.detail} workoutId={tm.workout.id} />
                  <li>
                    <button
                      type="button"
                      onClick={() => openSheet('workout', { id: tm.workout.id })}
                      className="w-full flex items-center gap-3 my-1 rounded-2xl bg-ocean-soft px-3.5 min-h-[48px] text-left active:opacity-80"
                    >
                      <span className="text-[18px]" aria-hidden>
                        {modalityOf(db, tm.workout.modality).emoji}
                      </span>
                      <span className="flex-1 min-w-0 text-[15px] font-medium truncate">{tm.title}</span>
                    </button>
                  </li>
                  <li className="eyebrow pt-3 pb-0.5">Depois do treino</li>
                  <FuelRow label="Pós-treino · banho · café" detail={tm.pos.detail} workoutId={tm.workout.id} />
                  {tm.after.map((it) => (
                    <ItemRow key={it.id} db={db} item={it} date={date} mode={view.mode} />
                  ))}
                </ul>
              ) : (
                <ul>
                  {view.items.map((it) => (
                    <ItemRow key={it.id} db={db} item={it} date={date} mode={view.mode} />
                  ))}
                </ul>
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
