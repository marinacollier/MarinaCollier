/**
 * Small pure helpers: nutrient math, grams from the plan's quantity text, and matching a food name
 * against the reference table. No store access.
 */
import type { NutrientConfidence, Nutrients, PlannedFood } from '@/data/types'
import { normalize } from '@/lib/text'
import { CATEGORY_ESTIMATES, REFERENCE_FOODS, type CategoryEstimate, type FoodRole, type ReferenceFood } from './foods.reference'

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

export function addN(a: Nutrients, b: Nutrients | undefined): Nutrients {
  if (!b) return a
  const fiber = a.fiber != null || b.fiber != null ? (a.fiber ?? 0) + (b.fiber ?? 0) : undefined
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, ...(fiber != null ? { fiber } : {}) }
}

export function scaleN(x: Nutrients, f: number): Nutrients {
  return {
    kcal: x.kcal * f,
    protein: x.protein * f,
    carbs: x.carbs * f,
    fat: x.fat * f,
    ...(x.fiber != null ? { fiber: x.fiber * f } : {}),
  }
}

export function sumN(list: (Nutrients | undefined)[]): Nutrients {
  return list.reduce<Nutrients>((acc, x) => addN(acc, x), { ...ZERO })
}

/** Rounded copy (kcal to 1, grams to 0.1) — values stored on records. */
export function roundN(x: Nutrients): Nutrients {
  const r1 = (v: number) => Math.round(v * 10) / 10
  return { kcal: Math.round(x.kcal), protein: r1(x.protein), carbs: r1(x.carbs), fat: r1(x.fat), ...(x.fiber != null ? { fiber: r1(x.fiber) } : {}) }
}

export type Macro = 'protein' | 'carbs' | 'fat'

export const MACRO_LABEL: Record<Macro, string> = { protein: 'proteína', carbs: 'carboidrato', fat: 'gordura' }

/** Macro that brings most of the energy (protein/carbs 4 kcal/g, fat 9 kcal/g). */
export function dominantMacro(x: Nutrients): Macro {
  const p = x.protein * 4
  const c = x.carbs * 4
  const f = x.fat * 9
  if (p >= c && p >= f) return 'protein'
  return c >= f ? 'carbs' : 'fat'
}

/** Role → macro it mostly stands for (used when there are no numbers). */
export function roleMacro(role: FoodRole | undefined): Macro | undefined {
  if (role === 'proteina') return 'protein'
  if (role === 'carbo' || role === 'doce' || role === 'fruta' || role === 'bebida') return 'carbs'
  if (role === 'gordura') return 'fat'
  return undefined
}

/** "2 Fatia(s) (50g)" → 50 · "1 Xícara(s) chá (200ml)" → 200 · "À vontade" → undefined. */
export function gramsFromQty(qty: string | undefined): number | undefined {
  if (!qty) return undefined
  const m = qty.match(/\(\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\s*\)/i)
  return m ? Number(m[1].replace(',', '.')) : undefined
}

/** "Maçã Argentina - 1 unidade(s) pequena(s) (80g)" → { food, qty, grams }. */
export function parseSubstitution(s: string): PlannedFood {
  const i = s.indexOf(' - ')
  const food = (i >= 0 ? s.slice(0, i) : s).trim()
  const qty = i >= 0 ? s.slice(i + 3).trim() : undefined
  return { food, qty, grams: gramsFromQty(qty) }
}

function boundaryAt(text: string, idx: number, len: number): boolean {
  const before = idx === 0 || !/[a-z0-9]/.test(text[idx - 1])
  const after = idx + len >= text.length || !/[a-z0-9]/.test(text[idx + len])
  return before && after
}

export interface AliasHit<T> {
  item: T
  alias: string
  index: number
}

/** Is `a` a better hit than `b`? Earliest in the phrase (the head noun comes first in pt-BR), then longest. */
export function betterHit(a: { alias: string; index: number }, b: { alias: string; index: number } | undefined): boolean {
  if (!b) return true
  if (a.index !== b.index) return a.index < b.index
  return a.alias.length > b.alias.length
}

/** Best alias found in `text` (word boundaries). `prefix` = must start the text (plan items). */
export function findAlias<T extends { aliases: string[] }>(list: T[], rawText: string, mode: 'prefix' | 'contains' = 'contains'): AliasHit<T> | undefined {
  const text = normalize(rawText)
  let best: AliasHit<T> | undefined
  for (const item of list) {
    for (const alias of item.aliases) {
      if (!alias) continue
      let idx = text.indexOf(alias)
      while (idx >= 0) {
        if ((mode === 'contains' || idx === 0) && boundaryAt(text, idx, alias.length)) {
          const hit = { item, alias, index: idx }
          if (betterHit(hit, best)) best = hit
          break
        }
        if (mode === 'prefix') break
        idx = text.indexOf(alias, idx + 1)
      }
    }
  }
  return best
}

export function matchReference(name: string, mode: 'prefix' | 'contains' = 'prefix'): ReferenceFood | undefined {
  return findAlias(REFERENCE_FOODS, name, mode)?.item
}

export function matchCategory(name: string): CategoryEstimate | undefined {
  return findAlias(CATEGORY_ESTIMATES, name, 'contains')?.item
}

export interface PlannedFoodInfo {
  grams?: number
  nutrients?: Nutrients
  confidence: NutrientConfidence
  role?: FoodRole
  ref?: ReferenceFood
  /** Spices / "à vontade" leaves: no numbers, and that doesn't make the total partial. */
  negligible: boolean
}

const infoCache = new WeakMap<PlannedFood, PlannedFoodInfo>()

/**
 * Numbers for one prescribed food: the plan's grams × the reference (confidence 'plan').
 * Values already stored on the item win. Without a reference → 'unknown'.
 */
export function plannedFoodInfo(item: PlannedFood): PlannedFoodInfo {
  const cached = infoCache.get(item)
  if (cached) return cached
  const ref = matchReference(item.food, 'prefix')
  const grams = item.grams ?? gramsFromQty(item.qty)
  const freeAmount = !grams && !!item.qty && /vontade/i.test(normalize(item.qty))
  let out: PlannedFoodInfo
  if (item.nutrients) {
    out = { grams, nutrients: item.nutrients, confidence: item.nutrientConfidence ?? 'plan', role: ref?.role, ref, negligible: false }
  } else if (ref?.per100 && grams) {
    out = { grams, nutrients: roundN(scaleN(ref.per100, grams / 100)), confidence: 'plan', role: ref.role, ref, negligible: false }
  } else {
    out = { grams, confidence: 'unknown', role: ref?.role, ref, negligible: !!ref?.negligible || freeAmount || (grams != null && grams <= 3) }
  }
  infoCache.set(item, out)
  return out
}
