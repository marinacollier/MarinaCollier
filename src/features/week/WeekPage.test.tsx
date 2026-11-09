import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { actions, applyModuleSeeds, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import WeekPage from './WeekPage'

function renderWeek(url = '/minha-semana?d=2026-11-16') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/minha-semana" element={<WeekPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-16T13:00:00.000Z'))
})
afterAll(() => vi.useRealTimers())
beforeEach(async () => {
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  await hydrate(createMemoryAdapter())
  actions.replaceDB(applyModuleSeeds(buildSeed('2026-11-16'), '2026-11-16'))
})
afterEach(cleanup)

describe('Minha semana', () => {
  it('7-day strip, the day timeline with free gaps, and no capacity cards until a project has horas por semana', () => {
    renderWeek()
    expect(screen.getByRole('heading', { name: 'Minha semana' })).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    expect(screen.getByLabelText('Dia 2026-11-16').textContent).toMatch(/livres entre/)
    expect(screen.getByLabelText('Capacidade de trabalho')).toBeTruthy()
    expect(screen.queryByLabelText(/^Capacidade Santander/)).toBeNull()
    fireEvent.click(screen.getAllByRole('tab')[3])
    expect(screen.getByLabelText('Dia 2026-11-19')).toBeTruthy()
  })

  it('a project with weeklyHours gets its card; a concluded one never does', () => {
    const ff = getDB().projects.find((p) => p.id === 'proj-fashionfinder')!
    actions.update('projects', ff.id, { weeklyHours: 20, status: 'ativo' })
    actions.update('projects', 'proj-santander', { weeklyHours: 40, status: 'concluido' })
    renderWeek()
    const card = screen.getByLabelText(`Capacidade ${ff.name}`)
    expect(card.textContent).toContain('planejado 20 h')
    expect(screen.queryByLabelText(/^Capacidade Santander/)).toBeNull()
  })
})
