import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { needsAttention } from '@/data/intel'
import { LumosInline } from './home/lumos'
import TodayPage from './TodayPage'

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname + loc.search}</div>
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-02T13:00:00.000Z')) // 10:00 in São Paulo, a Friday
})
afterAll(() => vi.useRealTimers())

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed('2026-10-02'))
})
afterEach(cleanup)

describe('Início (Lumos-first Home)', () => {
  it('renders the five blocks and nothing of the old dashboard', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bom dia, Marina.')
    expect(screen.getByLabelText('Fala com a Lumos')).toBeTruthy()
    expect(screen.getByLabelText('Agora')).toBeTruthy()
    expect(screen.getByLabelText('Hoje importa')).toBeTruthy()
    expect(screen.getByLabelText('Restante do dia')).toBeTruthy()
    const text = document.body.textContent ?? ''
    for (const gone of ['Brain dump', 'Top 3 de hoje', 'Lendo agora', 'Gastos', 'Linha do dia']) expect(text).not.toContain(gone)
  })

  it('no priorities yet → one tap to choose them with Lumos', () => {
    renderHome()
    expect(screen.getByText('escolher com a Lumos')).toBeTruthy()
  })

  it('shows today’s priorities as 01 · 02, max three', () => {
    for (const title of ['Um', 'Dois', 'Três', 'Quatro']) actions.create('priorities', { date: '2026-10-02', title, order: getDB().priorities.length, done: false })
    renderHome()
    expect(screen.getByText('01')).toBeTruthy()
    expect(screen.getByText('03')).toBeTruthy()
    expect(screen.queryByText('Quatro')).toBeNull()
  })

  it('the needs-attention row follows the real queue and disappears once everything is acked', () => {
    const now = { date: '2026-10-02', minutes: 600 }
    const items = needsAttention(getDB(), now)
    renderHome()
    if (items.length) expect(screen.getByLabelText('Precisa de você')).toBeTruthy()
    cleanup()
    for (const it of items) actions.create('attentionAcks', { key: it.key, how: 'dismissed' })
    expect(needsAttention(getDB(), now)).toEqual([])
    renderHome()
    expect(screen.queryByLabelText('Precisa de você')).toBeNull()
  })

  it('sending to Lumos answers inline when available, otherwise opens the conversation', () => {
    renderHome()
    fireEvent.change(screen.getByLabelText('Fala com a Lumos'), { target: { value: 'amanhã cancelei inglês' } })
    fireEvent.click(screen.getByLabelText('Enviar para a Lumos'))
    if (LumosInline) expect(screen.getByLabelText('Conversa com a Lumos')).toBeTruthy()
    else expect(screen.getByTestId('where').textContent).toBe('/lumos?q=amanh%C3%A3%20cancelei%20ingl%C3%AAs')
  })

  it('the avatar opens Ajustes', () => {
    renderHome()
    fireEvent.click(screen.getByLabelText('Ajustes e perfil'))
    expect(screen.getByTestId('where').textContent).toBe('/ajustes')
  })
})
