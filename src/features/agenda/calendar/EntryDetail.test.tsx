import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { actions, applyModuleSeeds, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { calendarEntries } from '@/data/calendar/universal'
import { useUI } from '@/app/ui-store'
import TripItemSheet from '@/features/travel/TripItemSheet'
import { EntryDetail } from './EntryDetail'

const MONDAY = '2026-11-09'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T12:00:00.000Z')) // 09:00 in São Paulo, Monday
})
afterAll(() => vi.useRealTimers())

let meetingId = ''
let flightId = ''

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(applyModuleSeeds(buildSeed(MONDAY)))
  useUI.setState({ sheets: [], toasts: [] })
  const trip = getDB().trips.find((t) => t.expedition) ?? getDB().trips[0]
  meetingId = actions.create('tripItems', { tripId: trip.id, section: 'roteiro', title: 'Conversa com Hillary', status: 'a_confirmar', date: MONDAY, time: '15:00', checklistKind: 'voluntariado', order: 999 }).id
  flightId = actions.create('tripItems', { tripId: trip.id, section: 'voo', title: 'Voo CPT → JNB', status: 'a_confirmar', date: MONDAY, time: '18:00', bookingStatus: 'aguardando_pagamento', order: 1000 }).id
})
afterEach(cleanup)

const entryOf = (sourceId: string) => calendarEntries(getDB(), MONDAY, MONDAY, { today: MONDAY }).find((e) => e.sourceId === sourceId)!

function renderDetail(sourceId: string) {
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <EntryDetail entry={entryOf(sourceId)} date={MONDAY} device="America/Sao_Paulo" onClose={onClose} />
    </MemoryRouter>,
  )
  return onClose
}
const meeting = () => getDB().tripItems.find((i) => i.id === meetingId)!
const undoLast = () => useUI.getState().toasts.at(-1)!.action!.run()

describe('EntryDetail · ações rápidas por tipo', () => {
  it('shows the tipo in the header and no booking words for a meeting', () => {
    renderDetail(meetingId)
    expect(screen.getByLabelText('Tipo: Reunião')).toBeTruthy()
    const text = document.body.textContent ?? ''
    for (const w of ['A RESERVAR', 'A COTAR', 'AGUARDANDO PAGAMENTO', 'RESERVA EMITIDA']) expect(text).not.toContain(w)
  })

  it('"Mudar dia/hora" moves the meeting to Wednesday; Desfazer puts it back', () => {
    const onClose = renderDetail(meetingId)
    fireEvent.click(screen.getByRole('button', { name: /Mudar dia\/hora/ }))
    fireEvent.change(screen.getByLabelText('Novo dia'), { target: { value: '2026-11-11' } })
    fireEvent.change(screen.getByLabelText('Novo horário'), { target: { value: '10:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar novo dia/hora' }))
    expect(meeting()).toMatchObject({ date: '2026-11-11', time: '10:30', id: meetingId })
    expect(onClose).toHaveBeenCalled()
    undoLast()
    expect(meeting()).toMatchObject({ date: MONDAY, time: '15:00' })
  })

  it('"Confirmar" on a meeting sets it confirmed (no payment touched); Desfazer reverts', () => {
    renderDetail(meetingId)
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    expect(meeting().status).toBe('confirmado')
    expect(meeting().paymentStatus).toBeUndefined()
    expect(entryOf(meetingId).status).toBe('confirmado')
    undoLast()
    expect(meeting().status).toBe('a_confirmar')
    expect(meeting().bookingStatus).toBeUndefined()
  })

  it('"Criar tarefa de preparo" creates exactly one task for today, pending; Desfazer removes it', () => {
    const before = getDB().tasks.length
    renderDetail(meetingId)
    fireEvent.click(screen.getByRole('button', { name: /Criar tarefa de preparo/ }))
    const prep = getDB().tasks.filter((t) => t.title === 'Preparar: Conversa com Hillary')
    expect(prep).toHaveLength(1)
    expect(prep[0]).toMatchObject({ status: 'todo', date: MONDAY })
    expect(getDB().tasks.length).toBe(before + 1)
    // The button is gone: a second tap cannot make a second task.
    expect(screen.queryByRole('button', { name: /Criar tarefa de preparo/ })).toBeNull()
    undoLast()
    expect(getDB().tasks.some((t) => t.title === 'Preparar: Conversa com Hillary')).toBe(false)
  })

  it('"Mudar tipo" writes her explicit tipo on the record', () => {
    renderDetail(meetingId)
    fireEvent.click(screen.getByRole('button', { name: /Mudar tipo/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo' })).getByRole('button', { name: 'Estudo' }))
    expect(meeting().entryKind).toBe('estudo')
    undoLast()
    expect(meeting().entryKind).toBeUndefined()
  })

  it('a flight is still a reserva with its booking status', () => {
    renderDetail(flightId)
    expect(screen.getByLabelText('Tipo: Reserva · passeio')).toBeTruthy()
    expect(document.body.textContent).toContain('AGUARDANDO PAGAMENTO')
    expect(screen.queryByRole('button', { name: /Criar tarefa de preparo/ })).toBeNull()
  })
})

describe('TripItemSheet · editor por tipo', () => {
  it('a meeting has a simple status row, no booking grid, payment, valor or código', () => {
    render(<TripItemSheet id={meetingId} />)
    const text = document.body.textContent ?? ''
    for (const w of ['AGUARDANDO PAGAMENTO', 'RESERVA EMITIDA', 'A COTAR', 'Certeza', 'Pagamento', 'Referência (código da reserva)']) expect(text).not.toContain(w)
    expect(screen.queryByPlaceholderText('ABC123')).toBeNull()
    const status = screen.getByRole('group', { name: 'Status' })
    for (const s of ['Proposto', 'Confirmado', 'Feito', 'Cancelado']) expect(within(status).getByRole('button', { name: s })).toBeTruthy()
    expect(within(screen.getAllByRole('group', { name: 'Tipo' })[0]).getByRole('button', { name: 'Reunião' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('a meeting saved as Confirmado keeps status and bookingStatus in step', () => {
    render(<TripItemSheet id={meetingId} />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Confirmado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(meeting()).toMatchObject({ status: 'confirmado', bookingStatus: 'confirmado' })
    expect(meeting().paymentStatus).toBeUndefined()
  })

  it('a flight keeps the full booking editor', () => {
    render(<TripItemSheet id={flightId} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('AGUARDANDO PAGAMENTO')
    expect(text).toContain('RESERVA EMITIDA')
    expect(screen.queryByRole('group', { name: 'Status' })).toBeNull()
  })

  it('retagging the flight as a tarefa swaps to the simple editor and saves the tipo', () => {
    render(<TripItemSheet id={flightId} />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo' })).getByRole('button', { name: 'Tarefa' }))
    expect(document.body.textContent).not.toContain('RESERVA EMITIDA')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(getDB().tripItems.find((i) => i.id === flightId)!.entryKind).toBe('tarefa')
  })
})
