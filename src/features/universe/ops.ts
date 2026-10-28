/** Writes of Meu Universo (all through `actions`, each with a Desfazer). */
import { toast } from '@/app/ui-store'
import { actions, getDB } from '@/data/store'
import type { ID, NewItem, ScentLog, UniverseItem } from '@/data/types'
import { patchFromLog } from '@/data/universe/model'

/** Deletes an item and its diary entries; one Desfazer brings both back. */
export function removeItemWithUndo(id: ID): void {
  const logs = getDB().scentLogs.filter((l) => l.itemId === id)
  const removedLogs = logs.map((l) => actions.remove('scentLogs', l.id)).filter(Boolean) as ScentLog[]
  const removed = actions.remove('universeItems', id)
  if (!removed) return
  toast('Apagado', {
    action: {
      label: 'Desfazer',
      run: () => {
        actions.restore('universeItems', removed)
        for (const l of removedLogs) actions.restore('scentLogs', l)
      },
    },
  })
}

export function removeLogWithUndo(id: ID): void {
  const removed = actions.remove('scentLogs', id)
  if (!removed) return
  toast('Registro apagado', { action: { label: 'Desfazer', run: () => actions.restore('scentLogs', removed) } })
}

export const nextItemOrder = () => getDB().universeItems.reduce((m, i) => Math.max(m, i.order), -1) + 1

/**
 * Saves a diary entry (new or edited). A new fragrance typed in the form becomes a library item (never owned unless
 * the entry says comprado / em uso). The item gets the opinion only when it had none (see patchFromLog).
 */
export function saveLog(log: NewItem<'scentLogs'> & { id?: ID }, newItem?: { brand?: string; name: string }): void {
  let itemId = log.itemId
  if (newItem) {
    const created = actions.create('universeItems', {
      category: 'perfume',
      name: newItem.name,
      brand: newItem.brand || undefined,
      ownership: 'testado',
      experiencedOn: log.date,
      country: log.country,
      city: log.city,
      source: 'marina',
      confirmed: false,
      needsConfirmation: ['notas'],
      notesSource: 'a_confirmar',
      order: nextItemOrder(),
    } as NewItem<'universeItems'>)
    itemId = created.id
  }
  const data = { ...log, itemId }
  if (log.id && getDB().scentLogs.some((l) => l.id === log.id)) actions.update('scentLogs', log.id, data)
  else actions.create('scentLogs', data)
  const item = getDB().universeItems.find((i) => i.id === itemId)
  if (!item) return
  const patch: Partial<UniverseItem> = patchFromLog(item, data)
  if (patch.ownership === 'tenho' && !item.acquiredOn) patch.acquiredOn = log.date
  if (log.priceCents && !item.priceCents) {
    patch.priceCents = log.priceCents
    patch.currency = log.currency
  }
  if (log.sizeMl && !item.sizeMl) patch.sizeMl = log.sizeMl
  if (!item.experiencedOn) patch.experiencedOn = log.date
  if (Object.keys(patch).length) actions.update('universeItems', item.id, patch)
}
