import type { ReactNode } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { openSheet } from '@/app/ui-store'
import type { SheetName } from '@/app/sheet-types'
import type { DateKey, DB, HomeWidgetId } from '@/data/types'
import type { DayPart } from '@/lib/date'
import { cn } from '@/lib/cn'
import type { AgoraAction } from '../agora'
import type { HomeContext } from '../context'

/** Everything a Hoje widget needs, computed once per render of the page. */
export interface WidgetCtx {
  db: DB
  today: DateKey
  minutes: number
  part: DayPart
  /** Contextual rules for the day (energy, weekend, Friday evening, trip soon…). */
  home: HomeContext
}

export function runAction(action: AgoraAction, nav: NavigateFunction) {
  if (action.kind === 'route') nav(action.to)
  else if (action.kind === 'sheet') openSheet(action.name as SheetName, action.props as never)
  else scrollToWidget(action.target)
}

export function scrollToWidget(id: HomeWidgetId) {
  const el = document.getElementById(`w-${id}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }], { duration: 450, delay: 350, easing: 'ease-out' })
}

export interface WidgetProps {
  id: HomeWidgetId
  eyebrow: ReactNode
  /** Right side of the header (small link or icon). */
  action?: ReactNode
  children: ReactNode
  className?: string
  /** Remove inner padding (lists that go edge to edge). */
  flush?: boolean
}

/** The standard Hoje card: eyebrow header + content. */
export function Widget({ id, eyebrow, action, children, className, flush }: WidgetProps) {
  return (
    <section id={`w-${id}`} className={cn('card scroll-mt-4', flush ? 'pt-4 overflow-hidden' : 'p-4', className)} aria-label={typeof eyebrow === 'string' ? eyebrow : undefined}>
      <div className={cn('flex items-center justify-between gap-3 min-h-8', flush ? 'px-4 mb-1' : 'mb-2.5')}>
        <h2 className="eyebrow min-w-0 truncate">{eyebrow}</h2>
        {action && <div className="shrink-0 -mr-2 -my-2 flex items-center">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** Small text link used in widget headers ("ver todas"). */
export function HeaderLink({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="h-11 px-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-accent active:opacity-70">
      {children}
    </button>
  )
}

/** Warm compact empty state inside a core widget. */
export function WidgetEmpty({ emoji, text, action }: { emoji: string; text: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-11 w-11 rounded-full bg-surface-2 flex items-center justify-center text-[20px] shrink-0" aria-hidden>
        {emoji}
      </span>
      <div className="flex-1 min-w-0 text-[14px] text-ink-2 leading-snug">{text}</div>
      {action}
    </div>
  )
}

/** Pill-shaped secondary action inside widgets. */
export function SoftAction({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('h-9 px-3.5 rounded-full bg-surface-2 text-[13px] font-medium text-ink inline-flex items-center gap-1.5 active:scale-[0.97] transition shrink-0', className)}
    >
      {children}
    </button>
  )
}
