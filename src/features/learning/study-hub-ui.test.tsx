/** Estudos hub on the real screen: what to study now, the agents, and the newsletter radar. */
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import StudyPage from './StudyPage'
import { RADAR_TAG } from './radar'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T21:00:00.000Z'))
})
afterAll(() => vi.useRealTimers())
beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed('2026-11-09'))
})
afterEach(cleanup)

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/estudos']}>
      <StudyPage />
    </MemoryRouter>,
  )

describe('Estudos (hub)', () => {
  it('shows "se quiser estudar agora", the agents, and keeps trilhas reachable', () => {
    renderPage()
    expect(screen.getByLabelText('Se quiser estudar agora')).toBeTruthy()
    const agents = screen.getByLabelText('Agentes de estudo')
    expect(within(agents).getByLabelText('English Coach')).toBeTruthy()
    expect(within(agents).getByLabelText('Carreira & mercado').textContent).toMatch(/nenhuma newsletter ainda/)
    expect(screen.getByText('Trilhas')).toBeTruthy()
  })

  it('pasting a newsletter stores it once and lists the hot skills', () => {
    renderPage()
    const box = screen.getByLabelText('Texto da newsletter')
    const text = '- PM Sênior · SQL, inglês fluente\n- PM IA · LLM e SQL'
    fireEvent.change(box, { target: { value: text } })
    fireEvent.click(screen.getByText('Guardar'))
    fireEvent.change(box, { target: { value: text } })
    fireEvent.click(screen.getByText('Guardar'))
    expect(getDB().studyItems.filter((i) => i.tags?.includes(RADAR_TAG))).toHaveLength(1)
    expect(screen.getByLabelText('Habilidades em alta nas vagas').textContent).toMatch(/SQL2 menções/)
  })
})
