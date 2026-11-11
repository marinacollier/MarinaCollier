/** Home · Hoje: long-press + drag a line to another time (persisted, undoable; Google stays read-only). */
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useMemo } from 'react'
import { actions, getDB, hydrate, useDB } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { emptyDB } from '@/data/defaults'
import { calendarEntries, sortEntries, type CalendarEntry } from '@/data/calendar/universal'
import { useUI } from '@/app/ui-store'
import type { CalendarEvent, Task, TripItem } from '@/data/types'
import { timedRows } from './clean'
import { DayBlock, moveOnTimeline, type TLItem } from './CleanBlocks'
import { FIXED_CONFIRM, GOOGLE_READ_ONLY, planMove } from './row-actions'

const DATE = '2026-11-14'
const AT = '2026-11-01T10:00:00.000Z'
const ROW_H = 50
const TOP = 200

const task = (id: string, title: string, p: Partial<Task> = {}): Task => ({ id, title, status: 'todo', order: 0, createdAt: AT, updatedAt: AT, ...p })
const gcal: CalendarEvent = {
  id: 'g1',
  sourceId: 'gcal-google',
  title: 'Call com a agência',
  date: DATE,
  startTime: '11:00',
  endTime: '12:00',
  allDay: false,
  external: { provider: 'google', externalId: 'evt-1', syncStatus: 'synced' },
  createdAt: AT,
  updatedAt: AT,
}

// jsdom has no PointerEvent: a MouseEvent that carries pointerId / pointerType.
class FakePointerEvent extends MouseEvent {
  pointerId: number
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'touch'
  }
}

const realRect = HTMLElement.prototype.getBoundingClientRect
beforeAll(() => {
  vi.stubGlobal('PointerEvent', FakePointerEvent)
  // Layout: the timeline list starts at y=200 and each line is 50px tall.
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const i = this.dataset.dragIndex
    const top = i !== undefined ? TOP + Number(i) * ROW_H : this.getAttribute('aria-label') === 'Linha do tempo' ? TOP : 0
    const height = i !== undefined ? ROW_H : 0
    return { top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect
  }
})
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect
  vi.unstubAllGlobals()
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-11-14T11:00:00.000Z'))
  await hydrate(createMemoryAdapter())
  actions.replaceDB({
    ...emptyDB(),
    calendarSources: [{ id: 'gcal-google', provider: 'google', name: 'Google', syncDirection: 'read', color: 'ocean', enabled: true, createdAt: AT, updatedAt: AT }],
    events: [gcal],
    tasks: [task('t1', 'Escrever roteiro', { date: DATE, time: '09:00', durationMin: 60 }), task('t2', 'Editar vídeo', { date: DATE, time: '14:00', durationMin: 30 })],
  })
  useUI.setState({ toasts: [], sheets: [] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Harness() {
  const db = useDB()
  const items = useMemo<TLItem[]>(() => timedRows(sortEntries(calendarEntries(db, DATE, DATE, { today: DATE })), DATE).map((e: CalendarEntry) => ({ kind: 'entry', time: e.startAt.time ?? '', e })), [db])
  return <DayBlock label="01 / Dia" title="Hoje" rows={[]} loose={[]} onOpen={() => {}} onLoose={() => {}} conflicts={0} onConflicts={() => {}} items={items} onMove={moveOnTimeline(DATE)} />
}

const mount = () =>
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  )

const lines = () => [...within(screen.getByLabelText('Linha do tempo')).getAllByRole('listitem')]
const line = (title: string) => lines().find((li) => li.textContent?.includes(title))!
const yOf = (i: number) => TOP + i * ROW_H + ROW_H / 2
const lastToast = () => useUI.getState().toasts.at(-1)

/** Long-press on `from`, drag to y, release. */
function drag(el: Element, fromY: number, toY: number) {
  fireEvent.pointerDown(el, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: fromY, button: 0 })
  act(() => vi.advanceTimersByTime(400))
  fireEvent.pointerMove(el, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: toY })
}

describe('arrastar na linha do tempo de Hoje', () => {
  it('long-press + drag moves a task right after the previous line; Desfazer puts it back', () => {
    mount()
    expect(lines().map((li) => li.textContent)).toEqual([expect.stringContaining('Escrever roteiro'), expect.stringContaining('Call com a agência'), expect.stringContaining('Editar vídeo')])
    const el = line('Editar vídeo')
    // From the 3rd line to between the 1st (09:00–10:00) and the 2nd.
    drag(el, yOf(2), TOP + ROW_H + 10)
    expect(screen.getByTestId('drop-line').textContent).toContain('→ 10:00')
    fireEvent.pointerUp(el, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: TOP + ROW_H + 10 })
    expect(screen.queryByTestId('drop-line')).toBeNull()
    expect(getDB().tasks.find((t) => t.id === 't2')?.time).toBe('10:00')
    expect(lastToast()?.message).toBe('Editar vídeo → 10:00')
    // The line is now in its new place.
    expect(lines()[1].textContent).toContain('Editar vídeo')
    act(() => lastToast()!.action!.run())
    expect(getDB().tasks.find((t) => t.id === 't2')?.time).toBe('14:00')
  })

  it('a quick vertical move before the long-press is a scroll, not a drag', () => {
    mount()
    const el = line('Editar vídeo')
    fireEvent.pointerDown(el, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: yOf(2) })
    act(() => vi.advanceTimersByTime(120))
    fireEvent.pointerMove(el, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: yOf(2) - 40 })
    act(() => vi.advanceTimersByTime(600))
    fireEvent.pointerMove(el, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: TOP + 10 })
    expect(screen.queryByTestId('drop-line')).toBeNull()
    fireEvent.pointerUp(el, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: TOP + 10 })
    expect(getDB().tasks.find((t) => t.id === 't2')?.time).toBe('14:00')
    expect(useUI.getState().toasts).toHaveLength(0)
  })

  it('a Google-synced event is not changed: it says to move it in Google', () => {
    mount()
    const el = line('Call com a agência')
    drag(el, yOf(1), TOP + 5)
    fireEvent.pointerUp(el, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: TOP + 5 })
    const ev = getDB().events.find((e) => e.id === 'g1')!
    expect([ev.startTime, ev.endTime]).toEqual(['11:00', '12:00'])
    expect(getDB().scheduleOverrides).toHaveLength(0)
    expect(lastToast()?.message).toBe(GOOGLE_READ_ONLY)
    expect(lastToast()?.action).toBeUndefined()
  })

  it('routines and quiet lines are not draggable', () => {
    const items: TLItem[] = [{ kind: 'quiet', time: '12:00', end: '13:00', title: 'Almoço', onOpen: () => {} }]
    const onMove = vi.fn()
    render(
      <MemoryRouter>
        <DayBlock label="01" title="Hoje" rows={[]} loose={[]} onOpen={() => {}} onLoose={() => {}} conflicts={0} onConflicts={() => {}} items={items} onMove={onMove} />
      </MemoryRouter>,
    )
    const el = line('Almoço')
    drag(el, yOf(0), TOP + 300)
    expect(screen.queryByTestId('drop-line')).toBeNull()
    fireEvent.pointerUp(el, { pointerId: 1 })
    expect(onMove).not.toHaveBeenCalled()
  })
})

describe('planMove: fixed commitments ask first', () => {
  it('a flight asks for confirmation and only moves when confirmed', () => {
    const flight = { id: 'f1', tripId: 'trip', section: 'voo', title: 'Voo SA366', status: 'confirmado', order: 0, date: DATE, time: '15:00', endTime: '17:00', createdAt: AT, updatedAt: AT } as unknown as TripItem
    actions.replaceDB({ ...emptyDB(), tripItems: [flight] })
    const e = { id: 'tripItem:f1', title: 'Voo SA366', sourceType: 'tripItem', sourceId: 'f1', startAt: { date: DATE, time: '15:00' }, endAt: { date: DATE, time: '17:00' }, allDay: false } as unknown as CalendarEntry
    const plan = planMove({ kind: 'entry', e, date: DATE }, { start: '16:00', end: '18:00' })
    expect(plan).toMatchObject({ kind: 'confirm', message: FIXED_CONFIRM })
    expect(getDB().tripItems[0].time).toBe('15:00')
    if (plan.kind !== 'confirm') throw new Error('expected confirm')
    const r = plan.run()
    expect(getDB().tripItems[0]).toMatchObject({ time: '16:00', endTime: '18:00' })
    expect(r.message).toBe('Voo SA366 → 16:00')
    r.undo?.()
    expect(getDB().tripItems[0]).toMatchObject({ time: '15:00', endTime: '17:00' })
  })
})
