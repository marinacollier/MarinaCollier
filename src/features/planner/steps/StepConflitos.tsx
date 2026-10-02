import { useMemo, useState } from 'react'
import { Chip, EmptyState } from '@/components/ui'
import { ConflictCard } from '@/components/planning/ConflictCard'
import { openSheet } from '@/app/ui-store'
import type { Conflict } from '@/data/planning'
import { WEEKDAY_SHORT, weekday } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { moveOptions, planConflicts, weekLoad } from '../plan'
import { DayHeader, LoadStrip, Quiet } from '../ui'
import type { StepProps } from './types'

export function StepConflitos({ db, today, weekStart, days, setDraft, planned }: StepProps) {
  const conflicts = useMemo(() => planConflicts(db, weekStart, today, planned), [db, weekStart, today, planned])
  const [moving, setMoving] = useState<{ key: string; workoutId: string } | null>(null)
  const plannedIds = useMemo(() => new Set(planned.map((w) => w.id)), [planned])
  const dates = [...new Set(conflicts.map((c) => c.date))]
  const load = useMemo(() => weekLoad(db, weekStart, planned), [db, weekStart, planned])

  /** Which workout "Mover" should move: a planned flexible one first, then any planned, then an existing one. */
  const movable = (c: Conflict) => {
    const ws = c.refs.filter((r) => r.type === 'workout')
    const plannedRefs = ws.filter((r) => plannedIds.has(r.id))
    const flexible = plannedRefs.find((r) => {
      const p = planned.find((w) => w.id === r.id)
      return p && p.planType !== 'fixo' && p.planType !== 'base'
    })
    return flexible ?? plannedRefs[plannedRefs.length - 1] ?? ws[0]
  }

  if (!conflicts.length)
    return (
      <div>
        <LoadStrip load={load} today={today} title="Carga da semana" />
        <EmptyState emoji="🌿" title="Tudo encaixado" text="Nenhum conflito com o que você escolheu. Delícia." />
      </div>
    )

  return (
    <div>
      <LoadStrip load={load} today={today} title="Carga da semana" />
      {dates.map((date) => (
        <section key={date}>
          <DayHeader date={date} today={today} right={<span />} />
          <div className="space-y-2.5">
            {conflicts
              .filter((c) => c.date === date)
              .map((c) => {
                const target = movable(c)
                const inFlow = !!target && plannedIds.has(target.id)
                const open = moving?.key === c.key
                return (
                  <div key={c.key}>
                    <ConflictCard
                      conflict={c}
                      onMove={
                        target
                          ? () => (inFlow ? setMoving(open ? null : { key: c.key, workoutId: target.id }) : openSheet('workout', { id: target.id }))
                          : undefined
                      }
                    />
                    {open && (
                      <div className="rounded-2xl bg-surface-2 px-3.5 py-3 mt-1.5">
                        <div className="text-[13px] text-ink-2 mb-2">
                          Mover <b className="font-medium">{target!.title}</b> pra:
                        </div>
                        {planned.find((w) => w.id === target!.id)?.requiresPreviousDayPrep && (
                          <div className="text-[12px] text-muted -mt-1 mb-2">O PREP vai junto: vira a véspera do novo dia.</div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {moveOptions(db, planned, target!.id, days).map((o) => (
                            <Chip
                              key={o.date}
                              onClick={() => {
                                haptic('light')
                                setDraft((d) => ({ ...d, moved: { ...d.moved, [target!.id]: o.date } }))
                                setMoving(null)
                              }}
                            >
                              {WEEKDAY_SHORT[weekday(o.date)].toLowerCase()} · {o.conflicts === 0 ? 'livre ✓' : `⚠️ ${o.conflicts}`}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </section>
      ))}
      <Quiet className="mt-5">“Manter assim” e “Ignorar” só param de avisar. Nada é apagado nem movido sem você.</Quiet>
    </div>
  )
}
