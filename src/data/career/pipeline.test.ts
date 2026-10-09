import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { buildSeed } from '../seed'
import { addContact, addOpportunity, casesWithoutMetrics, dueFollowUps, logInteraction, matchContacts, nextFollowUp, promoteToEvidence, setOpportunityStatus, staleOpportunities } from './pipeline'

const T = '2026-10-09'

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(T))
})

describe('career pipeline', () => {
  it('starts empty — no invented roles or people', () => {
    expect(getDB().opportunities).toHaveLength(0)
    expect(getDB().contacts).toHaveLength(0)
  })

  it('opportunity status changes keep history, move lastActivity, undo cleanly', () => {
    const { item } = addOpportunity({ company: 'Empresa X', role: 'Head of Product' }, '2026-10-01')
    expect(staleOpportunities(getDB(), T).map((o) => [o.id, o.days])).toEqual([[item.id, 8]])
    const undo = setOpportunityStatus(item.id, 'descartada', T, { note: 'não faz mais sentido' })
    const o = getDB().opportunities[0]
    expect(o.status).toBe('descartada')
    expect(o.history?.map((h) => h.status)).toEqual(['radar', 'descartada'])
    expect(staleOpportunities(getDB(), T)).toHaveLength(0)
    undo()
    expect(getDB().opportunities[0].status).toBe('radar')
  })

  it('a follow-up scheduled ahead means it is not stale', () => {
    const { item } = addOpportunity({ company: 'Y', role: 'Head of AI Products', nextActionDate: '2026-10-14' }, '2026-09-20')
    expect(staleOpportunities(getDB(), T).some((o) => o.id === item.id)).toBe(false)
    expect(nextFollowUp(getDB(), T)).toMatchObject({ kind: 'oportunidade', date: '2026-10-14' })
  })

  it('talking to someone records the interaction and clears a due follow-up', () => {
    const { item } = addContact({ name: 'Ana Souza', company: 'Empresa X', nextFollowUp: '2026-10-08' })
    expect(dueFollowUps(getDB(), T).map((c) => c.id)).toEqual([item.id])
    logInteraction(item.id, T, 'café')
    const c = getDB().contacts[0]
    expect(c).toMatchObject({ lastInteraction: T, nextFollowUp: undefined })
    expect(c.interactions).toEqual([{ date: T, note: 'café' }])
  })

  it('never picks between two people with the same first name', () => {
    addContact({ name: 'Ana Souza', company: 'Empresa X' })
    addContact({ name: 'Ana Lima', company: 'Empresa Z' })
    expect(matchContacts(getDB(), 'Ana')).toHaveLength(2)
    expect(matchContacts(getDB(), 'Ana', 'empresa x').map((c) => c.name)).toEqual(['Ana Souza'])
  })

  it('a win becomes a case on the same record; cases without numbers are flagged', () => {
    const w = actions.create('wins', { date: T, title: 'Busca por embeddings no ar', kind: 'entrega' })
    promoteToEvidence(w.id, { impact: 'busca melhor' })
    expect(getDB().wins.filter((x) => x.title === w.title)).toHaveLength(1)
    expect(casesWithoutMetrics(getDB()).map((x) => x.id)).toEqual([w.id])
    promoteToEvidence(w.id, { metrics: '+18% cliques na busca' })
    expect(casesWithoutMetrics(getDB())).toHaveLength(0)
  })
})
