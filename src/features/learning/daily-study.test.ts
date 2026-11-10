import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import type { DB } from '@/data/types'
import { DAILY_STUDY_ROUTINE, dailyStudy } from './hub'

const item = (id: string, title: string, order: number, recurrence: object = { kind: 'daily' }) => ({ id: `marina:estudos:${id}`, routineId: DAILY_STUDY_ROUTINE, title, order, active: true, recurrence, durationMin: 30, createdAt: '', updatedAt: '' })
function db(): DB {
  const d = emptyDB()
  d.routines = [{ id: DAILY_STUDY_ROUTINE, name: 'Estudos do dia', period: 'dia', order: 2, active: true, createdAt: '', updatedAt: '' }] as never
  d.routineItems = [
    item('ingles', 'Inglês', 0),
    item('ia-produto', 'IA e Produto', 1),
    item('faculdade', 'Faculdade / Pós', 2),
    item('carreira', 'Carreira e mercado', 3),
    item('newsletter-semanal', 'Newsletter semanal', 5, { kind: 'weekly', weekdays: [1] }),
  ] as never
  return d
}

describe('estudos do dia', () => {
  it('her order; the next is the first still open; weekly newsletter only on its day', () => {
    const d = db()
    const tue = dailyStudy(d, '2026-11-10')!
    expect(tue.lines.map((l) => l.title)).toEqual(['Inglês', 'IA e Produto', 'Faculdade / Pós', 'Carreira e mercado'])
    expect(tue.next?.title).toBe('Inglês')
    expect(dailyStudy(d, '2026-11-16')!.lines).toHaveLength(5)
    d.occurrences = [{ id: 'o', parentType: 'routineItem', parentId: 'marina:estudos:ingles', date: '2026-11-10', status: 'done', createdAt: '', updatedAt: '' }] as never
    const after = dailyStudy(d, '2026-11-10')!
    expect(after.next?.title).toBe('IA e Produto')
    expect(after.done).toBe(1)
    expect(after.lines[0].to).toBe('/estudos/aprendizagem?v=ingles')
  })
})
