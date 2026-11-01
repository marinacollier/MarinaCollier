/**
 * The day's mandatory blocks (brief operacional 01/11) with a tick each. The blocks are computed
 * (expedition/daily.ts); a tick is one Occurrence ('item', `trip:<tripId>:<kind>`, that date), so it persists and
 * syncs. Used on Home (TripDayCard), in the calendar day and in the briefing/review views.
 */
import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { DateKey, Trip, TripItem } from '@/data/types'
import { actions, getDB, useDB } from '@/data/store'
import { Checkbox } from '@/components/ui'
import { cn } from '@/lib/cn'
import { nowISO } from '@/lib/id'
import { blockDoneOn, blockWhen, dailyPlan, type DailyBlock, type DailyPlan } from './daily'

/** Tick / untick a block on a day (one Occurrence; nothing else is touched). */
export function setBlockDone(tripId: string, b: Pick<DailyBlock, 'kind' | 'key'>, date: DateKey, done: boolean) {
  const occ = blockDoneOn(getDB().occurrences, tripId, b.kind, date)
  if (done && !occ) actions.create('occurrences', { parentType: 'item', parentId: b.key, date, status: 'done', completedAt: nowISO() })
  else if (!done && occ) actions.remove('occurrences', occ.id)
}

export function useDailyPlan(trip: Trip, items: TripItem[], date: DateKey): DailyPlan | undefined {
  const workouts = useDB((db) => db.workouts)
  const occurrences = useDB((db) => db.occurrences)
  return useMemo(() => dailyPlan(trip, items, workouts, occurrences, date), [trip, items, workouts, occurrences, date])
}

export function DailyBlocksList({ trip, plan, className, bare }: { trip: Trip; plan: DailyPlan; className?: string; bare?: boolean }) {
  return (
    <div className={cn(!bare && 'card px-4 py-1', className)} aria-label="Blocos obrigatórios do dia">
      <div className="flex items-baseline justify-between pt-2.5">
        <span className="eyebrow">blocos obrigatórios</span>
        <span className="text-[12px] text-muted tabular-nums">
          {plan.done}/{plan.total}
        </span>
      </div>
      <ul className="divide-y divide-line/70">
        {plan.blocks.map((b) => (
          <BlockRow key={b.kind} trip={trip} date={plan.date} block={b} />
        ))}
      </ul>
      {plan.notes.length > 0 && <p className="text-[12px] text-muted pb-2.5">{plan.notes.join(' ')}</p>}
    </div>
  )
}

function BlockRow({ trip, date, block: b }: { trip: Trip; date: DateKey; block: DailyBlock }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="py-2.5">
      <div className="flex items-start gap-3">
        <Checkbox size="sm" checked={b.done} label={b.title} onChange={(v) => setBlockDone(trip.id, b, date, v)} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={cn('flex-1 min-w-0 text-[14px] leading-snug', b.done && 'line-through text-muted')}>
              <span aria-hidden className="mr-1.5">
                {b.emoji}
              </span>
              {b.title}
            </span>
            <span className="font-sport text-[13px] text-ink-2 shrink-0">{blockWhen(b)}</span>
          </div>
          {b.sub && <div className="text-[12px] text-muted mt-0.5">{b.sub}</div>}
          {b.parts && (
            <>
              <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-ink-2 h-7">
                {b.kind === 'trabalho' ? 'foco' : 'como dividir'} <ChevronDown size={13} className={cn('transition', open && 'rotate-180')} aria-hidden />
              </button>
              {open && (
                <ul className="text-[12.5px] text-ink-2 list-disc pl-4 space-y-0.5">
                  {b.parts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  )
}
