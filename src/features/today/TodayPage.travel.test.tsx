import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
