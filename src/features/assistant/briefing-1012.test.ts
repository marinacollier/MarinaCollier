/**
 * DAILY BRIEFING 12/10 — her real payload, applied THROUGH the importer (boot + Lumos + pasted JSON),
 * against her real seed. Reconciliation: B.O. stages are one obligation, JNB items are related but
 * distinct, Santander/Fashion Finder are not collapsed, Waiting For keeps its records, Inglês counts as
 * her weekly session, payments are recognised. Idempotent; her state wins; survives reopen, backup and
 * a new app version (seed migration) — including trip items she confirmed.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed, LIFE_SEED_VERSION } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { dayItems, undatedItems, upcomingDays } from '@/data/agenda/items'
import { radarItems } from '@/data/briefing/backlog'
import { applyBundledBriefings, bootWithBriefings } from '@/data/briefing/bundled'
import { applyPlan } from '@/data/briefing/apply'
import { planBriefing } from '@/data/briefing/import'
import { BRIEFING_2026_10_12 } from '@/data/seed/briefing-1012'
import type { DB } from '@/data/types'
import { checkItem } from '@/features/today/home/act'
import { makeBackup, validateBackup, type BackupPreview } from '@/features/settings/backup'
import { restoreBackup } from '@/features/settings/backup-io'
import { whenSaved } from './act/commit'
import { ask, clearConversation, confirmReply, useConversation } from './conversation'

const MON = '2026-10-12'
const TUE = '2026-10-13'
const JSON_TEXT = JSON.stringify(BRIEFING_2026_10_12, null, 2)
const SIX = ['Revisar LinkedIn executivo', 'Priorizar Fashion Finder', 'Preparar pauta Santander', 'Abrir B.O de pedágio', 'Organizar hospedagem JNB', 'Praticar inglês executivo']

let device: ReturnType<typeof createMemoryAdapter>
const at = (date: string, hm: string): Now => {
  vi.setSystemTime(new Date(`${date}T${hm}:00.000-03:00`))
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m, iso: new Date(`${date}T${hm}:00.000-03:00`).toISOString() }
}
/** Close the app and open it again (boot = load + migrate + bundled briefings). */
async function reopen(date = MON): Promise<DB> {
  await whenSaved()
  await flushNow()
  await bootWithBriefings(device, date)
  clearConversation()
  return getDB()
}
const last = () => useConversation.getState().exchanges.at(-1)!
async function say(q: string, hm = '12:00', date = MON) {
  ask(q, at(date, hm))
  await whenSaved()
  return last()
}
async function sayAndConfirm(q: string, hm = '12:00') {
  ask(q, at(MON, hm))
  const id = last().id
  if (last().lumos?.reply.action?.mode === 'confirm') confirmReply(id)
  await whenSaved()
  return useConversation.getState().exchanges.find((x) => x.id === id)!
}
const task = (db: DB, title: string) => db.tasks.find((t) => t.title === title)!
const todayTasks = (db: DB) => dayItems(db, MON, MON).filter((i) => i.refType === 'task')
const counts = (db: DB) => ({ tasks: db.tasks.length, backlog: db.backlogItems.length, projects: db.projects.length, cats: db.financialCategories.length, expenses: db.expenses.length })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(MON, '06:30')
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(MON))
  await whenSaved()
  await flushNow()
  at(MON, '06:45')
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('12/10 reaches her device through the importer (boot)', () => {
  it('the 6 actions are on Home today (B.O. overdue since 10/10), with the rest of her day; per-item result recorded', async () => {
    const before = counts(getDB())
    const db = await reopen()
    expect(db.profile.briefingsApplied).toEqual([MON])
    expect(db.importBatches).toHaveLength(1)
    const items = todayTasks(db)
    for (const t of SIX) expect(items.find((i) => i.title === t), t).toMatchObject({ status: 'pending', check: 'toggle' })
    expect(items.find((i) => i.title === 'Abrir B.O de pedágio')?.sub).toBe('atrasado desde 10/10')
    // Her day is still all there (training, meals, routines…), not replaced by the briefing.
    expect(dayItems(db, MON, MON).some((i) => i.refType === 'workout')).toBe(true)
    expect(dayItems(db, MON, MON).some((i) => i.refType === 'routine')).toBe(true)
    // 5 new to-dos (B.O. is her existing one), 2 new backlog items, nothing financial invented.
    expect(counts(db)).toEqual({ ...before, tasks: before.tasks + 5, backlog: before.backlog + 6 })
    // Field normalisation.
    expect(task(db, 'Revisar LinkedIn executivo')).toMatchObject({ date: MON, status: 'todo', priority: 'alta', durationMin: 25, doneCriteria: 'Headline e 3 evidências revisadas', context: 'carreira' })
    expect(task(db, 'Praticar inglês executivo')).toMatchObject({ date: MON, priority: 'baixa', optional: true, careerKind: 'ingles_exec', careerParentId: 'seed:career:ingles-executivo' })
    expect(task(db, 'Priorizar Fashion Finder').projectId).toBe('proj-fashionfinder')
    expect(task(db, 'Preparar pauta Santander').projectId).toBe('proj-santander')
    expect(task(db, 'Organizar hospedagem JNB').tripId).toBe('trip-africa-do-sul')
    // Per item: criado / atualizado / vinculado.
    const how = Object.fromEntries(db.importBatches[0].items.map((i) => [i.title, i.how]))
    expect(how).toEqual({
      'Revisar LinkedIn executivo': 'created',
      'Priorizar Fashion Finder': 'created',
      'Preparar pauta Santander': 'created',
      'Abrir B.O de pedágio': 'updated',
      'Organizar hospedagem JNB': 'created',
      'Praticar inglês executivo': 'created',
      'Épicos e agendas': 'created',
      'Apple, Google, PJ e LinkedIn': 'created',
      'Resolver multas': 'linked',
      'Confirmar hospedagem e safari': 'linked',
      'Alinhar próximos passos com Duda': 'linked',
      'Vitor · Day One': 'linked',
      'Thales · Tranquilo SP': 'linked',
      'Pagamentos mensais': 'linked',
    })
    expect(db.importBatches[0].review).toEqual([])
  })

  it('checked on Home → reopen → still done; reopening 3× and pasting the JSON 10× write nothing new', async () => {
    let db = await reopen()
    const snap = counts(db)
    at(MON, '09:00')
    for (const t of SIX) checkItem(todayTasks(getDB()).find((i) => i.title === t)!)
    for (let i = 0; i < 3; i++) db = await reopen()
    for (const t of SIX) expect(todayTasks(db).find((i) => i.title === t)?.status, t).toBe('done')
    for (let i = 0; i < 10; i++) await sayAndConfirm(JSON_TEXT, `10:${10 + i}`)
    expect(last().lumos?.reply.text).toMatch(/tudo isso já está no app ✓/)
    db = await reopen()
    expect(counts(db)).toEqual(snap)
    expect(db.importBatches).toHaveLength(1)
    for (const t of SIX) expect(todayTasks(db).find((i) => i.title === t)?.status, t).toBe('done')
  })
})

describe('Lumos: "Importa meu Daily Briefing de hoje" (no JSON pasted) — preview, confirm, real result', () => {
  it('preview separates new / existing / future / waiting / recurring with counts after reconciliation; nothing written before Importar', async () => {
    const data = (db: DB) => JSON.stringify([db.tasks, db.backlogItems, db.importBatches])
    const before = data(getDB())
    ask('Importa meu Daily Briefing de hoje', at(MON, '07:00'))
    const r = last().lumos!
    expect(r.status).toBe('pending')
    expect(r.reply.text).toBe('Daily Briefing · 12 out')
    expect(r.reply.action).toMatchObject({ mode: 'confirm', label: 'Importar' })
    expect(r.reply.sub).toMatch(/^6 tarefas do dia · 5 itens futuros · 2 aguardando retorno · 1 recorrência reconhecida/)
    expect(r.reply.sub).toMatch(/Resultado: 7 criados · 1 atualizado · 6 vinculados · 0 ignorados · 0 precisam de revisão/)
    expect(r.reply.sections?.map((s) => s.title)).toEqual(['Hoje', 'Próximos', 'Waiting For', 'Recorrências'])
    const bo = r.reply.sections![0].lines.find((l) => /B\.O/.test(l.text))!
    expect(bo).toMatchObject({ text: 'Abrir B.O de pedágio', isNew: false })
    expect(bo.sub).toMatch(/^atualiza — mesma obrigação de “Regularizar B\.O\. de pedágio” · atrasado desde 10\/10$/)
    expect(r.reply.sections![1].lines.find((l) => l.text === 'Épicos e agendas')?.sub).toBe('ter 13 – sex 16/10')
    expect(data(getDB())).toBe(before)
    confirmReply(last().id)
    await whenSaved()
    expect(last().lumos?.status).toBe('done')
    expect(last().lumos?.reply.action?.done).toMatch(/^Daily Briefing importado ✓ 5 tarefas adicionadas · 1 tarefa existente atualizada/)
    // Boot afterwards does not apply it a second time.
    const db = await reopen()
    expect(db.importBatches).toHaveLength(1)
    expect(db.tasks.filter((t) => t.title === 'Revisar LinkedIn executivo')).toHaveLength(1)
  })

  it('on a day without a bundled briefing, it asks for the JSON instead of inventing one', async () => {
    const r = await say('Importa meu Daily Briefing de hoje', '07:00', '2026-10-14')
    expect(r.lumos?.reply.text).toMatch(/Ainda não tenho o briefing de 14 out/)
    expect(r.lumos?.reply.action).toBeUndefined()
  })
})

describe('B.O. — abrir (10/10) → verificar (11/10) → regularizar (12/10) are ONE obligation', () => {
  it('open 10/10 + an 11/10 import → still one record, both names as aliases, due 10/10 kept (overdue, never moved)', async () => {
    at(MON, '06:50')
    const b11 = { date: '2026-10-11', source: 'Daily Executive Briefing', tasks: [{ title: 'Verificar B.O. de pedágio', category: 'Logística', project: 'Vida/Admin', priority: 'P1', done_criteria: 'Situação do B.O. verificada', estimated_minutes: 15, status: 'todo', due_date: '2026-10-10' }] }
    applyPlan(planBriefing(getDB(), [b11])!)
    const db = await reopen()
    const bos = db.tasks.filter((t) => /b\.?o\.? de ped/i.test(t.title))
    expect(bos.map((t) => t.title)).toEqual(['Abrir B.O de pedágio'])
    expect(bos[0]).toMatchObject({ status: 'todo', date: '2026-10-10', dueDate: '2026-10-10', aliases: ['Verificar B.O. de pedágio', 'Regularizar B.O. de pedágio'] })
    expect(todayTasks(db).find((i) => i.refId === bos[0].id)?.sub).toBe('atrasado desde 10/10')
  })

  it('already done → preserved, not recreated (and reimport keeps it so)', async () => {
    await say('B.O. feito.', '06:50')
    let db = await reopen()
    expect(db.tasks.filter((t) => /b\.?o\.? de ped/i.test(t.title)).map((t) => [t.title, t.status])).toEqual([['Abrir B.O de pedágio', 'done']])
    expect(db.importBatches[0].items.find((i) => /B\.O/.test(i.title))).toMatchObject({ how: 'kept' })
    await sayAndConfirm(JSON_TEXT, '13:00')
    db = await reopen()
    expect(db.tasks.filter((t) => /b\.?o\.? de ped/i.test(t.title)).map((t) => t.status)).toEqual(['done'])
  })

  it('"O B.O. ainda está pendente" → confirms where it stands, changes nothing', async () => {
    const db0 = await reopen()
    const r = await say('O B.O. ainda está pendente')
    expect(r.lumos?.reply.text).toBe('Combinado: “Abrir B.O de pedágio” segue pendente — atrasado desde 10/10.')
    expect(r.lumos?.reply.action).toBeUndefined()
    expect(JSON.stringify((await reopen()).tasks)).toBe(JSON.stringify(db0.tasks))
  })
})

describe('JNB — related (trip África do Sul), not duplicated, not merged', () => {
  it('with the 10/10 already imported: consolidar ≠ organizar ≠ confirmar reservas; one record each', async () => {
    const b10 = {
      date: '2026-10-10',
      source: 'Daily Executive Briefing',
      tasks: [{ title: 'Consolidar pendências JNB', category: 'Viagem', project: 'África do Sul', priority: 'P3', done_criteria: 'Pendências de hospedagem e safari identificadas', estimated_minutes: 20, status: 'todo', due_date: null }],
      backlog_watchlist: [{ title: 'Hospedagem e safari JNB', project: 'África do Sul', status: 'scheduled', notes: 'Resolver na próxima semana' }],
    }
    at(MON, '06:50')
    applyPlan(planBriefing(getDB(), [b10])!)
    const db = await reopen()
    const jnb = db.tasks.filter((t) => /JNB/.test(t.title)).map((t) => t.title).sort()
    expect(jnb).toEqual(['Consolidar pendências JNB', 'Organizar hospedagem JNB', 'Resolver hospedagem e safari JNB'])
    for (const t of db.tasks.filter((x) => /JNB/.test(x.title))) expect(t.tripId, t.title).toBe('trip-africa-do-sul')
    // "Confirmar hospedagem e safari" is the same intention as 10/10's "Hospedagem e safari JNB": seen again, not a 2nd item.
    expect(db.backlogItems.filter((b) => /hospedagem e safari/i.test(b.title)).map((b) => b.title)).toEqual(['Hospedagem e safari JNB'])
  })

  it('"Já resolvi a hospedagem de JNB" completes the hospedagem to-do only — the safari stays open', async () => {
    await reopen()
    const r = await say('Já resolvi a hospedagem de JNB')
    expect(r.lumos?.reply.text).toBe('“Organizar hospedagem JNB” feito ✓')
    const db = await reopen()
    expect(task(db, 'Organizar hospedagem JNB').status).toBe('done')
    expect(task(db, 'Resolver hospedagem e safari JNB').status).toBe('todo')
    expect(db.backlogItems.find((b) => b.title === 'Confirmar hospedagem e safari')?.status).not.toBe('done')
  })
})

describe('Santander, Fashion Finder, payments — nothing collapsed, nothing copied', () => {
  it('existing Santander épicos stay; today = "Preparar pauta"; 13–16/10 is future; FF launch pendências are one watch item (no task copies)', async () => {
    const before = getDB().tasks.filter((t) => t.projectId === 'proj-santander').map((t) => [t.id, t.status, t.date, t.dueDate])
    const db = await reopen()
    for (const row of before) {
      const t = db.tasks.find((x) => x.id === row[0])!
      expect([t.id, t.status, t.date, t.dueDate]).toEqual(row)
    }
    expect(db.tasks.filter((t) => t.projectId === 'proj-santander').length).toBe(before.length + 1)
    expect(db.backlogItems.find((b) => b.title === 'Épicos e agendas')).toMatchObject({ status: 'open', window: { from: TUE, until: '2026-10-16' } })
    const ff = db.tasks.filter((t) => t.projectId === 'proj-fashionfinder').map((t) => t.title)
    expect(ff.filter((t) => /Apple|Google|PJ|LinkedIn/.test(t))).toHaveLength(4) // her 4, no copies
    expect(db.backlogItems.filter((b) => b.kind === 'recurring')).toHaveLength(1)
    expect(db.backlogItems.find((b) => b.kind === 'recurring')?.recognizedAs).toMatch(/^Pagamentos do mês/)
  })

  it('"O Santander fica para terça" moves today\'s pauta (that occurrence) — nothing else', async () => {
    const db0 = await reopen()
    const others = db0.tasks.filter((t) => t.projectId === 'proj-santander' && t.title !== 'Preparar pauta Santander')
    const r = await say('O Santander fica para terça')
    expect(r.lumos?.reply.text).toMatch(/“Preparar pauta Santander” vai pra/)
    const db = await reopen()
    expect(task(db, 'Preparar pauta Santander').date).toBe(TUE)
    for (const t of others) expect(db.tasks.find((x) => x.id === t.id)?.date).toBe(t.date)
    expect(todayTasks(db).some((i) => i.title === 'Preparar pauta Santander')).toBe(false)
  })
})

describe('Próximos ≠ Hoje', () => {
  it('13–16/10 items, FF launch, multas, hospedagem e safari, Duda — in Próximos, no invented time, not on today', async () => {
    const db = await reopen()
    const today = dayItems(db, MON, MON).map((i) => i.title)
    for (const t of ['Épicos e agendas', 'Apple, Google, PJ e LinkedIn', 'Resolver multas do carro', 'Resolver hospedagem e safari JNB', 'Definir próximos passos com Duda']) expect(today, t).not.toContain(t)
    const radar = radarItems(db, MON)
    expect(radar.map((i) => `${i.title} · ${i.sub}`)).toEqual(['Épicos e agendas · ter 13 – sex 16/10', 'Apple, Google, PJ e LinkedIn · sem data'])
    const fri = upcomingDays(db, MON, 6).find((d) => d.date === '2026-10-16')!.items
    for (const t of ['Resolver multas do carro', 'Resolver hospedagem e safari JNB']) expect(fri.find((i) => i.title === t)?.start, t).toBeUndefined()
    expect(fri.map((i) => i.title)).toEqual(expect.arrayContaining(['Resolver multas do carro', 'Resolver hospedagem e safari JNB']))
    expect(undatedItems(db, MON).map((i) => i.title)).toContain('Definir próximos passos com Duda')
  })
})

describe('her answers stick across reimport', () => {
  it('"Já revisei o LinkedIn" → that one done (not the FF LinkedIn page); reimport → still done', async () => {
    await reopen()
    const r = await say('Já revisei o LinkedIn')
    expect(r.lumos?.reply.text).toBe('“Revisar LinkedIn executivo” feito ✓')
    await sayAndConfirm(JSON_TEXT, '13:00')
    const db = await reopen()
    expect(task(db, 'Revisar LinkedIn executivo').status).toBe('done')
    expect(task(db, 'Criar página no LinkedIn para Fashion Finder').status).toBe('todo')
    expect(db.tasks.filter((t) => t.title === 'Revisar LinkedIn executivo')).toHaveLength(1)
  })

  it('"Vitor respondeu" → resolved, same record; reimport → never back to waiting', async () => {
    await reopen()
    const id = getDB().tasks.find((t) => t.waiting?.who === 'Vitor')!.id
    await say('Vitor respondeu.')
    await sayAndConfirm(JSON_TEXT, '13:00')
    const db = await reopen()
    expect(db.tasks.filter((t) => t.waiting?.who === 'Vitor').map((t) => [t.id, t.status])).toEqual([[id, 'done']])
  })

  it('"Quais são minhas prioridades da semana?" answers from the real state (the briefing\'s to-dos included)', async () => {
    await reopen()
    const r = (await say('Quais são minhas prioridades da semana?')).lumos!.reply
    const sec = (title: string) => r.sections?.find((s) => s.title === title)?.lines.map((l) => `${l.text} · ${l.sub ?? ''}`) ?? []
    expect(sec('Atrasado')).toEqual(['Abrir B.O de pedágio · desde 10/10 · prioridade alta'])
    expect(sec('Esta semana').slice(0, 1)).toEqual([expect.stringMatching(/^Revisar LinkedIn executivo · hoje/)])
    expect(sec('Esta semana').join('\n')).toMatch(/Preparar pauta Santander[\s\S]*Resolver multas do carro|Resolver multas do carro[\s\S]*Preparar pauta Santander/)
    expect(sec('No radar')).toEqual([expect.stringMatching(/^Épicos e agendas · ter 13 – sex 16\/10/)])
    expect(sec('Esperando').map((l) => l.split(' · ')[0])).toEqual(expect.arrayContaining(['Vitor', 'Thales']))
    expect(r.text).toMatch(/^Pra semana, primeiro: Abrir B\.O de pedágio · Revisar LinkedIn executivo/)
    // It reads, never writes.
    expect(last().lumos?.reply.action).toBeUndefined()
  })
})

describe('persistence', () => {
  it('backup export → wipe → restore: briefing records, aliases, sources, batch and the applied mark come back; boot does not re-apply', async () => {
    await reopen()
    await say('Já revisei o LinkedIn')
    const before = await reopen()
    const text = JSON.stringify(makeBackup(before))
    device = createMemoryAdapter()
    await hydrate(device)
    await restoreBackup(validateBackup(JSON.parse(text)) as BackupPreview)
    const after = await reopen()
    const pick = (db: DB) => ({
      tasks: db.tasks.filter((t) => t.source || t.aliases).map((t) => [t.title, t.status, t.date, t.dueDate, t.aliases, t.source?.sourceKey, t.careerParentId]),
      backlog: db.backlogItems.map((b) => [b.title, b.status, b.window?.from, b.promotedTaskId]),
      batches: db.importBatches.map((b) => [b.id, b.briefingDate, b.items.length]),
      applied: db.profile.briefingsApplied,
    })
    expect(pick(after)).toEqual(pick(before))
    expect(after.importBatches).toHaveLength(1)
  })

  it('a new app version (older seedVersion persisted → seed migration) keeps confirmed trip items confirmed and the briefing as she left it', async () => {
    await reopen()
    at(MON, '10:00')
    const hosp = getDB().tripItems.find((i) => i.title === 'Hospedagem Johannesburg')!
    actions.update('tripItems', hosp.id, { status: 'confirmado', confirmationCode: 'ABC123' })
    const safari = getDB().tripItems.find((i) => i.title === 'Reserva do safari')!
    actions.update('tripItems', safari.id, { status: 'confirmado' })
    checkItem(todayTasks(getDB()).find((i) => i.title === 'Organizar hospedagem JNB')!)
    // Her same item under an id of an older seed (confirmed) — the new seed must not add an "a confirmar" copy.
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = getDB().tripItems.find((i) => i.title === 'Hospedagem Cape Town')!
    actions.remove('tripItems', _id)
    actions.create('tripItems', { ...rest, id: 'old-random-id-cape-town', status: 'confirmado' })
    // An install from before the seed bookkeeping (no seedIds / tombstones) gets the new version.
    actions.setProfile({ seedVersion: 7, removedSeedIds: [], seedIds: undefined })
    await whenSaved()
    await flushNow()
    at(TUE, '07:00') // the next day, a new version opens
    const db = await reopen(TUE)
    expect(db.profile.seedVersion).toBe(LIFE_SEED_VERSION)
    expect(db.tripItems.find((i) => i.id === hosp.id)).toMatchObject({ status: 'confirmado', confirmationCode: 'ABC123' })
    expect(db.tripItems.find((i) => i.id === safari.id)?.status).toBe('confirmado')
    expect(db.tripItems.filter((i) => i.title === 'Hospedagem Cape Town').map((i) => i.status)).toEqual(['confirmado'])
    expect(task(db, 'Organizar hospedagem JNB').status).toBe('done')
    expect(db.importBatches).toHaveLength(1)
  })

  it('an instance left open with a stale snapshot never writes it over a newer save just by going hidden', async () => {
    await reopen()
    const id = getDB().tripItems.find((i) => i.title === 'Hospedagem Johannesburg')!.id
    // Another (newer) instance saved a confirmation to the device meanwhile.
    const stored = device.data as DB
    device.data = { ...stored, tripItems: stored.tripItems.map((i) => (i.id === id ? { ...i, status: 'confirmado' } : i)) }
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
    await flushNow()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    expect((device.data as DB).tripItems.find((i) => i.id === id)?.status).toBe('confirmado')
  })

  it('a device that fails to load is never overwritten with the seed', async () => {
    await reopen()
    const saved = JSON.stringify(device.data)
    const flaky = { ...device, load: async () => Promise.reject(new Error('blocked')), save: vi.fn(device.save) }
    await hydrate(flaky)
    actions.update('tasks', getDB().tasks[0].id, { title: 'mexi' })
    await flushNow()
    expect(flaky.save).not.toHaveBeenCalled()
    expect(JSON.stringify(device.data)).toBe(saved)
    expect(getDB().profile.briefingsApplied).toBeUndefined()
  })

  it('applyBundledBriefings runs once per install and only in the briefing\'s week', async () => {
    expect(applyBundledBriefings('2026-10-11')).toEqual([])
    expect(applyBundledBriefings('2026-10-20')).toEqual([])
    expect(applyBundledBriefings(MON)).toEqual([MON])
    expect(applyBundledBriefings(MON)).toEqual([])
    expect(getDB().importBatches).toHaveLength(1)
  })
})
