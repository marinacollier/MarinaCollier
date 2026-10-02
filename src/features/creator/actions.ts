import { actions } from '@/data/store'
import type { BrandPartnership, ContentItem } from '@/data/types'
import { toast } from '@/app/ui-store'
import { todayKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { contentStageMeta, partnershipStageMeta } from './constants'
import { nextContentStage, nextPartnershipStage } from './selectors'

export function advancePartnership(p: BrandPartnership): void {
  const next = nextPartnershipStage(p.stage)
  if (!next) return
  actions.update('partnerships', p.id, { stage: next })
  const meta = partnershipStageMeta(next)
  if (next === 'finalizado') {
    haptic('success')
    toast(`${p.brand} finalizada! Que orgulho ✨`, { tone: 'win' })
  } else if (next === 'publicado') {
    haptic('success')
    toast(`${p.brand} no ar! 📣`, { tone: 'win' })
  } else {
    haptic('light')
    toast(`${p.brand} → ${meta.label}`, {
      action: { label: 'Desfazer', run: () => actions.update('partnerships', p.id, { stage: p.stage }) },
    })
  }
}

export function advanceContent(c: ContentItem): void {
  const next = nextContentStage(c.stage)
  if (!next) return
  const patch: Partial<ContentItem> = { stage: next }
  if (next === 'publicado') patch.publishedAt = todayKey()
  actions.update('contentItems', c.id, patch)
  if (next === 'publicado') {
    haptic('success')
    toast('Publicado! Que bom 🎉', { tone: 'win' })
  } else {
    haptic('light')
    toast(`Movido para ${contentStageMeta(next).label}`, {
      action: { label: 'Desfazer', run: () => actions.update('contentItems', c.id, { stage: c.stage, publishedAt: c.publishedAt }) },
    })
  }
}
