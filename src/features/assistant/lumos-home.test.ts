/**
 * Lumos changes the Home — each sentence goes through the conversation, waits for the device, and the
 * app is reopened before checking. Typed and spoken sentences are the same pipeline (a transcript IS text).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { SEED_IDS } from '@/data/seed/ids'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { dayItems } from '@/data/agenda/items'
import { CAREER_SEED_IDS } from '@/features/career/seed'
import { addDays } from '@/lib/date'
import type { DB } from '@/data/types'
import { whenSaved } from './act/commit'
import { ask, clearConversation, useConversation, type Exchange } from './conversation'

const THU = '2026-10-15'
const FRI = addDays(THU, 1)
let device: ReturnType<typeof createMemoryAdapter>

const at = (date: string, hm: string): Now => {
  vi.setSystemTime(new Date(`${date}T${hm}:00.000-03:00`))
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m, iso: new Date(`${date}T${hm}:00.000-03:00`).toISOString() }
}
async function say(q: string, now: Now): Promise<Exchange[]> {
  const before = useConversation.getState().exchanges.length
  ask(q, now)
  await whenSaved()
  const list = useConversation.getState().exchanges.slice(before)
  for (const e of list) expect(e.lumos?.status ?? e.adjust?.status ?? e.food?.status ?? 'ok', q).not.toMatch(/saving|failed/)
  return list
}
async function reopen(): Promise<DB> {
  await whenSaved()
  await flushNow()
  await hydrate(device)
  clearConversation()
  return getDB()
}
const task = (db: DB, title: string) => db.tasks.find((t) => t.title === title)!

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(THU, '08:00')
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(THU))
  actions.create('tasks', { title: 'Atualizar LinkedIn', status: 'todo', date: THU, context: 'carreira', order: 1 })
  actions.create('tasks', { title: 'Responder documentação X', status: 'todo', date: THU, projectId: SEED_IDS.projSantander, context: 'trabalho', order: 2 })
  await reopen()
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('Lumos changes the Home (text = transcript)', () => {
  it('"essa task do Santander já fiz" → that task is done', async () => {
    await say('essa task do Santander já fiz', at(THU, '11:00'))
    expect(task(await reopen(), 'Responder documentação X').status).toBe('done')
  })

  it('"passa LinkedIn pra amanhã" → out of today, into tomorrow', async () => {
    await say('passa LinkedIn pra amanhã', at(THU, '11:00'))
    const db = await reopen()
    const id = task(db, 'Atualizar LinkedIn').id
    expect(dayItems(db, THU, THU).some((i) => i.refId === id)).toBe(false)
    expect(dayItems(db, FRI, THU).some((i) => i.refId === id)).toBe(true)
  })

  it('two actions in one sentence: "já fiz yoga e passa LinkedIn pra amanhã"', async () => {
    const ex = await say('já fiz yoga e passa LinkedIn pra amanhã', at(THU, '20:00'))
    expect(ex).toHaveLength(2)
    expect(ex[1].partOf).toBe(ex[0].id)
    const db = await reopen()
    expect(db.workouts.some((w) => w.date === THU && w.modality === 'yoga' && w.status === 'feito')).toBe(true)
    expect(task(db, 'Atualizar LinkedIn').date).toBe(FRI)
  })

  it('"amanhã não tenho inglês e passa minha corrida pras sete" → both parts, the corrida at 07:00 tomorrow', async () => {
    const ex = await say('amanhã não tenho inglês e passa minha corrida pras sete', at(THU, '21:00'))
    expect(ex.length).toBe(2)
    const db = await reopen()
    const run = dayItems(db, FRI, THU).find((i) => i.refType === 'workout' && /corrida/i.test(i.title))!
    expect(run.start).toBe('07:00')
  })

  it('"não vou fazer inglês hoje" cancels the session placed today (and only that)', async () => {
    const quota = getDB().tasks.find((t) => t.id === CAREER_SEED_IDS.inglesExec)!
    actions.create('tasks', { title: '🗣️ Inglês executivo', date: THU, time: '19:00', durationMin: 30, status: 'todo', context: 'carreira', careerKind: 'ingles_exec', careerParentId: quota.id, order: 990 })
    await reopen()
    await say('não vou fazer inglês hoje', at(THU, '17:00'))
    const db = await reopen()
    const s = dayItems(db, THU, THU).find((i) => /Inglês executivo/.test(i.title))!
    expect(s.status).toBe('cancelled')
    expect(task(db, 'Atualizar LinkedIn').date).toBe(THU)
  })

  it('"acabei de fazer meu treino, foram sete quilômetros em Z2" → the planned session, done, with what she said', async () => {
    await say('acabei de fazer meu treino, foram sete quilômetros em Z2', at(FRI, '07:30'))
    const db = await reopen()
    const w = db.workouts.find((x) => x.date === FRI && x.modality === 'corrida')!
    expect(w).toMatchObject({ status: 'feito', distanceKm: 7 })
    expect(w.notes).toMatch(/Z2/)
  })

  it('"comi um YoPRO agora" → the same nutrition engine', async () => {
    const ex = await say('comi um YoPRO agora', at(THU, '16:00'))
    expect(ex[0].turn?.kind).toBe('foodLog')
  })

  it('event by text and by voice end in the SAME create_calendar_event — and never duplicate', async () => {
    await say('aniversário da Ana sábado 20h', at(THU, '10:00'))
    await say('coloca aniversário da Ana sábado às oito da noite', at(THU, '10:05'))
    const db = await reopen()
    const ev = db.events.filter((e) => e.title === 'Aniversário da Ana')
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ date: addDays(THU, 2), startTime: '20:00', allDay: false })
    expect(dayItems(db, addDays(THU, 2), THU).some((i) => i.title === 'Aniversário da Ana' && i.check === 'toggle')).toBe(true)
  })
})
