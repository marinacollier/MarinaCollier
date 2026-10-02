import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import type { HomeWidgetId } from '@/data/types'
import { orderWidgets, type LayoutContext } from './layout'

const widgets = buildSeed('2026-10-02').profile.homeWidgets
const ctx = (p: Partial<LayoutContext> = {}): LayoutContext => ({ part: 'manha', mode: 'normal', hasWorkoutToday: true, ...p })

describe('orderWidgets', () => {
  it('follows Marina’s order (§42) with Agora first; HOJE line lives in the header', () => {
    const o = orderWidgets(widgets, ctx())
    expect(o.slice(0, 9)).toEqual(['agora', 'top3', 'manha', 'proximo_compromisso', 'treino', 'work_focus', 'proxima_viagem', 'brain_dump', 'refeicoes'])
    expect(o).not.toContain('resumo_dia')
  })

  it('evening-only cards show only at night, right after the Top 3', () => {
    expect(orderWidgets(widgets, ctx())).not.toContain('amanha')
    expect(orderWidgets(widgets, ctx({ part: 'dia' }))).not.toContain('fechamento')
    expect(orderWidgets(widgets, ctx({ part: 'noite' })).slice(0, 4)).toEqual(['agora', 'top3', 'amanha', 'fechamento'])
  })

  it('energy baixa: only Agora, agenda, treino (if planned), one priority, brain dump', () => {
    expect(orderWidgets(widgets, ctx({ mode: 'baixa' }))).toEqual(['agora', 'top3', 'proximo_compromisso', 'treino', 'brain_dump'])
    expect(orderWidgets(widgets, ctx({ mode: 'baixa', hasWorkoutToday: false }))).not.toContain('treino')
  })

  it('Friday evening hides task/work lists', () => {
    const o = orderWidgets(widgets, ctx({ part: 'noite', mode: 'sexta' }))
    for (const id of ['tarefas', 'work_focus', 'waiting_for'] as HomeWidgetId[]) expect(o).not.toContain(id)
  })

  it('weekend: activity and travel first, work at the end', () => {
    const o = orderWidgets(widgets, ctx({ mode: 'fds' }))
    expect(o.slice(0, 3)).toEqual(['agora', 'treino', 'proxima_viagem'])
    expect(o.indexOf('work_focus')).toBeGreaterThan(o.indexOf('lendo_agora'))
  })

  it('a trip soon lifts the trip card after the Top 3', () => {
    const o = orderWidgets(widgets, ctx({ tripSoon: {} }))
    expect(o.indexOf('proxima_viagem')).toBe(o.indexOf('top3') + 1)
  })

  it('respects hidden widgets', () => {
    const custom = [
      { id: 'lendo_agora' as const, visible: true },
      { id: 'agora' as const, visible: true },
      { id: 'gastos' as const, visible: false },
      { id: 'luna' as const, visible: true },
    ]
    expect(orderWidgets(custom, ctx({ part: 'dia' }))).toEqual(['agora', 'lendo_agora', 'luna'])
  })
})
