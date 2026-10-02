import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { buildFixture, FIXTURE_TODAY } from '@/features/search/test-fixture'
import { askMari, EXAMPLE_QUESTIONS } from './chief'
import { parseQuestion } from './parse'
import type { AnswerBlock, MariAnswer } from './types'

const db = buildFixture()
const today = FIXTURE_TODAY // Friday
const EIGHT_AM = 8 * 60
const nbsp = (a: MariAnswer): MariAnswer => JSON.parse(JSON.stringify(a).replace(/\u00a0/g, ' '))
const ask = (q: string, minutes = EIGHT_AM) => nbsp(askMari(db, q, today, minutes))

const lists = (a: MariAnswer) => a.blocks.filter((b): b is Extract<AnswerBlock, { kind: 'list' }> => b.kind === 'list')
const list = (a: MariAnswer, title: string) => lists(a).find((l) => l.title === title)

describe('parseQuestion', () => {
  it('resolves entities accent-insensitively', () => {
    const q = parseQuestion(db, 'O que tenho pendente antes da África?')
    expect(q.trips.map((t) => t.name)).toEqual(['África do Sul'])
    expect(parseQuestion(db, 'esperando do fashionfinder').projects.map((p) => p.id)).toEqual(['proj-fashionfinder'])
    expect(parseQuestion(db, 'Quando consigo encaixar musculação?').modalities).toEqual(['musculacao'])
    expect(parseQuestion(db, 'bike amanhã').modalities).toEqual(expect.arrayContaining(['bike', 'gravel', 'speed']))
    expect(parseQuestion(db, 'o que tenho amanhã').time).toBe('amanha')
    expect(parseQuestion(db, 'gastos de setembro').month).toBe(8)
  })
})

describe('Mari answers', () => {
  it('every example question gets a real (non-fallback) answer', () => {
    for (const q of EXAMPLE_QUESTIONS) {
      const a = ask(q)
      expect(a.fallback, q).toBe(false)
      expect(a.headline.length, q).toBeGreaterThan(10)
    }
  })

  it('"Tenho alguma coisa urgente hoje?" → priorities, deadlines, needsMe, events soon', () => {
    const a = ask('Tenho alguma coisa urgente hoje?')
    expect(a.agents.map((x) => x.id)).toEqual(['calendar'])
    expect(list(a, 'Suas prioridades de hoje')!.items.map((i) => i.title)).toEqual(['Fechar proposta Santander'])
    expect(list(a, 'Prazos de hoje')!.items.map((i) => i.title)).toContain('Enviar proposta Santander')
    expect(list(a, 'Precisa de você')!.items.map((i) => i.title)).toEqual(['Aprovar roteiro do workshop'])
    const events = list(a, 'Ainda hoje na agenda')!
    expect(events.items.map((i) => i.title)).toEqual(['Daily FashionFinder', 'Workshop Santander'])
    expect(events.items[0].trailing).toBe('em 1h')
    expect(a.headline).toMatch(/1 prazo hoje/)
    expect(a.headline).toMatch(/precisa de você/)
    // Luna's bath is due today
    expect(list(a, 'Luna')!.items[0].title).toBe('Banho da Luna')
  })

  it('urgent question later in the day drops past events', () => {
    const a = ask('Tenho alguma coisa urgente hoje?', 11 * 60)
    expect(list(a, 'Ainda hoje na agenda')!.items.map((i) => i.title)).toEqual(['Workshop Santander'])
  })

  it('urgent question on an empty db is calm', () => {
    const a = askMari(emptyDB(), 'Tenho alguma coisa urgente hoje?', today, EIGHT_AM)
    expect(a.headline).toMatch(/Nada urgente/)
  })

  it('"Qual foi meu gasto essa semana?" → total + top categories', () => {
    const a = ask('Qual foi meu gasto essa semana?')
    expect(a.agents[0].id).toBe('finance')
    expect(a.headline).toContain('R$ 302,00')
    expect(a.headline).toContain('4 gastos')
    expect(list(a, 'Por categoria')!.items[0]).toMatchObject({ title: 'Mercado', trailing: 'R$ 140,00' })
    expect(list(a, 'Maiores gastos')!.items[0].action).toMatchObject({ kind: 'sheet', name: 'expense' })
  })

  it('finance by month and by trip', () => {
    expect(ask('Quanto gastei em setembro?').headline).toContain('R$ 1.970,00')
    expect(ask('Quanto gastei com a viagem de Recife?').headline).toContain('R$ 1.200,00')
  })

  it('"Que projeto está ficando para trás?" → kind phrasing, oldest/near deadline first', () => {
    const a = ask('Que projeto está ficando para trás?')
    expect(a.agents[0].id).toBe('work')
    expect(a.headline).toMatch(/DayOne talvez precise de um carinho/)
    expect(a.headline).toMatch(/sem novidades há 24 dias/)
    expect(a.headline).toMatch(/prazo em 9 dias sem próxima ação/)
    expect(a.headline).not.toMatch(/atrasad/i)
    const items = list(a, 'Projeto pedindo um carinho')!.items
    expect(items[0].action).toEqual({ kind: 'route', to: '/trabalho/projeto/proj-dayone' })
    // paused and recently-touched projects are not flagged
    expect(items.map((i) => i.title)).not.toContain('Yoga Studio')
    expect(items.map((i) => i.title)).not.toContain('FashionFinder')
  })

  it('"O que tenho pendente antes da África?" → items to review grouped by sub-area, trip tasks, brain dump, Recife first', () => {
    const a = ask('O que tenho pendente antes da África?')
    expect(a.agents[0].id).toBe('travel')
    expect(a.headline).toMatch(/África do Sul — faltam 39 dias: 3 itens pra revisar em 4 sub-áreas \+ 2 a fazer \+ 2 tarefas \+ 2 ideias no brain dump/)
    const groups = list(a, 'Por sub-área')!.items
    expect(groups.map((g) => g.title)).toEqual(['Johannesburg / Safari', 'Cape Town', 'Documentos', 'Antes de ir'])
    expect(groups[1]).toMatchObject({ subtitle: 'Hospedagem em Cape Town · Subir a Table Mountain', trailing: '2 revisar' })
    expect(groups[2].trailing).toBe('1 a fazer')
    expect(list(a, 'Tarefas da viagem')!.items.map((i) => i.title)).toEqual(['Reservar tour Cape Point', 'Comprar adaptador de tomada'])
    expect(list(a, 'No brain dump')!.items).toHaveLength(2)
    expect(JSON.stringify(a)).not.toContain('Voo para Johannesburg') // confirmed
    // Recife starts earlier and is mentioned first, with a follow-up question
    expect(a.blocks.some((b) => b.kind === 'text' && /Antes vem 🇧🇷 Recife \(faltam 20 dias\), com 4 coisas pra revisar/.test(b.text))).toBe(true)
    expect(a.blocks.some((b) => b.kind === 'suggestions' && b.questions[0] === 'O que falta pra Recife?')).toBe(true)
    expect(ask('O que falta pra Recife?').headline).toMatch(/^🇧🇷 Recife/)
  })

  it('"Quando consigo encaixar musculação?" → planning-engine windows, one tap creates a flexible workout', () => {
    const a = ask('Quando consigo encaixar musculação?')
    expect(a.agents[0].id).toBe('training')
    const slots = list(a, 'Toque pra planejar')!.items
    // Saturday already has musculação → skipped; today only after "now" (08:00) and outside BASE work hours
    expect(slots.map((s) => s.title)).toEqual(['Hoje · 18:00', 'Domingo · 06:00', 'Segunda · 06:00', 'Terça · 06:00'])
    expect(slots[0].action).toEqual({
      kind: 'createWorkout',
      data: { date: today, time: '18:00', modality: 'musculacao', status: 'planejado', planType: 'flexivel', plannedDurationMin: 60, workoutGoalId: undefined, order: 0 },
      message: '🏋️‍♀️ Musculação no plano: hoje, 18:00 ✓',
    })
    expect(a.headline).toBe('Dá pra encaixar musculação hoje, 18:00 — sem competir com nada.')
  })

  it('"O que estou esperando do FashionFinder?" → waiting tasks of the project + inbox waiting', () => {
    const a = ask('O que estou esperando do FashionFinder?')
    expect(a.agents[0].id).toBe('work')
    const items = list(a, 'Esperando alguém')!.items.map((i) => i.title)
    expect(items).toEqual(['Feedback do time de dados', 'Assets do lookbook', 'Aprovação do layout v2'])
    expect(items).not.toContain('Contrato assinado da academia')
    expect(a.headline).toMatch(/Do FashionFinder você está esperando 3 coisas — a mais antiga há 10 dias/)
  })

  it('"Que livros coloquei na fila?" → próximos + quero ler', () => {
    const a = ask('Que livros coloquei na fila?')
    expect(a.agents[0].id).toBe('learning')
    expect(list(a, 'Próximos')!.items.map((i) => i.title)).toEqual(['O poder do hábito', 'Pequenas coisas como estas'])
    expect(list(a, 'Quero ler')!.items.map((i) => i.title)).toEqual(['Torto arado', 'Born to Run'])
    expect(a.headline).toMatch(/O próximo da vez é “O poder do hábito”/)
  })

  it('"Que coisas preciso resolver antes de viajar?" → next trip (Recife) open items', () => {
    const a = ask('Que coisas preciso resolver antes de viajar?')
    expect(a.agents[0].id).toBe('travel')
    expect(a.headline).toBe('🇧🇷 Recife — faltam 20 dias: 4 itens pra revisar em 4 sub-áreas.')
    expect(list(a, 'Por sub-área')!.items.map((i) => i.title)).toEqual(['Hospedagem', 'Roteiro', 'Transporte', 'Comida'])
    // A single-item group opens that item directly
    expect(list(a, 'Por sub-área')!.items[0].action).toMatchObject({ kind: 'sheet', name: 'tripItem' })
  })

  it('study and Luna questions', () => {
    expect(ask('O que estou estudando de IA?').headline).toMatch(/Curso de LLMs aplicados/)
    const luna = ask('Como está a Luna?')
    expect(luna.agents[0].id).toBe('lifeAdmin')
    expect(luna.headline).toMatch(/Luna: banho da luna hoje/)
  })

  it('combines agents when the question spans domains', () => {
    const a = ask('Tenho treino e compromisso amanhã?')
    expect(a.agents.map((x) => x.id).sort()).toEqual(['calendar', 'training'])
  })

  it('unknown question → helpful fallback with suggestions and search results', () => {
    const a = ask('Me fala sobre o safari')
    expect(a.fallback).toBe(true)
    expect(a.blocks.some((b) => b.kind === 'suggestions')).toBe(true)
    expect(list(a, 'Achei isso na busca')!.items.map((i) => i.title)).toContain('Safari no Kruger')
    const none = ask('qual o sentido do universo')
    expect(none.fallback).toBe(true)
    expect(none.headline).toMatch(/ainda não sei/)
  })

  it('never uses guilt words', () => {
    for (const q of [...EXAMPLE_QUESTIONS, 'Como foi minha semana de treino?']) {
      const text = JSON.stringify(ask(q))
      expect(text, q).not.toMatch(/atrasad|você falhou|streak|perdeu a sequência/i)
    }
  })
})
