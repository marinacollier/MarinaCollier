import { describe, expect, it } from 'vitest'
import type { MemoryView } from '@/data/intel'
import type { MemoryItem } from '@/data/types'
import { groupMemory } from './memory'

const item = (p: Partial<MemoryItem>): MemoryItem => ({ id: p.text ?? 'x', createdAt: '', updatedAt: '', kind: 'fact', area: 'rotina', text: 'x', status: 'confirmed', source: 'seed', ...p })
const view = (layer: MemoryView['layer'], p: Partial<MemoryItem> = {}): MemoryView => ({ layer, text: p.text ?? 'x', provenance: 'fact', confidence: 'high', item: item(p) })

describe('O que Lumos sabe sobre mim', () => {
  it('orders sections: agora, fatos, preferências, percebi, exceções, histórico', () => {
    const g = groupMemory([
      view('fact', { text: 'terminou um livro', kind: 'history' }),
      view('pattern', { text: 'treino às 06:00', status: 'observed' }),
      view('preference', { text: 'treino pesado de manhã', kind: 'preference' }),
      view('fact', { text: 'mora em São Paulo' }),
      view('state', { text: 'lendo CDH', kind: 'state' }),
    ])
    expect(g.map((s) => s.section)).toEqual(['state', 'fact', 'preference', 'pattern', 'history'])
  })

  it('archived items never show; empty sections are omitted', () => {
    expect(groupMemory([view('fact', { status: 'archived' })])).toEqual([])
  })
})
