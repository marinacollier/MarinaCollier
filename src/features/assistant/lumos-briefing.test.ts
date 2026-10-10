/**
 * Daily Executive Briefing → Marina OS (pasted into Lumos), and "tudo que dê tem check de feito".
 * Every write goes through the conversation, waits for the device and is checked after reopening.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { dayItems } from '@/data/agenda/items'
import { billRows } from '@/data/finance/bills'
import { readBriefing, planBriefing } from '@/data/briefing/import'
import { addDays } from '@/lib/date'
import type { DB } from '@/data/types'
import { checkItem } from '@/features/today/home/act'
import { whenSaved } from './act/commit'
import { ask, clearConversation, confirmReply, undoReply, useConversation } from './conversation'

const FRI = '2026-10-09'
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

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(FRI, '07:00')
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(FRI))
  await reopen()
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

const DAILY = `# DAILY EXECUTIVE BRIEFING — 09/10

1. EXECUTIVE SUMMARY
🔴 Pix Automático ganha escala nos bancos médios — muda a disputa por recorrência e reduz dependência de boleto.
🟡 Agentes de IA em operações de crédito saem do piloto: governança e auditoria viram o diferencial.
... (o resto da leitura do dia, com Career Capital, The One Thing e frases para reunião) ...

12. MARINA OS — ATIVIDADES DO DIA

BLOCO PARA MARINA OS APP
\`\`\`json
{
  "date": "2026-10-09",
  "source": "Daily Executive Briefing",
  "tasks": [
    { "title": "Escrever post no LinkedIn sobre Pix Automático", "category": "Carreira", "project": "Carreira", "priority": "P1", "done_criteria": "Rascunho de 150 palavras salvo.", "estimated_minutes": 30, "status": "todo", "due_date": null },
    { "title": "Solucionar conta Apple", "category": "Produto/IA", "project": "Fashion Finder", "priority": "P1", "done_criteria": "Conta regularizada ou bloqueio documentado.", "estimated_minutes": 45, "status": "todo", "due_date": null },
    { "title": "Mandar mensagem para a Duda", "category": "Operação", "project": "Yoga App", "priority": "P3", "done_criteria": "Mensagem enviada.", "estimated_minutes": 10, "status": "todo", "due_date": "2026-10-09" },
    { "title": "Revisar roadmap do Marina OS", "category": "Produto/IA", "project": "Marina OS", "priority": "Optional", "done_criteria": "3 próximos passos anotados.", "estimated_minutes": 20, "status": "todo", "due_date": null }
  ],
  "backlog_watchlist": [
    { "title": "Aguardar retorno do Vitor", "project": "Day One", "status": "waiting", "notes": "Cobrar sexta." },
    { "title": "Pagar IPVA", "project": "Vida/Admin", "status": "recurring", "notes": "valor a informar" }
  ]
}
\`\`\``

describe('Daily Executive Briefing pasted into Lumos', () => {
  it('asks first; on confirm the day gets its checklist — new tasks, backlog pulled to today, nothing duplicated', async () => {
    ask(DAILY, at(FRI, '07:10'))
    const e = last()
    expect(e.lumos?.status).toBe('pending')
    expect(e.lumos?.reply.text).toBe('Daily Briefing · 9 out')
    expect(e.lumos?.reply.sub).toMatch(/4 tarefas do dia · 1 aguardando retorno/)
    // "Pagar IPVA" (recurring) doesn't exist yet: flagged for review, never created with invented values.
    expect(e.lumos?.reply.sub).toMatch(/1 item precisa de revisão/)
    confirmReply(e.id)
    const db = await reopen()

    const post = db.tasks.find((t) => t.title === 'Escrever post no LinkedIn sobre Pix Automático')!
    expect(post).toMatchObject({ date: FRI, status: 'todo', priority: 'alta', durationMin: 30, context: 'carreira' })
    expect(post.notes).toMatch(/Feito quando: Rascunho de 150 palavras salvo\./)
    // The backlog task is the SAME record, now on today.
    expect(db.tasks.filter((t) => t.title === 'Solucionar conta Apple')).toHaveLength(1)
    expect(db.tasks.find((t) => t.title === 'Solucionar conta Apple')?.date).toBe(FRI)
    expect(db.tasks.find((t) => t.title === 'Mandar mensagem para a Duda')?.projectId).toBe(db.projects.find((p) => p.name === 'Yoga App')?.id)
    expect(db.projects.filter((p) => p.name === 'Marina OS')).toHaveLength(1)
    expect(db.financialCategories.some((c) => c.name === 'Pagar IPVA')).toBe(false)
    expect(db.backlogItems.find((b) => b.title === 'Pagar IPVA')).toMatchObject({ kind: 'recurring', status: 'open' })
    // Vitor was already waiting (backlog) — not duplicated.
    expect(db.tasks.filter((t) => t.status === 'waiting' && t.waiting?.who === 'Vitor')).toHaveLength(1)
    // Everything is on today's Home with a check.
    const today = dayItems(db, FRI, FRI)
    for (const title of ['Escrever post no LinkedIn sobre Pix Automático', 'Solucionar conta Apple', 'Mandar mensagem para a Duda', 'Revisar roadmap do Marina OS'])
      expect(today.find((i) => i.title === title)?.check, title).toBe('toggle')
    // The reading itself is kept as a note of the day (without the JSON).
    const note = db.notes.find((n) => n.title === 'Daily Executive Briefing · 09/10')!
    expect(note.body).toMatch(/Pix Automático ganha escala/)
    expect(note.body).not.toMatch(/"tasks"/)
  })

  it('pasting the same briefing again changes nothing', async () => {
    ask(DAILY, at(FRI, '07:10'))
    confirmReply(last().id)
    await reopen()
    const before = JSON.stringify(getDB().tasks)
    ask(DAILY, at(FRI, '07:20'))
    expect(last().lumos?.reply.text).toMatch(/tudo isso já está no app ✓/)
    expect(last().lumos?.reply.action).toBeUndefined()
    expect(JSON.stringify(getDB().tasks)).toBe(before)
  })

  it('one Desfazer undoes the whole import', async () => {
    const before = { tasks: getDB().tasks.length, projects: getDB().projects.length, cats: getDB().financialCategories.length, apple: getDB().tasks.find((t) => t.title === 'Solucionar conta Apple')?.date }
    ask(DAILY, at(FRI, '07:10'))
    confirmReply(last().id)
    await whenSaved()
    undoReply(last().id)
    const db = await reopen()
    expect({ tasks: db.tasks.length, projects: db.projects.length, cats: db.financialCategories.length, apple: db.tasks.find((t) => t.title === 'Solucionar conta Apple')?.date }).toEqual(before)
  })

  it('her hand-edited base JSON (a note after a name, a missing comma) still reads; nothing invented', () => {
    const text = `{
  "date": "2026-10-09",
  "source": "Manual Backlog Update",
  "tasks": [],
  "recurring_financial_categories": [
    "Feira",
    "Hortifruti e carnes" — *semanal e nao mensal como os outros*,
    "Estacionamento pessoal"
"Inglês",
"Ajuda vó $"
"Ajuda mãe $"
  ]
}`
    const { blocks } = readBriefing(text)
    expect(blocks).toHaveLength(1)
    const plan = planBriefing({ ...getDB(), financialCategories: [] }, blocks)!
    const cats = plan.ops.flatMap((o) => (o.kind === 'category' ? [o.data] : []))
    expect(cats.map((c) => c.name)).toEqual(['Feira', 'Hortifruti e carnes', 'Estacionamento pessoal', 'Inglês', 'Ajuda vó', 'Ajuda mãe'])
    expect(cats.find((c) => c.name === 'Hortifruti e carnes')?.bill).toEqual({ every: 'semana' })
    expect(cats.every((c) => c.budgetCents === undefined && !c.bill?.dueDay)).toBe(true)
  })

  it('a JSON block is never split into "two sentences"', () => {
    ask(DAILY, at(FRI, '07:10'))
    expect(useConversation.getState().exchanges.filter((x) => x.partOf !== undefined)).toHaveLength(0)
  })
})

describe('tudo que dá tem check de feito', () => {
  it('an event: "fui" on that day, survives reopening, undo by ticking again', async () => {
    const ev = actions.create('events', { sourceId: 'cal-local', title: 'Consulta', date: FRI, startTime: '15:00', endTime: '16:00', allDay: false })
    const item = () => dayItems(getDB(), FRI, FRI).find((i) => i.refId === ev.id)!
    expect(item().check).toBe('toggle')
    expect(checkItem(item())).toBe(true)
    let db = await reopen()
    expect(dayItems(db, FRI, FRI).find((i) => i.refId === ev.id)?.status).toBe('done')
    expect(checkItem(item())).toBe(false)
    db = await reopen()
    expect(dayItems(db, FRI, FRI).find((i) => i.refId === ev.id)?.status).toBe('pending')
  })

  it('a follow-up ("Cobrar Fran"): ticked today → done today, and it does not come back tomorrow', async () => {
    const t = actions.create('tasks', { title: 'Deck revisado', status: 'waiting', waiting: { who: 'Fran', since: addDays(FRI, -5), followUpOn: addDays(FRI, -1) }, order: 9 })
    const line = () => dayItems(getDB(), FRI, FRI).find((i) => i.key === `waiting:${t.id}`)!
    expect(line()).toMatchObject({ check: 'mark', sub: 'era pra antes' })
    checkItem(line())
    const db = await reopen()
    expect(dayItems(db, FRI, FRI).find((i) => i.key === `waiting:${t.id}`)?.status).toBe('done')
    expect(db.tasks.find((x) => x.id === t.id)?.status).toBe('waiting') // the record itself is untouched
    const sat = addDays(FRI, 1)
    expect(dayItems(db, sat, sat).some((i) => i.key === `waiting:${t.id}`)).toBe(false)
  })

  it('a payment with a due day shows on Hoje that day with a check; paid = paid for the month', async () => {
    const aluguel = getDB().financialCategories.find((c) => c.name === 'Aluguel')!
    expect(dayItems(getDB(), FRI, FRI).some((i) => i.refId === aluguel.id)).toBe(false) // no due day → never invented
    actions.update('financialCategories', aluguel.id, { bill: { every: 'mes', dueDay: 9 } })
    const line = () => dayItems(getDB(), FRI, FRI).find((i) => i.refId === aluguel.id)!
    expect(line()).toMatchObject({ title: 'Pagar Aluguel', check: 'bill', sub: 'vence hoje' })
    checkItem(line())
    const db = await reopen()
    expect(billRows(db, FRI).find((r) => r.category.id === aluguel.id)?.paid).toBe(true)
    expect(billRows(db, '2026-11-02').find((r) => r.category.id === aluguel.id)?.paid).toBe(false) // new month
    // Hidden when Dinheiro is locked.
    expect(dayItems(db, FRI, FRI, { hidden: { dinheiro: true } }).find((i) => i.refId === aluguel.id)?.title).toBe('Pagamento')
  })

  it('a training that is still only the weekly base: tick → done session, the day\'s other base sessions stay planned', async () => {
    const day = Array.from({ length: 14 }, (_, i) => addDays(FRI, 7 + i)).find((d) => dayItems(getDB(), d, FRI).some((i) => i.refType === 'weekTemplate'))!
    const lines = dayItems(getDB(), day, FRI).filter((i) => i.refType === 'weekTemplate')
    expect(lines[0].check).toBe('workout')
    checkItem(lines[0])
    const db = await reopen()
    const made = db.workouts.filter((w) => w.date === day)
    expect(made).toHaveLength(lines.length)
    expect(made.filter((w) => w.status === 'feito')).toHaveLength(1)
    expect(dayItems(db, day, FRI).filter((i) => i.refType === 'workout' && i.status === 'done')).toHaveLength(1)
  })

  it('weekly payments tick per week', async () => {
    const h = getDB().financialCategories.find((c) => c.name === 'Hortifruti e carnes')!
    const rows = billRows(getDB(), FRI)
    expect(rows.find((r) => r.category.id === h.id)?.paid).toBe(false)
    actions.toggleOccurrence('bill', h.id, '2026-10-05') // Monday of that week
    expect(billRows(getDB(), FRI).find((r) => r.category.id === h.id)?.paid).toBe(true)
    expect(billRows(getDB(), addDays(FRI, 3)).find((r) => r.category.id === h.id)?.paid).toBe(false)
  })
})
