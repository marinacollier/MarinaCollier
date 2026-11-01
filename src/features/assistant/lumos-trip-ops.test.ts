/**
 * Brief operacional 01/11 — Lumos answers the five trip commands from her data (no invention, no writes):
 * programação de hoje · atualiza o roteiro · o que falta reservar · checklist de amanhã · fechamento financeiro.
 */
import { describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import type { DB, Expense } from '@/data/types'
import { buildSeed } from '@/data/seed'
import { applyExpeditionSeed } from '@/data/seed/expedition'
import { applyMaster1031 } from '@/data/seed/master-1031'
import { applyOps1101 } from '@/data/seed/ops-1101'
import { SEED_IDS } from '@/data/seed/ids'
import { respond } from './act/respond'
import { tripOpsHandler } from './act/handlers/trip-ops'
import { norm } from './act/text'

const at = '2026-11-01T10:00:00.000Z'
const base = (): DB => applyOps1101(applyMaster1031(applyExpeditionSeed(buildSeed('2026-10-27'), at), '2026-10-31', at), '2026-11-01', at)
// 03:00 in São Paulo = 08:00 in Cape Town, Monday 02/11.
const NOW: Now = { date: '2026-11-02', minutes: 3 * 60, iso: '2026-11-02T03:00:00.000-03:00' }
const T = SEED_IDS.tripAfrica
const ask = (db: DB, text: string, now: Now = NOW) => respond(db, text, now)
const all = (r: NonNullable<ReturnType<typeof respond>>) => [r.text, r.sub, ...(r.lines ?? []).flatMap((l) => [l.text, l.sub]), ...(r.sections ?? []).flatMap((s) => [s.title, ...s.lines.flatMap((l) => [l.text, l.sub])])].filter(Boolean).join('\n')

describe('Lumos · trip operations', () => {
  it('"qual minha programação de hoje?" — agenda, address/links, the 3 mandatory blocks and the day spend', () => {
    const db = base()
    const items = db.tripItems.map((i) => (i.id.endsWith('bo-kaap') || /Bo-Kaap/.test(i.title) ? { ...i, time: '15:30', address: 'Wale Street', url: 'https://bokaap.example' } : i))
    const r = ask({ ...db, tripItems: items }, 'qual minha programação de hoje?')!
    expect(r.area).toBe('viagem')
    expect(r.action).toBeUndefined()
    const text = all(r)
    expect(text).toMatch(/Hoje \(02\/11\)/)
    expect(text).toMatch(/Aula 09:00–15:10/)
    expect(text).toMatch(/Bo-Kaap/)
    expect(text).toMatch(/Às 15:30 · PLANEJADO · Wale Street · https:\/\/bokaap\.example/)
    const blocks = r.sections!.find((s) => s.title === 'Blocos obrigatórios')!
    expect(blocks.lines.map((l) => l.text)).toEqual(['Treino: Força superior (1/2)', 'Trabalho Fashion Finder · 30 min', 'Inglês individual · 30 min'])
    expect(blocks.lines[2].sub).toMatch(/^20:00–20:30/)
    expect(r.sections!.find((s) => s.title === 'Gasto do dia')!.lines[0].text).toBe('Nada registrado ainda')
  })

  it('the day spend comes from the ZAR statement on the days it covers', () => {
    const db = base()
    const line = { id: 'x', title: 'Uber', amountCents: 18994, date: '2026-11-02', categoryId: 'c', status: 'paid', origin: 'manual', tripId: T, currency: 'ZAR', tripCategory: 'uber', createdAt: at, updatedAt: at } as Expense
    const r = ask({ ...db, expenses: [...db.expenses, line] }, 'qual a minha programação de hoje')!
    expect(r.sections!.find((s) => s.title === 'Gasto do dia')!.lines[0]).toMatchObject({ text: 'ZAR 190', sub: 'Pelo extrato' })
  })

  it('"atualiza o roteiro" only reorganizes what is stored and shows conflicts', () => {
    const db = base()
    const clash = db.tripItems.map((i) => (/Table Mountain/.test(i.title) ? { ...i, time: '16:00', endTime: '18:00' } : /Kalk Bay/.test(i.title) ? { ...i, date: '2026-11-03', time: '17:00', endTime: '19:00' } : i))
    const before = JSON.stringify(clash)
    const r = ask({ ...db, tripItems: clash }, 'atualiza o roteiro')!
    expect(r.text).toMatch(/Reorganizei o que já está salvo.*nada foi criado, mudado ou reservado/)
    expect(r.action).toBeUndefined()
    expect(JSON.stringify(clash)).toBe(before)
    expect(r.sections![0].title).toBe('Conflitos de horário')
    expect(r.sections![0].lines[0].text).toMatch(/Table Mountain e Kalk Bay no mesmo horário/)
  })

  it('"o que falta reservar?" — P0 first, with deadline/link/value; planned never shown as reserved', () => {
    const r = ask(base(), 'o que falta reservar?')!
    expect(r.sections!.map((s) => s.title).slice(0, 2)).toEqual(['P0', 'P1'])
    const text = all(r)
    expect(text).toMatch(/Hotel OR Tambo · 13→14\/11 — A RESERVAR/)
    expect(text).toMatch(/Table Mountain — A RESERVAR/)
    expect(text).toMatch(/referência ZAR 475/)
    expect(text).toMatch(/https:\/\/citylodgehotels\.com\//)
    // Cape Point is reserved (with her word as proof): not pending. Flights without voucher: apart.
    expect(text).not.toMatch(/Cape Point/)
    const noProof = r.sections!.find((s) => /Sem comprovante/.test(s.title))!
    expect(noProof.lines.some((l) => /Voo/.test(l.text))).toBe(true)
    expect(r.sections!.filter((s) => !/Sem comprovante/.test(s.title)).flatMap((s) => s.lines).some((l) => /RESERVADO|PLANEJADO/.test(l.text))).toBe(false)
  })

  it('"gerar checklist de amanhã" — from tomorrow\'s items and blocks', () => {
    const db = base()
    const items = db.tripItems.map((i) => (/Table Mountain/.test(i.title) ? { ...i, leaveTime: '15:30', time: '16:00', checklistKind: 'trilha' as const } : i))
    const r = ask({ ...db, tripItems: items }, 'gerar checklist de amanhã')!
    expect(r.text).toBe('Checklist de amanhã (03/11): saída 15:30 para Table Mountain.')
    const text = all(r)
    expect(text).toMatch(/Lanterna de cabeça/)
    expect(text).toMatch(/Passaporte/)
    expect(text).toMatch(/Garrafa de água/)
    expect(text).toMatch(/Table Mountain: A RESERVAR — ainda não reservado/)
    // The hike is the day's training (it fills the 60 min block).
    expect(text).toMatch(/Treino do dia: Table Mountain · 15:30/)
  })

  it('"fechamento financeiro" — paid / committed / estimated, budget as reference, rules for savings', () => {
    const db = base()
    const ledger = [
      { id: 'l1', title: 'Surf', amountCents: 122000, date: '2026-10-28', categoryId: 'c', status: 'paid', origin: 'manual', tripId: T, currency: 'ZAR', tripCategory: 'treinos', createdAt: at, updatedAt: at },
    ] as Expense[]
    const items = db.tripItems.map((i) => (/Surf em Muizenberg/.test(i.title) ? { ...i, date: '2026-10-28', paidCents: 150000 } : i))
    const r = ask({ ...db, tripItems: items, expenses: [...db.expenses, ...ledger] }, 'fechamento financeiro')!
    const text = all(r)
    // The statement wins on 28/10: the surf's own paid value is not added again.
    expect(text).toMatch(/Pago até agora: ZAR 1\.220/)
    expect(text).toMatch(/Comprometido \(reservado, não pago\): ZAR 0/)
    expect(text).toMatch(/Estimado \(planejado\/cotado\): ZAR 4\.475/)
    expect(text).toMatch(/Orçamento original ZAR 30\.000 — referência, não saldo disponível/)
    expect(text).toMatch(/Logística essencial/)
    expect(r.action).toBeUndefined()
    // The budget is in rand: the remaining is computed directly (the rate does not change it).
    const withRate = { ...db, tripItems: items, expenses: [...db.expenses, ...ledger], trips: db.trips.map((t) => (t.id === T ? { ...t, expedition: { ...t.expedition!, rateToBRL: 0.3 } } : t)) }
    expect(all(ask(withRate, 'fechamento financeiro')!)).toMatch(/Sobra depois do projetado: ZAR 24\.305/)
  })

  it('outside the trip the commands are not answered by the trip', () => {
    const db = base()
    const before: Now = { date: '2026-10-10', minutes: 600, iso: '2026-10-10T10:00:00.000-03:00' }
    for (const q of ['qual minha programação de hoje?', 'o que falta reservar?', 'fechamento financeiro', 'gerar checklist de amanhã', 'atualiza o roteiro']) {
      expect(tripOpsHandler.run({ db, text: q, n: norm(q), now: before, ctx: {} }), q).toBeUndefined()
    }
  })
})
