import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { actions } from '@/data/store'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { formatDayMonth } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { cancelOncePatch, gatherFixed, weekTrips } from '../plan'
import { DayHeader, Group, PlanTag, Quiet, Row } from '../ui'
import type { StepProps } from './types'

export function StepFixos({ db, today, weekStart }: StepProps) {
  const nav = useNavigate()
  const days = useMemo(() => gatherFixed(db, weekStart), [db, weekStart])
  const trips = useMemo(() => weekTrips(db, weekStart), [db, weekStart])

  const cancelOnce = (eventId: string, date: string) => {
    const e = db.events.find((x) => x.id === eventId)
    if (!e) return
    const before = e.exdates
    actions.update('events', e.id, cancelOncePatch(e, date))
    haptic('light')
    toast(`${e.title} fora só nessa semana`, { action: { label: 'Desfazer', run: () => actions.update('events', e.id, { exdates: before }) } })
  }

  return (
    <div>
      {trips.map((t) => (
        <div key={t.id} className="rounded-2xl bg-ocean-soft px-4 py-3 mb-3 flex items-center gap-3">
          <span className="text-[22px]" aria-hidden>
            {t.flag}
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-medium">{t.name}</div>
            <div className="text-[12.5px] text-ink-2">
              {formatDayMonth(t.startDate!)}
              {t.endDate && t.endDate !== t.startDate ? ` → ${formatDayMonth(t.endDate)}` : ''} · viagem nessa semana
            </div>
          </div>
        </div>
      ))}

      {days.map((d) => {
        const past = d.date < today
        return (
          <section key={d.date} className={past ? 'opacity-55' : undefined}>
            <DayHeader date={d.date} today={today} mode={d.mode} />
            {d.entries.length === 0 ? (
              <div className="card px-3.5 py-3 text-[13.5px] text-muted">Nada fixo. Espaço pra respirar 🌿</div>
            ) : (
              <Group>
                {d.entries.map((e) => (
                  <Row
                    key={e.key}
                    emoji={e.emoji}
                    title={
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        {e.title} <PlanTag type={e.planType} />
                      </span>
                    }
                    time={e.time}
                    detail={e.detail}
                    right={
                      e.cancellable && !past ? (
                        <Button size="sm" variant="ghost" className="text-[12.5px] px-2.5 -mr-1.5" onClick={() => cancelOnce(e.eventId!, d.date)}>
                          Só essa semana não
                        </Button>
                      ) : undefined
                    }
                  />
                ))}
              </Group>
            )}
          </section>
        )
      })}

      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3">
        <Settings2 size={18} className="text-muted mt-0.5 shrink-0" />
        <div className="min-w-0">
          <Quiet className="px-0">Dias presenciais, horário base e deslocamento ficam em Ajustes → Trabalho.</Quiet>
          <button type="button" onClick={() => nav(ROUTES.settings)} className="text-[13px] font-medium text-accent h-9">
            Ajustar trabalho
          </button>
        </div>
      </div>
    </div>
  )
}
