/**
 * Weekly sync 15/10 (one marina-os/changes@1 batch, offered on Home, applied only after her "Confirmar"):
 * preview writes nothing · confirm applies · idempotent ×3 · no duplicates against the default seed + the
 * 12/10 briefing · done stays done · money never received · workouts without invented metrics ·
 * persisted after reopening · offered once, inside its window.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actions, detachStorage, flushNow, getDB, hydrate } from '../../store'
import { createMemoryAdapter } from '../../storage'
import { undoBatch } from '../../briefing/apply'
import { applyBundledBriefings, bundledSyncOf, markSyncApplied, pendingSync } from '../../briefing/bundled'
import { planBriefing, readBriefing } from '../../briefing/import'
import { parseChanges, type ChangesDoc } from '../../changes/contract'
import { countPlan, planChanges } from '../../changes/plan'
import { importChanges } from '../../changes/apply'
import { normalize } from '@/lib/text'
import { SYNC_2026_10_15 } from './sync-2026-10-15'
import backlogJSON from './backlog-2026-10-15.json'

const TODAY = '2026-10-15'
let device: ReturnType<typeof createMemoryAdapter>

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T08:00:00-03:00`))
  device = createMemoryAdapter()
  await hydrate(device)
  applyBundledBriefings(TODAY)
  await flushNow()
  vi.setSystemTime(new Date(`${TODAY}T22:00:00-03:00`))
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

/** The same path as Home → Central: the doc travels as text and is parsed again. */
const doc = (): ChangesDoc => {
  const r = parseChanges(JSON.stringify(SYNC_2026_10_15.doc))
  if (!r.ok) throw new Error(r.error)
  expect(r.invalid.size).toBe(0)
  return r.doc
}
const confirm = async () => {
  const d = doc()
  const r = await importChanges(d, { today: TODAY })
  markSyncApplied(bundledSyncOf(d)!.id)
  await flushNow()
  return r
}
const task = (title: string) => getDB().tasks.find((t) => t.title === title)
const bySource = (k: string) => getDB().tasks.find((t) => t.source?.sourceKey === `sk:${k}`)
const counts = () => Object.fromEntries(Object.entries(getDB()).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]))

describe('sync 15/10 — preview', () => {
  it('every change is valid, nothing invalid/refused/conflicting against the default seed + 12/10 briefing', () => {
    const plan = planChanges(getDB(), doc(), { today: TODAY })
    const c = countPlan(plan)
    expect(c).toMatchObject({ conflict: 0, delete: 0, review: 0, blocked: 0, unsupported: 0, invalid: 0, refused: 0 })
    expect(c.create).toBeGreaterThan(40)
    expect(c.unchanged).toBeGreaterThan(40)
  })

  it('preview writes nothing (memory and device untouched)', async () => {
    const before = getDB()
    const stored = JSON.stringify(device.data)
    planChanges(getDB(), doc(), { today: TODAY })
    expect(getDB()).toBe(before)
    await flushNow()
    expect(JSON.stringify(device.data)).toBe(stored)
  })
})

describe('sync 15/10 — confirm', () => {
  it('applies as one batch: planned day vs deadline, equivalents moved (not duplicated), history done without a day', async () => {
    const r = await confirm()
    expect(r.batchId).toBeTruthy()
    expect(getDB().importBatches.filter((b) => b.kind === 'changes')).toHaveLength(1)
    // B.O.: same obligation (seed + 12/10 alias) planned for 17/10, still overdue since 10/10.
    const bo = getDB().tasks.filter((t) => /b\.?o\.? ?de pedagio/.test(normalize(t.title)))
    expect(bo).toHaveLength(1)
    expect(bo[0]).toMatchObject({ date: '2026-10-17', dueDate: '2026-10-10', status: 'todo' })
    // Seed backlog moved to its suggested day; a stale deadline that the sync dropped is cleared.
    expect(task('Revisar épicos de layout')).toMatchObject({ date: '2026-10-16', dueDate: '2026-10-16' })
    expect(task('Escrever épicos de ativação de sacador')).toMatchObject({ date: '2026-10-19' })
    expect(task('Escrever épicos de ativação de sacador')!.dueDate).toBeUndefined()
    // 12/10 briefing items are the same records, now on their new day.
    expect(task('Revisar LinkedIn executivo')!.date).toBe('2026-10-20')
    expect(task('Praticar inglês executivo')!.date).toBe('2026-10-20')
    expect(task('Organizar hospedagem JNB')!.date).toBe('2026-10-17')
    // New ones keep planned day and deadline apart.
    expect(bySource('recebimento-santander')).toMatchObject({ date: '2026-10-16', dueDate: '2026-10-15', status: 'todo' })
    expect(bySource('sars')).toMatchObject({ date: '2026-10-23', dueDate: '2026-10-23', tripId: 'trip-africa-do-sul' })
    // Confirmed completed = history: done, no day (never on Home's list).
    for (const k of ['agents-initial', 'lovable-initial', 'os-tasks-schema']) {
      expect(bySource(k)).toMatchObject({ status: 'done', completedAt: '2026-10-15T12:00:00.000-03:00' })
      expect(bySource(k)!.date).toBeUndefined()
    }
    // Waiting stays the existing Vitor/Thales lines (no daily checklist).
    expect(getDB().tasks.filter((t) => t.status === 'waiting' && /vitor|thales/i.test(t.waiting?.who ?? ''))).toHaveLength(2)
  })

  it('Pink Cheeks: a campaign project linked to the brand (status kept), deliverables as dated tasks, Etapa 04 waiting', async () => {
    const brandBefore = getDB().brands.find((b) => b.name === 'Pink Cheeks')!
    await confirm()
    const p = getDB().projects.find((x) => x.name === 'Pink Cheeks — Athenas Run Longer')!
    expect(p).toMatchObject({ status: 'ativo', deadline: '2026-10-18' })
    const tasks = getDB().tasks.filter((t) => t.projectId === p.id)
    expect(tasks.length).toBeGreaterThanOrEqual(10)
    expect(tasks.filter((t) => t.status !== 'waiting').every((t) => t.brandId === brandBefore.id && !!t.date)).toBe(true)
    expect(bySource('pnk-stories')).toMatchObject({ date: '2026-10-15', dueDate: '2026-10-15' })
    expect(bySource('pnk-kit')).toMatchObject({ dueDate: '2026-10-17' })
    expect(bySource('pnk-captar-prova')!.checklist!.map((s) => s.title)).toEqual(['Camiseta Pink Cheeks na prova (obrigatória)', 'Marcar @pinkcheeksbrasil', '#PNKTEAM', '#SQUADPNKATHENAS'])
    expect(getDB().tasks.find((t) => t.status === 'waiting' && t.projectId === p.id)).toMatchObject({ waiting: { who: 'Pink Cheeks', followUpOn: '2026-10-16' } })
    // Still an affiliate without UGC openings — no deal, no money.
    const brand = getDB().brands.find((b) => b.id === brandBefore.id)!
    expect(brand.crm).toEqual(brandBefore.crm)
    expect(getDB().ugcOpportunities.some((o) => o.brandId === brand.id && (o.agreedValueCents || o.type === 'campanha_paga'))).toBe(false)
  })

  it('CRM: Woom proposal of 13/10 waits for an answer; Angê keeps the CRM record; new forms are prospects without contact', async () => {
    const ange = getDB().ugcOpportunities.find((o) => o.id === 'ugc-crm:opp:ange:proposta')!
    await confirm()
    const woom = getDB().ugcOpportunities.find((o) => o.id === 'ugc-crm:opp:woom:ugc-pago')!
    expect(woom).toMatchObject({ stage: 'contatada', status: 'aguardando_resposta', proposalSentAt: '2026-10-13', nextFollowUpAt: '2026-10-20' })
    expect(getDB().ugcOpportunities.find((o) => o.id === ange.id)).toMatchObject({ proposalSentAt: ange.proposalSentAt, nextFollowUpAt: ange.nextFollowUpAt })
    for (const name of ['KAMIT', 'Carolina Luna', 'VIGGI']) {
      const b = getDB().brands.filter((x) => x.name === name)
      expect(b, name).toHaveLength(1)
      const opps = getDB().ugcOpportunities.filter((o) => o.brandId === b[0].id)
      expect(opps).toHaveLength(1)
      expect(opps[0]).toMatchObject({ stage: 'prospectar' })
      expect(opps[0].firstContactAt).toBeUndefined()
    }
    expect(getDB().ugcInteractions).toHaveLength(0)
  })

  it('money: bills recognised (28, no amount, no payment), expected income never received', async () => {
    const before = getDB()
    await confirm()
    const bills = getDB().financialCategories.filter((c) => c.bill && !c.archived)
    expect(bills).toHaveLength(28)
    expect(getDB().financialCategories).toEqual(before.financialCategories)
    expect(getDB().expenses.filter((e) => e.type !== 'income')).toEqual(before.expenses.filter((e) => e.type !== 'income'))
    expect(getDB().expenses.some((e) => e.status === 'received')).toBe(false)
    expect(getDB().contracts).toEqual(before.contracts)
  })

  it('workouts: what she said only (4 km where given), the weekly plan untouched', async () => {
    const template = getDB().weekTemplate
    await confirm()
    expect(getDB().weekTemplate).toEqual(template)
    const w = (date: string) => getDB().workouts.filter((x) => x.date === date)
    const done = getDB().workouts.filter((x) => x.status === 'feito')
    expect(done.map((x) => [x.date, x.modality, x.distanceKm]).sort()).toEqual([
      ['2026-10-12', 'bike', undefined],
      ['2026-10-13', 'corrida', 4],
      ['2026-10-14', 'musculacao', undefined],
      ['2026-10-15', 'corrida', 4],
    ])
    for (const x of getDB().workouts.filter((y) => y.date >= '2026-10-12' && y.date <= '2026-10-18' && !y.templateId)) {
      expect(x.durationMin, x.title).toBeUndefined()
      expect(x.feeling, x.title).toBeUndefined()
      expect(x.postCheckin, x.title).toBeUndefined()
    }
    expect(w('2026-10-15').find((x) => x.modality === 'yoga')).toMatchObject({ status: 'planejado' })
    expect(w('2026-10-17').map((x) => x.status)).toEqual(['descanso'])
    expect(w('2026-10-18').find((x) => x.modality === 'corrida')).toMatchObject({ status: 'planejado', time: '06:00', plannedDistanceKm: 14 })
    expect(w('2026-10-18').find((x) => x.modality === 'bike')?.status ?? 'pulado').toBe('pulado')
    expect(getDB().meals).toHaveLength(0)
  })

  it('trip: seguro marked paid (payment only), JNB/safari linked, nothing re-reserved, one item added', async () => {
    const items = getDB().tripItems.length
    await confirm()
    expect(getDB().tripItems.find((t) => t.id === 'seed:travel:trip-africa-do-sul-seguro')).toMatchObject({ paymentStatus: 'pago', status: 'a_confirmar' })
    expect(getDB().tripItems).toHaveLength(items + 1)
    expect(getDB().tripItems.filter((t) => /safari/i.test(t.title))).toHaveLength(2)
  })
})

describe('sync 15/10 — idempotency, duplicates, her state', () => {
  it('importing 3× writes once; no duplicate titles against the default seed + 12/10 briefing', async () => {
    const r1 = await confirm()
    expect(r1.written).toBeGreaterThan(60)
    const after = counts()
    const snapshot = JSON.stringify({ ...getDB(), importBatches: [] })
    for (let i = 0; i < 2; i++) {
      vi.setSystemTime(new Date(Date.now() + 60_000))
      const r = await importChanges(doc(), { today: TODAY })
      expect(r.written).toBe(0)
      expect(countPlan(r.plan)).toMatchObject({ create: 0, update: 0 })
    }
    expect(counts()).toEqual(after)
    expect(JSON.stringify({ ...getDB(), importBatches: [] })).toBe(snapshot)
    const open = getDB().tasks.filter((t) => t.status !== 'archived').map((t) => normalize(t.title))
    expect(open.filter((t, i) => open.indexOf(t) !== i)).toEqual([])
    const brands = getDB().brands.map((b) => normalize(b.name))
    expect(brands.filter((t, i) => brands.indexOf(t) !== i)).toEqual([])
  })

  it('done stays done (never reopened or moved)', async () => {
    const apple = getDB().tasks.find((t) => t.id === 'seed:backlog:solucionar-conta-apple')!
    actions.update('tasks', apple.id, { status: 'done', completedAt: '2026-10-14T10:00:00.000Z' })
    await confirm()
    const now = getDB().tasks.find((t) => t.id === apple.id)!
    expect(now).toMatchObject({ status: 'done', completedAt: '2026-10-14T10:00:00.000Z' })
    expect(now.date).toBe(apple.date)
  })

  it('persists: reopening the app (hydrate from the device) keeps everything', async () => {
    await confirm()
    const after = counts()
    const woom = getDB().ugcOpportunities.find((o) => o.id === 'ugc-crm:opp:woom:ugc-pago')
    detachStorage()
    await hydrate(device)
    expect(counts()).toEqual(after)
    expect(bySource('ff-go-no-go')).toMatchObject({ date: '2026-10-16' })
    expect(getDB().ugcOpportunities.find((o) => o.id === 'ugc-crm:opp:woom:ugc-pago')).toEqual(woom)
    expect(getDB().profile.syncsApplied).toEqual(['2026-10-15'])
  })
})

describe('sync 15/10 — offered on Home once, inside its window', () => {
  it('pending until confirmed; never again after confirm or after undoing it; not before 15/10 nor after 31/10', async () => {
    expect(pendingSync(getDB(), '2026-10-14')).toBeUndefined()
    expect(pendingSync(getDB(), '2026-10-16')?.id).toBe('2026-10-15')
    expect(pendingSync(getDB(), '2026-11-01')).toBeUndefined()
    const r = await confirm()
    expect(pendingSync(getDB(), '2026-10-16')).toBeUndefined()
    undoBatch(r.batchId!)
    expect(pendingSync(getDB(), '2026-10-16')).toBeUndefined()
  })
})

describe('briefing importer — suggested_date', () => {
  it('the backlog JSON pasted as a briefing plans suggested_date as the day and keeps due_date as the deadline', () => {
    const { blocks } = readBriefing(JSON.stringify(backlogJSON))
    const plan = planBriefing(getDB(), blocks)!
    const t = (title: string) => plan.ops.find((o) => o.kind === 'task' && o.data.title === title) as { data: { date?: string; dueDate?: string } } | undefined
    expect(t('Conferir recebimento Santander previsto para 15/10')?.data).toMatchObject({ date: '2026-10-16', dueDate: '2026-10-15' })
    expect(t('Homologar jornada crítica e definir Go/No-Go')?.data).toMatchObject({ date: '2026-10-16' })
    expect(t('Homologar jornada crítica e definir Go/No-Go')?.data.dueDate).toBeUndefined()
  })
})
