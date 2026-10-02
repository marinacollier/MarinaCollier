import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { Button, EmptyState, IconButton } from '@/components/ui'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { addDays, formatShortDate, relativeDay, startOfWeek, WEEKDAY_SHORT, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { rangeLabel, upcomingAgenda, weekAgenda } from './selectors'
import { EntryRow } from './ui'

// ─── Semana ─────────────────────────────────────────────────────────────────

export function WeekView({ date, today, onDate, onOpenDay }: { date: DateKey; today: DateKey; onDate: (d: DateKey) => void; onOpenDay: (d: DateKey) => void }) {
  const db = useDB()
  const week = useMemo(() => weekAgenda(db, date), [db, date])
  const start = week[0].date
  const end = week[6].date
  const thisWeek = startOfWeek(today) === start
  const total = week.reduce((s, d) => s + d.entries.length, 0)
  const shift = (n: number) => {
    haptic('light')
    onDate(addDays(start, n * 7))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <div className="flex-1 min-w-0 pl-1">
          <div className="font-display text-[20px] leading-tight">{thisWeek ? 'Esta semana' : rangeLabel(start, end)}</div>
          <div className="text-[12.5px] text-muted leading-tight">
            {thisWeek ? rangeLabel(start, end) + ' · ' : ''}
            {total ? `${total} na agenda` : 'semana livre'}
          </div>
        </div>
        <IconButton label="Semana anterior" onClick={() => shift(-1)}>
          <ChevronLeft size={20} />
        </IconButton>
        <button
          type="button"
          onClick={() => onDate(today)}
          disabled={thisWeek}
          className="h-9 px-3 rounded-full text-[13px] font-medium bg-surface-2 text-ink disabled:bg-transparent disabled:text-muted/70"
        >
          hoje
        </button>
        <IconButton label="Próxima semana" onClick={() => shift(1)} className="-mr-1.5">
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <div className="card overflow-hidden divide-y divide-line/70">
        {week.map(({ date: d, entries, mode }, i) => {
          const isToday = d === today
          const past = d < today
          return (
            <motion.section
              key={d}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={cn('flex items-start gap-2 px-4 py-1', isToday && 'bg-accent-soft/40')}
            >
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                aria-label={`Abrir ${relativeDay(d, today)}`}
                className={cn('relative w-[68px] shrink-0 flex items-center gap-1.5 h-11 rounded-xl active:bg-surface-2', past && 'opacity-60')}
              >
                <span className={cn('w-7 text-[10.5px] font-semibold tracking-wide', isToday ? 'text-accent' : 'text-muted')}>{WEEKDAY_SHORT[weekday(d)]}</span>
                <span
                  className={cn(
                    'h-8 min-w-8 px-1 rounded-full flex items-center justify-center font-display text-[17px] tabular-nums',
                    isToday && 'bg-accent text-white',
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {mode === 'presencial' && (
                  <span className="absolute -right-0.5 top-0.5 text-[10px] leading-none" role="img" aria-label="presencial">
                    📍
                  </span>
                )}
              </button>
              <div className="flex-1 min-w-0">
                {entries.length ? (
                  entries.map((e) => <EntryRow key={e.key} entry={e} today={today} dense />)
                ) : (
                  <button type="button" onClick={() => onOpenDay(d)} className="w-full min-h-11 flex items-center text-left text-[13.5px] text-muted/80">
                    livre
                  </button>
                )}
              </div>
            </motion.section>
          )
        })}
      </div>
    </div>
  )
}

// ─── Agenda (próximos 30 dias) ──────────────────────────────────────────────

export function UpcomingView({ today, onOpenDay }: { today: DateKey; onOpenDay: (d: DateKey) => void }) {
  const db = useDB()
  const days = useMemo(() => upcomingAgenda(db, today, 30), [db, today])

  if (!days.length)
    return (
      <div className="card">
        <EmptyState
          emoji="🌿"
          title="Nada marcado nos próximos 30 dias."
          text="Espaço pra respirar — e pra encaixar o que for importante."
          action={
            <Button variant="soft" size="sm" icon={<Plus size={16} />} onClick={() => openSheet('event', { date: today })}>
              compromisso
            </Button>
          }
        />
      </div>
    )

  return (
    <div className="space-y-5">
      {days.map(({ date: d, entries }, i) => {
        const rel = relativeDay(d, today)
        const isNamed = rel !== formatShortDate(d)
        return (
          <motion.section key={d} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.25) }}>
            <button type="button" onClick={() => onOpenDay(d)} className="flex items-baseline gap-2 px-1 mb-1.5 min-h-8">
              <span className={cn('font-display text-[19px] first-letter:uppercase', d === today && 'text-accent')}>{isNamed ? rel : WEEKDAY_SHORT[weekday(d)].toLowerCase()}</span>
              <span className="text-[12.5px] text-muted">{formatShortDate(d)}</span>
            </button>
            <div className="card px-4 py-1">
              {entries.map((e) => (
                <EntryRow key={e.key} entry={e} today={today} />
              ))}
            </div>
          </motion.section>
        )
      })}
    </div>
  )
}
