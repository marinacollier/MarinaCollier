import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { tone as toneOf } from './tone'

export interface EmptyStateProps {
  emoji?: string
  title: string
  text?: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}

/** Warm, never-guilty empty states. */
export function EmptyState({ emoji = '🌿', title, text, action, compact, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'py-5 px-4' : 'py-10 px-6', className)}>
      <div className={cn('mb-2', compact ? 'text-2xl' : 'text-4xl')} aria-hidden>
        {emoji}
      </div>
      <div className={cn('font-display', compact ? 'text-[17px]' : 'text-xl')}>{title}</div>
      {text && <div className="text-[14px] text-muted mt-1 max-w-[30ch]">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ProgressBar({ value, max = 100, tone = 'sage', className }: { value: number; max?: number; tone?: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={cn('h-1.5 rounded-full bg-surface-2 overflow-hidden', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className={cn('h-full rounded-full', toneOf(tone).dot)} initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', bounce: 0, duration: 0.6 }} />
    </div>
  )
}

export function ProgressRing({ value, max = 100, size = 44, stroke = 4, tone = 'sage', children }: { value: number; max?: number; size?: number; stroke?: number; tone?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-2)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`var(--${tone === 'ink' ? 'ink' : tone})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ type: 'spring', bounce: 0, duration: 0.7 }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">{children}</div>}
    </div>
  )
}
