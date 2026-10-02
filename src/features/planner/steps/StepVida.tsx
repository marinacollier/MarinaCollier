import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { ROUTES } from '@/app/routes'
import { countdownLabel, WEEKDAY_SHORT, weekday } from '@/lib/date'
import { personalLife, type LifeEntry } from '../plan'
import { Eyebrow, Group, Row } from '../ui'
import type { StepProps } from './types'

function when(e: LifeEntry): string | undefined {
  return e.date ? WEEKDAY_SHORT[weekday(e.date)].toLowerCase() : undefined
}

function Section({ title, entries }: { title: string; entries: LifeEntry[] }) {
  if (!entries.length) return null
  return (
    <>
      <Eyebrow>{title}</Eyebrow>
      <Group>
        {entries.map((e) => (
          <Row key={e.key} emoji={e.emoji} title={e.title} time={when(e)} detail={e.detail} />
        ))}
      </Group>
    </>
  )
}

export function StepVida({ db, today, weekStart }: StepProps) {
  const nav = useNavigate()
  const life = useMemo(() => personalLife(db, weekStart, today), [db, weekStart, today])
  const empty = !life.events.length && !life.pet.length && !life.tasks.length && !life.trip

  if (empty) return <EmptyState emoji="🌿" title="Semana leve por aqui" text="Nada pedindo tua atenção na vida pessoal. Delícia." />

  return (
    <div className="-mt-5">
      <Section title="Compromissos" entries={life.events} />
      <Section title="Cuidados" entries={life.pet} />
      <Section title="Casa & vida real" entries={life.tasks} />
      {life.trip && (
        <>
          <Eyebrow>Próxima viagem</Eyebrow>
          <button type="button" onClick={() => nav(ROUTES.trip(life.trip!.trip.id))} className="card w-full text-left p-3.5 active:scale-[0.99] transition">
            <div className="flex items-center gap-3">
              <span className="text-[22px]" aria-hidden>
                {life.trip.trip.flag}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium">{life.trip.trip.name}</div>
                <div className="text-[12.5px] text-muted">
                  {life.trip.trip.startDate ? `${countdownLabel(life.trip.trip.startDate, today)} · ` : ''}
                  {life.trip.total} {life.trip.total === 1 ? 'coisa' : 'coisas'} a confirmar
                </div>
              </div>
              <ChevronRight size={18} className="text-muted/60" />
            </div>
            <ul className="mt-2.5 pl-[38px] space-y-1">
              {life.trip.items.map((i) => (
                <li key={i.id} className="text-[13.5px] text-ink-2 flex gap-2">
                  <span className="text-sand" aria-hidden>
                    ○
                  </span>
                  <span className="min-w-0 truncate">{i.title}</span>
                </li>
              ))}
              {life.trip.total > life.trip.items.length && <li className="text-[12.5px] text-muted">+ {life.trip.total - life.trip.items.length} na viagem</li>}
            </ul>
          </button>
        </>
      )}
    </div>
  )
}
