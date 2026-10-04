/**
 * "comi um YoPRO" → LoggedFood[] → logFood (real time, via 'lumos'). Meus alimentos win; unknown
 * values are never invented: a product without numbers asks "Qual?" / rótulo / estimativa, and an
 * estimate is said as such.
 */
import { logFood, parseFoodText, resolveChoice, toLoggedFood, unknownFood, type ChoiceOption, type FoodChoice, type LogResult, type ParsedFood, type ParseResult } from '@/data/nutrition'
import type { DB, LoggedFood, Nutrients, TimeHM } from '@/data/types'
import { toInstant, todayKey } from '@/lib/date'

export interface Resolution {
  option?: ChoiceOption
  /** Numbers typed from the package (per unit). */
  label?: Nutrients
}

export function parseLog(db: DB, text: string): ParseResult {
  return parseFoodText(db, text)
}

export function needsAnswer(p: ParseResult): boolean {
  return p.needsChoice.length > 0 || p.unknown.length > 0
}

/** Something she might want in Meus alimentos next time (a product logged by estimate or label). */
export interface Savable {
  name: string
  emoji?: string
  unitLabel?: string
  nutrients?: Nutrients
  confidence: LoggedFood['confidence']
}

export function resolveAll(db: DB, p: ParseResult, res: Record<string, Resolution>): { foods: LoggedFood[]; savable: Savable[] } {
  const foods: LoggedFood[] = []
  const savable: Savable[] = []
  for (const it of p.items) foods.push(toLoggedFood(it))
  for (const c of p.needsChoice) {
    const r = res[c.phrase] ?? {}
    const option: ChoiceOption = r.option ?? { kind: 'sem_numeros', label: '' }
    const parsed: ParsedFood = resolveChoice(db, c, option, option.kind === 'rotulo' ? r.label : undefined)
    foods.push(toLoggedFood(parsed))
    if (option.kind !== 'meu') savable.push(savableOf(c, parsed))
  }
  for (const u of p.unknown) {
    const parsed = unknownFood(u)
    foods.push(toLoggedFood(parsed))
    savable.push({ name: parsed.name, confidence: 'unknown' })
  }
  return { foods, savable }
}

function savableOf(c: FoodChoice, p: ParsedFood): Savable {
  const per = p.nutrients && c.qty ? { kcal: Math.round(p.nutrients.kcal / c.qty), protein: p.nutrients.protein / c.qty, carbs: p.nutrients.carbs / c.qty, fat: p.nutrients.fat / c.qty } : undefined
  return { name: c.typed, emoji: c.emoji, unitLabel: c.unitLabel, nutrients: per, confidence: p.nutrients ? p.confidence : 'unknown' }
}

export function logFromChat(input: { foods: LoggedFood[]; description?: string; at?: TimeHM; now?: Date }): LogResult {
  const now = input.now ?? new Date()
  const when = input.at ? toInstant(todayKey(now), input.at) : now
  return logFood({ foods: input.foods, description: input.description, now: when, via: 'lumos' })
}
