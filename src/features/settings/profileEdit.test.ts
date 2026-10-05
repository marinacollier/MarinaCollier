import { describe, expect, it } from 'vitest'
import { COLLECTION_KEYS, COLLECTION_LABELS } from './backup'
import { normalizeChecklist, setWorkDay, workWeekSummary } from './profileEdit'

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

  it('every collection has a backup label', () => {
    for (const k of COLLECTION_KEYS) expect(COLLECTION_LABELS[k], k).toBeTruthy()
  })
})
