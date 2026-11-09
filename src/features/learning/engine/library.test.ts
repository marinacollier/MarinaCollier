import { describe, expect, it } from 'vitest'
import type { StudyItem } from '@/data/types'
import { libraryDistribution, libraryMarks, libraryStatusOf, markLibraryPatch } from './library'

const AT = '2026-11-09T10:00:00.000Z'
const item = (p: Partial<StudyItem> = {}): StudyItem => ({ id: 'i', createdAt: AT, updatedAt: AT, title: 'Podcast X', kind: 'podcast', status: 'backlog', progress: 0, order: 0, ...p })

describe('library statuses are distinct', () => {
  it('finishing is not learning: concluí, anotei, pratiquei, apliquei are separate marks', () => {
    let i = item()
    expect(libraryStatusOf(i)).toBe('quero_conhecer')
    i = { ...i, ...markLibraryPatch(i, 'comecei', '2026-11-01') }
    expect(i.status).toBe('estudando')
    i = { ...i, ...markLibraryPatch(i, 'conclui', '2026-11-05') }
    expect(i.status).toBe('finalizado')
    expect(libraryMarks(i).has('apliquei')).toBe(false)
    i = { ...i, ...markLibraryPatch(i, 'apliquei', '2026-11-08') }
    const marks = libraryMarks(i)
    expect(marks.has('conclui')).toBe(true)
    expect(marks.has('apliquei')).toBe(true)
    expect(marks.has('anotei')).toBe(false)
    expect(i.status).toBe('finalizado') // applying never touches the study status
  })

  it('marking "apliquei" alone never marks "concluí"', () => {
    const i = { ...item({ status: 'estudando' }), ...markLibraryPatch(item({ status: 'estudando' }), 'apliquei', '2026-11-09') }
    expect(libraryMarks(i).has('conclui')).toBe(false)
    expect(i.status).toBe('estudando')
  })

  it('distribution counts an item in every status it reached; books map without "aprendi"', () => {
    const a = { ...item({ id: 'a' }), libraryLog: [{ status: 'conclui' as const, date: '2026-11-01' }, { status: 'apliquei' as const, date: '2026-11-02' }], libraryStatus: 'apliquei' as const }
    const d = libraryDistribution([a, item({ id: 'b' })], [{ status: 'finalizado' }, { status: 'lendo' }])
    expect(d).toMatchObject({ conclui: 2, apliquei: 1, quero_conhecer: 1, comecei: 1, anotei: 0 })
  })
})
