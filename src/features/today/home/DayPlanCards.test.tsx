/** Home · check-in do dia → "O que faz sentido fazer agora?" (persistence, render, actions recompute, review). */
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { actions, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { emptyDB } from '@/data/defaults'
import type { Task } from '@/data/types'
import TodayPage from '../TodayPage'
import { checkinOf } from './day-checkin'
import { showReview } from './DayPlanCards'

const DATE = '2026-11-14' // Saturday
const AT = '2026-11-01T10:00:00.000Z'
const task = (id: string, title: string, p: Partial<Task> = {}): Task => ({
  id,
  title,
  status: 'todo',
  order: 0,
  createdAt: AT,
  updatedAt: AT,
  ...p,
})

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T17:00:00.000Z')) // 14:00 in São Paulo
})
afterAll(() => vi.useRealTimers())

let storage: ReturnType<typeof createMemoryAdapter>
beforeEach(async () => {
  storage = createMemoryAdapter()
  await hydrate(storage)
  actions.replaceDB({
    ...emptyDB(),
    tasks: [
      task('a', 'Enviar proposta', { dueDate: DATE, durationMin: 30 }),
      task('b', 'Revisar slides', { date: DATE, durationMin: 30 }),
      task('c', 'Arrumar gaveta', { durationMin: 20 }),
    ],
  })
})
afterEach(cleanup)

const home = () =>
  render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  )

describe('check-in do dia', () => {
  it('shows a compact card on the first open of the day and persists her answers', async () => {
    home()
    const card = screen.getByLabelText('Check-in do dia')
    expect(card.textContent).toContain('Quanto tempo livre tu tem hoje para atividades flexíveis?')
    fireEvent.click(within(card).getByRole('button', { name: '1h' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Baixa' }))
    fireEvent.change(within(card).getByLabelText('Interesse de hoje'), {
      target: { value: 'política' },
    })
    fireEvent.click(within(card).getByRole('button', { name: 'Pronto' }))
    const c = checkinOf(getDB(), DATE)!
    expect(c).toMatchObject({
      freeMin: 60,
      energy: 2,
      interest: 'política',
      changes: [],
    })
    await flushNow()
    const saved = (await storage.load()) as { dayCheckins: unknown[] }
    expect(saved.dayCheckins).toHaveLength(1)
    // The card is replaced by the plan.
    expect(screen.queryByLabelText('Check-in do dia')).toBeNull()
    expect(screen.getByLabelText('O que faz sentido agora')).toBeTruthy()
  })

  it('"Pular" stores skipped and still shows the plan from the calendar', () => {
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(checkinOf(getDB(), DATE)?.skipped).toBe(true)
    expect(screen.getByLabelText('O que faz sentido agora')).toBeTruthy()
  })
})

describe('O que faz sentido fazer agora?', () => {
  beforeEach(() => {
    actions.create('dayCheckins', {
      date: DATE,
      freeMin: 60,
      energy: 4,
      changes: [],
    })
  })

  it('primary with reason, time and slot; essentials, espaço livre, podem esperar collapsed', () => {
    home()
    const card = screen.getByLabelText('O que faz sentido agora')
    const primary = within(card).getByLabelText('Principal')
    expect(primary.textContent).toContain('Enviar proposta')
    expect(primary.textContent).toMatch(/~30 min · sugestão 14:00–14:30 · Prazo: vence hoje/)
    expect(within(card).getByLabelText('Essenciais').textContent).toContain('Dormir às')
    expect(card.textContent).toMatch(/Espaço livre: \d+ min/)
    expect(within(card).queryByLabelText('Podem esperar')).toBeNull()
  })

  it('"Hoje não" logs the change, recomputes and offers a reason field', () => {
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Hoje não: Enviar proposta' }))
    const c = checkinOf(getDB(), DATE)!
    expect(c.changes.map((x) => [x.key, x.action])).toEqual([['task:a', 'hoje_nao']])
    const card = screen.getByLabelText('O que faz sentido agora')
    expect(within(card).getByLabelText('Principal').textContent).toContain('Revisar slides')
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), {
      target: { value: 'cliente pediu sexta' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(checkinOf(getDB(), DATE)!.changes[0].reason).toBe('cliente pediu sexta')
  })

  it('"Estou sem energia" and "Tenho mais tempo" change the check-in and are logged', () => {
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Estou sem energia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tenho mais tempo' }))
    const c = checkinOf(getDB(), DATE)!
    expect(c.energy).toBe(3)
    expect(c.freeMin).toBe(90)
    expect(c.changes.map((x) => x.action)).toEqual(['sem_energia', 'mais_tempo'])
  })

  it('"Já concluí" marks the task done through the task action', () => {
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Já concluí: Enviar proposta' }))
    expect(getDB().tasks.find((t) => t.id === 'a')?.status).toBe('done')
  })

  it('"Adiar" moves the task to the chosen date', () => {
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Adiar: Enviar proposta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adiar' }))
    expect(getDB().tasks.find((t) => t.id === 'a')).toMatchObject({
      date: '2026-11-15',
      postponedFrom: DATE,
    })
  })

  it('"Dividir" creates steps only from her text', () => {
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Dividir: Enviar proposta' }))
    fireEvent.change(screen.getByLabelText('Etapas'), {
      target: { value: 'rascunho\nrevisar' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar etapas' }))
    expect(
      getDB()
        .tasks.filter((t) => t.origin?.id === 'a')
        .map((t) => t.title),
    ).toEqual(['Etapa 1/2: rascunho', 'Etapa 2/2: revisar'])
  })
})

describe('revisão do fim do dia', () => {
  it('only after 20:00, until answered or dismissed', () => {
    expect(showReview(19 * 60, undefined)).toBe(false)
    expect(showReview(20 * 60, undefined)).toBe(true)
    expect(showReview(21 * 60, { dismissed: true })).toBe(false)
    expect(showReview(21 * 60, { at: AT })).toBe(false)
  })
})
