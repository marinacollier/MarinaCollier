import { describe, expect, it } from 'vitest'
import { buildLifeFixture, LIFE_TODAY } from '@/features/search/life-fixture'
import { askLumos } from './chief'
import type { AnswerBlock, LumosAnswer } from './types'

const db = buildLifeFixture()
const ask = (q: string, today = LIFE_TODAY, minutes = 8 * 60): LumosAnswer => JSON.parse(JSON.stringify(askLumos(db, q, today, minutes)).replace(/\u00a0/g, ' '))
const lists = (a: LumosAnswer) => a.blocks.filter((b): b is Extract<AnswerBlock, { kind: 'list' }> => b.kind === 'list')
const list = (a: LumosAnswer, title: string) => lists(a).find((l) => l.title === title)
const texts = (a: LumosAnswer) => a.blocks.filter((b): b is Extract<AnswerBlock, { kind: 'text' }> => b.kind === 'text').map((b) => b.text)

describe('Lumos · planning intents (life-shaped data)', () => {
  it('"Quando consigo encaixar yoga?" respects the check-in rule and creates a flexible workout on tap', () => {
    const a = ask('Quando consigo encaixar yoga?')
    expect(a.agents.map((x) => x.id)).toEqual(['training']) // the "Yoga App" project doesn't hijack it
    const items = list(a, 'Toque pra planejar')!.items
    // today: swim already uses the daily check-in → skipped, and said so with the rule's own name
    expect(items.some((i) => i.title.startsWith('Hoje'))).toBe(false)
    expect(texts(a).join(' ')).toContain('Deixei de fora hoje: o check-in do dia já está em uso (TotalPass — 1 check-in/dia).')
    // preferred weekday (Thursday) is kept and leads the headline
    expect(items.map((i) => i.title)).toContain('Quinta · 06:00')
    expect(a.headline).toBe('Dá pra encaixar yoga quinta, 06:00 — o dia que você costuma preferir.')
    const thu = items.find((i) => i.title === 'Quinta · 06:00')!
    expect(thu.action).toMatchObject({ kind: 'createWorkout', data: { date: '2026-10-08', time: '06:00', modality: 'yoga', planType: 'flexivel', status: 'planejado', workoutGoalId: 'wg-yoga' } })
  })

  it('"Amanhã é presencial?" on a Monday: location, hours, checklist and tomorrow\'s training', () => {
    const a = ask('Amanhã é presencial?', '2026-10-05', 19 * 60)
    expect(a.agents.map((x) => x.id)).toEqual(['planning'])
    expect(a.headline).toBe('Sim — amanhã é presencial 👜 (Interlagos, São Paulo). Base 09:00–18:00, saindo por volta de 08:00.')
    expect(list(a, 'Pra deixar pronto hoje')!.items.map((i) => i.title)).toEqual(db.profile.work.presencialChecklist)
    expect(list(a, 'Treino de amanhã')!.items[0]).toMatchObject({ title: 'Corrida', subtitle: '06:00 · separar o equipamento' })
    expect(texts(a)[0]).toMatch(/versão Essential de “Milagre da manhã”/)
  })

  it('"o que levar amanhã?" on a Friday: not presencial, says when the next one is', () => {
    const a = ask('o que levar amanhã?')
    expect(a.headline).toBe('Não — amanhã é dia sem trabalho 🌿, nada de mochila de escritório.')
    expect(texts(a)).toContain('O próximo presencial é terça.')
  })

  it('"Tem conflito essa semana?" → conflict cards (check-in + overlap with an approximate period)', () => {
    const a = ask('Tem conflito essa semana?')
    expect(a.headline).toBe('2 coisas pra olhar essa semana. Eu não mudo nada sozinha — você decide.')
    const block = a.blocks.find((b): b is Extract<AnswerBlock, { kind: 'conflicts' }> => b.kind === 'conflicts')!
    expect(block.items.map((i) => [i.dayLabel, i.conflict.kind])).toEqual([
      ['Hoje', 'checkin_limit'],
      ['Amanhã', 'overlap'],
    ])
    // acknowledged conflicts disappear
    const acked = { ...db, conflictAcks: block.items.map((i) => ({ id: i.conflict.key, createdAt: '', updatedAt: '', key: i.conflict.key, decision: 'manter' as const, date: i.conflict.date })) }
    expect(askLumos(acked, 'Tem conflito essa semana?', LIFE_TODAY, 480).headline).toMatch(/^Nenhum conflito essa semana/)
  })

  it('"O que tenho pendente antes da África?" → sub-areas + trip task, Recife mentioned first', () => {
    const a = ask('O que tenho pendente antes da África?')
    expect(a.headline).toBe('🇿🇦 África do Sul — faltam 22 dias: 8 itens pra revisar em 6 sub-áreas + 1 tarefa.')
    const groups = list(a, 'Por sub-área')!.items
    expect(groups.map((g) => g.title)).toEqual(['Flights', 'Accommodation', 'Johannesburg', 'Safari', 'Documents', 'Packing'])
    expect(groups.find((g) => g.title === 'Johannesburg')).toMatchObject({ subtitle: 'Hospedagem Johannesburg · Logística aeroporto', trailing: '2 revisar' })
    expect(JSON.stringify(a)).not.toContain('Bike rental') // confirmed
    expect(texts(a)[0]).toBe('Antes vem 🇧🇷 Recife (faltam 20 dias), com 2 coisas pra revisar.')
  })

  it('"Como está minha semana de treino?" → summary line, info only', () => {
    const a = ask('Como está minha semana de treino?')
    expect(a.headline).toBe('Esta semana: 1 corrida · 2 natações · 1 bike · 1 força · 1 fun · 1 recovery.')
    expect(JSON.stringify(a)).not.toMatch(/%|score|pontos/)
  })

  it('"O que estou esperando da Fran?" → matched through project people / waiting "who"', () => {
    const a = ask('O que estou esperando da Fran?')
    expect(a.agents[0].id).toBe('work')
    expect(a.headline).toBe('Esperando Fran: 1 coisa — Retorno sobre o primeiro provider (há 3 dias).')
    expect(ask('O que estou esperando do FashionFinder?').headline).toMatch(/Do FashionFinder você está esperando 2 coisas/)
    expect(ask('O que estou esperando do Rafa?').headline).toMatch(/^Esperando Rafa: 1 coisa — Feedback da demo/)
  })
})

describe('Lumos · training fuel (only registered guidance)', () => {
  it('"Qual minha estratégia pra amanhã?" the day before a key long ride', () => {
    const a = ask('Qual minha estratégia pra amanhã?', '2026-10-10', 19 * 60)
    expect(a.agents.map((x) => x.id)).toEqual(['fuel'])
    expect(a.headline).toBe('🚴‍♀️ Pedal longo amanhã, 06:00 — estratégia “Long ride”.')
    expect(texts(a)).toEqual(['Ontem: Jantar como a nutri combinou.', 'Pré: Café da manhã do plano, 1h30 antes.', 'Intra: Gel a cada 45 min.', 'Pós: Refeição pós do plano.', 'Fonte: nutricionista.'])
    expect(lists(a)[0].items.map((i) => [i.title, i.subtitle])).toEqual([
      ['04:30 · Pré-treino', 'Pão com banana'],
      ['Pós-treino', 'Whey 1 dose'],
    ])
  })

  it('"o que comer antes do pedal?" filters the stage', () => {
    const a = ask('o que comer antes do pedal?', '2026-10-10')
    expect(texts(a)).toEqual(['Pré: Café da manhã do plano, 1h30 antes.', 'Fonte: nutricionista.'])
    expect(lists(a)[0].items.map((i) => i.title)).toEqual(['04:30 · Pré-treino'])
  })

  it('never invents: no strategy registered → says so', () => {
    expect(ask('Qual minha estratégia pra amanhã?').headline).toBe('🎪 Circo / Aéreos amanhã. Ainda não tem estratégia cadastrada pra isso.')
    expect(ask('Qual minha estratégia pra amanhã?', '2026-10-06').headline).toMatch(/^Amanhã não tem treino no plano/)
    const none = { ...db, nutritionStrategies: [], nutritionDayPlans: [] }
    expect(askLumos(none, 'o que comer antes do pedal?', '2026-10-10', 480).headline).toMatch(/Ainda não tem estratégia cadastrada pra isso/)
  })

  it('"Como foi minha semana de treinos-chave?" → key sessions + post check-in, no body numbers', () => {
    const a = ask('Como foi minha semana de treinos-chave?')
    expect(a.headline).toBe('Esta semana: 1 treino-chave, 1 feito.')
    expect(lists(a)[0].items[0].subtitle).toBe('Ontem · feito ✓ · energia ótima · como esperado · nutrição funcionou · recuperação boa')
    expect(JSON.stringify(a)).not.toMatch(/peso|gordura|kg/i)
  })
})
