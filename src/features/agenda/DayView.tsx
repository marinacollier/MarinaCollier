import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { Button, Checkbox, EmptyState } from '@/components/ui'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { cn } from '@/lib/cn'
import { ceilQuarter, findFreeSlots, fitIntoSlots } from './free-slots'
import { allDayOnly, dayEntries, looseItemsFor, timedOnly, type LooseItem } from './selectors'
import { Timeline } from './Timeline'
import { completeLoose, EntryDot, openEntry, openLoose } from './ui'

export interface DayViewProps {
  date: DateKey
  today: DateKey
  nowMinutes: number
  autoScroll?: boolean
}

/** One day: all-day row, "para encaixar" rail, and the timeline (or a calm empty state). */
export function DayView({ date, today, nowMinutes, autoScroll }: DayViewProps) {
  const db = useDB()
  const isToday = date === today
  const entries = useMemo(() => dayEntries(db, date), [db, date])
  const timed = useMemo(() => timedOnly(entries), [entries])
  const allDay = useMemo(() => allDayOnly(entries), [entries])
  const loose = useMemo(() => looseItemsFor(db, date), [db, date])

  // Free time from now (today) or from 06:00, until 21:00.
  const from = isToday ? (nowMinutes > 6 * 60 ? ceilQuarter(nowMinutes) : '06:00') : '06:00'
  const slots = useMemo(() => (from >= '21:00' ? [] : findFreeSlots(timed, { from, to: '21:00', minMinutes: 60, minBlockMin: 30 })), [timed, from])
  const fit = useMemo(() => (timed.length ? fitIntoSlots(loose, slots, 50, 60) : { placed: [], rest: loose }), [loose, slots, timed.length])

  return (
    <div className="space-y-4">
      {allDay.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allDay.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => openEntry(e, today)}
              className="inline-flex items-center gap-2 min-h-11 max-w-full rounded-2xl bg-surface border border-line/80 px-3.5 py-2 text-left active:scale-[0.98] transition"
            >
              <EntryDot entry={e} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium leading-tight">
                  {e.emoji} {e.title}
                </span>
                <span className="block text-[11.5px] text-muted leading-tight mt-0.5">{e.rangeLabel ?? 'dia todo'}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {fit.rest.length > 0 && <LooseRail items={fit.rest} date={date} label={timed.length ? 'para encaixar · sem pressa' : 'importante hoje'} />}

      {timed.length > 0 ? (
        <Timeline
          key={date}
          date={date}
          today={today}
          entries={timed}
          nowMinutes={isToday ? nowMinutes : undefined}
          freeSlots={slots}
          fitted={fit.placed}
          autoScroll={autoScroll}
        />
      ) : (
        <div className="card">
          <EmptyState
            emoji="🌿"
            title={isToday ? 'Dia livre de compromissos.' : 'Nada marcado nesse dia.'}
            text="Espaço pra respirar 🌿"
            action={
              <Button variant="soft" size="sm" icon={<Plus size={16} />} onClick={() => openSheet('event', { date })}>
                compromisso
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}

function LooseRail({ items, date, label }: { items: LooseItem[]; date: DateKey; label: string }) {
  return (
    <section>
      <div className="eyebrow px-1 mb-2">{label}</div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {items.map((it, i) => (
          <motion.div
            key={it.key}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className={cn('shrink-0 flex items-center gap-2 rounded-2xl border border-dashed border-line bg-surface pl-3.5 pr-3 min-h-12 max-w-[78%]')}
          >
            <Checkbox size="sm" checked={false} label={`Concluir ${it.title}`} onChange={() => completeLoose(it, date)} />
            <button type="button" onClick={() => openLoose(it, date)} className="min-w-0 text-left py-1.5">
              <span className="block truncate text-[14px] leading-tight">{it.title}</span>
              <span className="block text-[11px] text-muted leading-tight mt-0.5">{it.reason}</span>
            </button>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
