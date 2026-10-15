import { useMemo } from 'react'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { sleepMoodWeek } from '@/features/quick/ops'
import { addDays } from '@/lib/date'
import { MOODS } from './constants'

const n = (x: number) => String(x).replace('.', ',')

/** Sono e humor · média dos últimos 7 dias (from the quick "+ Sono / Humor" and the check-in). */
export function SleepMoodSummary({ today }: { today: DateKey }) {
  const db = useDB()
  const w = useMemo(() => sleepMoodWeek(db.checkins, today, addDays(today, -6)), [db.checkins, today])
  if (!w.days.length) return null
  const mood = w.avgHumor ? MOODS.find((m) => m.value === Math.round(w.avgHumor!)) : undefined
  return (
    <div className="card px-4 py-3 mb-3 grid grid-cols-3 gap-3" aria-label="Média dos últimos 7 dias">
      <div>
        <div className="font-display text-[1.375rem] leading-none tabular-nums">{w.avgHours ? `${n(w.avgHours)} h` : '—'}</div>
        <div className="text-[0.75rem] text-muted mt-1">sono · 7 dias</div>
      </div>
      <div>
        <div className="font-display text-[1.375rem] leading-none tabular-nums">{w.avgQuality ? `${n(w.avgQuality)}/5` : '—'}</div>
        <div className="text-[0.75rem] text-muted mt-1">qualidade</div>
      </div>
      <div>
        <div className="font-display text-[1.375rem] leading-none">{mood ? <span aria-label={mood.label}>{mood.emoji}</span> : '—'}</div>
        <div className="text-[0.75rem] text-muted mt-1">humor{w.avgHumor ? ` · ${n(w.avgHumor)}` : ''}</div>
      </div>
    </div>
  )
}
