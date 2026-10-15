/**
 * Small shared pieces of the UGC space: a write that saves right away with Desfazer, the action row
 * (same check as Home), and labels.
 */
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { ItemRow } from '@/components/ui'
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
  return <ItemRow title={title} meta={action.sub} checked={action.done} onCheck={tick} to={ROUTES.ugcBrand(action.opportunity.brandId)} />
}

export function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null
  return <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-md', tier === 'S' ? 'bg-plum-soft text-plum' : tier === 'A' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2')}>{tier}</span>
}
