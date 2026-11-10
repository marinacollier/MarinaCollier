import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { needsAttention } from '@/data/intel'
import { LumosSheet } from './home/lumos'
import { DayBlock } from './home/CleanBlocks'
import { NEEDS_MAX } from './home/clean'
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

/** [time, title] of each one-line row in a list (the timed column — not the Rotinas / Sem horário groups). */
const rowsOf = (el: HTMLElement) =>
  [...el.querySelectorAll('li')].filter((li) => !li.closest('[aria-label="Rotinas"], [aria-label="Sem horário"]')).map((li) => {
    const spans = li.querySelectorAll('button > span')
    return { time: spans[0]?.textContent ?? '', title: spans[1]?.textContent ?? '', text: li.textContent ?? '' }
  })

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

describe('Início limpo', () => {
  it('one header line · Hoje · Próximos dias — no greeting paragraph, no old dashboard', () => {
    renderHome()
    expect(screen.getByRole('banner').textContent).toContain('Sexta, 2 out')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByLabelText('Hoje')).toBeTruthy()
    expect(screen.getByLabelText('Próximos dias')).toBeTruthy()
    const text = document.body.textContent ?? ''
    for (const gone of ['Bom dia', 'Agora', 'Feitos hoje', 'abertas', 'Sem dia', 'No radar', 'Brain dump', 'Top 3 de hoje', 'Linha do dia', 'Sua noite', 'Prioridades', 'Painel da viagem', 'modo viagem'])
      expect(text).not.toContain(gone)
    expect(text).not.toMatch(/\d+ de \d+/)
    expect(screen.queryByLabelText('Filtrar por área')).toBeNull()
  })

  it('Hoje is time-ordered, one line per row (time + title + optional chip), from the universal calendar', () => {
    renderHome()
    const rows = rowsOf(screen.getByLabelText('Hoje'))
    expect(rows.length).toBeGreaterThan(0)
    const times = rows.map((r) => r.time)
    for (const t of times) expect(t).toMatch(/^(\d\d:\d\d|dia todo)$/)
    const timed = times.filter((t) => t !== 'dia todo')
    expect(timed).toEqual([...timed].sort())
    expect(times.indexOf('dia todo') === -1 || times.lastIndexOf('dia todo') < times.findIndex((t) => t !== 'dia todo') || times.every((t) => t === 'dia todo')).toBe(true)
    // No checks, no second line under the title.
    expect(screen.getByLabelText('Hoje').querySelectorAll('[role="checkbox"]').length).toBe(0)
    for (const li of screen.getByLabelText('Hoje').querySelectorAll('li')) expect(li.querySelectorAll('button > span').length).toBeLessThanOrEqual(3)
  })

  it('tapping a row opens the same detail as the Agenda (full text lives there)', () => {
    renderHome()
    // A commitment row (planned blocks and rituals open their own sheets).
    const first = [...screen.getByLabelText('Hoje').querySelectorAll('li button')].find((b) => !b.getAttribute('aria-label')) as HTMLButtonElement
    fireEvent.click(first)
    const dialog = screen.getByRole('dialog', { name: 'Detalhe do compromisso' })
    expect(within(dialog).getByRole('article')).toBeTruthy()
    fireEvent.click(within(dialog).getByLabelText('Fechar detalhe'))
  })

  it('an empty day says only "Dia livre"', () => {
    render(<DayBlock label="01 / Dia" title="Hoje" rows={[]} loose={[]} onOpen={() => {}} onLoose={() => {}} conflicts={0} onConflicts={() => {}} />)
    expect(screen.getByLabelText('Hoje').textContent).toBe('01 / DiaHojeDia livre')
  })

  it('Próximos dias: up to 7 days after tomorrow, up to 3 one-line rows each (+ expand), and "Ver agenda" → /agenda', () => {
    renderHome()
    const next = screen.getByLabelText('Próximos dias')
    const days = within(next).getAllByRole('group')
    expect(days.length).toBeGreaterThan(0)
    expect(days.length).toBeLessThanOrEqual(7)
    expect(days[0].getAttribute('aria-label')).not.toBe('Amanhã')
    for (const d of days) expect(d.querySelectorAll('li').length).toBeLessThanOrEqual(3)
    fireEvent.click(within(next).getByRole('link', { name: /Ver agenda/ }))
    expect(screen.getByTestId('where').textContent).toBe('/agenda')
  })

  it('Precisa de você: at most 3 short lines; gone once the queue is answered; "Ver tudo" → Tarefas', () => {
    const now = { date: '2026-10-02', minutes: 600 }
    const items = needsAttention(getDB(), now)
    for (let i = 0; i < 4; i++) actions.create('tasks', { title: `Atrasada ${i}`, status: 'todo', date: '2026-09-28', area: 'pessoal' } as never)
    renderHome()
    const box = screen.getByLabelText('Precisa de você')
    const rows = box.querySelectorAll('li')
    expect(rows.length).toBe(NEEDS_MAX)
    for (const li of rows) expect((li.textContent ?? '').length).toBeLessThanOrEqual(55)
    fireEvent.click(within(box).getByRole('link', { name: /Ver tudo/ }))
    expect(screen.getByTestId('where').textContent).toBe('/tarefas')
    cleanup()
    for (const it of items) actions.create('attentionAcks', { key: it.key, how: 'dismissed' })
    for (const t of getDB().tasks.filter((x) => x.title.startsWith('Atrasada'))) actions.remove('tasks', t.id)
    renderHome()
    const left = screen.queryByLabelText('Precisa de você')
    if (left) for (const li of left.querySelectorAll('li')) expect(li.textContent).toContain('atrasada')
  })

  it('the trip shows as ONE chip line when it is close, tappable to the trip', () => {
    renderHome()
    const chip = screen.queryByRole('link', { name: /Abrir a viagem/ })
    if (chip) {
      expect(chip.textContent).toMatch(/^✈︎ .+ (em \d+ dias|amanhã|hoje)$/)
      fireEvent.click(chip)
      expect(screen.getByTestId('where').textContent).toMatch(/^\/viagens\//)
    }
  })

  it('one small Lumos line: sending opens the answer sheet over Home when available, otherwise the conversation', { timeout: 15000 }, async () => {
    renderHome()
    fireEvent.change(screen.getByLabelText('Fala com a Lumos'), { target: { value: 'amanhã cancelei inglês' } })
    fireEvent.click(screen.getByLabelText('Enviar para a Lumos'))
    if (LumosSheet) {
      expect(await screen.findByRole('dialog', { name: 'Conversa com a Lumos' }, { timeout: 8000 })).toBeTruthy()
      expect(screen.getByLabelText('Fala com a Lumos')).toBeTruthy()
    } else expect(screen.getByTestId('where').textContent).toBe('/lumos?q=amanh%C3%A3%20cancelei%20ingl%C3%AAs')
  })

  it('the avatar opens Ajustes', () => {
    renderHome()
    fireEvent.click(screen.getByLabelText('Ajustes e perfil'))
    expect(screen.getByTestId('where').textContent).toBe('/ajustes')
  })

  it('CRM: ONE line "Oportunidades · N aguardando · M pedem ação" → the CRM; gone when nothing is open', () => {
    const db = getDB()
    const AT = '2026-10-01T10:00:00.000Z'
    actions.replaceDB({
      ...db,
      brands: [{ id: 'b1', createdAt: AT, updatedAt: AT, name: 'Ocean Drop' }, { id: 'b2', createdAt: AT, updatedAt: AT, name: 'Trail Co' }],
      ugcOpportunities: [
        { id: 'o1', createdAt: AT, updatedAt: AT, brandId: 'b1', title: 'UGC', stage: 'contatada', status: 'aguardando_resposta', firstContactAt: '2026-09-28', nextFollowUpAt: '2026-10-01' },
        { id: 'o2', createdAt: AT, updatedAt: AT, brandId: 'b2', title: 'UGC', stage: 'contatada', status: 'aguardando_resposta', firstContactAt: '2026-09-30', nextFollowUpAt: '2026-10-07' },
      ],
    })
    renderHome()
    const line = screen.getByLabelText('Abrir o CRM de marcas')
    expect(line.textContent).toBe('Oportunidades· 1 aguardando · 1 pede ação')
    fireEvent.click(line)
    expect(screen.getByTestId('where').textContent).toBe('/trabalho/creator/ugc?aba=marcas')
    cleanup()
    actions.replaceDB({ ...getDB(), ugcOpportunities: [] })
    renderHome()
    expect(screen.queryByLabelText('Abrir o CRM de marcas')).toBeNull()
  })
})
