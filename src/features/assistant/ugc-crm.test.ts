/**
 * CRM Marcas / UGC Business (12/10/2026) — acceptance: the deploy reconciles her real brands once
 * (aliases merged, never a look-alike), relationship ≠ revenue, the 12/10 tasks are real Tasks checked on
 * Home and in UGC, re-running creates nothing, a done task never reopens, a backup brings it all back.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { tasksForDay } from '@/data/selectors'
import { approachToday, followUpsDue, prospects, ugcDayActions } from '@/data/ugc/model'
import { ensureProspect, recordOutbound } from '@/data/ugc/ops'
import { crmDashboard, isUgcTask, matchBrand, parseCrmPaste, reconcileCrm, ugcMoney } from '@/data/ugc/crm'
import { importCrmText, rescheduleTask, setUgcTaskState, toggleStep, addStep } from '@/data/ugc/crm-ops'
import { applyUgcCrmSeed, PROPOSALS_2026_10_11, ugcTaskId, UGC_CRM_ROWS } from '@/data/seed/ugc-crm'
import { setTaskDone } from '@/features/tasks/ops'
import { makeBackup, validateBackup, type BackupPreview } from '@/features/settings/backup'
import { restoreBackup } from '@/features/settings/backup-io'
import type { DB } from '@/data/types'
import { whenSaved } from './act/commit'

const MON = '2026-10-12'
const at = (date: string, hm = '10:00') => vi.setSystemTime(new Date(`${date}T${hm}:00.000-03:00`))
let device: ReturnType<typeof createMemoryAdapter>
async function reopen(): Promise<DB> {
  await whenSaved()
  await flushNow()
  await hydrate(device)
  return getDB()
}
/** A new deploy reaching her device (stored seed version older than the code's). */
async function deploy(): Promise<DB> {
  actions.setProfile({ seedVersion: 9 })
  return reopen()
}

const AFFILIATES = ['Hardyn', 'ELA UP', 'Pink Cheeks', 'Bora Nutrition']
const PRESS = ['Natusvita', 'Vitergyl', 'Breevo', 'Feelgomy', 'Alright', 'VHydra']
const NEG = ['Rituária', 'Z2 Performance', 'Snugg Wear', 'Yoclay', 'Mahta', 'Ocean Drop', 'ADA Nutracêuticos', 'HEY!MU', 'HolyFoods']
const PAID = ['Woom', 'Cumbuca Boa', 'Nomad', 'Insider', 'Vhita', 'Zerezes', 'Liquidz', 'Yaru']
const ALL = [...AFFILIATES, ...PRESS, ...NEG, 'Outlive Nutrition', ...PROPOSALS_2026_10_11, ...PAID]
const brandNamed = (db: DB, n: string) => matchBrand(db.brands, n)
const card = (db: DB, id: string) => crmDashboard(db).find((c) => c.id === id)!

let snugOpp: string
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at('2026-10-08')
  device = createMemoryAdapter()
  await hydrate(device)
  // (time moves on between the first-run seed, its migration and her edits — as on a real device)
  const seed = buildSeed('2026-10-08')
  at('2026-10-08', '10:30')
  actions.replaceDB(seed)
  at('2026-10-08', '11:00')
  // Before the deploy she already had "Snug" (old spelling) being chased, and "Nomad" as a prospect.
  const snug = ensureProspect('Snug')
  recordOutbound(snug.opportunity.id, 'email', { date: '2026-10-08' })
  snugOpp = snug.opportunity.id
  ensureProspect('Nomad')
  await reopen()
  at(MON, '08:00')
  await deploy()
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('brands reconciled once', () => {
  it('every listed brand is present exactly once; Snug + Snugg Wear are one brand', () => {
    const db = getDB()
    for (const n of ALL) expect(db.brands.filter((b) => b === brandNamed(db, n)).length, n).toBe(1)
    const keys = db.brands.map((b) => b.name.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
    const snug = brandNamed(db, 'Snug')!
    expect(snug.name).toBe('Snugg Wear')
    expect(snug.aliases).toContain('Snug')
    expect(brandNamed(db, 'Feelgoomy')!.name).toBe('Feelgomy')
    expect(brandNamed(db, 'Z2')!.name).toBe('Z2 Performance')
    expect(brandNamed(db, 'Vitergel')!.name).toBe('Vitergyl')
    expect(db.brands.filter((b) => /nomad/i.test(b.name))).toHaveLength(1)
  })

  it('a look-alike name is never merged', () => {
    const { db, report } = reconcileCrm(getDB(), [{ name: 'Snuggle Kids' }, { name: 'Z22 Bikes' }], { now: new Date().toISOString() })
    expect(report.created).toEqual(['Snuggle Kids', 'Z22 Bikes'])
    expect(db.brands.find((b) => b.name === 'Snugg Wear')!.aliases).not.toContain('Snuggle Kids')
  })
})

describe('relationship statuses', () => {
  it('6 press kits (history, not payment) — a brand can have press kit + coupon', () => {
    const db = getDB()
    expect(card(db, 'presskits').value).toBe('6')
    for (const n of PRESS) expect(brandNamed(db, n)!.crm?.pressKits?.length, n).toBe(1)
    for (const n of PRESS) expect(brandNamed(db, n)!.crm?.status).toBe('press_kit')
  })

  it('9 confirmed negatives dated 11/10, no follow-up — the Snug chase stops', () => {
    const db = getDB()
    expect(card(db, 'negativas').value).toBe('9')
    for (const n of NEG) {
      const b = brandNamed(db, n)!
      expect(b.crm).toMatchObject({ status: 'negativa', statusAt: '2026-10-11', noFollowUp: true })
    }
    const o = db.ugcOpportunities.find((x) => x.id === snugOpp)!
    expect(o.status).toBe('recusada')
    expect(o.nextFollowUpAt).toBeUndefined()
  })

  it('4 affiliates without UGC/influencer openings — never a commercial follow-up', () => {
    const db = getDB()
    expect(card(db, 'afiliadas').value).toBe('4')
    const ids = new Set(AFFILIATES.map((n) => brandNamed(db, n)!.id))
    for (const n of AFFILIATES) expect(brandNamed(db, n)!.crm).toMatchObject({ status: 'afiliada_sem_vagas', affiliate: true, noFollowUp: true })
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.UTC(2026, 9, 12 + i)).toISOString().slice(0, 10)
      expect(followUpsDue(db, d, MON).filter((o) => ids.has(o.brandId))).toHaveLength(0)
    }
    expect(ugcDayActions(db, MON, MON).filter((a) => ids.has(a.opportunity.brandId))).toHaveLength(0)
    expect(prospects(db).filter((o) => ids.has(o.brandId))).toHaveLength(0)
  })

  it('12 proposals of 11/10 wait for a reply: follow-up window 18–21/10, no first-contact action', () => {
    const db = getDB()
    const ids = new Set(PROPOSALS_2026_10_11.map((n) => brandNamed(db, n)!.id))
    const opps = db.ugcOpportunities.filter((o) => ids.has(o.brandId))
    expect(opps).toHaveLength(12)
    for (const o of opps) expect(o).toMatchObject({ status: 'aguardando_resposta', stage: 'contatada', proposalSentAt: '2026-10-11', lastContactAt: '2026-10-11', nextFollowUpAt: '2026-10-18', followUpWindowEnd: '2026-10-21' })
    for (const n of PROPOSALS_2026_10_11) expect(brandNamed(db, n)!.crm?.status).toBe('aguardando_retorno')
    expect(card(db, 'propostas').value).toBe('12')
    expect(prospects(db).filter((o) => ids.has(o.brandId))).toHaveLength(0)
    expect(approachToday(db, MON).filter((o) => ids.has(o.brandId))).toHaveLength(0)
    expect(ugcDayActions(db, MON, MON).filter((a) => ids.has(a.opportunity.brandId))).toHaveLength(0)
    expect(followUpsDue(db, '2026-10-17', MON).filter((o) => ids.has(o.brandId))).toHaveLength(0)
    expect(followUpsDue(db, '2026-10-18', MON).filter((o) => ids.has(o.brandId))).toHaveLength(12)
  })

  it('Outlive Nutrition is waiting for an answer, not a negotiation', () => {
    const db = getDB()
    const b = brandNamed(db, 'Outlive Nutrition')!
    expect(b.crm?.status).toBe('aguardando_resposta')
    const o = db.ugcOpportunities.filter((x) => x.brandId === b.id)
    expect(o).toHaveLength(1)
    expect(o[0].status).toBe('aguardando_resposta')
    expect(o[0].nextFollowUpAt).toBeUndefined()
    expect(card(db, 'negociacoes').records.some((r) => r.brandId === b.id)).toBe(false)
  })

  it('paid UGC pipeline: 8 prospects, never marked contacted; Nomad reused', () => {
    const db = getDB()
    for (const n of PAID) {
      const b = brandNamed(db, n)!
      expect(b.crm?.paidProspect, n).toBe(true)
      const live = db.ugcOpportunities.filter((o) => o.brandId === b.id && o.status === 'aberta')
      expect(live, n).toHaveLength(1)
      expect(live[0].firstContactAt).toBeUndefined()
      expect(live[0].stage).toBe('prospectar')
    }
  })

  it('paid UGC as of 12/10: 0 contracts, R$ 0 — press kits/permutas are not revenue', () => {
    const db = getDB()
    const m = ugcMoney(db)
    expect(m.paid).toHaveLength(0)
    expect(m.receivedCents).toBe(0)
    expect(card(db, 'pagos').value).toBe('0')
    expect(card(db, 'receita').value.replace(/\s/g, ' ')).toBe('R$ 0,00')
    expect(card(db, 'demos').value).toBe('5')
  })
})

describe('12/10 tasks — existing Tasks, Home and UGC share the check', () => {
  const TODAY_TITLES = [
    ['Configurar módulo UGC Business no Marina OS', 'alta', 30],
    ['Preparar biblioteca do portfólio UGC', 'alta', 15],
    ['Definir três roteiros de vídeos demonstrativos — Breevo, VHydra, Fluy da Bora Nutrition', 'alta', 30],
    ['Importar e reconciliar o CRM', 'alta', 20],
    ['Revisar prospects comerciais — Woom, Cumbuca Boa, Nomad, Insider', 'media', 20],
    ['Conferir último contato com Outlive Nutrition', 'media', 5],
  ] as const

  it('present on 12/10 with priority and estimate, shown on Home (tasksForDay)', () => {
    const db = getDB()
    const today = tasksForDay(db, MON).filter(isUgcTask)
    for (const [title, priority, min] of TODAY_TITLES) {
      const t = today.filter((x) => x.title === title)
      expect(t, title).toHaveLength(1)
      expect(t[0]).toMatchObject({ priority, durationMin: min, status: 'todo', date: MON })
    }
    const outlive = today.find((t) => t.title.includes('Outlive'))!
    expect(outlive.brandId).toBe(brandNamed(db, 'Outlive Nutrition')!.id)
    const review = db.tasks.find((t) => t.id === ugcTaskId('respostas-11-10'))!
    expect(review).toMatchObject({ date: '2026-10-18', dueDate: '2026-10-21' })
    expect(review.time).toBeUndefined()
  })

  it('check saves completedAt, survives reopening; re-running the deploy neither duplicates nor reopens', async () => {
    const id = ugcTaskId('configurar-modulo')
    setTaskDone(id, true, MON)
    let db = await reopen()
    const t = db.tasks.find((x) => x.id === id)!
    expect(t.status).toBe('done')
    expect(t.completedAt).toBeTruthy()
    const counts = (d: DB) => [d.brands.length, d.ugcOpportunities.length, d.tasks.length, d.contentItems.length]
    const before = counts(db)
    db = await deploy()
    db = await deploy()
    expect(counts(db)).toEqual(before)
    expect(db.tasks.find((x) => x.id === id)!.status).toBe('done')
    // pure re-run: same reference, nothing touched
    expect(applyUgcCrmSeed(db)).toBe(db)
  })

  it('a task she deleted never comes back', async () => {
    const id = ugcTaskId('importar-crm')
    actions.remove('tasks', id)
    await reopen()
    const db = await deploy()
    expect(db.tasks.find((x) => x.id === id)).toBeUndefined()
  })

  it('status, reschedule (Adiado) and subtasks persist', async () => {
    const id = ugcTaskId('biblioteca-portfolio')
    setUgcTaskState(id, 'em_andamento', MON)
    addStep(id, 'Criar pastas')
    const step = getDB().tasks.find((t) => t.id === id)!.checklist![0]
    toggleStep(id, step.id)
    rescheduleTask(id, '2026-10-14')
    const db = await reopen()
    const t = db.tasks.find((x) => x.id === id)!
    expect(t).toMatchObject({ date: '2026-10-14', postponedFrom: MON, status: 'doing' })
    expect(t.checklist![0]).toMatchObject({ title: 'Criar pastas', done: true })
  })
})

describe('paste import', () => {
  it('CSV is reconciled by name + aliases; an older date never overwrites; twice = nothing new', async () => {
    const csv = ['Marca;Status;Data;Cupom', 'Snug;Aguardando resposta;01/10/2026;', 'Hardyn;Afiliada — sem vagas;;HARDYN10', 'Feelgoomy;Press kit;;sim', 'Marca Nova;;;'].join('\n')
    const a = importCrmText(csv)
    expect(a.rows).toBe(4)
    expect(a.report.created).toEqual(['Marca Nova'])
    let db = await reopen()
    expect(brandNamed(db, 'Snugg Wear')!.crm?.status).toBe('negativa')
    expect(brandNamed(db, 'Hardyn')!.crm?.coupons).toEqual([{ code: 'HARDYN10' }])
    expect(brandNamed(db, 'Feelgomy')!.crm?.coupons).toHaveLength(1)
    expect(brandNamed(db, 'Feelgomy')!.crm?.pressKits).toHaveLength(1)
    const n = db.brands.length
    const b = importCrmText(csv)
    expect(b.report.created).toHaveLength(0)
    expect(b.report.updated).toHaveLength(0)
    db = await reopen()
    expect(db.brands.length).toBe(n)
    expect(card(db, 'cupons').value).toBe('2')
  })

  it('JSON works and a date without year is not guessed', () => {
    const r = parseCrmPaste(JSON.stringify([{ marca: 'Yaru', status: 'negativa', data: '11/10' }]))
    expect(r.rows[0]).toMatchObject({ name: 'Yaru', status: 'negativa' })
    expect(r.rows[0].statusAt).toBeUndefined()
    expect(r.warnings.length).toBe(1)
  })

  it('every seed row has a name and the 4 lists add up', () => {
    expect(UGC_CRM_ROWS.every((r) => r.name.trim())).toBe(true)
    expect(UGC_CRM_ROWS).toHaveLength(ALL.length)
  })
})

describe('fresh install', () => {
  it('a new device gets the same CRM and tasks once', async () => {
    device = createMemoryAdapter()
    await hydrate(device)
    const db = await reopen()
    for (const n of ALL) expect(db.brands.filter((b) => b === brandNamed(db, n)).length, n).toBe(1)
    expect(db.brands.filter((b) => b.name === 'Breevo')).toHaveLength(1)
    expect(tasksForDay(db, MON).filter(isUgcTask).length).toBeGreaterThanOrEqual(6)
    expect(card(db, 'negativas').value).toBe('9')
  })
})

describe('backup', () => {
  it('roundtrip keeps brands, statuses, tasks and checks — nothing duplicated', async () => {
    setTaskDone(ugcTaskId('tres-roteiros'), true, MON)
    const before = await reopen()
    const text = JSON.stringify(makeBackup(before))
    device = createMemoryAdapter()
    await hydrate(device)
    await restoreBackup(validateBackup(JSON.parse(text)) as BackupPreview)
    await restoreBackup(validateBackup(JSON.parse(text)) as BackupPreview)
    const after = await reopen()
    const pick = (db: DB) => ({
      brands: db.brands.map((b) => [b.name, b.crm?.status, b.crm?.pressKits?.length ?? 0]).sort(),
      opps: db.ugcOpportunities.map((o) => [o.id, o.status, o.nextFollowUpAt]).sort(),
      tasks: db.tasks.filter(isUgcTask).map((t) => [t.id, t.status, !!t.completedAt]).sort(),
      demos: db.contentItems.filter((c) => c.demo).length,
    })
    expect(pick(after)).toEqual(pick(before))
  })
})
