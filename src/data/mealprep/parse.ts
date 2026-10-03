/**
 * Small local parser for the nutritionist's quantity strings (kept here on purpose: the shared
 * nutrition reference module is being built in parallel and must not be imported yet).
 *
 *   "2 bife(s) pequeno(s) (100g)"                     → { amount: 100, unit: 'g', count: 2 }
 *   "1 Copo(s) americano(s) duplo(s) (240ml)"         → { amount: 240, unit: 'ml', count: 1 }
 *   "À vontade"                                        → { free: true }
 *   "Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)" (substitution) → name + qty
 */
import { normalize } from '@/lib/text'

export interface ParsedQty {
  /** Weight (g) or volume (ml) written between parentheses. */
  amount?: number
  unit?: 'g' | 'ml'
  /** Leading household count ("2 bife(s)" → 2). */
  count?: number
  /** "À vontade" — no fixed quantity. */
  free?: boolean
}

export function parseQty(qty: string | undefined): ParsedQty {
  if (!qty) return {}
  const n = normalize(qty)
  if (n.startsWith('a vontade')) return { free: true }
  const out: ParsedQty = {}
  const all = [...qty.matchAll(/\((\d+(?:[.,]\d+)?)\s*(g|ml)\)/gi)]
  const last = all[all.length - 1]
  if (last) {
    out.amount = Number(last[1].replace(',', '.'))
    out.unit = last[2].toLowerCase() as 'g' | 'ml'
  }
  const lead = qty.trim().match(/^(\d+(?:[.,]\d+)?)/)
  if (lead) out.count = Number(lead[1].replace(',', '.'))
  return out
}

/** "Nome - quantidade" → { food, qty }. Only the first " - " followed by a number splits. */
export function parseSubstitution(text: string): { food: string; qty?: string } {
  const m = text.match(/^(.*?)\s+-\s+(\d.*)$/)
  if (!m) return { food: text.trim() }
  return { food: m[1].trim(), qty: m[2].trim() }
}

/** Grams (or ml) of an item, preferring the explicit field. */
export function amountOf(item: { qty?: string; grams?: number }): { amount?: number; unit?: 'g' | 'ml' } {
  if (item.grams != null) return { amount: item.grams, unit: 'g' }
  const p = parseQty(item.qty)
  return { amount: p.amount, unit: p.unit }
}

/** "150g" / "240ml" / "1,5 kg" style, pt-BR decimals. */
export function formatAmount(amount: number | undefined, unit: 'g' | 'ml' = 'g'): string {
  if (amount == null) return ''
  const rounded = Math.round(amount * 10) / 10
  return `${String(rounded).replace('.', ',')}${unit}`
}

/** 1250 → "1,25 kg" · 450 → "450 g" (pt-BR). */
export function formatWeight(grams: number, unit: 'g' | 'ml' = 'g'): string {
  const big = unit === 'g' ? 'kg' : 'L'
  if (grams >= 1000) {
    const v = Math.round(grams / 100) / 10
    return `${String(v).replace('.', ',')} ${big}`
  }
  return `${Math.round(grams)} ${unit}`
}
