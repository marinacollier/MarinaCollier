import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import type { Brand, DB, UgcInteraction, UgcOpportunity } from '@/data/types'
import { brandMatchesProject, countryOptions, crmPulse, projectFilterOptions, sameCountry } from './model'

const AT = '2026-11-01T10:00:00.000Z'
const ent = { createdAt: AT, updatedAt: AT }
const TODAY = '2026-11-08'
const brand = (id: string, extra: Partial<Brand> = {}): Brand => ({ ...ent, id, name: id, ...extra })
const opp = (id: string, brandId: string, extra: Partial<UgcOpportunity> = {}): UgcOpportunity => ({ ...ent, id, brandId, title: 'UGC', stage: 'contatada', status: 'aguardando_resposta', firstContactAt: '2026-11-01', ...extra })

function db(): DB {
  const d = emptyDB()
  d.projects = [
    { ...ent, id: 'proj-ugc', name: 'UGC', emoji: '🎥', tone: 'plum', status: 'ativo', priority: 'alta', links: [] } as unknown as DB['projects'][number],
    { ...ent, id: 'proj-fashionfinder', name: 'Fashion Finder', emoji: '👗', tone: 'sand', status: 'ativo', priority: 'alta', links: [] } as unknown as DB['projects'][number],
  ]
  d.brands = [brand('a', { country: 'Brasil', city: 'São Paulo' }), brand('b', { country: 'África do Sul', city: 'Cape Town' }), brand('c', { country: 'brasil ' }), brand('d')]
  d.ugcOpportunities = [
    opp('o1', 'a', { projectId: 'proj-ugc' }),
    opp('o2', 'b', { projectId: 'proj-fashionfinder', nextFollowUpAt: '2026-11-07' }),
    opp('o3', 'c', { nextFollowUpAt: '2026-11-20' }),
    opp('o4', 'd', { stage: 'prospectar', firstContactAt: undefined }),
    opp('o5', 'd', { status: 'perdida' }),
  ]
  return d
}

describe('CRM list filters · project and country', () => {
  it('project chips: only projects in use, plus "Sem projeto", with brand counts', () => {
    const d = db()
    expect(projectFilterOptions(d).map((o) => [o.label, o.count])).toEqual([
      ['Fashion Finder', 1],
      ['UGC', 1],
      ['Sem projeto', 2],
    ])
    expect(brandMatchesProject(d, 'a', 'proj-ugc')).toBe(true)
    expect(brandMatchesProject(d, 'a', 'none')).toBe(false)
    expect(brandMatchesProject(d, 'c', 'none')).toBe(true)
    expect(brandMatchesProject(d, 'c', undefined)).toBe(true)
  })

  it('no project linked anywhere → no project chips', () => {
    const d = db()
    d.ugcOpportunities = d.ugcOpportunities.map((o) => ({ ...o, projectId: undefined }))
    expect(projectFilterOptions(d)).toEqual([])
  })

  it('country chips group the same spelling (case/space/accents) and filter', () => {
    const d = db()
    expect(countryOptions(d.brands)).toEqual([
      { value: 'Brasil', count: 2 },
      { value: 'África do Sul', count: 1 },
    ])
    expect(d.brands.filter((b) => sameCountry(b, 'Brasil')).map((b) => b.id)).toEqual(['a', 'c'])
    expect(sameCountry(d.brands[3], undefined)).toBe(true)
  })
})

describe('Home · CRM pulse', () => {
  it('counts open (contacted, live) opportunities: due follow-ups and brand replies ask for action', () => {
    const d = db()
    const reply: UgcInteraction = { ...ent, id: 'i1', brandId: 'a', opportunityId: 'o1', channel: 'email', direction: 'in', type: 'resposta', sentAt: AT, date: '2026-11-01' }
    d.ugcInteractions = [reply]
    expect(crmPulse(d, TODAY)).toEqual({ waiting: 1, action: 2 })
  })

  it('nothing open → no line', () => {
    const d = db()
    d.ugcOpportunities = d.ugcOpportunities.filter((o) => o.id === 'o4' || o.id === 'o5')
    expect(crmPulse(d, TODAY)).toBeUndefined()
  })
})
