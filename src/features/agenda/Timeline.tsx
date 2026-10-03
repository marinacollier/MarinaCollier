import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { openSheet } from '@/app/ui-store'
import { CalendarX2 } from 'lucide-react'
import { Checkbox, tone as toneOf } from '@/components/ui'
import type { DateKey } from '@/data/types'
import { minutesToHM } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { layoutDay, timelineBounds } from './layout'
import { freeLabel, type FreeSlot } from './free-slots'
import type { DayEntry, LooseItem } from './selectors'
import { completeLoose, EntryMarks, openEntry, openLoose } from './ui'
import { cancelOccurrence } from './occurrence'

export const HOUR_PX = 64
const GUTTER = 46

export interface TimelineProps {
  date: DateKey
  today: DateKey
  entries: DayEntry[]
  /** BASE work hours / commute, drawn as quiet background bands. */
  blocks?: DayEntry[]
  /** Minutes of day for the "agora" line (only when date is today). */
  nowMinutes?: number
  /** Free gaps to hint at ("livre 14:00–16:00"). */
  freeSlots: FreeSlot[]
  /** Loose tasks placed inside free gaps. */
  fitted: { slot: FreeSlot; items: LooseItem[] }[]
  /** Scroll the window so "agora" (or the first entry) is visible on mount. */
  autoScroll?: boolean
}

const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + (m || 0)
}

const HATCH = 'repeating-linear-gradient(135deg, var(--line) 0 1.5px, transparent 1.5px 7px)'

export function Timeline({ date, today, entries, blocks = [], nowMinutes, freeSlots, fitted, autoScroll }: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const placed = useMemo(() => layoutDay(entries), [entries])
  const { fromHour, toHour } = useMemo(() => timelineBounds([...entries, ...blocks]), [entries, blocks])
  const base = fromHour * 60
  const y = (min: number) => ((min - base) / 60) * HOUR_PX
  const height = (toHour - fromHour) * HOUR_PX
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i)
  const showNow = nowMinutes !== undefined && nowMinutes >= base && nowMinutes <= toHour * 60
  const fittedStarts = new Set(fitted.map((f) => f.slot.start))

  // First paint only: bring "agora" (or the first commitment) into view if it's below the fold.
  const scrolled = useRef(false)
  useEffect(() => {
    if (!autoScroll || scrolled.current || !ref.current) return
    scrolled.current = true
    const target = showNow ? nowMinutes! - 60 : placed[0] ? placed[0].start - 30 : undefined
    if (target === undefined) return
    const top = ref.current.getBoundingClientRect().top + window.scrollY + y(Math.max(base, target))
    if (top > window.scrollY + window.innerHeight * 0.65) window.scrollTo({ top: top - 170 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tap an empty hour → new event at that hour.
  const onGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const min = base + ((e.clientY - rect.top) / HOUR_PX) * 60
    haptic('light')
    openSheet('event', { date, time: minutesToHM(Math.min(23 * 60, Math.max(0, Math.floor(min / 60) * 60))) })
  }

  return (
    <div ref={ref} className="relative select-none" style={{ height: height + 12 }}>
      {/* BASE work hours / commute: quiet bands behind everything */}
      {blocks.map((b) => {
        if (!b.time || !b.endTime) return null
        const top = y(toMin(b.time))
        const h = y(toMin(b.endTime)) - top
        const commute = b.blockKind === 'commute'
        return (
          <div
            key={b.key}
            aria-label={`${b.title} ${b.time}–${b.endTime}`}
            className={cn('absolute right-0 pointer-events-none rounded-l-xl', commute ? 'bg-transparent' : 'bg-ink/[0.025]')}
            style={{ top, height: h, left: GUTTER - 2, backgroundImage: commute ? HATCH : undefined }}
          >
            <span aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-[2px] rounded-full', commute ? 'bg-line' : 'bg-ink/15')} />
            <span className="absolute left-2.5 right-2 top-1.5 text-[10.5px] text-muted leading-none whitespace-nowrap truncate">
              {b.emoji} {b.title}
              <span className="opacity-70"> · {commute ? `${b.time}–${b.endTime}` : 'base'}</span>
            </span>
          </div>
        )
      })}
      {/* Hour grid (tap empty space → new event) */}
      <div className="absolute inset-0" onClick={onGridClick} aria-label="Criar compromisso" role="presentation">
        {hours.map((h) => (
          <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: y(h * 60) }}>
            <span className="w-[46px] -mt-[8px] pr-2 text-right text-[11px] tabular-nums text-muted leading-none">
              {h < 24 ? `${String(h).padStart(2, '0')}:00` : ''}
            </span>
            <span className="flex-1 border-t border-line/80" />
          </div>
        ))}
      </div>

      {/* Free gap hints (non-interactive, sit under blocks) */}
      {freeSlots
        .filter((s) => s.minutes >= 90 && !fittedStarts.has(s.start))
        .map((s) => (
          <div
            key={`free-${s.start}`}
            className="absolute pointer-events-none flex items-center gap-1.5 text-[11.5px] text-muted/90"
            style={{ top: y(toMin(s.start)) + 8, left: GUTTER + 10 }}
          >
            <span className="h-1 w-1 rounded-full bg-sage" />
            {freeLabel(s)}
          </div>
        ))}

      {/* Loose tasks placed "entre compromissos" */}
      {fitted.map(({ slot, items }) => {
        const top = y(toMin(slot.start)) + 4
        // Hug the content; the rest of the gap stays plain grid (still tappable).
        const h = Math.min(y(toMin(slot.end)) - y(toMin(slot.start)) - 8, 30 + items.length * 42)
        return (
          <div
            key={`fit-${slot.start}`}
            className="absolute right-1 rounded-2xl border border-dashed border-sage/50 bg-sage-soft/40 px-2.5 py-1.5 flex flex-col gap-1 overflow-hidden"
            style={{ top, height: h, left: GUTTER + 4 }}
          >
            <div className="text-[11px] text-sage font-medium leading-none pt-0.5 flex items-center gap-1">
              {freeLabel(slot)} <span className="text-muted font-normal">· dá pra encaixar</span>
            </div>
            {items.map((it) => (
              <div key={it.key} className="flex items-center gap-2 min-h-[38px] rounded-xl bg-surface/90 pl-3 pr-2 shadow-[var(--shadow)]">
                <Checkbox size="sm" checked={false} label={`Concluir ${it.title}`} onChange={() => completeLoose(it, date)} />
                <button type="button" onClick={() => openLoose(it, date)} className="flex-1 min-w-0 text-left h-[38px] flex items-center gap-2">
                  <span className="truncate text-[14px]">{it.title}</span>
                  <span className="shrink-0 text-[11px] text-muted">{it.reason}</span>
                </button>
              </div>
            ))}
          </div>
        )
      })}

      {/* Blocks */}
      <div className="absolute top-0 bottom-0 right-0 pointer-events-none" style={{ left: GUTTER + 4 }}>
        {placed.map((p, i) => {
          const e = p.item
          const top = y(p.start)
          const h = Math.max(((Math.max(p.end, p.start + 30) - p.start) / 60) * HOUR_PX - 3, 28)
          const t = toneOf(e.tone)
          const compact = h < 44
          const narrow = p.cols > 2 && p.span < p.cols
          const wrap = p.span < p.cols && h >= 58
          return (
            <motion.div
              key={e.key}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.025, 0.2), duration: 0.25 }}
              className={cn(
                'absolute pointer-events-auto rounded-xl overflow-hidden flex',
                e.approx ? 'border-[1.5px] border-dashed border-ink-2/25 dark:border-ink-2/30' : 'border border-surface',
                t.soft,
                e.done && 'opacity-60',
              )}
              style={{
                top,
                height: h,
                left: `calc(${(p.col / p.cols) * 100}% + ${p.col ? 2 : 0}px)`,
                width: `calc(${(p.span / p.cols) * 100}% - ${p.col ? 4 : 2}px)`,
              }}
            >
              <span
                aria-hidden
                className={cn('w-[3px] shrink-0', !e.sourceColor && t.dot, e.approx && 'opacity-50')}
                style={e.sourceColor ? { background: e.sourceColor } : undefined}
              />
              <button type="button" onClick={() => openEntry(e, today)} className={cn('flex-1 min-w-0 px-2 text-left', compact ? 'flex items-center gap-1.5' : 'py-1.5 self-stretch flex flex-col')}>
                {compact ? (
                  <>
                    <span className="text-[12px] tabular-nums text-ink-2 shrink-0">{e.approx ? e.periodLabel : e.time}</span>
                    <span className={cn('truncate text-[13.5px] font-medium', e.done && 'line-through')}>
                      {!narrow && e.emoji && e.emoji !== '✓' && <span className="mr-1">{e.emoji}</span>}
                      {e.title}
                    </span>
                    {!narrow && <EntryMarks entry={e} />}
                  </>
                ) : (
                  <>
                    <span className="flex items-start gap-1.5 min-w-0">
                      <span className={cn('flex-1 min-w-0 text-[14px] font-medium leading-tight', wrap ? 'line-clamp-2 break-words' : 'truncate', e.done && 'line-through')}>
                        {!narrow && e.emoji && e.emoji !== '✓' && <span className="mr-1">{e.emoji}</span>}
                        {e.title}
                      </span>
                      {!narrow && <EntryMarks entry={e} className="mt-[1px]" />}
                    </span>
                    <span className="block truncate text-[12px] text-ink-2/80 tabular-nums mt-0.5">
                      {e.approx ? (
                        e.subtitle
                      ) : (
                        <>
                          {e.time}
                          {e.endTime && p.end > p.start ? `–${e.endTime}` : ''}
                          {e.subtitle && !narrow ? ` · ${e.subtitle}` : ''}
                        </>
                      )}
                    </span>
                  </>
                )}
              </button>
              {e.kind === 'event' && e.recurring && !e.external && !narrow && (
                <button
                  type="button"
                  aria-label={`Cancelar ${e.title} só nesse dia`}
                  title="Cancelar só nesse dia"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    cancelOccurrence(e.id, e.date, `${e.title} fica de fora só nesse dia`)
                  }}
                  className={cn('shrink-0 w-10 flex justify-center text-muted/80 active:text-ink', compact ? 'items-center' : 'items-end pb-2')}
                >
                  <CalendarX2 size={15} />
                </button>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Agora */}
      {showNow && (
        <div className="absolute left-0 right-0 pointer-events-none flex items-center z-10" style={{ top: y(nowMinutes!) - 9 }}>
          <span className="w-[46px] pr-1 flex justify-end">
            <span className="rounded-full bg-accent text-bg text-[10.5px] font-semibold tabular-nums px-1.5 py-[2px] leading-none">
              {minutesToHM(nowMinutes!)}
            </span>
          </span>
          <span className="h-2 w-2 rounded-full bg-accent -ml-0.5" />
          <span className="flex-1 h-[1.5px] bg-accent" />
        </div>
      )}
    </div>
  )
}
