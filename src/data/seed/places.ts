/**
 * Lugares que conheci — exactly the list Marina gave (31/10/2026):
 *   "Fora só Panamá e África do Sul. Brasil já rodei um pouco: Lençóis Maranhenses, Fernando de Noronha, Bahia,
 *    Salvador, Chapada dos Veadeiros, São Paulo, Rio de Janeiro, Minas Gerais, Pernambuco, Alagoas, Paraíba,
 *    Petrolina, Tocantins, Brasília."
 * No dates, no other places. São Paulo is where she lives (state + city 'moro'). Rio de Janeiro is recorded as the
 * state (the city is to be confirmed). South Africa + Cape Town are linked to the South Africa 2026 trip.
 *
 * Applied once per install, additively and idempotently: deterministic ids (`marina:place:<slug>`), each id is added
 * only when it was never received (`profile.seedIds`) and never deleted (`profile.removedSeedIds`). Nothing she
 * edited is ever overwritten. Returns the SAME db when there is nothing to do.
 */
import type { DB, NewItem, Place } from '../types'
import { SEED_IDS } from './ids'
import { nowISO } from '@/lib/id'

export const PLACE_SEED_PREFIX = 'marina:place:'
export const placeSeedId = (slug: string) => `${PLACE_SEED_PREFIX}${slug}`

type Spec = Omit<NewItem<'places'>, 'source' | 'order' | 'id'> & { slug: string }

const BR = placeSeedId('brasil')
const ZA = placeSeedId('africa-do-sul')
const st = (uf: string) => placeSeedId(`estado-${uf.toLowerCase()}`)

const SPECS: Spec[] = [
  // Países
  { slug: 'brasil', name: 'Brasil', kind: 'pais', country: 'BR', status: 'moro' },
  { slug: 'panama', name: 'Panamá', kind: 'pais', country: 'PA', status: 'visitei' },
  { slug: 'africa-do-sul', name: 'África do Sul', kind: 'pais', country: 'ZA', status: 'visitei', tripIds: [SEED_IDS.tripAfrica] },
  { slug: 'cape-town', name: 'Cape Town', kind: 'cidade', country: 'ZA', parentId: ZA, status: 'visitei', tripIds: [SEED_IDS.tripAfrica] },
  // Estados
  { slug: 'estado-sp', name: 'São Paulo', kind: 'estado', country: 'BR', uf: 'SP', parentId: BR, status: 'moro' },
  { slug: 'estado-ba', name: 'Bahia', kind: 'estado', country: 'BR', uf: 'BA', parentId: BR, status: 'visitei' },
  { slug: 'estado-rj', name: 'Rio de Janeiro', kind: 'estado', country: 'BR', uf: 'RJ', parentId: BR, status: 'visitei', notes: 'cidade a confirmar' },
  { slug: 'estado-mg', name: 'Minas Gerais', kind: 'estado', country: 'BR', uf: 'MG', parentId: BR, status: 'visitei' },
  { slug: 'estado-pe', name: 'Pernambuco', kind: 'estado', country: 'BR', uf: 'PE', parentId: BR, status: 'visitei' },
  { slug: 'estado-al', name: 'Alagoas', kind: 'estado', country: 'BR', uf: 'AL', parentId: BR, status: 'visitei' },
  { slug: 'estado-pb', name: 'Paraíba', kind: 'estado', country: 'BR', uf: 'PB', parentId: BR, status: 'visitei' },
  { slug: 'estado-to', name: 'Tocantins', kind: 'estado', country: 'BR', uf: 'TO', parentId: BR, status: 'visitei' },
  // Cidades e lugares
  { slug: 'sao-paulo', name: 'São Paulo', kind: 'cidade', country: 'BR', uf: 'SP', parentId: st('SP'), status: 'moro' },
  { slug: 'salvador', name: 'Salvador', kind: 'cidade', country: 'BR', uf: 'BA', parentId: st('BA'), status: 'visitei' },
  { slug: 'petrolina', name: 'Petrolina', kind: 'cidade', country: 'BR', uf: 'PE', parentId: st('PE'), status: 'visitei' },
  { slug: 'fernando-de-noronha', name: 'Fernando de Noronha', kind: 'ilha', country: 'BR', uf: 'PE', parentId: st('PE'), status: 'visitei' },
  { slug: 'brasilia', name: 'Brasília', kind: 'cidade', country: 'BR', uf: 'DF', parentId: BR, status: 'visitei' },
  { slug: 'lencois-maranhenses', name: 'Lençóis Maranhenses', kind: 'parque', country: 'BR', uf: 'MA', parentId: BR, status: 'visitei' },
  { slug: 'chapada-dos-veadeiros', name: 'Chapada dos Veadeiros', kind: 'regiao', country: 'BR', uf: 'GO', parentId: BR, status: 'visitei' },
]

/** The seed payloads (stable ids, her order). */
export function placesSeedPayloads(): (NewItem<'places'> & { id: string })[] {
  return SPECS.map(({ slug, ...rest }, i) => ({ ...rest, id: placeSeedId(slug), source: 'marina' as const, order: i }))
}

export function applyPlacesSeed(db: DB, now: string = nowISO()): DB {
  const received = new Set(db.profile.seedIds ?? [])
  const removed = new Set(db.profile.removedSeedIds ?? [])
  const places = db.places ?? []
  const have = new Set(places.map((p) => p.id))
  const payloads = placesSeedPayloads()
  const add = payloads.filter((p) => !have.has(p.id) && !received.has(p.id) && !removed.has(p.id))
  const unseen = payloads.filter((p) => !received.has(p.id))
  if (!add.length && !unseen.length) return db
  const base = places.reduce((m, p) => Math.max(m, p.order), -1) + 1
  const created: Place[] = add.map((p) => ({ ...p, order: places.length ? base + p.order : p.order, createdAt: now, updatedAt: now }))
  return {
    ...db,
    places: created.length ? [...places, ...created] : places,
    profile: { ...db.profile, seedIds: [...new Set([...(db.profile.seedIds ?? []), ...unseen.map((p) => p.id)])] },
  }
}
