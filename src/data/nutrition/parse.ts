/**
 * "banana com duas fatias de queijo" → structured foods. pt-BR, accent-insensitive, deterministic.
 *
 * Order of trust: Meus alimentos (her own saved products) → reference table (TACO) → category
 * estimate (never silently: it comes back as a choice) → unknown. Numbers are never invented: a
 * product without a label comes back in `needsChoice` ("Qual?" / usar rótulo / estimativa).
 */
import type { DB, FoodItem, ID, LoggedFood, NutrientConfidence, Nutrients } from '@/data/types'
import { normalize } from '@/lib/text'
import { CATEGORY_ESTIMATES, REFERENCE_FOODS, type CategoryEstimate, type FoodRole, type ReferenceFood } from './foods.reference'
import { betterHit, findAlias, roundN, scaleN, type AliasHit } from './nutrients'

export type ParsedSource = 'meus' | 'referencia' | 'estimativa' | 'sem_numeros'

export interface ParsedFood {
  /** The words she typed for this item. */
  phrase: string
  name: string
  emoji?: string
  qty: number
  unitLabel?: string
  grams?: number
  /** Meus alimentos / saved food. */
  foodId?: ID
  /** Reference table key. */
  refKey?: string
  nutrients?: Nutrients
  confidence: NutrientConfidence
  source: ParsedSource
  role?: FoodRole
  /** Product recognized by name but without numbers — offer "usar rótulo". */
  canUseLabel?: boolean
}

export type ChoiceOption =
  | { kind: 'meu'; foodId: ID; label: string }
  | { kind: 'estimativa'; label: string; nutrients: Nutrients }
  | { kind: 'rotulo'; label: string }
  | { kind: 'sem_numeros'; label: string }

/** Something we can't log honestly without her help ("Qual brownie?"). */
export interface FoodChoice {
  phrase: string
  /** What we understood ("Brownie", "Iogurte proteico"). */
  name: string
  /** What she typed, original casing ("YoPRO") — default name when saving to Meus alimentos. */
  typed: string
  emoji?: string
  qty: number
  unitLabel?: string
  role?: FoodRole
  categoryKey?: string
  question: string
  options: ChoiceOption[]
}

export interface ParseResult {
  items: ParsedFood[]
  /** Phrases we didn't recognize at all. */
  unknown: string[]
  needsChoice: FoodChoice[]
}

const FILLER = /^(?:eu\s+)?(?:acabei de\s+|agora\s+|hoje\s+)?(?:comi|tomei|bebi|almocei|jantei|lanchei|belisquei|registra(?:r)?|anota(?:r)?|foi|teve)\b\s*/
const NUMBER_WORDS: Record<string, number> = { um: 1, uma: 1, uns: 1, umas: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, dez: 10, meia: 0.5, meio: 0.5, metade: 0.5 }
const UNIT_RE =
  /^(g|gramas?|ml|fatias?|unidades?|un|colher(?:es)?(?:\s+de\s+(?:sopa|cha|sobremesa|cafe))?|copos?|xicaras?|potes?|pedacos?|scoops?|medidor(?:es)?|doses?|porcao|porcoes|conchas?|bolas?|pratos?|barras?|barrinhas?|saches?|latas?|garrafas?|tigelas?|bifes?|files?)\b\s*/
const UNIT_SINGULAR: Record<string, string> = { gramas: 'g', grama: 'g', un: 'unidade', porcoes: 'porcao', colheres: 'colher', medidores: 'medidor', scoops: 'medidor', scoop: 'medidor', barrinha: 'barra', barrinhas: 'barra', files: 'file' }
const UNIT_LABEL: Record<string, string> = { porcao: 'porção', pedaco: 'pedaço', xicara: 'xícara', sache: 'sachê', file: 'filé' }

function singularUnit(u: string): string {
  const base = u.replace(/\s+de\s+.*$/, '')
  if (UNIT_SINGULAR[base]) return UNIT_SINGULAR[base]
  if (base === 'g' || base === 'ml') return base
  if (base.endsWith('oes')) return base.replace(/oes$/, 'ao')
  if (base.endsWith('res')) return base.replace(/es$/, '')
  return base.replace(/s$/, '')
}

/** Remove "comi", split into item phrases on "com", "e", ",", "+". */
export function splitPhrases(db: DB, text: string): string[] {
  let t = normalize(text).replace(/[.!?]+$/g, '').replace(FILLER, '')
  // Protect multi-word names she saved that contain a separator ("pao com manteiga da padaria").
  const protectedAliases = db.foods.flatMap((f) => [normalize(f.name), ...f.aliases]).filter((a) => / (com|e) |,/.test(a))
  for (const a of protectedAliases) t = t.split(a).join(a.replace(/ /g, '\u00a0'))
  return t
    .split(/\s*(?:,|\+|;|\s(?:com|e|mais)\s)\s*/)
    .map((s) => s.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean)
}

interface QtyParse {
  qty: number
  explicit: boolean
  unit?: string
  rest: string
}

export function parseQuantity(phrase: string): QtyParse {
  let s = phrase.trim()
  let qty = 1
  let explicit = false
  let unit: string | undefined
  const gramsAttached = s.match(/^(\d+(?:[.,]\d+)?)\s?(g|ml)\b\s*/)
  if (gramsAttached) {
    qty = Number(gramsAttached[1].replace(',', '.'))
    unit = gramsAttached[2]
    explicit = true
    s = s.slice(gramsAttached[0].length)
  } else {
    const num = s.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*/)
    const word = s.match(/^([a-z]+)\b\s*/)
    if (num) {
      const raw = num[1]
      qty = raw.includes('/') ? Number(raw.split('/')[0]) / Number(raw.split('/')[1]) : Number(raw.replace(',', '.'))
      explicit = true
      s = s.slice(num[0].length)
    } else if (word && NUMBER_WORDS[word[1]] != null) {
      qty = NUMBER_WORDS[word[1]]
      explicit = !['uns', 'umas'].includes(word[1])
      s = s.slice(word[0].length)
    }
    const u = s.match(UNIT_RE)
    if (u) {
      unit = singularUnit(u[1])
      s = s.slice(u[0].length)
    }
  }
  s = s.replace(/^(?:de|do|da|dos|das|o|a|os|as)\s+/, '').trim()
  return { qty, explicit, unit, rest: s }
}

function unitText(unit: string | undefined, qty: number): string | undefined {
  if (!unit) return undefined
  if (unit === 'g' || unit === 'ml') return unit
  const label = UNIT_LABEL[unit] ?? unit
  return qty > 1 ? (label.endsWith('ão') ? label.replace(/ão$/, 'ões') : `${label}s`) : label
}

function myFoodHits(db: DB, name: string): AliasHit<FoodItem>[] {
  const foods = db.foods.map((f) => ({ ...f, aliases: [...new Set([normalize(f.name), ...f.aliases.map(normalize)])] }))
  const hits: AliasHit<FoodItem>[] = []
  for (const f of foods) {
    const h = findAlias([f], name, 'contains')
    if (h) hits.push({ ...h, item: db.foods.find((x) => x.id === f.id)! })
  }
  hits.sort((a, b) => (betterHit(a, b) ? -1 : betterHit(b, a) ? 1 : (b.item.mine ? 1 : 0) - (a.item.mine ? 1 : 0) || (b.item.uses ?? 0) - (a.item.uses ?? 0)))
  return hits
}

export function fromMyFood(f: FoodItem, qty: number, unit: string | undefined, phrase: string): ParsedFood {
  let servings = qty
  let grams: number | undefined
  if ((unit === 'g' || unit === 'ml') && (f.serving.grams || f.serving.ml)) {
    const base = (f.serving.grams ?? f.serving.ml)!
    servings = qty / base
    grams = qty
  } else if (f.serving.grams) grams = f.serving.grams * qty
  return {
    phrase,
    name: f.name,
    emoji: f.emoji,
    qty: Math.round(servings * 100) / 100,
    unitLabel: unit === 'g' || unit === 'ml' ? `${qty} ${unit}` : f.serving.label,
    grams,
    foodId: f.id,
    nutrients: f.confidence === 'unknown' ? undefined : roundN(scaleN(f.nutrients, servings)),
    confidence: f.confidence,
    source: 'meus',
  }
}

export function fromReference(ref: ReferenceFood, q: Pick<QtyParse, 'qty' | 'unit'>, phrase: string): ParsedFood {
  let grams: number | undefined
  let fromPlan = false
  let unitLabel: string | undefined
  if (q.unit === 'g' || q.unit === 'ml') {
    grams = q.qty
    fromPlan = true
    unitLabel = q.unit
  } else {
    const u = (q.unit && ref.units?.find((x) => x.unit === q.unit)) || ref.units?.[0]
    if (u) {
      grams = u.grams * q.qty
      fromPlan = !!u.fromPlan && (!q.unit || q.unit === u.unit)
      unitLabel = q.unit && q.unit !== u.unit ? unitText(q.unit, q.qty) : u.label
    } else unitLabel = unitText(q.unit, q.qty)
  }
  const has = !!ref.per100 && grams != null
  return {
    phrase,
    name: ref.name,
    emoji: ref.emoji,
    qty: q.qty,
    unitLabel,
    grams: grams != null ? Math.round(grams * 10) / 10 : undefined,
    refKey: ref.key,
    nutrients: has ? roundN(scaleN(ref.per100!, grams! / 100)) : undefined,
    // Table values × an explicit/plan portion = reference; × a household guess = estimate.
    confidence: has ? (fromPlan ? 'reference' : 'estimated') : 'unknown',
    source: has ? 'referencia' : 'sem_numeros',
    role: ref.role,
    canUseLabel: !has && !ref.negligible,
  }
}

function categoryChoice(cat: CategoryEstimate, q: QtyParse, phrase: string, typed: string): FoodChoice {
  const options: ChoiceOption[] = []
  if (cat.nutrients || cat.packaged) options.push({ kind: 'rotulo', label: 'usar rótulo' })
  if (cat.nutrients) options.push({ kind: 'estimativa', label: `estimativa (~1 ${cat.unitLabel})`, nutrients: cat.nutrients })
  options.push({ kind: 'sem_numeros', label: 'anotar sem números' })
  return {
    phrase,
    name: cat.name,
    typed,
    emoji: cat.emoji,
    qty: q.qty,
    unitLabel: unitText(q.unit, q.qty) ?? cat.unitLabel,
    role: cat.role,
    categoryKey: cat.key,
    question: !cat.nutrients && !cat.packaged
      ? `${typed}: anoto sem números? (não dá pra ter precisão aqui)`
      : cat.packaged && normalize(typed) === normalize(cat.name)
        ? `Qual ${typed.toLowerCase()}?`
        : `${typed}: rótulo ou estimativa?`,
    options,
  }
}

/** Recover how she wrote it ("YoPRO") from the normalized phrase; capitalized. */
export function originalCase(text: string, normalized: string): string {
  const flat = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const idx = flat.indexOf(normalized)
  const raw = idx >= 0 && flat.length === text.length ? text.slice(idx, idx + normalized.length) : normalized
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * Parse free text into foods. Never throws, never invents label values.
 * - items: recognized with numbers (or recognized by name, without numbers → `canUseLabel`)
 * - needsChoice: categories/products that need "Qual?" / rótulo / estimativa
 * - unknown: phrases not recognized at all
 */
export function parseFoodText(db: DB, text: string): ParseResult {
  const out: ParseResult = { items: [], unknown: [], needsChoice: [] }
  for (const phrase of splitPhrases(db, text)) {
    const q = parseQuantity(phrase)
    const raw = q.rest || phrase
    if (!raw) continue
    // Plurals ("brownies", "bananas"): try the singular when the phrase isn't known as written.
    const singular = raw
      .split(' ')
      .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
      .join(' ')
    const known = (n: string) => myFoodHits(db, n).length > 0 || !!findAlias(REFERENCE_FOODS, n, 'contains') || !!findAlias(CATEGORY_ESTIMATES, n, 'contains')
    const name = known(raw) || !known(singular) ? raw : singular

    const mine = myFoodHits(db, name)
    if (mine.length) {
      const top = mine.filter((h) => h.index === mine[0].index && h.alias.length === mine[0].alias.length)
      if (top.length > 1) {
        out.needsChoice.push({
          phrase,
          name: originalCase(text, name),
          typed: originalCase(text, name),
          qty: q.qty,
          unitLabel: unitText(q.unit, q.qty),
          question: 'Qual deles?',
          options: top.map((h) => ({ kind: 'meu' as const, foodId: h.item.id, label: h.item.name })),
        })
      } else out.items.push(fromMyFood(top[0].item, q.qty, q.unit, phrase))
      continue
    }

    const ref = findAlias(REFERENCE_FOODS, name, 'contains')
    const cat = findAlias(CATEGORY_ESTIMATES, name, 'contains')
    if (cat && betterHit(cat, ref)) {
      out.needsChoice.push(categoryChoice(cat.item, q, phrase, originalCase(text, name)))
      continue
    }
    if (ref) {
      out.items.push(fromReference(ref.item, q, phrase))
      continue
    }
    out.unknown.push(phrase)
  }
  return out
}

/** Turn her answer to a choice into a food. `label` = numbers typed from the package (per unit). */
export function resolveChoice(db: DB, choice: FoodChoice, option: ChoiceOption, label?: Nutrients): ParsedFood {
  const base = { phrase: choice.phrase, name: choice.typed || choice.name, emoji: choice.emoji, qty: choice.qty, unitLabel: choice.unitLabel, role: choice.role }
  if (option.kind === 'meu') {
    const f = db.foods.find((x) => x.id === option.foodId)
    if (f) return fromMyFood(f, choice.qty, undefined, choice.phrase)
  }
  if (option.kind === 'estimativa') return { ...base, nutrients: roundN(scaleN(option.nutrients, choice.qty)), confidence: 'estimated', source: 'estimativa' }
  if (option.kind === 'rotulo' && label) return { ...base, nutrients: roundN(scaleN(label, choice.qty)), confidence: 'label', source: 'meus' }
  return { ...base, confidence: 'unknown', source: 'sem_numeros', canUseLabel: true }
}

/** An unrecognized phrase logged as-is (no numbers). */
export function unknownFood(phrase: string): ParsedFood {
  const name = parseQuantity(phrase).rest || phrase
  return { phrase, name: name.charAt(0).toUpperCase() + name.slice(1), qty: 1, confidence: 'unknown', source: 'sem_numeros', canUseLabel: true }
}

export function toLoggedFood(p: ParsedFood): LoggedFood {
  return {
    name: p.name,
    qty: p.qty,
    ...(p.unitLabel ? { unitLabel: p.unitLabel } : {}),
    ...(p.grams != null ? { grams: p.grams } : {}),
    ...(p.foodId ? { foodId: p.foodId } : {}),
    ...(p.nutrients ? { nutrients: p.nutrients } : {}),
    confidence: p.nutrients ? p.confidence : 'unknown',
  }
}

/** Short description for a Meal: "YoPRO + banana". */
export function describeFoods(list: { name: string; qty?: number; unitLabel?: string }[]): string {
  return list
    .map((f) => {
      const q = f.qty && f.qty !== 1 ? `${formatQty(f.qty)} ` : ''
      return `${q}${f.name}`
    })
    .join(' + ')
}

export function formatQty(q: number): string {
  if (q === 0.5) return '½'
  return Number.isInteger(q) ? String(q) : String(Math.round(q * 10) / 10).replace('.', ',')
}
