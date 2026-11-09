/** Aprendizagem on the real screen: distribution by domain (once per session), languages, review flow. */
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { card, sess } from './engine/fixtures'
import { TRACK_EN } from './engine/model'
import LearningPage from './LearningPage'

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

const renderPage = (path = '/estudos/aprendizagem') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LearningPage />
    </MemoryRouter>,
  )

describe('LearningPage', () => {
  it('shows each session once in its main domain, with "também tocou" for the others', () => {
    const db = getDB()
    actions.replaceDB({
      ...db,
      studySessions: [sess('s1', { domain: 'moda_fashiontech', relatedDomains: ['idiomas'], minutes: 40, date: '2026-11-09' }), sess('s2', { domain: 'idiomas', trackId: TRACK_EN, minutes: 60, date: '2026-11-09', skills: ['speaking'] })],
    })
    renderPage()
    const dist = screen.getByLabelText('Distribuição por área')
    expect(within(dist).getByText('Moda e fashiontech')).toBeTruthy()
    expect(dist.textContent).toMatch(/também tocou em 40 min/)
    expect(screen.getByLabelText('Resumo').textContent).toMatch(/1h40/)
    const en = screen.getByLabelText(/Idioma Inglês/)
    expect(en.textContent).toMatch(/meta C1/)
    expect(en.textContent).toMatch(/nível: a avaliar/)
  })

  it('review flow: show correction → acertei moves the card forward', () => {
    const db = getDB()
    actions.replaceDB({ ...db, learningErrors: [card('c1', { front: 'I now the answer', back: 'I know the answer', trackId: TRACK_EN, domain: 'idiomas', nextReview: '2026-11-09' })] })
    renderPage('/estudos/aprendizagem?v=revisar')
    const box = screen.getByLabelText('Revisão')
    expect(box.textContent).toMatch(/I now the answer/)
    fireEvent.click(within(box).getByText('Mostrar correção'))
    fireEvent.click(within(box).getByText('Acertei'))
    const c = getDB().learningErrors.find((x) => x.id === 'c1')!
    expect(c.status).toBe('em_pratica')
    expect(c.nextReview > '2026-11-09').toBe(true)
  })
})
