/**
 * Modo viagem through Lumos: "o que tenho hoje?" and "bom dia" in Cape Town answer with the trip day
 * (class, activities, spending in ZAR), never with the São Paulo routine.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { applyModuleSeeds, getDB, useStore } from '@/data/store'
import { tripDayOf } from '@/features/travel/trip-day'
import { ask, clearConversation, useConversation } from './conversation'

const DAY = '2026-10-29' // Thursday
const NOW: Now = { date: DAY, minutes: 7 * 60, iso: `${DAY}T07:00:00.000-03:00` } // 12:00 in Cape Town

const reply = () => useConversation.getState().exchanges.at(-1)!.lumos!.reply

beforeEach(() => {
  useStore.setState({ db: applyModuleSeeds(buildSeed(DAY)), hydrated: true })
  clearConversation()
})

describe('Lumos on a trip day', () => {
  it('"o que eu tenho hoje?" is the expedition day', () => {
    ask('o que eu tenho hoje?', NOW)
    const r = reply()
    expect(r.area).toBe('viagem')
    expect(r.text).toMatch(/dia 6 de 24/)
    expect(r.text).toMatch(/aula 09:00–15:10/)
    // Only the trip's things (the sub line just says the São Paulo routine is paused).
    expect(r.text).toMatch(/Piscina de água salgada às 16:00/)
    expect(r.text).not.toMatch(/06:35/) // 12:00 in Cape Town: the morning run is past
    const all = [r.text, ...(r.lines ?? []).map((l) => `${l.text} ${l.sub ?? ''}`)].join(' ')
    for (const sp of ['Milagre', 'presencial', 'Natação', 'Luna', 'Cerâmica', 'Deslocamento']) expect(all).not.toContain(sp)
    expect(r.sub).toMatch(/pausada até 16\/11/)
  })

  it('tomorrow (Friday) has the short class and Table Mountain after it', () => {
    ask('o que eu tenho amanhã?', NOW)
    const r = reply()
    expect(r.text).toMatch(/Amanhã é o dia 7/)
    expect(r.text).toMatch(/aula 09:00–12:20/)
    expect(r.text).toMatch(/Table Mountain/)
  })

  it('"bom dia" is the trip brief', () => {
    ask('bom dia', NOW)
    const r = reply()
    expect(r.area).toBe('viagem')
    expect(r.text).toMatch(/^Bom dia\. Dia 6 de 24/)
    expect(r.text).not.toMatch(/presencial|Milagre/)
  })

  it('the trip day counts what she spent (ZAR) and names the day\'s training', () => {
    const t = getDB().trips.find((x) => x.expedition)!
    useStore.setState({
      db: {
        ...getDB(),
        tripItems: [
          ...getDB().tripItems,
          { id: 'ti-food', tripId: t.id, section: 'comida', title: 'Alimentação', status: 'feito', date: DAY, paidCents: 25000, currency: 'ZAR', order: 999, createdAt: '', updatedAt: '' },
          { id: 'ti-run', tripId: t.id, section: 'esporte', title: 'Corrida no Sea Point', status: 'confirmado', date: DAY, time: '13:30', order: 1000, createdAt: '', updatedAt: '' },
        ],
      },
    })
    const d = tripDayOf(getDB(), DAY, 12 * 60)!
    expect(d.spentCents).toBe(25000)
    expect(d.sports.map((s) => s.title)).toContain('Corrida no Sea Point')
    expect(d.next?.item.title).toBe('Corrida no Sea Point')
    ask('o que eu tenho hoje?', NOW)
    const lines = reply().lines!.map((l) => l.text)
    expect(lines).toContain('Gasto hoje: ZAR 250')
    expect(lines).toContain('Corrida no Sea Point')
  })

  it('after the trip the São Paulo day is back', () => {
    const after: Now = { date: '2026-11-18', minutes: 5 * 60, iso: '2026-11-18T05:00:00.000-03:00' }
    ask('o que eu tenho hoje?', after)
    const r = reply()
    expect(r.area).not.toBe('viagem')
    expect(r.text).toMatch(/presencial/)
  })
})
