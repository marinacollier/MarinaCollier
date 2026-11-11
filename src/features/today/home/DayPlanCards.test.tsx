/** Home · check-in do dia → "O que faz sentido fazer agora?" (persistence, render, actions recompute, review). */
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { actions, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { emptyDB } from '@/data/defaults'
import type { Task } from '@/data/types'
import TodayPage from '../TodayPage'
import { checkinOf } from './day-checkin'
import { showReview } from './DayPlanCards'

// The engine's own rules are tested in isolation; study candidates have their own tests (features/learning).
vi.mock('@/features/learning/candidates', () => ({ studyCandidates: () => [] }))

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

const timeline = () => within(screen.getByLabelText('Hoje')).getByLabelText('Linha do tempo')
const rowOf = (title: string) => [...timeline().querySelectorAll('li')].find((li) => li.textContent?.includes(title))
/** The line itself (its main button), without the swipe labels and the round check. */
const lineText = (li?: Element) => li?.querySelector('button')?.textContent ?? ''
const status = () => screen.getByRole('status').textContent ?? ''

describe('check-in do dia', () => {
  it('shows a compact card on the first open of the day, persists her answers and plans the day with them', async () => {
    home()
    const card = screen.getByLabelText('Check-in do dia')
    expect(card.textContent).toContain('Quanto tempo livre tu tem hoje para atividades flexíveis?')
    fireEvent.click(within(card).getByRole('button', { name: '1h' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Baixa' }))
    fireEvent.change(within(card).getByLabelText('Interesse de hoje'), { target: { value: 'política' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Pronto' }))
    const c = checkinOf(getDB(), DATE)!
    expect(c).toMatchObject({ freeMin: 60, energy: 2, interest: 'política' })
    await flushNow()
    const saved = (await storage.load()) as { dayCheckins: unknown[] }
    expect(saved.dayCheckins).toHaveLength(1)
    // No second planner: the card leaves and the day's blocks are on the ONE timeline.
    expect(screen.queryByLabelText('Check-in do dia')).toBeNull()
    expect(screen.queryByLabelText('O que faz sentido agora')).toBeNull()
    expect(c.blocks?.length).toBeGreaterThan(0)
    expect(lineText(rowOf('Enviar proposta'))).toMatch(/^14:00.*Enviar proposta/)
  })

  it('"Pular" stores skipped and the timeline still shows the plan from the calendar', () => {
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(checkinOf(getDB(), DATE)?.skipped).toBe(true)
    expect(rowOf('Enviar proposta')).toBeTruthy()
  })
})

describe('uma timeline, um motor', () => {
  beforeEach(() => {
    actions.create('dayCheckins', { date: DATE, freeMin: 60, energy: 4, changes: [] })
  })

  it('the engine places flexible blocks on the timeline (persisted), labelled and with a time', async () => {
    home()
    const row = rowOf('Enviar proposta')!
    expect(lineText(row)).toMatch(/^14:00até 14:30TarefaEnviar propostaplanejado$/)
    const c = checkinOf(getDB(), DATE)!
    expect(c.blocks?.map((b) => [b.key, b.start, b.end, b.by])).toContainEqual(['task:a', '14:00', '14:30', 'motor'])
    // Reopening the app shows the same plan (it is stored, not recomputed on render).
    await flushNow()
    const saved = (await storage.load()) as { dayCheckins: { blocks?: unknown[] }[] }
    expect(saved.dayCheckins[0].blocks).toEqual(c.blocks)
  })

  it('replanejamento contextual: a meeting added on top of a planned task moves the task (not the meeting), with Desfazer', () => {
    home()
    expect(checkinOf(getDB(), DATE)!.blocks!.find((b) => b.key === 'task:a')?.start).toBe('14:00')
    act(() => {
      actions.create('events', { title: 'Reunião nova', date: DATE, startTime: '14:00', endTime: '15:00', allDay: false } as never)
    })
    const moved = checkinOf(getDB(), DATE)!.blocks!.find((b) => b.key === 'task:a' && b.status === 'planejado')
    expect(moved?.start).not.toBe('14:00')
    expect(getDB().events.find((e) => e.title === 'Reunião nova')?.startTime).toBe('14:00')
    expect(lineText(rowOf('Reunião nova'))).toContain('14:00')
  })

  it('encerramento inteligente: "Encerrar o dia" goes after a later meeting, and says why', () => {
    act(() => {
      actions.create('routines', { id: 'enc', name: 'Encerrar o dia', period: 'noite', order: 1, active: true, startTime: '21:00' } as never)
      actions.create('routineItems', { routineId: 'enc', title: 'Desacelerar', order: 0, active: true, recurrence: { kind: 'daily' }, durationMin: 30 } as never)
      actions.create('events', { title: 'Entrevista Técnica', date: DATE, startTime: '21:30', endTime: '22:15', allDay: false } as never)
    })
    home()
    const row = rowOf('Encerrar o dia')!
    expect(lineText(row)).toContain('22:15')
    expect(lineText(row)).toMatch(/era 21:00/i)
    expect(lineText(row)).toMatch(/depois de Entrevista Técnica/i)
  })

  it('Concluir in the block completes the task itself (Tarefas sees it) and the row shows "feito"', () => {
    home()
    fireEvent.click(within(rowOf('Enviar proposta')!).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(getDB().tasks.find((t) => t.id === 'a')?.status).toBe('done')
    expect(checkinOf(getDB(), DATE)!.blocks!.find((b) => b.key === 'task:a')?.status).toBe('feito')
    expect(lineText(rowOf('Enviar proposta'))).toContain('feito')
  })

  it('Replanejar moves the block to her time; a later replan never moves it', () => {
    home()
    fireEvent.click(within(rowOf('Enviar proposta')!).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Replanejar' }))
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '16:00' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar 16:00–16:30/ }))
    expect(checkinOf(getDB(), DATE)!.blocks!.find((b) => b.key === 'task:a')).toMatchObject({ start: '16:00', end: '16:30', by: 'marina' })
    fireEvent.click(screen.getByRole('button', { name: 'Reorganizar meu dia' }))
    expect(checkinOf(getDB(), DATE)!.blocks!.find((b) => b.key === 'task:a')).toMatchObject({ start: '16:00', by: 'marina' })
  })

  it('"Tenho mais 30 min" has a visible consequence: a new block, or the reason there is none', () => {
    home()
    const before = checkinOf(getDB(), DATE)!.blocks!.filter((b) => b.status === 'planejado').length
    fireEvent.click(screen.getByRole('button', { name: 'Tenho mais 30 min' }))
    const c = checkinOf(getDB(), DATE)!
    expect(c.freeMin).toBe(90)
    expect(c.changes.at(-1)).toMatchObject({ key: 'day', action: 'mais_tempo' })
    const after = c.blocks!.filter((b) => b.status === 'planejado').length
    if (after > before) expect(status()).toMatch(/Reorganizei teu planejamento: \+30 min disponíveis e encaixei .+ às \d\d:\d\d/)
    else expect(status()).toMatch(/mais 30 min de capacidade\. (Não há uma janela|Não encontrei|Teu tempo)/)
  })

  it('"Estou cansada" lowers the energy and replans without touching fixed commitments', () => {
    actions.create('events', { title: 'Aula fixa', date: DATE, startTime: '18:00', endTime: '19:00', sourceId: 'cal-local', allDay: false })
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Estou cansada' }))
    expect(checkinOf(getDB(), DATE)!.energy).toBe(3)
    expect(status()).toMatch(/Energia ajustada.*nada fixo foi mexido/)
    expect(getDB().events.find((e) => e.title === 'Aula fixa')).toMatchObject({ startTime: '18:00', date: DATE })
    expect(lineText(rowOf('Aula fixa'))).toMatch(/^18:00/)
  })

  it('typed commands are applied: "não quero enviar proposta" takes it out and says so', () => {
    home()
    fireEvent.change(screen.getByLabelText('Ajustar o dia (texto)'), { target: { value: 'não quero enviar proposta hoje' } })
    fireEvent.submit(screen.getByLabelText('Ajustar o dia (texto)').closest('form')!)
    expect(checkinOf(getDB(), DATE)!.interest).toContain('não quero enviar proposta')
    expect(status()).toMatch(/Anotei/)
    expect(checkinOf(getDB(), DATE)!.blocks!.some((b) => b.key === 'task:a' && b.status === 'planejado')).toBe(false)
  })

  it('Adiar (Mais opções) moves the task to the chosen day; Desfazer brings everything back', () => {
    home()
    fireEvent.click(within(rowOf('Enviar proposta')!).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: /Mais opções/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Adiar' }))
    fireEvent.change(screen.getByLabelText('Adiar para'), { target: { value: '2026-11-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adiar para 20/11' }))
    expect(getDB().tasks.find((t) => t.id === 'a')?.date).toBe('2026-11-20')
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

describe('um toque em qualquer linha: concluído · parcial · faltei · replanejar · editar · excluir', () => {
  beforeEach(() => {
    actions.create('dayCheckins', { date: DATE, freeMin: 60, energy: 4, changes: [] })
  })
  const menuOf = (title: string) => {
    fireEvent.click(screen.getByRole('button', { name: `Status: ${title}` }))
    return within(screen.getAllByRole('dialog', { name: 'Status do item' }).find((d) => d.textContent?.includes(title) && d.querySelector('[aria-label="Fechar"]'))!)
  }

  it('Concluído concludes the task behind a block and it STAYS on the day (struck), with Desfazer', () => {
    home()
    fireEvent.click(menuOf('Enviar proposta').getByRole('button', { name: 'Concluído' }))
    expect(getDB().tasks.find((t) => t.id === 'a')?.status).toBe('done')
    expect(lineText(rowOf('Enviar proposta'))).toContain('feito')
    // Again → back to do.
    fireEvent.click(menuOf('Enviar proposta').getByRole('button', { name: 'Concluído ✓' }))
    expect(getDB().tasks.find((t) => t.id === 'a')?.status).not.toBe('done')
  })

  it('an event of the day is concluded from the same menu', () => {
    actions.create('events', { title: 'Aula fixa', date: DATE, startTime: '18:00', endTime: '19:00', sourceId: 'cal-local', allDay: false })
    home()
    fireEvent.click(menuOf('Aula fixa').getByRole('button', { name: 'Concluído' }))
    expect(lineText(rowOf('Aula fixa'))).toContain('feito')
  })

  it('Parcial and Faltei mark the day (chip), persist, and choosing again clears it', () => {
    actions.create('events', { title: 'Missa', date: DATE, startTime: '18:00', endTime: '19:00', sourceId: 'cal-local', allDay: false })
    home()
    fireEvent.click(menuOf('Missa').getByRole('button', { name: 'Parcial' }))
    expect(lineText(rowOf('Missa'))).toContain('parcial')
    fireEvent.click(menuOf('Missa').getByRole('button', { name: 'Faltei' }))
    expect(lineText(rowOf('Missa'))).toContain('faltei')
    expect(lineText(rowOf('Missa'))).not.toContain('parcial')
    expect(getDB().occurrences.filter((o) => o.parentType === 'item' && o.date === DATE)).toHaveLength(1)
    fireEvent.click(menuOf('Missa').getByRole('button', { name: 'Faltei' }))
    expect(lineText(rowOf('Missa'))).not.toContain('faltei')
  })

  it('Replanejar → Amanhã moves the task to tomorrow, marked "replanejado" there; Desfazer brings it back', () => {
    home()
    const m = menuOf('Enviar proposta')
    fireEvent.click(m.getByRole('button', { name: 'Replanejar' }))
    fireEvent.click(m.getByRole('button', { name: /^Amanhã/ }))
    expect(getDB().tasks.find((t) => t.id === 'a')?.date).toBe('2026-11-15')
    expect(getDB().occurrences.some((o) => o.parentId === 'task:a' && o.date === '2026-11-15' && o.status === 'moved')).toBe(true)
  })

  it('Excluir asks first, then removes a task (Desfazer restores it); a Google event is never deleted from here', () => {
    actions.create('events', { title: 'Do Google', date: DATE, startTime: '18:00', endTime: '19:00', sourceId: 'gcal-google', allDay: false, external: { provider: 'google', externalId: 'g1', syncStatus: 'synced' } } as never)
    home()
    let m = menuOf('Enviar proposta')
    fireEvent.click(m.getByRole('button', { name: 'Excluir' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim' }))
    expect(getDB().tasks.some((t) => t.id === 'a')).toBe(false)
    m = menuOf('Do Google')
    fireEvent.click(m.getByRole('button', { name: 'Excluir' }))
    expect(m.getByRole('status').textContent).toMatch(/Google/)
    expect(getDB().events.some((e) => e.title === 'Do Google')).toBe(true)
  })

  it('a routine: Concluído ticks every item of the day; it stays on the timeline, struck', () => {
    act(() => {
      actions.create('routines', { id: 'mm', name: 'Milagre da Manhã', period: 'manha', order: 0, active: true, startTime: '06:00' } as never)
      actions.create('routineItems', { routineId: 'mm', title: 'Despertar', order: 0, active: true, recurrence: { kind: 'daily' } } as never)
      actions.create('routineItems', { routineId: 'mm', title: 'Meditar', order: 1, active: true, recurrence: { kind: 'daily' } } as never)
    })
    home()
    fireEvent.click(menuOf('Milagre da Manhã').getByRole('button', { name: 'Concluído' }))
    expect(lineText(rowOf('Milagre da Manhã'))).toContain('feito')
    expect(getDB().occurrences.filter((o) => o.parentType === 'routineItem' && o.status === 'done')).toHaveLength(2)
  })
})
