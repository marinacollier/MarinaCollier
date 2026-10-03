import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { KIT_ICON, type KitIcon, type MealPlace, type MenuItem } from '@/data/mealprep'
import { Checkbox } from '@/components/ui'
import { cn } from '@/lib/cn'

export function KitIcons({ icons, className }: { icons: KitIcon[]; className?: string }) {
  if (!icons.length) return null
  return (
    <span className={cn('inline-flex gap-0.5 text-[13px] leading-none', className)} aria-label={icons.map((i) => KIT_ICON[i].label).join(', ')}>
      {icons.map((i) => (
        <span key={i} title={KIT_ICON[i].label}>
          {KIT_ICON[i].emoji}
        </span>
      ))}
    </span>
  )
}

export function SourceBadge({ badge }: { badge: MenuItem['badge'] }) {
  return badge === 'troca' ? (
    <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-sand-soft text-sand">troca do nutri</span>
  ) : (
    <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-sage-soft text-sage">nutri</span>
  )
}

export function PlacePill({ place }: { place: MealPlace }) {
  if (place === 'casa') return null
  return place === 'fora' ? (
    <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-accent-soft text-accent">fora de casa</span>
  ) : (
    <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-ocean-soft text-ocean">no treino</span>
  )
}

/** A tappable check row (44px target via Checkbox). */
export function CheckRow({ checked, onToggle, title, subtitle, trailing, label }: { checked: boolean; onToggle: () => void; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; label: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 min-h-[52px]">
      <div className="pt-0.5">
        <Checkbox checked={checked} onChange={onToggle} label={label} />
      </div>
      <button type="button" onClick={onToggle} className="flex-1 min-w-0 text-left">
        <div className={cn('text-[15px] leading-snug transition-colors', checked && 'text-muted line-through decoration-muted/50')}>{title}</div>
        {subtitle && <div className="text-[13px] text-muted mt-0.5 leading-snug">{subtitle}</div>}
      </button>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  )
}

export function Fade({ children, k }: { children: ReactNode; k: string }) {
  return (
    <motion.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      {children}
    </motion.div>
  )
}

/** "150 g" style for items. */
export function amountText(it: MenuItem): string {
  if (it.free) return 'à vontade'
  if (it.amount == null) return it.qty ?? ''
  return `${String(Math.round(it.amount * 10) / 10).replace('.', ',')} ${it.unit ?? 'g'}`
}

/** "2 bife(s) pequeno(s)" — the household measure without the grams. */
export function householdText(it: MenuItem): string | undefined {
  if (!it.qty || it.free) return undefined
  const t = it.qty.replace(/\s*\(\d+(?:[.,]\d+)?\s*(g|ml)\)\s*$/i, '').trim()
  return t && t !== it.qty ? t : undefined
}
