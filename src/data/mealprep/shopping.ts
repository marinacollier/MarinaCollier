/**
 * Consolidated shopping list for the week, with REALISTIC purchase quantities (raw weight via the
 * cooking yields in ./catalog, rounded to package-like units), minus what's already at home.
 */
import type { DateKey, DB, MealPrepPlan } from '@/data/types'
import { normalize } from '@/lib/text'
import { buyKeyOf, SHOP_CATEGORY_EMOJI, SHOP_CATEGORY_LABEL, SHOP_CATEGORY_ORDER, type Ingredient, type ShopCategory } from './catalog'
import { formatWeight } from './parse'
import { planFor, weekMenu, type WeekMenu } from './menu'
import { pantryNames, preparedStock, type PreparedStock } from './pantry'

export interface ShoppingLine {
  /** 'shop:<buyKey>' — MealPrepPlan.checked key. */
  key: string
  buyKey: string
  label: string
  category: ShopCategory
  /** What to put in the cart ("aproximadamente 1,2–1,4 kg", "1 dúzia", "2 pacotes de 500 g"). */
  buy: string
  /** How it was computed ("~900 g pronto na semana · cru rende 70–75%"). */
  detail?: string
  approx: boolean
  /** Ready/plan total for the week. */
  total: number
  unit: 'g' | 'ml'
  servings: number
  /** Value to store in MealPrepPlan.pantry when she says she has it. */
  pantryName: string
  inPantry: boolean
  /** Prepared food at home that covers part (or all) of this line ("6 porções de frango grelhado prontas"). */
  prepared?: string
}

export interface ShoppingGroup {
  category: ShopCategory
  label: string
  emoji: string
  lines: ShoppingLine[]
}

export interface ShoppingList {
  weekStart: DateKey
  groups: ShoppingGroup[]
  /** Already at home (subtracted from the list). */
  atHome: ShoppingLine[]
  count: number
}

interface Acc {
  ing: Ingredient
  total: number
  unit: 'g' | 'ml'
  servings: number
  freeMeals: number
  prepared?: string
  coveredAll?: boolean
}

const BUFFER = 1.05
const kg = (g: number) => String(Math.round(g / 100) / 10).replace('.', ',')

/** Weight range text, rounded like a counter/butcher would: 0,1 kg steps (50 g below 1 kg). */
export function weightRange(min: number, max: number, unit: 'g' | 'ml' = 'g'): string {
  if (max >= 1000) {
    const lo = Math.max(100, Math.floor(min / 100) * 100)
    const hi = Math.ceil(max / 100) * 100
    const big = unit === 'g' ? 'kg' : 'L'
    return lo === hi ? `aproximadamente ${kg(lo)} ${big}` : `aproximadamente ${kg(lo)}–${kg(hi)} ${big}`
  }
  const lo = Math.max(50, Math.floor(min / 50) * 50)
  const hi = Math.max(50, Math.ceil(max / 50) * 50)
  return lo === hi ? `aproximadamente ${lo} ${unit}` : `aproximadamente ${lo}–${hi} ${unit}`
}

export function dozens(n: number): string {
  if (n <= 6) return 'meia dúzia'
  if (n <= 12) return '1 dúzia'
  const d = Math.ceil(n / 12)
  if (d * 12 - n >= 6) return `${d - 1} ${d - 1 === 1 ? 'dúzia' : 'dúzias'} e meia`
  return `${d} dúzias`
}

const pct = (y: [number, number]) => `${Math.round(y[0] * 100)}–${Math.round(y[1] * 100)}%`

/** Purchase text for an ingredient used `total` g/ml (ready) in the week. Exported for tests/Lumos. */
export function purchaseFor(ing: Ingredient, total: number, unit: 'g' | 'ml', freeMeals = 0): { buy: string; detail?: string; approx: boolean } {
  const y = ing.yield
  const rawMin = y ? total / y[1] : total
  const rawMax = y ? (total / y[0]) * BUFFER : total
  const readyNote = y
    ? y[0] < 1
      ? `~${formatWeight(total)} pronto na semana · cru rende ${pct(y)}`
      : `~${formatWeight(total)} pronto na semana · cozido rende ${String(y[0]).replace('.', ',')}–${String(y[1]).replace('.', ',')}× o cru`
    : total
      ? `${formatWeight(total, unit)} na semana`
      : undefined
  const p = ing.pack
  switch (p.kind) {
    case 'weight':
      return { buy: weightRange(rawMin, rawMax, unit), detail: readyNote, approx: true }
    case 'package': {
      const n = Math.max(1, Math.ceil(rawMax / p.size))
      const use = y ? `usa ${weightRange(rawMin, rawMax, p.unit).replace('aproximadamente ', '~')} cru` : `usa ~${formatWeight(total, unit)}`
      const spare = rawMax < p.size * n * 0.5 ? ' · sobra pra próxima semana' : ''
      return { buy: n > 1 ? `${n} ${plural(p.label)}` : `1 ${p.label}`, detail: `${use}${spare}${y ? ` (${readyNote})` : ''}`, approx: !!y }
    }
    case 'units': {
      const n = Math.max(1, Math.ceil(total / p.per - 0.05))
      if (p.dozen) return { buy: dozens(n), detail: `usa ${n} ${n === 1 ? p.one : p.many} (${formatWeight(total)})`, approx: false }
      const juice = p.perUnit === 'ml'
      if (p.packOf) {
        const packs = Math.ceil(n / p.packOf)
        return { buy: `${packs} ${p.packLabel ?? 'pacote'}`, detail: `usa ${n} ${n === 1 ? p.one : p.many} na semana`, approx: false }
      }
      return {
        buy: `${n} ${n === 1 ? p.one : p.many}`,
        detail: juice ? `${formatWeight(total, 'ml')} de suco na semana · ~${Math.max(1, Math.round(240 / p.per))} por copo · aproximado` : readyNote,
        approx: juice,
      }
    }
    case 'bunch': {
      const n = Math.max(1, Math.ceil(freeMeals / p.perMeals))
      return { buy: n === 1 ? p.label : `${n}× (${p.label})`, detail: `${freeMeals} ${freeMeals === 1 ? 'refeição' : 'refeições'} com folhas à vontade`, approx: true }
    }
    case 'mix': {
      const share = total / p.parts.length
      const parts = p.parts.map((x) => {
        const n = Math.max(1, Math.ceil(share / x.per - 0.15))
        return `${n} ${n === 1 ? x.one : x.many}`
      })
      return { buy: parts.join(', '), detail: `${formatWeight(total)} de salada de frutas na semana · aproximado`, approx: true }
    }
    case 'staple':
      return { buy: 'confira em casa', detail: total ? `usa ~${formatWeight(total, unit)} na semana` : undefined, approx: false }
  }
}

function plural(label: string): string {
  const [first, ...rest] = label.split(' ')
  const p = first.endsWith('ão') ? first.slice(0, -2) + 'ães' : first.endsWith('l') ? first.slice(0, -1) + 'is' : first + 's'
  return [p, ...rest].join(' ')
}

/** Pantry entries are lowercase names; a line is "em casa" when an entry names it. */
export function inPantry(pantry: string[], line: { label: string; buyKey: string; pantryName: string }): boolean {
  if (!pantry.length) return false
  const label = normalize(line.label)
  return pantry.some((raw) => {
    const p = normalize(raw)
    if (!p) return false
    if (p === line.pantryName || p === line.buyKey) return true
    // Whole-word match on the line label: "ovos" → Ovos; "arroz branco" → Arroz branco (not integral).
    return new RegExp(`(^|[^a-z])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`).test(label)
  })
}

export function shoppingFromMenu(menu: WeekMenu, pantry: string[] = [], prepared: PreparedStock[] = []): ShoppingList {
  const acc = new Map<string, Acc>()
  for (const day of menu.days)
    for (const meal of day.meals)
      for (const it of meal.items) {
        const k = buyKeyOf(it.ingredient)
        const a = acc.get(k) ?? { ing: it.ingredient, total: 0, unit: it.unit ?? 'g', servings: 0, freeMeals: 0 }
        if (it.free) a.freeMeals += 1
        else if (it.amount != null) a.total += it.amount
        a.servings += 1
        if (it.unit) a.unit = it.unit
        acc.set(k, a)
      }

  // Prepared food at home covers servings first (ready grams per portion, or the week's average portion).
  for (const p of prepared) {
    const a = acc.get(p.buyKey)
    if (!a || a.total <= 0 || p.portions <= 0) continue
    const perServing = a.servings ? a.total / a.servings : 0
    const covered = p.grams ? p.portions * p.grams : p.portions * perServing
    a.total = Math.max(0, a.total - covered)
    a.servings = Math.max(0, a.servings - p.portions)
    const label = `${p.portions} ${p.portions === 1 ? 'porção' : 'porções'} de ${p.name} prontas`
    a.prepared = a.prepared ? `${a.prepared} + ${label}` : label
    if (a.total < 1) a.coveredAll = true
  }

  const lines: ShoppingLine[] = [...acc.entries()].map(([buyKey, a]) => {
    const p = purchaseFor(a.ing, a.total, a.unit, a.freeMeals)
    const base = { label: a.ing.buyLabel, buyKey, pantryName: normalize(a.ing.buyLabel.replace(/\s*\(.*$/, '')) }
    return {
      key: `shop:${buyKey}`,
      ...base,
      category: a.ing.category,
      buy: p.buy,
      detail: a.prepared ? `${a.coveredAll ? 'já pronto' : 'descontando'}: ${a.prepared}${p.detail && !a.coveredAll ? ` · ${p.detail}` : ''}` : p.detail,
      approx: p.approx,
      total: Math.round(a.total * 10) / 10,
      unit: a.unit,
      servings: a.servings,
      inPantry: !!a.coveredAll || inPantry(pantry, base),
      ...(a.prepared ? { prepared: a.prepared } : {}),
    }
  })

  const groups = SHOP_CATEGORY_ORDER.map((category) => ({
    category,
    label: SHOP_CATEGORY_LABEL[category],
    emoji: SHOP_CATEGORY_EMOJI[category],
    lines: lines.filter((l) => l.category === category && !l.inPantry).sort((a, b) => b.servings - a.servings || a.label.localeCompare(b.label)),
  })).filter((g) => g.lines.length)

  const atHome = lines.filter((l) => l.inPantry)
  return { weekStart: menu.weekStart, groups, atHome, count: groups.reduce((s, g) => s + g.lines.length, 0) }
}

/** Consolidated list by category, realistic quantities, minus what's at home (plan pantry, db.pantry, prepared food). */
export function shoppingList(db: DB, weekStart: DateKey, plan: MealPrepPlan | undefined = planFor(db, weekStart)): ShoppingList {
  return shoppingFromMenu(weekMenu(db, weekStart, plan), pantryNames(db, plan), preparedStock(db))
}
