/**
 * Lugares que conheci — everything derived, nothing stored twice.
 *
 * - A place counts as known when its status is 'visitei' or 'moro'. 'quero_ir' never counts.
 * - Visiting a city / region / island / park implies its state (uf) and its country count as visited.
 * - A state or country she knows only through a place inside it says so ("via Lençóis Maranhenses").
 */
import type { DateKey, DB, ID, Place, PlaceKind, PlaceStatus, Trip } from '../types'
import { normalize } from '@/lib/text'
import { BR_UFS, BR_UF_TOTAL, countryByName, countryName, isoOfFlag, isUF, ufByCapital, ufInfo } from './catalog'

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  pais: 'país',
  estado: 'estado',
  cidade: 'cidade',
  regiao: 'região',
  ilha: 'ilha',
  parque: 'parque',
}

export const PLACE_STATUS_LABEL: Record<PlaceStatus, string> = {
  visitei: 'visitei',
  moro: 'moro aqui',
  quero_ir: 'quero conhecer',
}

export const isKnown = (p: Pick<Place, 'status'>): boolean => p.status === 'visitei' || p.status === 'moro'

/** Kinds that are "a place inside" (they make their state and country count). */
export const isLocal = (p: Pick<Place, 'kind'>): boolean => p.kind !== 'pais' && p.kind !== 'estado'

export type AreaStatus = 'moro' | 'visitei' | 'quero_ir'

export interface AreaInfo {
  status: AreaStatus
  /** The record of the state/country itself, when she has one. */
  record?: Place
  /** Places inside that make it count (when there is no own record that counts). */
  via: Place[]
}

function strongest(a: AreaStatus | undefined, b: AreaStatus): AreaStatus {
  const rank: Record<AreaStatus, number> = { quero_ir: 0, visitei: 1, moro: 2 }
  return !a || rank[b] > rank[a] ? b : a
}

/** Every Brazilian UF she has something in → its derived status. */
export function brStates(places: Place[]): Map<string, AreaInfo> {
  const out = new Map<string, AreaInfo>()
  for (const p of places) {
    if (p.country !== 'BR' || !p.uf || !isUF(p.uf)) continue
    const uf = p.uf.toUpperCase()
    const cur = out.get(uf) ?? { status: p.status, via: [] }
    cur.status = strongest(out.has(uf) ? cur.status : undefined, p.status)
    if (p.kind === 'estado') cur.record ??= p
    else if (isKnown(p)) cur.via.push(p)
    out.set(uf, cur)
  }
  return out
}

/** Every country she has something in → its derived status. */
export function countries(places: Place[]): Map<string, AreaInfo> {
  const out = new Map<string, AreaInfo>()
  for (const p of places) {
    const c = p.country?.toUpperCase()
    if (!c) continue
    const cur = out.get(c) ?? { status: p.status, via: [] }
    cur.status = strongest(out.has(c) ? cur.status : undefined, p.status)
    if (p.kind === 'pais') cur.record ??= p
    else if (isKnown(p)) cur.via.push(p)
    out.set(c, cur)
  }
  return out
}

export interface PlaceCounts {
  countries: number
  brStates: number
  brStatesTotal: number
  /** Cities, regions, islands and parks she knows (anywhere). */
  local: number
}

export function placeCounts(places: Place[]): PlaceCounts {
  const known = (m: Map<string, AreaInfo>) => [...m.values()].filter((a) => a.status !== 'quero_ir').length
  return {
    countries: known(countries(places)),
    brStates: known(brStates(places)),
    brStatesTotal: BR_UF_TOTAL,
    local: places.filter((p) => isLocal(p) && isKnown(p)).length,
  }
}

/** UFs she knows (visitei/moro), in tile order. */
export function knownUFs(places: Place[]): string[] {
  const m = brStates(places)
  return BR_UFS.map((u) => u.uf).filter((uf) => m.get(uf) && m.get(uf)!.status !== 'quero_ir')
}

export const byOrder = (a: Place, b: Place) => a.order - b.order || a.name.localeCompare(b.name, 'pt-BR')

export function placeName(p: Place): string {
  return p.kind === 'pais' ? p.name || countryName(p.country) : p.name
}

/** "Salvador · BA", "Cape Town · África do Sul". */
export function placeWhere(p: Place): string | undefined {
  if (p.kind === 'pais') return undefined
  if (p.country === 'BR') return p.kind === 'estado' ? undefined : p.uf ?? undefined
  return countryName(p.country)
}

// ─── Lookups (Lumos + sheet) ───────────────────────────────────────────────

/** Short names she uses. */
const ALIASES: Record<string, string> = {
  rio: 'rio de janeiro',
  sampa: 'sao paulo',
  sp: 'sao paulo',
  rj: 'rio de janeiro',
  noronha: 'fernando de noronha',
  lencois: 'lencois maranhenses',
  chapada: 'chapada dos veadeiros',
  bh: 'belo horizonte',
  floripa: 'florianopolis',
  'cidade do cabo': 'cape town',
  'cabo': 'cape town',
  joburg: 'johannesburg',
  joanesburgo: 'johannesburg',
}

export const placeKey = (s: string): string => {
  const n = normalize(s)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return ALIASES[n] ?? n
}

/** Her records whose name matches (several when e.g. São Paulo is both her state and her city). */
export function findPlaces(places: Place[], name: string): Place[] {
  const k = placeKey(name)
  if (!k) return []
  return places.filter((p) => placeKey(p.name) === k)
}

// ─── Trip → place offers ───────────────────────────────────────────────────

export interface PlaceOffer {
  trip: Trip
  name: string
  country?: string
  uf?: string
  kind: PlaceKind
}

export const placeOfferKey = (tripId: ID) => `place-offer:${tripId}`

/** The trip's main destination: "Cape Town (base) · Johannesburg" → Cape Town; "Recife, PE" → Recife / PE. */
export function tripDestination(trip: Trip): Omit<PlaceOffer, 'trip'> | undefined {
  const raw = (trip.place || trip.name || '').trim()
  if (!raw) return undefined
  const [first, ...rest] = raw.split(/\s*[·(]\s*/)[0].split(/\s*,\s*/)
  const name = first.trim()
  if (!name) return undefined
  const after = rest.join(',').trim()
  const country = isoOfFlag(trip.flag)
  let uf: string | undefined
  if (country === 'BR' || !country) {
    if (after && isUF(after)) uf = after.toUpperCase()
    else uf = ufByCapital(name)?.uf ?? (after ? BR_UFS.find((u) => normalize(u.name) === normalize(after))?.uf : undefined)
  }
  return { name, country: country ?? (uf ? 'BR' : undefined), uf, kind: 'cidade' }
}

export function tripEnded(trip: Trip, today: DateKey): boolean {
  return trip.status === 'concluida' || (!!trip.endDate && trip.endDate < today)
}

/**
 * Trips that are over and whose destination isn't among her places yet (no link, no same name) and that she
 * didn't dismiss. Only OFFERED: nothing is added without her tap.
 */
export function placeOffers(db: Pick<DB, 'trips' | 'places' | 'attentionAcks'>, today: DateKey): PlaceOffer[] {
  const dismissed = new Set(db.attentionAcks.map((a) => a.key))
  const out: PlaceOffer[] = []
  for (const trip of db.trips) {
    if (!tripEnded(trip, today) || trip.status === 'sonhando') continue
    if (dismissed.has(placeOfferKey(trip.id))) continue
    const dest = tripDestination(trip)
    if (!dest) continue
    const linked = db.places.some((p) => p.tripIds?.includes(trip.id) && isKnown(p))
    const named = findPlaces(db.places, dest.name).some(isKnown)
    if (linked || named) continue
    out.push({ trip, ...dest })
  }
  return out
}

// ─── Quero conhecer (her wishes + dream trips, derived) ─────────────────────

export interface Wish {
  key: string
  name: string
  country?: string
  uf?: string
  kind: PlaceKind
  /** Her 'quero_ir' record (editable). */
  place?: Place
  /** A dream / planned trip not traveled yet (read-only here: the trip stays exactly as she made it). */
  trip?: Trip
}

/** A trip she dreams of or plans and hasn't traveled yet (start not reached, not over). */
export function isDreamTrip(trip: Trip, today: DateKey): boolean {
  if (trip.status !== 'sonhando' && trip.status !== 'planejando') return false
  if (tripEnded(trip, today)) return false
  return !trip.startDate || trip.startDate > today
}

/**
 * "Quero conhecer": her 'quero_ir' places + destinations of dream trips, each place once. Nothing is written:
 * a trip whose destination she already has (as a wish, or as a place she knows) doesn't show twice.
 */
export function wishes(db: Pick<DB, 'trips' | 'places'>, today: DateKey): Wish[] {
  const out: Wish[] = db.places
    .filter((p) => p.status === 'quero_ir')
    .sort(byOrder)
    .map((p) => ({ key: p.id, name: p.name, country: p.country, uf: p.uf, kind: p.kind, place: p }))
  const taken = new Set(db.places.filter(isKnown).map((p) => placeKey(p.name)))
  for (const trip of [...db.trips].sort((a, b) => a.order - b.order)) {
    if (!isDreamTrip(trip, today)) continue
    const dest = tripDestination(trip)
    if (!dest) continue
    const k = placeKey(dest.name)
    const same = out.find((w) => w.place?.tripIds?.includes(trip.id) || placeKey(w.name) === k)
    if (same) {
      same.trip ??= trip
      continue
    }
    if (taken.has(k) || db.places.some((p) => isKnown(p) && p.tripIds?.includes(trip.id))) continue
    const asCountry = countryByName(dest.name)
    out.push({ key: `trip:${trip.id}`, name: dest.name, country: dest.country ?? asCountry, uf: dest.uf, kind: asCountry ? 'pais' : dest.kind, trip })
  }
  return out
}

/** UF tile → its display info for the grid. */
export function ufTiles(places: Place[]): { uf: string; name: string; col: number; row: number; status?: AreaStatus }[] {
  const m = brStates(places)
  return BR_UFS.map((u) => ({ uf: u.uf, name: u.name, col: u.col, row: u.row, status: m.get(u.uf)?.status }))
}

export { ufInfo }
