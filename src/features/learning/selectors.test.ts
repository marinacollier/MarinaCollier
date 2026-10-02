import { describe, expect, it } from 'vitest'
import type { Book, StudyItem, StudyTrack } from '@/data/types'
import { createSeedContext, seedId } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import { seedLearning } from './seed'
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
  const byName = (name: string) => tracks.find((t) => t.name === name)!

  it('has exactly her 4 trilhas, with stable ids and statuses', () => {
    expect(tracks.map((t) => t.name)).toEqual(['Inglês', 'Pós-graduação', 'Tera', 'AI / Produto / Liderança'])
    expect(tracks.map((t) => t.status)).toEqual(['ativo', 'ativo', 'ativo', 'continuo'])
    expect(byName('Inglês').id).toBe(SEED_IDS.trackIngles)
    expect(byName('Pós-graduação').id).toBe(SEED_IDS.trackPos)
    expect(byName('Tera').id).toBe(seedId('learning', 'tera'))
    expect(tracks.every((t) => !t.archived)).toBe(true)
    // ids are stable across builds (migration safety)
    const again = seedLearning(createSeedContext(T))
    expect(again.studyTracks!.map((t) => t.id)).toEqual(tracks.map((t) => t.id))
    expect(again.studyItems!.map((t) => t.id)).toEqual(items.map((t) => t.id))
  })

  it('Inglês has her formats and a note that the calendar wins — no invented time', () => {
    const en = byName('Inglês')
    expect(en.formats).toEqual(['Cambly', 'Estudo individual', 'Conversação', 'Vocabulário', 'Leitura', 'Listening'])
    expect(en.notes).toMatch(/calendário conectado prevalece/)
    expect(en.notes).not.toMatch(/\d{1,2}[:h]\d{0,2}/)
  })

  it('study items: only placeholders the brief implies, all pointing to existing trilhas', () => {
    const ids = new Set(tracks.map((t) => t.id))
    expect(items.every((i) => i.trackId && ids.has(i.trackId))).toBe(true)
    expect(items.every((i) => i.id.startsWith('seed:learning:'))).toBe(true)
    expect(studyList(items, 'estudando').map((i) => i.title)).toEqual(['Cambly / conversação', 'Pós-graduação — disciplina atual', 'Tera — trilha atual'])
    expect(items.find((i) => i.title.startsWith('Cambly'))!.nextContent).toBeUndefined()
    expect(items.find((i) => i.title.startsWith('Pós'))!.nextContent).toBe('definir próximo conteúdo')
    const backlog = studyList(items, 'backlog')
    expect(backlog.every((i) => i.kind === 'tema' && i.trackId === byName('AI / Produto / Liderança').id)).toBe(true)
    // no invented progress, no "próximo" pretending she already chose
    expect(items.every((i) => i.progress === 0 && !i.finishedAt && !i.link && !i.source)).toBe(true)
    expect(nextStudyOf(items)).toBeUndefined()
    // none of the old generic examples
    const titles = items.map((i) => i.title).join(' | ')
    expect(titles).not.toMatch(/Fundamentos de agentes|Discovery contínuo|Feedback e 1:1s|Conversação semanal/)
  })

  it('library starts empty — no invented books', () => {
    expect(data.books).toEqual([])
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
