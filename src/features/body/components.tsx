/** Small building blocks shared by the Corpo page and sheets. */
import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { DailyCheckIn, DateKey, DayPeriod, Modality, PlanType, WorkoutStatus } from '@/data/types'
import { PERIOD_LABEL } from '@/data/planning'
import { PLAN_TYPE_LABEL } from './planner'
import { tone } from '@/components/ui'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { CORPO, ENERGIA, MOODS, SONO, STATUS_META } from './constants'
import { upsertCheckin } from './mutations'

export function ModalityIcon({ modality, size = 'md', className }: { modality: Pick<Modality, 'emoji' | 'tone'>; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dim = size === 'lg' ? 'h-16 w-16 text-[34px] rounded-[22px]' : size === 'md' ? 'h-11 w-11 text-[22px] rounded-2xl' : 'h-7 w-7 text-[15px] rounded-[10px]'
  return (
    <span aria-hidden className={cn('inline-flex items-center justify-center shrink-0 leading-none', tone(modality.tone).soft, dim, className)}>
      {modality.emoji}
    </span>
  )
}

export function StatusPill({ status, className }: { status: WorkoutStatus; className?: string }) {
  const meta = STATUS_META[status]
  const t = meta.tone === 'muted' ? null : tone(meta.tone)
  return (
    <span className={cn('inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-medium whitespace-nowrap', t ? t.soft : 'bg-surface-2', 'text-ink-2', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', t ? t.dot : 'bg-muted/60')} />
      {meta.label}
    </span>
  )
}

/** Row of 5 emoji buttons (feeling / humor). */
export function EmojiScale<V extends number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: V; emoji: string; label: string }[]
  value: V | undefined
  onChange: (v: V | undefined) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex justify-between gap-1.5">
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            onClick={() => {
              haptic('light')
              onChange(on ? undefined : o.value)
            }}
            className={cn(
              'flex-1 h-12 rounded-2xl text-[24px] leading-none transition active:scale-95 border',
              on ? 'bg-accent-soft border-accent/50' : 'bg-surface-2 border-transparent grayscale-[35%] opacity-80',
            )}
          >
            <motion.span initial={false} animate={{ scale: on ? 1.15 : 1 }} className="inline-block">
              {o.emoji}
            </motion.span>
          </button>
        )
      })}
    </div>
  )
}

/** Compact three-option toggle used by the check-in. */
export function TriChoice<V extends string>({ label, options, value, onChange }: { label: string; options: { value: V; label: string }[]; value: V | undefined; onChange: (v: V | undefined) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[62px] shrink-0 text-[13px] text-muted">{label}</span>
      <div className="flex-1 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                haptic('light')
                onChange(on ? undefined : o.value)
              }}
              className={cn('h-10 rounded-full text-[13.5px] transition active:scale-[0.97]', on ? 'bg-ink text-bg font-medium' : 'bg-surface-2 text-ink-2')}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Check-in fields. Every tap saves right away (creates the day's record if needed). */
export function CheckinFields({ date, checkin, showNote = true, onNoteSaved }: { date: DateKey; checkin: DailyCheckIn | undefined; showNote?: boolean; onNoteSaved?: () => void }) {
  const [nota, setNota] = useState(checkin?.nota ?? '')
  const saveNote = () => {
    if ((checkin?.nota ?? '') === nota.trim()) return
    upsertCheckin(date, { nota: nota.trim() || undefined })
    onNoteSaved?.()
  }
  return (
    <div className="space-y-2.5">
      <TriChoice label="Energia" options={ENERGIA} value={checkin?.energia} onChange={(energia) => upsertCheckin(date, { energia })} />
      <TriChoice label="Sono" options={SONO} value={checkin?.sono} onChange={(sono) => upsertCheckin(date, { sono })} />
      <TriChoice label="Corpo" options={CORPO} value={checkin?.corpo} onChange={(corpo) => upsertCheckin(date, { corpo })} />
      <div className="pt-1.5">
        <div className="text-[13px] text-muted mb-1.5">Humor</div>
        <EmojiScale label="Humor" options={MOODS} value={checkin?.humor} onChange={(humor) => upsertCheckin(date, { humor })} />
      </div>
      {showNote && (
        <input
          className="input mt-1"
          placeholder="uma nota sobre hoje (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      )}
    </div>
  )
}

/** Tiny FIXO / BASE / FLEXÍVEL / A CONFIRMAR label. */
export function PlanTypeTag({ planType, className }: { planType?: PlanType; className?: string }) {
  if (!planType) return null
  return (
    <span className={cn('text-[9.5px] font-semibold tracking-[0.08em] leading-none text-ink-2/70 whitespace-nowrap', planType === 'a_confirmar' && 'text-sand', className)}>
      {PLAN_TYPE_LABEL[planType]}
    </span>
  )
}

/** "07:00" or "manhã" (approximate window) or ''. */
export function whenLabel(w: { time?: string; period?: DayPeriod }): string {
  return w.time ?? (w.period ? PERIOD_LABEL[w.period] : '')
}

export function Dot({ on, toneName = 'sage', className }: { on: boolean; toneName?: string; className?: string }) {
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full', on ? tone(toneName).dot : 'bg-line', className)} />
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-[22px] leading-none tracking-tight">{value}</div>
      <div className="text-[12px] text-muted mt-1">{label}</div>
    </div>
  )
}
