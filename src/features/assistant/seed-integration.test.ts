/** Mari, search and reviews against the real life seed (lenient: seed content is owned by other modules). */
import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { search } from '@/features/search/engine'
import { reviewEventOfWeek } from '@/features/reviews/weekly'
import { boardEventOfMonth } from '@/features/reviews/monthly'
import { askMari, EXAMPLE_QUESTIONS } from './chief'
import { buildInsights } from './insights'

const today = '2026-10-02'
const db = buildSeed(today)

describe('real seed', () => {
  it('every example question answers without falling back, no guilt words', () => {
    for (const q of EXAMPLE_QUESTIONS) {
      const a = askMari(db, q, today, 8 * 60)
      expect(a.fallback, q).toBe(false)
      expect(JSON.stringify(a), q).not.toMatch(/atrasad|você falhou|streak|perdeu a sequência/i)
    }
  })

  it('África pending is a travel answer grouped by sub-area', () => {
    const a = askMari(db, 'O que tenho pendente antes da África?', today, 8 * 60)
    expect(a.agents.map((x) => x.id)).toEqual(['travel'])
    expect(a.blocks.some((b) => b.kind === 'list' && b.title === 'Por sub-área')).toBe(true)
  })

  it('fuel questions never invent guidance', () => {
    for (const q of ['Qual minha estratégia pra amanhã?', 'o que comer antes do pedal?', 'Como foi minha semana de treinos-chave?']) {
      const a = askMari(db, q, today, 20 * 60)
      expect(a.agents[0]?.id, q).toBe('fuel')
      expect(JSON.stringify(a), q).not.toMatch(/peso|gordura|% de/i)
    }
  })

  it('insights and search work on real data', () => {
    expect(buildInsights(db, today, 8 * 60).length).toBeGreaterThanOrEqual(2)
    for (const q of ['safari', 'jnb', 'cerâmica', 'TotalPass', 'Cambly']) expect(search(db, q, today).total, q).toBeGreaterThan(0)
  })

  it('reviews find the CEO Review / Monthly Board events when seeded', () => {
    const ceo = reviewEventOfWeek(db, '2026-09-28')
    if (ceo) expect(ceo.event.template!.length).toBeGreaterThan(0)
    const board = boardEventOfMonth(db, '2026-10')
    if (board) expect(board.date).toBe('2026-10-31')
  })
})
