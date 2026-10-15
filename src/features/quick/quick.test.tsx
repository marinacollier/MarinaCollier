/**
 * The "+" without Lumos: every quick path writes the SAME record Lumos / the screens use, shows on the Home,
 * says "✓ · Desfazer" only after the device holds it, and is still there after a fresh hydrate.
 */
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { useUI } from '@/app/ui-store'
import QuickAddSheet from '@/components/layout/QuickAddSheet'
import TodayPage from '@/features/today/TodayPage'
import { addWater, quickMood, quickSleep, sleepHours, sleepMoodWeek } from './ops'

const DAY = '2026-10-02'
let mem: ReturnType<typeof createMemoryAdapter>

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-02T13:00:00.000Z')) // 10:00 São Paulo, Friday
})
afterAll(() => vi.useRealTimers())

beforeEach(async () => {
  mem = createMemoryAdapter()
  await hydrate(mem)
  actions.replaceDB(buildSeed(DAY))
  await flushNow()
  useUI.setState({ sheets: [{ key: 'q', name: 'quickAdd', props: {} }], toasts: [] })
})
afterEach(() => {
  cleanup()
  detachStorage()
})

const sheet = () => render(<MemoryRouter><QuickAddSheet /></MemoryRouter>)
const home = () => render(<MemoryRouter><TodayPage /></MemoryRouter>)
const pick = (label: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }))
/** Fresh start from what the device holds. */
async function reload() {
  await flushNow()
  detachStorage()
  await hydrate(mem)
  return getDB()
}
const lastToast = () => useUI.getState().toasts.at(-1)

describe('+ Registrar (sem IA)', () => {
  it('Tarefa: title · dia · área → tasks; toast with Desfazer after save; on Home; survives hydrate', async () => {
    sheet()
    pick('Tarefa')
    fireEvent.change(screen.getByLabelText('Título da tarefa'), { target: { value: 'Ligar pro dentista' } })
    fireEvent.click(screen.getByRole('button', { name: 'Trabalho' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tarefa' }))
    await waitFor(() => expect(lastToast()?.message).toMatch(/Ligar pro dentista ✓/))
    expect(lastToast()?.action?.label).toBe('Desfazer')
    const t = getDB().tasks.find((x) => x.title === 'Ligar pro dentista')
    expect(t).toMatchObject({ status: 'todo', date: DAY, context: 'trabalho', area: 'profissional' })
    expect(useUI.getState().sheets).toHaveLength(0)
    cleanup()
    home()
    expect(screen.getByLabelText('Hoje').textContent).toContain('Ligar pro dentista')
    const db = await reload()
    expect(db.tasks.some((x) => x.title === 'Ligar pro dentista')).toBe(true)
  })

  it('Desfazer removes exactly what was written', async () => {
    sheet()
    pick('Tarefa')
    fireEvent.change(screen.getByLabelText('Título da tarefa'), { target: { value: 'Comprar pilha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tarefa' }))
    await waitFor(() => expect(lastToast()?.action).toBeTruthy())
    lastToast()!.action!.run()
    expect(getDB().tasks.some((x) => x.title === 'Comprar pilha')).toBe(false)
    expect((await reload()).tasks.some((x) => x.title === 'Comprar pilha')).toBe(false)
  })

  it('Despesa: valor · descrição · categoria (data = hoje) → expenses', async () => {
    sheet()
    pick('Despesa')
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '42,50' } })
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Farmácia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar despesa' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Despesa anotada ✓'))
    const e = getDB().expenses.find((x) => x.title === 'Farmácia')
    expect(e).toMatchObject({ amountCents: 4250, date: DAY, status: 'paid', origin: 'manual' })
    expect((await reload()).expenses.some((x) => x.id === e!.id)).toBe(true)
  })

  it('Treino feito: the planned one in ONE tap (same check as the Home) → workout feito; Home counts it', async () => {
    sheet()
    pick('Treino feito')
    fireEvent.click(screen.getByRole('button', { name: 'Fiz: Corrida longa Z2' }))
    const done = () => getDB().workouts.find((w) => w.date === DAY && w.status === 'feito')
    expect(done()).toBeTruthy()
    cleanup()
    home()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1')
    expect((await reload()).workouts.some((w) => w.id === done()!.id && w.status === 'feito')).toBe(true)
  })

  it('Treino livre: tipo · duração → workouts (feito)', async () => {
    sheet()
    pick('Treino feito')
    fireEvent.click(screen.getByRole('button', { name: /Yoga/ }))
    fireEvent.change(screen.getByLabelText('Duração em minutos'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar treino' }))
    await waitFor(() => expect(lastToast()?.message).toMatch(/feito ✓/))
    const w = getDB().workouts.find((x) => x.modality === 'yoga' && x.date === DAY)
    expect(w).toMatchObject({ status: 'feito', durationMin: 30 })
    expect((await reload()).workouts.some((x) => x.id === w!.id)).toBe(true)
  })

  it('Refeição: planned meal in one tap; free text through logFood', async () => {
    sheet()
    pick('Refeição')
    fireEvent.click(screen.getByRole('button', { name: 'Comi: Almoço' }))
    expect(getDB().meals.some((m) => m.date === DAY && m.done && m.planMealRef)).toBe(true)
    cleanup()
    useUI.setState({ sheets: [{ key: 'q', name: 'quickAdd', props: {} }] })
    sheet()
    pick('Refeição')
    fireEvent.change(screen.getByLabelText('O que você comeu'), { target: { value: 'pão de queijo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar refeição' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Refeição anotada ✓'))
    const m = getDB().meals.find((x) => x.description === 'pão de queijo')
    expect(m).toMatchObject({ date: DAY, done: true, loggedVia: 'formulario' })
    cleanup()
    home()
    // the planned one is ticked on the Home too (same record)
    expect(within(screen.getByLabelText('Hoje')).queryByText('Almoço')).toBeNull()
    expect((await reload()).meals.some((x) => x.id === m!.id)).toBe(true)
  })

  it('Pagamento: a bill due today → "Já paguei" in one tap (the Home bill tick)', async () => {
    const aluguel = getDB().financialCategories.find((c) => c.name === 'Aluguel')!
    actions.update('financialCategories', aluguel.id, { bill: { every: 'mes', dueDay: 2 } })
    sheet()
    pick('Pagamento')
    fireEvent.click(screen.getByRole('button', { name: 'Já paguei: Pagar Aluguel' }))
    const paid = () => getDB().occurrences.find((o) => o.parentType === 'bill' && o.parentId === aluguel.id && o.status === 'done')
    expect(paid()).toBeTruthy()
    expect((await reload()).occurrences.some((o) => o.id === paid()!.id)).toBe(true)
  })

  it('Sono: horários + qualidade → the day check-in (also fills the 3-level sono)', async () => {
    sheet()
    pick('Sono')
    fireEvent.click(screen.getByRole('radio', { name: 'bom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar sono' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Sono anotado ✓'))
    const c = getDB().checkins.find((x) => x.date === DAY)!
    expect(c.sleep).toMatchObject({ bed: '23:00', wake: '07:00', hours: 8, quality: 4 })
    expect(c.sono).toBe('bom')
    expect((await reload()).checkins.find((x) => x.date === DAY)?.sleep?.hours).toBe(8)
  })

  it('Humor: 5 options + nota → check-in humor', async () => {
    sheet()
    pick('Humor')
    fireEvent.click(screen.getByRole('radio', { name: 'bem' }))
    fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'dia leve' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar humor' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Humor anotado ✓'))
    expect(getDB().checkins.find((x) => x.date === DAY)).toMatchObject({ humor: 4, nota: 'dia leve' })
    expect((await reload()).checkins.find((x) => x.date === DAY)?.humor).toBe(4)
  })

  it('Água: one tap = +1 copo on the same counter as Corpo', async () => {
    sheet()
    fireEvent.click(screen.getByRole('button', { name: /Mais um copo de água/ }))
    await waitFor(() => expect(lastToast()?.message).toMatch(/^Água: 1 de/))
    expect(getDB().checkins.find((x) => x.date === DAY)?.habits.agua).toBe(1)
    expect((await reload()).checkins.find((x) => x.date === DAY)?.habits.agua).toBe(1)
  })

  it('Marca UGC: name → ensureProspect (brand + opportunity, no duplicate)', async () => {
    sheet()
    pick('Marca UGC')
    fireEvent.change(screen.getByLabelText('Nome da marca'), { target: { value: 'Marca Teste Quick' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar marca' }))
    await waitFor(() => expect(lastToast()?.message).toMatch(/Marca Teste Quick/))
    const b = getDB().brands.find((x) => x.name === 'Marca Teste Quick')!
    expect(getDB().ugcOpportunities.some((o) => o.brandId === b.id)).toBe(true)
    expect((await reload()).brands.some((x) => x.id === b.id)).toBe(true)
  })
})

describe('Home progress line', () => {
  it('"N de M hoje" over the same rows as the Hoje list', () => {
    home()
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
    expect(Number(bar.getAttribute('aria-valuemax'))).toBeGreaterThan(5)
    expect(document.body.textContent).toMatch(/0 de \d+ hoje/)
  })
})

describe('ops', () => {
  it('sleepHours crosses midnight; undo restores the check-in exactly', () => {
    expect(sleepHours('23:30', '07:00')).toBe(7.5)
    expect(sleepHours('01:00', '08:00')).toBe(7)
    const u1 = addWater(DAY).undo
    const u2 = quickMood({ date: DAY, humor: 2 })
    u2()
    expect(getDB().checkins.find((c) => c.date === DAY)?.humor).toBeUndefined()
    u1()
    expect(getDB().checkins.find((c) => c.date === DAY)).toBeUndefined()
  })

  it('7-day averages', () => {
    quickSleep({ date: DAY, hours: 7, quality: 3 })
    quickSleep({ date: '2026-10-01', hours: 8, quality: 5 })
    quickMood({ date: '2026-10-01', humor: 4 })
    quickSleep({ date: '2026-09-20', hours: 4, quality: 1 })
    const w = sleepMoodWeek(getDB().checkins, DAY, '2026-09-26')
    expect(w).toMatchObject({ avgHours: 7.5, avgQuality: 4, avgHumor: 4 })
    expect(w.days.map((d) => d.date)).toEqual([DAY, '2026-10-01'])
  })
})
