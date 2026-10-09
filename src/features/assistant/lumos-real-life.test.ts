/**
 * Lumos as Marina uses her — every sentence goes through the real conversation, waits for the device,
 * then the app is REOPENED from that device (hydrate) and the persisted state is checked.
 * Not a parser test: what matters is what is on the device afterwards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { dayTimeline } from '@/data/timeline'
import { ensureReceivables, receivableId } from '@/data/finance/receivables'
import { FINANCE_SEED_IDS } from '@/features/finance/seed'
import { CAREER_SEED_IDS } from '@/features/career/seed'
import { weekProgress } from '@/data/career/activities'
import { lockSession, unlockSession } from '@/app/lock-store'
import { hashPin } from '@/lib/lock'
import { addDays, weekday } from '@/lib/date'
import type { DB } from '@/data/types'
import { whenSaved } from './act/commit'
import { ask, clearConversation, confirmReply, runOption, useConversation, type Exchange } from './conversation'

const MON = '2026-10-12'
const at = (date: string, hm: string): Now => {
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m, iso: new Date(`${date}T${hm}:00.000-03:00`).toISOString() }
}

let device: ReturnType<typeof createMemoryAdapter>

async function say(q: string, now: Now): Promise<Exchange> {
  const id = ask(q, now)!
  await whenSaved()
  const e = useConversation.getState().exchanges.find((x) => x.id === id)!
  const st = e.lumos?.status ?? e.adjust?.status ?? e.food?.status
  expect(st, `${q} → still saving or failed`).not.toMatch(/saving|failed/)
  return e
}
const text = (e: Exchange) => e.lumos?.reply.text ?? e.adjust?.plan.needsChoice?.question ?? e.adjust?.plan.doneTitle ?? e.adjust?.plan.summary ?? ''

/** Close the app (pagehide flushes pending screen edits) and open it again: everything comes from the device. */
async function reopen(): Promise<DB> {
  await whenSaved()
  await flushNow()
  await hydrate(device)
  return getDB()
}

const workoutsOn = (db: DB, date: string, mod: string) => db.workouts.filter((w) => w.date === date && w.modality === mod)

beforeEach(async () => {
  // The device clock is that Monday (only Date is faked: saves and promises run for real).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${MON}T07:00:00.000-03:00`))
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(MON))
  ensureReceivables(MON)
  await reopen()
  clearConversation()
  unlockSession()
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('Agenda / treino', () => {
  it('natação 6h45 · corrida sexta→sábado · hoje não vou nadar · pedal de domingo 3h30', async () => {
    const template = structuredClone(getDB().weekTemplate)
    const swim = workoutsOn(getDB(), MON, 'natacao')
    expect(swim, 'seed: natação on Monday').toHaveLength(1)

    await say('minha natação hoje é 6h45', at(MON, '05:30'))
    let db = await reopen()
    const swimEntry = dayTimeline(db, MON).find((e) => e.ref.type === 'workout' && e.ref.id === swim[0].id)
    expect(swimEntry?.start).toBe('06:45')

    const fri = addDays(MON, 4)
    const sat = addDays(MON, 5)
    const run = workoutsOn(db, fri, 'corrida')
    expect(run).toHaveLength(1)
    await say('passa minha corrida de sexta pra sábado', at(MON, '07:30'))
    db = await reopen()
    expect(workoutsOn(db, fri, 'corrida').filter((w) => w.status !== 'pulado'), 'gone from Friday').toHaveLength(0)
    expect(workoutsOn(db, sat, 'corrida').some((w) => w.status === 'planejado'), 'on Saturday').toBe(true)
    expect(db.weekTemplate, 'base template untouched').toEqual(template)

    await say('hoje não vou nadar', at(MON, '07:40'))
    db = await reopen()
    expect(db.workouts.find((w) => w.id === swim[0].id)?.status).toBe('pulado')

    const sun = addDays(MON, 6)
    const ride = db.workouts.find((w) => w.date === sun && ['bike', 'gravel', 'speed'].includes(w.modality))
    expect(ride, 'seed: pedal on Sunday').toBeDefined()
    await say('domingo o pedal vai ser 3h30', at(MON, '07:45'))
    db = await reopen()
    expect(db.workouts.find((w) => w.id === ride!.id)?.plannedDurationMin).toBe(210)
    expect(db.weekTemplate).toEqual(template)
  })
})

describe('Rotina', () => {
  it('amanhã acordo 5h30 · já fiz yoga hoje (not on the plan → an extra session, nothing else touched)', async () => {
    const tue = addDays(MON, 1)
    await say('amanhã acordo 5h30', at(MON, '20:00'))
    let db = await reopen()
    const first = dayTimeline(db, tue).find((e) => e.ref.type === 'routineItem' && e.start)
    expect(first?.start).toBe('05:30')
    expect(db.lifeLog.at(-1)?.title).toMatch(/acorda às 05:30/)

    const before = structuredClone(db.workouts)
    await say('já fiz yoga hoje', at(MON, '19:00'))
    db = await reopen()
    const yoga = db.workouts.filter((w) => w.date === MON && w.modality === 'yoga')
    expect(yoga.some((w) => w.status === 'feito')).toBe(true)
    // No OTHER workout changed status.
    for (const w of before) expect(db.workouts.find((x) => x.id === w.id)?.status, w.modality).toBe(w.status)
  })

  it('amanhã cancelei meu inglês — the session placed by "monta minha semana" is cancelled, nothing else', async () => {
    const plan = await say('monta minha semana', at(MON, '07:00'))
    if (plan.lumos?.status === 'pending') confirmReply(plan.id)
    await whenSaved()
    let db = await reopen()
    const sessions = db.tasks.filter((t) => t.careerParentId === CAREER_SEED_IDS.inglesExec && t.date)
    expect(sessions.length, 'the planner placed English sessions').toBeGreaterThan(0)
    const s = sessions.sort((a, b) => a.date!.localeCompare(b.date!))[0]
    const dayBefore = addDays(s.date!, -1)
    const e = await say('amanhã cancelei meu inglês', at(dayBefore, '20:00'))
    const { chooseAdjust, confirmAdjust } = await import('./conversation')
    // Two English things that day (a class and the executive session) → she picks; never a guess.
    const choice = e.adjust?.plan.needsChoice?.options.find((o) => o.label.includes(s.time!))
    if (e.adjust?.plan.needsChoice) {
      expect(choice, 'the placed session is offered').toBeDefined()
      chooseAdjust(e.id, choice!.plan)
      await whenSaved()
    }
    const ex = useConversation.getState().exchanges.find((x) => x.id === e.id)!
    if (ex.adjust?.status === 'preview') {
      confirmAdjust(e.id)
      await whenSaved()
    }
    db = await reopen()
    const entry = dayTimeline(db, s.date!).find((x) => x.ref.type === 'task' && x.ref.id === s.id)
    expect(entry?.status ?? db.tasks.find((t) => t.id === s.id)?.status, text(e)).toMatch(/cancel/)
    expect(db.tasks.filter((t) => t.careerParentId === CAREER_SEED_IDS.inglesExec && t.date && t.id !== s.id).every((t) => t.status === 'todo')).toBe(true)
  })
})

describe('Trabalho', () => {
  it('Fran ficou de me responder sexta · FashionFinder é prioridade hoje · essa tarefa já fiz', async () => {
    await say('Fran ficou de me responder sexta', at(MON, '10:00'))
    let db = await reopen()
    const fran = db.tasks.filter((t) => t.status === 'waiting' && t.waiting?.who === 'Fran')
    expect(fran).toHaveLength(1)
    expect(fran[0].waiting?.followUpOn).toBe(addDays(MON, 4))
    // Saying it again never duplicates.
    await say('Fran ficou de me responder sexta', at(MON, '10:05'))
    db = await reopen()
    expect(db.tasks.filter((t) => t.status === 'waiting' && t.waiting?.who === 'Fran')).toHaveLength(1)

    await say('FashionFinder é prioridade hoje', at(MON, '10:10'))
    db = await reopen()
    const top = db.priorities.filter((p) => p.date === MON && !p.domain).sort((a, b) => a.order - b.order)
    expect(top[0]?.title).toBe('FashionFinder')
    expect(top.length).toBeLessThanOrEqual(3)

    await say('preciso lembrar de revisar o deck do board', at(MON, '10:20'))
    const e = await say('essa tarefa já fiz', at(MON, '11:00'))
    expect(text(e)).toMatch(/feito ✓/)
    db = await reopen()
    expect(db.tasks.find((t) => /revisar o deck do board/i.test(t.title))?.status).toBe('done')
  })

  it('"essa tarefa já fiz" with nothing in the conversation asks — never guesses', async () => {
    const e = await say('essa tarefa já fiz', at(MON, '11:00'))
    expect(text(e)).toBe('Qual tarefa você fez?')
    expect(getDB().tasks.filter((t) => t.status === 'done').length).toBe((await reopen()).tasks.filter((t) => t.status === 'done').length)
  })
})

describe('Carreira', () => {
  it('30 min de inglês · vaga Head of Product · essa vaga não faz mais sentido · falei com Ana', async () => {
    await say('registra 30 min de inglês executivo hoje', at(MON, '08:00'))
    let db = await reopen()
    expect(weekProgress(db, MON).find((p) => p.kind === 'ingles_exec')?.done).toBe(1)

    await say('adiciona uma vaga de Head of Product na empresa X', at(MON, '12:00'))
    db = await reopen()
    expect(db.opportunities.map((o) => [o.role, o.company, o.status])).toEqual([['Head of Product', 'Empresa X', 'radar']])

    const talked = await say('falei com Ana da empresa X hoje', at(MON, '12:30'))
    runOption(talked.lumos!.reply.options![0])
    db = await reopen()
    expect(db.contacts.map((c) => [c.name, c.company, c.lastInteraction])).toEqual([['Ana', 'Empresa X', MON]])

    await say('essa vaga não faz mais sentido', at(MON, '13:00'))
    db = await reopen()
    expect(db.opportunities[0].status).toBe('descartada')
    expect(db.opportunities, 'never deleted, kept in history').toHaveLength(1)
    expect(db.lifeLog.filter((e) => e.ref?.type === 'opportunity').length).toBeGreaterThanOrEqual(2)
  })
})

describe('Dinheiro', () => {
  const SAN = receivableId(FINANCE_SEED_IDS.contractSantander, '2026-10')
  const FF = receivableId(FINANCE_SEED_IDS.contractFashionFinder, '2026-10')

  it('recebi o Santander hoje · o Fashion Finder ainda não pagou · quanto tenho previsto este mês?', async () => {
    const count = getDB().expenses.length
    await say('recebi o Santander hoje', at(MON, '09:00'))
    let db = await reopen()
    expect(db.expenses.find((e) => e.id === SAN)).toMatchObject({ status: 'received', receivedAmountCents: 2_000_000, expectedAmountCents: 2_000_000 })
    expect(db.expenses.length, 'same record, nothing new').toBe(count)

    const e = await say('o Fashion Finder ainda não pagou', at(MON, '09:05'))
    expect(text(e)).toMatch(/segue previsto/)
    db = await reopen()
    expect(db.expenses.find((x) => x.id === FF)?.status).toBe('expected')

    const f = await say('quanto tenho previsto este mês?', at(MON, '09:10'))
    expect(text(f)).toMatch(/R\$\s30\.000,00 previstos.*R\$\s20\.000,00 já recebidos/)
  })
})

describe('Vida', () => {
  it('terminei meu livro · adiciona comprar ração da Luna · faz minha lista de compras', async () => {
    const reading = getDB().books.find((b) => b.status === 'lendo')!
    await say('terminei meu livro', at(MON, '21:00'))
    let db = await reopen()
    expect(db.books.find((b) => b.id === reading.id)).toMatchObject({ status: 'finalizado', endDate: MON })

    const e = await say('adiciona comprar ração da Luna', at(MON, '21:05'))
    expect(text(e)).toMatch(/Luna · comprar/)
    db = await reopen()
    expect(db.tasks.filter((t) => t.title === 'Comprar ração da Luna')).toHaveLength(1)
    expect(db.tasks.find((t) => t.title === 'Comprar ração da Luna')).toMatchObject({ lifeAdminCategory: 'luna', adminKind: 'comprar', status: 'todo' })
    expect(db.tasks.find((t) => t.title === 'Comprar ração da Luna')?.time).toBeUndefined()

    const list = await say('faz minha lista de compras', at(MON, '21:10'))
    expect(text(list)).toMatch(/itens/)
  })
})

describe('Privacidade — Lumos while locked never reveals values, contracts, opportunities or people', () => {
  it('direct and indirect questions', async () => {
    await say('adiciona uma vaga de Head of Product na empresa X', at(MON, '12:00'))
    await say('recebi o Santander hoje', at(MON, '12:05'))
    const { hash, salt } = await hashPin('2580')
    actions.setProfile({ privacyLock: { enabled: true, areas: ['dinheiro', 'carreira'], pinHash: hash, pinSalt: salt, relockMinutes: 5 } })
    await whenSaved()
    await reopen()
    lockSession()
    clearConversation()
    // Santander / FashionFinder are also her work projects (visible in Trabalho); what must not show is
    // any value, a received/expected payment, the role, the company in process or the person.
    // (The North Star goal "Head of Product — 2027" lives in Metas, which is not a locked area.)
    const leaks = /R\$|\d{1,3}\.\d{3}|recebid|previst|Empresa X|Head of Product · |\bAna\b/
    for (const q of ['quanto vou receber?', 'qual minha renda?', 'quem estou entrevistando?', 'quanto tenho previsto este mês?', 'recebi o Santander hoje', 'o que aconteceu essa semana?', 'o que mudou hoje?', 'santander', 'Head of Product']) {
      const id = ask(q, at(MON, '13:00'))!
      await whenSaved()
      const e = useConversation.getState().exchanges.find((x) => x.id === id)!
      const shown = JSON.stringify({ lumos: e.lumos?.reply, adjust: e.adjust?.plan })
      expect(shown, q).not.toMatch(leaks)
      if (e.turn?.kind === 'answer') {
        const { askLumos } = await import('./chief')
        const { question: _q, ...answer } = askLumos(getDB(), q, MON, 780)
      expect(JSON.stringify(answer), q).not.toMatch(leaks)
      }
    }
    // Nothing was written while locked.
    expect(getDB().expenses.find((x) => x.id === receivableId(FINANCE_SEED_IDS.contractSantander, '2026-10'))?.status).toBe('received')
  })
})

it('sanity: MON is a Monday', () => expect(weekday(MON)).toBe(1))
