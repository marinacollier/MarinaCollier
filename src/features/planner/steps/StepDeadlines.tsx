import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button, Chip, EmptyState } from '@/components/ui'
import { WEEKDAY_SHORT, formatDayMonth, weekday } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { top3Room, workDeadlines, type DeadlineEntry } from '../plan'
import { DayHeader, Group, Quiet, Row } from '../ui'
import type { StepProps } from './types'

const KIND_LABEL: Record<DeadlineEntry['kind'], string> = {
  task: 'tarefa',
  delivery: 'entrega',
  deadline: 'prazo',
  milestone: 'marco',
}

export function StepDeadlines({ db, today, weekStart, days, draft, setDraft }: StepProps) {
  const list = useMemo(() => workDeadlines(db, weekStart), [db, weekStart])
  const [open, setOpen] = useState<string | null>(null)
  const dates = [...new Set(list.map((d) => d.date))]

  const queued = (e: DeadlineEntry) => draft.top3.find((t) => t.ref?.type === e.ref.type && t.ref.id === e.ref.id && t.title === e.title)

  const add = (e: DeadlineEntry, date: string) => {
    haptic('light')
    setDraft((d) => ({ ...d, top3: [...d.top3, { date, title: e.title, ref: e.ref }] }))
    setOpen(null)
  }
  const remove = (e: DeadlineEntry) => setDraft((d) => ({ ...d, top3: d.top3.filter((t) => !(t.ref?.id === e.ref.id && t.title === e.title)) }))

  if (!list.length) return <EmptyState emoji="🌤️" title="Nenhuma entrega com data" text="Nada vencendo no trabalho nessa semana. Delícia." />

  return (
    <div>
      {dates.map((date) => (
        <section key={date}>
          <DayHeader date={date} today={today} />
          <Group>
            {list
              .filter((e) => e.date === date)
              .map((e) => {
                const q = queued(e)
                return (
                  <div key={e.key}>
                    <Row
                      emoji={e.emoji}
                      title={e.title}
                      detail={[KIND_LABEL[e.kind], e.context].filter(Boolean).join(' · ')}
                      right={
                        q ? (
                          <Button size="sm" variant="soft" icon={<Check size={14} />} onClick={() => remove(e)} className="text-[12.5px] px-3">
                            Top 3 · {WEEKDAY_SHORT[weekday(q.date)].toLowerCase()}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setOpen(open === e.key ? null : e.key)} className="text-[12.5px] px-2.5 -mr-1.5" aria-expanded={open === e.key}>
                            Top 3
                          </Button>
                        )
                      }
                    />
                    {open === e.key && !q && (
                      <div className="px-3.5 pb-3 -mt-1">
                        <div className="text-[12.5px] text-muted mb-2">Em qual dia entra no Top 3 de trabalho?</div>
                        <div className="flex flex-wrap gap-2">
                          {days.map((d) => {
                            const room = top3Room(db, draft, d)
                            return (
                              <Chip key={d} onClick={room > 0 ? () => add(e, d) : undefined} className={room > 0 ? undefined : 'opacity-40'}>
                                {WEEKDAY_SHORT[weekday(d)].toLowerCase()} {formatDayMonth(d)}
                              </Chip>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </Group>
        </section>
      ))}
      <Quiet className="mt-4">Só leitura aqui. O Top 3 de trabalho guarda até três por dia — o resto continua nos projetos.</Quiet>
    </div>
  )
}
