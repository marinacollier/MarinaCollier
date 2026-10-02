import { Star } from 'lucide-react'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'

type Rating = 1 | 2 | 3 | 4 | 5

/** Read-only when `onChange` is missing. Tapping the current value clears it. */
export function Stars({ value, onChange, size = 14, className }: { value?: number; onChange?: (v: Rating | undefined) => void; size?: number; className?: string }) {
  const interactive = !!onChange
  return (
    <div className={cn('inline-flex items-center', interactive ? 'gap-0' : 'gap-0.5', className)} aria-label={value ? `${value} de 5 estrelas` : 'sem avaliação'}>
      {([1, 2, 3, 4, 5] as Rating[]).map((n) => {
        const on = !!value && n <= value
        const icon = <Star size={size} strokeWidth={1.6} className={on ? 'text-sand' : 'text-muted/40'} fill={on ? 'currentColor' : 'none'} />
        if (!interactive) return <span key={n}>{icon}</span>
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
            aria-pressed={on}
            className="h-11 w-11 inline-flex items-center justify-center active:scale-90 transition"
            onClick={() => {
              haptic('light')
              onChange(value === n ? undefined : n)
            }}
          >
            {icon}
          </button>
        )
      })}
    </div>
  )
}
