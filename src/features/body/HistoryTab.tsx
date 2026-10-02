import { Fragment, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { modalityOf } from '@/data/selectors'
import { openSheet } from '@/app/ui-store'
import { Card, Chip, EmptyState, IconButton, SectionTitle } from '@/components/ui'
import { WEEKDAY_LETTER, WEEKDAY_SHORT, addDays, formatShortDate, startOfWeek, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import { CORPO, ENERGIA, HABIT_ROWS, MOODS, SONO } from './constants'
import { Dot } from './components'
import { habitDone, isDone, modalityIdsFor, orderedModalities, pastWeeks, patternNotes, summaryParts, weekLabel, weekSummary, workoutsBetween } from './selectors'

export default function HistoryTab({ today }: { today: DateKey }) {
  const db = useDB()
  const [filter, setFilter] = useState<string | undefined>()
  const usedIds = useMemo(() => new Set(db.workouts.filter((w) => w.date < today && w.status !== 'descanso').map((w) => w.modality)), [db.workouts, today])
  const filterOptions = useMemo(() => orderedModalities(db.profile.modalities, { includeInactive: true }).filter((m) => usedIds.has(m.id)), [db.profile.modalities, usedIds])

  const weeks = useMemo(() => {
    const ids = modalityIdsFor(filter)
    return [startOfWeek(today), ...pastWeeks(today, 11)]
      .map((ws) => {
        const list = workoutsBetween(db, ws, addDays(ws, 6)).filter((w) => w.date <= today && (!ids || ids.includes(w.modality)))
        return { ws, list, summary: weekSummary(list) }
      })
      .filter((w) => w.list.length > 0)
  }, [db, today, filter])

  const notes = useMemo(() => patternNotes(db, today), [db, today])

  return (
    <div>
      <HabitsWeek today={today} />

      <SectionTitle>Como você esteve</SectionTitle>
      <CheckinHistory today={today} />

      {notes.length > 0 && (
        <Card className="mt-3 bg-sand-soft border-transparent">
          <div className="eyebrow">padrões</div>
          <ul className="mt-1.5 space-y-1.5">
            {notes.map((n) => (
              <li key={n} className="text-[14.5px] leading-snug text-ink">
                {n}
              </li>
            ))}
          </ul>
          <div className="text-[12px] text-muted mt-2.5">observação, não diagnóstico 🌿</div>
        </Card>
      )}

      <SectionTitle>Semanas</SectionTitle>
      {filterOptions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-3">
          <Chip selected={!filter} onClick={() => setFilter(undefined)}>
            Tudo
          </Chip>
          {filterOptions.map((m) => (
            <Chip key={m.id} selected={filter === m.id} onClick={() => setFilter(filter === m.id ? undefined : m.id)}>
              <span>{m.emoji}</span>
              {m.label}
            </Chip>
          ))}
        </div>
      )}
      {weeks.length ? (
        <div className="space-y-2.5">
          {weeks.map(({ ws, list, summary }, i) => {
            const parts = summaryParts(summary)
            return (
              <motion.div key={ws} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-display text-[18px] leading-tight">{weekLabel(ws, today)}</div>
                  <div className="text-[12px] text-muted shrink-0">
                    {formatShortDate(ws)} – {formatShortDate(addDays(ws, 6))}
                  </div>
                </div>
                <div className="text-[13.5px] text-ink-2 mt-1">{parts.length ? parts.join(' · ') : 'semana de descanso 🌿'}</div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {list
                    .filter((w) => w.status !== 'descanso')
                    .map((w) => {
                      const m = modalityOf(db, w.modality)
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => openSheet('workout', { id: w.id })}
                          aria-label={`${m.label} ${formatShortDate(w.date)}`}
                          className={cn('h-8 w-8 rounded-[10px] inline-flex items-center justify-center text-[15px]', isDone(w) ? 'bg-surface-2' : 'bg-transparent border border-dashed border-line opacity-60')}
                        >
                          {m.emoji}
                        </button>
                      )
                    })}
                </div>
              </motion.div>
            )
          })}
        </div>
      ) : (
        <Card>
          <EmptyState compact emoji="📖" title="O histórico começa aqui" text="Cada treino registrado aparece nesta linha do tempo, sem cobrança." />
        </Card>
      )}
    </div>
  )
}

function HabitsWeek({ today }: { today: DateKey }) {
  const db = useDB()
  const [ws, setWs] = useState(() => startOfWeek(today))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws])
  const byDate = useMemo(() => new Map(db.checkins.map((c) => [c.date, c])), [db.checkins])
  const planned = useMemo(() => new Set(db.meals.filter((m) => m.planned).map((m) => m.date)), [db.meals])
  return (
    <Card>
      <div className="flex items-center justify-between -mr-2 -mt-1">
        <div>
          <div className="eyebrow">consistência</div>
          <div className="font-display text-[20px] leading-tight mt-0.5">Hábitos — {weekLabel(ws, today).toLowerCase()}</div>
        </div>
        <div className="flex">
          <IconButton label="Semana anterior" size="sm" onClick={() => setWs(addDays(ws, -7))}>
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton label="Próxima semana" size="sm" onClick={() => setWs(addDays(ws, 7))} disabled={ws >= startOfWeek(today)} className="disabled:opacity-30">
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_repeat(7,24px)] gap-y-2.5 gap-x-1.5 items-center">
        <span />
        {days.map((d) => (
          <span key={d} className={cn('text-center text-[11px] font-semibold', d === today ? 'text-accent' : 'text-muted')}>
            {WEEKDAY_LETTER[weekday(d)]}
          </span>
        ))}
        {HABIT_ROWS.map((h) => (
          <Fragment key={h.key}>
            <span className="text-[13px] text-ink-2 truncate">
              {h.emoji} {h.label}
            </span>
            {days.map((d) => {
              const c = byDate.get(d)
              const on = habitDone(c, h.key, db.profile.waterGoal) || (h.key === 'refeicoesPlanejadas' && planned.has(d))
              const partial = h.key === 'agua' && !on && (c?.habits.agua ?? 0) > 0
              return (
                <span key={d} className="flex justify-center">
                  <Dot on={on} toneName={h.key === 'agua' ? 'ocean' : 'sage'} className={cn(partial && 'bg-ocean/35', d > today && 'opacity-40')} />
                </span>
              )
            })}
          </Fragment>
        ))}
      </div>
      <div className="text-[12px] text-muted mt-3">só um retrato da semana — dia sem bolinha é só um dia.</div>
    </Card>
  )
}

function CheckinHistory({ today }: { today: DateKey }) {
  const db = useDB()
  const list = useMemo(
    () => db.checkins.filter((c) => c.date <= today && c.date > addDays(today, -21) && (c.energia || c.sono || c.corpo || c.humor || c.nota)).sort((a, b) => b.date.localeCompare(a.date)),
    [db.checkins, today],
  )
  if (!list.length)
    return (
      <Card>
        <EmptyState compact emoji="🫶" title="Nenhum check-in ainda" text="Um toque na aba Hoje já conta. Aqui vira um diário leve." />
      </Card>
    )
  const lbl = <T extends string>(opts: { value: T; label: string }[], v?: T) => opts.find((o) => o.value === v)?.label
  return (
    <div className="card overflow-hidden divide-y divide-line/70">
      {list.slice(0, 10).map((c) => {
        const bits = [
          c.energia && `energia ${lbl(ENERGIA, c.energia)}`,
          c.sono && `sono ${lbl(SONO, c.sono)}`,
          c.corpo && `corpo ${lbl(CORPO, c.corpo)}`,
        ].filter(Boolean)
        return (
          <button key={c.id} type="button" onClick={() => openSheet('checkin', { date: c.date })} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
            <div className="w-10 shrink-0">
              <div className="text-[10.5px] font-semibold tracking-[0.12em] text-muted">{WEEKDAY_SHORT[weekday(c.date)]}</div>
              <div className="font-display text-[18px] leading-none mt-0.5">{Number(c.date.slice(8))}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-ink-2 truncate">{bits.join(' · ') || 'só uma nota'}</div>
              {c.nota && <div className="text-[13px] text-muted truncate">“{c.nota}”</div>}
            </div>
            {c.humor && <span className="text-[20px]">{MOODS.find((m) => m.value === c.humor)?.emoji}</span>}
          </button>
        )
      })}
    </div>
  )
}
