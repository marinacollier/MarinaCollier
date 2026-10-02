/** Small finance-local building blocks. */
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Expense, FinancialCategory } from '@/data/types'
import { tone } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatBRL } from '@/lib/money'
import { expenseSubtitle } from './selectors'

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function CatBadge({ category, size = 'md' }: { category?: FinancialCategory; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center rounded-full shrink-0',
        tone(category?.tone).soft,
        size === 'md' ? 'h-10 w-10 text-[18px]' : 'h-8 w-8 text-[15px]',
      )}
    >
      {category?.emoji ?? '•'}
    </span>
  )
}

/** Tappable expense row content (wrap in SwipeRow for gestures). */
export function ExpenseLine({
  expense,
  category,
  onPress,
  trailing,
  subtitle,
}: {
  expense: Expense
  category?: FinancialCategory
  onPress?: () => void
  trailing?: ReactNode
  subtitle?: string
}) {
  const sub = subtitle ?? expenseSubtitle(expense, category)
  return (
    <div className="flex items-center gap-2 pr-4">
      <button type="button" onClick={onPress} className="flex-1 min-w-0 flex items-center gap-3 min-h-[60px] py-2.5 pl-4 text-left active:opacity-70 transition-opacity">
        <CatBadge category={category} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] leading-snug truncate">{expense.title}</div>
          {sub && <div className="text-[12.5px] text-muted mt-0.5 truncate">{sub}</div>}
        </div>
      </button>
      {trailing ?? (
        <button type="button" onClick={onPress} tabIndex={-1} className="shrink-0 font-display text-[16px] tabular-nums min-h-[44px]">
          {formatBRL(expense.amountCents)}
        </button>
      )}
    </div>
  )
}
