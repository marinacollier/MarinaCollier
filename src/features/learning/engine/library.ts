/**
 * Biblioteca: resources (study items + books) with statuses that are NOT equivalent —
 * concluí (finished) ≠ anotei ≠ pratiquei ≠ apliquei. Marking "apliquei" never marks "concluí" and vice versa;
 * every mark stays in `libraryLog`. Never invents titles, links or episodes. Pure.
 */
import type { Book, DateKey, LibraryStatus, StudyItem } from '@/data/types'

export const LIBRARY_ORDER: LibraryStatus[] = ['quero_conhecer', 'comecei', 'conclui', 'anotei', 'pratiquei', 'apliquei', 'abandonei']

/** Current status: hers when marked; otherwise read from the item's study status (never "aprendi"). */
export function libraryStatusOf(i: Pick<StudyItem, 'libraryStatus' | 'status'>): LibraryStatus {
  if (i.libraryStatus) return i.libraryStatus
  switch (i.status) {
    case 'estudando':
    case 'pausado':
      return 'comecei'
    case 'finalizado':
      return 'conclui'
    default:
      return 'quero_conhecer'
  }
}

export function bookLibraryStatus(b: Pick<Book, 'status'>): LibraryStatus {
  return b.status === 'lendo' ? 'comecei' : b.status === 'finalizado' ? 'conclui' : 'quero_conhecer'
}

/** Every status this item has reached (a finished item she also applied has both). */
export function libraryMarks(i: Pick<StudyItem, 'libraryStatus' | 'status' | 'libraryLog'>): Set<LibraryStatus> {
  const s = new Set<LibraryStatus>((i.libraryLog ?? []).map((l) => l.status))
  s.add(libraryStatusOf(i))
  return s
}

/** Patch for marking a status. Only 'conclui' / 'abandonei' / 'comecei' touch the study status; learning marks don't. */
export function markLibraryPatch(i: Pick<StudyItem, 'libraryLog' | 'status' | 'finishedAt'>, status: LibraryStatus, date: DateKey, note?: string): Partial<StudyItem> {
  const patch: Partial<StudyItem> = { libraryStatus: status, libraryLog: [...(i.libraryLog ?? []), note ? { status, date, note } : { status, date }] }
  if (status === 'conclui' && i.status !== 'finalizado') {
    patch.status = 'finalizado'
    patch.finishedAt = i.finishedAt ?? date
  }
  if (status === 'comecei' && (i.status === 'backlog' || i.status === 'proximo')) patch.status = 'estudando'
  if (status === 'abandonei' && i.status === 'estudando') patch.status = 'pausado'
  return patch
}

/** Counts per status (an item counts in every status it reached). */
export function libraryDistribution(items: Pick<StudyItem, 'libraryStatus' | 'status' | 'libraryLog' | 'reference'>[], books: Pick<Book, 'status'>[] = []): Record<LibraryStatus, number> {
  const out = Object.fromEntries(LIBRARY_ORDER.map((s) => [s, 0])) as Record<LibraryStatus, number>
  for (const i of items) for (const s of libraryMarks(i)) out[s]++
  for (const b of books) out[bookLibraryStatus(b)]++
  return out
}
