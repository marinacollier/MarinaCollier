/**
 * UGC Business OS — Entrega 3 acceptance (Score de oportunidade): qualitative with reasons until there is
 * enough history, real counts after; her tier still leads; archived/refused never show; no stored score.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { actions, detachStorage, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { approachToday, findBrand, prospects, ugcDayActions } from '@/data/ugc/model'
import { addBrandFact, archiveBrand, endOpportunity, ensureProspect, recordOutbound, recordReply, updateBrand } from '@/data/ugc/ops'
import { MIN_OUTCOMES, potential } from '@/data/ugc/score'
import type { Brand, DB } from '@/data/types'
import { whenSaved } from './act/commit'
import { ask, clearConversation, useConversation } from './conversation'

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
async function say(q: string) {
  ask(q, at(MON))
  await whenSaved()
  return useConversation.getState().exchanges.at(-1)!.lumos!.reply
}
function brand(name: string, p: Partial<Brand> = {}) {
  const r = ensureProspect(name)
  updateBrand(r.brand.id, p)
  return { brand: getDB().brands.find((x) => x.id === r.brand.id)!, opportunity: r.opportunity }
}
const pot = (name: string) => potential(getDB(), findBrand(getDB(), name)!, MON)
const PCT = /\d+\s?%/

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

describe('qualitative until there is history', () => {
  it('every potential has at least one reason and no percentage', () => {
    brand('Galápagos', { category: 'Outdoor', priorityTier: 'S', alreadyCustomer: true })
    brand('Marca Vazia')
    for (const n of ['Galápagos', 'Marca Vazia']) {
      const p = pot(n)
      expect(p.reasons.length).toBeGreaterThan(0)
      expect(p.fromData).toBe(false)
      expect([...p.reasons, ...p.against].join(' ')).not.toMatch(PCT)
    }
    expect(pot('Galápagos').level).toBe('alto')
    expect(pot('Galápagos').reasons).toEqual(expect.arrayContaining(['Tier S que você deu', 'você já é cliente']))
    expect(pot('Marca Vazia').against).toContain('sem categoria — não sei se encaixa')
  })

  it('Tier S + customer ranks above Tier C without fit', () => {
    brand('Sem Encaixe', { category: 'Seguros', priorityTier: 'C' })
    brand('Ocean Drop', { category: 'Suplementação', priorityTier: 'S', alreadyCustomer: true })
    expect(pot('Ocean Drop').points).toBeGreaterThan(pot('Sem Encaixe').points)
    expect(pot('Sem Encaixe').level).toBe('baixo')
    expect(prospects(getDB(), MON).map((o) => getDB().brands.find((b) => b.id === o.brandId)?.name).slice(0, 1)).toEqual(['Ocean Drop'])
  })

  it("today's queue: tier leads, potential orders within it, never more than the daily quota", () => {
    brand('A1', { priorityTier: 'B' })
    brand('A2', { priorityTier: 'B', category: 'Outdoor', alreadyUsedProduct: true })
    brand('A3', { priorityTier: 'A' })
    brand('A4', { priorityTier: 'B', category: 'Corrida' })
    addBrandFact(findBrand(getDB(), 'A2')!.id, { text: 'lançou bota de trilha nova' })
    const names = approachToday(getDB(), MON).map((o) => getDB().brands.find((b) => b.id === o.brandId)?.name)
    expect(names).toEqual(['A3', 'A2', 'A4']) // quota 3; A1 (no fit) is left for tomorrow
    const row = ugcDayActions(getDB(), MON, MON).find((a) => a.brand?.name === 'A2')!
    expect(row.sub).toMatch(/potencial (alto|médio): /)
  })

  it('archived or refused brands never show; a past refusal counts against', async () => {
    const a = brand('Arquivada', { priorityTier: 'S' })
    archiveBrand(a.brand.id)
    const r = brand('Recusou', { priorityTier: 'S', category: 'Outdoor' })
    recordOutbound(r.opportunity.id, 'dm', { date: '2026-10-01' })
    endOpportunity(r.opportunity.id, 'recusada')
    expect(prospects(getDB(), MON).map((o) => o.brandId)).not.toContain(a.brand.id)
    expect(prospects(getDB(), MON).map((o) => o.brandId)).not.toContain(r.brand.id)
    expect(pot('Recusou').against).toContain('já recusou uma vez')
    const reply = await say('quais marcas têm maior potencial?')
    expect(reply.lines?.map((l) => l.text)).not.toContain('Arquivada')
    expect(reply.lines?.map((l) => l.text)).not.toContain('Recusou')
    expect(reply.sub).toMatch(/Sem porcentagem/)
    expect(JSON.stringify(reply)).not.toMatch(PCT)
  })

  it('nothing is stored: the score is computed, so it follows what she changes', async () => {
    const { brand: b } = brand('Nomad', { category: 'Fintech' })
    const before = pot('Nomad').level
    updateBrand(b.id, { priorityTier: 'S', alreadyCustomer: true })
    const db = await reopen()
    expect(JSON.stringify(db.brands.find((x) => x.id === b.id))).not.toMatch(/potential|score/i)
    expect(pot('Nomad').level).not.toBe(before)
  })
})

describe('numbers only with enough history', () => {
  it(`after ${MIN_OUTCOMES}+ outcomes, real counts join the reasons — counts, not predictions`, () => {
    for (let i = 0; i < MIN_OUTCOMES; i++) {
      const { opportunity } = brand(`Outdoor ${String.fromCharCode(65 + i)}`, { category: 'Outdoor' })
      recordOutbound(opportunity.id, 'dm', { date: '2026-09-01' })
      if (i < 12) recordReply(opportunity.id, { date: '2026-09-03' })
      else endOpportunity(opportunity.id, 'recusada')
    }
    for (let i = 0; i < 5; i++) {
      const { opportunity } = brand(`Seguro ${String.fromCharCode(65 + i)}`, { category: 'Seguros' })
      recordOutbound(opportunity.id, 'dm', { date: '2026-09-01' })
      endOpportunity(opportunity.id, 'recusada')
    }
    brand('Galápagos', { category: 'Outdoor' })
    const p = pot('Galápagos')
    expect(p.fromData).toBe(true)
    expect(p.reasons).toContain('Outdoor: 12 de 20 responderam')
    expect([...p.reasons, ...p.against].join(' ')).not.toMatch(PCT)
  })
})
