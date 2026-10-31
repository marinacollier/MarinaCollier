/**
 * Lugares que conheci: her list applied once (deterministic ids, never over her edits, tombstone-aware), counts
 * derived (a city/region makes its state and country count), "quero conhecer" never counted, trip offers.
 */
import { describe, expect, it } from 'vitest'
import { emptyDB, migrate } from '../defaults'
import { applyPlacesSeed, placeSeedId, placesSeedPayloads } from '../seed/places'
import { isSeedRecordId } from '../seed/ids'
import { applyLifeSeed } from '../seed/migrate'
import { buildSeed } from '../seed'
import { actions, applyModuleSeeds, getDB, useStore } from '../store'
import { COLLECTION_KEYS } from '@/features/settings/backup'
import { syncCollections } from '../sync/engine'
import type { DB, Place } from '../types'
import { brStates, knownUFs, placeCounts, placeOffers, tripDestination } from './model'
import { countryByName, flagOf, isoOfFlag } from './catalog'

const NOW = '2026-10-31T12:00:00.000Z'
const seeded = (): DB => applyPlacesSeed(emptyDB(), NOW)
let n = 0
const place = (over: Partial<Place>): Place => ({ id: over.id ?? `p-${n++}`, createdAt: NOW, updatedAt: NOW, name: 'X', kind: 'cidade', country: 'BR', status: 'visitei', source: 'marina', order: 99, ...over })

describe('seed: her list, once', () => {
  it('deterministic ids marina:place:<slug>, exactly her places, nothing invented', () => {
    const db = seeded()
    const ids = db.places.map((p) => p.id)
    expect(ids).toEqual(placesSeedPayloads().map((p) => p.id))
    expect(ids.every((id) => id.startsWith('marina:place:'))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(db.places.map((p) => p.name).sort()).toEqual(
      [
        'Brasil', 'Panamá', 'África do Sul', 'Cape Town', 'São Paulo', 'São Paulo', 'Bahia', 'Rio de Janeiro', 'Minas Gerais', 'Pernambuco', 'Alagoas', 'Paraíba', 'Tocantins',
        'Salvador', 'Petrolina', 'Fernando de Noronha', 'Brasília', 'Lençóis Maranhenses', 'Chapada dos Veadeiros',
      ].sort(),
    )
    expect(db.places.some((p) => p.firstVisit)).toBe(false)
    expect(db.places.every((p) => p.status !== 'quero_ir' && p.source === 'marina')).toBe(true)
    const by = (slug: string) => db.places.find((p) => p.id === placeSeedId(slug))!
    expect(by('brasil').status).toBe('moro')
    expect(by('estado-sp')).toMatchObject({ kind: 'estado', uf: 'SP', status: 'moro' })
    expect(by('sao-paulo')).toMatchObject({ kind: 'cidade', uf: 'SP', status: 'moro' })
    expect(by('estado-rj')).toMatchObject({ kind: 'estado', uf: 'RJ', notes: 'cidade a confirmar' })
    expect(by('fernando-de-noronha')).toMatchObject({ kind: 'ilha', uf: 'PE' })
    expect(by('brasilia')).toMatchObject({ kind: 'cidade', uf: 'DF' })
    expect(by('africa-do-sul').tripIds).toEqual(['trip-africa-do-sul'])
    expect(by('cape-town')).toMatchObject({ kind: 'cidade', country: 'ZA', status: 'visitei', tripIds: ['trip-africa-do-sul'] })
  })

  it('idempotent: a second run returns the same db object', () => {
    const once = seeded()
    expect(applyPlacesSeed(once, NOW)).toBe(once)
    const boot = applyModuleSeeds(emptyDB(), '2026-10-31')
    expect(applyModuleSeeds(boot, '2026-10-31').places).toBe(boot.places)
  })

  it('never overwrites her edits, never brings back what she deleted (removedSeedIds), never re-adds once received', () => {
    useStore.setState({ db: seeded() })
    actions.update('places', placeSeedId('estado-rj'), { notes: 'cidade também!', firstVisit: '2015' })
    actions.remove('places', placeSeedId('panama'))
    expect(getDB().profile.removedSeedIds).toContain(placeSeedId('panama'))
    const again = applyPlacesSeed(getDB(), NOW)
    expect(again.places.find((p) => p.id === placeSeedId('panama'))).toBeUndefined()
    expect(again.places.find((p) => p.id === placeSeedId('estado-rj'))).toMatchObject({ notes: 'cidade também!', firstVisit: '2015' })
    // Even without the tombstone, a received id is not re-created (applied once).
    const noTomb = { ...getDB(), profile: { ...getDB().profile, removedSeedIds: [] } }
    expect(applyPlacesSeed(noTomb, NOW).places.some((p) => p.id === placeSeedId('panama'))).toBe(false)
    // Undo of the delete lifts the tombstone.
    actions.restore('places', again.places[0])
  })

  it('her ids count as seed records (tombstones) and a life-seed bump never retires them', () => {
    expect(isSeedRecordId(placeSeedId('brasil'))).toBe(true)
    const db = seeded()
    const old = { ...db, profile: { ...db.profile, seedVersion: 1 } }
    const bumped = applyLifeSeed(old, '2026-10-31')
    expect(bumped.places.map((p) => p.id).sort()).toEqual(db.places.map((p) => p.id).sort())
  })

  it('a fresh install and an old DB without the collection both get it; backup and sync carry it', () => {
    const old = migrate({ ...emptyDB(), places: undefined })
    expect(old.places).toEqual([])
    expect(applyModuleSeeds(old, '2026-10-31').places).toHaveLength(placesSeedPayloads().length)
    expect(applyModuleSeeds(buildSeed('2026-10-31'), '2026-10-31').places).toHaveLength(placesSeedPayloads().length)
    expect(COLLECTION_KEYS).toContain('places')
    expect(syncCollections(emptyDB())).toContain('places')
  })
})

describe('derived counts', () => {
  it('her list: 3 countries, 11/27 states (MA via Lençóis, GO via Chapada, DF via Brasília), 8 cities/places', () => {
    const c = placeCounts(seeded().places)
    expect(c).toEqual({ countries: 3, brStates: 11, brStatesTotal: 27, local: 8 })
    expect(knownUFs(seeded().places).sort()).toEqual(['AL', 'BA', 'DF', 'GO', 'MA', 'MG', 'PB', 'PE', 'RJ', 'SP', 'TO'])
    const s = brStates(seeded().places)
    expect(s.get('MA')!.via.map((p) => p.name)).toEqual(['Lençóis Maranhenses'])
    expect(s.get('GO')!.via.map((p) => p.name)).toEqual(['Chapada dos Veadeiros'])
    expect(s.get('DF')!.via.map((p) => p.name)).toEqual(['Brasília'])
    expect(s.get('PE')!.record?.name).toBe('Pernambuco')
    expect(s.get('PE')!.via.map((p) => p.name).sort()).toEqual(['Fernando de Noronha', 'Petrolina'])
    expect(s.get('SP')!.status).toBe('moro')
  })

  it('a city alone makes its state and country count; nothing stored twice', () => {
    const places = [place({ name: 'Ouro Preto', uf: 'MG' }), place({ name: 'Lisboa', country: 'PT' })]
    expect(placeCounts(places)).toMatchObject({ countries: 2, brStates: 1, local: 2 })
  })

  it('quero_ir never counts (place, state or country)', () => {
    const base = seeded().places
    const wishes = [
      place({ name: 'Manaus', uf: 'AM', status: 'quero_ir' }),
      place({ name: 'Japão', kind: 'pais', country: 'JP', status: 'quero_ir' }),
      place({ name: 'Kyoto', country: 'JP', status: 'quero_ir' }),
      place({ name: 'Ceará', kind: 'estado', uf: 'CE', status: 'quero_ir' }),
    ]
    expect(placeCounts([...base, ...wishes])).toEqual(placeCounts(base))
    expect(brStates([...base, ...wishes]).get('AM')!.status).toBe('quero_ir')
    // A state she wants to know but already visited a city in → counts (visitei wins).
    expect(placeCounts([...base, place({ name: 'Fortaleza', uf: 'CE' }), ...wishes]).brStates).toBe(12)
  })
})

describe('catalog', () => {
  it('flags and names', () => {
    expect(flagOf('ZA')).toBe('🇿🇦')
    expect(isoOfFlag('🇧🇷')).toBe('BR')
    expect(countryByName('Panamá')).toBe('PA')
    expect(countryByName('africa do sul')).toBe('ZA')
    expect(countryByName('EUA')).toBe('US')
    expect(countryByName('Argentina')).toBe('AR')
  })
})

describe('trip ended → offered (never auto-added)', () => {
  it('a finished trip whose destination is not among her places is offered; dismissal or a link hides it', () => {
    const db = seeded()
    const recife = { ...buildSeed('2026-10-31').trips.find((t) => t.id === 'trip-recife')!, status: 'concluida' as const }
    expect(tripDestination(recife)).toMatchObject({ name: 'Recife', country: 'BR', uf: 'PE', kind: 'cidade' })
    const withTrip = { ...db, trips: [recife] }
    expect(placeOffers(withTrip, '2026-10-31').map((o) => o.name)).toEqual(['Recife'])
    expect(placeOffers({ ...withTrip, attentionAcks: [{ id: 'a', createdAt: NOW, updatedAt: NOW, key: 'place-offer:trip-recife', how: 'dismissed' }] }, '2026-10-31')).toEqual([])
    expect(placeOffers({ ...withTrip, places: [...db.places, place({ name: 'Recife', uf: 'PE', tripIds: ['trip-recife'] })] }, '2026-10-31')).toEqual([])
  })

  it('South Africa (ongoing on 31/10, Cape Town already linked) is not offered; it would be without Cape Town', () => {
    const db = seeded()
    const africa = buildSeed('2026-10-31').trips.find((t) => t.id === 'trip-africa-do-sul')!
    expect(placeOffers({ ...db, trips: [africa] }, '2026-10-31')).toEqual([])
    expect(placeOffers({ ...db, trips: [africa] }, '2026-11-20')).toEqual([])
    expect(placeOffers({ ...db, places: [], trips: [africa] }, '2026-11-20').map((o) => [o.name, o.country])).toEqual([['Cape Town', 'ZA']])
    expect(placeOffers({ ...db, places: [], trips: [africa] }, '2026-10-31')).toEqual([])
  })
})
