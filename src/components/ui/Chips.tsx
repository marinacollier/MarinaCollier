import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface ChipProps {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}

export function Chip({ selected, onClick, children, className }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13.5px] border transition shrink-0 active:scale-[0.97]',
        selected ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2',
        className,
      )}
    >
      {children}
    </button>
  )
}

export interface ChipSelectProps<T extends string> {
  value: T | undefined
  onChange: (v: T | undefined) => void
  options: { value: T; label: ReactNode }[]
  /** Allow tapping the selected chip to clear it. */
  clearable?: boolean
  wrap?: boolean
  className?: string
}

export function ChipSelect<T extends string>({ value, onChange, options, clearable, wrap = true, className }: ChipSelectProps<T>) {
  return (
    <div className={cn('flex gap-2', wrap ? 'flex-wrap' : 'overflow-x-auto no-scrollbar -mx-4 px-4', className)}>
      {options.map((o) => (
        <Chip key={o.value} selected={value === o.value} onClick={() => onChange(value === o.value && clearable ? undefined : o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

export interface MultiChipSelectProps<T extends string> {
  value: T[]
  onChange: (v: T[]) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}

export function MultiChipSelect<T extends string>({ value, onChange, options, className }: MultiChipSelectProps<T>) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <Chip key={o.value} selected={on} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
            {o.label}
          </Chip>
        )
      })}
    </div>
  )
}

/** Small status label. */
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[12px] font-medium bg-surface-2 text-ink-2 whitespace-nowrap', className)}>
      {children}
    </span>
  )
}
