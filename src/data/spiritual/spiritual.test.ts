/**
 * Bíblia, Graça & Liberdade — plans as data, progress = sessions concluded, one done-state shared with
 * the Home, and her progress/reflections survive reseeds, deploys and backups.
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { buildSeed } from '../seed'
import { applyLifeSeed } from '../seed/migrate'
import { applySpiritualSeed, SPIRITUAL_PLAN_IDS, sessionSeedId } from '../seed/spiritual'
import { actions, detachStorage, flushNow, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import type { DB } from '../types'
import { dayItems } from '../agenda/items'
import { blockGroups, currentPlan, nextSession, planProgress, planStatus, totalProgress } from './model'
import { saveJournal, setSessionDone } from './ops'
import { checkItem } from '@/features/today/home/act'
import { generateStudy, parseStudy, studyAvailability } from '@/features/spiritual/study'
import { makeBackup, validateBackup, type BackupPreview } from '@/features/settings/backup'
import { restoreBackup } from '@/features/settings/backup-io'
import { todayKey } from '@/lib/date'

const DAY = '2026-10-12'
const EX = SPIRITUAL_PLAN_IDS.exodo
const ex = (n: number) => sessionSeedId('exodo', n)

afterEach(() => detachStorage())

async function fresh() {
  const device = createMemoryAdapter()
  await hydrate(device)
  return device
}

/** Her phone before this module existed (seed v9, with bookkeeping). */
function installWithoutBible(): DB {
  const db = buildSeed(DAY)
  const ids = Object.values(db).flatMap((l) => (Array.isArray(l) ? l.map((r) => (r as { id: string }).id) : []))
  db.spiritualPlans = []
  db.spiritualSessions = []
  db.profile = { ...db.profile, seedIds: ids.filter((id) => !id.startsWith('seed:biblia:')) }
  return db
}

const STUDY = {
  temaCentral: 'Deus ouve.',
  contextoHistorico: 'Contexto.',
  explicacao: 'Explicação.',
  contextoTeologico: 'Teologia.',
  olharProgressista: 'Libertação.',
  leituraContemplativa: 'Silêncio.',
  aplicacaoPessoal: 'Possibilidades.',
  perguntas: ['Um?', 'Dois?', 'Três?'],
  oracao: 'Amém.',
  fraseDoDia: 'Você é ouvida.',
}

describe('seed: Êxodo and the planned plans', () => {
  const db = buildSeed(DAY)

  it('Êxodo has 40 sessions, one per chapter, each its own record, in 8 blocks', () => {
    const list = db.spiritualSessions.filter((s) => s.planId === EX).sort((a, b) => a.sortOrder - b.sortOrder)
    expect(list).toHaveLength(40)
    expect(new Set(list.map((s) => s.id)).size).toBe(40)
    list.forEach((s, i) => {
      expect(s.scriptureReference).toBe(`Êxodo ${i + 1}`)
      expect(s.chapterNumber).toBe(i + 1)
      expect(s.title.length).toBeGreaterThan(3)
    })
    const plan = db.spiritualPlans.find((p) => p.id === EX)!
    expect(plan.title).toBe('Êxodo — Da opressão à presença')
    const groups = blockGroups(db, plan)
    expect(groups.map((g) => g.sessions.length)).toEqual([5, 5, 5, 5, 4, 7, 3, 6])
    expect(groups[0].title).toBe('Opressão, chamado e resistência')
    expect(groups[7].title).toBe('Construção e presença de Deus')
  })

  it('Êxodo 1–5 are done (no invented date), 6–40 pending, next is Êxodo 6', () => {
    for (let n = 1; n <= 40; n++) {
      const s = db.spiritualSessions.find((x) => x.id === ex(n))!
      expect(s.status).toBe(n <= 5 ? 'concluido' : 'pendente')
      expect(s.completedAt).toBeUndefined()
      if (n <= 5) expect(s.importedDone).toBe(true)
    }
    expect(currentPlan(db)?.id).toBe(EX)
    expect(nextSession(db)?.scriptureReference).toBe('Êxodo 6')
    expect(planProgress(db, EX)).toEqual({ done: 5, total: 40, pct: 13 })
    expect(planStatus(db, EX)).toBe('em_andamento')
  })

  it('the 5 plans exist, in order, the others not started', () => {
    const plans = [...db.spiritualPlans].sort((a, b) => a.sortOrder - b.sortOrder)
    expect(plans.map((p) => p.title)).toEqual([
      'Êxodo — Da opressão à presença',
      'Justiça e voz dos profetas',
      'Jesus e a graça radical',
      'Amor, comunidade e inclusão',
      'Oração e contemplação',
    ])
    const count = (id: string) => db.spiritualSessions.filter((s) => s.planId === id).length
    expect([EX, SPIRITUAL_PLAN_IDS.profetas, SPIRITUAL_PLAN_IDS.graca, SPIRITUAL_PLAN_IDS.comunidade, SPIRITUAL_PLAN_IDS.oracao].map(count)).toEqual([40, 5, 27, 9, 8])
    for (const p of plans.slice(1)) expect(planStatus(db, p.id)).toBe('nao_iniciado')
    expect(db.spiritualSessions.filter((s) => s.complementary).map((s) => s.scriptureReference)).toEqual(['Mateus 5', 'Mateus 6', 'Mateus 7'])
    expect(totalProgress(db).done).toBe(5)
  })
})

describe('check / uncheck', () => {
  it('updates progress, is retroactive and persists after reopening the app', async () => {
    const device = await fresh()
    setSessionDone(ex(6), true)
    expect(planProgress(getDB(), EX).done).toBe(6)
    expect(nextSession(getDB())?.scriptureReference).toBe('Êxodo 7')
    setSessionDone(ex(12), true) // retroactive / out of order is fine
    setSessionDone(ex(3), false)
    expect(planProgress(getDB(), EX).done).toBe(6)
    expect(nextSession(getDB())?.scriptureReference).toBe('Êxodo 3')
    await flushNow()

    await hydrate(device)
    const db = getDB()
    expect(db.spiritualSessions.find((s) => s.id === ex(6))?.status).toBe('concluido')
    expect(db.spiritualSessions.find((s) => s.id === ex(6))?.completedAt).toBeTruthy()
    expect(db.spiritualSessions.find((s) => s.id === ex(3))?.status).toBe('pendente')
    expect(planProgress(db, EX).done).toBe(6)
  })

  it('reflections survive unchecking; writing or generating never marks done', async () => {
    await fresh()
    const entry = saveJournal(ex(6), { reflectionGod: 'Ele ouve', keyword: 'clamor' })!
    expect(getDB().spiritualSessions.find((s) => s.id === ex(6))?.status).toBe('em_andamento')
    const r = await generateStudy(getDB().spiritualSessions.find((s) => s.id === ex(6))!, 'Êxodo', 'minhas notas', async () => STUDY)
    expect(r.ok).toBe(true)
    expect(getDB().spiritualSessions.find((s) => s.id === ex(6))?.status).toBe('em_andamento')
    expect(planProgress(getDB(), EX).done).toBe(5)

    setSessionDone(ex(6), true)
    setSessionDone(ex(6), false)
    expect(getDB().spiritualJournal.find((j) => j.id === entry.id)?.keyword).toBe('clamor')
    expect(getDB().spiritualStudies.filter((s) => s.sessionId === ex(6))).toHaveLength(1)
    expect(getDB().spiritualSessions.find((s) => s.id === ex(6))?.status).toBe('em_andamento')
  })
})

describe('reseed / deploy', () => {
  it('arrives once on an existing install; running twice never duplicates nor overwrites her progress', async () => {
    const device = createMemoryAdapter()
    await device.save(installWithoutBible())
    await hydrate(device)
    expect(getDB().spiritualSessions).toHaveLength(89)
    expect(getDB().spiritualPlans).toHaveLength(5)

    setSessionDone(ex(6), true)
    setSessionDone(ex(2), false)
    saveJournal(ex(2), { personalReflection: 'resistência' })
    actions.remove('spiritualSessions', sessionSeedId('oracao', 'salmos-91'))
    await flushNow()

    await hydrate(device)
    await hydrate(device)
    const db = getDB()
    expect(new Set(db.spiritualSessions.map((s) => s.id)).size).toBe(db.spiritualSessions.length)
    expect(db.spiritualSessions).toHaveLength(88) // the one she deleted stays deleted
    expect(db.spiritualSessions.find((s) => s.id === ex(6))?.status).toBe('concluido')
    expect(db.spiritualSessions.find((s) => s.id === ex(2))?.status).toBe('em_andamento')
    expect(db.spiritualJournal).toHaveLength(1)

    // A pure re-apply is a no-op (same object), and a later life-seed version bump keeps everything.
    expect(applySpiritualSeed(db)).toBe(db)
    const bumped = applySpiritualSeed(applyLifeSeed({ ...db, profile: { ...db.profile, seedVersion: 8 } }, DAY))
    expect(bumped.spiritualSessions).toHaveLength(88)
    expect(bumped.spiritualPlans).toHaveLength(5)
    expect(bumped.spiritualSessions.find((s) => s.id === ex(6))?.status).toBe('concluido')
    expect(bumped.spiritualSessions.find((s) => s.id === ex(2))?.status).toBe('em_andamento')
  })
})

describe('Home', () => {
  it('shows the next study (no due date, not overdue) and its check IS the session', async () => {
    await fresh()
    const today = todayKey()
    const item = () => dayItems(getDB(), today, today).find((i) => i.refType === 'spiritualSession')
    const first = item()!
    expect(first.refId).toBe(ex(6))
    expect(first.status).toBe('pending')
    expect(first.important).toBe(false)
    expect(first.carried).toBeFalsy()
    expect(dayItems(getDB(), '2099-01-01', today).some((i) => i.refType === 'spiritualSession')).toBe(false)

    expect(checkItem(first)).toBe(true)
    expect(getDB().spiritualSessions.find((s) => s.id === ex(6))?.status).toBe('concluido')
    expect(item()).toMatchObject({ refId: ex(6), status: 'done' })

    // Unchecked in the module → the Home line is pending again (same record).
    setSessionDone(ex(6), false)
    expect(item()).toMatchObject({ refId: ex(6), status: 'pending' })

    actions.setProfile({ spiritualOnHome: false })
    expect(item()).toBeUndefined()
  })
})

describe('backup', () => {
  it('a restore brings plans, sessions, notebook, studies and prayers back exactly', async () => {
    await fresh()
    setSessionDone(ex(6), true)
    saveJournal(ex(6), { prayer: 'Obrigada', notes: 'n' })
    await generateStudy(getDB().spiritualSessions.find((s) => s.id === ex(7))!, 'Êxodo', undefined, async () => STUDY)
    actions.create('spiritualPrayers', { content: 'Pela minha família', category: 'intencao' })
    await flushNow()
    const before = structuredClone(getDB())
    const text = JSON.stringify(makeBackup(getDB()))

    const device = await fresh()
    expect(getDB().spiritualPrayers).toHaveLength(0)
    const preview = validateBackup(JSON.parse(text))
    expect(preview.ok).toBe(true)
    await restoreBackup(preview as BackupPreview)
    await hydrate(device)
    const after = getDB()
    for (const k of ['spiritualPlans', 'spiritualSessions', 'spiritualStudies', 'spiritualJournal', 'spiritualPrayers'] as const) expect(after[k], k).toEqual(before[k])
  })
})

describe('Estudar com IA', () => {
  it('without a server the button is pending connection; incomplete answers are never saved', async () => {
    expect(studyAvailability(true)).toBe('no_server')
    expect(parseStudy({ ...STUDY, perguntas: ['só uma'] })).toBeUndefined()
    expect(parseStudy({ ...STUDY, explicacao: '' })).toBeUndefined()
    expect(parseStudy(STUDY)).toEqual(STUDY)
    await fresh()
    const r = await generateStudy(getDB().spiritualSessions.find((s) => s.id === ex(8))!, undefined, undefined, async () => ({ temaCentral: 'x' }))
    expect(r.ok).toBe(false)
    expect(getDB().spiritualStudies).toHaveLength(0)
  })
})
