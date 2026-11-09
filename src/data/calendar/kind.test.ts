import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import type { CalendarEvent, Task, TripItem } from '@/data/types'
import { calendarEntries } from './universal'
import { eventKind, kindOfEntry, taskKind, tripItemKind } from './kind'

const item = (p: Partial<TripItem>): TripItem =>
  ({ id: 'ti', tripId: 't', section: 'roteiro', title: 'Item', status: 'a_confirmar', order: 0, createdAt: '', updatedAt: '', ...p }) as TripItem

describe('tipo (kind) derivation', () => {
  it('a meeting trip item is a reunião (title words or a volunteer conversation)', () => {
    expect(tripItemKind(item({ title: 'Conversa com Hillary' }))).toBe('reuniao')
    expect(tripItemKind(item({ title: 'Reunião com a ONG' }))).toBe('reuniao')
    expect(tripItemKind(item({ title: 'Hillary', checklistKind: 'voluntariado' }))).toBe('reuniao')
    expect(tripItemKind(item({ title: 'Call com a escola' }))).toBe('reuniao')
  })

  it('flights, stays, transfers and paid tours are reservas', () => {
    expect(tripItemKind(item({ section: 'voo', title: 'GRU → CPT' }))).toBe('reserva')
    expect(tripItemKind(item({ section: 'hospedagem', title: 'Airbnb Sea Point' }))).toBe('reserva')
    expect(tripItemKind(item({ section: 'transporte', title: 'Transfer aeroporto' }))).toBe('reserva')
    expect(tripItemKind(item({ section: 'roteiro', title: 'Caiaque com focas' }))).toBe('reserva')
    expect(tripItemKind(item({ section: 'esporte', title: 'Surf lesson', supplier: 'Surf Shack' }))).toBe('reserva')
  })

  it('her own sport is treino; packing and errands are tarefas; absence is aula', () => {
    expect(tripItemKind(item({ section: 'esporte', title: 'Corrida na orla' }))).toBe('treino')
    expect(tripItemKind(item({ section: 'mala', title: 'Adaptador de tomada' }))).toBe('tarefa')
    expect(tripItemKind(item({ id: 'school-absence:t:2026-11-06', group: 'Escola', title: 'Falta na escola', schoolImpact: 'dia' }))).toBe('aula')
  })

  it('her explicit tipo always wins', () => {
    expect(tripItemKind(item({ section: 'voo', title: 'Voo', entryKind: 'tarefa' }))).toBe('tarefa')
    expect(tripItemKind(item({ title: 'Conversa com Hillary', entryKind: 'estudo' }))).toBe('estudo')
    expect(eventKind({ title: 'Reunião de time', entryKind: 'pessoal' } as CalendarEvent)).toBe('pessoal')
    expect(taskKind({ title: 'Call com cliente', entryKind: 'trabalho' } as Task)).toBe('trabalho')
  })

  it('events and tasks', () => {
    expect(eventKind({ title: 'Weekly com o time', kind: 'trabalho' } as CalendarEvent)).toBe('trabalho')
    expect(eventKind({ title: 'Missa', kind: 'pessoal' } as CalendarEvent)).toBe('espiritualidade')
    expect(eventKind({ title: 'Natação', kind: 'treino' } as CalendarEvent)).toBe('treino')
    expect(eventKind({ title: 'Aula de cerâmica', kind: 'criatividade' } as CalendarEvent)).toBe('aula')
    expect(taskKind({ title: 'Pagar boleto' } as Task)).toBe('tarefa')
    expect(taskKind({ title: 'Roteiro do vídeo', brandId: 'b1' } as Task)).toBe('ugc')
  })

  it('calendar entries: class → aula, workout → treino, task → tarefa', () => {
    const db = buildSeed('2026-11-09')
    const entries = calendarEntries(db, '2026-11-02', '2026-11-15', { today: '2026-11-09' })
    const of = (t: string) => entries.filter((e) => e.sourceType === t).map((e) => kindOfEntry(db, e))
    const school = of('school')
    if (school.length) expect(new Set(school)).toEqual(new Set(['aula']))
    const workouts = of('workout')
    expect(workouts.length).toBeGreaterThan(0)
    expect(new Set(workouts)).toEqual(new Set(['treino']))
    const task = { ...db.tasks[0], title: 'Comprar ração', entryKind: undefined, brandId: undefined, contentItemId: undefined, partnershipId: undefined, context: undefined, area: undefined, tags: undefined }
    const e = { ...entries[0], sourceType: 'task' as const, sourceId: task.id }
    expect(kindOfEntry({ ...db, tasks: [task] }, e)).toBe('tarefa')
  })
})

describe('eventKind · link de videochamada', () => {
  it('evento com link do Meet é reunião, mesmo com título "Tutorial"', () => {
    expect(eventKind({ title: 'Fashion Finder — Tutorial', kind: 'trabalho', url: 'https://meet.google.com/hzk-uvih-qtk' })).toBe('reuniao')
  })
})
