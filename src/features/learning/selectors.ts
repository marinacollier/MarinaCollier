/**
 * Learning (estudos + livros) — pure helpers. No React, no store access.
 * Pages derive with useMemo; actions apply the patches these return.
 */
import type { Book, BookStatus, DateKey, ID, StudyItem, StudyStatus, StudyTrack, Tone } from '@/data/types'
import { normalize } from '@/lib/text'

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

// ─── Tracks ─────────────────────────────────────────────────────────────────

export function activeTracks(tracks: StudyTrack[]): StudyTrack[] {
  return tracks.filter((t) => !t.archived).sort(byOrder)
}

/** Open (not finalizado) items per track. */
export function trackCounts(items: StudyItem[]): Map<ID, number> {
  const m = new Map<ID, number>()
  for (const it of items) {
    if (!it.trackId || it.status === 'finalizado') continue
    m.set(it.trackId, (m.get(it.trackId) ?? 0) + 1)
  }
  return m
}

// ─── Study items ────────────────────────────────────────────────────────────

export type StudyView = 'estudando' | 'proximo' | 'backlog' | 'finalizado'

/** Items for a list view. "Estudando" also shows paused items at the end; finalizados newest first. */
export function studyList(items: StudyItem[], view: StudyView, trackId?: ID): StudyItem[] {
  const inTrack = trackId ? items.filter((i) => i.trackId === trackId) : items
  if (view === 'finalizado') {
    return inTrack
      .filter((i) => i.status === 'finalizado')
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '') || b.updatedAt.localeCompare(a.updatedAt))
  }
  if (view === 'estudando') {
    const active = inTrack.filter((i) => i.status === 'estudando').sort(byOrder)
    const paused = inTrack.filter((i) => i.status === 'pausado').sort(byOrder)
    return [...active, ...paused]
  }
  return inTrack.filter((i) => i.status === view).sort(byOrder)
}

export function nextStudyOf(items: StudyItem[]): StudyItem | undefined {
  return items.filter((s) => s.status === 'proximo').sort(byOrder)[0]
}

/** Order value that puts an item at the top of its list. */
export function topOrder(items: { order: number }[]): number {
  return items.length ? Math.min(...items.map((i) => i.order)) - 1 : 0
}

export function clampProgress(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function startStudyPatch(item: StudyItem): Partial<StudyItem> {
  return { status: 'estudando', finishedAt: undefined, progress: item.status === 'finalizado' ? 0 : item.progress }
}

export function finishStudyPatch(today: DateKey): Partial<StudyItem> {
  return { status: 'finalizado', progress: 100, finishedAt: today }
}

/** Becomes "the" próximo estudo: status proximo at the very top of the queue. */
export function promoteToNextPatch(items: StudyItem[]): Partial<StudyItem> {
  return { status: 'proximo', order: topOrder(items.filter((i) => i.status === 'proximo')) }
}

/**
 * After finishing something: what could come next?
 * Próximos first, then backlog; items from the same trilha float up inside each group.
 */
export function promotionCandidates(items: StudyItem[], finished: Pick<StudyItem, 'id' | 'trackId'>, limit = 6): StudyItem[] {
  const sameTrackFirst = (a: StudyItem, b: StudyItem) => {
    const sa = finished.trackId && a.trackId === finished.trackId ? 0 : 1
    const sb = finished.trackId && b.trackId === finished.trackId ? 0 : 1
    return sa - sb || a.order - b.order
  }
  const pool = items.filter((i) => i.id !== finished.id)
  const proximos = pool.filter((i) => i.status === 'proximo').sort(sameTrackFirst)
  const backlog = pool.filter((i) => i.status === 'backlog').sort(sameTrackFirst)
  return [...proximos, ...backlog].slice(0, limit)
}

/** True when nothing is lined up after finishing (no estudando, no próximo). */
export function needsSomethingNext(items: StudyItem[]): boolean {
  return !items.some((i) => i.status === 'estudando' || i.status === 'proximo')
}

export const STUDY_STATUS_LABEL: Record<StudyStatus, string> = {
  estudando: 'Estudando',
  proximo: 'Próximo',
  backlog: 'Backlog',
  pausado: 'Pausado',
  finalizado: 'Finalizado',
}

export const STUDY_KIND_LABEL: Record<StudyItem['kind'], string> = {
  curso: 'curso',
  aula: 'aula',
  artigo: 'artigo',
  video: 'vídeo',
  livro: 'livro',
  tema: 'tema',
  certificacao: 'certificação',
  podcast: 'podcast',
  outro: 'outro',
}

// ─── Quick capture ──────────────────────────────────────────────────────────

const URL_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i

export function isUrl(text: string): boolean {
  const t = text.trim()
  return !/\s/.test(t) && URL_RE.test(t)
}

/** Guess a kind from a link host (youtube → vídeo, etc.). */
function kindFromHost(host: string): StudyItem['kind'] | undefined {
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(host)) return 'video'
  if (/spotify\.com|podcasts\.apple\.com|anchor\.fm/.test(host)) return 'podcast'
  if (/coursera|udemy|alura|edx|domestika|linkedin\.com\/learning/.test(host)) return 'curso'
  if (/medium\.com|substack\.com/.test(host)) return 'artigo'
  return undefined
}

/** Turn a backlog capture into a StudyItem payload. A bare URL becomes link + hostname title. */
export function parseCapture(text: string): Pick<StudyItem, 'title' | 'kind'> & { link?: string; source?: string } {
  const t = text.trim()
  if (isUrl(t)) {
    const href = /^https?:\/\//i.test(t) ? t : `https://${t}`
    let host = t
    try {
      host = new URL(href).hostname.replace(/^www\./, '')
    } catch {
      /* keep raw text */
    }
    return { title: host, link: href, source: host, kind: kindFromHost(host) ?? 'artigo' }
  }
  return { title: t, kind: 'tema' }
}

// ─── Books ──────────────────────────────────────────────────────────────────

export function booksByStatus(books: Book[], status: BookStatus): Book[] {
  return books.filter((b) => b.status === status).sort(byOrder)
}

/** Finished books grouped by year of endDate (newest year first). Books without endDate go to "sem data". */
export function finishedByYear(books: Book[]): { year: string; books: Book[] }[] {
  const groups = new Map<string, Book[]>()
  for (const b of books) {
    if (b.status !== 'finalizado') continue
    const y = b.endDate?.slice(0, 4) ?? 'sem data'
    groups.set(y, [...(groups.get(y) ?? []), b])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'sem data' ? 1 : b === 'sem data' ? -1 : b.localeCompare(a)))
    .map(([year, list]) => ({ year, books: list.sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? '')) }))
}

/**
 * Patch for moving a book to a new status.
 * - lendo: keeps an existing startDate, otherwise today; clears endDate if reopened.
 * - finalizado: endDate today, progress 100, startDate filled if missing.
 * - proximo / quero: back on the shelf; dates and progress are kept as history.
 */
export function bookStatusPatch(book: Book, next: BookStatus, today: DateKey, allBooks: Book[] = []): Partial<Book> {
  const sameStatus = allBooks.filter((b) => b.status === next && b.id !== book.id)
  const orderAtEnd = sameStatus.reduce((m, b) => Math.max(m, b.order), -1) + 1
  switch (next) {
    case 'lendo':
      return {
        status: 'lendo',
        startDate: book.status === 'lendo' ? book.startDate : book.startDate && book.status !== 'finalizado' ? book.startDate : today,
        endDate: undefined,
        progress: book.status === 'finalizado' ? 0 : book.progress,
        order: orderAtEnd,
      }
    case 'finalizado':
      return { status: 'finalizado', endDate: today, progress: 100, startDate: book.startDate ?? today, order: orderAtEnd }
    default:
      return { status: next, order: orderAtEnd }
  }
}

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  lendo: 'Lendo',
  proximo: 'Próximo',
  quero: 'Quero ler',
  finalizado: 'Lido',
}

// ─── Covers ─────────────────────────────────────────────────────────────────

/** Sand is left out: white type on it is too faint for a jacket. */
const COVER_TONES: Tone[] = ['accent', 'sage', 'ocean', 'plum', 'ink']

/** FNV-1a 32-bit over the normalized title. Stable across sessions and devices. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function coverTone(title: string): Tone {
  return COVER_TONES[hashString(normalize(title)) % COVER_TONES.length]
}

/** One of a few jacket layouts so the shelf doesn't look stamped out. */
export function coverVariant(title: string): 0 | 1 | 2 {
  return (Math.floor(hashString(normalize(title)) / COVER_TONES.length) % 3) as 0 | 1 | 2
}

/**
 * Reorder a filtered subset (e.g. one trilha) inside the full ordered list:
 * the subset keeps the slots it occupied, in its new order. Returns all ids in final order.
 */
export function mergeSubsetOrder(allOrderedIds: ID[], subsetNewOrder: ID[]): ID[] {
  const subset = new Set(subsetNewOrder)
  const queue = [...subsetNewOrder]
  return allOrderedIds.map((id) => (subset.has(id) ? (queue.shift() as ID) : id))
}
