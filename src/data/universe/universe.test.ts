/**
 * Meu Universo · Beauty & Fragrance — seed, invariants (owning ≠ liking ≠ wanting), recommender, DNA,
 * comparator, backup and sync.
 */
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { emptyDB, migrate } from '../defaults'
import { buildSeed } from '../seed'
import { SCENT_PROFILE_SEED, UNIVERSE_SEED_IDS, WISH_GROUPS, applyUniverseSeed, universeSeedId, universeSeedPayloads } from '../seed/universe'
import { actions, flushNow, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { syncCollections } from '../sync/engine'
import type { DB, UniverseItem } from '../types'
import { makeBackup, parseBackupText } from '@/features/settings/backup'
import {
  closestOwned,
  collection,
  compare,
  isOwned,
  patchFromLog,
  pricePerMl,
  recommend,
  scentDNA,
  wishlist,
  type Intensity,
  type Setting,
  type TempBand,
  type TimeOfDay,
  type WearOccasion,
} from './model'

const TODAY = '2026-10-27'
const item = (db: DB, slug: string) => db.universeItems.find((i) => i.id === universeSeedId(slug))!

describe('seed', () => {
  const db = buildSeed(TODAY)

  it('brings exactly her inventory, complementary items, both wishlists and the first diary entry', () => {
    const { items, logs } = universeSeedPayloads()
    expect(db.universeItems).toHaveLength(items.length)
    expect(items).toHaveLength(11 + 24 + 10 + 5 + 9)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(db.scentLogs).toHaveLength(logs.length)
    expect(collection(db, ['perfume'])).toHaveLength(11)
    expect(db.profile.scentProfile).toEqual(SCENT_PROFILE_SEED)
  })

  it('wishlists are desires to test, never owned, never favorite; nothing is favorite until she marks it', () => {
    const wished = db.universeItems.filter((i) => i.wishGroup)
    expect(wished).toHaveLength(24)
    for (const w of wished) {
      expect(w.ownership).toBe('quero_testar')
      expect(isOwned(w)).toBe(false)
      expect(w.opinion).toBeUndefined()
    }
    expect(db.universeItems.some((i) => i.favorite)).toBe(false)
    const groups = wishlist(db)
    expect(groups.map((g) => g.label)).toEqual([WISH_GROUPS.vs, WISH_GROUPS.high, WISH_GROUPS.other])
    expect(groups[0].items[0].name).toBe('Very Sexy Night')
    expect(groups[0].items[9].name).toBe('Tease Crème Cloud')
    expect(groups[1].items[0].name).toBe('Paradoxe')
  })

  it('"confirmar versão" items are confirmed:false and say which field', () => {
    for (const slug of ['hugo-boss-woman-femme', 'spot-for-her', 'duchesse-femme']) {
      expect(item(db, slug).confirmed).toBe(false)
      expect(item(db, slug).needsConfirmation).toContain('versao')
    }
    expect(item(db, 'ysl-libre-intense').confirmed).toBe(true)
    expect(item(db, 'natura-seve').category).toBe('oleo_corporal')
    expect(item(db, 'natura-ekos-priprioca').needsConfirmation).toContain('categoria')
  })

  it('no invented notes: only what the spec gives', () => {
    expect(item(db, 'ysl-libre-intense').notes).toEqual(['lavanda', 'flor de laranjeira', 'baunilha'])
    for (const slug of ['spot-for-her', 'duchesse-femme', 'natura-una-blush', 'natura-aura-alba', 'cereja-e-avela', 'natura-seve', 'chanel-chance-eau-tendre'])
      expect(item(db, slug).notes).toBeUndefined()
    const y = db.universeItems.find((i) => i.id === UNIVERSE_SEED_IDS.yardley)!
    expect(y).toMatchObject({ ownership: 'tenho', opinion: 'amei', priceCents: 60000, currency: 'ZAR', city: 'Cape Town', country: 'África do Sul', notesSource: 'a_confirmar', confirmed: false })
    expect(y.notes).toBeUndefined()
    expect(y.families).toBeUndefined()
    expect(y.sizeMl).toBeUndefined()
    const log = db.scentLogs[0]
    expect(log).toMatchObject({ itemId: y.id, city: 'Cape Town', verdict: 'amei', status: 'comprado', priceCents: 60000, currency: 'ZAR', confirmed: false })
    expect(log.needsConfirmation).toEqual(expect.arrayContaining(['volume', 'notas', 'duracao']))
  })
})

describe('applyUniverseSeed', () => {
  it('adds everything to an older database (no collections yet), then is a no-op', () => {
    const old = migrate({ ...emptyDB(), universeItems: undefined, scentLogs: undefined })
    const once = applyUniverseSeed(old)
    expect(once.universeItems.length).toBe(universeSeedPayloads().items.length)
    expect(once.scentLogs).toHaveLength(1)
    expect(applyUniverseSeed(once)).toBe(once)
  })

  it('never overwrites her edits nor her profile, never brings back what she deleted', () => {
    const base = applyUniverseSeed(migrate(emptyDB()))
    const libre = universeSeedId('ysl-libre-intense')
    const edited: DB = {
      ...base,
      profile: { ...base.profile, scentProfile: { ...base.profile.scentProfile!, familiesLiked: ['só floral'] }, removedSeedIds: [universeSeedId('vs-bare')] },
      universeItems: base.universeItems.filter((i) => i.id !== universeSeedId('vs-bare')).map((i) => (i.id === libre ? { ...i, opinion: 'amei' as const, favorite: true } : i)),
    }
    const again = applyUniverseSeed(edited)
    expect(again).toBe(edited)
    expect(again.universeItems.find((i) => i.id === libre)).toMatchObject({ opinion: 'amei', favorite: true })
    expect(again.universeItems.some((i) => i.id === universeSeedId('vs-bare'))).toBe(false)
    expect(again.profile.scentProfile!.familiesLiked).toEqual(['só floral'])
  })

  it('through the store: a deleted seed item stays deleted after a restart', async () => {
    const storage = createMemoryAdapter()
    await hydrate(storage)
    const id = universeSeedId('dior-escale-a-portofino')
    expect(getDB().universeItems.some((i) => i.id === id)).toBe(true)
    actions.remove('universeItems', id)
    actions.update('universeItems', universeSeedId('natura-una-blush'), { opinion: 'gostei' })
    await flushNow()
    await hydrate(storage)
    expect(getDB().universeItems.some((i) => i.id === id)).toBe(false)
    expect(getDB().universeItems.find((i) => i.id === universeSeedId('natura-una-blush'))!.opinion).toBe('gostei')
  })
})

describe('owning ≠ liking ≠ wanting', () => {
  it('a loved wish never enters the collection; an owned item never enters the wishlist', () => {
    const db = buildSeed(TODAY)
    const vs = item(db, 'vs-bare-magnolia')
    const loved: DB = { ...db, universeItems: db.universeItems.map((i) => (i.id === vs.id ? { ...i, opinion: 'amei' as const, favorite: true } : i)) }
    expect(collection(loved).some((i) => i.id === vs.id)).toBe(false)
    const wishIds = wishlist(loved).flatMap((g) => g.items.map((i) => i.id))
    expect(wishIds).toContain(vs.id)
    for (const i of collection(loved)) expect(wishIds).not.toContain(i.id)
  })

  it('the recommender only ever picks owned perfumes, for every combination of inputs', () => {
    const db = buildSeed(TODAY)
    // Make every wish as attractive as possible: loved, favorite, all occasions.
    const tempting: DB = {
      ...db,
      universeItems: db.universeItems.map((i) =>
        i.wishGroup ? { ...i, opinion: 'amei' as const, favorite: true, occasions: ['noite', 'dia', 'frio', 'calor', 'trabalho', 'encontro', 'lazer', 'praia', 'viagem', 'social', 'cotidiano'] } : i,
      ),
    }
    const temps: (TempBand | undefined)[] = [undefined, 'frio', 'ameno', 'calor']
    const times: (TimeOfDay | undefined)[] = [undefined, 'dia', 'noite']
    const occs: (WearOccasion | undefined)[] = [undefined, 'trabalho', 'encontro', 'lazer', 'social', 'praia', 'viagem', 'cotidiano']
    const settings: (Setting | undefined)[] = [undefined, 'aberto', 'fechado']
    const intensities: (Intensity | undefined)[] = [undefined, 'suave', 'media', 'marcante']
    for (const temp of temps)
      for (const time of times)
        for (const occasion of occs)
          for (const setting of settings)
            for (const intensity of intensities) {
              const pick = recommend(tempting, { temp, time, occasion, setting, intensity })
              for (const it of [pick.main?.item, pick.fresher, pick.sensual, pick.companion?.item].filter(Boolean) as UniverseItem[]) expect(isOwned(it)).toBe(true)
              expect(pick.main?.item.category).toBe('perfume')
            }
  })

  it('explains itself with her data: hot beach day → Escale à Portofino', () => {
    const db = buildSeed(TODAY)
    const pick = recommend(db, { temp: 'calor', occasion: 'praia', time: 'dia', setting: 'aberto' })
    expect(pick.main!.item.name).toBe('Escale à Portofino')
    expect(pick.main!.reasons.join(' ')).toMatch(/praia/)
    const work = recommend(db, { occasion: 'trabalho', time: 'dia', setting: 'fechado' })
    expect(work.main!.item.occasions).toContain('trabalho')
    expect(work.application).toMatch(/leve/)
  })

  it('a diary entry sets the opinion only when empty and ownership only on explicit possession', () => {
    const db = buildSeed(TODAY)
    const wish = item(db, 'vs-bare')
    expect(patchFromLog(wish, { verdict: 'amei', status: 'testado' })).toEqual({ opinion: 'amei', ownership: 'testado' })
    expect(patchFromLog(wish, { verdict: 'amei' })).toEqual({ opinion: 'amei' })
    expect(patchFromLog(wish, { status: 'comprado' })).toEqual({ ownership: 'tenho' })
    const owned = { ...item(db, 'ysl-libre-intense'), opinion: 'gostei' as const }
    expect(patchFromLog(owned, { verdict: 'nao_gostei', status: 'testado' })).toEqual({})
  })
})

describe('DNA and comparator (real counts, stated as such)', () => {
  it('counts families and notes from owned and rated items, integers only', () => {
    const db = buildSeed(TODAY)
    const dna = scentDNA(db)
    const floral = dna.families.find((f) => f.label === 'floral')!
    expect(floral.owned).toBeGreaterThan(5)
    expect(Number.isInteger(floral.owned)).toBe(true)
    const flor = dna.notes.find((n) => n.label === 'flor de laranjeira')!
    expect(flor.owned).toBe(2)
    // Yardley is loved but has no families/notes yet: it doesn't invent any.
    expect(dna.lovedCount).toBe(1)
    expect(dna.notes.every((n) => n.loved === 0)).toBe(true)
  })

  it('similarity = shared notes / family words; price per ml only with price and size', () => {
    const db = buildSeed(TODAY)
    const c = compare(item(db, 'ysl-libre-intense'), item(db, 'dior-escale-a-portofino'))
    expect(c.sharedNotes).toEqual(['flor de laranjeira'])
    expect(c.sharedOccasions).toEqual(['lazer'])
    expect(pricePerMl({ priceCents: 60000 })).toBeUndefined()
    expect(pricePerMl({ priceCents: 60000, sizeMl: 100 })).toBe(600)
    const close = closestOwned(db, item(db, 'prada-paradoxe-edp'))!
    expect(close.item.name).toBe('Libre Intense')
    expect(close.shared).toContain('âmbar')
  })
})

describe('backup and sync', () => {
  it('backup round-trip keeps the collection and the diary', () => {
    const db = buildSeed(TODAY)
    const parsed = parseBackupText(JSON.stringify(makeBackup(db)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.db.universeItems).toEqual(db.universeItems)
    expect(parsed.db.scentLogs).toEqual(db.scentLogs)
    expect(parsed.db.profile.scentProfile).toEqual(db.profile.scentProfile)
    expect(parsed.counts.map((c) => c.key)).toEqual(expect.arrayContaining(['universeItems', 'scentLogs']))
  })

  it('sync includes them (they are not private writing)', () => {
    const keys = syncCollections(buildSeed(TODAY))
    expect(keys).toContain('universeItems')
    expect(keys).toContain('scentLogs')
  })
})
