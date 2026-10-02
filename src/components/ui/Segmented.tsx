import { motion } from 'framer-motion'
import { useId } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentedProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
  /** 'pill' = filled track (default), 'tabs' = underline, horizontally scrollable. */
  variant?: 'pill' | 'tabs'
}

export function Segmented<T extends string>({ value, onChange, options, className, variant = 'pill' }: SegmentedProps<T>) {
  const id = useId()
  if (variant === 'tabs') {
    return (
      <div role="tablist" className={cn('flex gap-5 overflow-x-auto no-scrollbar border-b border-line', className)}>
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.value)}
              className={cn('relative shrink-0 h-11 text-[15px] transition-colors', active ? 'text-ink font-semibold' : 'text-muted')}
            >
              {o.label}
              {active && <motion.span layoutId={id} className="absolute left-0 right-0 -bottom-px h-[2px] bg-accent rounded-full" />}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div role="tablist" className={cn('flex p-1 rounded-full bg-surface-2 overflow-x-auto no-scrollbar', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn('relative flex-1 shrink-0 h-9 px-3 text-[13px] rounded-full whitespace-nowrap transition-colors', active ? 'text-ink font-semibold' : 'text-muted')}
          >
            {active && (
              <motion.span layoutId={id} className="absolute inset-0 bg-surface rounded-full shadow-sm" transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
