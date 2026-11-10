import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actions, detachStorage, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { emptyDB } from '@/data/defaults'
import { calendarEntries } from '@/data/calendar/universal'
import type { Trip } from '@/data/types'
import { GCAL_SOURCE_ID, mapPayload, planAdoption, syncGoogleCalendar, wallTime, type McpLike, type NcPayload } from './notion-calendar'

const TRIP: Trip = { id: 'za', name: 'Viagem', startDate: '2026-11-01', endDate: '2026-11-16', status: 'em_andamento', createdAt: '', updatedAt: '', expedition: { timeZone: 'Africa/Johannesburg' } } as unknown as Trip

const ev = (id: string, start: string, end: string, p: Record<string, unknown> = {}) => ({
  eventId: id,
  summary: `Evento ${id}`,
  period: { type: 'DATE_TIME', start: { dateTime: start, timeZone: 'Africa/Johannesburg' }, end: { dateTime: end, timeZone: 'Africa/Johannesburg' } },
  eventStatus: 'confirmed',
  ...p,
})
const payload = (events: unknown[]): NcPayload => ({ accounts: [{ providerName: 'google', calendars: [{ calendarId: 'me', events: events as never }] }] })
const mcpOf = (p: () => NcPayload): McpLike & { calls: unknown[] } => {
  const calls: unknown[] = []
  return { calls, callTool: async (_s, _t, input) => (calls.push(input), { payload: p() }) }
}
const synced = () => getDB().events.filter((e) => e.sourceId === GCAL_SOURCE_ID)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T08:00:00+02:00'))
  await hydrate(createMemoryAdapter())
  actions.replaceDB({ ...emptyDB(), trips: [TRIP] })
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('fusos horários', () => {
  it('wall time of one instant in different zones', () => {
    const i = new Date('2026-11-11T18:30:00.000+02:00')
    expect(wallTime(i, 'Africa/Johannesburg')).toEqual({ date: '2026-11-11', time: '18:30' })
    expect(wallTime(i, 'America/Sao_Paulo')).toEqual({ date: '2026-11-11', time: '13:30' })
    expect(wallTime(new Date('2026-11-11T23:30:00.000-03:00'), 'Africa/Johannesburg')).toEqual({ date: '2026-11-12', time: '04:30' })
  })
  it('during the trip an event is stored in the trip zone; after it, in home time', () => {
    const db = getDB()
    const [a, b] = mapPayload(payload([ev('a', '2026-11-11T18:30:00.000+02:00', '2026-11-11T19:00:00.000+02:00'), ev('b', '2026-12-01T10:00:00.000-03:00', '2026-12-01T11:00:00.000-03:00')]), db)
    expect(a).toMatchObject({ date: '2026-11-11', startTime: '18:30', endTime: '19:00', timeZone: 'Africa/Johannesburg' })
    expect(b).toMatchObject({ date: '2026-12-01', startTime: '10:00', endTime: '11:00', timeZone: 'America/Sao_Paulo' })
  })
  it('all-day events use the exclusive end of Google correctly', () => {
    const [d] = mapPayload(payload([{ eventId: 'd', summary: 'Feriado', period: { type: 'DATE', start: { date: '2026-11-15' }, end: { date: '2026-11-16' } } }]), getDB())
    expect(d).toMatchObject({ date: '2026-11-15', allDay: true, endDate: undefined })
  })
})

describe('sincronização com o Google como fonte de verdade', () => {
  it('creates, then a time change at the origin updates the SAME record (no duplicate), and the views show it', async () => {
    let p = payload([ev('h', '2026-11-11T17:00:00.000+02:00', '2026-11-11T18:00:00.000+02:00', { summary: 'Call with Hillary' })])
    const mcp = mcpOf(() => p)
    await syncGoogleCalendar(mcp, '2026-11-10')
    expect(synced()).toHaveLength(1)
    p = payload([ev('h', '2026-11-11T18:30:00.000+02:00', '2026-11-11T19:00:00.000+02:00', { summary: 'Call with Hillary' })])
    const r = await syncGoogleCalendar(mcp, '2026-11-10')
    expect(r.report).toMatchObject({ updated: 1, created: 0 })
    expect(synced()).toHaveLength(1)
    expect(synced()[0]).toMatchObject({ startTime: '18:30', endTime: '19:00', timeZone: 'Africa/Johannesburg' })
    const e = calendarEntries(getDB(), '2026-11-11', '2026-11-11', { today: '2026-11-10' }).find((x) => x.title === 'Call with Hillary')!
    expect([e.startAt.time, e.endAt.time, e.sourceLabel]).toEqual(['18:30', '19:00', 'Google Calendar'])
    expect(e.details?.some((d) => d.label === 'Sincronizado')).toBe(true)
  })

  it('repeating the same sync changes nothing', async () => {
    const mcp = mcpOf(() => payload([ev('x', '2026-11-12T07:00:00.000+02:00', '2026-11-12T08:00:00.000+02:00')]))
    await syncGoogleCalendar(mcp, '2026-11-10')
    const r = await syncGoogleCalendar(mcp, '2026-11-10')
    const r3 = await syncGoogleCalendar(mcp, '2026-11-10')
    expect([r.report?.created, r.report?.updated, r3.report?.unchanged]).toEqual([0, 0, 1])
    expect(synced()).toHaveLength(1)
  })

  it('cancelled at the origin (status or missing from the window) → kept but hidden; never deleted', async () => {
    let p = payload([ev('c', '2026-11-12T09:00:00.000+02:00', '2026-11-12T10:00:00.000+02:00'), ev('m', '2026-11-13T09:00:00.000+02:00', '2026-11-13T10:00:00.000+02:00')])
    const mcp = mcpOf(() => p)
    await syncGoogleCalendar(mcp, '2026-11-10')
    p = payload([ev('c', '2026-11-12T09:00:00.000+02:00', '2026-11-12T10:00:00.000+02:00', { eventStatus: 'cancelled' })])
    const r = await syncGoogleCalendar(mcp, '2026-11-10')
    expect(r.report?.deleted).toBe(2)
    expect(synced()).toHaveLength(2)
    expect(synced().every((e) => e.external?.syncStatus === 'deleted_remotely')).toBe(true)
    expect(calendarEntries(getDB(), '2026-11-12', '2026-11-13', { today: '2026-11-10' }).filter((e) => e.sourceType === 'event')).toHaveLength(0)
  })

  it('participants and duration changes are detected', async () => {
    let p = payload([ev('p', '2026-11-12T09:00:00.000+02:00', '2026-11-12T10:00:00.000+02:00', { attendees: [{ email: 'a@x.com', responseStatus: 'needsAction' }] })])
    const mcp = mcpOf(() => p)
    await syncGoogleCalendar(mcp, '2026-11-10')
    p = payload([ev('p', '2026-11-12T09:00:00.000+02:00', '2026-11-12T09:30:00.000+02:00', { attendees: [{ email: 'a@x.com', responseStatus: 'accepted' }] })])
    expect((await syncGoogleCalendar(mcp, '2026-11-10')).report?.updated).toBe(1)
    expect(synced()[0]).toMatchObject({ endTime: '09:30', attendees: [{ email: 'a@x.com', responseStatus: 'accepted' }] })
  })

  it('a local edit of a mirrored field never wins over Google; local-only data is kept', async () => {
    const mcp = mcpOf(() => payload([ev('k', '2026-11-12T09:00:00.000+02:00', '2026-11-12T10:00:00.000+02:00')]))
    await syncGoogleCalendar(mcp, '2026-11-10')
    actions.update('events', synced()[0].id, { startTime: '15:00', notes: 'minha nota' })
    await syncGoogleCalendar(mcp, '2026-11-10')
    expect(synced()[0]).toMatchObject({ startTime: '09:00', notes: 'minha nota' })
  })
})

describe('sem duplicar o que ela já tinha', () => {
  it('adopts her local event (same Meet link) and links a trip item instead of creating copies', async () => {
    actions.create('events', { title: 'Tutorial', date: '2026-11-10', startTime: '21:00', endTime: '22:00', sourceId: 'cal-local', allDay: false, url: 'https://meet.google.com/abc-defg-hij', notes: 'nota local' })
    actions.create('tripItems', { id: 'hq', tripId: 'za', section: 'roteiro', title: 'Reunião com Hillary (Bluemoon)', date: '2026-11-11', time: '17:00', status: 'confirmado', order: 0, contact: 'h@x.com', notes: 'material pronto' } as never)
    const mcp = mcpOf(() =>
      payload([
        ev('t', '2026-11-10T21:00:00.000+02:00', '2026-11-10T22:00:00.000+02:00', { summary: 'Fashion Finder — Tutorial', conferencingUrl: 'https://meet.google.com/abc-defg-hij' }),
        ev('h', '2026-11-11T18:30:00.000+02:00', '2026-11-11T19:00:00.000+02:00', { summary: 'Bluemoon Projects | Introductory call with Hillary' }),
      ]),
    )
    const adoption = planAdoption(getDB(), mapPayload(payload([]), getDB()))
    expect(adoption.events).toHaveLength(0)
    const r = await syncGoogleCalendar(mcp, '2026-11-10')
    expect(r.report).toMatchObject({ adopted: 1, linked: 1 })
    expect(getDB().events).toHaveLength(2)
    expect(getDB().events.find((e) => e.external?.externalId === 't')).toMatchObject({ notes: 'nota local', title: 'Fashion Finder — Tutorial' })
    const hillary = getDB().events.find((e) => e.external?.externalId === 'h')!
    expect(hillary).toMatchObject({ startTime: '18:30', endTime: '19:00', tripId: 'za' })
    expect(hillary.notes).toContain('material pronto')
    expect(getDB().tripItems.find((i) => i.id === 'hq')).toMatchObject({ linkedExternalId: 'h', time: '17:00', notes: 'material pronto' })
    // One line on 11/11, at the Google time.
    const day = calendarEntries(getDB(), '2026-11-11', '2026-11-11', { today: '2026-11-10' }).filter((e) => /Hillary/.test(e.title))
    expect(day.map((e) => [e.startAt.time, e.sourceType])).toEqual([['18:30', 'event']])
    // A second sync adopts nothing again.
    expect((await syncGoogleCalendar(mcp, '2026-11-10')).report).toMatchObject({ adopted: 0, linked: 0, created: 0 })
  })
})

describe('sem conexão real', () => {
  it('a connector failure says why and changes nothing', async () => {
    const before = getDB().events.length
    const mcp: McpLike = { callTool: async () => Promise.reject({ code: 'server_not_connected' }) }
    const r = await syncGoogleCalendar(mcp, '2026-11-10')
    expect(r.state).toBe('desconectado')
    expect(r.message).toMatch(/não está conectado/)
    expect(getDB().events.length).toBe(before)
  })
})
