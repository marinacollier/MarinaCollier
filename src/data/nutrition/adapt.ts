/**
 * Adapting the REST of the day after something extra — never "compensating".
 *
 * Hierarchy (never inverted): 1 explicit nutritionist guidance (the plan is never edited; only
 * one-day overlays) · 2 training strategy (pre/intra/pós meals and key / heavy / prep days are
 * untouchable) · 3 registered goals · 4 meals already eaten (never changed) · 5 the plan's own
 * substitutions (`trocar`) · 6 her preferences · 7 Lumos suggestions (`adaptar`, clearly badged).
 *
 * The default answer is often "manter" — and we say so. Only ONE future snack-type meal is ever a
 * candidate; main meals, pre/intra/pós and anything on a protected day stay as planned.
 */
import type { ContentSource, DateKey, DB, Meal, MealAdjustment, Nutrients, NutritionDayPlan, PlannedFood, Workout } from '@/data/types'
import { contextWorkouts, dayTrainingContext } from '@/data/fuel'
import { findModality } from '@/data/planning'
import { addDays, hmToMinutes, startOfWeek } from '@/lib/date'
import { normalize } from '@/lib/text'
import { CATEGORY_ESTIMATES, REFERENCE_FOODS, type FoodRole } from './foods.reference'
import { consumedTimeOf, dayMeals, joinPt, mealNutrients, nutritionLedger, type BadgedFood, type PlanMealView } from './ledger'
import { betterHit, dominantMacro, findAlias, matchReference, parseSubstitution, plannedFoodInfo, roleMacro, roundN, scaleN, sumN, type Macro } from './nutrients'

export type AdjustmentDraft = Omit<MealAdjustment, 'id' | 'createdAt' | 'updatedAt'>

export interface DayProtection {
  protected: boolean
  kind?: 'key_today' | 'prep_tomorrow' | 'heavy_day' | 'recovery'
  workout?: Workout
  /** One human line ("Como amanhã você tem pedal longo, não mexi nos carboidratos…"). */
  reason?: string
}

export interface KeptMeal {
  ref: string
  name: string
  time?: string
  reason: string
}

export interface AdaptResult {
  drafts: AdjustmentDraft[]
  kept: KeptMeal[]
  summary: string
  protection: DayProtection
  trigger?: { mealId: string; name: string; time?: string; macro?: Macro; estimated: boolean }
}


const title = (db: DB, w: Workout) => (w.title?.trim() || findModality(db.profile, w.modality)?.label || 'treino').toLowerCase()

const isRecovery = (w: Workout) => w.recoveryPriority === 'alta' || !!w.tags?.some((t) => t === 'recovery-important' || t === 'recovery')

/** Is this a day where nutrition around training wins over any adaptation? */
export function dayProtection(db: DB, date: DateKey): DayProtection {
  const ctx = dayTrainingContext(db, date)
  const tomorrow = dayTrainingContext(db, addDays(date, 1))
  const next = tomorrow.key ?? ctx.prepFor
  if (next) {
    return { protected: true, kind: 'prep_tomorrow', workout: next, reason: `Como amanhã você tem ${title(db, next)}, não mexi nos carboidratos planejados para hoje.` }
  }
  if (ctx.key) return { protected: true, kind: 'key_today', workout: ctx.key, reason: `Hoje é dia de ${title(db, ctx.key)} — mantive o plano, a recuperação vem primeiro.` }
  const heavy = ['forca_pesada', 'corrida_longa', 'pedal_longo', 'prep_longo'].includes(ctx.dayType)
  const rec = ctx.workouts.find(isRecovery)
  if (heavy || rec) {
    const w = rec ?? ctx.workouts[0]
    return { protected: true, kind: rec ? 'recovery' : 'heavy_day', workout: w, reason: w ? `Hoje tem ${title(db, w)} — mantive o plano pra sua recuperação.` : 'Mantive o plano — hoje o treino vem primeiro.' }
  }
  return { protected: false }
}

/** Meals around a timed training today (3h before / 2h after) are training meals, whatever their name. */
function nearTraining(db: DB, date: DateKey, time: string | undefined): boolean {
  if (!time) return false
  const t = hmToMinutes(time)
  return contextWorkouts(db, date).some((w) => {
    if (!w.time) return false
    const start = hmToMinutes(w.time)
    const end = start + (w.durationMin ?? w.plannedDurationMin ?? 60)
    return (t <= start && start - t <= 180) || (t >= end && t - end <= 120)
  })
}

/** Why a future meal must stay as planned (undefined = it may be a candidate). */
export function mealLock(db: DB, date: DateKey, m: PlanMealView, nowMinutes: number): string | undefined {
  if (m.status === 'consumed') return 'já foi'
  if (m.status === 'skipped') return 'fora hoje'
  if (!m.plannedTime || hmToMinutes(m.plannedTime) <= nowMinutes) return 'horário já passou'
  if (m.phase && m.phase !== 'refeicao') return 'refeição do treino'
  if (nearTraining(db, date, m.plannedTime)) return 'perto do treino'
  return undefined
}

export function roleOfName(name: string): FoodRole | undefined {
  const ref = findAlias(REFERENCE_FOODS, name, 'contains')
  const cat = findAlias(CATEGORY_ESTIMATES, name, 'contains')
  if (cat && betterHit(cat, ref)) return cat.item.role
  return ref?.item.role
}

/** Macro an extra mostly brought: from its numbers when known, else from what the foods are. */
export function extraMacro(m: Meal): { macro?: Macro; kcal?: number; estimated: boolean } {
  const n = mealNutrients(m)
  const estimated = !!m.foods?.some((f) => f.confidence === 'estimated')
  if (!n.partial && n.nutrients.kcal > 0) return { macro: dominantMacro(n.nutrients), kcal: n.nutrients.kcal, estimated }
  const roles = (m.foods?.length ? m.foods.map((f) => f.name) : [m.description]).map(roleOfName)
  const macro = roles.map(roleMacro).find(Boolean)
  return { macro, kcal: n.nutrients.kcal > 0 ? n.nutrients.kcal : undefined, estimated }
}

/** "Não precisa mexer em nada": extras below this share of the day's planned kcal… */
export const SMALL_KCAL_SHARE = 0.1
/** …and no macro above this share of its planned total. */
export const SMALL_MACRO_SHARE = 0.15
/** Never scale a prescribed item down more than this (and never remove it). */
export const MAX_ITEM_CUT = 0.3

export const SMALL_LINE = 'Não precisa mexer em nada. Continua o plano normalmente.'
export const OFF_PLAN_NOTE =
  'Essa opção não está cadastrada como substituição pelo seu nutricionista. Posso sugerir uma alternativa aproximada, mas não vou tratá-la como equivalente ao plano.'

/** Roles whose quantities may be nudged; protein and vegetables are always kept. */
const SCALABLE: FoodRole[] = ['carbo', 'doce', 'gordura', 'bebida']

export interface Deviation {
  extra: Nutrients
  planned: Nutrients
  kcalShare: number
  /** Largest extra/planned share among P, C, G. */
  macroShare: number
  small: boolean
}

/** How far the day's extras push it from the plan (cumulative, numbers we know). */
export function dayDeviation(db: DB, date: DateKey, nowMinutes?: number): Deviation {
  const l = nutritionLedger(db, date, nowMinutes)
  const share = (x: number, of: number) => (of > 0 ? x / of : x > 0 ? 1 : 0)
  const kcalShare = share(l.extra.kcal, l.planned.kcal)
  const macroShare = Math.max(share(l.extra.protein, l.planned.protein), share(l.extra.carbs, l.planned.carbs), share(l.extra.fat, l.planned.fat))
  return { extra: l.extra, planned: l.planned, kcalShare, macroShare, small: kcalShare < SMALL_KCAL_SHARE && macroShare <= SMALL_MACRO_SHARE }
}

function pantryOf(db: DB, date: DateKey): string[] {
  const week = startOfWeek(date)
  return (db.mealPrepPlans ?? []).find((p) => p.weekStart === week)?.pantry.map(normalize) ?? []
}

function inPantry(pantry: string[], food: string): boolean {
  const key = matchReference(food, 'prefix')?.key
  const n = normalize(food)
  return pantry.some((p) => !!p && (n.includes(p) || (!!key && matchReference(p, 'contains')?.key === key)))
}

interface RedistCtx {
  date: DateKey
  triggerName: string
  triggerTime?: string
  triggerMealId?: string
  pantry: string[]
}

const pct = (f: number) => `${Math.round((1 - f) * 100)}%`

/** Scaled copy of a prescribed food (grams × factor), badge lumos. */
function scaled(it: PlannedFood, factor: number): BadgedFood {
  const info = plannedFoodInfo(it)
  const grams = Math.round(info.grams! * factor)
  return {
    food: it.food,
    qty: `${grams}g — um pouco menos que o plano (${it.qty ?? `${info.grams}g`})`,
    grams,
    nutrients: info.nutrients ? roundN(scaleN(info.nutrients, factor)) : undefined,
    nutrientConfidence: 'plan',
    substitutions: it.substitutions,
    badge: 'lumos',
  }
}

/**
 * Proportional, NON-punitive redistribution over the future, non-locked meals: protein and
 * vegetables stay; carb / fat items go down a little (≤ 30% each, rounded to 5%), never removed.
 * Per-meal options, best first: (1) the plan's own foods, a bit less · (2) the nutritionist's
 * substitution with a lighter profile (ingredients she has at home first).
 */
export function redistribution(db: DB, date: DateKey, nowMinutes: number, extra: Nutrients, ctx: RedistCtx): { ref: string; options: AdjustmentDraft[] }[] {
  const day = dayMeals(db, date, nowMinutes)
  const meals = day.meals.filter((m) => m.status === 'future' && !mealLock(db, date, m, nowMinutes))
  const role = (it: PlannedFood) => matchReference(it.food, 'prefix')?.role
  const canScale = (it: PlannedFood) => {
    const r = role(it)
    const info = plannedFoodInfo(it)
    return !!r && SCALABLE.includes(r) && !!info.nutrients && !!info.grams
  }
  const pool = sumN(meals.flatMap((m) => m.items.filter(canScale).map((it) => plannedFoodInfo(it).nutrients)))
  const factorFor = (macro: 'carbs' | 'fat') => {
    const of = macro === 'carbs' ? pool.carbs : pool.fat
    const need = macro === 'carbs' ? extra.carbs : extra.fat
    if (of <= 0 || need <= 0) return 1
    return Math.round((1 - Math.min(MAX_ITEM_CUT, need / of)) * 20) / 20
  }
  const fC = factorFor('carbs')
  const fF = factorFor('fat')
  const when = ctx.triggerTime ? ` às ${ctx.triggerTime}` : ''
  const out: { ref: string; options: AdjustmentDraft[] }[] = []
  for (const m of meals) {
    const options: AdjustmentDraft[] = []
    const mealName = m.name.toLowerCase()
    const changed: string[] = []
    let factorShown = 1
    const items: BadgedFood[] = m.items.map((it) => {
      if (!canScale(it)) return it
      const f = dominantMacro(plannedFoodInfo(it).nutrients!) === 'fat' ? fF : fC
      if (f >= 0.95) return it
      changed.push(shortFood(it.food))
      factorShown = Math.min(factorShown, f)
      return scaled(it, f)
    })
    if (changed.length) {
      options.push({
        date,
        planMealRef: m.ref,
        kind: 'adaptar',
        items,
        reason: `Como você adicionou ${ctx.triggerName}${when}, posso ajustar um pouco ${joinPt([...new Set(changed)])} no ${mealName} (até −${pct(factorShown)}), mantendo proteína e vegetais.`,
        status: 'proposed',
        triggerMealId: ctx.triggerMealId,
        by: 'lumos',
      })
    }
    const trocas: { draft: AdjustmentDraft; home: boolean }[] = []
    m.items.forEach((it, idx) => {
      if (!canScale(it)) return
      const base = plannedFoodInfo(it).nutrients!
      for (const s of it.substitutions ?? []) {
        const sub = parseSubstitution(s)
        const sn = plannedFoodInfo(sub).nutrients
        if (!sn || sn.kcal >= base.kcal * 0.95) continue
        const home = inPantry(ctx.pantry, sub.food)
        trocas.push({
          home,
          draft: {
            date,
            planMealRef: m.ref,
            kind: 'trocar',
            items: m.items.map((x, i) => (i === idx ? { ...sub, badge: 'troca' as ContentSource } : x)),
            reason: `Como você adicionou ${ctx.triggerName}${when}, uma troca do seu plano no ${mealName}: ${shortFood(it.food)} → ${shortFood(sub.food)}${home ? ' (você tem em casa)' : ''}.`,
            status: 'proposed',
            triggerMealId: ctx.triggerMealId,
            by: 'lumos',
          },
        })
      }
    })
    trocas.sort((a, b) => Number(b.home) - Number(a.home))
    options.push(...trocas.map((t) => t.draft))
    if (options.length) out.push({ ref: m.ref, options })
  }
  return out
}

/** "Whey protein concentrado" → "whey protein"; keeps it short and human. */
export function shortFood(food: string): string {
  const ref = matchReference(food, 'prefix')
  return (ref?.name ?? food).split(/[(,-]/)[0].trim().toLowerCase()
}

/** The extra to react to: the given meal, else the latest extra of the day. */
function pickTrigger(db: DB, date: DateKey, triggerMealId?: string): Meal | undefined {
  if (triggerMealId) return db.meals.find((m) => m.id === triggerMealId)
  return dayMeals(db, date).extras.slice(-1)[0]
}

function triggerName(m: Meal): string {
  return m.foods?.length ? joinPt(m.foods.map((f) => f.name)) : m.description
}

/**
 * React to an extra: drafts for future meals + one human summary line. Never "pule o jantar".
 * Deterministic: db + date + minute of day (+ trigger) in → result out. Nothing is written.
 */
export function proposeAdjustments(db: DB, date: DateKey, nowMinutes: number, triggerMealId?: string): AdaptResult {
  const day = dayMeals(db, date, nowMinutes)
  const protection = dayProtection(db, date)
  const trigger = pickTrigger(db, date, triggerMealId)
  const future = day.meals.filter((m) => m.status === 'future' && m.plannedTime && hmToMinutes(m.plannedTime) > nowMinutes)
  const keptAll = (reason: string): KeptMeal[] => future.map((m) => ({ ref: m.ref, name: m.name, time: m.plannedTime, reason }))
  if (!trigger) return { drafts: [], kept: keptAll('segue o plano'), summary: day.plan ? 'Seu dia segue o plano.' : 'Hoje não tem plano do nutri pra esse tipo de dia.', protection }

  const name = triggerName(trigger)
  const time = consumedTimeOf(trigger)
  const info = extraMacro(trigger)
  const trig = { mealId: trigger.id, name, time, macro: info.macro, estimated: info.estimated }
  const head = `Registrei ${name} ✓`
  const est = info.estimated ? ' Vou considerar como estimativa.' : ''
  const done = (summary: string, kept: KeptMeal[] = []): AdaptResult => ({ drafts: [], kept, summary, protection, trigger: trig })
  const n = mealNutrients(trigger)

  if (!day.plan) return done(`${head}${est}`)
  if (protection.protected) return done(`${head} ${protection.reason}${est}`, keptAll(protection.reason!))
  if (future.length === 0) return done(`${head} O plano de hoje já fechou — nada pra ajustar.${est}`)
  if (n.partial && n.nutrients.kcal === 0) return done(`${head} Sem números confiáveis, então mantive seu plano.`, keptAll('sem números confiáveis'))

  const dev = dayDeviation(db, date, nowMinutes)
  if (dev.small) return done(`${head} ${SMALL_LINE}${est}`, keptAll('segue o plano'))

  const plan = redistribution(db, date, nowMinutes, dev.extra, { date, triggerName: name, triggerTime: time, triggerMealId: trigger.id, pantry: pantryOf(db, date) })
  const drafts = plan.map((p) => p.options[0])
  if (!drafts.length) {
    const line = info.macro === 'protein' ? 'Ele trouxe principalmente proteína — o restante do dia segue como planejado.' : 'Seu dia ainda está bem administrável — o restante segue como planejado.'
    return done(`${head} ${line}${est}`, keptAll('segue o plano'))
  }
  const touched = new Set(drafts.map((d) => d.planMealRef))
  const names = day.meals.filter((m) => touched.has(m.ref)).map((m) => m.name.toLowerCase())
  const kept = future.filter((m) => !touched.has(m.ref)).map((m) => ({ ref: m.ref, name: m.name, time: m.plannedTime, reason: mealLock(db, date, m, nowMinutes) ?? 'segue o plano' }))
  return {
    drafts,
    kept,
    summary: `${head} Seu dia ainda está bem administrável. Vou manter proteína e vegetais no ${joinPt(names)} e ajustar um pouco o carboidrato/gordura para aproximar o total do planejado.${est}`,
    protection,
    trigger: trig,
  }
}

/** "outra opção": every alternative for the meal of a proposed adjustment (current one included). */
export function otherOptions(db: DB, adj: MealAdjustment, nowMinutes: number): AdjustmentDraft[] {
  const trigger = adj.triggerMealId ? db.meals.find((m) => m.id === adj.triggerMealId) : undefined
  if (!trigger) return []
  const dev = dayDeviation(db, adj.date, nowMinutes)
  const plan = redistribution(db, adj.date, nowMinutes, dev.extra, { date: adj.date, triggerName: triggerName(trigger), triggerTime: consumedTimeOf(trigger), triggerMealId: trigger.id, pantry: pantryOf(db, adj.date) })
  return plan.find((p) => p.ref === adj.planMealRef)?.options ?? []
}

/** Is `a` the same proposal as `b` (by its items)? */
export function sameItems(a: { items: BadgedFood[] }, b: { items: BadgedFood[] }): boolean {
  return a.items.length === b.items.length && a.items.every((x, i) => x.food === b.items[i].food && x.badge === b.items[i].badge && x.grams === b.items[i].grams)
}

// ─── Chat helpers (Lumos) ───────────────────────────────────────────────────

const CRAVING_ROLE: [RegExp, FoodRole][] = [
  [/doce|chocolate|acucar|sobremesa|brigadeiro|sorvete/, 'doce'],
  [/fruta/, 'fruta'],
  [/proteina|whey|ovo|frango/, 'proteina'],
  [/castanha|oleaginosa|gordura|amendoim/, 'gordura'],
  [/carbo|pao|massa|arroz|batata/, 'carbo'],
]

export interface FitOption {
  ref?: string
  mealName?: string
  time?: string
  /** Prescribed item it replaces (troca). */
  from?: string
  food: string
  qty?: string
  badge: ContentSource
  note: string
}

/**
 * "quero comer doce, o que cabe?" — only what the plan already has (nutri), its own substitutions
 * (troca) or, failing that, foods of that kind from her OTHER prescribed days (lumos, clearly said).
 */
export function whatFits(db: DB, date: DateKey, nowMinutes: number, craving?: string): { options: FitOption[]; summary: string } {
  const role = craving ? CRAVING_ROLE.find(([re]) => re.test(normalize(craving)))?.[1] : undefined
  const day = dayMeals(db, date, nowMinutes)
  const future = day.meals.filter((m) => m.status === 'future' && (!m.plannedTime || hmToMinutes(m.plannedTime) > nowMinutes))
  const options: FitOption[] = []
  for (const m of future) {
    m.items.forEach((it) => {
      const r = matchReference(it.food, 'prefix')?.role
      if (role && r === role) options.push({ ref: m.ref, mealName: m.name, time: m.plannedTime, food: it.food, qty: it.qty, badge: 'nutri', note: `já está no seu ${m.name.toLowerCase()}${m.plannedTime ? ` das ${m.plannedTime}` : ''}` })
      for (const s of it.substitutions ?? []) {
        const sub = parseSubstitution(s)
        const sr = matchReference(sub.food, 'prefix')?.role
        if (!role || sr === role) options.push({ ref: m.ref, mealName: m.name, time: m.plannedTime, from: it.food, food: sub.food, qty: sub.qty, badge: 'troca', note: `troca do plano no ${m.name.toLowerCase()}, no lugar de ${shortFood(it.food)}` })
      }
    })
    if (!role && options.length) break
  }
  if (!options.length && role) {
    const seen = new Set<string>()
    for (const p of db.nutritionDayPlans.filter((x: NutritionDayPlan) => x.active && x.id !== day.plan?.id)) {
      for (const meal of p.meals)
        for (const it of meal.items)
          for (const f of [it.food, ...(it.substitutions ?? []).map((s) => parseSubstitution(s).food)]) {
            if (matchReference(f, 'prefix')?.role === role && !seen.has(normalize(f))) {
              seen.add(normalize(f))
              options.push({ food: f, badge: 'lumos', note: `aparece no seu plano de ${p.name.toLowerCase()}. ${OFF_PLAN_NOTE}` })
            }
          }
    }
  }
  const nutri = options.filter((o) => o.badge !== 'lumos')
  const summary = !day.plan
    ? 'Hoje não tem plano do nutri cadastrado — sem regra registrada pra sugerir.'
    : nutri.length
      ? `Cabe sim: ${joinPt([...new Set(nutri.slice(0, 3).map((o) => `${shortFood(o.food)} (${o.badge === 'troca' ? 'troca do plano' : 'do plano'})`))])}.`
      : options.length
        ? `${OFF_PLAN_NOTE} Uma ideia aproximada: ${joinPt(options.slice(0, 2).map((o) => shortFood(o.food)))} (aparece em outros dias do seu plano).`
        : 'Não achei nada assim no seu plano — melhor perguntar ao nutri.'
  return { options, summary }
}

/** Foods already eaten today (normalized reference keys / names) — to avoid repeating at dinner. */
function eatenKeys(db: DB, date: DateKey, nowMinutes: number): Set<string> {
  const day = dayMeals(db, date, nowMinutes)
  const names: string[] = []
  for (const m of day.meals) if (m.status === 'consumed') names.push(...(m.consumed?.foods?.length ? m.consumed.foods.map((f) => f.name) : m.items.map((i) => i.food)))
  for (const x of day.extras) names.push(...(x.foods?.length ? x.foods.map((f) => f.name) : [x.description]))
  return new Set(names.map((n) => matchReference(n, 'contains')?.key ?? normalize(n)))
}

/**
 * "me dá uma opção de jantar considerando o que já comi": the plan's dinner, swapping (with the
 * plan's own substitutions) only items she already ate today. Quantities/carbs never cut.
 */
export function dinnerOption(db: DB, date: DateKey, nowMinutes: number): { meal?: PlanMealView; draft?: AdjustmentDraft; summary: string } {
  const day = dayMeals(db, date, nowMinutes)
  const dinners = day.meals.filter((m) => m.phase === 'refeicao' || !m.phase)
  const meal = dinners.find((m) => /jantar|janta/i.test(m.name)) ?? dinners[dinners.length - 1]
  if (!meal) return { summary: 'Hoje não tem jantar no plano cadastrado.' }
  if (meal.status === 'consumed') return { meal, summary: 'O jantar de hoje já foi ✓' }
  const eaten = eatenKeys(db, date, nowMinutes)
  const base = meal.items
  let changed = false
  const items: BadgedFood[] = base.map((it) => {
    const key = matchReference(it.food, 'prefix')?.key ?? normalize(it.food)
    if (!eaten.has(key) || !it.substitutions?.length) return it
    const sub = it.substitutions.map(parseSubstitution).find((s) => !eaten.has(matchReference(s.food, 'prefix')?.key ?? normalize(s.food)))
    if (!sub) return it
    changed = true
    return { ...sub, badge: 'troca' as ContentSource }
  })
  if (!changed) return { meal, summary: `Seu ${meal.name.toLowerCase()} do plano já combina com o que você comeu hoje — pode manter.` }
  const swaps = items.filter((i, k) => i.badge === 'troca' && base[k].food !== i.food).map((i) => shortFood(i.food))
  return {
    meal,
    draft: { date, planMealRef: meal.ref, kind: 'trocar', items, reason: `Pra não repetir o que você já comeu hoje, uma opção do próprio plano: ${joinPt(swaps)}.`, status: 'proposed', by: 'lumos' },
    summary: `Opção pro ${meal.name.toLowerCase()}, só com trocas do seu plano: ${joinPt(swaps)}. O resto segue igual.`,
  }
}

/** "não vou fazer lanche hoje" — she decides; nothing else is cut or added to compensate. */
export function skipMeal(db: DB, date: DateKey, ref: string): { draft?: AdjustmentDraft; summary: string } {
  const meal = dayMeals(db, date).meals.find((m) => m.ref === ref)
  if (!meal) return { summary: 'Não achei essa refeição no plano de hoje.' }
  if (meal.status === 'consumed') return { summary: `O ${meal.name.toLowerCase()} já foi registrado — não dá pra pular.` }
  const training = meal.phase && meal.phase !== 'refeicao'
  return {
    draft: { date, planMealRef: ref, kind: 'pular', items: [], reason: `Você não vai fazer o ${meal.name.toLowerCase()} hoje.`, status: 'applied', by: 'marina' },
    summary: training
      ? `Tudo bem, tirei o ${meal.name.toLowerCase()} de hoje. É uma refeição do treino no seu plano — se mudar de ideia, é só desfazer.`
      : `Tudo bem, tirei o ${meal.name.toLowerCase()} de hoje. O resto do dia segue como planejado.`,
  }
}

/** "usar esta troca hoje" on one item (her choice from the plan's substitutions). */
export function swapDraft(view: PlanMealView, itemIndex: number, substitution: string, date: DateKey): AdjustmentDraft {
  const sub = parseSubstitution(substitution)
  const items: BadgedFood[] = view.items.map((it, i) => (i === itemIndex ? { ...sub, badge: 'troca' as ContentSource } : it))
  return { date, planMealRef: view.ref, kind: 'trocar', items, reason: `Troca do plano: ${shortFood(view.items[itemIndex].food)} → ${shortFood(sub.food)}.`, status: 'applied', by: 'marina' }
}
