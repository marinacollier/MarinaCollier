/**
 * Food questions answered from the plan + what she really ate + training + time + meals still to come
 * (data/nutrition). Human first ("Seu jantar ainda cabe normalmente"), numbers small and secondary
 * (consumido / planejado). Never "você ultrapassou", never "compensar", never a prescription.
 *
 * Hierarchy, never inverted: nutri explicit guidance > training strategy > registered goals >
 * consumed meals > approved substitutions > her preferences > Lumos suggestions.
 */
import {
  dayMeals,
  dayProtection,
  dinnerOption,
  macroPairs,
  nutritionLedger,
  OFF_PLAN_NOTE,
  proposeAdjustments,
  remainingFor,
  shortFood,
  skipMeal,
  whatFits,
  type AdjustmentDraft,
  type BadgedFood,
  type FitOption,
  type PlanMealView,
} from '@/data/nutrition'
import type { DateKey, DB } from '@/data/types'
import { hmToMinutes } from '@/lib/date'
import { normalize } from '@/lib/text'
import type { FoodIntent, MealWord } from './intent'

export interface MacroPair {
  key: 'protein' | 'carbs' | 'fat'
  label: string
  consumed: number
  planned: number
}

export interface DraftView {
  draft: AdjustmentDraft
  mealName: string
  time?: string
}

export interface SwapView {
  ref: string
  mealName: string
  itemIndex: number
  food: string
  qty?: string
  subs: string[]
  /** The meal's items today (to build the one-day swap). */
  items: BadgedFood[]
}

export interface FoodReply {
  date: DateKey
  headline: string
  lines: string[]
  macros?: MacroPair[]
  partial?: boolean
  /** Suggestions (not stored yet): "aplicar" saves them for that day only. */
  drafts?: DraftView[]
  fits?: FitOption[]
  swaps?: SwapView[]
  /** "não vou fazer lanche hoje": applied right away (she said it), with Desfazer. */
  skip?: DraftView
  /** Why the plan stays (key day / day before a key session…). */
  protection?: string
}

const MEAL_MATCH: Record<MealWord, (m: PlanMealView) => boolean> = {
  cafe: (m) => /cafe/.test(normalize(m.name)),
  almoco: (m) => /almoc/.test(normalize(m.name)),
  lanche: (m) => /lanche/.test(normalize(m.name)),
  jantar: (m) => /jant/.test(normalize(m.name)),
  pre: (m) => m.phase === 'pre' || /pre[ -]?treino/.test(normalize(m.name)),
  pos: (m) => m.phase === 'pos' || /pos[ -]?treino/.test(normalize(m.name)),
  intra: (m) => m.phase === 'intra',
}

/** The plan meal she means: the next one still coming with that name (else the first). */
export function mealFor(db: DB, date: DateKey, word: MealWord, nowMinutes: number): PlanMealView | undefined {
  const list = dayMeals(db, date, nowMinutes).meals.filter(MEAL_MATCH[word])
  return list.find((m) => m.status === 'future' && (!m.plannedTime || hmToMinutes(m.plannedTime) > nowMinutes)) ?? list[0]
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function macrosOf(db: DB, date: DateKey, now: number): { macros: MacroPair[]; partial: boolean } {
  const l = nutritionLedger(db, date, now)
  return { macros: macroPairs(l), partial: l.partial }
}

export function answerFood(db: DB, intent: Exclude<FoodIntent, { kind: 'log' }>, today: DateKey, nowMinutes: number): FoodReply {
  const date = intent.date
  // Another day: "now" is the start of that day (nothing eaten, everything still to come).
  const now = date === today ? nowMinutes : 0
  const day = dayMeals(db, date, now)
  const noPlan = !day.plan
  const base: FoodReply = { date, headline: '', lines: [] }
  if (noPlan && intent.kind !== 'macros') return { ...base, headline: 'Hoje não tem plano do nutri cadastrado pra esse tipo de dia — então eu não invento regra 🙂' }

  switch (intent.kind) {
    case 'macros': {
      const l = nutritionLedger(db, date, now)
      const r = remainingFor(db, date, now)
      if (noPlan) return { ...base, headline: 'Sem plano do nutri pra hoje, então não tenho meta pra comparar.', ...macrosOf(db, date, now) }
      const ate = l.entries.filter((e) => e.status === 'consumed').length
      return {
        ...base,
        headline: ate ? `Seu dia vai no caminho do plano. ${r.summary}` : `Nada registrado ainda hoje. ${r.summary}`,
        lines: l.partial ? ['Alguns itens não têm números (whey, rótulos que faltam) — os totais são aproximados.'] : [],
        ...macrosOf(db, date, now),
      }
    }
    case 'protein': {
      const l = nutritionLedger(db, date, now)
      const r = remainingFor(db, date, now)
      const miss = Math.round(l.missing.protein)
      const coming = Math.round(r.nutrients.protein)
      const head = miss > 0 ? `Faltam ~${miss} g de proteína pro planejado de hoje.` : 'A proteína de hoje já chegou no planejado ✓'
      const tail = r.meals.length ? ` ${r.summary.replace(/\.$/, '')}${coming && !r.summary.includes('proteína') ? ` — ~${coming} g no plano` : ''}.` : ''
      return { ...base, headline: `${head}${tail}`, ...macrosOf(db, date, now) }
    }
    case 'remaining': {
      const r = remainingFor(db, date, now)
      return { ...base, headline: r.summary, ...macrosOf(db, date, now) }
    }
    case 'keep': {
      const word = intent.meal ?? 'jantar'
      const meal = mealFor(db, date, word, now)
      if (!meal) return { ...base, headline: `Não achei ${word === 'pre' ? 'pré-treino' : word === 'pos' ? 'pós-treino' : word} no plano ${date === today ? 'de hoje' : 'desse dia'}.` }
      const name = lower(meal.name)
      if (meal.status === 'consumed') return { ...base, headline: `O ${name} já foi registrado ✓` }
      if (meal.status === 'past' && date === today) return { ...base, headline: `O horário do ${name} já passou — ele fica como está no registro.` }
      const adapt = proposeAdjustments(db, date, now)
      const mine = adapt.drafts.filter((d) => d.planMealRef === meal.ref)
      const protection = adapt.protection.protected ? adapt.protection.reason : undefined
      if (!mine.length) {
        return {
          ...base,
          headline: `Pode manter sim ✓ Seu ${name}${meal.plannedTime ? ` das ${meal.plannedTime}` : ''} continua como o nutri prescreveu.`,
          lines: [protection ?? (adapt.trigger ? adapt.summary.replace(/^Registrei [^✓]+✓\s*/, '') : '')].filter(Boolean),
          protection,
          ...macrosOf(db, date, now),
        }
      }
      return {
        ...base,
        headline: `Pode manter — e, se quiser, dá pra aproximar do planejado com um ajuste leve no ${name}:`,
        drafts: mine.map((d) => ({ draft: d, mealName: meal.name, time: meal.plannedTime })),
        ...macrosOf(db, date, now),
      }
    }
    case 'fits': {
      const r = whatFits(db, date, now, intent.craving)
      return { ...base, headline: r.summary, fits: r.options.slice(0, 5), protection: dayProtection(db, date).protected ? dayProtection(db, date).reason : undefined }
    }
    case 'dinner': {
      const r = dinnerOption(db, date, now)
      return {
        ...base,
        headline: r.summary,
        drafts: r.draft && r.meal ? [{ draft: r.draft, mealName: r.meal.name, time: r.meal.plannedTime }] : undefined,
      }
    }
    case 'skip': {
      const meal = mealFor(db, date, intent.meal, now)
      if (!meal) return { ...base, headline: 'Não achei essa refeição no plano.' }
      if (meal.status === 'past' && date === today) return { ...base, headline: `O horário do ${lower(meal.name)} já passou — fica como está.` }
      const s = skipMeal(db, date, meal.ref)
      return { ...base, headline: s.summary, skip: s.draft ? { draft: { ...s.draft, by: 'marina' }, mealName: meal.name, time: meal.plannedTime } : undefined }
    }
    case 'swap': {
      const meal = mealFor(db, date, intent.meal, now)
      if (!meal) return { ...base, headline: 'Não achei essa refeição no plano.' }
      const name = lower(meal.name)
      if (meal.status === 'consumed') return { ...base, headline: `O ${name} já foi registrado — fica como está ✓` }
      if (meal.status === 'past' && date === today) return { ...base, headline: `O horário do ${name} já passou — não mexo nele.` }
      const swaps: SwapView[] = meal.items
        .map((it, i) => ({ ref: meal.ref, mealName: meal.name, itemIndex: i, food: it.food, qty: it.qty, subs: it.substitutions ?? [], items: meal.items }))
        .filter((s) => s.subs.length > 0)
      if (!swaps.length) return { ...base, headline: `O ${name} não tem trocas cadastradas pelo seu nutricionista.`, lines: [OFF_PLAN_NOTE] }
      return {
        ...base,
        headline: `Trocas que o seu nutri já deixou pro ${name} — escolhe uma e eu coloco só ${date === today ? 'hoje' : 'nesse dia'}:`,
        swaps,
      }
    }
  }
}

/** "120g" / "2 fatias" for a substitution line. */
export function subLabel(sub: string): { food: string; qty?: string } {
  const [food, ...rest] = sub.split(' - ')
  return { food: shortFood(food), qty: rest.join(' - ') || undefined }
}

