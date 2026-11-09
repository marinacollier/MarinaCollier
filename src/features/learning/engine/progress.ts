/** Resources in progress (any domain), with their domain. Pure. */
import type { DB, StudyItem } from '@/data/types'
import { trackDomain } from './model'

export function itemDomain(db: Pick<DB, 'profile' | 'studyTracks'>, i: StudyItem): string {
  return i.domain ?? trackDomain(db.studyTracks.find((t) => t.id === i.trackId), db)
}

export function isInProgress(i: StudyItem): boolean {
  return !i.reference && (i.status === 'estudando' || i.libraryStatus === 'comecei') && i.status !== 'finalizado' && i.libraryStatus !== 'abandonei' && i.libraryStatus !== 'conclui'
}

export function inProgressItems(db: Pick<DB, 'profile' | 'studyTracks' | 'studyItems'>): { item: StudyItem; domain: string }[] {
  return db.studyItems.filter(isInProgress).map((item) => ({ item, domain: itemDomain(db, item) }))
}
