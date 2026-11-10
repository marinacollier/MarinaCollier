import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actions, detachStorage, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { emptyDB } from '@/data/defaults'
import type { CalendarEntry } from '@/data/calendar/universal'
import { canPostpone, postponeRow, toggleDone } from './row-actions'

const D = '2026-11-10'
const entry = (p: Partial<CalendarEntry> & { id: string; sourceType: CalendarEntry['sourceType']; sourceId: string }): CalendarEntry =>
  ({ title: 'x', startAt: { date: D, time: '09:00' }, endAt: { date: D, time: '10:00' }, timezone: 'Africa/Johannesburg', category: 'outro', status: 'confirmado', allDay: false, visibility: 'normal', open: {}, sourceLabel: '', ...p }) as CalendarEntry

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T16:00:00+02:00'))
  await hydrate(createMemoryAdapter())
  actions.replaceDB({ ...emptyDB() })
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('concluir / adiar em um toque', () => {
  it('class: "fui à aula" is a persisted occurrence; undo removes it; a class is never postponed', () => {
    const e = entry({ id: `school:trip-za:${D}`, sourceType: 'school', sourceId: 'trip-za', title: 'Aula · Bayswater' })
    const r = toggleDone({ kind: 'entry', e, date: D })
    expect(r.message).toMatch(/Aula marcada como feita/)
    expect(getDB().occurrences.some((o) => o.parentType === 'school' && o.parentId === 'trip-za' && o.date === D && o.status === 'done')).toBe(true)
    r.undo!()
    expect(getDB().occurrences.some((o) => o.parentType === 'school' && o.status === 'done')).toBe(false)
    expect(canPostpone({ kind: 'entry', e, date: D })).toBe(false)
  })
  it('a Google event can be "feito" here but is moved in Google', () => {
    actions.create('events', { id: 'g', title: 'Call', date: D, startTime: '18:30', sourceId: 'gcal-google', allDay: false, external: { provider: 'google', externalId: 'x', syncStatus: 'synced' } } as never)
    const e = entry({ id: 'event:g', sourceType: 'event', sourceId: 'g', title: 'Call' })
    toggleDone({ kind: 'entry', e, date: D })
    expect(getDB().occurrences.some((o) => o.parentType === 'event' && o.parentId === 'g' && o.status === 'done')).toBe(true)
    expect(postponeRow({ kind: 'entry', e, date: D }).message).toMatch(/Google Calendar/)
  })
  it('a booked trip activity is not moved by "Amanhã" (the supplier would not know); a task is', () => {
    actions.create('tripItems', { id: 'b', tripId: 't', section: 'reserva', title: 'Shark dive', date: D, time: '07:00', bookingStatus: 'reserva_emitida', status: 'confirmado', order: 0 } as never)
    const r = postponeRow({ kind: 'entry', e: entry({ id: 'tripItem:b', sourceType: 'tripItem', sourceId: 'b', title: 'Shark dive' }), date: D })
    expect(r.message).toMatch(/reserva/)
    expect(getDB().tripItems.find((i) => i.id === 'b')?.date).toBe(D)
    actions.create('tasks', { id: 't1', title: 'Preparar', status: 'todo', order: 0, date: D } as never)
    postponeRow({ kind: 'entry', e: entry({ id: 'task:t1', sourceType: 'task', sourceId: 't1', title: 'Preparar' }), date: D })
    expect(getDB().tasks.find((t) => t.id === 't1')?.date).toBe('2026-11-11')
  })
})
