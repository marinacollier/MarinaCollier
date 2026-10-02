import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

/**
 * Standard page scaffold. Content is padded for the safe area on top and for the
 * bottom nav + FAB at the bottom. Keep headers compact: title + optional subtitle.
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('mx-auto w-full max-w-[640px] px-4 pt-safe pb-[calc(env(safe-area-inset-bottom)+112px)]', className)}>{children}</main>
}

export interface PageHeaderProps {
  title: ReactNode
  eyebrow?: ReactNode
  subtitle?: ReactNode
  /** Show a back button (navigates -1, or to `backTo`). */
  back?: boolean
  backTo?: string
  actions?: ReactNode
  /** Show the universal search shortcut. Default true on top-level pages. */
  search?: boolean
}

export function PageHeader({ title, eyebrow, subtitle, back, backTo, actions, search = true }: PageHeaderProps) {
  const nav = useNavigate()
  return (
    <header className="pt-2 pb-4">
      <div className="flex items-center justify-between min-h-11 -mx-1.5">
        <div>
          {back && (
            <IconButton label="Voltar" onClick={() => (backTo ? nav(backTo) : history.length > 1 ? nav(-1) : nav('/'))}>
              <ChevronLeft size={24} />
            </IconButton>
          )}
        </div>
        <div className="flex items-center">
          {actions}
          {search && (
            <IconButton label="Buscar" onClick={() => nav('/busca')}>
              <Search size={20} />
            </IconButton>
          )}
        </div>
      </div>
      {eyebrow && <div className="eyebrow mt-1">{eyebrow}</div>}
      <h1 className="font-display text-[32px] leading-[1.08] tracking-tight mt-0.5">{title}</h1>
      {subtitle && <p className="text-muted text-[15px] mt-1.5">{subtitle}</p>}
    </header>
  )
}

export interface ListRowProps {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onPress?: () => void
  chevron?: boolean
  className?: string
  muted?: boolean
}

/** A tappable row (min 52px). Use inside a Card with padded={false} or a plain div. */
export function ListRow({ leading, title, subtitle, trailing, onPress, chevron, className, muted }: ListRowProps) {
  const Comp = onPress ? 'button' : 'div'
  return (
    <Comp
      type={onPress ? 'button' : undefined}
      onClick={onPress}
      className={cn('w-full flex items-center gap-3 min-h-[52px] py-2.5 px-4 text-left', onPress && 'active:bg-surface-2 transition-colors', className)}
    >
      {leading && <div className="shrink-0 flex items-center">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className={cn('text-[15px] leading-snug', muted && 'text-muted line-through decoration-muted/50')}>{title}</div>
        {subtitle && <div className="text-[13px] text-muted mt-0.5 truncate">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-2 text-[13px] text-muted">{trailing}</div>}
      {chevron && <ChevronRight size={18} className="text-muted/60 shrink-0" />}
    </Comp>
  )
}

/** Hairline-separated list inside a card. */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card overflow-hidden divide-y divide-line/70', className)}>{children}</div>
}
