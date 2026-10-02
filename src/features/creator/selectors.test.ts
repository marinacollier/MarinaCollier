import { describe, expect, it } from 'vitest'
import type { BrandPartnership, ContentItem, Project } from '@/data/types'
import { SEED_IDS } from '@/data/seed/ids'
import { createSeedContext } from '@/data/seed/context'
import { seedCreator } from './seed'
import {
  awaitingPayment,
  categoryOptions,
  contentByStage,
  creatorProjects,
  partnershipReviews,
  reviewLabel,
  deadlineLabel,
  filterContent,
  ideas,
  nextContentStage,
  nextPartnershipStage,
  partnershipsByStage,
  upcomingDeliveries,
  usedValues,
} from './selectors'
import { CATEGORIES, PARTNERSHIP_STAGES } from './constants'

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
    expect(usedValues(items, 'category', CATEGORIES)).toEqual(['surf', 'IA'])
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

describe('stage labels', () => {
  it("match Marina's pipeline names", () => {
    expect(PARTNERSHIP_STAGES.filter((s) => s.value !== 'ideia').map((s) => s.label)).toEqual([
      'Contato',
      'Negociação',
      'Fechado',
      'Produção',
      'Aprovação',
      'Publicado',
      'Pagamento',
      'Finalizado',
    ])
  })
})

describe('creator projects, categories and reviews', () => {
  const proj = (id: string, extra: Partial<Project> = {}): Project => ({
    id,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    name: id,
    emoji: '📸',
    tone: 'sand',
    status: 'ativo',
    priority: 'media',
    links: [],
    files: [],
    people: [],
    decisions: [],
    changelog: [],
    kind: 'creator',
    order: 0,
    ...extra,
  })

  it('category options come from the project, else the union of creator projects, else defaults', () => {
    const list = [proj('ugc', { categories: ['corrida', 'surf'], order: 0 }), proj('serie', { categories: ['safari', 'surf'], order: 1 }), proj('work', { kind: 'default' })]
    expect(categoryOptions(list, 'serie')).toEqual(['safari', 'surf'])
    expect(categoryOptions(list)).toEqual(['corrida', 'surf', 'safari'])
    expect(categoryOptions(list, 'serie', 'antiga')).toEqual(['safari', 'surf', 'antiga'])
    expect(categoryOptions([])).toEqual([...CATEGORIES])
    expect(creatorProjects([...list, proj('done', { status: 'concluido' })]).map((p) => p.id)).toEqual(['ugc', 'serie'])
  })

  it('filters content by project / series', () => {
    const items = [c({ projectId: 'a' }), c({ projectId: 'b' }), c({})]
    expect(filterContent(items, { projectId: 'a' })).toHaveLength(1)
    expect(filterContent(items, {})).toHaveLength(3)
  })

  it('review label never says late', () => {
    expect(reviewLabel({ date: '2026-10-02' }, '2026-10-02')).toBe('revisar hoje')
    expect(reviewLabel({ date: '2026-09-28' }, '2026-10-02')).toBe('revisar hoje')
    expect(reviewLabel({ date: '2026-10-03' }, '2026-10-02')).toBe('revisar amanhã')
    expect(reviewLabel({}, '2026-10-02')).toBe('revisar quando der')
  })
})

describe('seedCreator', () => {
  const out = seedCreator(createSeedContext('2026-10-02'))

  it('Breevo is in contato with a "revisar hoje" task — never late, no money invented', () => {
    expect(out.partnerships).toHaveLength(1)
    const breevo = out.partnerships![0]
    expect(breevo).toMatchObject({ brand: 'Breevo', stage: 'contato', notes: 'Testar durante corrida + produzir conteúdo' })
    expect(breevo.valueCents).toBeUndefined()
    expect(breevo.deadline).toBeUndefined()
    const reviews = partnershipReviews(out.tasks ?? [], breevo.id)
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ status: 'review', context: 'conteudo', date: '2026-10-02', planType: 'a_confirmar' })
    expect(reviews[0].dueDate).toBeUndefined()
    expect(reviewLabel(reviews[0], '2026-10-02')).toBe('revisar hoje')
  })

  it('South Africa series project with an idea bank in its own categories', () => {
    const series = out.projects?.find((p) => p.tripId === SEED_IDS.tripAfrica)
    expect(series).toMatchObject({ name: 'Um mês sozinha na África do Sul', kind: 'creator', description: 'Possível série/vlog — sem vídeo diário obrigatório' })
    const bank = (out.contentItems ?? []).filter((i) => i.projectId === series!.id)
    expect(bank.length).toBeGreaterThanOrEqual(8)
    expect(bank.every((i) => i.stage === 'ideia' && !!i.category && series!.categories!.includes(i.category!))).toBe(true)
  })

  it('ideas are real to her categories (no generic IA idea) and every record has a stable id', () => {
    const titles = (out.contentItems ?? []).map((i) => i.title)
    expect(titles).not.toContain('Como uso IA no meu dia a dia')
    const again = seedCreator(createSeedContext('2026-10-02'))
    expect(again.contentItems?.map((i) => i.id)).toEqual(out.contentItems?.map((i) => i.id))
    expect(again.partnerships?.map((i) => i.id)).toEqual(out.partnerships?.map((i) => i.id))
    expect(again.tasks?.map((i) => i.id)).toEqual(out.tasks?.map((i) => i.id))
    const everyday = (out.contentItems ?? []).filter((i) => i.projectId === SEED_IDS.projUGC)
    expect(everyday.every((i) => (CATEGORIES as readonly string[]).includes(i.category!))).toBe(true)
  })
})
