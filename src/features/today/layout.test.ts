import { describe, expect, it } from 'vitest'
import { defaultProfile } from '@/data/defaults'
import { dayPart } from '@/lib/date'
import { orderWidgets } from './layout'
import { hm } from './test-utils'

const widgets = defaultProfile().homeWidgets

describe('orderWidgets', () => {
  it('keeps Agora first in every part of the day', () => {
    for (const part of ['manha', 'dia', 'noite'] as const) expect(orderWidgets(widgets, part)[0]).toBe('agora')
  })

  it('morning: routine, agenda, top 3, workout, meals', () => {
    expect(orderWidgets(widgets, 'manha').slice(1, 6)).toEqual(['manha', 'proximo_compromisso', 'top3', 'treino', 'refeicoes'])
  })

  it('midday: next appointment, tasks, food, work focus', () => {
    const o = orderWidgets(widgets, 'dia')
    expect(o.slice(1, 7)).toEqual(['proximo_compromisso', 'top3', 'tarefas', 'refeicoes', 'work_focus', 'treino'])
  })

  it('night: what is left, meals, spending, closing', () => {
    const o = orderWidgets(widgets, 'noite')
    expect(o.slice(1, 6)).toEqual(['top3', 'tarefas', 'refeicoes', 'gastos', 'fechamento'])
  })

  it('closing card only shows at night', () => {
    expect(orderWidgets(widgets, 'manha')).not.toContain('fechamento')
    expect(orderWidgets(widgets, 'dia')).not.toContain('fechamento')
  })

  it('respects hidden widgets and Marina’s order for the rest', () => {
    const custom = [
      { id: 'lendo_agora' as const, visible: true },
      { id: 'agora' as const, visible: true },
      { id: 'gastos' as const, visible: false },
      { id: 'luna' as const, visible: true },
      { id: 'estudo_atual' as const, visible: true },
    ]
    expect(orderWidgets(custom, 'dia')).toEqual(['agora', 'lendo_agora', 'luna', 'estudo_atual'])
    expect(orderWidgets(custom, 'manha')).toEqual(['agora', 'luna', 'lendo_agora', 'estudo_atual'])
  })

  it('uses profile day parts to decide', () => {
    expect(dayPart(hm(7), defaultProfile().dayParts)).toBe('manha')
    expect(dayPart(hm(13), defaultProfile().dayParts)).toBe('dia')
    expect(dayPart(hm(22), defaultProfile().dayParts)).toBe('noite')
  })
})
