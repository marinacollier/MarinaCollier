import { describe, expect, it } from 'vitest'
import type { Book, StudyItem } from '@/data/types'
import { createSeedContext } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import { seedLearning } from './seed'
import {
  bookStatusPatch,
  booksByStatus,
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

describe('seed', () => {
  const data = seedLearning(createSeedContext(T))
  it('has the 7 trilhas with stable ids', () => {
    expect(data.studyTracks?.map((t) => t.id)).toEqual([
      SEED_IDS.trackIngles,
      SEED_IDS.trackPos,
      SEED_IDS.trackProduto,
      SEED_IDS.trackIA,
      SEED_IDS.trackTecnologia,
      SEED_IDS.trackLideranca,
      SEED_IDS.trackCursos,
    ])
  })
  it('items point to existing trilhas and there is a next study', () => {
    const ids = new Set(data.studyTracks!.map((t) => t.id))
    expect(data.studyItems!.every((i) => !i.trackId || ids.has(i.trackId))).toBe(true)
    expect(nextStudyOf(data.studyItems!)?.title).toBe('Fundamentos de agentes de IA')
  })
  it('does not claim she is reading anything', () => {
    expect(booksByStatus(data.books!, 'lendo')).toEqual([])
    expect(booksByStatus(data.books!, 'proximo').map((b) => b.title)).toEqual(['Born to Run'])
    expect(data.books!.every((b) => b.progress === 0 && !b.rating && !b.startDate)).toBe(true)
  })
})
