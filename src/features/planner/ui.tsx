import type { ReactNode } from 'react'
import type { DateKey, PlanType, WorkDayMode } from '@/data/types'
import { formatDayMonth, relativeDay, WEEKDAY_LONG, WEEKDAY_SHORT, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import type { DayLoad } from './plan'

const PLAN_TYPE: Record<PlanType, { label: string; cls: string }> = {
  fixo: { label: 'fixo', cls: 'bg-surface-2 text-ink-2' },
  base: { label: 'base', cls: 'bg-ocean-soft text-ocean' },
  flexivel: { label: 'flexível', cls: 'bg-sage-soft text-sage' },
  a_confirmar: { label: 'a confirmar', cls: 'bg-sand-soft text-sand' },
}

export function PlanTag({ type }: { type?: PlanType }) {
  if (!type) return null
  const t = PLAN_TYPE[type]
  return <span className={cn('inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-semibold uppercase tracking-wide shrink-0', t.cls)}>{t.label}</span>
}

const MODE: Record<WorkDayMode, string> = {
  presencial: 'presencial 📍',
  remoto: 'remoto',
  flexivel: 'flexível',
  off: 'livre',
}

export function dayName(date: DateKey): string {
  const n = WEEKDAY_LONG[weekday(date)]
  return n.charAt(0).toUpperCase() + n.slice(1)
}

/** "Quarta · 07/10" + optional right side (work mode). */
export function DayHeader({ date, today, mode, right }: { date: DateKey; today: DateKey; mode?: WorkDayMode; right?: ReactNode }) {
  const rel = relativeDay(date, today)
  return (
    <div className="flex items-baseline justify-between gap-2 px-1 mb-1.5 mt-5">
      <div className="text-[13px] font-semibold text-ink-2">
        {dayName(date)} <span className="text-muted font-normal">· {formatDayMonth(date)}{rel === 'hoje' || rel === 'amanhã' ? ` · ${rel}` : ''}</span>
      </div>
      {right ?? (mode && <span className={cn('text-[12px]', mode === 'presencial' ? 'text-accent font-medium' : 'text-muted')}>{MODE[mode]}</span>)}
    </div>
  )
}

/** A light row used across the steps. */
export function Row({ emoji, title, detail, time, right, muted, className }: { emoji?: string; title: ReactNode; detail?: ReactNode; time?: string; right?: ReactNode; muted?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 min-h-[52px] px-3.5 py-2', muted && 'opacity-60', className)}>
      {emoji && (
        <span aria-hidden className="text-[18px] w-6 text-center shrink-0">
          {emoji}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[15px] leading-snug">{title}</div>
        {(time || detail) && (
          <div className="text-[12.5px] text-muted mt-0.5 leading-snug">
            {time && <span className="tabular-nums">{time}</span>}
            {time && detail && ' · '}
            {detail}
          </div>
        )}
      </div>
      {right && <div className="shrink-0 flex items-center gap-1.5">{right}</div>}
    </div>
  )
}

export function PrepTag({ className }: { className?: string }) {
  return <span className={cn('inline-flex items-center h-5 px-1.5 rounded-md text-[10px] font-bold tracking-wider bg-sand-soft text-sand shrink-0', className)}>PREP</span>
}

/** One-line week: 🔥 on key-session days, PREP the day before a session that needs it. Information only. */
export function LoadStrip({ load, today, title }: { load: DayLoad[]; today: DateKey; title?: string }) {
  if (!load.some((d) => d.key || d.prepFor)) return null
  return (
    <div className="card px-3 py-3 mb-4">
      {title && <div className="eyebrow mb-2 px-0.5">{title}</div>}
      <div className="grid grid-cols-7 gap-1 text-center">
        {load.map((d) => (
          <div key={d.date} className={cn('flex flex-col items-center gap-1 min-w-0', d.date < today && 'opacity-45')}>
            <span className="text-[10.5px] font-semibold text-muted tracking-wide">{WEEKDAY_SHORT[weekday(d.date)]}</span>
            <span className="h-6 flex items-center justify-center">
              {d.key ? <span aria-label="sessão-chave">🔥</span> : d.prepFor ? <PrepTag /> : <span className="text-line">•</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card overflow-hidden divide-y divide-line/70', className)}>{children}</div>
}

export function Quiet({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[13px] text-muted px-1 leading-relaxed', className)}>{children}</p>
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('eyebrow px-1 mt-6 mb-2', className)}>{children}</h3>
}
