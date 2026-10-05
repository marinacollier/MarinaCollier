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

export type TrackStatus = NonNullable<StudyTrack['status']>

export const TRACK_STATUS_LABEL: Record<TrackStatus, string> = {
  ativo: 'ativo',
  continuo: 'contínuo',
  pausado: 'pausado',
}

export const TRACK_STATUSES: TrackStatus[] = ['ativo', 'continuo', 'pausado']

/** Tracks without a status (older data) count as ativo. */
export function trackStatus(t: Pick<StudyTrack, 'status'>): TrackStatus {
  return t.status ?? 'ativo'
}

/** Tap on the status pill: ativo → contínuo → pausado → ativo. */
export function nextTrackStatus(t: Pick<StudyTrack, 'status'>): TrackStatus {
  const i = TRACK_STATUSES.indexOf(trackStatus(t))
  return TRACK_STATUSES[(i + 1) % TRACK_STATUSES.length]
}

/** Visible trilhas: paused ones sink to the end, otherwise keep her order. */
export function tracksForDisplay(tracks: StudyTrack[]): StudyTrack[] {
  const rank = (t: StudyTrack) => (trackStatus(t) === 'pausado' ? 1 : 0)
  return activeTracks(tracks).sort((a, b) => rank(a) - rank(b) || a.order - b.order)
}

/** Guess a study kind from a format name ("Cambly" → aula, "Listening" → podcast…). Generic keywords only. */
export function kindForFormat(format: string): StudyItem['kind'] {
  const f = normalize(format)
  if (/podcast|listening|audio/.test(f)) return 'podcast'
  if (/video|youtube/.test(f)) return 'video'
  if (/artigo|article|newsletter/.test(f)) return 'artigo'
  if (/livro|book/.test(f)) return 'livro'
  if (/certifica/.test(f)) return 'certificacao'
  if (/curso|course|trilha|modulo/.test(f)) return 'curso'
  if (/aula|class|conversa|cambly|tutor|mentoria/.test(f)) return 'aula'
  if (/vocabul|tema|topic/.test(f)) return 'tema'
  return 'outro'
}

export type FormatQuick =
  | { type: 'existing'; item: StudyItem }
  | { type: 'create'; data: Pick<StudyItem, 'title' | 'kind' | 'status' | 'progress' | 'order'> & { trackId: ID } }

/**
 * Tapping a format chip on a trilha ("Cambly"): if something with that name is already open in the
 * trilha, reuse it (no duplicates); otherwise create it straight into "estudando".
 */
export function formatQuickCreate(track: Pick<StudyTrack, 'id'>, format: string, items: StudyItem[]): FormatQuick {
  const key = normalize(format)
  const existing = items.find(
    (i) =>
      i.trackId === track.id &&
      i.status !== 'finalizado' &&
      normalize(i.title)
        .split(/\s*[/·—]\s*|\s+-\s+/)
        .some((part) => part === key),
  )
  if (existing) return { type: 'existing', item: existing }
  const studying = items.filter((i) => i.status === 'estudando')
  return {
    type: 'create',
    data: {
      title: format.trim(),
      kind: kindForFormat(format),
      trackId: track.id,
      status: 'estudando',
      progress: 0,
      order: studying.reduce((m, i) => Math.max(m, i.order), -1) + 1,
    },
  }
}

/** Add a format to a list, ignoring blanks and case/accents duplicates. */
export function addFormat(formats: string[] | undefined, format: string): string[] {
  const list = formats ?? []
  const f = format.trim()
  if (!f || list.some((x) => normalize(x) === normalize(f))) return list
  return [...list, f]
}

/** Open (not finalizado) items per track. References (newsletters, temas) never count. */
export function trackCounts(items: StudyItem[]): Map<ID, number> {
  const m = new Map<ID, number>()
  for (const it of items) {
    if (!it.trackId || it.status === 'finalizado' || it.reference) continue
    m.set(it.trackId, (m.get(it.trackId) ?? 0) + 1)
  }
  return m
}

// ─── Study items ────────────────────────────────────────────────────────────

/**
 * Reference content (Product Talk, Lenny's, temas que ela acompanha): shown only on demand in
 * "Conteúdos salvos". Never a task, never in a queue, never "atrasado".
 */
export function isReference(item: Pick<StudyItem, 'reference' | 'kind'>): boolean {
  return !!item.reference || item.kind === 'newsletter'
}

/** Things she studies (everything that is not reference content). */
export function studyItemsOnly(items: StudyItem[]): StudyItem[] {
  return items.filter((i) => !isReference(i))
}

export interface SavedGroup {
  key: 'fontes' | 'temas' | 'links'
  label: string
  items: StudyItem[]
}

/**
 * "Conteúdos salvos": sources she follows, themes she wants to go deeper into, and other saved
 * references. Empty groups are left out. Calm order: hers (order), no dates.
 */
export function savedContent(items: StudyItem[]): SavedGroup[] {
  const refs = items.filter((i) => isReference(i) && i.status !== 'finalizado').sort(byOrder)
  const groups: SavedGroup[] = [
    { key: 'fontes', label: 'Fontes que eu acompanho', items: refs.filter((i) => i.kind === 'newsletter' || i.kind === 'podcast') },
    { key: 'temas', label: 'Temas pra aprofundar', items: refs.filter((i) => i.kind === 'tema') },
    { key: 'links', label: 'Guardados', items: refs.filter((i) => !['newsletter', 'podcast', 'tema'].includes(i.kind)) },
  ]
  return groups.filter((g) => g.items.length > 0)
}

export type StudyView = 'estudando' | 'proximo' | 'backlog' | 'finalizado'

/** Items for a list view. "Estudando" also shows paused items at the end; finalizados newest first. */
export function studyList(items: StudyItem[], view: StudyView, trackId?: ID): StudyItem[] {
  const own = studyItemsOnly(items)
  const inTrack = trackId ? own.filter((i) => i.trackId === trackId) : own
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
  return studyItemsOnly(items).filter((s) => s.status === 'proximo').sort(byOrder)[0]
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
  const pool = studyItemsOnly(items).filter((i) => i.id !== finished.id)
  const proximos = pool.filter((i) => i.status === 'proximo').sort(sameTrackFirst)
  const backlog = pool.filter((i) => i.status === 'backlog').sort(sameTrackFirst)
  return [...proximos, ...backlog].slice(0, limit)
}

/** True when nothing is lined up after finishing (no estudando, no próximo). */
export function needsSomethingNext(items: StudyItem[]): boolean {
  return !studyItemsOnly(items).some((i) => i.status === 'estudando' || i.status === 'proximo')
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
  newsletter: 'newsletter',
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

export interface Shelf {
  status: BookStatus
  label: string
  books: Book[]
}

const SHELF_LABEL: Record<BookStatus, string> = { lendo: 'Lendo', proximo: 'Próximo', quero: 'Quero ler', finalizado: 'Lidos' }

/**
 * The library: Lendo · Próximo · Quero ler · Lidos. Empty shelves are left out
 * (no "Livros — 0"). Lidos newest first; the rest in her order.
 */
export function libraryShelves(books: Book[]): Shelf[] {
  return (['lendo', 'proximo', 'quero', 'finalizado'] as BookStatus[])
    .map((status) => {
      const list =
        status === 'finalizado'
          ? books.filter((b) => b.status === 'finalizado').sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? '') || a.order - b.order)
          : booksByStatus(books, status)
      return { status, label: SHELF_LABEL[status], books: list }
    })
    .filter((s) => s.books.length > 0)
}

/**
 * Where she is in a book, in her words: chapter first, then page ("p. 190 de 320"), then a percent
 * only when there is one. Nothing invented: no data → undefined.
 */
export function readingWhere(book: Pick<Book, 'currentChapter' | 'currentPage' | 'totalPages' | 'progress'>): string | undefined {
  const parts: string[] = []
  if (book.currentChapter?.trim()) parts.push(book.currentChapter.trim())
  if (book.currentPage) parts.push(book.totalPages ? `p. ${book.currentPage} de ${book.totalPages}` : `p. ${book.currentPage}`)
  if (!parts.length && book.progress > 0) parts.push(`${clampProgress(book.progress)}%`)
  return parts.length ? parts.join(' · ') : undefined
}

/**
 * Patch from the one-tap "onde estou?" editor. Page + total pages → percent; chapter is free text.
 * Blank fields clear. A page past the total is capped; reaching the last page doesn't finish the
 * book by itself (she says "terminei").
 */
export function bookProgressPatch(input: { chapter?: string; page?: number; totalPages?: number }): Partial<Book> {
  const valid = (n?: number) => (n && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined)
  const totalPages = valid(input.totalPages)
  let page = valid(input.page)
  if (page && totalPages && page > totalPages) page = totalPages
  const patch: Partial<Book> = { currentChapter: input.chapter?.trim() || undefined, currentPage: page, totalPages }
  if (page && totalPages) patch.progress = Math.min(99, clampProgress((page / totalPages) * 100))
  return patch
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
