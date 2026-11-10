import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { emptyDB } from '@/data/defaults'
import type { Trip } from '@/data/types'
import { understand } from '@/features/assistant/router'
import { lex } from '@/features/assistant/adjust/lexicon'
import { parseItinerary, itineraryDate } from './itinerary'

const HER = 'Domingo 15/11 - Apartheid Museum pela manhã, Almoço em Sowet, Mandela house a tarde. Ingresso de Mandela é no local, o os outros dois sao de graça.'
const TRIP = { id: 'za', name: 'África do Sul', startDate: '2026-10-24', endDate: '2026-11-16', status: 'em_andamento', createdAt: '', updatedAt: '' } as unknown as Trip

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB({ ...emptyDB(), trips: [TRIP] })
})

describe('roteiro de um dia por conversa', () => {
  it('reads her exact message: three stops in order, the part of the day, and what she said about tickets', () => {
    expect(itineraryDate('domingo 15/11 - x', '2026-11-10')).toBe('2026-11-15')
    expect(parseItinerary(HER)).toEqual([
      { title: 'Apartheid Museum', part: 'manha', cost: 'free' },
      { title: 'Almoço em Sowet', part: 'almoco', cost: 'free' },
      { title: 'Mandela house', part: 'tarde', cost: 'door' },
    ])
  })

  it('never becomes a workout ("os outros" is not "Outra atividade")', () => {
    expect(lex(getDB(), 'os outros dois são de graça', '2026-11-10').mods).toEqual([])
    const turn = understand(getDB(), HER, '2026-11-10', 20 * 60)
    expect(turn.kind).toBe('reply')
  })

  it('creates planned trip items on 15/11 — no time invented, nothing booked, no expense — and does not duplicate', () => {
    const turn = understand(getDB(), HER, '2026-11-10', 20 * 60)
    if (turn.kind !== 'reply') throw new Error(turn.kind)
    turn.reply.action!.run()
    const items = getDB().tripItems.filter((i) => i.date === '2026-11-15')
    expect(items.map((i) => i.title)).toEqual(['Apartheid Museum', 'Almoço em Sowet', 'Mandela house'])
    expect(items.every((i) => !i.time && i.bookingStatus === 'planejado' && !i.paidCents && !i.amountCents)).toBe(true)
    expect(items[2].paymentStatus).toBe('pendente')
    expect(getDB().workouts).toHaveLength(0)
    expect(getDB().expenses).toHaveLength(0)
    const again = understand(getDB(), HER, '2026-11-10', 20 * 60)
    if (again.kind !== 'reply') throw new Error(again.kind)
    expect(again.reply.action).toBeUndefined()
    expect(getDB().tripItems.filter((i) => i.date === '2026-11-15')).toHaveLength(3)
  })
})
