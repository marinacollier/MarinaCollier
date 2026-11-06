import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { actions, applyModuleSeeds, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { apply1106 } from '@/data/calendar/fixture-1106'
import AgendaPage from './AgendaPage'

function renderAgenda(url = '/agenda?d=2026-11-09') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/agenda" element={<AgendaPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T13:00:00.000Z'))
})
afterAll(() => vi.useRealTimers())
beforeEach(async () => {
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  await hydrate(createMemoryAdapter())
  actions.replaceDB(apply1106(applyModuleSeeds(buildSeed('2026-11-06'), '2026-11-06')))
})
afterEach(cleanup)

describe('Agenda · calendário universal', () => {
  it('Dia 09/11: aula e caiaque no mesmo lugar; o detalhe abre sem formulário', () => {
    renderAgenda()
    const day = screen.getByLabelText('Dia 2026-11-09')
    expect(day.textContent).toContain('Aula · Bayswater Cape Town')
    expect(day.textContent).toContain('Caiaque com focas — Hout Bay')
    fireEvent.click(within(day).getByRole('button', { name: /^Caiaque com focas.*pendente/ }))
    const detail = screen.getByRole('article', { name: /^Detalhe: Caiaque/ })
    expect(detail.textContent).toContain('Aguardar a confirmação do grupo mínimo')
    expect(detail.textContent).toContain('Editar')
    expect(detail.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })

  it('Semana, Mês e Lista mostram o mesmo compromisso', () => {
    renderAgenda()
    for (const name of ['Semana', 'Mês', 'Lista']) {
      fireEvent.click(screen.getByRole('tab', { name }))
      expect(screen.getAllByText(/Caiaque com focas/).length).toBeGreaterThan(0)
    }
  })

  it('filtro Viagem esconde a aula (estudo) e Tudo volta à visão consolidada; a escolha fica no aparelho', () => {
    renderAgenda()
    const chips = screen.getByRole('group', { name: 'Filtrar por categoria' })
    fireEvent.click(within(chips).getByRole('button', { name: 'Viagem' }))
    let day = screen.getByLabelText('Dia 2026-11-09')
    expect(day.textContent).toContain('Caiaque')
    expect(day.textContent).not.toContain('Aula · Bayswater')
    expect(localStorage.getItem('marina-os:agenda:categorias')).toBe('["viagem"]')
    fireEvent.click(within(chips).getByRole('button', { name: 'Tudo' }))
    day = screen.getByLabelText('Dia 2026-11-09')
    expect(day.textContent).toContain('Aula · Bayswater')
  })
})
