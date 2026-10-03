/**
 * Nutrition LEDGER — derived, never stored. Per day: planned · consumed · remaining, with the
 * confidence of every number. The nutritionist's plan is the source of truth; applied
 * MealAdjustments overlay it for one day only (the plan itself is never edited).
 */
import type {
  ContentSource,
  DateKey,
  DB,
  FuelPhase,
  ID,
  ISODateTime,
  Meal,
  MealAdjustment,
  MealSlot,
  NutrientConfidence,
  Nutrients,
  NutritionDayPlan,
  PlannedFood,
  PlannedMeal,
  TimeHM,
} from '@/data/types'
import { dayPlanFor } from '@/data/fuel'
import { hmToMinutes, toTimeHM } from '@/lib/date'
import { plannedFoodInfo, roundN, sumN, ZERO } from './nutrients'

export type BadgedFood = PlannedFood & { badge: ContentSource }

export type PlanMealStatus = 'consumed' | 'skipped' | 'future' | 'past'

export interface PlanMealView {
  /** '<NutritionDayPlan.id>#<meal index>' */
  ref: string
  index: number
  plan: NutritionDayPlan
  original: PlannedMeal
  name: string
  plannedTime?: TimeHM
  phase?: FuelPhase | 'refeicao'
  /** Items for today: the applied adjustment's items, or the prescription (badge nutri). */
  items: BadgedFood[]
  /** Applied adjustment for this day (if any). */
  adjustment?: MealAdjustment
  /** Pending suggestion for this meal (if any). */
  proposed?: MealAdjustment
  consumed?: Meal
  /** HH:MM she actually ate. */
  consumedTime?: TimeHM
  status: PlanMealStatus
  /** Meal-level badge: nutri (as prescribed) · troca (plan equivalence) · lumos (suggestion). */
  badge: ContentSource
  nutrients: Nutrients
  partial: boolean
}

export interface DayMeals {
  date: DateKey
  plan?: NutritionDayPlan
  meals: PlanMealView[]
  /** Things she ate outside the plan (or on a day without plan). */
  extras: Meal[]
}

export const planMealRef = (planId: ID, index: number) => `${planId}#${index}`

export function parsePlanMealRef(ref: string): { planId: string; index: number } | undefined {
  const i = ref.lastIndexOf('#')
  if (i < 0) return undefined
  const index = Number(ref.slice(i + 1))
  return Number.isInteger(index) ? { planId: ref.slice(0, i), index } : undefined
}

/** HH:MM (São Paulo) of a meal's real moment: consumedAt, else its `time`. */
export function consumedTimeOf(m: Meal): TimeHM | undefined {
  if (m.consumedAt) {
    const d = new Date(m.consumedAt)
    if (!Number.isNaN(d.getTime())) return toTimeHM(d)
  }
  return m.time
}

function latest(list: MealAdjustment[]): MealAdjustment | undefined {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

export function adjustmentsOn(db: DB, date: DateKey): MealAdjustment[] {
  return db.mealAdjustments.filter((a) => a.date === date)
}

function mealBadge(items: BadgedFood[], adj: MealAdjustment | undefined, consumed: Meal | undefined): ContentSource {
  if (consumed?.contentSource && consumed.contentSource !== 'marina') return consumed.contentSource
  if (!adj) return 'nutri'
  if (adj.kind === 'adaptar' || items.some((i) => i.badge === 'lumos')) return 'lumos'
  if (items.some((i) => i.badge === 'troca')) return 'troca'
  return 'nutri'
}

export function itemsNutrients(items: PlannedFood[]): { nutrients: Nutrients; partial: boolean; confidence: NutrientConfidence } {
  let partial = false
  const list = items.map((it) => {
    const info = plannedFoodInfo(it)
    if (!info.nutrients && !info.negligible) partial = true
    return info.nutrients
  })
  return { nutrients: roundN(sumN(list)), partial, confidence: partial ? 'unknown' : 'plan' }
}

/** Was this plan meal eaten / skipped / still coming? `past` = its time went by and nothing was marked. */
function statusOf(consumed: Meal | undefined, skipped: boolean, time: TimeHM | undefined, nowMinutes: number | undefined): PlanMealStatus {
  if (consumed) return 'consumed'
  if (skipped) return 'skipped'
  if (nowMinutes != null && time && hmToMinutes(time) + 90 < nowMinutes) return 'past'
  return 'future'
}

/** Today's prescribed meals with what happened to each, plus the extras. */
export function dayMeals(db: DB, date: DateKey, nowMinutes?: number): DayMeals {
  const plan = dayPlanFor(db, date)
  const logged = db.meals.filter((m) => m.date === date)
  const adjs = adjustmentsOn(db, date)
  const meals: PlanMealView[] = (plan?.meals ?? []).map((original, index) => {
    const ref = planMealRef(plan!.id, index)
    const consumed = logged.find((m) => m.planMealRef === ref && m.done)
    const mine = adjs.filter((a) => a.planMealRef === ref)
    const adjustment = latest(mine.filter((a) => a.status === 'applied'))
    const proposed = consumed ? undefined : latest(mine.filter((a) => a.status === 'proposed'))
    const skipped = adjustment?.kind === 'pular'
    const items: BadgedFood[] = adjustment && adjustment.kind !== 'pular' && adjustment.kind !== 'manter' ? adjustment.items : original.items.map((it) => ({ ...it, badge: 'nutri' as const }))
    const counted = consumed?.foods?.length ? undefined : skipped ? [] : items
    const n = counted ? itemsNutrients(counted) : foodsNutrients(consumed!.foods!)
    return {
      ref,
      index,
      plan: plan!,
      original,
      name: original.name,
      plannedTime: original.time,
      phase: original.phase,
      items,
      adjustment,
      proposed,
      consumed,
      consumedTime: consumed ? consumedTimeOf(consumed) : undefined,
      status: statusOf(consumed, skipped, original.time, nowMinutes),
      badge: mealBadge(items, adjustment, consumed),
      nutrients: n.nutrients,
      partial: n.partial,
    }
  })
  const refs = new Set(meals.map((m) => m.ref))
  const extras = logged
    .filter((m) => m.done && (!m.planMealRef || !refs.has(m.planMealRef)))
    .sort((a, b) => (consumedTimeOf(a) ?? '99').localeCompare(consumedTimeOf(b) ?? '99'))
  return { date, plan, meals, extras }
}

export function foodsNutrients(foods: { nutrients?: Nutrients; confidence: NutrientConfidence }[]): { nutrients: Nutrients; partial: boolean; confidence: NutrientConfidence } {
  const partial = foods.some((f) => !f.nutrients)
  const estimated = foods.some((f) => f.confidence === 'estimated')
  return {
    nutrients: roundN(sumN(foods.map((f) => f.nutrients))),
    partial,
    confidence: partial ? 'unknown' : estimated ? 'estimated' : foods.some((f) => f.confidence === 'label') ? 'label' : 'reference',
  }
}

/** Nutrients of a logged meal that is not a plan meal (free text without foods = unknown). */
export function mealNutrients(m: Meal): { nutrients: Nutrients; partial: boolean; confidence: NutrientConfidence } {
  if (m.foods?.length) return foodsNutrients(m.foods)
  return { nutrients: { ...ZERO }, partial: true, confidence: 'unknown' }
}

export interface LedgerEntry {
  kind: 'plan' | 'extra'
  ref?: string
  mealId?: ID
  name: string
  mealContext: FuelPhase | 'refeicao' | MealSlot
  plannedTime?: TimeHM
  consumedAt?: ISODateTime
  consumedTime?: TimeHM
  status: PlanMealStatus
  source: ContentSource
  nutrients: Nutrients
  confidence: NutrientConfidence
  partial: boolean
  foods: { name: string; qty?: string | number; grams?: number; nutrients?: Nutrients; confidence: NutrientConfidence; badge?: ContentSource }[]
}

export interface NutritionLedger {
  date: DateKey
  plan?: { id: ID; name: string }
  /** The day's plan as it stands (applied adjustments in, skipped meals out). */
  planned: Nutrients
  /** The prescription untouched. */
  original: Nutrients
  consumed: Nutrients
  /** Plan meals still to come (not eaten, not skipped, time not long gone). */
  remaining: Nutrients
  /** Eaten outside the plan. */
  extra: Nutrients
  /** "Faltam P48 C52 G14": planned (the day's meta) minus consumed, never below 0. Information only. */
  missing: Nutrients
  entries: LedgerEntry[]
  /** Share of (non-negligible) foods that have numbers, 0..1. */
  coverage: number
  /** Some numbers are missing → totals are "aproximados". */
  partial: boolean
}

/**
 * The day's ledger. Deterministic: db + date + minute of day in → numbers out.
 * Remaining = what the plan still has coming — never "planned minus consumed" (no compensation).
 */
export function nutritionLedger(db: DB, date: DateKey, nowMinutes?: number): NutritionLedger {
  const day = dayMeals(db, date, nowMinutes)
  const entries: LedgerEntry[] = []
  let known = 0
  let total = 0
  const count = (has: boolean, negligible = false) => {
    if (negligible) return
    total += 1
    if (has) known += 1
  }

  for (const m of day.meals) {
    const usesFoods = !!m.consumed?.foods?.length
    const foods: LedgerEntry['foods'] = usesFoods
      ? m.consumed!.foods!.map((f) => ({ name: f.name, qty: f.unitLabel ? `${f.qty} ${f.unitLabel}` : f.qty, grams: f.grams, nutrients: f.nutrients, confidence: f.confidence }))
      : m.status === 'skipped'
        ? []
        : m.items.map((it) => {
            const info = plannedFoodInfo(it)
            return { name: it.food, qty: it.qty, grams: info.grams, nutrients: info.nutrients, confidence: info.confidence, badge: it.badge }
          })
    if (usesFoods) m.consumed!.foods!.forEach((f) => count(!!f.nutrients))
    else if (m.status !== 'skipped') m.items.forEach((it) => count(!!plannedFoodInfo(it).nutrients, plannedFoodInfo(it).negligible))
    entries.push({
      kind: 'plan',
      ref: m.ref,
      mealId: m.consumed?.id,
      name: m.name,
      mealContext: m.phase ?? 'refeicao',
      plannedTime: m.plannedTime,
      consumedAt: m.consumed?.consumedAt,
      consumedTime: m.consumedTime,
      status: m.status,
      source: m.badge,
      nutrients: m.nutrients,
      confidence: m.partial ? 'unknown' : usesFoods ? foodsNutrients(m.consumed!.foods!).confidence : 'plan',
      partial: m.partial,
      foods,
    })
  }
  for (const x of day.extras) {
    const n = mealNutrients(x)
    if (x.foods?.length) x.foods.forEach((f) => count(!!f.nutrients))
    else count(false)
    entries.push({
      kind: 'extra',
      mealId: x.id,
      name: x.description,
      mealContext: x.slot,
      plannedTime: x.plannedTime,
      consumedAt: x.consumedAt,
      consumedTime: consumedTimeOf(x),
      status: 'consumed',
      source: x.contentSource ?? 'marina',
      nutrients: n.nutrients,
      confidence: n.confidence,
      partial: n.partial,
      foods: (x.foods ?? []).map((f) => ({ name: f.name, qty: f.unitLabel ? `${f.qty} ${f.unitLabel}` : f.qty, grams: f.grams, nutrients: f.nutrients, confidence: f.confidence })),
    })
  }

  const planEntries = entries.filter((e) => e.kind === 'plan')
  const sum = (list: LedgerEntry[]) => roundN(sumN(list.map((e) => e.nutrients)))
  const original = roundN(sumN(day.meals.map((m) => itemsNutrients(m.original.items).nutrients)))
  const out: NutritionLedger = {
    date,
    plan: day.plan ? { id: day.plan.id, name: day.plan.name } : undefined,
    planned: sum(planEntries.filter((e) => e.status !== 'skipped')),
    original,
    consumed: sum(entries.filter((e) => e.status === 'consumed')),
    remaining: sum(planEntries.filter((e) => e.status === 'future')),
    extra: sum(entries.filter((e) => e.kind === 'extra')),
    missing: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    entries,
    coverage: total ? Math.round((known / total) * 100) / 100 : 1,
    partial: entries.some((e) => e.partial && e.status !== 'skipped'),
  }
  const gap = (k: keyof Nutrients) => Math.max(0, Math.round(((out.planned[k] ?? 0) - (out.consumed[k] ?? 0)) * 10) / 10)
  out.missing = { kcal: Math.round(gap('kcal')), protein: gap('protein'), carbs: gap('carbs'), fat: gap('fat') }
  return out
}

/** "P48 C52 G14" — compact macros for Lumos answers. */
export function formatMacros(n: Nutrients): string {
  return `P${Math.round(n.protein)} C${Math.round(n.carbs)} G${Math.round(n.fat)}`
}

/** "Meta P130 C250 G65 · consumido P82 C198 G51 · faltam P48 C52 G14" (+ aproximado). */
export function macrosLine(l: NutritionLedger): string {
  return `Meta ${formatMacros(l.planned)} · consumido ${formatMacros(l.consumed)} · faltam ${formatMacros(l.missing)}${l.partial ? ' (aproximado)' : ''}`
}

export interface RemainingAnswer {
  meals: PlanMealView[]
  nutrients: Nutrients
  partial: boolean
  /** "Ainda vêm lanche (16:00) e jantar (20:00)." */
  summary: string
}

/** What's still coming today, from the plan (for "o que falta?"). */
export function remainingFor(db: DB, date: DateKey, nowMinutes: number): RemainingAnswer {
  const day = dayMeals(db, date, nowMinutes)
  const meals = day.meals.filter((m) => m.status === 'future')
  const nutrients = roundN(sumN(meals.map((m) => m.nutrients)))
  const partial = meals.some((m) => m.partial)
  const names = meals.map((m) => `${m.name.toLowerCase()}${m.plannedTime ? ` (${m.plannedTime})` : ''}`)
  const summary = !day.plan
    ? 'Hoje não tem plano do nutri cadastrado pra esse tipo de dia.'
    : meals.length === 0
      ? 'O plano de hoje já fechou — nada mais previsto.'
      : `Ainda vêm ${joinPt(names)}${nutrients.protein > 0 ? ` — ${partial ? '~' : ''}${Math.round(nutrients.protein)} g de proteína no plano` : ''}.`
  return { meals, nutrients, partial, summary }
}

export function joinPt(list: string[]): string {
  if (list.length <= 1) return list.join('')
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`
}

/** "62 / 110 g" style pair for the small Detalhes do dia view. */
export function macroPairs(l: NutritionLedger): { key: 'protein' | 'carbs' | 'fat'; label: string; consumed: number; planned: number }[] {
  return [
    { key: 'protein', label: 'Proteína', consumed: Math.round(l.consumed.protein), planned: Math.round(l.planned.protein) },
    { key: 'carbs', label: 'Carboidrato', consumed: Math.round(l.consumed.carbs), planned: Math.round(l.planned.carbs) },
    { key: 'fat', label: 'Gordura', consumed: Math.round(l.consumed.fat), planned: Math.round(l.planned.fat) },
  ]
}
