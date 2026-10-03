import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Minus, Plus } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'

/** iOS-style switch with a 44px hit area. */
export function Toggle({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        haptic('light')
        onChange(!checked)
      }}
      className={cn('h-11 w-[58px] -my-1.5 -mr-1 inline-flex items-center justify-center shrink-0', className)}
    >
      <span className={cn('relative h-[30px] w-[50px] rounded-full transition-colors duration-200', checked ? 'bg-sage' : 'bg-line')}>
        <motion.span
          className="absolute top-[3px] left-[3px] h-6 w-6 rounded-full bg-white shadow-sm"
          initial={false}
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        />
      </span>
    </button>
  )
}

/** − value + with bounds. */
export function Stepper({
  value,
  onChange,
  min,
  max,
  format = String,
  label,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  format?: (v: number) => string
  label: string
}) {
  return (
    <div className="flex items-center gap-1 -mr-1.5">
      <IconButton label={`Diminuir ${label}`} size="sm" variant="soft" disabled={value <= min} className="disabled:opacity-35" onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus size={16} />
      </IconButton>
      <span className="min-w-[3.25rem] text-center font-display text-[18px] tabular-nums">{format(value)}</span>
      <IconButton label={`Aumentar ${label}`} size="sm" variant="soft" disabled={value >= max} className="disabled:opacity-35" onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus size={16} />
      </IconButton>
    </div>
  )
}

/** Soft rounded bubble for an emoji. */
export function EmojiBubble({ emoji, className }: { emoji: string; className?: string }) {
  return (
    <span aria-hidden className={cn('h-9 w-9 rounded-xl bg-surface-2 inline-flex items-center justify-center text-[18px] leading-none', className)}>
      {emoji}
    </span>
  )
}

/** The app mark: sand sun, forest mountain, moss wave (same drawing as public/favicon.svg). */
export function AppMark({ size = 96, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <svg viewBox="60 100 400 330" width={size} height={(size * 330) / 400} className={className} aria-hidden>
      <motion.circle
        cx="318"
        cy="186"
        r="66"
        fill="var(--sand)"
        {...(animated ? { initial: { opacity: 0, y: 60 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring', bounce: 0.25, duration: 1.2, delay: 0.25 } } : {})}
      />
      <motion.path
        d="M84 344 L198 200 L262 276 L314 222 L428 344 Z"
        fill="var(--ink)"
        {...(animated ? { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, ease: 'easeOut' } } : {})}
      />
      <motion.path
        d="M96 400c40-26 80-26 120 0s80 26 120 0 80-26 120 0"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="22"
        strokeLinecap="round"
        {...(animated ? { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 1.1, delay: 0.5, ease: 'easeOut' } } : {})}
      />
    </svg>
  )
}

/** Small explanatory text block under a section. */
export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[13px] text-muted px-1 mt-2 leading-relaxed', className)}>{children}</p>
}
