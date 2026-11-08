import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Render as a button-like pressable surface. */
  onPress?: () => void
  padded?: boolean
}

export function Card({ onPress, padded = true, className, children, ...rest }: CardProps) {
  const pressable = !!onPress
  return (
    <div
      role={pressable ? 'button' : undefined}
      tabIndex={pressable ? 0 : undefined}
      onClick={onPress}
      onKeyDown={pressable ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPress()) : undefined}
      className={cn('card', padded && 'p-4', pressable && 'cursor-pointer transition active:scale-[0.99]', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export interface CardHeaderProps {
  eyebrow?: ReactNode
  title?: ReactNode
  action?: ReactNode
  className?: string
}

/** Eyebrow (small caps label) + optional serif title + right action. */
export function CardHeader({ eyebrow, title, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        {title && <div className="font-display text-xl leading-tight mt-0.5">{title}</div>}
      </div>
      {action && <div className="shrink-0 -mr-1 -mt-1">{action}</div>}
    </div>
  )
}

/** Section header between cards (the site's pattern): optional small olive label, then a Bodoni title. */
export function SectionTitle({ children, label, action, className }: { children: ReactNode; label?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-end justify-between gap-3 px-1 mt-8 mb-3', className)}>
      <div className="min-w-0">
        {label && <div className="eyebrow text-[12px] mb-1">{label}</div>}
        <h2 className="section-title">{children}</h2>
      </div>
      {action}
    </div>
  )
}
