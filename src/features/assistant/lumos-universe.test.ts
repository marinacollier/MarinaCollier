/**
 * Meu Universo · Beauty & Fragrance through Lumos: her exact sentences, through the real conversation store.
 * Owning ≠ liking ≠ wanting; nothing invented; every write is undoable and logged.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { UNIVERSE_SEED_IDS, universeSeedId } from '@/data/seed/universe'
import { getDB, useStore } from '@/data/store'
import { isOwned } from '@/data/universe/model'
import { respond } from './act/respond'
import type { LumosReply } from './act/types'
import { ask, canUndo, clearConversation, undoReply, useConversation, type Exchange } from './conversation'

const TODAY = '2026-10-27'
const at = (hm: string): Now => {
  const [h, m] = hm.split(':').map(Number)
  return { date: TODAY, minutes: h * 60 + m, iso: `${TODAY}T${hm}:00.000-03:00` }
}
const NOW = at('15:00')

function talk(text: string, now: Now = NOW): Exchange {
  const id = ask(text, now)!
  return useConversation.getState().exchanges.find((e) => e.id === id)!
}
const reply = (e: Exchange): LumosReply => {
  expect(e.lumos, e.question).toBeDefined()
  return e.lumos!.reply
}

beforeEach(() => {
  useStore.setState({ db: buildSeed(TODAY), hydrated: true })
  clearConversation()
})

describe('"Testei um perfume hoje na África do Sul e amei. Custa 600 rands."', () => {
  it('without a name: asks which one, writes nothing', () => {
    const before = getDB()
    const r = reply(talk('Testei um perfume hoje na África do Sul e amei. Custa 600 rands.'))
    expect(r.text).toMatch(/Qual perfume era\?/)
    expect(r.sub).toMatch(/ZAR|R\s?600/)
    expect(r.action).toBeUndefined()
    expect(getDB().universeItems).toBe(before.universeItems)
    expect(getDB().scentLogs).toBe(before.scentLogs)
  })

  it('the follow-up with the name records a new tested item — not owned — with price, country and date; Desfazer removes it', () => {
    talk('Testei um perfume hoje na África do Sul e amei. Custa 600 rands.')
    const e = talk('Era o Jo Malone Peony & Blush Suede')
    const r = reply(e)
    expect(r.text).toMatch(/Anotei no seu diário olfativo/)
    const item = getDB().universeItems.find((i) => i.name === 'Peony & Blush Suede')!
    expect(item).toBeDefined()
    expect(item.brand).toBe('Jo Malone')
    expect(item.ownership).toBe('testado')
    expect(isOwned(item)).toBe(false)
    expect(item.opinion).toBe('amei')
    expect(item.priceCents).toBe(60000)
    expect(item.currency).toBe('ZAR')
    expect(item.country).toBe('África do Sul')
    expect(item.experiencedOn).toBe(TODAY)
    expect(item.notes).toBeUndefined()
    expect(item.confirmed).toBe(false)
    const log = getDB().scentLogs.find((l) => l.itemId === item.id)!
    expect(log).toMatchObject({ date: TODAY, verdict: 'amei', priceCents: 60000, currency: 'ZAR', country: 'África do Sul', status: 'testado' })
    expect(getDB().lifeLog.some((ev) => ev.ref?.type === 'scentLog')).toBe(true)
    expect(canUndo(e.id)).toBe(true)
    undoReply(e.id)
    expect(getDB().universeItems.some((i) => i.id === item.id)).toBe(false)
    expect(getDB().scentLogs.some((l) => l.itemId === item.id)).toBe(false)
    expect(getDB().lifeLog.some((ev) => ev.ref?.type === 'scentLog')).toBe(false)
  })

  it('named in the sentence and already in the library (Yardley): diary entry on that item, nothing duplicated', () => {
    const items = getDB().universeItems.length
    const e = talk('Testei o Yardley Gorgeous in Cashmere hoje na África do Sul e amei. Custa 600 rands.')
    reply(e)
    expect(getDB().universeItems).toHaveLength(items)
    const logs = getDB().scentLogs.filter((l) => l.itemId === UNIVERSE_SEED_IDS.yardley)
    expect(logs).toHaveLength(2)
    expect(getDB().universeItems.find((i) => i.id === UNIVERSE_SEED_IDS.yardley)!.ownership).toBe('tenho')
  })

  it('a wished perfume she tested becomes "testado", never owned; "comprei" makes it hers', () => {
    const id = universeSeedId('prada-paradoxe-edp')
    reply(talk('Testei o Prada Paradoxe na loja e gostei'))
    let p = getDB().universeItems.find((i) => i.id === id)!
    expect(p.ownership).toBe('testado')
    expect(p.opinion).toBe('gostei')
    reply(talk('comprei o Prada Paradoxe'))
    p = getDB().universeItems.find((i) => i.id === id)!
    expect(p.ownership).toBe('tenho')
    expect(p.acquiredOn).toBe(TODAY)
  })
})

describe('"Quais perfumes eu tenho para usar à noite?"', () => {
  it('lists only owned perfumes whose occasions include night', () => {
    const r = reply(talk('Quais perfumes eu tenho para usar à noite?'))
    const names = (r.lines ?? []).map((l) => l.text)
    expect(names).toEqual(expect.arrayContaining(['YSL Libre Intense', 'Lancôme La Nuit Trésor', 'Natura Aura Alba', 'Spot For Her', 'Duchesse Femme']))
    expect(names).not.toContain("Victoria's Secret Very Sexy Night")
    expect(names).not.toContain('Dior Escale à Portofino')
    for (const n of names) {
      const it = getDB().universeItems.find((i) => [i.brand, i.name, i.version].filter(Boolean).join(' ') === n)!
      expect(isOwned(it)).toBe(true)
      expect(it.occasions).toContain('noite')
    }
  })
})

describe('"Qual perfume uso hoje?"', () => {
  it('recommends an owned perfume and explains why from her data', () => {
    const r = reply(talk('Qual perfume uso hoje?', at('20:30')))
    expect(r.text).toMatch(/^Hoje: /)
    const id = r.ref!.id
    const it = getDB().universeItems.find((i) => i.id === id)!
    expect(isOwned(it)).toBe(true)
    expect(it.category).toBe('perfume')
    expect(r.sub).toBeTruthy()
  })

  it('cold night date → the perfume she uses for cold nights / dates', () => {
    const r = respond(getDB(), 'qual perfume uso hoje? encontro à noite, está frio', NOW)!
    const it = getDB().universeItems.find((i) => i.id === r.ref!.id)!
    expect(it.occasions).toEqual(expect.arrayContaining(['noite', 'frio']))
    expect(r.sub).toMatch(/encontro|romance|noite|frio/)
  })

  it('never recommends a wished item, even if she loved it', () => {
    const db = getDB()
    const wish = db.universeItems.find((i) => i.ownership === 'quero_testar')!
    useStore.setState({ db: { ...db, universeItems: db.universeItems.map((i) => (i.id === wish.id ? { ...i, opinion: 'amei', favorite: true, occasions: ['noite', 'frio', 'encontro'] } : i)) } })
    const r = respond(getDB(), 'qual perfume uso hoje? encontro à noite, está frio', NOW)!
    expect(r.ref!.id).not.toBe(wish.id)
  })
})

describe('maquiagem', () => {
  it('uses her registered style, not generic advice', () => {
    const r = respond(getDB(), 'Que maquiagem combina com o estilo que gosto?', NOW)!
    expect(r.text).toMatch(/natural, sofisticada, luminosa/)
  })
})
