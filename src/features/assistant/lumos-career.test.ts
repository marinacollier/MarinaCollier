/** Career & money by conversation — her exact sentences against the real seed (Friday 2026-10-09). */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { getDB, useStore } from '@/data/store'
import { ensureReceivables, receivableId } from '@/data/finance/receivables'
import { addContact, addOpportunity } from '@/data/career/pipeline'
import { weekProgress } from '@/data/career/activities'
import { FINANCE_SEED_IDS } from '@/features/finance/seed'
import { lockSession, unlockSession } from '@/app/lock-store'
import type { LumosReply } from './act/types'
import { ask, clearConversation, runOption, undoReply, useConversation, type Exchange } from './conversation'

const FRI = '2026-10-09'
const at = (date: string, hm: string): Now => {
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m, iso: `${date}T${hm}:00.000-03:00` }
}
const NOW = at(FRI, '10:00')
const talk = (text: string, now: Now = NOW): Exchange => {
  const id = ask(text, now)!
  return useConversation.getState().exchanges.find((e) => e.id === id)!
}
const reply = (e: Exchange): LumosReply => {
  expect(e.lumos, e.question).toBeDefined()
  return e.lumos!.reply
}
const SAN_OCT = receivableId(FINANCE_SEED_IDS.contractSantander, '2026-10')
const FF_OCT = receivableId(FINANCE_SEED_IDS.contractFashionFinder, '2026-10')

beforeEach(() => {
  useStore.setState({ db: buildSeed(FRI), hydrated: true })
  ensureReceivables(FRI)
  clearConversation()
  unlockSession()
})

describe('Lumos · money', () => {
  it('"recebi o Santander hoje." → the expected October record becomes received (same record), undo restores', () => {
    const before = getDB().expenses.length
    const e = talk('recebi o Santander hoje.')
    expect(reply(e).text).toMatch(/^Santander recebido ✓ R\$\s?20\.000,00 em 09\/10\./)
    const r = getDB().expenses.find((x) => x.id === SAN_OCT)!
    expect(r.status).toBe('received')
    expect(r.receivedAt).toBeTruthy()
    expect(getDB().expenses.length).toBe(before)
    undoReply(e.id)
    expect(getDB().expenses.find((x) => x.id === SAN_OCT)?.status).toBe('expected')
  })

  it('saying it twice never duplicates', () => {
    talk('recebi o Santander hoje.')
    expect(reply(talk('recebi o Santander hoje.')).text).toMatch(/já está como recebido/)
    expect(getDB().expenses.filter((x) => x.id === SAN_OCT)).toHaveLength(1)
  })

  it('"Registra que o pagamento do Fashion Finder foi recebido." works the same way', () => {
    talk('Registra que o pagamento do Fashion Finder foi recebido.')
    expect(getDB().expenses.find((x) => x.id === FF_OCT)?.status).toBe('received')
  })

  it('"o Fashion Finder ainda não pagou." → stays expected (or atrasado after the date), nothing new created', () => {
    const before = getDB().expenses.length
    expect(reply(talk('o Fashion Finder ainda não pagou.')).text).toMatch(/segue previsto pra 30\/10/)
    expect(reply(talk('o Fashion Finder ainda não pagou.', at('2026-10-31', '10:00'))).text).toMatch(/atrasado desde 30\/10/)
    expect(getDB().expenses.length).toBe(before)
    expect(getDB().expenses.find((x) => x.id === FF_OCT)?.status).toBe('expected')
  })

  it('"Quanto tenho previsto para receber este mês?" → gross, separated from received', () => {
    talk('recebi o Santander hoje.')
    const r = reply(talk('Quanto tenho previsto para receber este mês?'))
    expect(r.text).toMatch(/R\$\s?30\.000,00 previstos \(bruto, antes de impostos\) — R\$\s?20\.000,00 já recebidos/)
  })

  it('locked money: Lumos says so and shows no numbers', () => {
    useStore.setState({ db: { ...getDB(), profile: { ...getDB().profile, privacyLock: { enabled: true, areas: ['dinheiro'], pinHash: 'x', pinSalt: 'y', relockMinutes: 5 } } } })
    lockSession()
    const r = reply(talk('Quanto tenho previsto para receber este mês?'))
    expect(r.text).toMatch(/protegido/)
    expect(JSON.stringify(r)).not.toMatch(/R\$/)
  })
})

describe('Lumos · career', () => {
  it('"Registra 30 minutos de inglês executivo hoje." → counts in the week', () => {
    const r = reply(talk('Registra 30 minutos de inglês executivo hoje.'))
    expect(r.text).toBe('Inglês executivo: 30 min hoje ✓ Semana: 1/3.')
    expect(weekProgress(getDB(), FRI).find((p) => p.kind === 'ingles_exec')?.done).toBe(1)
  })

  it('"Adiciona uma vaga de Head of Product ao meu pipeline." → asks the company (never invents)', () => {
    const r = reply(talk('Adiciona uma vaga de Head of Product ao meu pipeline.'))
    expect(r.text).toMatch(/de qual empresa\?/)
    expect(getDB().opportunities).toHaveLength(0)
    talk('adiciona uma vaga de Head of Product na Nubank ao meu pipeline')
    expect(getDB().opportunities.map((o) => [o.role, o.company, o.status])).toEqual([['Head of Product', 'Nubank', 'radar']])
  })

  it('"essa vaga não faz mais sentido." → the one being talked about is discarded (kept in history)', () => {
    addOpportunity({ role: 'Head of AI Products', company: 'Empresa X' }, FRI)
    const r = reply(talk('essa vaga não faz mais sentido.'))
    expect(r.text).toMatch(/saiu do pipeline/)
    expect(getDB().opportunities[0].status).toBe('descartada')
  })

  it('"falei com a Ana da empresa X hoje." → updates the right contact; two Anas → asks; unknown → offers to save', () => {
    const r1 = reply(talk('falei com a Ana da empresa X hoje.'))
    expect(r1.text).toMatch(/^Não tenho Ana \(X\) nos seus contatos/)
    runOption(r1.options![0])
    expect(getDB().contacts.map((c) => [c.name, c.company, c.lastInteraction])).toEqual([['Ana', 'X', FRI]])
    addContact({ name: 'Ana Lima', company: 'Z' })
    expect(reply(talk('falei com a Ana hoje.')).text).toMatch(/mais de uma Ana/)
  })

  it('"isso foi um baita resultado no FashionFinder." → suggests a win (writes only on tap)', () => {
    const before = getDB().wins.length
    const r = reply(talk('isso foi um baita resultado no FashionFinder.'))
    expect(r.text).toMatch(/Quer guardar isso no FashionFinder\?/)
    expect(getDB().wins.length).toBe(before)
    runOption(r.options![0])
    expect(getDB().wins.length).toBe(before + 1)
  })

  it('"Quais cases ainda estão sem métricas?" / "Qual é meu próximo follow-up de networking?" / progress', () => {
    expect(reply(talk('Quais cases ainda estão sem métricas?')).text).toMatch(/Todos os seus cases têm números|sem métricas/)
    addContact({ name: 'Fran', company: 'FashionFinder', nextFollowUp: '2026-10-13' })
    expect(reply(talk('Qual é meu próximo follow-up de networking?')).text).toBe('Próximo follow-up: Fran (FashionFinder) — 13/10.')
    talk('Registra 30 minutos de inglês executivo hoje.')
    const p = reply(talk('Qual meu progresso na carreira este mês?'))
    expect(p.lines?.[0].text).toMatch(/Inglês executivo: 1 vez/)
    expect(JSON.stringify(p)).not.toMatch(/%/)
  })

  it('"Tenho entrevista na próxima terça. Me ajuda a preparar." → sets the interview + prep (agenda only on tap)', () => {
    addOpportunity({ role: 'Head of Product', company: 'Empresa X', status: 'processo' }, FRI)
    const r = reply(talk('Tenho entrevista na próxima terça. Me ajuda a preparar.'))
    expect(r.text).toMatch(/entrevista em 13\/10/)
    expect(getDB().opportunities[0]).toMatchObject({ status: 'entrevista', nextActionDate: '2026-10-13' })
    const tasksBefore = getDB().tasks.length
    runOption(r.options![0])
    expect(getDB().tasks.length).toBeGreaterThan(tasksBefore)
  })
})

describe('Lumos · Executive Career Review', () => {
  it('"faz minha revisão executiva do mês" → drafts from existing data (no re-entry), saves one review per month', () => {
    talk('Registra 30 minutos de inglês executivo hoje.')
    addOpportunity({ role: 'Head of Product', company: 'Empresa X' }, FRI)
    const r = reply(talk('faz minha revisão executiva do mês'))
    expect(r.text).toMatch(/você não precisa recadastrar nada/)
    expect(r.sections?.map((s) => s.title)).toEqual(['O que avancei?', 'Quais oportunidades surgiram?'])
    expect(r.sections?.[0].lines[0].text).toBe('Inglês executivo: 1×')
    runOption(r.options![0])
    runOption(reply(talk('faz minha revisão executiva do mês')).options![0])
    const saved = getDB().monthlyReviews.filter((x) => x.kind === 'carreira')
    expect(saved).toHaveLength(1)
    expect(saved[0].month).toBe('2026-10')
    expect(JSON.stringify(saved[0])).not.toMatch(/%|prontid/)
  })
})
