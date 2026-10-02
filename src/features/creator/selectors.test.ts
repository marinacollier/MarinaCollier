import { describe, expect, it } from 'vitest'
import type { BrandPartnership, ContentItem } from '@/data/types'
import { createSeedContext } from '@/data/seed/context'
import { seedCreator } from './seed'
import {
  awaitingPayment,
  contentByStage,
  deadlineLabel,
  filterContent,
  ideas,
  nextContentStage,
  nextPartnershipStage,
  partnershipsByStage,
  upcomingDeliveries,
  usedValues,
} from './selectors'
import { CATEGORIES } from './constants'

let n = 0
function p(data: Partial<BrandPartnership>): BrandPartnership {
  n++
  return {
    id: `p${n}`,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    brand: `Marca ${n}`,
    stage: 'ideia',
    links: [],
    order: n,
    ...data,
  }
}
function c(data: Partial<ContentItem>): ContentItem {
  n++
  return {
    id: `c${n}`,
    createdAt: `2026-10-01T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
    updatedAt: '2026-10-01T10:00:00.000Z',
    title: `Conteúdo ${n}`,
    stage: 'ideia',
    links: [],
    order: n,
    ...data,
  }
}

describe('stage advance order', () => {
  it('walks the partnership pipeline in order and stops at finalizado', () => {
    const seen = ['ideia']
    let s = nextPartnershipStage('ideia')
    while (s) {
      seen.push(s)
      s = nextPartnershipStage(s)
    }
    expect(seen).toEqual([
      'ideia',
      'contato',
      'negociacao',
      'fechado',
      'producao',
      'aguardando_aprovacao',
      'publicado',
      'aguardando_pagamento',
      'finalizado',
    ])
    expect(nextPartnershipStage('finalizado')).toBeUndefined()
  })

  it('walks the content pipeline', () => {
    expect(nextContentStage('ideia')).toBe('gravar')
    expect(nextContentStage('gravar')).toBe('editando')
    expect(nextContentStage('editando')).toBe('pronto')
    expect(nextContentStage('pronto')).toBe('publicado')
    expect(nextContentStage('publicado')).toBeUndefined()
  })
})

describe('upcomingDeliveries', () => {
  it('returns open partnerships with deadlines, soonest first, limited', () => {
    const list = [
      p({ brand: 'A', stage: 'producao', deadline: '2026-10-10' }),
      p({ brand: 'B', stage: 'fechado', deadline: '2026-10-03' }),
      p({ brand: 'C', stage: 'publicado', deadline: '2026-10-01' }),
      p({ brand: 'D', stage: 'aguardando_aprovacao', deadline: '2026-10-05' }),
      p({ brand: 'E', stage: 'producao' }),
      p({ brand: 'F', stage: 'finalizado', deadline: '2026-10-02' }),
      p({ brand: 'G', stage: 'negociacao', deadline: '2026-10-20' }),
    ]
    expect(upcomingDeliveries(list).map((x) => x.brand)).toEqual(['B', 'D', 'A'])
    expect(upcomingDeliveries(list, 10).map((x) => x.brand)).toEqual(['B', 'D', 'A', 'G'])
  })
})

describe('awaitingPayment', () => {
  it('sums values of partnerships waiting for payment', () => {
    const list = [
      p({ stage: 'aguardando_pagamento', valueCents: 150000 }),
      p({ stage: 'aguardando_pagamento', valueCents: 85050 }),
      p({ stage: 'aguardando_pagamento', barter: 'kit de produtos' }),
      p({ stage: 'finalizado', valueCents: 999999 }),
      p({ stage: 'producao', valueCents: 50000 }),
    ]
    expect(awaitingPayment(list)).toEqual({ totalCents: 235050, count: 3, barterOnly: 1 })
    expect(awaitingPayment([])).toEqual({ totalCents: 0, count: 0, barterOnly: 0 })
  })
})

describe('grouping and filters', () => {
  it('groups partnerships into all 9 stages', () => {
    const groups = partnershipsByStage([p({ stage: 'contato' }), p({ stage: 'contato' })])
    expect(groups).toHaveLength(9)
    expect(groups.find((g) => g.meta.value === 'contato')?.items).toHaveLength(2)
  })

  it('groups content into 5 stages and filters by category/platform', () => {
    const items = [
      c({ stage: 'gravar', category: 'surf', platform: 'Instagram' }),
      c({ stage: 'gravar', category: 'IA', platform: 'LinkedIn' }),
      c({ stage: 'pronto', category: 'surf', platform: 'TikTok' }),
    ]
    expect(contentByStage(items).map((g) => g.items.length)).toEqual([0, 2, 0, 1, 0])
    expect(filterContent(items, { category: 'surf' })).toHaveLength(2)
    expect(filterContent(items, { category: 'surf', platform: 'TikTok' })).toHaveLength(1)
    expect(usedValues(items, 'category', CATEGORIES)).toEqual(['IA', 'surf'])
  })

  it('lists ideas newest first', () => {
    const a = c({ title: 'velha', createdAt: '2026-09-01T00:00:00.000Z' })
    const b = c({ title: 'nova', createdAt: '2026-10-01T00:00:00.000Z' })
    const d = c({ title: 'gravando', stage: 'gravar' })
    expect(ideas([a, b, d]).map((x) => x.title)).toEqual(['nova', 'velha'])
  })
})

describe('deadlineLabel', () => {
  it('is neutral, never guilty', () => {
    expect(deadlineLabel('2026-10-02', '2026-10-02')).toBe('prazo hoje')
    expect(deadlineLabel('2026-10-03', '2026-10-02')).toBe('prazo amanhã')
    expect(deadlineLabel('2026-10-01', '2026-10-02')).toBe('prazo era ontem')
    expect(deadlineLabel('2026-10-01', '2026-10-02')).not.toMatch(/atras/)
  })
})

describe('seedCreator', () => {
  it('seeds only content ideas and no invented partnerships', () => {
    const out = seedCreator(createSeedContext('2026-10-02'))
    expect(out.partnerships).toEqual([])
    expect(out.contentItems?.length).toBeGreaterThanOrEqual(3)
    expect(out.contentItems?.every((i) => i.stage === 'ideia' && Array.isArray(i.links))).toBe(true)
    expect(out.contentItems?.map((i) => i.title)).toContain('Como uso IA no meu dia a dia')
  })
})
