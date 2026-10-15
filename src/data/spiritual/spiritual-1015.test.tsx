/**
 * Bíblia 15/10: reconciliation by preview (writes nothing until Aplicar, applied once), notebook autosave into
 * one record, the 3-step study keeping what she typed, "Importar estudo" (preview, conflicts, idempotent),
 * retroactive marking — and all of it surviving a restart (hydrate).
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { actions, detachStorage, flushNow, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { sessionSeedId } from '../seed/spiritual'
import { applyUpdate, pendingUpdate, previewUpdate } from './reconcile'
import { markSessionsDone, saveJournalDraft, setSessionDone } from './ops'
import { applyStudyImport, parseStudyImport, previewStudyImport } from './import'
import { journalFor, weekSummary } from './model'
import SessionPage from '@/features/spiritual/SessionPage'

const AMOS = sessionSeedId('profetas', 'amos-5')
const ex = (n: number) => sessionSeedId('exodo', n)
const exodo = () => getDB().spiritualSessions.filter((s) => s.planId === 'seed:biblia:exodo')

afterEach(() => {
  cleanup()
  detachStorage()
})

async function fresh() {
  const device = createMemoryAdapter()
  await hydrate(device)
  return device
}

describe('reconciliation 15/10', () => {
  it('the preview writes nothing and lists what would change (and what stays)', async () => {
    await fresh()
    const before = JSON.stringify(getDB())
    const u = previewUpdate(getDB())
    expect(JSON.stringify(getDB())).toBe(before)
    expect(u.applied).toBe(false)
    expect(u.changes.find((c) => c.kind === 'mark_done')?.sessionId).toBe(AMOS)
    expect(u.changes.find((c) => c.kind === 'set_keyword')?.text).toContain('Justiça')
    expect(u.changes.find((c) => c.kind === 'missing_reflection')?.text).toBe('Reflexões de Amós 5 ainda não salvas — cole ou escreva')
    expect(u.changes.some((c) => c.reference === 'Êxodo 1–5' && !c.writes)).toBe(true)
    expect(u.changes.some((c) => c.sessionId === ex(6) && !c.writes)).toBe(true)
    expect(pendingUpdate(getDB())?.id).toBe('2026-10-15')
  })

  it('Aplicar: Amós 5 done WITHOUT a date + note, keyword only; Êxodo untouched; once only; survives restart', async () => {
    const device = await fresh()
    const exBefore = JSON.stringify(exodo())
    expect(applyUpdate()).toBe(2)
    const amos = getDB().spiritualSessions.find((s) => s.id === AMOS)!
    expect(amos.status).toBe('concluido')
    expect(amos.completedAt).toBeUndefined()
    expect(amos.doneNote).toBe('leitura confirmada por foto (versículos destacados)')
    const j = journalFor(getDB(), AMOS)
    expect(j).toHaveLength(1)
    expect(j[0]).toMatchObject({ keyword: 'Justiça' })
    expect(j[0].personalReflection).toBeUndefined() // never invented
    expect(JSON.stringify(exodo())).toBe(exBefore)
    expect(exodo().filter((s) => s.status === 'concluido').map((s) => s.id)).toEqual([1, 2, 3, 4, 5].map(ex))
    expect(exodo().find((s) => s.id === ex(6))!.status).toBe('pendente')
    expect(getDB().profile.spiritualUpdatesApplied).toEqual(['2026-10-15'])
    // Once.
    const after = JSON.stringify(getDB())
    expect(applyUpdate()).toBe(0)
    expect(JSON.stringify(getDB())).toBe(after)
    expect(pendingUpdate(getDB())).toBeUndefined()
    // Restart.
    await flushNow()
    detachStorage()
    await hydrate(device)
    expect(getDB().spiritualSessions.find((s) => s.id === AMOS)).toMatchObject({ status: 'concluido', completedAt: undefined })
    expect(getDB().profile.spiritualUpdatesApplied).toEqual(['2026-10-15'])
    expect(pendingUpdate(getDB())).toBeUndefined()
  })

  it('preserves a status/date and a keyword she already has', async () => {
    await fresh()
    setSessionDone(AMOS, true)
    const at = getDB().spiritualSessions.find((s) => s.id === AMOS)!.completedAt
    saveJournalDraft(AMOS, { keyword: 'Profecia', personalReflection: 'Minha reflexão.' })
    const u = previewUpdate(getDB())
    expect(u.changes.some((c) => c.writes)).toBe(false)
    expect(u.changes.some((c) => c.kind === 'missing_reflection')).toBe(false)
    expect(pendingUpdate(getDB())).toBeUndefined()
    applyUpdate()
    expect(getDB().spiritualSessions.find((s) => s.id === AMOS)!.completedAt).toBe(at)
    expect(journalFor(getDB(), AMOS)[0]).toMatchObject({ keyword: 'Profecia', personalReflection: 'Minha reflexão.' })
  })
})

describe('notebook autosave', () => {
  it('drafts go to ONE record per session, updated in place', async () => {
    await fresh()
    expect(saveJournalDraft(ex(6), { personalReflection: '' })).toBeUndefined()
    const a = saveJournalDraft(ex(6), { personalReflection: 'Deus' })!
    saveJournalDraft(ex(6), { personalReflection: 'Deus ouve', keyword: 'Nome' })
    saveJournalDraft(ex(6), { personalReflection: 'Deus ouve o clamor', keyword: 'Nome', prayer: 'Amém' })
    const list = journalFor(getDB(), ex(6))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: a.id, personalReflection: 'Deus ouve o clamor', keyword: 'Nome', prayer: 'Amém' })
    expect(getDB().spiritualSessions.find((s) => s.id === ex(6))!.status).toBe('em_andamento') // never done
  })

  it('study page: switching Ler/Refletir/Orar keeps what she typed; autosave writes one record', async () => {
    await fresh()
    render(
      <MemoryRouter initialEntries={[`/biblia/estudo/${encodeURIComponent(ex(6))}`]}>
        <Routes>
          <Route path="/biblia/estudo/:id" element={<SessionPage />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Refletir' }))
    fireEvent.change(screen.getByLabelText('Escrita livre'), { target: { value: 'Eu sou o Senhor.' } })
    fireEvent.change(screen.getByLabelText('Palavra-chave'), { target: { value: 'Promessa' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Orar' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Sua oração' }), { target: { value: 'Obrigada.' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Ler' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Refletir' }))
    expect((screen.getByLabelText('Escrita livre') as HTMLTextAreaElement).value).toBe('Eu sou o Senhor.')
    fireEvent.click(screen.getByRole('tab', { name: 'Escrita guiada' }))
    expect((screen.getByRole('textbox', { name: 'O que isso desperta em mim?' }) as HTMLTextAreaElement).value).toBe('Eu sou o Senhor.')
    await waitFor(() => expect(screen.getByText('Salvo')).toBeTruthy(), { timeout: 3000 })
    const list = journalFor(getDB(), ex(6))
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ personalReflection: 'Eu sou o Senhor.', keyword: 'Promessa', prayer: 'Obrigada.' })
    expect(getDB().spiritualSessions.find((s) => s.id === ex(6))!.status).not.toBe('concluido')
    // Concluir não depende do caderno.
    act(() => fireEvent.click(screen.getAllByText('Concluir estudo')[0]))
    expect(getDB().spiritualSessions.find((s) => s.id === ex(6))!.status).toBe('concluido')
  })
})

describe('Importar estudo', () => {
  const PASTE = JSON.stringify({
    reference: 'Amos 5',
    resumo: 'Justiça como as águas.',
    contextoHistorico: 'Israel do norte, século VIII a.C.',
    reflexoes: { deus: 'Deus odeia o culto sem justiça.', pessoal: 'Texto do JSON.' },
    palavraChave: 'Justiça',
    oracao: 'Que a justiça corra.',
  })

  it('validates', () => {
    expect(parseStudyImport('não é json').ok).toBe(false)
    expect(parseStudyImport('{"resumo":"x"}')).toMatchObject({ ok: false })
    expect(parseStudyImport('{"reference":"Amós 5","resumo":3}')).toMatchObject({ ok: false })
    expect(parseStudyImport('```json\n' + PASTE + '\n```').ok).toBe(true)
  })

  it('preview writes nothing; her text is protected; apply writes only checked; never changes status; idempotent', async () => {
    const device = await fresh()
    saveJournalDraft(AMOS, { personalReflection: 'Meu texto.' })
    const status = getDB().spiritualSessions.find((s) => s.id === AMOS)!.status
    const r = parseStudyImport(PASTE)
    if (!r.ok) throw new Error('parse')
    const before = JSON.stringify(getDB())
    const p = previewStudyImport(getDB(), r.data)!
    expect(JSON.stringify(getDB())).toBe(before)
    expect(p.session.id).toBe(AMOS)
    const pessoal = p.fields.find((f) => f.key === 'reflexoes.pessoal')!
    expect(pessoal).toMatchObject({ mine: true, defaultChecked: false, existing: 'Meu texto.' })
    const checked = p.fields.filter((f) => f.defaultChecked).map((f) => f.key)
    expect(checked).toEqual(['resumo', 'contextoHistorico', 'reflexoes.deus', 'palavraChave', 'oracao'])

    const written = applyStudyImport(r.data, checked.filter((k) => k !== 'oracao'))
    expect(written).toEqual(['resumo', 'contextoHistorico', 'reflexoes.deus', 'palavraChave'])
    const j = journalFor(getDB(), AMOS)
    expect(j).toHaveLength(1)
    expect(j[0]).toMatchObject({ personalReflection: 'Meu texto.', reflectionGod: 'Deus odeia o culto sem justiça.', keyword: 'Justiça' })
    expect(j[0].prayer).toBeUndefined()
    const studies = getDB().spiritualStudies.filter((s) => s.sessionId === AMOS)
    expect(studies).toHaveLength(1)
    expect(studies[0]).toMatchObject({ contentSource: 'importado', content: { explicacao: 'Justiça como as águas.', contextoHistorico: 'Israel do norte, século VIII a.C.' } })
    expect(getDB().spiritualSessions.find((s) => s.id === AMOS)!.status).toBe(status)
    expect(getDB().profile.spiritualImports).toHaveLength(1)

    // Same paste again: recognised, nothing new written.
    const p2 = previewStudyImport(getDB(), r.data)!
    expect(p2.alreadyImported).toBe(true)
    const snap = JSON.stringify(getDB())
    expect(applyStudyImport(r.data, ['resumo', 'contextoHistorico', 'reflexoes.deus', 'palavraChave'])).toEqual([])
    expect(JSON.stringify(getDB())).toBe(snap)

    await flushNow()
    detachStorage()
    await hydrate(device)
    expect(getDB().spiritualStudies.filter((s) => s.sessionId === AMOS)).toHaveLength(1)
    expect(getDB().profile.spiritualImports).toHaveLength(1)
  })
})

describe('retroactive marking + week', () => {
  it('marks several chapters with unknown or chosen date (never invented), keeps done ones, survives restart', async () => {
    const device = await fresh()
    const d1 = getDB().spiritualSessions.find((s) => s.id === ex(1))!
    expect(markSessionsDone([ex(1), ex(6), ex(7)])).toBe(2)
    expect(getDB().spiritualSessions.find((s) => s.id === ex(1))).toEqual(d1)
    expect(getDB().spiritualSessions.find((s) => s.id === ex(6))).toMatchObject({ status: 'concluido', completedAt: undefined, doneNote: 'data desconhecida' })
    expect(markSessionsDone([ex(8)], '2026-10-14')).toBe(1)
    const e8 = getDB().spiritualSessions.find((s) => s.id === ex(8))!
    expect(e8.completedAt!.startsWith('2026-10-14')).toBe(true)
    actions.create('spiritualPrayers', { content: 'Pela minha família', category: 'intencao' })
    await flushNow()
    detachStorage()
    await hydrate(device)
    expect(getDB().spiritualSessions.find((s) => s.id === ex(7))).toMatchObject({ status: 'concluido', completedAt: undefined })
    const w = weekSummary(getDB(), '2026-10-15')
    expect(w.done.map((s) => s.id)).toContain(ex(8))
    expect(w.done.map((s) => s.id)).not.toContain(ex(6)) // no date → not placed in a week
    expect(w.next?.id).toBe(ex(9))
  })
})
