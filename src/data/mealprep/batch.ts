/**
 * "Cozinhar uma vez, comer a semana": the bases to produce (cooked totals), the order of steps,
 * a rough time, and the exact content of every pot ("SEG 12H — arroz 150g · feijão 130g · …").
 * Food safety: pots for the next 3 days stay in the fridge, the rest go to the freezer; things that
 * don't freeze well (batata cozida) get a short second round instead.
 */
import type { DateKey, DB, MealPrepPlan, TimeHM } from '@/data/types'
import { agendaFor } from '@/data/selectors'
import { addDays, diffDays, hmToMinutes, startOfWeek, weekday, WEEKDAY_LONG, WEEKDAY_SHORT } from '@/lib/date'
import type { CookRole, Ingredient } from './catalog'
import { formatWeight } from './parse'
import { planFor, shortItem, slotLabel, weekMenu, type MealPlace, type MenuItem, type MenuMeal, type WeekMenu } from './menu'

/** Fridge window after cooking (days). Conservative: cooked food ≤ 3 days in the fridge. */
export const FRIDGE_DAYS = 3

export type PotState = 'geladeira' | 'freezer' | 'consumido'

export interface PotPart {
  short: string
  amount?: number
  unit?: 'g' | 'ml'
  ingredient: Ingredient
  freezes: boolean
}

export interface Pot {
  /** '<DateKey>#<meal index>' — MealPrepPlan.pots key. */
  key: string
  date: DateKey
  mealIndex: number
  time?: TimeHM
  mealName: string
  /** "SEG 12H" */
  label: string
  parts: PotPart[]
  /** "SEG 12H — arroz 150g · feijão 130g · frango 100g · legumes 110g" */
  line: string
  /** Added at the time of eating (suco, folhas, queijo por cima). */
  extras: string[]
  /** Where it should be by default (fridge window) and where it is now (Marina can toggle). */
  defaultState: Exclude<PotState, 'consumido'>
  state: PotState
  /** Parts that should not go to the freezer (made in the second round instead). */
  noFreeze: string[]
  place: MealPlace
  badgeTroca: boolean
}

const POT_ROLES: CookRole[] = ['grao', 'feijao', 'massa', 'cuscuz', 'tuberculo', 'legumes', 'proteina']

function isPotMeal(m: MenuMeal): boolean {
  if (m.phase !== 'refeicao') return false
  return m.items.some((it) => it.ingredient.cook && POT_ROLES.includes(it.ingredient.cook.role))
}

const potPartOf = (it: MenuItem): boolean => !!it.ingredient.potted && !it.free

/** Pot reading order: carb · feijão · proteína · legumes · molho ("arroz 150g · feijão 130g · frango 100g · legumes 110g"). */
const POT_ORDER: Record<string, number> = { grao: 0, tuberculo: 0, massa: 0, cuscuz: 0, feijao: 1, proteina: 2, legumes: 3 }
export const potOrder = (it: { ingredient: Ingredient }) => POT_ORDER[it.ingredient.cook?.role ?? ''] ?? 4

/** Day the batch cooking happens: the day before the week starts (Sunday). */
export function prepDateOf(weekStart: DateKey): DateKey {
  return addDays(startOfWeek(weekStart), -1)
}

export function potsFromMenu(menu: WeekMenu, plan?: MealPrepPlan): Pot[] {
  const prep = prepDateOf(menu.weekStart)
  const out: Pot[] = []
  for (const day of menu.days) {
    const fridge = diffDays(prep, day.date) <= FRIDGE_DAYS
    for (const m of day.meals) {
      if (!isPotMeal(m)) continue
      const potted = m.items.filter(potPartOf).sort((a, b) => potOrder(a) - potOrder(b))
      const parts: PotPart[] = potted.map((it) => ({
        short: it.ingredient.short,
        amount: it.amount,
        unit: it.unit,
        ingredient: it.ingredient,
        freezes: it.ingredient.storage.freezer,
      }))
      const extras = m.items.filter((it) => !potPartOf(it)).map((it) => shortItem(it))
      const label = slotLabel(day.date, m.time)
      const defaultState = fridge ? 'geladeira' : 'freezer'
      out.push({
        key: m.potKey,
        date: day.date,
        mealIndex: m.index,
        time: m.time,
        mealName: m.name,
        label,
        parts,
        line: `${label} — ${potted.map(shortItem).join(' · ')}`,
        extras,
        defaultState,
        state: plan?.pots?.[m.potKey] ?? defaultState,
        noFreeze: fridge ? [] : parts.filter((p) => !p.freezes).map((p) => p.short),
        place: m.place,
        badgeTroca: m.items.some((it) => it.badge === 'troca'),
      })
    }
  }
  return out
}

/** Per-meal pot contents with grams for the week. */
export function pots(db: DB, weekStart: DateKey, plan: MealPrepPlan | undefined = planFor(db, weekStart)): Pot[] {
  return potsFromMenu(weekMenu(db, weekStart, plan), plan)
}

// ─── Batch plan ─────────────────────────────────────────────────────────────

export interface BatchBase {
  /** 'batch:<ingredient key>' — MealPrepPlan.checked key. */
  key: string
  label: string
  role: CookRole
  /** Ready weight to produce. */
  ready: number
  /** Raw weight range to cook ("≈ 200–240 g cru"). */
  raw?: [number, number]
  text: string
  servings: number
  minutes: number
  passive: boolean
  how: string
  order: number
}

export interface BatchStep {
  key: string
  title: string
  detail: string
  minutes: number
  /** Cooks on its own (pressure cooker / oven) while you do the rest. */
  passive?: boolean
  /** Done the day before (soaking). */
  dayBefore?: boolean
}

export interface BatchPlan {
  weekStart: DateKey
  prepDate: DateKey
  bases: BatchBase[]
  steps: BatchStep[]
  /** Rough total in minutes [min, max]. */
  totalMinutes: [number, number]
  potCount: number
  fridgeCount: number
  freezerCount: number
  /** Short second round for what doesn't freeze well (for the freezer days). */
  second?: { date: DateKey; label: string; bases: BatchBase[]; minutes: number; key: string }
  /** Breakfast eggs are baked only for the days she eats out; other days, mexido na hora. */
  eggsNote?: string
}

function rawText(ready: number, ing: Ingredient): { raw?: [number, number]; text: string } {
  const y = ing.yield
  const readyTxt = `~${formatWeight(ready)} pronto`
  if (!y) return { text: readyTxt }
  const raw: [number, number] = [ready / y[1], ready / y[0]]
  const r = (g: number) => (g >= 1000 ? formatWeight(g) : `${Math.round(g / 10) * 10} g`)
  const lo = r(raw[0])
  const hi = r(raw[1])
  const range = lo === hi ? lo : lo.endsWith(' g') && hi.endsWith(' g') ? `${lo.slice(0, -2)}–${hi}` : `${lo}–${hi}`
  return { raw, text: `${readyTxt} (≈ ${range} cru)` }
}

interface Need {
  ing: Ingredient
  ready: number
  servings: number
}

function addNeed(map: Map<string, Need>, it: MenuItem) {
  if (!it.ingredient.cook || it.amount == null) return
  const k = it.ingredient.key
  const n = map.get(k) ?? { ing: it.ingredient, ready: 0, servings: 0 }
  n.ready += it.amount
  n.servings += 1
  map.set(k, n)
}

function basesOf(map: Map<string, Need>): BatchBase[] {
  return [...map.values()]
    .map(({ ing, ready, servings }) => {
      const c = ing.cook!
      const { raw, text } = rawText(ready, ing)
      return { key: `batch:${ing.key}`, label: c.label, role: c.role, ready: Math.round(ready), raw, text, servings, minutes: c.minutes, passive: c.passive, how: c.how, order: c.order }
    })
    .sort((a, b) => a.order - b.order)
}

/**
 * Day for the short second round: late enough that the last day it feeds is ≤ FRIDGE_DAYS away,
 * before the first day that needs it; among those, the lightest day (no presencial, fewest evening plans).
 */
function secondRoundDate(db: DB, menu: WeekMenu, needDates: DateKey[]): DateKey {
  const sorted = [...needDates].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const from = addDays(last, -FRIDGE_DAYS)
  const to = addDays(first, -1)
  const candidates = menu.days.filter((d) => d.date >= from && d.date <= to)
  const load = (date: DateKey, presencial: boolean) =>
    (presencial ? 2 : 0) + agendaFor(db, date).filter((e) => !e.allDay && e.kind !== 'block' && e.time && hmToMinutes(e.time) >= 18 * 60).length
  return [...candidates].sort((a, b) => load(a.date, a.presencial) - load(b.date, b.presencial) || b.date.localeCompare(a.date))[0]?.date ?? to
}

export function batchFromMenu(db: DB, menu: WeekMenu): BatchPlan {
  const prep = prepDateOf(menu.weekStart)
  const allPots = potsFromMenu(menu)
  const main = new Map<string, Need>()
  const later = new Map<string, Need>()
  const laterDates = new Set<DateKey>()
  const potKeys = new Set(allPots.map((p) => p.key))
  let eggsOut = 0
  let eggsHome = 0

  for (const day of menu.days) {
    const fridge = diffDays(prep, day.date) <= FRIDGE_DAYS
    for (const m of day.meals) {
      const isPot = potKeys.has(m.potKey)
      for (const it of m.items) {
        const role = it.ingredient.cook?.role
        if (!role) continue
        if (role === 'ovo') {
          // Omelete assada only where it travels; at home, ovo mexido na hora (3 min).
          if (m.place === 'fora') addNeed(main, it)
          else eggsHome += 1
          if (m.place === 'fora') eggsOut += 1
          continue
        }
        if (!isPot && role !== 'cuscuz') continue
        if (!fridge && !it.ingredient.storage.freezer) {
          addNeed(later, it)
          laterDates.add(day.date)
        } else addNeed(main, it)
      }
    }
  }

  const bases = basesOf(main)
  const steps: BatchStep[] = []
  const soak = bases.filter((b) => b.role === 'feijao' && /molho/.test(b.how))
  if (soak.length)
    steps.push({ key: 'batch:molho', title: `Na véspera: ${soak.map((b) => b.label.toLowerCase()).join(' e ')} de molho`, detail: 'Cubra com água e deixe de molho de um dia pro outro — cozinha mais rápido.', minutes: 2, dayBefore: true })
  const passive = bases.filter((b) => b.passive)
  const active = bases.filter((b) => !b.passive)
  if (passive.length)
    steps.push({
      key: 'batch:start',
      title: `Primeiro, o que cozinha sozinho: ${passive.map((b) => b.label.toLowerCase()).join(', ')}`,
      detail: 'Pressão e forno trabalhando enquanto você faz o resto.',
      minutes: 10,
      passive: true,
    })
  for (const b of [...passive, ...active]) steps.push({ key: b.key, title: `${b.label} — ${b.text}`, detail: b.how, minutes: b.minutes, passive: b.passive })
  const fridgeCount = allPots.filter((p) => p.defaultState === 'geladeira').length
  const freezerCount = allPots.length - fridgeCount
  steps.push({
    key: 'batch:porcionar',
    title: `Porcionar ${allPots.length} potes e etiquetar`,
    detail: `Use a aba Potes: ${fridgeCount} vão pra geladeira e ${freezerCount} pro freezer. Etiquete com dia e hora (ex.: ${allPots[0]?.label ?? 'SEG 12H'}). Deixe esfriar destampado antes de fechar.`,
    minutes: 20 + Math.round(allPots.length * 1.5),
  })

  const activeMin = active.reduce((s, b) => s + b.minutes, 0) + 10
  const longestPassive = Math.max(0, ...passive.map((b) => b.minutes))
  const porc = steps[steps.length - 1].minutes
  const core = Math.max(activeMin, longestPassive + 10) + porc
  const round15 = (n: number) => Math.round(n / 15) * 15
  const totalMinutes: [number, number] = [round15(core), round15(core) + 30]

  let second: BatchPlan['second']
  const laterBases = basesOf(later)
  if (laterBases.length) {
    const date = secondRoundDate(db, menu, [...laterDates])
    second = {
      date,
      key: 'batch:segunda-rodada',
      label: `${WEEKDAY_LONG[weekday(date)]}, quando der`,
      bases: laterBases,
      minutes: laterBases.reduce((s, b) => s + b.minutes, 0),
    }
  }

  return {
    weekStart: menu.weekStart,
    prepDate: prep,
    bases,
    steps,
    totalMinutes,
    potCount: allPots.length,
    fridgeCount,
    freezerCount,
    second,
    eggsNote:
      eggsHome > 0
        ? eggsOut > 0
          ? 'Omelete assada só pros cafés que vão na bolsa; nos outros dias, ovo mexido na hora leva 3 min.'
          : 'Ovo mexido é melhor na hora (3 min) — se preferir, asse omeletes individuais pra semana toda.'
        : undefined,
  }
}

/** What to cook once (cooked totals), the order of steps and a rough time. */
export function batchPlan(db: DB, weekStart: DateKey, plan: MealPrepPlan | undefined = planFor(db, weekStart)): BatchPlan {
  return batchFromMenu(db, weekMenu(db, weekStart, plan))
}

export const SHORT_DAY = (date: DateKey) => WEEKDAY_SHORT[weekday(date)]
