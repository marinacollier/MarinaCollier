import { describe, expect, it } from 'vitest'
import type { CalendarEntry } from '@/data/calendar/universal'
import type { ActionItem } from '@/data/agenda/items'
import type { AttentionItem } from '@/data/intel'
import type { Trip, TripItem } from '@/data/types'
import type { TripOpsPanel } from '@/features/travel/expedition/panel'
import { dayHeader, dayRows, entryChip, flightName, headerDate, inDays, lifeNeeds, nextDays, ROW_MAX, rowTime, shortTitle, stayPlace, tripNeeds } from './clean'

const entry = (p: Partial<CalendarEntry> & { id: string; date: string; time?: string; endDate?: string }): CalendarEntry => ({
  title: p.id,
  startAt: { date: p.date, time: p.time },
  endAt: { date: p.endDate ?? p.date, time: p.time },
  timezone: 'Africa/Johannesburg',
  category: 'viagem',
  sourceType: 'event',
  sourceId: p.id,
  status: 'confirmado',
  allDay: !p.time,
  visibility: 'normal',
  open: {},
  sourceLabel: 'Agenda',
  ...p,
}) as CalendarEntry

const item = (p: Partial<TripItem> & { id: string }): TripItem => ({ tripId: 't', section: 'reserva', title: p.id, order: 0, status: 'a_confirmar', ...p }) as TripItem

describe('Home limpa · picks', () => {
  it('header is "Sexta, 6 nov"; tomorrow is "Amanhã"', () => {
    expect(headerDate('2026-11-06')).toBe('Sexta, 6 nov')
    expect(headerDate('2026-11-08')).toBe('Domingo, 8 nov')
    expect(dayHeader('2026-11-07', '2026-11-06')).toBe('Amanhã')
    expect(dayHeader('2026-11-09', '2026-11-06')).toBe('Segunda, 9 nov')
  })

  it('Hoje: all-day first, then by time; no base, no trip span, no optional, no deadlines/bills, no cancelled', () => {
    const d = '2026-11-06'
    const rows = dayRows(
      [
        entry({ id: 'Natação', date: d, time: '14:00', sourceType: 'workout' }),
        entry({ id: 'Aula', date: d, time: '09:00', sourceType: 'school' }),
        entry({ id: 'Kirstenbosch', date: d, sourceType: 'tripItem' }),
        entry({ id: 'Trabalho', date: d, time: '08:00', sourceType: 'work', base: true }),
        entry({ id: 'South Africa 2026', date: '2026-10-24', endDate: '2026-11-16', sourceType: 'trip' }),
        entry({ id: 'Garden Route', date: d, time: '07:00', sourceType: 'tripItem', optional: true }),
        entry({ id: 'Prazo: hotel', date: d, sourceType: 'tripDeadline' }),
        entry({ id: 'Aluguel', date: d, sourceType: 'bill' }),
        entry({ id: 'Jantar', date: d, time: '20:00', status: 'cancelado' }),
        entry({ id: 'Ontem', date: '2026-11-05', time: '10:00' }),
      ],
      d,
    )
    expect(rows.map((r) => r.title)).toEqual(['Kirstenbosch', 'Aula', 'Natação'])
    expect(rows.map(rowTime)).toEqual(['dia todo', '09:00', '14:00'])
  })

  it('Próximos dias: the next 3 days that have something, max 3 rows each', () => {
    const list = [
      ...['07:00', '08:00', '09:00', '10:00'].map((t) => entry({ id: `a${t}`, date: '2026-11-07', time: t })),
      entry({ id: 'b', date: '2026-11-09', time: '09:00' }),
      entry({ id: 'c', date: '2026-11-10', time: '09:00' }),
      entry({ id: 'd', date: '2026-11-11', time: '09:00' }),
    ]
    const days = nextDays(list, '2026-11-06')
    expect(days.map((x) => x.date)).toEqual(['2026-11-07', '2026-11-09', '2026-11-10'])
    expect(days[0].rows).toHaveLength(3)
  })

  it('status chips are tiny words, never sentences', () => {
    const db = { tripItems: [item({ id: 'k', bookingStatus: 'aguardando_resposta' }), item({ id: 'p', bookingStatus: 'reservado', paymentStatus: 'pago' })] }
    expect(entryChip(db, entry({ id: 'x', date: '2026-11-09', sourceType: 'tripItem', sourceId: 'k', status: 'pendente' }))).toBe('aguardando')
    expect(entryChip(db, entry({ id: 'y', date: '2026-11-09', sourceType: 'tripItem', sourceId: 'p' }))).toBe('pago')
    expect(entryChip(db, entry({ id: 'z', date: '2026-11-09', status: 'pendente' }))).toBe('a confirmar')
    expect(entryChip(db, entry({ id: 'w', date: '2026-11-09' }))).toBeUndefined()
  })

  it('shortTitle keeps one line (≤ 40), dropping parentheses and subtitles first', () => {
    expect(shortTitle('Caiaque com focas — Hout Bay (Kayak Adventures)')).toBe('Caiaque com focas — Hout Bay')
    expect(shortTitle('Kwa Maritane Bush Lodge · Pilanesberg · 2 noites com safári incluído')).toBe('Kwa Maritane Bush Lodge')
    const long = shortTitle('a'.repeat(80))
    expect(long.length).toBe(ROW_MAX)
    expect(long.endsWith('…')).toBe(true)
  })

  it('Precisa de você (viagem): P0 first, payments with the amount, at most 3, one row per booking', () => {
    const pay = item({ id: 'pay', title: 'Safari Pilanesberg (Kwa Maritane)', priority: 'P0', bookingStatus: 'reservado', proof: 'voucher', nextAction: 'Pagar o saldo até sexta, senão a reserva cai — falar com a Joyce' })
    const hotel = item({ id: 'hotel', title: 'Hotel OR Tambo', priority: 'P0', bookingStatus: 'a_reservar', group: 'Johannesburg' })
    const kayak = item({ id: 'kayak', title: 'Caiaque', priority: 'P1', bookingStatus: 'aguardando_resposta' })
    const transfer = item({ id: 'transfer', title: 'Transfer', priority: 'P2', bookingStatus: 'a_reservar' })
    const panel = {
      trip: { id: 't', name: 'South Africa 2026' } as Trip,
      payments: [{ item: pay, money: { total: 400000, paid: 0, balance: 400000, currency: 'ZAR' } }],
      leg: { label: 'Johannesburg', items: [transfer, hotel, pay] },
      awaiting: [kayak],
    } as unknown as TripOpsPanel
    const needs = tripNeeds(panel)
    expect(needs).toHaveLength(3)
    expect(needs.map((n) => n.title)).toEqual(['Safari Pilanesberg', 'Hotel OR Tambo', 'Caiaque'])
    expect(needs[0].chip).toMatch(/^pagar R4\.000$/)
    expect(needs[1].chip).toBe('reservar')
    expect(needs[2].chip).toBe('aguardando')
    for (const n of needs) expect(n.title.length + n.chip.length).toBeLessThanOrEqual(ROW_MAX + 15)
    expect(JSON.stringify(needs)).not.toContain('Joyce')
    expect(tripNeeds(panel, { hideMoney: true })[0].chip).toBe('pagar')
    // A quote is not a bill: never "pagar", it shows what is really missing.
    const quote = item({ id: 'quote', title: 'Kwa Maritane', priority: 'P0', bookingStatus: 'aguardando_resposta', paymentStatus: 'pendente' })
    const q = tripNeeds({ ...panel, payments: [{ item: quote, money: { total: 1175000, paid: 0, balance: 1175000, currency: 'ZAR' } }], leg: { label: 'Johannesburg', items: [quote] }, awaiting: [] } as unknown as TripOpsPanel)
    expect(q[0].chip).toBe('aguardando')
  })

  it('Precisa de você (fora da viagem): overdue first, then the attention queue, max 3', () => {
    const late = { key: 'task:1', title: 'Enviar NF', status: 'pending', carried: true } as ActionItem
    const fine = { key: 'task:2', title: 'Ok', status: 'pending' } as ActionItem
    const att = (k: string, kind: AttentionItem['kind']) => ({ key: k, kind, title: `Pergunta ${k}`, provenance: {} }) as AttentionItem
    const needs = lifeNeeds([fine, late], [att('a', 'waiting_reply'), att('b', 'decision'), att('c', 'conflict')])
    expect(needs.map((n) => [n.title, n.chip])).toEqual([
      ['Enviar NF', 'atrasada'],
      ['Pergunta a', 'responder'],
      ['Pergunta b', 'decidir'],
    ])
  })

  it('flight chip: the code when there is one', () => {
    expect(flightName('Voo SA366 Cape Town → Johannesburg')).toBe('SA366')
    expect(flightName('LA 8070 GRU')).toBe('LA8070')
    expect(flightName('Voo para casa')).toBe('para casa')
    expect(inDays(7)).toBe('em 7 dias')
    expect(inDays(1)).toBe('amanhã')
    expect(inDays(0)).toBe('hoje')
  })
})

describe('Home limpa · cidade do dia (stayPlace)', () => {
  const hotel = item({ id: 'rl', section: 'hospedagem', group: 'Johannesburg / Safari', date: '2026-11-13', endDate: '2026-11-16', status: 'confirmado', bookingStatus: 'confirmado', confirmationCode: '337BC28C2' })
  it('acorda no hotel reservado: do dia seguinte ao check-in até o check-out', () => {
    expect(stayPlace([hotel], 't', '2026-11-13')).toBeUndefined() // ainda dorme em Cape Town
    expect(stayPlace([hotel], 't', '2026-11-14')).toBe('Johannesburg')
    expect(stayPlace([hotel], 't', '2026-11-16')).toBe('Johannesburg')
    expect(stayPlace([hotel], 't', '2026-11-17')).toBeUndefined()
  })
  it('cotação ou hotel cancelado não muda a cidade', () => {
    expect(stayPlace([{ ...hotel, bookingStatus: 'a_reservar', status: 'a_confirmar', confirmationCode: undefined }], 't', '2026-11-14')).toBeUndefined()
    expect(stayPlace([{ ...hotel, status: 'cancelado', bookingStatus: 'cancelado' }], 't', '2026-11-14')).toBeUndefined()
  })
})

describe('Home limpa · treino registrado sem horário', () => {
  it('aparece no dia como "treino · feito"; uma compra feita sem horário não', () => {
    const base = { startAt: { date: '2026-11-09' }, endAt: { date: '2026-11-09' }, timezone: 'Africa/Johannesburg', category: 'treino', visibility: 'normal', sourceLabel: 'Treino', open: {}, allDay: false } as unknown as CalendarEntry
    const swim = { ...base, id: 'workout:s', title: 'Natação · 1.000 m', sourceType: 'workout', sourceId: 's', status: 'feito' } as CalendarEntry
    const buy = { ...base, id: 'tripItem:b', title: 'Rip Curl', sourceType: 'tripItem', sourceId: 'b', status: 'feito', allDay: true } as CalendarEntry
    const rows = dayRows([swim, buy], '2026-11-09')
    expect(rows.map((r) => r.title)).toEqual(['Natação · 1.000 m'])
    expect(rowTime(rows[0])).toBe('treino')
  })
})
