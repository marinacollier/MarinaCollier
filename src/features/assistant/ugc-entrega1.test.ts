/**
 * UGC Business OS — Entrega 1 acceptance. Through Lumos and the same writers the UGC space and the Home use;
 * every write waits for the device and is checked after reopening (restart = hydrate from storage).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { dayItems } from '@/data/agenda/items'
import { approachToday, findBrand, followUpsDue, ugcDayActions, weekNumbers } from '@/data/ugc/model'
import { addOpportunity, ensureProspect, recordOutbound, recordReply, setStage } from '@/data/ugc/ops'
import { migrateUgc } from '@/data/ugc/migrate'
import type { DB } from '@/data/types'
import { checkItem } from '@/features/today/home/act'
import { makeBackup, validateBackup, type BackupPreview } from '@/features/settings/backup'
import { restoreBackup } from '@/features/settings/backup-io'
import { whenSaved } from './act/commit'
import { ask, clearConversation, confirmReply, useConversation } from './conversation'

const MON = '2026-10-12'
const at = (date: string, hm = '10:00'): Now => {
  vi.setSystemTime(new Date(`${date}T${hm}:00.000-03:00`))
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m, iso: new Date(`${date}T${hm}:00.000-03:00`).toISOString() }
}
let device: ReturnType<typeof createMemoryAdapter>
async function reopen(): Promise<DB> {
  await whenSaved()
  await flushNow()
  await hydrate(device)
  clearConversation()
  return getDB()
}
const last = () => useConversation.getState().exchanges.at(-1)!
async function say(q: string, date = MON, hm = '10:00') {
  ask(q, at(date, hm))
  await whenSaved()
  const e = last()
  if (e.lumos?.status === 'pending' && e.lumos.reply.action) {
    confirmReply(e.id)
    await whenSaved()
  }
  return useConversation.getState().exchanges.find((x) => x.id === e.id)!
}
const opp = (db: DB, brand: string) => {
  const b = findBrand(db, brand)!
  return db.ugcOpportunities.filter((o) => o.brandId === b.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0]
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(MON, '08:00')
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(MON))
  await reopen()
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

describe('starting point — nothing invented', () => {
  it('only her creator profile (as she gave it) and the old Breevo partnership, moved once, without a made-up contact date', async () => {
    const db = getDB()
    expect(db.profile.creator).toMatchObject({ name: 'Marina Collier', instagram: '@marinacollieramelo', portfolio: 'marinacollier-ugc.lovable.app' })
    expect(db.profile.ugc).toMatchObject({ dailyNew: 3, cadence: [3, 7, 15] })
    expect(db.brands.map((b) => b.name)).toEqual(['Breevo'])
    const o = db.ugcOpportunities[0]
    expect(o).toMatchObject({ stage: 'contatada', status: 'aguardando_resposta' })
    expect([o.firstContactAt, o.nextFollowUpAt]).toEqual([undefined, undefined])
    expect([db.brands[0].alreadyCustomer, db.brands[0].alreadyUsedProduct]).toEqual([undefined, undefined])
    // idempotent
    expect(migrateUgc(db)).toBe(db)
    expect((await reopen()).ugcOpportunities).toHaveLength(1)
  })
})

describe('Definition of Done — Entrega 1', () => {
  it('brand → opportunity → DM → follow-up D+3 → appears on its day (Home too) → reply cancels → pipeline → reopen', async () => {
    // 2–3: add a brand (Lumos) — one brand, one live opportunity
    await say('adiciona Ocean Drop na minha lista de prospecção')
    await say('adiciona Ocean Drop na minha lista de prospecção')
    let db = await reopen()
    expect(db.brands.filter((b) => b.name === 'Ocean Drop')).toHaveLength(1)
    expect(db.ugcOpportunities.filter((o) => o.brandId === findBrand(db, 'Ocean Drop')!.id)).toHaveLength(1)
    // weekday quota → on today's Home queue as "Abordar Ocean Drop"
    expect(dayItems(db, MON, MON).some((i) => i.title === 'Abordar Ocean Drop' && i.check === 'ugc')).toBe(true)

    // 4–5: DM sent → follow-up created at D+3
    const r = await say('mandei DM pra Ocean Drop hoje')
    expect(r.lumos?.reply.sub).toBe('Próximo follow-up: 15/10.')
    db = await reopen()
    expect(opp(db, 'Ocean Drop')).toMatchObject({ stage: 'contatada', status: 'aguardando_resposta', firstContactAt: MON, nextFollowUpAt: '2026-10-15', primaryChannel: 'dm' })
    // approach is ticked today (done), not asked again
    expect(dayItems(db, MON, MON).find((i) => i.title === 'Abordar Ocean Drop')?.status).toBe('done')

    // 6: the follow-up shows up when its day comes — not before
    expect(followUpsDue(db, '2026-10-14', '2026-10-14')).toHaveLength(0)
    expect(dayItems(db, '2026-10-15', '2026-10-15').some((i) => i.title === 'Follow-up Ocean Drop')).toBe(true)
    expect(dayItems(db, '2026-10-15', MON).some((i) => i.title === 'Follow-up Ocean Drop')).toBe(true) // Próximos

    // 7–8: reply → Conversa, future follow-ups cancelled
    await say('Ocean Drop respondeu', '2026-10-14')
    db = await reopen()
    expect(opp(db, 'Ocean Drop')).toMatchObject({ stage: 'conversa', status: 'negociando', nextFollowUpAt: undefined, responseReceivedAt: '2026-10-14' })
    expect(dayItems(db, '2026-10-15', '2026-10-15').some((i) => i.title === 'Follow-up Ocean Drop')).toBe(false)
    expect(dayItems(db, '2026-10-14', '2026-10-14').some((i) => i.title === 'Responder Ocean Drop')).toBe(true)

    // 9: pipeline
    setStage(opp(getDB(), 'Ocean Drop').id, 'producao', '2026-10-14')
    db = await reopen()
    expect(opp(db, 'Ocean Drop').stage).toBe('producao')
    expect(weekNumbers(db, '2026-10-14')).toMatchObject({ newApproaches: 1, responses: 1, conversations: 1, closed: 1 })
  })

  it('10: a UGC action ticked on the general Home registers the contact; untick reverts exactly; reopen keeps it', async () => {
    ensureProspect('Galápagos Outdoor', { priorityTier: 'S', category: 'Outdoor' })
    let db = await reopen()
    const item = dayItems(db, MON, MON).find((i) => i.title === 'Abordar Galápagos Outdoor')!
    expect(item.sub).toMatch(/Tier S · Outdoor · DM/)
    checkItem(item)
    db = await reopen()
    expect(opp(db, 'Galápagos')).toMatchObject({ firstContactAt: MON, nextFollowUpAt: '2026-10-15' })
    const ticked = dayItems(db, MON, MON).find((i) => i.title === 'Abordar Galápagos Outdoor')!
    expect(ticked.status).toBe('done')
    checkItem(ticked)
    db = await reopen()
    expect(opp(db, 'Galápagos')).toMatchObject({ stage: 'prospectar', status: 'aberta' })
    expect([opp(db, 'Galápagos').firstContactAt, opp(db, 'Galápagos').nextFollowUpAt]).toEqual([undefined, undefined])
    expect(db.ugcInteractions).toHaveLength(0)
  })

  it('11–12: "quem devo abordar hoje?" answers from her real list (tier first, quota of 3)', async () => {
    for (const [n, t] of [['Snug', 'B'], ['Nomad', 'A'], ['Galápagos Outdoor', 'S'], ['Marca C', 'C']] as const) ensureProspect(n, { priorityTier: t })
    await reopen()
    const r = (await say('quem devo abordar hoje?')).lumos!.reply
    expect(r.text).toBe('Hoje: Galápagos Outdoor, Nomad, Snug.')
    expect(r.sections?.find((s) => s.title === 'Abordar hoje')?.lines.map((l) => l.text)).toEqual(['Galápagos Outdoor', 'Nomad', 'Snug'])
  })

  it('13–17: close the app, reopen, backup, wipe, restore — everything back, nothing duplicated', async () => {
    await say('adiciona Ocean Drop na minha lista de prospecção')
    await say('mandei e-mail pra Ocean Drop')
    await say('Ocean Drop respondeu', '2026-10-13')
    const before = await reopen()
    const text = JSON.stringify(makeBackup(before))
    device = createMemoryAdapter()
    await hydrate(device)
    await restoreBackup(validateBackup(JSON.parse(text)) as BackupPreview)
    await restoreBackup(validateBackup(JSON.parse(text)) as BackupPreview)
    const after = await reopen()
    const pick = (db: DB) => ({ brands: db.brands.map((b) => b.name).sort(), opps: db.ugcOpportunities.map((o) => [o.stage, o.status, o.firstContactAt, o.responseReceivedAt]), inter: db.ugcInteractions.map((i) => [i.direction, i.channel, i.type, i.date]) })
    expect(pick(after)).toEqual(pick(before))
    expect(after.ugcInteractions).toHaveLength(2)
  })
})

describe('rules', () => {
  it('Brand ≠ Opportunity: one brand with 3 opportunities over time, the brand never duplicated', async () => {
    const { brand } = ensureProspect('Snug')
    addOpportunity(brand.id, { title: 'Snug · campanha verão' })
    addOpportunity(brand.id, { title: 'Snug · afiliado', type: 'afiliado' })
    ensureProspect('snug')
    const db = await reopen()
    expect(db.brands.filter((b) => b.name === 'Snug')).toHaveLength(1)
    expect(db.ugcOpportunities.filter((o) => o.brandId === brand.id)).toHaveLength(3)
  })

  it('cadence D+3 → D+7 → D+15 → sem resposta (try again in 90 days)', () => {
    const { opportunity } = ensureProspect('Nomad')
    recordOutbound(opportunity.id, 'email', { date: MON })
    const get = () => getDB().ugcOpportunities.find((o) => o.id === opportunity.id)!
    expect(get().nextFollowUpAt).toBe('2026-10-15')
    recordOutbound(opportunity.id, 'email', { date: '2026-10-15' })
    expect(get()).toMatchObject({ followUpStep: 1, nextFollowUpAt: '2026-10-19' })
    recordOutbound(opportunity.id, 'email', { date: '2026-10-19' })
    expect(get()).toMatchObject({ followUpStep: 2, nextFollowUpAt: '2026-10-27' })
    recordOutbound(opportunity.id, 'email', { date: '2026-10-27' })
    expect(get()).toMatchObject({ followUpStep: 3, status: 'sem_resposta', nextFollowUpAt: '2027-01-25' })
    expect(getDB().ugcInteractions.map((i) => i.type)).toEqual(['primeiro_contato', 'follow_up', 'follow_up', 'follow_up'])
  })

  it('a reply before D+3 cancels the reminder', () => {
    const { opportunity } = ensureProspect('Snug')
    recordOutbound(opportunity.id, 'dm', { date: MON })
    recordReply(opportunity.id, { date: '2026-10-13' })
    expect(ugcDayActions(getDB(), '2026-10-15', '2026-10-15').some((a) => a.kind === 'followup')).toBe(false)
  })

  it('a refused brand and a closed/lost opportunity never come back in an action', async () => {
    const a = ensureProspect('Marca Recusa')
    recordOutbound(a.opportunity.id, 'dm', { date: MON })
    await say('Marca Recusa não faz mais sentido')
    const b = ensureProspect('Marca Fechada')
    recordOutbound(b.opportunity.id, 'dm', { date: MON })
    await say('fechei com a Marca Fechada por R$ 800')
    const db = await reopen()
    const all = [MON, '2026-10-15', '2026-10-19', '2026-10-27'].flatMap((d) => ugcDayActions(db, d, d).filter((x) => !x.done || x.brand?.name === 'Marca Recusa').map((x) => x.brand?.name))
    expect(all).not.toContain('Marca Recusa')
    expect(all).not.toContain('Marca Fechada')
    expect(findBrand(db, 'Marca Recusa')?.archived).toBe(true)
    // closing put the money where money lives (expected), linked to the deal
    const income = db.expenses.find((e) => e.ugcOpportunityId === opp(db, 'Marca Fechada').id)!
    expect(income).toMatchObject({ type: 'income', status: 'expected', amountCents: 80000 })
    await say('recebi o pagamento da Marca Fechada')
    const paid = await reopen()
    expect(paid.expenses.filter((e) => e.ugcOpportunityId === income.ugcOpportunityId)).toHaveLength(1)
    expect(paid.expenses.find((e) => e.id === income.id)).toMatchObject({ status: 'received', receivedAmountCents: 80000 })
    expect(opp(paid, 'Marca Fechada')).toMatchObject({ stage: 'fechada', status: 'concluida' })
  })

  it('contacts on different channels stay in one history', async () => {
    await say('adiciona Nomad na minha lista de prospecção')
    await say('mandei DM pra Nomad')
    await say('mandei e-mail pra Nomad', '2026-10-15')
    await say('Nomad respondeu', '2026-10-16')
    const db = await reopen()
    expect(db.ugcInteractions.map((i) => [i.channel, i.direction])).toEqual([
      ['dm', 'out'],
      ['email', 'out'],
      ['dm', 'in'],
    ])
  })

  it('relationship only from what she says ("essa eu já uso" right after talking about the brand)', async () => {
    await say('adiciona Ocean Drop na minha lista de prospecção')
    await say('Ocean Drop respondeu')
    await say('essa eu já uso')
    expect(findBrand(await reopen(), 'Ocean Drop')?.alreadyUsedProduct).toBe(true)
    await say('nunca usei a Snug')
    expect(findBrand(getDB(), 'Snug')).toBeUndefined() // unknown brand: nothing created on a guess
  })

  it('weekends: no approach quota (weekdays only)', () => {
    ensureProspect('Snug')
    expect(approachToday(getDB(), '2026-10-17')).toHaveLength(0)
    expect(approachToday(getDB(), MON).map((o) => findBrand(getDB(), 'Snug')?.id === o.brandId)).toEqual([true]) // Breevo is already contatada
  })

  it('"quem está esperando follow-up?" lists today and the next 7 days', async () => {
    const a = ensureProspect('Snug')
    recordOutbound(a.opportunity.id, 'dm', { date: '2026-10-09' })
    const b = ensureProspect('Nomad')
    recordOutbound(b.opportunity.id, 'email', { date: MON })
    const r = (await say('quem está esperando follow-up?')).lumos!.reply
    expect(r.sections?.map((s) => [s.title, s.lines.map((l) => l.text)])).toEqual([
      ['Hoje', ['Snug']],
      ['Próximos 7 dias', ['Nomad']],
    ])
  })
})
