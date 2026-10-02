import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'accent' | 'soft' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-ink text-bg active:opacity-85',
  accent: 'bg-accent text-white active:opacity-85',
  soft: 'bg-surface-2 text-ink active:bg-line',
  ghost: 'bg-transparent text-ink-2 active:bg-surface-2',
  danger: 'bg-transparent text-accent active:bg-accent-soft',
  outline: 'bg-transparent text-ink border border-line active:bg-surface-2',
}
const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-full gap-1.5',
  md: 'h-11 px-5 text-[15px] rounded-full gap-2',
  lg: 'h-13 px-6 text-base rounded-2xl gap-2 w-full',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-[opacity,background-color,transform] duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none select-none',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: 'ghost' | 'soft' | 'primary'
  size?: 'sm' | 'md'
}

/** 44px touch target by default. `label` is required for accessibility. */
export function IconButton({ label, variant = 'ghost', size = 'md', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition active:scale-95 shrink-0',
        size === 'md' ? 'h-11 w-11' : 'h-9 w-9',
        variant === 'ghost' && 'text-ink-2 active:bg-surface-2',
        variant === 'soft' && 'bg-surface-2 text-ink active:bg-line',
        variant === 'primary' && 'bg-ink text-bg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
