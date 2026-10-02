import { describe, expect, it } from 'vitest'
import { buildFixture, FIXTURE_TODAY } from '@/features/search/test-fixture'
import { buildCommands, filterCommands, fuzzyScore } from './commands'

const cmds = buildCommands(buildFixture(), FIXTURE_TODAY)
const labels = (q: string) => filterCommands(cmds, q).map((c) => c.label)

describe('command palette', () => {
  it('builds static creates, dynamic projects/trips and routes', () => {
    const all = cmds.map((c) => c.label)
    expect(all).toEqual(
      expect.arrayContaining([
        'Criar tarefa',
        'Adicionar gasto',
        'Registrar treino',
        'Registrar refeição',
        'Registrar ideia',
        'Tirar da cabeça',
        'Adicionar livro',
        'Novo compromisso',
        'Abrir FashionFinder',
        'Ver viagem África do Sul',
        'Ver viagem Recife',
        'Ir para Dinheiro',
      ]),
    )
    // paused projects are still "active" (not concluded); concluded ones would be hidden
    expect(all).toContain('Abrir Yoga Studio')
  })

  it('empty query lists everything, creates first', () => {
    const list = filterCommands(cmds, '')
    expect(list).toHaveLength(cmds.length)
    expect(list[0].section).toBe('criar')
  })

  it('filters by fuzzy match on labels', () => {
    expect(labels('gasto')[0]).toBe('Adicionar gasto')
    expect(labels('fashion')[0]).toBe('Abrir FashionFinder')
    expect(labels('africa')[0]).toBe('Ver viagem África do Sul')
    expect(labels('crtar')).toContain('Criar tarefa')
    expect(labels('refeicao')[0]).toBe('Registrar refeição')
  })

  it('finds commands through keywords', () => {
    expect(labels('despesa')).toContain('Adicionar gasto')
    expect(labels('almoço')).toContain('Registrar refeição')
    expect(labels('brain dump')).toContain('Tirar da cabeça')
    expect(labels('calendario')).toContain('Ir para Agenda')
  })

  it('has "Ir para Montar minha semana"', () => {
    expect(labels('montar')[0]).toBe('Ir para Montar minha semana')
    expect(labels('planejar')).toContain('Ir para Montar minha semana')
    expect(cmds.find((c) => c.label === 'Ir para Montar minha semana')!.action).toEqual({ kind: 'route', to: '/semana' })
  })

  it('returns nothing for nonsense', () => {
    expect(labels('zzqx')).toEqual([])
  })

  it('actions: creates open sheets with defaults, navigation routes', () => {
    const task = cmds.find((c) => c.id === 'new-task')!
    expect(task.action).toEqual({ kind: 'sheet', name: 'task', props: { defaults: { date: FIXTURE_TODAY } } })
    expect(cmds.find((c) => c.label === 'Abrir FashionFinder')!.action).toEqual({ kind: 'route', to: '/trabalho/projeto/proj-fashionfinder' })
  })

  it('fuzzyScore prefers prefix and word-start matches', () => {
    expect(fuzzyScore('tre', 'Registrar treino')).toBeGreaterThan(fuzzyScore('tre', 'Abrir Nutre'))
    expect(fuzzyScore('reg', 'Registrar treino')).toBeGreaterThan(fuzzyScore('reg', 'Ir para Pregão'))
  })
})
