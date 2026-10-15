import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { needsAttention } from '@/data/intel'
import { LumosSheet } from './home/lumos'
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
  it('renders greeting · Lumos · Hoje · Próximos dias — and nothing of the old dashboard', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bom dia, Marina.')
    expect(screen.getByLabelText('Fala com a Lumos')).toBeTruthy()
    expect(screen.getByLabelText('Hoje')).toBeTruthy()
    expect(screen.getByLabelText('Próximos dias')).toBeTruthy()
    const text = document.body.textContent ?? ''
    for (const gone of ['Brain dump', 'Top 3 de hoje', 'Lendo agora', 'Gastos', 'Linha do dia', 'Hoje importa', 'Quando der hoje', 'Mais cedo']) expect(text).not.toContain(gone)
  })

  it('free-text priorities show as rows of Hoje (max three), checkable', () => {
    for (const title of ['Um', 'Dois', 'Três', 'Quatro']) actions.create('priorities', { date: '2026-10-02', title, order: getDB().priorities.length, done: false })
    renderHome()
    const hoje = screen.getByLabelText('Hoje')
    expect(hoje.textContent).toContain('Um')
    expect(hoje.textContent).toContain('Três')
    expect(hoje.textContent).not.toContain('Quatro')
    fireEvent.click(screen.getByLabelText('Concluir: Um'))
    expect(getDB().priorities.find((p) => p.title === 'Um')?.done).toBe(true)
  })

  it('every row uses the standard check, and tapping a row opens the quick-edit sheet', async () => {
    const { useUI } = await import('@/app/ui-store')
    renderHome()
    const hoje = screen.getByLabelText('Hoje')
    expect(hoje.querySelectorAll('button[role="checkbox"]').length).toBeGreaterThan(0)
    const body = hoje.querySelector('li button:not([role="checkbox"])') as HTMLButtonElement
    fireEvent.click(body)
    expect(useUI.getState().sheets.at(-1)?.name).toBe('itemEdit')
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

  it('sending to Lumos opens the answer sheet over Home when available, otherwise the conversation', { timeout: 15000 }, async () => {
    renderHome()
    fireEvent.change(screen.getByLabelText('Fala com a Lumos'), { target: { value: 'amanhã cancelei inglês' } })
    fireEvent.click(screen.getByLabelText('Enviar para a Lumos'))
    if (LumosSheet) {
      expect(await screen.findByRole('dialog', { name: 'Conversa com a Lumos' }, { timeout: 8000 })).toBeTruthy()
      // Home itself stays as it was: the composer is still there, the page didn't swap.
      expect(screen.getByLabelText('Fala com a Lumos')).toBeTruthy()
    }
    else expect(screen.getByTestId('where').textContent).toBe('/lumos?q=amanh%C3%A3%20cancelei%20ingl%C3%AAs')
  })

  it('the avatar opens Ajustes', () => {
    renderHome()
    fireEvent.click(screen.getByLabelText('Ajustes e perfil'))
    expect(screen.getByTestId('where').textContent).toBe('/ajustes')
  })
})
