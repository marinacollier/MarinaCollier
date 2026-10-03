import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import type { HomeWidgetId } from '@/data/types'
import { COLLECTION_KEYS, COLLECTION_LABELS } from './backup'
import { WIDGET_META } from './labels'
import { mergeWidgets, normalizeChecklist, setWorkDay, workWeekSummary } from './profileEdit'

describe('profile editing helpers', () => {
  it('changes one weekday mode without touching the others', () => {
    const days = { 0: 'off', 1: 'remoto', 2: 'presencial', 3: 'presencial', 4: 'remoto', 5: 'remoto', 6: 'off' } as const
    const next = setWorkDay({ ...days }, 4, 'presencial')
    expect(next[4]).toBe('presencial')
    expect(next[2]).toBe('presencial')
    expect(workWeekSummary(next)).toBe('presencial: ter, qua, qui')
    expect(workWeekSummary({ ...days, 2: 'remoto', 3: 'remoto' })).toBe('sem dias presenciais')
  })

  it('normalizes the presencial checklist', () => {
    expect(normalizeChecklist([' Roupa ', '', 'roupa', 'Notebook', '  '])).toEqual(['Roupa', 'Notebook'])
  })

  it('keeps the seed widget order and appends unknown-to-profile widgets hidden', () => {
    const known = Object.keys(WIDGET_META) as HomeWidgetId[]
    const seed = buildSeed('2026-10-02').profile.homeWidgets
    const merged = mergeWidgets(seed, known)
    expect(merged.slice(0, 8).map((w) => w.id)).toEqual(['agora', 'linha_do_dia', 'top3', 'manha', 'proximo_compromisso', 'treino', 'refeicoes', 'work_focus'])
    expect(merged.map((w) => w.id).sort()).toEqual([...known].sort())
    const partial = mergeWidgets([{ id: 'top3' as HomeWidgetId, visible: true }], known)
    expect(partial[0]).toEqual({ id: 'top3', visible: true })
    expect(partial.slice(1).every((w) => !w.visible)).toBe(true)
  })

  it('every collection has a backup label', () => {
    for (const k of COLLECTION_KEYS) expect(COLLECTION_LABELS[k], k).toBeTruthy()
  })
})
