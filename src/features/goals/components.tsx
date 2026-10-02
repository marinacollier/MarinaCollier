import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import type { Goal } from '@/data/types'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { areaMeta } from './logic'

/** Small iOS-like switch (local: the design system has none yet). */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="h-11 -my-2 inline-flex items-center shrink-0"
    >
      <span className={cn('relative h-7 w-12 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}>
        <motion.span
          initial={false}
          animate={{ x: checked ? 22 : 2 }}
          transition={{ type: 'spring', bounce: 0.25, duration: 0.3 }}
          className="absolute top-0.5 left-0 h-6 w-6 rounded-full bg-surface shadow"
        />
      </span>
    </button>
  )
}

export function AreaTag({ area, className }: { area: Goal['category']; className?: string }) {
  const m = areaMeta(area)
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12px] text-muted whitespace-nowrap', className)}>
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  )
}

/**
 * Gentle choice when a 4th big goal shows up: swap one of the three, or keep the new one small.
 */
export function BigChoice({
  rivals,
  onSwap,
  onKeepSmall,
  onCancel,
}: {
  rivals: Goal[]
  onSwap: (id: string) => void
  onKeepSmall: () => void
  onCancel?: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-sand-soft p-4 space-y-3"
      role="group"
      aria-label="Escolha entre as grandes"
    >
      <div>
        <div className="font-display text-[18px] leading-snug">Você já tem 3 grandes.</div>
        <div className="text-[14px] text-ink-2 mt-0.5">Trocar uma ou deixar essa como menor?</div>
      </div>
      <div className="space-y-1.5">
        {rivals.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onSwap(g.id)}
            className="w-full flex items-center gap-3 min-h-11 rounded-xl bg-surface px-3 py-2 text-left active:scale-[0.99] transition"
          >
            <Star size={16} className="text-sand shrink-0" fill="currentColor" />
            <span className="flex-1 min-w-0 text-[14.5px] leading-snug">{g.title}</span>
            <span className="text-[12px] text-muted shrink-0">vira menor</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={onKeepSmall}>
          Deixar essa como menor
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Voltar
          </Button>
        )}
      </div>
    </motion.div>
  )
}
