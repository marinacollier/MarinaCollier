/**
 * Small shared pieces of the UGC space: a write that saves right away with Desfazer, the action row
 * (same check as Home), and labels.
 */
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { persist } from '@/data/store'
import type { UgcAction } from '@/data/ugc/model'
import { actionTitle } from '@/data/ugc/model'
import { recordOutbound, revertInteraction, type Undo } from '@/data/ugc/ops'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { todayKey } from '@/lib/date'

/** Every write in the UGC space: saved to the device now, with Desfazer. */
export function commit(run: () => Undo, message: string) {
  const undo = run()
  void persist()
  haptic('success')
  toast(message, {
    action: {
      label: 'Desfazer',
      run: () => {
        undo()
        void persist()
      },
    },
  })
}

export function UgcActionRow({ action }: { action: UgcAction }) {
  const title = actionTitle(action)
  const tick = () => {
    if (action.done && action.interactionId) commit(() => revertInteraction(action.interactionId!), `${title}: desmarcado`)
    else commit(() => recordOutbound(action.opportunity.id, action.channel, { date: todayKey() }).undo, `${title} ✓`)
  }
  return (
    <li className="flex items-center gap-2 min-h-[52px]">
      <button
        type="button"
        aria-pressed={action.done}
        aria-label={action.done ? `Desmarcar ${title}` : `Feito: ${title}`}
        onClick={tick}
        className="h-11 w-9 shrink-0 -ml-1 inline-flex items-center justify-center active:scale-90 transition"
      >
        <span className={cn('h-[22px] w-[22px] rounded-full border-[1.5px] inline-flex items-center justify-center', action.done ? 'bg-sage border-sage text-bg' : 'border-ink/30')}>
          {action.done && <Check size={13} strokeWidth={3} />}
        </span>
      </button>
      <Link to={ROUTES.ugcBrand(action.opportunity.brandId)} className="flex-1 min-w-0 py-1.5 active:opacity-70">
        <span className={cn('block text-[15.5px] leading-snug', action.done && 'line-through text-muted')}>{title}</span>
        <span className="block text-[12.5px] text-muted truncate">{action.sub}</span>
      </Link>
    </li>
  )
}

export function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null
  return <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-md', tier === 'S' ? 'bg-plum-soft text-plum' : tier === 'A' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2')}>{tier}</span>
}
