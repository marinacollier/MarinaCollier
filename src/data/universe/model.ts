/**
 * Meu Universo — pure rules (no React, no store). Shared by the page and by Lumos.
 *
 * Invariants
 * - Owning ≠ liking ≠ wanting: `ownership` and `opinion` are separate; only OWNED items are "hers".
 * - "O que uso hoje" picks only owned items, and explains itself with her own data (occasions, families vs her
 *   profile, ratings). No weather, performance or notes are invented.
 * - "Semelhança" in the comparator is literally shared notes / shared family words — said as such.
 */
import type { DB, ScentLog, ScentProfile, UniverseCategory, UniverseItem, UniverseOccasion, UniverseOpinion, UniverseOwnership } from '../types'
import { normalize } from '@/lib/text'

// ─── Labels ─────────────────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<UniverseCategory, string> = {
  perfume: 'Perfume',
  body_splash: 'Body splash',
  hidratante: 'Hidratante perfumado',
  oleo_corporal: 'Óleo corporal',
  fragrancia: 'Fragrância (tipo a confirmar)',
  maquiagem: 'Maquiagem',
  skincare: 'Skincare',
  cabelo: 'Cabelo',
  roupa: 'Roupa',
  acessorio: 'Acessório',
  marca: 'Marca',
  lugar: 'Lugar',
  cafe: 'Café',
  restaurante: 'Restaurante',
  equipamento: 'Equipamento',
  outro: 'Outro',
}

export const OWNERSHIP_LABEL: Record<UniverseOwnership, string> = {
  tenho: 'Tenho',
  em_uso: 'Em uso',
  comprado: 'Comprado',
  acabou: 'Acabou',
  nao_recomprar: 'Não recomprar',
  testado: 'Testei',
  quero_testar: 'Quero testar',
  desejo: 'Desejo comprar',
}

export const OPINION_LABEL: Record<UniverseOpinion, string> = {
  amei: 'Amei',
  gostei: 'Gostei',
  indiferente: 'Indiferente',
  nao_gostei: 'Não gostei',
}

export const OCCASION_LABEL: Record<UniverseOccasion, string> = {
  dia: 'Dia',
  noite: 'Noite',
  frio: 'Frio',
  calor: 'Calor',
  trabalho: 'Trabalho',
  reuniao: 'Reuniões',
  cotidiano: 'Cotidiano',
  encontro: 'Encontros',
  romance: 'Romance',
  lazer: 'Lazer',
  praia: 'Praia',
  viagem: 'Viagem',
  social: 'Social',
  elegante: 'Elegante',
}

export const CONFIRM_LABEL: Record<string, string> = {
  versao: 'versão',
  categoria: 'tipo (perfume, splash, hidratante…)',
  marca: 'marca',
  notas: 'notas',
  volume: 'volume',
  duracao: 'duração na pele',
  data: 'data exata',
}

export const NOTES_SOURCE_LABEL = { documentado: 'notas do produto', impressao: 'minha impressão', a_confirmar: 'notas a confirmar' } as const

/** Shelves (filters) of the page. Fragrâncias is the default. */
export const SHELVES: { key: string; label: string; categories: UniverseCategory[] }[] = [
  { key: 'fragrancias', label: 'Fragrâncias', categories: ['perfume', 'body_splash', 'hidratante', 'oleo_corporal', 'fragrancia'] },
  { key: 'maquiagem', label: 'Maquiagem', categories: ['maquiagem'] },
  { key: 'skincare', label: 'Skincare', categories: ['skincare'] },
  { key: 'cabelo', label: 'Cabelo', categories: ['cabelo'] },
  { key: 'roupas', label: 'Roupas e acessórios', categories: ['roupa', 'acessorio'] },
  { key: 'lugares', label: 'Lugares', categories: ['lugar', 'cafe', 'restaurante'] },
  { key: 'outros', label: 'Marcas, equipamentos e outros', categories: ['marca', 'equipamento', 'outro'] },
]

export const FRAGRANCE_CATEGORIES: ReadonlySet<UniverseCategory> = new Set(SHELVES[0].categories)

// ─── Ownership ──────────────────────────────────────────────────────────────

const OWNED: ReadonlySet<UniverseOwnership> = new Set(['tenho', 'em_uso', 'comprado'])
const WISHED: ReadonlySet<UniverseOwnership> = new Set(['quero_testar', 'desejo'])

export const isOwned = (i: Pick<UniverseItem, 'ownership'>) => OWNED.has(i.ownership)
export const isWished = (i: Pick<UniverseItem, 'ownership'>) => WISHED.has(i.ownership)

export const itemTitle = (i: Pick<UniverseItem, 'brand' | 'name' | 'version'>) => [i.brand, i.name, i.version].filter(Boolean).join(' ')

const byOrder = (a: UniverseItem, b: UniverseItem) => a.order - b.order

/** Her collection (owned only), optionally limited to some categories. */
export function collection(db: DB, categories?: Iterable<UniverseCategory>): UniverseItem[] {
  const set = categories ? new Set(categories) : undefined
  return (db.universeItems ?? []).filter((i) => isOwned(i) && (!set || set.has(i.category))).sort(byOrder)
}

/** Things she tried, finished or decided not to rebuy (not hers now, not wished). */
export function history(db: DB, categories?: Iterable<UniverseCategory>): UniverseItem[] {
  const set = categories ? new Set(categories) : undefined
  return (db.universeItems ?? []).filter((i) => !isOwned(i) && !isWished(i) && (!set || set.has(i.category))).sort(byOrder)
}

export interface WishGroup {
  label: string
  items: UniverseItem[]
}

/** Wishlist in priority order, grouped. Never contains an owned item. */
export function wishlist(db: DB, categories?: Iterable<UniverseCategory>): WishGroup[] {
  const set = categories ? new Set(categories) : undefined
  const items = (db.universeItems ?? []).filter((i) => isWished(i) && (!set || set.has(i.category)))
  const groups = new Map<string, UniverseItem[]>()
  for (const i of items) {
    const g = i.wishGroup || 'Meus desejos'
    groups.set(g, [...(groups.get(g) ?? []), i])
  }
  const firstOrder = (list: UniverseItem[]) => Math.min(...list.map((i) => i.order))
  return [...groups.entries()]
    .map(([label, list]) => ({ label, items: list.sort((a, b) => (a.wishPriority ?? 999) - (b.wishPriority ?? 999) || a.order - b.order) }))
    .sort((a, b) => firstOrder(a.items) - firstOrder(b.items))
}

/** New wishPriority values after moving one item up/down inside its group. */
export function moveInWishGroup(group: UniverseItem[], id: string, dir: -1 | 1): { id: string; wishPriority: number }[] {
  const list = [...group]
  const i = list.findIndex((x) => x.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return []
  ;[list[i], list[j]] = [list[j], list[i]]
  return list.map((x, k) => ({ id: x.id, wishPriority: k + 1 })).filter((p) => group.find((g) => g.id === p.id)?.wishPriority !== p.wishPriority)
}

// ─── Facets (family words) ──────────────────────────────────────────────────

/** Family words counted in the DNA (accent-insensitive stem → label). */
const FACETS: [RegExp, string][] = [
  [/\bflora(l|is)\b|\bflores\b/, 'floral'],
  [/\bambar|\bambarado/, 'âmbar'],
  [/\bamadeirad|\bmadeira/, 'amadeirado'],
  [/\bcitric/, 'cítrico'],
  [/\bfrutad/, 'frutado'],
  [/\bgourmand/, 'gourmand'],
  [/\bverde\b/, 'verde'],
  [/\bherbal/, 'herbal'],
  [/\baromatic/, 'aromático'],
  [/\balmiscarad|\bmusk/, 'almiscarado'],
  [/\bcremos/, 'cremoso'],
  [/\btropical/, 'tropical'],
  [/\bresinos/, 'resinoso'],
  [/\bterros/, 'terroso'],
  [/\bdoce\b|\badocicad/, 'doce'],
  [/\bfresc/, 'fresco'],
]

export function facetsOfText(text: string): string[] {
  const n = normalize(text)
  return FACETS.filter(([re]) => re.test(n)).map(([, label]) => label)
}

/** Family words of an item (from its families + description, never from guesses). */
export function facetsOf(i: Pick<UniverseItem, 'families' | 'description'>): string[] {
  return [...new Set(facetsOfText([...(i.families ?? []), i.description ?? ''].join(' · ')))]
}

const WARM = new Set(['âmbar', 'gourmand', 'amadeirado', 'cremoso', 'resinoso', 'doce', 'almiscarado'])
const FRESH = new Set(['cítrico', 'verde', 'aromático', 'fresco', 'herbal', 'frutado', 'tropical'])

/** Warm − fresh family words: > 0 leans sensual/enveloping, < 0 leans fresh. From her own descriptions only. */
export function warmth(i: UniverseItem): number {
  const f = facetsOf(i)
  const text = normalize([i.description ?? '', ...(i.families ?? [])].join(' '))
  const intense = /\b(intens|envolvente|marcante|sensual)/.test(text) ? 1 : 0
  return f.filter((x) => WARM.has(x)).length + intense - f.filter((x) => FRESH.has(x)).length
}

const normNote = (s: string) => normalize(s).trim()

// ─── Olfactory DNA (real counts) ────────────────────────────────────────────

export interface CountRow {
  label: string
  /** How many owned items carry it. */
  owned: number
  /** How many items/diary entries she rated amei/gostei carry it. */
  loved: number
}

const LOVED: ReadonlySet<UniverseOpinion> = new Set(['amei', 'gostei'])

function lovedItems(db: DB): UniverseItem[] {
  const items = db.universeItems ?? []
  const ids = new Set(items.filter((i) => i.opinion && LOVED.has(i.opinion)).map((i) => i.id))
  for (const l of db.scentLogs ?? []) if (l.verdict && LOVED.has(l.verdict)) ids.add(l.itemId)
  return items.filter((i) => ids.has(i.id))
}

/** Family words and notes counted from her owned fragrances and from what she rated well. No percentages. */
export function scentDNA(db: DB): { families: CountRow[]; notes: CountRow[]; ownedCount: number; lovedCount: number } {
  const owned = collection(db, FRAGRANCE_CATEGORIES)
  const loved = lovedItems(db).filter((i) => FRAGRANCE_CATEGORIES.has(i.category))
  const fam = new Map<string, CountRow>()
  const notes = new Map<string, CountRow>()
  const bump = (map: Map<string, CountRow>, label: string, key: 'owned' | 'loved') => {
    const k = normNote(label)
    const row = map.get(k) ?? { label, owned: 0, loved: 0 }
    row[key]++
    map.set(k, row)
  }
  for (const i of owned) {
    for (const f of facetsOf(i)) bump(fam, f, 'owned')
    for (const n of i.notes ?? []) bump(notes, n, 'owned')
  }
  for (const i of loved) {
    for (const f of facetsOf(i)) bump(fam, f, 'loved')
    for (const n of i.notes ?? []) bump(notes, n, 'loved')
  }
  const sort = (a: CountRow, b: CountRow) => b.loved + b.owned - (a.loved + a.owned) || a.label.localeCompare(b.label)
  return { families: [...fam.values()].sort(sort), notes: [...notes.values()].sort(sort), ownedCount: owned.length, lovedCount: loved.length }
}

/** Does an item's family words touch a profile family ("floral âmbar" ↔ item "floral âmbar")? Exact family text first, then shared words. */
function profileFamilyHit(i: UniverseItem, families: string[]): string | undefined {
  const mine = (i.families ?? []).map(normNote)
  const exact = families.find((f) => mine.includes(normNote(f)))
  if (exact) return exact
  const itemFacets = new Set(facetsOf(i))
  if (itemFacets.size < 2) return undefined
  return families.find((f) => {
    const ff = facetsOfText(f)
    return ff.length >= 2 && ff.every((x) => itemFacets.has(x))
  })
}

function profileNotesHit(i: UniverseItem, notes: string[]): string[] {
  const mine = (i.notes ?? []).map(normNote)
  return notes.filter((p) => {
    const pn = normNote(p)
    return mine.some((m) => m === pn || m.includes(pn) || pn.includes(m))
  })
}

// ─── "O que uso hoje" ───────────────────────────────────────────────────────

export type TempBand = 'frio' | 'ameno' | 'calor'
export type TimeOfDay = 'dia' | 'noite'
export type Setting = 'aberto' | 'fechado'
export type Intensity = 'suave' | 'media' | 'marcante'
export type WearOccasion = 'trabalho' | 'encontro' | 'lazer' | 'social' | 'praia' | 'viagem' | 'cotidiano'

export interface WearInput {
  temp?: TempBand
  occasion?: WearOccasion
  time?: TimeOfDay
  setting?: Setting
  intensity?: Intensity
}

export const WEAR_OCCASION_LABEL: Record<WearOccasion, string> = {
  trabalho: 'Trabalho',
  encontro: 'Encontro',
  lazer: 'Lazer',
  social: 'Social',
  praia: 'Praia',
  viagem: 'Viagem',
  cotidiano: 'Cotidiano',
}

/** Occasion tags that answer each wear occasion. */
const OCCASION_MATCH: Record<WearOccasion, UniverseOccasion[]> = {
  trabalho: ['trabalho', 'reuniao'],
  encontro: ['encontro', 'romance'],
  lazer: ['lazer'],
  social: ['social', 'elegante'],
  praia: ['praia'],
  viagem: ['viagem'],
  cotidiano: ['cotidiano', 'dia'],
}

export interface Scored {
  item: UniverseItem
  score: number
  reasons: string[]
}

function avgDiaryScore(logs: ScentLog[], itemId: string): number | undefined {
  const s = logs.filter((l) => l.itemId === itemId && typeof l.score === 'number').map((l) => l.score!)
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : undefined
}

function scoreItem(i: UniverseItem, input: WearInput, profile: ScentProfile | undefined, logs: ScentLog[]): Scored {
  const occ = new Set(i.occasions ?? [])
  const reasons: string[] = []
  let score = 0
  if (input.occasion) {
    const hit = OCCASION_MATCH[input.occasion].filter((o) => occ.has(o))
    if (hit.length) {
      score += 3
      reasons.push(`você costuma usar em ${hit.map((o) => OCCASION_LABEL[o].toLowerCase()).join(' e ')}`)
    }
  }
  if (input.time) {
    const other = input.time === 'noite' ? 'dia' : 'noite'
    if (occ.has(input.time)) {
      score += 2
      reasons.push(input.time === 'noite' ? 'é um dos seus perfumes de noite' : 'é um dos seus perfumes de dia')
    } else if (occ.has(other)) score -= 1
  }
  if (input.temp === 'frio' || input.temp === 'calor') {
    const other = input.temp === 'frio' ? 'calor' : 'frio'
    if (occ.has(input.temp)) {
      score += 2
      reasons.push(input.temp === 'frio' ? 'você associa ele a dias frios' : 'você associa ele ao calor')
    } else if (occ.has(other)) score -= 2
  }
  const w = warmth(i)
  if (input.intensity === 'marcante' && w > 0) score += 1
  if (input.intensity === 'suave' && w < 0) score += 1
  if (input.intensity === 'suave' && w > 1) score -= 1
  if (input.setting === 'fechado' && input.intensity !== 'marcante' && w > 1) score -= 1
  if (input.setting === 'aberto' && input.temp === 'calor' && w < 0) score += 1
  if (i.opinion === 'amei') {
    score += 2
    reasons.push('você marcou “amei”')
  } else if (i.opinion === 'gostei') {
    score += 1
    reasons.push('você marcou “gostei”')
  } else if (i.opinion === 'indiferente') score -= 1
  if (i.favorite) {
    score += 1
    reasons.push('é um dos seus favoritos')
  }
  const avg = avgDiaryScore(logs, i.id)
  if (avg !== undefined && avg >= 8) {
    score += 1
    reasons.push(`nota ${Math.round(avg * 10) / 10} no seu diário`)
  }
  if (profile) {
    const fam = profileFamilyHit(i, profile.familiesLiked)
    if (fam) {
      score += 1
      reasons.push(`${fam} está entre as famílias que você prefere`)
    } else if (profileFamilyHit(i, profile.familiesLess)) score -= 1
    const notes = profileNotesHit(i, profile.notesOfInterest)
    if (notes.length) reasons.push(`tem ${notes.slice(0, 3).join(', ')}, ${notes.length === 1 ? 'nota' : 'notas'} do seu interesse`)
  }
  return { item: i, score, reasons }
}

export interface WearPick {
  main?: Scored
  /** How much to apply (generic guidance from the intensity/setting she chose — not a product claim). */
  application?: string
  fresher?: UniverseItem
  sensual?: UniverseItem
  /** An owned body splash / hidratante / óleo that shares a family word or note with the main pick. */
  companion?: { item: UniverseItem; why: string }
  /** Owned perfumes considered (0 → nothing to recommend). */
  pool: number
  ranked: Scored[]
}

/** Owned perfumes that can be worn (not finished, not disliked). */
export function wearablePerfumes(db: DB): UniverseItem[] {
  return collection(db, ['perfume']).filter((i) => i.opinion !== 'nao_gostei' && i.remaining !== 'vazio')
}

export function recommend(db: DB, input: WearInput): WearPick {
  const pool = wearablePerfumes(db)
  const logs = db.scentLogs ?? []
  const ranked = pool.map((i) => scoreItem(i, input, db.profile.scentProfile, logs)).sort((a, b) => b.score - a.score || a.item.order - b.item.order)
  const main = ranked[0]
  if (!main) return { pool: 0, ranked }
  const mw = warmth(main.item)
  const rest = ranked.slice(1)
  const fresher = rest.find((r) => warmth(r.item) < mw)?.item
  const sensual = rest.find((r) => warmth(r.item) > mw)?.item
  const application =
    input.setting === 'fechado' || input.occasion === 'trabalho'
      ? 'Aplicação leve: 1 a 2 borrifadas, ambiente fechado pede pouco.'
      : input.intensity === 'marcante'
        ? 'Para mais presença: 3 a 4 borrifadas, pele e pontos de pulsação.'
        : input.intensity === 'suave'
          ? 'Bem de leve: 1 a 2 borrifadas.'
          : '2 a 3 borrifadas costumam bastar.'
  const companion = companionFor(db, main.item)
  return { main, application, fresher, sensual, companion, pool: pool.length, ranked }
}

/** Owned body splash / hidratante / óleo sharing a family word or a note with the item (said why). */
export function companionFor(db: DB, item: UniverseItem): { item: UniverseItem; why: string } | undefined {
  const facets = new Set(facetsOf(item))
  const notes = new Set((item.notes ?? []).map(normNote))
  for (const c of collection(db, ['body_splash', 'hidratante', 'oleo_corporal'])) {
    const sharedNote = (c.notes ?? []).find((n) => notes.has(normNote(n)))
    if (sharedNote) return { item: c, why: `os dois têm ${sharedNote}` }
    const sharedFacet = facetsOf(c).find((f) => facets.has(f))
    if (sharedFacet) return { item: c, why: `os dois são ${sharedFacet}` }
  }
  return undefined
}

/** Owned perfumes whose usual occasions include any of `tags`. */
export function ownedFor(db: DB, tags: UniverseOccasion[]): UniverseItem[] {
  return collection(db, ['perfume']).filter((i) => (i.occasions ?? []).some((o) => tags.includes(o)))
}

// ─── Comparator ─────────────────────────────────────────────────────────────

export interface Comparison {
  sharedNotes: string[]
  sharedFamilies: string[]
  sharedOccasions: UniverseOccasion[]
  /** Price per ml in cents, per item (only when price and size are known). */
  perMl: [number | undefined, number | undefined]
  /** Same currency → comparable. */
  comparablePrice: boolean
}

export const pricePerMl = (i: Pick<UniverseItem, 'priceCents' | 'sizeMl'>): number | undefined =>
  i.priceCents && i.sizeMl && i.sizeMl > 0 ? Math.round(i.priceCents / i.sizeMl) : undefined

export function compare(a: UniverseItem, b: UniverseItem): Comparison {
  const bn = new Map((b.notes ?? []).map((n) => [normNote(n), n]))
  const sharedNotes = (a.notes ?? []).filter((n) => bn.has(normNote(n)))
  const bf = new Set(facetsOf(b))
  const sharedFamilies = facetsOf(a).filter((f) => bf.has(f))
  const bo = new Set(b.occasions ?? [])
  const sharedOccasions = (a.occasions ?? []).filter((o) => bo.has(o))
  return {
    sharedNotes,
    sharedFamilies,
    sharedOccasions,
    perMl: [pricePerMl(a), pricePerMl(b)],
    comparablePrice: !!a.currency && a.currency === b.currency,
  }
}

/** For a wished item: the owned fragrance that shares the most notes/family words (purchase intelligence). */
export function closestOwned(db: DB, item: UniverseItem): { item: UniverseItem; shared: string[] } | undefined {
  let best: { item: UniverseItem; shared: string[] } | undefined
  for (const o of collection(db, FRAGRANCE_CATEGORIES)) {
    if (o.id === item.id) continue
    const c = compare(item, o)
    const shared = [...c.sharedNotes, ...c.sharedFamilies]
    if (shared.length && (!best || shared.length > best.shared.length)) best = { item: o, shared }
  }
  return best
}

// ─── Compras e consumo ──────────────────────────────────────────────────────

export function money(cents: number, currency = 'BRL'): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${currency} ${(cents / 100).toFixed(2).replace('.', ',')}`
  }
}

/** Totals by currency (never converted: no live exchange rate). */
export function spentByCurrency(items: UniverseItem[]): { currency: string; cents: number; count: number }[] {
  const map = new Map<string, { currency: string; cents: number; count: number }>()
  for (const i of items) {
    if (!i.priceCents) continue
    const c = i.currency || 'BRL'
    const row = map.get(c) ?? { currency: c, cents: 0, count: 0 }
    row.cents += i.priceCents
    row.count++
    map.set(c, row)
  }
  return [...map.values()]
}

/** Items with purchase data (price, date, size, remaining or rebuy intention), owned or past. */
export function purchases(db: DB, categories?: Iterable<UniverseCategory>): UniverseItem[] {
  const set = categories ? new Set(categories) : undefined
  return (db.universeItems ?? [])
    .filter((i) => !isWished(i) && i.ownership !== 'testado' && (!set || set.has(i.category)))
    .filter((i) => i.priceCents || i.acquiredOn || i.sizeMl || i.remaining || i.rebuy)
    .sort((a, b) => (b.acquiredOn ?? '').localeCompare(a.acquiredOn ?? '') || a.order - b.order)
}

// ─── Diário → coleção ───────────────────────────────────────────────────────

/**
 * What a diary entry changes in the item: the opinion only when she has none yet; ownership only for explicit
 * possession statuses (comprado / em uso / terminado / não recomprar) or a test of something she only wished.
 */
export function patchFromLog(item: UniverseItem, log: Pick<ScentLog, 'verdict' | 'status'>): Partial<UniverseItem> {
  const patch: Partial<UniverseItem> = {}
  if (log.verdict && !item.opinion) patch.opinion = log.verdict
  const s = log.status
  if (s === 'comprado' && !isOwned(item)) patch.ownership = 'tenho'
  else if (s === 'em_uso' && item.ownership !== 'em_uso') patch.ownership = 'em_uso'
  else if (s === 'terminado' && isOwned(item)) patch.ownership = 'acabou'
  else if (s === 'nao_recomprar') patch.ownership = 'nao_recomprar'
  else if (s === 'testado' && isWished(item)) patch.ownership = 'testado'
  else if ((s === 'wishlist' || s === 'quero_testar') && !isOwned(item) && !isWished(item)) patch.ownership = s === 'wishlist' ? 'desejo' : 'quero_testar'
  return patch
}

export const DIARY_STATUS_LABEL: Record<NonNullable<ScentLog['status']>, string> = {
  quero_testar: 'Quero testar',
  testado: 'Testado',
  wishlist: 'Wishlist',
  comprado: 'Comprado',
  em_uso: 'Em uso',
  terminado: 'Terminado',
  nao_recomprar: 'Não recomprar',
}
