import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Pencil } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { IconButton } from '@/components/ui'
import { actions, getDB } from '@/data/store'
import { routineItemsFor } from '@/data/selectors'
import { SEED_IDS } from '@/data/seed/ids'
import type { DB } from '@/data/types'
import { occurrenceFor } from '@/lib/recurrence'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { Widget, WidgetEmpty, SoftAction, type WidgetCtx } from './shared'

export function morningRoutine(db: DB) {
  return db.routines.find((r) => r.id === SEED_IDS.routineMorning) ?? db.routines.find((r) => r.period === 'manha')
}

export function MorningWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const routine = morningRoutine(db)
  const [expanded, setExpanded] = useState(false)
  const items = useMemo(() => (routine ? routineItemsFor(db, routine.id, today) : []), [db, routine, today])
  const doneIds = useMemo(
    () => new Set(items.filter((i) => occurrenceFor(db.occurrences, 'routineItem', i.id, today)).map((i) => i.id)),
    [db.occurrences, items, today],
  )

  if (!routine) {
    return (
      <Widget id="manha" eyebrow="Minha manhã">
        <WidgetEmpty
          emoji="☀️"
          text="Uma rotina curtinha pra começar o dia do seu jeito."
          action={
            <SoftAction
              onClick={() => {
                const r = actions.create('routines', { name: 'Minha manhã', period: 'manha', emoji: '☀️', order: getDB().routines.length, active: true })
                openSheet('routineEditor', { routineId: r.id })
              }}
            >
              Criar
            </SoftAction>
          }
        />
      </Widget>
    )
  }
  if (!routine.active) return null

  const total = items.length
  const done = doneIds.size
  const allDone = total > 0 && done === total
  const editBtn = (
    <IconButton label="Editar rotina" onClick={() => openSheet('routineEditor', { routineId: routine.id })}>
      <Pencil size={16} />
    </IconButton>
  )

  const toggle = (id: string) => {
    const on = actions.toggleOccurrence('routineItem', id, today)
    if (on) {
      haptic('light')
      if (done + 1 === total) {
        haptic('success')
        toast('Manhã feita ☀️', { tone: 'win' })
      }
    }
  }

  if (total === 0) {
    return (
      <Widget id="manha" eyebrow={routine.name} action={editBtn}>
        <WidgetEmpty emoji={routine.emoji ?? '☀️'} text="Nada na rotina pra hoje. Manhã livre 🌿" />
      </Widget>
    )
  }

  if (allDone && !expanded) {
    return (
      <section id="w-manha" className="card scroll-mt-4 px-4 py-3">
        <button type="button" onClick={() => setExpanded(true)} className="w-full flex items-center gap-3 min-h-[44px] text-left" aria-expanded={false}>
          <span className="h-9 w-9 rounded-full bg-sand-soft flex items-center justify-center text-[18px]" aria-hidden>
            ☀️
          </span>
          <span className="flex-1">
            <span className="block font-display text-[18px] leading-tight">Manhã feita</span>
            <span className="block text-[12.5px] text-muted">
              {routine.name} · {total} de {total} ✓
            </span>
          </span>
          <ChevronDown size={18} className="text-muted" />
        </button>
      </section>
    )
  }

  return (
    <Widget
      id="manha"
      eyebrow={routine.name}
      action={
        <div className="flex items-center">
          <span className={cn('text-[13px] font-medium tabular-nums mr-0.5', allDone ? 'text-sage' : 'text-ink-2')}>
            {done} de {total} ✓
          </span>
          {editBtn}
          {allDone && (
            <IconButton label="Recolher" onClick={() => setExpanded(false)}>
              <ChevronDown size={18} className="rotate-180" />
            </IconButton>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <AnimatePresence initial={false}>
          {items.map((it) => {
            const on = doneIds.has(it.id)
            return (
              <motion.button
                key={it.id}
                type="button"
                layout
                onClick={() => toggle(it.id)}
                aria-pressed={on}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'relative flex items-center gap-2 min-h-[52px] rounded-2xl pl-3 pr-2.5 py-2 text-left transition-colors duration-200',
                  on ? 'bg-sage-soft' : 'bg-surface-2',
                )}
              >
                <span className={cn('text-[17px] shrink-0 transition-opacity', on && 'opacity-60')} aria-hidden>
                  {it.emoji ?? '•'}
                </span>
                <span className={cn('flex-1 min-w-0 text-[13.5px] leading-tight', on ? 'text-muted' : 'text-ink')}>{it.title}</span>
                <span
                  className={cn(
                    'h-5 w-5 rounded-full inline-flex items-center justify-center shrink-0 transition-all duration-200',
                    on ? 'bg-sage text-white scale-100' : 'border-[1.5px] border-muted/40 scale-90',
                  )}
                  aria-hidden
                >
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
    </Widget>
  )
}
