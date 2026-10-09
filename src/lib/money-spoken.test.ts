import { describe, expect, it } from 'vitest'
import { parseBRL, parseSpokenBRL } from './money'

const ok = (cents: number) => ({ kind: 'ok', cents })

describe('parseSpokenBRL — how she says or types an amount', () => {
  it.each([
    ['recebi 18 mil', 1_800_000],
    ['recebi 18.000', 1_800_000],
    ['recebi 18000', 1_800_000],
    ['recebi 18 mil e 500', 1_850_000],
    ['recebi 18.500', 1_850_000],
    ['recebi R$ 18.500', 1_850_000],
    ['recebi R$18.500,00', 1_850_000],
    ['recebi dezoito mil', 1_800_000],
    ['recebi dezoito mil e quinhentos', 1_850_000],
    ['recebi 18,5 mil', 1_850_000],
    ['recebi 18k', 1_800_000],
    ['recebi vinte mil do Santander', 2_000_000],
    ['recebi 500 reais', 50_000],
    ['recebi o Santander dia 15, 18 mil', 1_800_000],
    ['recebi o Santander em 15/10: R$ 18.500', 1_850_000],
  ])('%s', (text, cents) => expect(parseSpokenBRL(text)).toEqual(ok(cents)))

  it('no amount → none (dates and times are never money)', () => {
    expect(parseSpokenBRL('recebi o Santander hoje')).toEqual({ kind: 'none' })
    expect(parseSpokenBRL('recebi o Santander dia 15')).toEqual({ kind: 'none' })
    expect(parseSpokenBRL('recebi o Santander 15/10 às 6h45')).toEqual({ kind: 'none' })
    expect(parseSpokenBRL('recebi os dois')).toEqual({ kind: 'none' })
  })

  it('ambiguous → asks, never picks silently', () => {
    expect(parseSpokenBRL('recebi 18')).toEqual({ kind: 'ambiguous', options: [1800, 1_800_000] })
    expect(parseSpokenBRL('recebi 18,500')).toEqual({ kind: 'ambiguous', options: [1850, 1_850_000] })
    expect(parseSpokenBRL('recebi 18 mil ou 20 mil')).toEqual({ kind: 'ambiguous', options: [1_800_000, 2_000_000] })
  })

  it('the money field reads "18.500" as eighteen thousand five hundred', () => {
    expect(parseBRL('18.500')).toBe(1_850_000)
    expect(parseBRL('18.500,00')).toBe(1_850_000)
    expect(parseBRL('12.5')).toBe(1250)
    expect(parseBRL('12,50')).toBe(1250)
    expect(parseBRL('1.234.567')).toBe(123_456_700)
  })
})
