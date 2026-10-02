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
const allTitles = (a: MariAnswer) => lists(a).flatMap((l) => l.items.map((i) => i.title))

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

  it('"O que tenho pendente antes da África?" → open trip items, trip tasks, brain dump group', () => {
    const a = ask('O que tenho pendente antes da África?')
    expect(a.agents[0].id).toBe('travel')
    expect(a.headline).toMatch(/África do Sul — faltam 39 dias: 9 coisas em aberto/)
    expect(list(a, 'Documentos e antes de ir')!.items.map((i) => i.title)).toEqual(['Passaporte válido', 'Vacina de febre amarela'])
    expect(list(a, 'A confirmar')!.items.map((i) => i.title)).toEqual(['Safari no Kruger', 'Hospedagem em Cape Town', 'Subir a Table Mountain'])
    expect(list(a, 'Tarefas da viagem')!.items.map((i) => i.title)).toEqual(['Reservar tour Cape Point', 'Comprar adaptador de tomada'])
    expect(list(a, 'No brain dump')!.items).toHaveLength(2)
    expect(allTitles(a)).not.toContain('Voo para Johannesburg') // confirmed
  })

  it('"Quando consigo encaixar musculação?" → free ≥60min slots, skipping strength days', () => {
    const a = ask('Quando consigo encaixar musculação?')
    expect(a.agents[0].id).toBe('training')
    const slots = list(a, 'Janelas livres (60 min ou mais)')!.items
    // Saturday already has musculação → skipped
    expect(slots.map((s) => s.title).some((t) => t.startsWith('Amanhã'))).toBe(false)
    expect(a.blocks.some((b) => b.kind === 'text' && /amanhã/.test(b.text))).toBe(true)
    // Today: 10:00–14:00 is the biggest gap between the daily and the workshop... 15:30–21:00 is bigger
    expect(slots[0].title).toBe('Hoje · 15:30–21:00')
    expect(slots[0].action).toEqual({ kind: 'sheet', name: 'workout', props: { date: today } })
    // Sunday has a run 07:00–08:00 → the long window starts 08:00
    expect(slots.find((s) => s.title.startsWith('Domingo'))!.title).toBe('Domingo · 08:00–21:00')
    expect(a.headline).toMatch(/Dá pra encaixar musculação/)
    expect(a.headline).toMatch(/hoje, 15:30/)
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
    expect(a.headline).toMatch(/Recife — faltam 20 dias: 4 coisas em aberto/)
    expect(list(a, 'A confirmar')!.items).toHaveLength(4)
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
