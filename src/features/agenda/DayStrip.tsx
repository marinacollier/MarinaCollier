import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { addDays, formatLongDate, relativeDay, WEEKDAY_LETTER, weekday, weekDays } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { busyDays } from './selectors'

/** ← date → + "hoje", and a Mon–Sun strip with dots on days that have something. */
export function DayStrip({ date, today, onChange }: { date: DateKey; today: DateKey; onChange: (d: DateKey) => void }) {
  const db = useDB()
  const days = useMemo(() => weekDays(date), [date])
  const busy = useMemo(() => busyDays(db, days), [db, days])
  const go = (d: DateKey) => {
    haptic('light')
    onChange(d)
  }
  const rel = relativeDay(date, today)
  const long = formatLongDate(date)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <div className="flex-1 min-w-0 pl-1">
          <div className="font-display text-[20px] leading-tight truncate first-letter:uppercase">{rel === 'hoje' || rel === 'amanhã' || rel === 'ontem' ? rel : long.split(',')[0]}</div>
          <div className="text-[12.5px] text-muted leading-tight">{long.split(', ')[1] ?? long}</div>
        </div>
        <IconButton label="Dia anterior" onClick={() => go(addDays(date, -1))}>
          <ChevronLeft size={20} />
        </IconButton>
        <button
          type="button"
          onClick={() => go(today)}
          disabled={date === today}
          className="h-9 px-3 rounded-full text-[13px] font-medium bg-surface-2 text-ink disabled:bg-transparent disabled:text-muted/70 transition-colors"
        >
          hoje
        </button>
        <IconButton label="Próximo dia" onClick={() => go(addDays(date, 1))} className="-mr-1.5">
          <ChevronRight size={20} />
        </IconButton>
      </div>
      <div className="flex items-stretch gap-1">
        {days.map((d) => {
          const sel = d === date
          const isToday = d === today
          return (
            <button
              key={d}
              type="button"
              onClick={() => go(d)}
              aria-label={formatLongDate(d)}
              aria-current={sel ? 'date' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 h-[58px] rounded-2xl transition-colors',
                sel ? 'bg-ink text-bg' : isToday ? 'bg-accent-soft text-ink' : 'text-ink-2 active:bg-surface-2',
              )}
            >
              <span className={cn('text-[10.5px] font-semibold tracking-wide', sel ? 'opacity-70' : 'text-muted')}>{WEEKDAY_LETTER[weekday(d)]}</span>
              <span className="text-[16px] font-medium tabular-nums leading-none">{Number(d.slice(8))}</span>
              <span className={cn('h-1 w-1 rounded-full', busy.has(d) ? (sel ? 'bg-bg' : 'bg-accent') : 'bg-transparent')} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
