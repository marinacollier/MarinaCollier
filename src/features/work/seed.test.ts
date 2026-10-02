import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { createSeedContext } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import { weekday } from '@/lib/date'
import { occursOn } from '@/lib/recurrence'
import { MONTHLY_BOARD_TEMPLATE, seedWork, WEEKLY_CEO_TEMPLATE } from './seed'
import { capOverloads, projectSections, projectTimeCap } from './selectors'
import { groupRoadmap } from './roadmap'
import { upcomingRituals } from './rituals'

const TODAY = '2026-10-02' // sexta

describe('seedWork', () => {
  const part = seedWork(createSeedContext(TODAY))
  const tasks = part.tasks ?? []

  it('seeds the five professional fronts with stable ids', () => {
    expect(part.projects?.map((p) => p.id)).toEqual([
      SEED_IDS.projSantander,
      SEED_IDS.projFashionFinder,
      SEED_IDS.projDayOne,
      SEED_IDS.projYoga,
      SEED_IDS.projUGC,
    ])
    const santander = part.projects?.find((p) => p.id === SEED_IDS.projSantander)
    expect(santander).toMatchObject({ emoji: '🟥', role: 'Produto / IA', status: 'ativo', priority: 'alta', description: 'Principal frente profissional' })
    const ff = part.projects?.find((p) => p.id === SEED_IDS.projFashionFinder)
    expect(ff).toMatchObject({ role: 'Produto + Tecnologia · CTPO', deadline: '2026-11-20', people: [{ name: 'Fran' }] })
    expect(part.projects?.find((p) => p.id === SEED_IDS.projDayOne)?.sections).toEqual(['Planner', 'Match', 'Smart Flight', 'Consultant Copilot'])
    const ugc = part.projects?.find((p) => p.id === SEED_IDS.projUGC)
    expect(ugc?.kind).toBe('creator')
    expect(ugc?.categories).toContain('natação')
  })

  it('every seed record has a stable id', () => {
    const again = seedWork(createSeedContext(TODAY))
    for (const key of ['projects', 'milestones', 'tasks', 'events'] as const) {
      expect((again[key] ?? []).map((x) => x.id)).toEqual((part[key] ?? []).map((x) => x.id))
    }
  })

  it('invents nothing for Santander and no wins / inbox / deliveries', () => {
    expect(tasks.filter((t) => t.projectId === SEED_IDS.projSantander)).toHaveLength(0)
    expect(part.milestones?.filter((m) => m.projectId === SEED_IDS.projSantander) ?? []).toHaveLength(0)
    expect(part.wins ?? []).toHaveLength(0)
    expect(part.workInbox ?? []).toHaveLength(0)
    for (const p of part.projects ?? []) expect(p.nextDelivery).toBeUndefined()
    // no generic placeholders from phase 1
    expect(tasks.some((t) => /Revisar prioridades atuais|Definir próxima entrega/.test(t.title))).toBe(false)
  })

  it('FashionFinder milestones are a roadmap: grouped, status roadmap, no dates', () => {
    const ms = part.milestones ?? []
    expect(ms).toHaveLength(10)
    expect(ms.every((m) => m.projectId === SEED_IDS.projFashionFinder && m.status === 'roadmap' && !m.done && !m.date)).toBe(true)
    const lanes = groupRoadmap(ms)
    expect(lanes.map((l) => l.group)).toEqual(['Infra / catálogo', 'Busca', 'Provider', 'Produto', 'Painel', 'Ranking', 'Arquitetura', 'UX', 'Futuro'])
    expect(lanes.find((l) => l.group === 'Produto')?.items.map((m) => m.title)).toEqual(['Favoritos', 'Histórico'])
    expect(lanes.find((l) => l.group === 'Futuro')?.items[0].title).toBe('Google Shopping')
  })

  it('Day One AI next focuses are flexible todos with sections; Yoga App has its MVP tasks', () => {
    const dayOne = tasks.filter((t) => t.projectId === SEED_IDS.projDayOne)
    expect(dayOne.map((t) => t.title)).toEqual(['Ranking do Match', 'Padronização do Planner', 'Perfil compartilhado', 'Evolução dos módulos', 'Consolidar demo funcional'])
    expect(dayOne.every((t) => t.status === 'todo' && t.planType === 'flexivel' && !t.date && !t.dueDate)).toBe(true)
    expect(dayOne.find((t) => t.title === 'Ranking do Match')?.group).toBe('Match')
    expect(dayOne.find((t) => t.title === 'Padronização do Planner')?.group).toBe('Planner')
    expect(tasks.filter((t) => t.projectId === SEED_IDS.projYoga).map((t) => t.title)).toEqual(['Fluxo principal', 'Telas', 'Identidade visual', 'Figma', 'MVP'])
  })

  it('rituals are FIXO recurring events with templates — not tasks', () => {
    expect(tasks.some((t) => t.recurrence)).toBe(false)
    expect(tasks.some((t) => /CEO|Board/.test(t.title))).toBe(false)
    const events = part.events ?? []
    const ceo = events.find((e) => e.title === 'Weekly CEO Review')!
    expect(ceo).toMatchObject({ planType: 'fixo', kind: 'trabalho', startTime: '09:00', endTime: '10:00', sourceId: SEED_IDS.sourceLocal, recurrence: { kind: 'weekly', weekdays: [6] } })
    expect(ceo.template).toEqual(WEEKLY_CEO_TEMPLATE)
    expect(weekday(ceo.date)).toBe(6)
    expect(ceo.date >= TODAY).toBe(true)
    const board = events.find((e) => e.title === 'Monthly Board Meeting')!
    expect(board).toMatchObject({ planType: 'fixo', startTime: '20:00', endTime: '21:00', recurrence: { kind: 'monthly', dayOfMonth: 'last' } })
    expect(board.template).toEqual(MONTHLY_BOARD_TEMPLATE)
    expect(board.date).toBe('2026-10-31')
    expect(occursOn(board.recurrence!, board.date)).toBe(true)
  })
})

describe('work seed inside the full seed', () => {
  const db = buildSeed(TODAY)

  it('Yoga App has its 1h/dia cap and warns only when a day passes it', () => {
    expect(projectTimeCap(db, SEED_IDS.projYoga)?.limit).toBe(60)
    expect(capOverloads(db, SEED_IDS.projYoga, TODAY)).toEqual([])
    const yoga = db.tasks.filter((t) => t.projectId === SEED_IDS.projYoga)
    yoga[0].date = TODAY
    yoga[0].durationMin = 45
    yoga[1].date = TODAY
    yoga[1].durationMin = 30
    expect(capOverloads(db, SEED_IDS.projYoga, TODAY)).toEqual([{ date: TODAY, minutes: 75, limit: 60 }])
  })

  it('Day One sections become task filters', () => {
    expect(projectSections(db, SEED_IDS.projDayOne)).toEqual(['Planner', 'Match', 'Smart Flight', 'Consultant Copilot'])
  })

  it('the Rituais card finds the next CEO Review (tomorrow) and the Monthly Board', () => {
    const r = upcomingRituals(db, TODAY)
    expect(r.map((x) => [x.event.title, x.date])).toEqual([
      ['Weekly CEO Review', '2026-10-03'],
      ['Monthly Board Meeting', '2026-10-31'],
    ])
  })
})
