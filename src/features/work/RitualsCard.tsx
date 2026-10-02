import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Pencil, Sparkles } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import type { DateKey } from '@/data/types'
import { Checkbox, IconButton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { relativeDay } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { ritualKey, toggleRitualCheck, useRitualChecks, type RitualOccurrence } from './rituals'

/** "Rituais": next Weekly CEO Review / Monthly Board (any event with a template), with the pauta as a checklist. */
export function RitualsCard({ rituals, today }: { rituals: RitualOccurrence[]; today: DateKey }) {
  if (rituals.length === 0) return null
  return (
    <div className="card overflow-hidden divide-y divide-line/70">
      {rituals.map((r) => (
        <RitualRow key={r.event.id} ritual={r} today={today} />
      ))}
      <button
        type="button"
        onClick={() => openSheet('win', {})}
        className="w-full h-12 flex items-center justify-center gap-1.5 text-[13.5px] font-medium text-ink-2 active:bg-surface-2 transition-colors"
      >
        <Sparkles size={15} className="text-sand" /> Registrar wins
      </button>
    </div>
  )
}

function RitualRow({ ritual, today }: { ritual: RitualOccurrence; today: DateKey }) {
  const { event, date } = ritual
  const [open, setOpen] = useState(false)
  const key = ritualKey(event.id, date)
  const checks = useRitualChecks(key)
  const template = event.template ?? []
  const isToday = date === today
  const when = [relativeDay(date, today), event.startTime].filter(Boolean).join(' · ')

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'h-10 w-10 rounded-full inline-flex items-center justify-center shrink-0 text-[18px]',
            isToday ? 'bg-accent-soft' : 'bg-surface-2',
          )}
          aria-hidden
        >
          {event.recurrence?.kind === 'monthly' ? '🗓️' : '☕'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium leading-snug line-clamp-2">{event.title}</div>
          <div className={cn('text-[12.5px] mt-0.5', isToday ? 'text-accent font-medium' : 'text-muted')}>
            {when}
            {checks.length > 0 && <span className="text-muted font-normal"> · {checks.length}/{template.length} na pauta</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="h-9 pl-3 pr-2.5 rounded-full bg-surface-2 text-[13px] font-medium text-ink inline-flex items-center gap-1 shrink-0 active:bg-line transition-colors"
        >
          {open ? 'Fechar' : 'Abrir pauta'}
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <ul className="pt-2" aria-label={`Pauta — ${event.title}`}>
              {template.map((item, i) => {
                const done = checks.includes(i)
                return (
                  <li key={i} className="flex items-center gap-3 min-h-11">
                    <Checkbox
                      checked={done}
                      label={item}
                      onChange={() => {
                        toggleRitualCheck(key, i)
                        if (!done) haptic('light')
                      }}
                    />
                    <span className={cn('text-[14.5px] leading-snug', done && 'text-muted line-through decoration-muted/50')}>{item}</span>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center justify-between gap-2 mt-1">
              <p className="text-[12px] text-muted">A pauta é um roteiro, não uma prova.</p>
              <IconButton label={`Editar ${event.title}`} size="sm" onClick={() => openSheet('event', { id: event.id })}>
                <Pencil size={15} />
              </IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
