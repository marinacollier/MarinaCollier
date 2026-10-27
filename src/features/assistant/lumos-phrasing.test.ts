/**
 * The same appointment / the same training said many ways (with and without accents, "16h",
 * "16:00", "16 horas", "4 da tarde"). Monday 2026-10-05, 07:30, real life seed.
 */
import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { respond } from './act/respond'

const NOW = { date: '2026-10-05', minutes: 450, iso: '2026-10-05T07:30:00.000-03:00' }
const db = buildSeed('2026-10-05')
const say = (s: string) => respond(db, s, NOW)

describe('appointment with a day and a time', () => {
  it.each([
    ['hoje às 16h tenho papo da Nemu', 'Papo da Nemu'],
    ['hoje as 16h tenho papo da Nemu', 'Papo da Nemu'],
    ['Hoje às 16h tenho papo da Nemu', 'Papo da Nemu'],
    ['hoje 16h papo da Nemu', 'Papo da Nemu'],
    ['tenho papo da Nemu hoje às 16:00', 'Papo da Nemu'],
    ['hoje às 4 da tarde tenho papo da Nemu', 'Papo da Nemu'],
    ['papo da Nemu hoje 16h', 'Papo da Nemu'],
    ['hoje às 16 horas papo com a Nemu', 'Papo com a Nemu'],
    ['hoje às 16h tenho conversa com a Nemu', 'Conversa com a Nemu'],
    ['hoje às 16h30 tenho call com a Nemu', 'Call com a Nemu'],
  ])('%s', (s, title) => {
    const r = say(s)
    expect(r?.area).toBe('agenda')
    expect(r?.text).toContain(title)
    expect(r?.text).toMatch(/05\/10 · 16:(00|30)/)
  })

  it('"tenho" without an event noun still works with a day and a time', () => {
    expect(say('amanhã às 16h tenho Nemu')?.text).toBe('Nemu adicionado ✓ 06/10 · 16:00')
  })

  it('"tenho que …" is a task, not an appointment', () => {
    expect(say('hoje às 16h tenho que pagar o boleto')?.area).not.toBe('agenda')
  })
})

describe('"Outra atividade" is never a different planned session', () => {
  it.each(['treinei outra atividade', 'fiz outra atividade hoje', 'hoje fiz outra atividade 40 min'])('%s', (s) => {
    const r = say(s)
    expect(r?.area).toBe('treino')
    expect(r?.text).toContain('Outra atividade registrada')
    expect(r?.ref?.id).not.toContain('natacao')
  })

  it('a named modality still marks the planned session', () => {
    expect(say('treinei natação')?.text).toContain('Natação endurance registrado')
  })
})
