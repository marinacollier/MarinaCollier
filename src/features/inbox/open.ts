import { openSheet } from '@/app/ui-store'
import type { EntityType, ID } from '@/data/types'

/** Open the editor sheet of an entity created from the inbox. Returns false if there is none. */
export function openEntity(type: EntityType, id: ID): boolean {
  switch (type) {
    case 'task':
      openSheet('task', { id })
      return true
    case 'note':
      openSheet('note', { id })
      return true
    case 'expense':
      openSheet('expense', { id })
      return true
    case 'tripItem':
      openSheet('tripItem', { id })
      return true
    case 'trip':
      openSheet('trip', { id })
      return true
    case 'project':
      openSheet('project', { id })
      return true
    case 'studyItem':
      openSheet('study', { id })
      return true
    case 'book':
      openSheet('book', { id })
      return true
    case 'content':
      openSheet('content', { id })
      return true
    case 'goal':
      openSheet('goal', { id })
      return true
    default:
      return false
  }
}
