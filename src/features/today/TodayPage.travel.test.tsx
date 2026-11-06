import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { actions, applyModuleSeeds, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import TodayPage from './TodayPage'
import { setTravelMode } from '@/features/travel/TravelModeLine'
import { materializeWeek } from '@/features/body/planner'

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<TodayPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-29T10:00:00.000Z')) // 07:00 in São Paulo · 12:00 in Cape Town
})
afterAll(() => vi.useRealTimers())

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(applyModuleSeeds(buildSeed('2026-10-29')))
})
afterEach(cleanup)

describe('Home in modo viagem', () => {
  it('shows the expedition day instead of the São Paulo routine', () => {
    renderHome()
    const card = screen.getByLabelText('Dia da viagem: South Africa 2026')
    expect(card.textContent).toContain('modo viagem · dia 6 de 24')
    expect(card.textContent).toContain('Aula 09:00–15:10 · Bayswater Cape Town')
    expect(card.textContent).toContain('Próxima saída 16:00 · Piscina de água salgada')
    expect(card.textContent).toContain('Rotina de SP pausada até 16/11')
    const hoje = screen.getByLabelText('Hoje').textContent ?? ''
    expect(hoje).toContain('Aula · Bayswater Cape Town')
    for (const sp of ['Milagre da Manhã', 'Encerrar o dia', 'Natação', 'Passeio', 'Cerâmica']) expect(hoje).not.toContain(sp)
  })

  it('shows the operational panel on top, from stored data only — urgent first, the rest one tap away', () => {
    renderHome()
    const panel = screen.getByLabelText('Painel da viagem')
    expect(panel.textContent).toContain('viagem · ')
    // First level (2.0): no agenda/money lists until she opens the full panel.
    expect(screen.queryByLabelText('Agenda da viagem')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ver painel completo/ }))
    expect(screen.getByLabelText('Agenda da viagem')).toBeTruthy()
    const money = screen.getByLabelText('Gastos e saldo').textContent ?? ''
    for (const k of ['pago', 'comprometido', 'estimado']) expect(money).toContain(k)
    // No balance stored: says so, never a computed "available".
    expect(money).toContain('Saldo Wise não informado — atualizar')
    expect(panel.textContent).toContain('Abrir centro de comando')
    // The rest of Home is still there, below.
    expect(screen.getByLabelText('Dia da viagem: South Africa 2026')).toBeTruthy()
    expect(screen.getByLabelText('Hoje')).toBeTruthy()
  })

  it('shows the wallet balance only when she typed it', () => {
    const t = getDB().trips.find((x) => x.expedition)!
    actions.update('trips', t.id, { expedition: { ...t.expedition!, walletBalance: { cents: 1234500, asOf: '2026-10-29', source: 'Wise' } } })
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: /Ver painel completo/ }))
    const money = screen.getByLabelText('Gastos e saldo').textContent ?? ''
    expect(money).toContain('Saldo disponível')
    expect(money).toContain('12.345')
    expect(money).not.toContain('não informado')
  })

  it('the switch on the trip turns it off (routine back) and on again (generated base removed)', () => {
    const trip = () => getDB().trips.find((t) => t.expedition)!
    setTravelMode(trip(), false)
    renderHome()
    expect(screen.queryByLabelText('Dia da viagem: South Africa 2026')).toBeNull()
    expect(screen.getByLabelText('Hoje').textContent).toContain('Encerrar o dia')
    cleanup()
    // with it off, "Trazer a base" brings São Paulo workouts into the trip week…
    const base = materializeWeek(getDB(), '2026-10-26', '2026-10-29')
    expect(base.length).toBeGreaterThan(0)
    actions.createMany('workouts', base)
    // …and turning it back on removes them (untouched), with Desfazer available.
    const { removed } = setTravelMode(trip(), true)
    expect(removed.length).toBe(base.length)
    expect(getDB().workouts.some((w) => w.date >= '2026-10-29' && w.date <= '2026-11-01' && w.status === 'planejado')).toBe(false)
    expect(getDB().trips.find((t) => t.expedition)!.pauseHomeRoutine).toBe(true)
  })
})
