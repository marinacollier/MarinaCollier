import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { PlannedFood, PlannedMeal } from '@/data/types'
import { cn } from '@/lib/cn'

/** One prescribed food: name, quantity as written, substitutions behind a tap. */
export function FoodRow({ item }: { item: PlannedFood }) {
  const [open, setOpen] = useState(false)
  const subs = item.substitutions ?? []
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] leading-snug">{item.food}</span>
        {item.qty && <span className="text-[13px] text-muted text-right shrink-0 max-w-[48%] leading-snug">{item.qty}</span>}
      </div>
      {subs.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-0.5 -ml-0.5 inline-flex items-center gap-1 min-h-8 text-[12.5px] text-muted active:text-ink"
          >
            <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
            {open ? 'esconder trocas' : `${subs.length} ${subs.length === 1 ? 'troca possível' : 'trocas possíveis'}`}
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden pl-3 border-l border-line ml-1 space-y-1"
              >
                {subs.map((s) => (
                  <li key={s} className="text-[13px] text-ink-2 leading-snug">
                    {s}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </li>
  )
}

/** A prescribed meal: "05:00 · Pré-treino", its foods and the observations. */
export function PlannedMealBlock({ meal, compact }: { meal: PlannedMeal; compact?: boolean }) {
  return (
    <div className={cn(!compact && 'py-3')}>
      <div className="flex items-baseline gap-2.5">
        {meal.time && <span className="font-display text-[17px] tabular-nums text-ink-2">{meal.time}</span>}
        <span className={cn('font-medium', compact ? 'text-[14px]' : 'text-[15px]')}>{meal.name}</span>
      </div>
      <ul className="divide-y divide-line/60">
        {meal.items.map((it, i) => (
          <FoodRow key={`${it.food}-${i}`} item={it} />
        ))}
      </ul>
      {meal.notes && (
        <div className="mt-2 rounded-2xl bg-sand-soft px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line">
          <span className="eyebrow block mb-0.5">observações</span>
          {meal.notes}
        </div>
      )}
    </div>
  )
}

/** Small "who said it" line. */
export function SourceNote({ children }: { children: ReactNode }) {
  return <div className="text-[12px] text-muted italic">{children}</div>
}
