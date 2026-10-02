import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { buildFixture, FIXTURE_TODAY } from '@/features/search/test-fixture'
import { buildLifeFixture, LIFE_TODAY } from '@/features/search/life-fixture'
import { buildInsights, planningInsights } from './insights'

const db = buildFixture()
const today = FIXTURE_TODAY
const texts = (list: { text: string }[]) => list.map((i) => i.text)

describe('insights', () => {
  it('returns 2–4 gentle, deterministic insights', () => {
    const list = buildInsights(db, today, 8 * 60)
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list.length).toBeLessThanOrEqual(4)
    expect(texts(list)).toContain('2 coisas esperando alguém há mais de 7 dias')
    expect(texts(list)).toContain('Recife é em 20 dias — 4 itens pra revisar')
    expect(buildInsights(db, today, 8 * 60)).toEqual(list)
    for (const t of texts(list)) expect(t).not.toMatch(/%|atrasad|streak|falhou/i)
  })

  it('mentions tomorrow without a workout only when it is true', () => {
    const noTomorrow = { ...db, workouts: db.workouts.filter((w) => w.date !== '2026-10-03') }
    expect(texts(buildInsights(noTomorrow, today, 8 * 60, 10))).toContain('Nenhum treino planejado para amanhã ainda')
    expect(texts(buildInsights(db, today, 8 * 60, 10))).not.toContain('Nenhum treino planejado para amanhã ainda')
  })

  it('an empty db still gets at least two calm insights', () => {
    expect(buildInsights(emptyDB(), today, 8 * 60).length).toBeGreaterThanOrEqual(2)
  })
})

describe('planning insights (from data, never hardcoded)', () => {
  const life = buildLifeFixture()

  it('Friday morning: a check-in conflict today and a flexible goal without a place', () => {
    const list = planningInsights(life, LIFE_TODAY, 8 * 60)
    expect(texts(list)).toEqual(['Hoje: dois treinos podem competir pelo mesmo check-in', 'Yoga ainda não tem lugar essa semana — quer que eu ache uma janela?'])
    expect(list[0].ask).toBe('Tem conflito essa semana?')
    expect(list[1].ask).toBe('Quando consigo encaixar yoga?')
    // they come first in the page's list
    expect(buildInsights(life, LIFE_TODAY, 8 * 60)[0].id).toBe(list[0].id)
  })

  it('evening before a presencial day suggests preparing things', () => {
    const monday = '2026-10-05'
    expect(texts(planningInsights(life, monday, 19 * 60))[0]).toBe('Amanhã é presencial. Quer preparar as coisas hoje?')
    // not in the morning, and not before a remote day
    expect(texts(planningInsights(life, monday, 9 * 60))).not.toContain('Amanhã é presencial. Quer preparar as coisas hoje?')
    expect(texts(planningInsights(life, LIFE_TODAY, 19 * 60))).not.toContain('Amanhã é presencial. Quer preparar as coisas hoje?')
  })

  it('a flexible goal already placed this week is not mentioned; fun goals never count', () => {
    const placed = { ...life, workouts: [...life.workouts, { ...life.workouts[0], id: 'yoga-sat', date: '2026-10-03', modality: 'yoga', status: 'planejado' as const }] }
    expect(texts(planningInsights(placed, LIFE_TODAY, 8 * 60)).some((t) => t.includes('Yoga'))).toBe(false)
    expect(texts(planningInsights(placed, LIFE_TODAY, 8 * 60)).some((t) => t.includes('Circo'))).toBe(false)
  })

  it('trip in ≤ 7 days shows how many items are left to review', () => {
    const list = planningInsights(life, '2026-10-17', 8 * 60)
    expect(texts(list)).toContain('Recife é em 5 dias — 2 itens pra revisar')
    expect(list.find((i) => i.id === 'trip:trip-recife')!.ask).toBe('O que falta pra Recife?')
    expect(texts(planningInsights(life, '2026-10-10', 8 * 60)).some((t) => t.startsWith('Recife'))).toBe(false)
  })
})
