/**
 * DAILY BRIEFING IMPORT V2 — acceptance, with the real payload of 10/10.
 * tasks → to-dos of the day · watchlist scheduled → backlog (not today) · waiting → Waiting For ·
 * recurring → recognised. Same JSON N times = written once; her state always wins.
 * Every write goes through Lumos (preview → Importar), waits for the device and is checked after reopening.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { needsAttention } from '@/data/intel/attention'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { dayItems, upcomingDays } from '@/data/agenda/items'
import { radarItems } from '@/data/briefing/backlog'
import { planBriefing, readBriefing, windowOf } from '@/data/briefing/import'
import type { DB } from '@/data/types'
import { checkItem } from '@/features/today/home/act'
import { makeBackup, validateBackup, type BackupPreview } from '@/features/settings/backup'
import { restoreBackup } from '@/features/settings/backup-io'
import { whenSaved } from './act/commit'
import { ask, clearConversation, confirmReply, undoReply, useConversation } from './conversation'

const SAT = '2026-10-10'
const MON = '2026-10-12'

const PAYLOAD = {
  date: '2026-10-10',
  source: 'Daily Executive Briefing',
  tasks: [
    { title: 'Abrir B.O. de pedágio', category: 'Logística', project: 'Vida/Admin', priority: 'P1', done_criteria: 'Ocorrência registrada e comprovante salvo', estimated_minutes: 30, status: 'todo', due_date: '2026-10-10' },
    { title: 'Verificar integração Daily e Marina OS', category: 'Produto/IA', project: 'Marina OS', priority: 'P2', done_criteria: 'Importação testada e falhas registradas', estimated_minutes: 25, status: 'todo', due_date: null },
    { title: 'Consolidar pendências JNB', category: 'Viagem', project: 'África do Sul', priority: 'P3', done_criteria: 'Pendências de hospedagem e safari identificadas', estimated_minutes: 20, status: 'todo', due_date: null },
    { title: 'Separar case executivo', category: 'Portfólio', project: 'Carreira', priority: 'Optional', done_criteria: 'Problema, decisão e impacto documentados', estimated_minutes: 20, status: 'todo', due_date: null },
  ],
  backlog_watchlist: [
    { title: 'Multas do carro', project: 'Vida/Admin', status: 'scheduled', notes: 'Semana de 12 a 16/10' },
    { title: 'Hospedagem e safari JNB', project: 'África do Sul', status: 'scheduled', notes: 'Resolver na próxima semana' },
    { title: 'Épicos layout, DUP0005, ativação, enquadramento e instruções', project: 'Santander', status: 'scheduled', notes: 'Priorizar a partir de 13/10; cobrar agendas' },
    { title: 'Contas Apple, Google, PJ e LinkedIn', project: 'Fashion Finder', status: 'scheduled', notes: 'Pendências operacionais' },
    { title: 'Próximos passos com Duda', project: 'Yoga App', status: 'scheduled', notes: 'Alinhamento pendente' },
    { title: 'Retorno do Vitor', project: 'Day One', status: 'waiting', notes: 'Aguardar resposta' },
    { title: 'Retorno do Thales', project: 'Tranquilo SP', status: 'waiting', notes: 'Aguardar resposta' },
    { title: 'Pagamentos e despesas recorrentes', project: 'Vida/Admin', status: 'recurring', notes: 'Manter categorias cadastradas; valores e vencimentos ajustáveis mensalmente' },
  ],
}
const JSON_TEXT = JSON.stringify(PAYLOAD, null, 2)
const TODAY4 = ['Abrir B.O de pedágio', 'Verificar integração Daily e Marina OS', 'Consolidar pendências JNB', 'Separar case executivo']

let device: ReturnType<typeof createMemoryAdapter>
const at = (date: string, hm: string): Now => {
  vi.setSystemTime(new Date(`${date}T${hm}:00.000-03:00`))
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m, iso: new Date(`${date}T${hm}:00.000-03:00`).toISOString() }
}
async function reopen(): Promise<DB> {
  await whenSaved()
  await flushNow()
  await hydrate(device)
  clearConversation()
  return getDB()
}
const last = () => useConversation.getState().exchanges.at(-1)!
async function importIt(when = '07:00') {
  ask(JSON_TEXT, at(SAT, when))
  const id = last().id
  if (last().lumos?.reply.action) confirmReply(id)
  await whenSaved()
  return useConversation.getState().exchanges.find((x) => x.id === id)!
}
async function say(q: string, when = '12:00') {
  ask(q, at(SAT, when))
  await whenSaved()
  return last()
}
const task = (db: DB, title: string) => db.tasks.find((t) => t.title === title)!
const todayTitles = (db: DB) => dayItems(db, SAT, SAT).filter((i) => i.refType === 'task').map((i) => i.title)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(SAT, '06:30')
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(SAT))
  await reopen()
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('preview (before anything is written)', () => {
  it('in her words: 4 tarefas do dia · futuros · aguardando retorno · recorrência — nothing written yet', async () => {
    const data = (db: DB) => JSON.stringify([db.tasks, db.backlogItems, db.importBatches, db.projects, db.financialCategories])
    const before = data(getDB())
    ask(JSON_TEXT, at(SAT, '07:00'))
    const r = last().lumos!
    expect(r.status).toBe('pending')
    expect(r.reply.text).toBe('Daily Briefing · 10 out')
    expect(r.reply.sub).toMatch(/^4 tarefas do dia · 5 itens futuros · 2 aguardando retorno · 1 recorrência reconhecida/)
    expect(r.reply.sections?.map((s) => s.title)).toEqual(['Hoje', 'Próximos', 'Waiting For', 'Recorrências'])
    expect(r.reply.sections![0].lines.map((l) => l.text)).toEqual(TODAY4)
    expect(r.reply.sections![1].lines.find((l) => /Multas/.test(l.text))?.sub).toMatch(/seg 12 – sex 16\/10/)
    expect(r.reply.sections![1].lines.find((l) => /DUP0005/.test(l.text))?.sub).toBe('a partir de ter 13/10')
    expect(r.reply.sections![2].lines.map((l) => l.text)).toEqual(['Vitor · Day One', 'Thales · Tranquilo SP'])
    expect(r.reply.action?.label).toBe('Importar')
    expect(data(getDB())).toBe(before)
  })

  it('windows are read only when safe — never a fake time', () => {
    expect(windowOf('Semana de 12 a 16/10', SAT)).toMatchObject({ from: '2026-10-12', until: '2026-10-16' })
    expect(windowOf('Resolver na próxima semana', SAT)).toMatchObject({ from: '2026-10-12', until: '2026-10-18' })
    expect(windowOf('Priorizar a partir de 13/10; cobrar agendas', SAT)).toMatchObject({ from: '2026-10-13' })
    expect(windowOf('Pendências operacionais', SAT)).toBeUndefined()
    expect(windowOf('Semana de 31 a 35/10', SAT)).toBeUndefined()
  })
})

describe('TESTE 1 — first import', () => {
  it('4 to-dos on 10/10 (not 12); scheduled → backlog, waiting → Waiting For, recurring → recognised', async () => {
    const tasksBefore = getDB().tasks.length
    const e = await importIt()
    expect(e.lumos?.status).toBe('done')
    expect(e.lumos?.reply.action?.done).toMatch(/^Daily Briefing importado ✓ 3 tarefas adicionadas/)
    const db = await reopen()
    // 3 new + the B.O. that already was her backlog task for 10/10 (same record) = the 4 of today.
    expect(db.tasks.length).toBe(tasksBefore + 3)
    for (const t of TODAY4) expect(todayTitles(db), t).toContain(t)
    expect(task(db, 'Verificar integração Daily e Marina OS')).toMatchObject({ date: SAT, status: 'todo', priority: 'media', durationMin: 25, doneCriteria: 'Importação testada e falhas registradas' })
    expect(task(db, 'Separar case executivo')).toMatchObject({ date: SAT, priority: 'baixa', tags: ['optional'], context: 'carreira' })
    expect(task(db, 'Consolidar pendências JNB').tripId).toBe('trip-africa-do-sul')
    expect(task(db, 'Verificar integração Daily e Marina OS').source).toMatchObject({ type: 'daily_briefing', briefingDate: SAT, sourceKey: 'daily-briefing-2026-10-10-marina-os-verificar-integracao-daily-e-marina-os' })
    // Watchlist kept its nature.
    expect(db.backlogItems.filter((b) => b.kind === 'scheduled')).toHaveLength(5)
    expect(db.backlogItems.find((b) => /DUP0005/.test(b.title))).toMatchObject({ status: 'open', window: { from: '2026-10-13' } })
    expect(db.backlogItems.find((b) => b.title === 'Multas do carro')).toMatchObject({ status: 'promoted', promotedTaskId: task(db, 'Resolver multas do carro').id })
    expect(db.backlogItems.find((b) => b.kind === 'recurring')?.recognizedAs).toMatch(/Pagamentos do mês \(\d+\)/)
    expect(db.tasks.filter((t) => t.waiting?.who === 'Vitor')).toHaveLength(1)
    expect(db.tasks.filter((t) => t.waiting?.who === 'Thales')).toHaveLength(1)
    expect(db.tasks.some((t) => /^Retorno do (Vitor|Thales)$/.test(t.title))).toBe(false)
    // JNB: related, not merged — today's consolidation is its own to-do; "hospedagem e safari" is her existing one.
    expect(db.backlogItems.find((b) => b.title === 'Hospedagem e safari JNB')?.promotedTaskId).toBe(task(db, 'Resolver hospedagem e safari JNB').id)
    expect(task(db, 'Consolidar pendências JNB').id).not.toBe(task(db, 'Resolver hospedagem e safari JNB').id)
    // History.
    expect(db.importBatches).toHaveLength(1)
    expect(db.importBatches[0]).toMatchObject({ briefingDate: SAT, counts: { reviewRequired: 0 } })
  })
})

describe('TESTE 2…5 — reimport never duplicates nor resurrects', () => {
  it('TESTE 2: the same JSON 10 times → 0 duplicates', async () => {
    await importIt()
    const snapshot = { tasks: getDB().tasks.length, backlog: getDB().backlogItems.length, projects: getDB().projects.length, cats: getDB().financialCategories.length }
    for (let i = 0; i < 9; i++) await importIt(`07:${10 + i}`)
    expect(last().lumos?.reply.text).toMatch(/tudo isso já está no app ✓/)
    const db = await reopen()
    expect({ tasks: db.tasks.length, backlog: db.backlogItems.length, projects: db.projects.length, cats: db.financialCategories.length }).toEqual(snapshot)
  })

  it('TESTE 3: B.O. done (by Lumos: "B.O. feito.") → reimport → still done', async () => {
    await importIt()
    const r = await say('B.O. feito.')
    expect(r.lumos?.reply.text).toBe('“Abrir B.O de pedágio” feito ✓')
    await importIt('13:00')
    expect(task(await reopen(), 'Abrir B.O de pedágio').status).toBe('done')
  })

  it('TESTE 4: "JNB fica pra segunda." → reimport → still Monday', async () => {
    await importIt()
    const r = await say('JNB fica pra segunda.')
    expect(r.lumos?.reply.text).toMatch(/Consolidar pendências JNB” vai pra segunda/)
    await importIt('13:00')
    const db = await reopen()
    expect(task(db, 'Consolidar pendências JNB').date).toBe(MON)
    expect(todayTitles(db)).not.toContain('Consolidar pendências JNB')
    expect(dayItems(db, MON, SAT).some((i) => i.title === 'Consolidar pendências JNB')).toBe(true)
  })

  it('TESTE 5: "Vitor respondeu." → resolved → reimport → NOT waiting again', async () => {
    await importIt()
    await say('Vitor respondeu.')
    expect(getDB().tasks.find((t) => t.waiting?.who === 'Vitor')?.status).toBe('done')
    await importIt('13:00')
    const db = await reopen()
    expect(db.tasks.filter((t) => t.waiting?.who === 'Vitor').map((t) => t.status)).toEqual(['done'])
  })

  it('"Thales ainda não respondeu." → stays waiting, last check recorded (no nagging today)', async () => {
    await importIt()
    await say('Thales ainda não respondeu.')
    const db = await reopen()
    expect(db.tasks.find((t) => t.waiting?.who === 'Thales')).toMatchObject({ status: 'waiting', waiting: { lastCheckedAt: SAT } })
    expect(needsAttention(db, at(SAT, '13:00')).some((i) => i.kind === 'waiting_reply' && /Thales|Tranquilo/.test(i.title))).toBe(false)
  })

  it('a to-do she deleted after importing never comes back', async () => {
    await importIt()
    actions.remove('tasks', task(getDB(), 'Separar case executivo').id)
    await importIt('13:00')
    expect((await reopen()).tasks.some((t) => t.title === 'Separar case executivo')).toBe(false)
  })
})

describe('TESTE 6 — future is not today', () => {
  it('"Épicos … DUP0005 …" (a partir de 13/10) is not on Hoje of 10/10; it is in Próximos (No radar), and becomes a task only when she says so', async () => {
    await importIt()
    let db = await reopen()
    const all10 = dayItems(db, SAT, SAT).map((i) => i.title)
    expect(all10.filter((t) => /DUP0005|Contas Apple|Multas do carro/.test(t))).toEqual([])
    // (her own "Revisar DUP0005 de sacador" due 16/10 is a real task; the backlog item is not)
    expect(upcomingDays(db, SAT, 6).flatMap((d) => d.items).some((i) => /^Épicos layout/.test(i.title))).toBe(false)
    expect(radarItems(db, SAT).map((i) => `${i.title} · ${i.sub}`)).toEqual(['Épicos layout, DUP0005, ativação, enquadramento e instruções · a partir de ter 13/10', 'Contas Apple, Google, PJ e LinkedIn · sem data'])
    // On the 13th, the window starts → needs attention (a decision, still not a task).
    expect(needsAttention(db, at('2026-10-13', '08:00')).some((i) => i.ref?.type === 'backlogItem' && /DUP0005/.test(i.title))).toBe(true)
    // "isso do Santander coloca terça" → a real to-do on Tuesday 13.
    const r = await say('isso do Santander coloca terça')
    expect(r.lumos?.reply.text).toMatch(/virou tarefa pra terça/)
    db = await reopen()
    const t = db.tasks.find((x) => /^Épicos layout/.test(x.title))!
    expect(t).toMatchObject({ date: '2026-10-13', status: 'todo', projectId: 'proj-santander' })
    expect(db.backlogItems.find((b) => /DUP0005/.test(b.title))).toMatchObject({ status: 'promoted', promotedTaskId: t.id })
    // Reimport does not bring it back to the radar nor create a second task.
    await importIt('13:00')
    db = await reopen()
    expect(db.tasks.filter((x) => /^Épicos layout/.test(x.title))).toHaveLength(1)
    expect(radarItems(db, SAT).some((i) => /DUP0005/.test(i.title))).toBe(false)
  })
})

describe('TESTE 7 — recurring', () => {
  it('"Pagamentos e despesas recorrentes" twice → recognised once, no category nor money created', async () => {
    const cats = getDB().financialCategories.length
    const expenses = getDB().expenses.length
    await importIt()
    await importIt('08:00')
    const db = await reopen()
    expect(db.backlogItems.filter((b) => b.kind === 'recurring')).toHaveLength(1)
    expect(db.financialCategories.length).toBe(cats)
    expect(db.expenses.length).toBe(expenses)
  })
})

describe('TESTE 8 — Home', () => {
  it('the 4 to-dos of today are in the one operational queue with their front; check one → reopen → still done', async () => {
    await importIt()
    let db = await reopen()
    const items = dayItems(db, SAT, SAT)
    const front = (t: string) => items.find((i) => i.title === t)?.front.label
    expect(front('Verificar integração Daily e Marina OS')).toBe('MARINA OS')
    expect(front('Consolidar pendências JNB')).toMatch(/^VIAGEM/)
    expect(front('Separar case executivo')).toBe('CARREIRA')
    expect(front('Abrir B.O de pedágio')).toBe('VIDA')
    checkItem(items.find((i) => i.title === 'Verificar integração Daily e Marina OS')!)
    db = await reopen()
    expect(dayItems(db, SAT, SAT).find((i) => i.title === 'Verificar integração Daily e Marina OS')?.status).toBe('done')
  })
})

describe('TESTE 9 — "o que veio do briefing hoje?"', () => {
  it('today, next and Waiting For — kept apart, with their current state', async () => {
    await importIt()
    await say('B.O. feito.')
    const r = (await say('o que veio do briefing hoje?')).lumos!.reply
    expect(r.text).toBe('Do briefing de 10 out:')
    expect(r.sections?.map((s) => s.title)).toEqual(['Hoje', 'Próximos', 'Waiting For', 'Recorrências'])
    expect(r.sections![0].lines.find((l) => /B\.O/.test(l.text))?.sub).toBe('feita ✓')
    expect(r.sections![1].lines.find((l) => /DUP0005/.test(l.text))?.sub).toBe('a partir de ter 13/10')
    expect(r.sections![2].lines.map((l) => l.text)).toEqual(['Vitor · Day One', 'Thales · Tranquilo SP'])
  })
})

describe('TESTE 10 — backup', () => {
  it('export → wipe → restore: source, sourceKey, status, watchlist, Waiting For, dates and importBatchId come back', async () => {
    await importIt()
    await say('JNB fica pra segunda.')
    const before = await reopen()
    const text = JSON.stringify(makeBackup(before))
    device = createMemoryAdapter()
    await hydrate(device)
    expect(getDB().backlogItems).toHaveLength(0)
    await restoreBackup(validateBackup(JSON.parse(text)) as BackupPreview)
    const after = await reopen()
    const pick = (db: DB) => ({
      tasks: db.tasks.filter((t) => t.source).map((t) => [t.title, t.status, t.date, t.source!.sourceKey, t.source!.importBatchId]),
      backlog: db.backlogItems.map((b) => [b.title, b.kind, b.status, b.window?.from, b.source.importBatchId]),
      waiting: db.tasks.filter((t) => t.waiting).map((t) => [t.waiting!.who, t.status]),
      batches: db.importBatches.map((b) => [b.id, b.briefingDate, b.sourceKeys.length]),
    })
    expect(pick(after)).toEqual(pick(before))
    expect(pick(after).tasks.length).toBeGreaterThan(0)
  })
})

describe('undo and validation', () => {
  it('Desfazer importação reverts only what is still as the import left it', async () => {
    const e = await importIt()
    at(SAT, '09:00') // later: she touches one of them
    checkItem(dayItems(getDB(), SAT, SAT).find((i) => i.title === 'Separar case executivo')!)
    undoReply(e.id)
    const db = await reopen()
    expect(db.tasks.some((t) => t.title === 'Verificar integração Daily e Marina OS')).toBe(false)
    expect(db.backlogItems.some((b) => /DUP0005/.test(b.title))).toBe(false)
    expect(task(db, 'Separar case executivo').status).toBe('done') // kept: hers now
    expect(db.importBatches[0].undoneAt).toBeTruthy()
  })

  it('camelCase is accepted; unknown priority / bad date / missing title are flagged, never invented, never dropped silently', () => {
    const text = JSON.stringify({
      date: SAT,
      source: 'Daily Executive Briefing',
      tasks: [
        { title: 'Ligar pro contador', category: 'Algo Novo', priority: 'P9', doneCriteria: 'Ligação feita', estimatedMinutes: 15, status: 'todo', dueDate: '31/02' },
        { category: 'Carreira', priority: 'P1' },
      ],
      backlogWatchlist: [{ title: 'Renovar passaporte', project: 'Vida/Admin', status: 'scheduled', notes: 'até 30/10' }],
    })
    const plan = planBriefing(getDB(), readBriefing(text).blocks)!
    const t = plan.ops.find((o) => o.kind === 'task' && o.data.title === 'Ligar pro contador')
    expect(t && t.kind === 'task' && t.data).toMatchObject({ doneCriteria: 'Ligação feita', durationMin: 15, priority: undefined, dueDate: undefined, date: SAT, context: 'geral' })
    expect(plan.review.map((r) => r.reason).join(' | ')).toMatch(/prioridade “P9”.*data “31\/02”.*sem título/)
    const b = plan.ops.find((o) => o.kind === 'backlog')
    expect(b && b.kind === 'backlog' && b.data.window).toMatchObject({ until: '2026-10-30' })
  })
})
