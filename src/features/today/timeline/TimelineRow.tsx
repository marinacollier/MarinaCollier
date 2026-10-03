/**
 * One row of the Linha do dia (also used by the routine card): time column (tap → quick edit),
 * small status dot (tap → check), title + real time "✓ 05:12", expandable steps with their own times.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, PenLine } from 'lucide-react'
import { getDB } from '@/data/store'
import { isAnytime } from '@/data/timeline'
import type { ContentSource, TimelineEntry } from '@/data/types'
import { PERIOD_LABEL, PERIOD_RANGES } from '@/data/planning'
import { cn } from '@/lib/cn'
import { itemOccurrence, setItemNote } from '../routine'
import { openEntryFlow, toggleEntry } from './actions'
import { TimeEditor } from './TimeEditor'

const BADGE: Partial<Record<ContentSource, string>> = { troca: 'troca', lumos: 'Lumos', marina: 'meu' }

function periodLabel(e: TimelineEntry): string | undefined {
  if (e.timeSource !== 'approx' || !e.window) return undefined
  const p = (Object.keys(PERIOD_RANGES) as (keyof typeof PERIOD_RANGES)[]).find((k) => PERIOD_RANGES[k][0] === e.window!.start)
  return p ? PERIOD_LABEL[p] : undefined
}

// ─── Dot ────────────────────────────────────────────────────────────────────

const ANCHOR_DOT: Partial<Record<TimelineEntry['kind'], string>> = {
  workout: 'bg-ocean',
  meal: 'bg-sand',
  event: 'bg-plum',
  work: 'bg-ink/25',
}

function Dot({ e, current, small }: { e: TimelineEntry; current?: boolean; small?: boolean }) {
  const size = small ? 'h-[13px] w-[13px]' : 'h-[16px] w-[16px]'
  if (e.status === 'done')
    return (
      <span className={cn(size, 'rounded-full bg-sage flex items-center justify-center text-bg')} aria-hidden>
        <svg viewBox="0 0 24 24" width={small ? 8 : 10} height={small ? 8 : 10} fill="none">
          <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  if (e.status === 'cancelled' || e.status === 'skipped') return <span className="h-[2px] w-[10px] rounded-full bg-muted/50" aria-hidden />
  if (current) return <span className={cn(size, 'rounded-full bg-accent ring-4 ring-accent-soft')} aria-hidden />
  if (!e.editable.check) return <span className={cn('h-[9px] w-[9px] rounded-full', ANCHOR_DOT[e.kind] ?? 'bg-muted/50')} aria-hidden />
  return <span className={cn(size, 'rounded-full border-[1.5px] border-muted/60 bg-surface')} aria-hidden />
}

// ─── Row ────────────────────────────────────────────────────────────────────

export interface RowProps {
  e: TimelineEntry
  today: string
  current?: boolean
  editing: string | undefined
  setEditing: (k: string | undefined) => void
  handle?: ReactNode
  /** Step rows are smaller and live inside a group. */
  step?: boolean
}

export function TimelineRow({ e, today, current, editing, setEditing, handle, step }: RowProps) {
  const [open, setOpen] = useState(false)
  const item = e.ref.type === 'routineItem' ? getDB().routineItems.find((i) => i.id === e.ref.id) : undefined
  const children = e.children ?? []
  const journaling = !!item?.acceptsText
  const expandable = children.length > 0 || journaling
  const stepsDone = children.filter((c) => c.status === 'done').length
  const timeLabel = isAnytime(e) ? '—' : (periodLabel(e) ?? e.start)
  const dim = e.status === 'cancelled' || e.status === 'skipped'
  const isEditing = editing === e.key

  const check = () => {
    if (!e.editable.check || dim) return openEntryFlow(e, today)
    toggleEntry(e)
  }
  const tapContent = () => {
    if (expandable) return setOpen((o) => !o)
    if (e.editable.check) return check()
    openEntryFlow(e, today)
  }

  const meta = [
    e.status === 'done' && e.doneAt ? `✓ ${e.doneAt}` : undefined,
    dim ? (e.status === 'skipped' ? 'pulado hoje' : 'hoje não') : undefined,
    expandable && children.length && !step && e.start && e.end ? `${e.start}–${e.end}` : undefined,
    e.timeSource === 'window' && e.window ? `entre ${e.window.start}–${e.window.end}` : undefined,
    e.subtitle,
  ].filter(Boolean)

  return (
    <div className={cn(step && 'relative')}>
      <div className={cn('flex items-start', step ? 'min-h-11' : 'min-h-[46px]')}>
        <button
          type="button"
          onClick={() => e.editable.time && setEditing(isEditing ? undefined : e.key)}
          aria-label={e.editable.time ? `Mudar horário de ${e.title}` : undefined}
          className={cn(
            'shrink-0 flex items-start text-left tabular-nums leading-none',
            step ? 'w-[46px] h-11 pt-[15px] text-[13px] text-muted font-sport' : 'w-[46px] h-[46px] pt-[14px] font-sport text-[16px]',
            !step && (dim || e.status === 'done' ? 'text-muted' : 'text-ink'),
            e.timeSource === 'override' && 'text-accent',
            e.timeSource === 'approx' && 'italic text-[13px] font-sans text-ink-2',
            isEditing && 'underline decoration-accent decoration-2 underline-offset-4',
          )}
        >
          {timeLabel}
        </button>
        <button
          type="button"
          onClick={check}
          aria-label={e.editable.check ? `${e.status === 'done' ? 'Desmarcar' : 'Marcar'} ${e.title}` : e.title}
          role={e.editable.check ? 'checkbox' : undefined}
          aria-checked={e.editable.check ? e.status === 'done' : undefined}
          className={cn('relative z-[1] shrink-0 w-[22px] flex items-start justify-center', step ? 'h-11 pt-[15px]' : 'h-[46px] pt-[15px]')}
        >
          <span className="relative flex">
            <Dot e={e} current={current} small={step} />
          </span>
        </button>
        <button type="button" onClick={tapContent} className="flex-1 min-w-0 text-left pl-2.5 py-[12px]">
          <span className={cn('flex items-center gap-1.5 min-w-0', step ? 'text-[13.5px]' : 'text-[15px]')}>
            {e.emoji && !step && (
              <span className="shrink-0 text-[14px]" aria-hidden>
                {e.emoji}
              </span>
            )}
            <span
              className={cn(
                'truncate leading-snug',
                e.status === 'done' && 'text-muted',
                dim && 'text-muted line-through decoration-muted/50',
                current && 'font-medium',
                step && e.status !== 'done' && 'text-ink-2',
              )}
            >
              {e.title}
            </span>
            {e.badge && BADGE[e.badge] && (
              <span className="shrink-0 h-[16px] px-1.5 rounded-full bg-sand-soft text-[10px] font-semibold text-ink-2 leading-[16px]">{BADGE[e.badge]}</span>
            )}
          </span>
          {meta.length > 0 && <span className="block truncate text-[12px] text-muted leading-snug mt-0.5 tabular-nums">{meta.join(' · ')}</span>}
        </button>
        {expandable && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={journaling ? 'Escrever' : 'Ver passos'}
            className="h-[46px] w-10 inline-flex items-center justify-center text-muted shrink-0 -mr-1"
          >
            {journaling ? (
              <PenLine size={15} className={cn(open && 'text-accent')} />
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[11.5px] tabular-nums">
                {stepsDone}/{children.length}
                <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
              </span>
            )}
          </button>
        )}
        {handle}
      </div>
      <AnimatePresence initial={false}>{isEditing && <TimeEditor entry={e} onDone={() => setEditing(undefined)} />}</AnimatePresence>
      <AnimatePresence initial={false}>
        {open && expandable && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="pl-[18px]">
              {children.map((c) => (
                <TimelineRow key={c.key} e={c} today={today} editing={editing} setEditing={setEditing} step />
              ))}
              {journaling && item && <Journal itemId={item.id} date={e.date} title={item.title} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Journal({ itemId, date, title }: { itemId: string; date: string; title: string }) {
  const item = getDB().routineItems.find((i) => i.id === itemId)!
  const saved = itemOccurrence(getDB(), item, date)?.note ?? ''
  const [note, setNote] = useState(saved)
  useEffect(() => setNote(saved), [saved])
  return (
    <textarea
      value={note}
      onChange={(ev) => setNote(ev.target.value)}
      onBlur={() => note !== saved && setItemNote(item, date, note)}
      rows={3}
      placeholder="Escreve do jeito que vier…"
      aria-label={`${title} de hoje`}
      className="w-[calc(100%-50px)] ml-[50px] mb-2 bg-surface-2 rounded-2xl px-3.5 py-3 outline-none resize-none leading-relaxed text-[16px] placeholder:text-muted/80 border border-transparent focus:border-accent/40 field-sizing-content min-h-[84px]"
    />
  )
}

