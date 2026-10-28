/** Ateliê on the real screens: every tab renders, a work page renders, the lock hides everything. */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { lockSession, unlockSession } from '@/app/lock-store'
import { actions, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { ATELIE_IDS } from '@/data/seed/atelie'
import AteliePage from './AteliePage'
import WorkPage from './WorkPage'

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed('2026-10-27'))
  unlockSession()
})
afterEach(() => cleanup())

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/atelie" element={<AteliePage />} />
        <Route path="/atelie/obra/:id" element={<WorkPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Ateliê screens', () => {
  it.each(['', '?v=biblioteca', '?v=colecoes', '?v=evolucao', '?v=mapa', '?v=laboratorio'])('tab %s renders', (q) => {
    at('/atelie' + q)
    expect(screen.getAllByText('Ateliê Literário').length).toBeGreaterThan(0)
  })

  it('library lists the seeded works with "texto pendente"', () => {
    at('/atelie?v=biblioteca')
    expect(screen.getByText('A Cadeira')).toBeTruthy()
    expect(screen.getAllByText('texto pendente').length).toBe(9)
  })

  it('a seeded work shows its excerpts as excerpts and the provenance flag', () => {
    at('/atelie/obra/' + encodeURIComponent(ATELIE_IDS.aCadeira))
    expect(screen.getAllByText('“Era eu quem continuava guardando o lugar.”').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/verificar aprovação/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Versões' }))
    expect(screen.getByText('Nenhuma versão ainda')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Ficha' }))
    expect(screen.getByRole('textbox', { name: 'Título' })).toBeTruthy()
  })

  it('locked: nothing of the Ateliê is on screen', () => {
    actions.setProfile({ privacyLock: { enabled: true, areas: ['atelie'], pinHash: 'h', pinSalt: 's', relockMinutes: 5 } })
    lockSession()
    at('/atelie/obra/' + encodeURIComponent(ATELIE_IDS.aCadeira))
    expect(screen.getByText('Ateliê Literário está protegido')).toBeTruthy()
    expect(screen.queryByText(/guardando o lugar/)).toBeNull()
  })
})
