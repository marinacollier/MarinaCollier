import { describe, expect, it } from 'vitest'
import { emptyDB } from '../defaults'
import type { DB } from '../types'
import { calendarEntries } from './universal'

const T = (id: string, weekday: number, time: string) => ({ createdAt: '', updatedAt: '', id, weekday, modalities: ['corrida'], choice: 'fixed' as const, time, planType: 'base' as const, order: 0, active: true, title: 'Corrida' }) as never

function trip(): DB {
  const db = emptyDB()
  db.trips = [{ id: 'za', name: 'África do Sul', startDate: '2026-11-01', endDate: '2026-11-16', status: 'em_andamento', createdAt: '', updatedAt: '' } as never]
  db.weekTemplate = [T('ter', 2, '07:30'), T('sex', 5, '07:30')]
  return db
}

describe('modo viagem · treino da semana modelo como sugestão', () => {
  it('terça sem treino próprio mostra a corrida como sugestão leve; dia de voo não', () => {
    const db = trip()
    db.tripItems = [{ id: 'v', tripId: 'za', section: 'voo', title: 'Voo SA366', date: '2026-11-13', time: '19:35', order: 0, status: 'confirmado' } as never]
    const list = calendarEntries(db, '2026-11-10', '2026-11-13', { today: '2026-11-09' }).filter((e) => e.sourceType === 'workout')
    expect(list.map((e) => [e.startAt.date, e.title, e.light])).toEqual([['2026-11-10', 'Corrida', true]])
    expect(list[0].sourceLabel).toContain('Sugestão')
  })
  it('um treino real no dia ganha da sugestão', () => {
    const db = trip()
    db.workouts = [{ createdAt: '', updatedAt: '', id: 'r', date: '2026-11-10', modality: 'natacao', status: 'planejado', order: 0, title: 'Natação' }]
    const list = calendarEntries(db, '2026-11-10', '2026-11-10', { today: '2026-11-09' }).filter((e) => e.sourceType === 'workout')
    expect(list.map((e) => e.title)).toEqual(['Natação'])
  })
  it('nunca sugere corrida no dia antes/depois de uma corrida real do plano (joelho)', () => {
    const db = trip()
    db.workouts = [{ createdAt: '', updatedAt: '', id: 'qua', date: '2026-11-11', modality: 'corrida', status: 'planejado', order: 0, title: 'Corrida leve' }]
    const list = calendarEntries(db, '2026-11-10', '2026-11-11', { today: '2026-11-09' }).filter((e) => e.sourceType === 'workout')
    expect(list.map((e) => [e.startAt.date, e.title])).toEqual([['2026-11-11', 'Corrida leve']])
  })
})
