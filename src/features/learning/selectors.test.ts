import { describe, expect, it } from 'vitest'
import type { Book, StudyItem, StudyTrack } from '@/data/types'
import { createSeedContext, seedId } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import { LEARNING_SEED_IDS, seedLearning } from './seed'
import {
  TRACK_STATUS_LABEL,
  addFormat,
  bookStatusPatch,
  formatQuickCreate,
  kindForFormat,
  nextTrackStatus,
  trackStatus,
  tracksForDisplay,
  coverTone,
  coverVariant,
  finishStudyPatch,
  finishedByYear,
  hashString,
  isUrl,
  mergeSubsetOrder,
  needsSomethingNext,
  nextStudyOf,
  parseCapture,
  promoteToNextPatch,
  promotionCandidates,
  startStudyPatch,
  studyList,
  trackCounts,
  bookProgressPatch,
  isReference,
  libraryShelves,
  readingWhere,
  savedContent,
} from './selectors'

const T = '2026-10-02'
let n = 0
function study(p: Partial<StudyItem>): StudyItem {
  n++
  return { id: `s${n}`, createdAt: '', updatedAt: `2026-01-${String(n).padStart(2, '0')}`, title: `Item ${n}`, kind: 'tema', status: 'backlog', progress: 0, order: n, ...p }
}
function book(p: Partial<Book>): Book {
  n++
  return { id: `b${n}`, createdAt: '', updatedAt: '', title: `Livro ${n}`, status: 'quero', progress: 0, quotes: [], order: n, ...p }
}
const apply = <X,>(x: X, patch: Partial<X>): X => ({ ...x, ...patch })

describe('study: next study + promotion', () => {
  it('nextStudy is the próximo with the lowest order', () => {
    const items = [study({ status: 'proximo', order: 5, id: 'a' }), study({ status: 'proximo', order: 2, id: 'b' }), study({ status: 'backlog', order: 0 })]
    expect(nextStudyOf(items)?.id).toBe('b')
  })

  it('promoting a backlog item makes it THE next study', () => {
    const items = [study({ status: 'proximo', order: 0, id: 'p' }), study({ status: 'backlog', order: 3, id: 'k' })]
    const promoted = items.map((i) => (i.id === 'k' ? apply(i, promoteToNextPatch(items)) : i))
    expect(nextStudyOf(promoted)?.id).toBe('k')
    expect(promoted.find((i) => i.id === 'k')?.status).toBe('proximo')
  })

  it('promoting with an empty queue still works', () => {
    const items = [study({ status: 'backlog', id: 'x' })]
    const promoted = items.map((i) => apply(i, promoteToNextPatch(items)))
    expect(nextStudyOf(promoted)?.id).toBe('x')
  })

  it('start moves to estudando and resets progress only when restarting a finished item', () => {
    expect(startStudyPatch(study({ status: 'proximo', progress: 20 }))).toMatchObject({ status: 'estudando', progress: 20 })
    expect(startStudyPatch(study({ status: 'finalizado', progress: 100, finishedAt: T }))).toMatchObject({ status: 'estudando', progress: 0, finishedAt: undefined })
  })
})

describe('study: finish flow', () => {
  it('finish sets finalizado, 100% and finishedAt today', () => {
    expect(finishStudyPatch(T)).toEqual({ status: 'finalizado', progress: 100, finishedAt: T })
  })

  it('candidates after finishing: próximos first, then backlog, same trilha floats up, never the finished one', () => {
    const done = study({ id: 'done', status: 'finalizado', trackId: 'ia' })
    const items = [
      done,
      study({ id: 'b-other', status: 'backlog', trackId: 'eng', order: 0 }),
      study({ id: 'b-same', status: 'backlog', trackId: 'ia', order: 9 }),
      study({ id: 'p-other', status: 'proximo', trackId: 'eng', order: 0 }),
      study({ id: 'p-same', status: 'proximo', trackId: 'ia', order: 4 }),
      study({ id: 'est', status: 'estudando' }),
    ]
    expect(promotionCandidates(items, done).map((i) => i.id)).toEqual(['p-same', 'p-other', 'b-same', 'b-other'])
  })

  it('knows when nothing is lined up', () => {
    expect(needsSomethingNext([study({ status: 'backlog' }), study({ status: 'finalizado' })])).toBe(true)
    expect(needsSomethingNext([study({ status: 'proximo' })])).toBe(false)
  })

  it('finalizados list is newest first; estudando list puts paused at the end', () => {
    const items = [study({ id: 'old', status: 'finalizado', finishedAt: '2026-01-01' }), study({ id: 'new', status: 'finalizado', finishedAt: '2026-09-01' })]
    expect(studyList(items, 'finalizado').map((i) => i.id)).toEqual(['new', 'old'])
    const s = [study({ id: 'p', status: 'pausado', order: 0 }), study({ id: 'e', status: 'estudando', order: 5 })]
    expect(studyList(s, 'estudando').map((i) => i.id)).toEqual(['e', 'p'])
  })

  it('track filter and counts ignore finished items', () => {
    const items = [study({ trackId: 'a' }), study({ trackId: 'a', status: 'finalizado' }), study({ trackId: 'b', status: 'proximo' })]
    expect(trackCounts(items).get('a')).toBe(1)
    expect(studyList(items, 'proximo', 'a')).toEqual([])
  })

  it('reordering a filtered subset keeps the other items in place', () => {
    expect(mergeSubsetOrder(['a', 'x', 'b', 'y', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'x', 'a', 'y', 'b'])
  })
})

describe('backlog quick capture', () => {
  it('a URL becomes link + hostname title', () => {
    expect(parseCapture('https://www.coursera.org/learn/ai-agents')).toMatchObject({ title: 'coursera.org', link: 'https://www.coursera.org/learn/ai-agents', kind: 'curso' })
    expect(parseCapture('youtu.be/abc123')).toMatchObject({ title: 'youtu.be', link: 'https://youtu.be/abc123', kind: 'video' })
  })
  it('plain text stays a title', () => {
    expect(parseCapture('  certificação AWS  ')).toEqual({ title: 'certificação AWS', kind: 'tema' })
    expect(isUrl('ler sobre RAG')).toBe(false)
  })
})

describe('books: status transitions', () => {
  it('comecei sets startDate today and keeps an existing one', () => {
    expect(bookStatusPatch(book({ status: 'proximo' }), 'lendo', T)).toMatchObject({ status: 'lendo', startDate: T })
    expect(bookStatusPatch(book({ status: 'quero', startDate: '2026-05-01' }), 'lendo', T).startDate).toBe('2026-05-01')
  })
  it('terminei sets endDate, progress 100 and fills startDate', () => {
    expect(bookStatusPatch(book({ status: 'lendo', startDate: '2026-09-01', progress: 40 }), 'finalizado', T)).toMatchObject({ status: 'finalizado', endDate: T, progress: 100, startDate: '2026-09-01' })
    expect(bookStatusPatch(book({ status: 'quero' }), 'finalizado', T).startDate).toBe(T)
  })
  it('re-reading a finished book starts fresh', () => {
    const p = bookStatusPatch(book({ status: 'finalizado', startDate: '2025-01-01', endDate: '2025-02-01', progress: 100 }), 'lendo', T)
    expect(p).toMatchObject({ startDate: T, endDate: undefined, progress: 0 })
  })
  it('moving to a list appends at the end of it', () => {
    const shelf = [book({ status: 'quero', order: 7 }), book({ status: 'quero', order: 2 })]
    const b = book({ status: 'proximo' })
    expect(bookStatusPatch(b, 'quero', T, [...shelf, b]).order).toBe(8)
  })
  it('finished books are grouped by year, newest first', () => {
    const books = [
      book({ status: 'finalizado', endDate: '2025-03-01', id: 'x' }),
      book({ status: 'finalizado', endDate: '2026-02-01', id: 'y' }),
      book({ status: 'finalizado', endDate: '2026-08-01', id: 'z' }),
      book({ status: 'finalizado', id: 'nodate' }),
    ]
    const g = finishedByYear(books)
    expect(g.map((x) => x.year)).toEqual(['2026', '2025', 'sem data'])
    expect(g[0].books.map((b) => b.id)).toEqual(['z', 'y'])
  })
})

describe('typographic covers', () => {
  it('tone hash is stable and accent/case-insensitive', () => {
    expect(hashString('born to run')).toBe(hashString('born to run'))
    expect(coverTone('Born to Run')).toBe(coverTone('  born to run '))
    expect(coverTone('Inspiração')).toBe(coverTone('inspiracao'))
    expect(coverVariant('Inspired')).toBe(coverVariant('INSPIRED'))
  })
  it('known value guards against accidental hash changes', () => {
    expect(hashString('')).toBe(0x811c9dc5)
    expect(hashString('a')).toBe(0xe40c292c)
  })
  it('different titles spread across tones', () => {
    const titles = ['Born to Run', 'Inspired', 'Continuous Discovery Habits', 'Atomic Habits', 'Torto Arado', 'Sapiens', 'Range', 'Empowered', 'Deep Work', 'Essencialismo']
    expect(new Set(titles.map(coverTone)).size).toBeGreaterThanOrEqual(3)
  })
})

describe('seed — real life (Learning OS)', () => {
  const data = seedLearning(createSeedContext(T))
  const tracks = data.studyTracks!
  const items = data.studyItems!
  const books = data.books!
  const byName = (name: string) => tracks.find((t) => t.name === name)!

  it('has her trilhas with real objectives, stable ids and statuses', () => {
    expect(tracks.map((t) => t.name)).toEqual(['Inglês', 'Pós-graduação', 'Produto', 'Tera'])
    expect(tracks.every((t) => t.status === 'ativo' && !t.archived)).toBe(true)
    expect(byName('Inglês').id).toBe(SEED_IDS.trackIngles)
    expect(byName('Pós-graduação').id).toBe(SEED_IDS.trackPos)
    expect(byName('Produto').id).toBe(SEED_IDS.trackProduto)
    expect(byName('Tera').id).toBe(seedId('learning', 'tera'))
    // ids are stable across builds (migration safety)
    const again = seedLearning(createSeedContext(T))
    expect(again.studyTracks!.map((t) => t.id)).toEqual(tracks.map((t) => t.id))
    expect(again.studyItems!.map((t) => t.id)).toEqual(items.map((t) => t.id))
    expect(again.books!.map((b) => b.id)).toEqual(books.map((b) => b.id))
  })

  it('Inglês: her formats and her objective — no invented time', () => {
    const en = byName('Inglês')
    expect(en.formats).toEqual(['Cambly', 'Estudo individual', 'Conversação', 'Vocabulário', 'Leitura', 'Listening'])
    expect(en.notes).toMatch(/conversação, pronúncia, vocabulário prático, fluência e confiança/)
    expect(en.notes).not.toMatch(/\d{1,2}[:h]\d{0,2}/)
  })

  it('no generic study items — only Cambly in progress, the rest is reference', () => {
    expect(items.every((i) => i.id.startsWith('seed:learning:'))).toBe(true)
    const titles = items.map((i) => i.title).join(' | ')
    expect(titles).not.toMatch(/Curso \d|exemplo|Temas de IA para aprofundar|Liderança — o que quero|disciplina atual|trilha atual/i)
    expect(studyList(items, 'estudando').map((i) => i.title)).toEqual(['Cambly / conversação'])
    expect(items.every((i) => i.progress === 0 && !i.finishedAt)).toBe(true)
    expect(nextStudyOf(items)).toBeUndefined()
    const trackIds = new Set(tracks.map((t) => t.id))
    expect(items.every((i) => !i.trackId || trackIds.has(i.trackId))).toBe(true)
  })

  it('newsletters and interests are references: never in a queue, never a task, no dates', () => {
    const refs = items.filter(isReference)
    expect(refs.map((r) => r.title)).toEqual([
      'Product Talk',
      "Lenny's Newsletter",
      'The Pragmatic Engineer',
      'AI-assisted software engineering',
      'Claude',
      'IA aplicada a Produto',
    ])
    expect(refs.every((r) => r.reference === true && !r.finishedAt && !r.nextContent)).toBe(true)
    expect(refs.filter((r) => r.kind === 'newsletter').every((r) => r.link?.startsWith('https://'))).toBe(true)
    // none leaks into the study lists
    for (const v of ['estudando', 'proximo', 'backlog', 'finalizado'] as const) expect(studyList(items, v).some(isReference)).toBe(false)
    expect(trackCounts(items).get(SEED_IDS.trackProduto)).toBeUndefined()
    const groups = savedContent(items)
    expect(groups.map((g) => g.key)).toEqual(['fontes', 'temas'])
    expect(groups[0].items.map((i) => i.title)).toEqual(['Product Talk', "Lenny's Newsletter", 'The Pragmatic Engineer'])
  })

  it('library: Continuous Discovery Habits being read, at chapter 10 — nothing else invented', () => {
    expect(books).toHaveLength(1)
    const cdh = books[0]
    expect(cdh).toMatchObject({
      id: LEARNING_SEED_IDS.bookCDH,
      title: 'Continuous Discovery Habits',
      author: 'Teresa Torres',
      status: 'lendo',
      currentChapter: 'Chapter 10 — Testing Assumptions',
      progress: 0,
    })
    expect(cdh.startDate).toBeUndefined()
    expect(books.some((b) => /inspired/i.test(b.title))).toBe(false)
    expect(libraryShelves(books).map((s) => s.label)).toEqual(['Lendo'])
    expect(readingWhere(cdh)).toBe('Chapter 10 — Testing Assumptions')
  })
})

describe('library shelves', () => {
  const mk = (id: string, status: Book['status'], extra: Partial<Book> = {}): Book => ({
    id,
    title: id,
    status,
    progress: 0,
    quotes: [],
    order: 0,
    createdAt: '',
    updatedAt: '',
    ...extra,
  })

  it('empty shelves are not rendered; order Lendo · Próximo · Quero ler · Lidos', () => {
    expect(libraryShelves([])).toEqual([])
    const shelves = libraryShelves([mk('a', 'quero'), mk('b', 'finalizado', { endDate: '2026-01-02' }), mk('c', 'finalizado', { endDate: '2026-09-01' })])
    expect(shelves.map((s) => s.label)).toEqual(['Quero ler', 'Lidos'])
    expect(shelves[1].books.map((b) => b.id)).toEqual(['c', 'b'])
    expect(libraryShelves([mk('x', 'proximo'), mk('y', 'lendo')]).map((s) => s.status)).toEqual(['lendo', 'proximo'])
  })

  it('readingWhere: chapter, page, then percent only when there is one', () => {
    expect(readingWhere(mk('a', 'lendo'))).toBeUndefined()
    expect(readingWhere(mk('a', 'lendo', { progress: 40 }))).toBe('40%')
    expect(readingWhere(mk('a', 'lendo', { currentPage: 190 }))).toBe('p. 190')
    expect(readingWhere(mk('a', 'lendo', { currentChapter: 'Cap. 3', currentPage: 190, totalPages: 320, progress: 59 }))).toBe('Cap. 3 · p. 190 de 320')
  })

  it('bookProgressPatch: page of total → percent (never 100 by itself); blanks clear', () => {
    expect(bookProgressPatch({ chapter: ' Cap. 4 ', page: 190, totalPages: 320 })).toEqual({ currentChapter: 'Cap. 4', currentPage: 190, totalPages: 320, progress: 59 })
    expect(bookProgressPatch({ page: 400, totalPages: 320 })).toMatchObject({ currentPage: 320, progress: 99 })
    const onlyPage = bookProgressPatch({ page: 12 })
    expect(onlyPage).toEqual({ currentChapter: undefined, currentPage: 12, totalPages: undefined })
    expect('progress' in onlyPage).toBe(false)
    expect(bookProgressPatch({ chapter: '', page: 0 })).toEqual({ currentChapter: undefined, currentPage: undefined, totalPages: undefined })
  })
})

describe('trilhas: status + formats', () => {
  const track = (p: Partial<StudyTrack>): StudyTrack => ({ id: 't', createdAt: '', updatedAt: '', name: 'T', emoji: '📚', tone: 'sage', order: 0, archived: false, ...p })

  it('status defaults to ativo and cycles ativo → contínuo → pausado → ativo', () => {
    expect(trackStatus(track({}))).toBe('ativo')
    expect(nextTrackStatus(track({}))).toBe('continuo')
    expect(nextTrackStatus(track({ status: 'continuo' }))).toBe('pausado')
    expect(nextTrackStatus(track({ status: 'pausado' }))).toBe('ativo')
    expect(TRACK_STATUS_LABEL.continuo).toBe('contínuo')
  })

  it('applying a status edit keeps everything else', () => {
    const t = track({ status: 'ativo', formats: ['Cambly'], notes: 'n' })
    const edited = apply(t, { status: nextTrackStatus(t) })
    expect(edited).toMatchObject({ status: 'continuo', formats: ['Cambly'], notes: 'n' })
  })

  it('paused trilhas sink to the end, archived ones disappear', () => {
    const list = [
      track({ id: 'a', order: 0, status: 'pausado' }),
      track({ id: 'b', order: 1 }),
      track({ id: 'c', order: 2, status: 'continuo' }),
      track({ id: 'd', order: 3, archived: true }),
    ]
    expect(tracksForDisplay(list).map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('kindForFormat guesses with generic keywords', () => {
    expect(kindForFormat('Cambly')).toBe('aula')
    expect(kindForFormat('Conversação')).toBe('aula')
    expect(kindForFormat('Listening')).toBe('podcast')
    expect(kindForFormat('Vocabulário')).toBe('tema')
    expect(kindForFormat('Vídeo aula')).toBe('video')
    expect(kindForFormat('Leitura')).toBe('outro')
  })

  it('formats quick-create: new item straight into estudando, at the end of the list', () => {
    const t = track({ id: 'en' })
    const items = [study({ status: 'estudando', order: 4, trackId: 'other' })]
    const res = formatQuickCreate(t, 'Listening', items)
    expect(res).toEqual({ type: 'create', data: { title: 'Listening', kind: 'podcast', trackId: 'en', status: 'estudando', progress: 0, order: 5 } })
  })

  it('formats quick-create: reuses an open item of the same format instead of duplicating', () => {
    const t = track({ id: 'en' })
    const cambly = study({ title: 'Cambly / conversação', trackId: 'en', status: 'estudando' })
    expect(formatQuickCreate(t, 'Cambly', [cambly])).toEqual({ type: 'existing', item: cambly })
    expect(formatQuickCreate(t, 'conversacao', [cambly])).toEqual({ type: 'existing', item: cambly })
    // finished or other trilha → create again
    expect(formatQuickCreate(t, 'Cambly', [{ ...cambly, status: 'finalizado' }]).type).toBe('create')
    expect(formatQuickCreate(t, 'Cambly', [{ ...cambly, trackId: 'x' }]).type).toBe('create')
    // hyphenated words are not split
    expect(formatQuickCreate(t, 'Pós', [study({ title: 'Pós-graduação', trackId: 'en' })]).type).toBe('create')
  })

  it('works on the real seed: tapping Cambly opens the seeded item', () => {
    const data = seedLearning(createSeedContext(T))
    const en = data.studyTracks!.find((x) => x.id === SEED_IDS.trackIngles)!
    const res = formatQuickCreate(en, 'Cambly', data.studyItems!)
    expect(res.type).toBe('existing')
    expect(formatQuickCreate(en, 'Vocabulário', data.studyItems!).type).toBe('create')
  })

  it('addFormat ignores blanks and accent/case duplicates', () => {
    expect(addFormat(undefined, ' Aula ')).toEqual(['Aula'])
    const list = ['Vocabulário']
    expect(addFormat(list, 'vocabulario')).toBe(list)
    expect(addFormat(list, '  ')).toBe(list)
    expect(addFormat(list, 'Podcast')).toEqual(['Vocabulário', 'Podcast'])
  })
})
