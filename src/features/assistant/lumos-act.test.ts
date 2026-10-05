/**
 * READ · REASON · WRITE · ACT — Marina's exact sentences against the real life seed, through the
 * real conversation store: what changes in the data, the LifeEvent it leaves, and that Desfazer
 * puts everything back (events included). Monday 2026-10-05 unless said otherwise.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { SEED_IDS } from '@/data/seed/ids'
import { getDB, useStore } from '@/data/store'
import type { CalendarEvent, DB, Task } from '@/data/types'
import { LEARNING_SEED_IDS } from '@/features/learning/seed'
import { weekShopping } from './act/handlers/kitchen'
import { workModeOn } from './act/intel'
import { PATTERN_ASK_AT } from './act/memory'
import { isExternalEvent, policyFor } from './act/policy'
import { respond } from './act/respond'
import type { LumosReply } from './act/types'
import { ask, canUndo, clearConversation, confirmReply, runOption, undoAdjust, undoReply, useConversation, type Exchange } from './conversation'
import { firstRoutineStart } from './day/wake'
import { understand } from './router'

const MONDAY = '2026-10-05'
const at = (date: string, hm: string): Now => {
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m, iso: `${date}T${hm}:00.000-03:00` }
}
const NOW = at(MONDAY, '07:30')

function talk(text: string, now: Now = NOW): Exchange {
  const id = ask(text, now)!
  return useConversation.getState().exchanges.find((e) => e.id === id)!
}
const reply = (e: Exchange): LumosReply => {
  expect(e.lumos, e.question).toBeDefined()
  return e.lumos!.reply
}
const events = () => getDB().lifeLog.map((e) => e.title)

function waitingFran(db: DB, since = '2026-09-25'): DB {
  const t: Task = {
    id: 'w-fran',
    createdAt: '',
    updatedAt: '',
    title: 'Retorno sobre o roadmap',
    status: 'waiting',
    waiting: { who: 'Fran', since },
    projectId: SEED_IDS.projFashionFinder,
    context: 'trabalho',
    order: 99,
  }
  return { ...db, tasks: [...db.tasks, t] }
}

beforeEach(() => {
  useStore.setState({ db: buildSeed(MONDAY), hydrated: true })
  clearConversation()
})

describe('her 10 scenarios', () => {
  it('"acordei agora, tô 30 min atrasada" → replans from the planned wake + 30, applied with Desfazer', () => {
    const first = firstRoutineStart(getDB(), MONDAY)!
    const t = understand(getDB(), 'acordei agora, tô 30 min atrasada', MONDAY, first)
    expect(t.kind).toBe('adjust')
    const hm = `${String(Math.floor((first + 30) / 60)).padStart(2, '0')}:${String((first + 30) % 60).padStart(2, '0')}`
    expect((t as Extract<typeof t, { kind: 'adjust' }>).plan.previewTitle).toMatch(new RegExp(`^São ${hm}\\.`))
    const e = talk('acordei agora, tô 30 min atrasada', at(MONDAY, '04:45'))
    expect(e.adjust?.status).toBe('applied')
    expect(getDB().scheduleOverrides.length).toBeGreaterThan(0)
    expect(getDB().lifeLog).toHaveLength(1)
    undoAdjust(e.id)
    expect(getDB().scheduleOverrides).toHaveLength(0)
    expect(getDB().lifeLog).toHaveLength(0)
  })

  it('"amanhã fiquei presencial" → that day only becomes presencial, with the kit; undo restores', () => {
    const WED = at('2026-10-07', '20:00')
    expect(workModeOn(getDB(), '2026-10-08')).toBe('remoto')
    const e = talk('amanhã fiquei presencial', WED)
    const r = reply(e)
    expect(e.lumos?.status).toBe('done')
    expect(r.text).toMatch(/amanhã fica presencial/)
    expect(r.sections?.[0].title).toBe('KIT QUINTA — PRESENCIAL')
    expect(workModeOn(getDB(), '2026-10-08')).toBe('presencial')
    expect(workModeOn(getDB(), '2026-10-15')).toBe('remoto')
    expect(events()).toEqual(['Quinta ficou presencial', 'Kit presencial de quinta montado'])
    undoReply(e.id)
    expect(workModeOn(getDB(), '2026-10-08')).toBe('remoto')
    expect(getDB().lifeLog).toHaveLength(0)
  })

  it('"domingo o pedal passou pra 4h" → the Sunday ride is 240 min, logged', () => {
    const e = talk('domingo o pedal passou pra 4h')
    expect(e.adjust).toBeDefined()
    if (e.adjust!.status === 'preview') {
      expect(e.adjust!.plan.warnings.some((w) => w.severity === 'warn')).toBe(true)
      return
    }
    const ride = getDB().workouts.find((w) => w.date === '2026-10-11' && w.modality === 'bike')
    expect(ride?.plannedDurationMin).toBe(240)
    expect(getDB().lifeLog).toHaveLength(1)
  })

  it('"comi um brownie agora" → food log that asks which brownie (never invents numbers)', () => {
    const e = talk('comi um brownie agora')
    expect(e.turn?.kind).toBe('foodLog')
    expect(e.food?.status).toBe('resolving')
  })

  it('"terminei o livro" → CDH to Lidos, memory updated, asks about a note; undo puts it back', () => {
    const e = talk('terminei o livro')
    const r = reply(e)
    const cdh = () => getDB().books.find((b) => b.id === LEARNING_SEED_IDS.bookCDH)!
    expect(cdh()).toMatchObject({ status: 'finalizado', endDate: MONDAY, progress: 100 })
    expect(r.text).toMatch(/Continuous Discovery Habits/)
    expect(r.sub).toMatch(/guardar uma nota/)
    expect(getDB().memory.find((m) => m.key === 'book.current')?.status).toBe('archived')
    expect(getDB().memory.find((m) => m.key === `book.finished.${LEARNING_SEED_IDS.bookCDH}`)?.kind).toBe('history')
    expect(events()).toEqual(['Terminou Continuous Discovery Habits'])
    // "nota do livro: …" goes to that book (conversation context).
    const note = talk('nota do livro: oportunidades antes de soluções')
    expect(reply(note).text).toMatch(/Continuous Discovery Habits/)
    expect(cdh().notes).toBe('oportunidades antes de soluções')
    undoReply(note.id)
    undoReply(e.id)
    expect(cdh().status).toBe('lendo')
    expect(getDB().memory.find((m) => m.key === 'book.current')?.status).toBe('confirmed')
    expect(getDB().lifeLog).toHaveLength(0)
  })

  it('"Fran me respondeu" → the Waiting For with Fran is resolved; nothing waiting → honest answer', () => {
    expect(reply(talk('Fran me respondeu')).text).toMatch(/Não tinha nada esperando Fran/)
    useStore.setState({ db: waitingFran(getDB()) })
    const e = talk('Fran me respondeu')
    expect(reply(e).text).toMatch(/Fran respondeu sobre “Retorno sobre o roadmap”/)
    expect(getDB().tasks.find((t) => t.id === 'w-fran')?.status).toBe('done')
    undoReply(e.id)
    expect(getDB().tasks.find((t) => t.id === 'w-fran')?.status).toBe('waiting')
  })

  it('"faz minha feira" → real list; "já tenho arroz, whey e café" and prepared chicken shrink it', () => {
    const before = weekShopping(getDB(), MONDAY)
    const r = reply(talk('faz minha feira'))
    expect(r.text).toMatch(new RegExp(`${before.count} itens`))
    expect(r.lines?.some((l) => /presencia/.test(l.text))).toBe(true)
    const have = talk('já tenho arroz, whey e café')
    expect(reply(have).text).toMatch(/^Tirei arroz, whey e café da lista ✓/)
    expect(getDB().pantry.map((p) => p.name)).toEqual(['arroz', 'whey', 'café'])
    expect(getDB().mealPrepPlans[0]?.pantry).toEqual(expect.arrayContaining(['arroz', 'whey', 'cafe']))
    const after = weekShopping(getDB(), MONDAY)
    expect(after.count).toBeLessThan(before.count)
    const chicken = talk('fiz seis porções de frango grelhado')
    expect(reply(chicken).text).toBe('Anotado: 6 porções de frango grelhado prontas ✓')
    expect(getDB().pantry.find((p) => p.kind === 'preparado')).toMatchObject({ name: 'frango grelhado', portions: 6, remaining: 6, madeAt: MONDAY })
    const withChicken = weekShopping(getDB(), MONDAY)
    expect(withChicken.prepared[0]).toMatch(/frango grelhado/)
    undoReply(chicken.id)
    undoReply(have.id)
    expect(getDB().pantry).toHaveLength(0)
  })

  it('"monta minha semana" → preview by layer, applied only on "Aplicar semana", one undo', () => {
    const e = talk('monta minha semana')
    const r = reply(e)
    expect(r.area).toBe('sua semana')
    expect(r.sections?.length).toBeGreaterThan(0)
    if (!r.action) return
    expect(e.lumos?.status).toBe('pending')
    expect(r.text).toMatch(/^Semana de 05\/10: /)
    expect(r.text).not.toMatch(/Semana de 05\/10:.*Semana de 05\/10:/)
    const size = () => getDB().workouts.length + getDB().tasks.length + getDB().scheduleOverrides.length
    const before = size()
    confirmReply(e.id)
    expect(size()).toBeGreaterThan(before)
    expect(getDB().lifeLog.length).toBeGreaterThan(0)
    undoReply(e.id)
    expect(size()).toBe(before)
    expect(getDB().lifeLog).toHaveLength(0)
  })

  it('"o que mudou desde ontem?" → real deltas from what Lumos did', () => {
    talk('terminei o livro')
    talk('preciso lembrar de comprar ração da Luna')
    const r = reply(talk('o que mudou desde ontem?'))
    expect(r.lines?.map((l) => l.text)).toEqual(expect.arrayContaining(['Terminou Continuous Discovery Habits', 'Anotou: Comprar ração da Luna']))
  })

  it('"o que realmente precisa de mim?" → one queue with tappable answers; "deixa pra lá" acks it', () => {
    // The real seed already has decisions waiting (e.g. the trip); once she answers them the queue is calm.
    const first = reply(talk('o que realmente precisa de mim?'))
    expect(first.lines?.length).toBeGreaterThan(0)
    for (const l of first.lines ?? []) {
      const dismiss = l.options?.find((o) => /deixa pra l/i.test(o.label))
      if (dismiss) runOption(dismiss)
    }
    const acked = getDB().attentionAcks.length
    expect(reply(talk('o que realmente precisa de mim?')).text).toMatch(/Nada precisa de você/)
    useStore.setState({ db: waitingFran(getDB(), '2026-09-20') })
    const r = reply(talk('o que realmente precisa de mim?'))
    const line = r.lines!.find((l) => /Fran/.test(l.text))!
    expect(line.options?.map((o) => o.label)).toEqual(['Fran respondeu', 'Cobrar depois', 'Deixa pra lá'])
    runOption(line.options![2])
    expect(getDB().attentionAcks).toHaveLength(acked + 1)
    expect(reply(talk('o que realmente precisa de mim?')).text).toMatch(/Nada precisa de você/)
  })
})

describe('books', () => {
  it('page, wishlist, boring book out of the queue, what next', () => {
    expect(reply(talk('tô na página 190')).text).toBe('Anotado: “Continuous Discovery Habits” na página 190 ✓')
    expect(getDB().books.find((b) => b.id === LEARNING_SEED_IDS.bookCDH)?.currentPage).toBe(190)
    const add = talk('coloca Inspired na minha lista')
    expect(getDB().books.find((b) => b.title === 'Inspired')?.status).toBe('quero')
    expect(reply(add).ref?.type).toBe('book')
    expect(reply(talk('o que eu leio depois?')).text).toBe('Da sua fila, o próximo é “Inspired”.')
    const drop = talk('esse livro tá chato, tira da fila')
    expect(reply(drop).text).toMatch(/^Tirei “Inspired” da fila ✓/)
    expect(getDB().books.some((b) => b.title === 'Inspired')).toBe(false)
    undoReply(drop.id)
    expect(getDB().books.some((b) => b.title === 'Inspired')).toBe(true)
  })

  it('"terminei Continuous Discovery Habits" works by title too', () => {
    talk('terminei Continuous Discovery Habits')
    expect(getDB().books.find((b) => b.id === LEARNING_SEED_IDS.bookCDH)?.status).toBe('finalizado')
  })
})

describe('Brain Dump → Lumos behaviour', () => {
  it('"preciso lembrar de comprar ração da Luna" → Vida real · Luna · comprar', () => {
    const r = reply(talk('preciso lembrar de comprar ração da Luna'))
    expect(r.text).toBe('Anotado em Vida real · Luna · comprar ✓')
    expect(getDB().tasks.find((t) => t.title === 'Comprar ração da Luna')).toMatchObject({ context: 'vida_real', lifeAdminCategory: 'luna', adminKind: 'comprar', status: 'todo' })
  })

  it('"ideia de reels correndo na África" → creator idea in the series linked to the trip', () => {
    reply(talk('ideia de reels correndo na África'))
    const idea = getDB().contentItems.find((c) => c.title === 'Reels correndo na África')!
    const project = getDB().projects.find((p) => p.id === idea.projectId)!
    expect(project.tripId).toBe(SEED_IDS.tripAfrica)
    expect(idea).toMatchObject({ stage: 'ideia', format: 'Reels' })
  })

  it('a loose thought → Inbox; a timed reminder stays with the day planner', () => {
    reply(talk('anota: talvez trocar o selim da bike'))
    expect(getDB().brainDump.some((b) => b.text === 'Talvez trocar o selim da bike')).toBe(true)
    expect(understand(getDB(), 'me lembra de levar o shaker amanhã às 7h', MONDAY, 600).kind).toBe('adjust')
  })
})

describe('modes', () => {
  it('"me atualiza de trabalho" → one line per active project', () => {
    const r = reply(talk('me atualiza de trabalho'))
    expect(r.lines?.map((l) => l.text)).toEqual(expect.arrayContaining(['Santander', 'FashionFinder', 'Day One AI']))
  })

  it('"o que falta pra África?" → only real pending, grouped', () => {
    const r = reply(talk('o que falta pra África?'))
    expect(r.text).toMatch(/^Você tem \d+ coisas? ainda abertas? pra South Africa 2026/)
    const all = r.sections!.flatMap((s) => s.lines)
    const done = getDB().tripItems.filter((i) => i.status === 'feito' || i.status === 'confirmado').map((i) => i.title)
    for (const l of all) expect(done.some((d) => l.text.startsWith(d) && !/pendente/.test(l.sub ?? ''))).toBe(false)
  })

  it('"me mostra algo que eu salvei pra estudar" → references, never tasks', () => {
    const tasks = getDB().tasks.length
    const r = reply(talk('me mostra algo que eu salvei pra estudar'))
    expect(r.lines?.length).toBeGreaterThan(0)
    expect(r.link?.to).toBe('/estudos?v=salvos')
    expect(getDB().tasks.length).toBe(tasks)
    expect(JSON.stringify(r)).not.toMatch(/atrasad/i)
  })

  it('"o que eu tenho hoje?" and the daily brief end in an offer to organize', () => {
    const today = reply(talk('o que eu tenho hoje?'))
    expect(today.text).toMatch(/^Hoje ainda tem /)
    const brief = reply(talk('bom dia'))
    expect(brief.text).toMatch(/^Bom dia\. Hoje você tem /)
    expect(brief.sub).toBe('Quer organizar comigo?')
    const org = talk('organiza meu dia')
    expect(getDB().priorities.filter((p) => p.date === MONDAY).length).toBeGreaterThan(0)
    undoReply(org.id)
    expect(getDB().priorities.filter((p) => p.date === MONDAY)).toHaveLength(0)
  })
})

describe('memory', () => {
  it('"não faço mais yoga na terça" → updates yoga.weekday (no duplicate); the default changes only after confirming', () => {
    const count = getDB().memory.length
    const e = talk('não faço mais yoga na terça')
    const r = reply(e)
    expect(getDB().memory.length).toBe(count)
    expect(getDB().memory.find((m) => m.key === 'yoga.weekday')?.text).toBe('Não faz mais yoga às terças')
    expect(r.options?.[0].label).toBe('Tirar do padrão também')
    const yoga = getDB().weekTemplate.find((t) => t.weekday === 2 && t.modalities.includes('yoga'))!
    expect(yoga.active).toBe(true)
    runOption(r.options![0])
    const confirm = useConversation.getState().exchanges.at(-1)!
    expect(confirm.lumos?.status).toBe('pending')
    confirmReply(confirm.id)
    expect(getDB().weekTemplate.find((t) => t.id === yoga.id)?.active).toBe(false)
    undoReply(confirm.id)
    expect(getDB().weekTemplate.find((t) => t.id === yoga.id)?.active).toBe(true)
  })

  it('an observed pattern is asked once, and only becomes a preference when she says so', () => {
    const db = getDB()
    useStore.setState({
      db: { ...db, memory: [...db.memory, { id: 'pat', createdAt: '', updatedAt: '', key: 'training.time.natacao.06:00', kind: 'preference', area: 'esportes', text: 'Você costuma preferir natação às 06:00', status: 'observed', source: 'observed', evidence: PATTERN_ASK_AT }] },
    })
    const q = reply(talk('o que realmente precisa de mim?'))
    const line = q.lines!.find((l) => /natação às 06:00/.test(l.text))!
    expect(line.text).toMatch(/Quer que eu considere isso como preferência\?$/)
    runOption(line.options![0])
    expect(getDB().memory.find((m) => m.id === 'pat')).toMatchObject({ status: 'confirmed', kind: 'preference' })
  })
})

describe('policy', () => {
  it('internal → direct, sensitive/external → confirm', () => {
    expect(policyFor('update_book')).toBe('direct')
    expect(policyFor('log_food')).toBe('direct')
    for (const k of ['cancel_external_event', 'send_message', 'external_transaction', 'change_default', 'plan_week'] as const) expect(policyFor(k)).toBe('confirm')
    const db = getDB()
    const local = { ...db.events[0], kind: 'pessoal' } as CalendarEvent
    expect(isExternalEvent(db, local)).toBe(false)
    expect(isExternalEvent(db, { ...local, external: { provider: 'microsoft', externalId: 'x', syncStatus: 'synced' } })).toBe(true)
  })

  it('every reply is natural: no guilt, no "dashboard" talk', () => {
    const lines = ['terminei o livro', 'faz minha feira', 'me atualiza de trabalho', 'o que falta pra África?', 'o que eu tenho hoje?', 'bom dia', 'monta minha semana', 'o que mudou?', 'não faço mais yoga na terça']
    for (const s of lines) {
      const r = respond(getDB(), s, NOW)
      expect(r, s).toBeDefined()
      expect(JSON.stringify(r), s).not.toMatch(/atrasad|você falhou|streak|perdeu a sequência|dashboard|segundo o módulo|acessar a aba|Claro, Marina/i)
    }
  })

  it('canUndo is false after undo', () => {
    const e = talk('coloca Inspired na minha lista')
    expect(canUndo(e.id)).toBe(true)
    undoReply(e.id)
    expect(canUndo(e.id)).toBe(false)
  })
})
