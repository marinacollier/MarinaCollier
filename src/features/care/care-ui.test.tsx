/** Cuidar de Mim nas telas reais: toda aba renderiza, o rascunho de "quero escrever" não vai para o banco, o 5-4-3-2-1 avança por toque. */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import CarePage from './CarePage'

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed('2026-11-01'))
})
afterEach(() => cleanup())

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cuidar" element={<CarePage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Cuidar de Mim screens', () => {
  it.each(['', '?v=tecnicas', '?v=pausa', '?v=decidir', '?v=apoio', '?v=pausa&intencao=limite&contexto=email'])('tab %s renders', (q) => {
    at('/cuidar' + q)
    expect(screen.getAllByText('Cuidar de Mim').length).toBeGreaterThan(0)
  })

  it('apoio: ajuda humana com tel:', () => {
    at('/cuidar?v=apoio')
    const links = Array.from(document.querySelectorAll('a[href^="tel:"]')).map((a) => a.getAttribute('href'))
    for (const n of ['tel:188', 'tel:192', 'tel:112', 'tel:10111', 'tel:0800567567']) expect(links).toContain(n)
  })

  it('"quero escrever": rascunho não é salvo', () => {
    at('/cuidar')
    fireEvent.click(screen.getByText('Quero escrever'))
    expect(screen.getByText('não é salvo')).toBeTruthy()
    const before = JSON.stringify(getDB())
    fireEvent.change(screen.getByLabelText('Rascunho temporário, não é salvo'), { target: { value: 'texto íntimo' } })
    expect(JSON.stringify(getDB())).toBe(before)
    expect(JSON.stringify(getDB())).not.toContain('texto íntimo')
  })

  it('5-4-3-2-1 avança por toque', () => {
    at('/cuidar')
    fireEvent.click(screen.getByText('Fazer o 5-4-3-2-1 passo a passo'))
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText('Próximo'))
    fireEvent.click(screen.getByText('Terminei'))
    expect(screen.getByText(/O que mudou/)).toBeTruthy()
  })

  it('Modo Pausa: links abrem o app, nunca enviam', () => {
    at('/cuidar?v=pausa')
    expect(screen.getByText('Você envia. O app nunca envia nada sozinho.')).toBeTruthy()
    expect(document.querySelector('a[href^="https://wa.me/?text="]')).toBeTruthy()
    expect(document.querySelector('a[href^="mailto:?body="]')).toBeTruthy()
    expect(document.querySelector('a[href="https://instagram.com/direct/inbox/"]')).toBeTruthy()
  })
})
