import { actions } from '@/data/store'
import type { CollectionKey, ID } from '@/data/types'
import { toast } from './ui-store'

/** Delete with a "Desfazer" toast — the default way to delete anything from a list. */
export function removeWithUndo(key: CollectionKey, id: ID, message = 'Apagado'): void {
  const removed = actions.remove(key, id)
  if (!removed) return
  toast(message, { action: { label: 'Desfazer', run: () => actions.restore(key, removed as never) } })
}
