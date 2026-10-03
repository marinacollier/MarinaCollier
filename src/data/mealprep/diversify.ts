/**
 * "Diversifica um pouco" — variety without complicating (section 7): never seven proteins, never a
 * new food. Proposals come ONLY from PlannedFood.substitutions, prefer ingredients already bought
 * this week (reuse), respect profile.foodPrefs (dislikes are never picked; a disliked prescribed item
 * is swapped first), and stay few.
 */
import type { DateKey, DB, MealPrepPlan } from '@/data/types'
import { normalize } from '@/lib/text'
import { buyKeyOf, ingredientOf } from './catalog'
import { parseSubstitution } from './parse'
import { planFor, slotLabel, weekMenu, type MenuItem, type MenuMeal, type WeekMenu } from './menu'

export interface DiversifyProposal {
  /** MealPrepPlan.choices key. */
  key: string
  date: DateKey
  /** "TER 12H · Almoço" */
  where: string
  from: string
  /** Exactly one of the item's prescribed substitutions. */
  to: string
  reason: string
}

export interface DiversifyOptions {
  /** Max variety swaps (dislike swaps don't count). Default 3. */
  max?: number
  plan?: MealPrepPlan
}

const words = (list: string[] | undefined) => (list ?? []).map(normalize).filter(Boolean)
const mentions = (text: string, list: string[]) => {
  const n = normalize(text)
  return list.some((w) => n.includes(w))
}

function weekBuyKeys(menu: WeekMenu): Set<string> {
  const s = new Set<string>()
  for (const d of menu.days) for (const m of d.meals) for (const it of m.items) s.add(buyKeyOf(it.ingredient))
  return s
}

function weekGroups(menu: WeekMenu): Set<string> {
  const s = new Set<string>()
  for (const d of menu.days) for (const m of d.meals) for (const it of m.items) if (it.ingredient.group) s.add(it.ingredient.group)
  return s
}

const optionsOf = (it: MenuItem, dislikes: string[]) => it.substitutions.filter((s) => !mentions(parseSubstitution(s).food, dislikes))

function score(sub: string, bought: Set<string>, groups: Set<string>, likes: string[]): number {
  const ing = ingredientOf(parseSubstitution(sub).food)
  let s = 0
  if (bought.has(buyKeyOf(ing))) s += 3
  else if (ing.group && groups.has(ing.group)) s += 2
  if (mentions(sub, likes)) s += 2
  return s
}

const where = (m: MenuMeal) => `${slotLabel(m.date, m.time)} · ${m.name}`

/** Proposes a few choices using ONLY the plan's substitutions, keeping a common base. */
export function diversifyMenu(db: DB, menu: WeekMenu, opts: DiversifyOptions = {}): DiversifyProposal[] {
  const max = opts.max ?? 3
  const dislikes = words(db.profile.foodPrefs?.dislikes)
  const likes = words(db.profile.foodPrefs?.likes)
  const bought = weekBuyKeys(menu)
  const groups = weekGroups(menu)
  const proposals: DiversifyProposal[] = []
  const taken = new Set<string>()
  const push = (m: MenuMeal, it: MenuItem, to: string, reason: string) => {
    if (taken.has(it.key)) return
    taken.add(it.key)
    proposals.push({ key: it.key, date: m.date, where: where(m), from: it.food, to, reason })
  }

  // 1) Prescribed items she doesn't like → best liked/reused substitution.
  for (const d of menu.days)
    for (const m of d.meals)
      for (const it of m.items) {
        if (it.badge === 'troca' || !mentions(it.food, dislikes)) continue
        const opts2 = optionsOf(it, dislikes).sort((a, b) => score(b, bought, groups, likes) - score(a, bought, groups, likes))
        if (opts2[0]) push(m, it, opts2[0], `Você prefere evitar ${it.ingredient.short} — essa troca é do seu nutri.`)
      }

  let variety = 0
  const room = () => variety < max
  const candidates = (pred: (it: MenuItem) => boolean) =>
    menu.days.flatMap((d) => d.meals.flatMap((m) => m.items.filter((it) => it.badge === 'nutri' && !taken.has(it.key) && pred(it)).map((it) => ({ d, m, it }))))
  const pick = (it: MenuItem, test: (food: string) => boolean) =>
    optionsOf(it, dislikes)
      .filter((s) => test(parseSubstitution(s).food))
      .sort((a, b) => score(b, bought, groups, likes) - score(a, bought, groups, likes))[0]

  // 2) Presencial lunches: same chicken, shredded — keeps better in a lunchbox.
  for (const { d, m, it } of candidates((it) => it.ingredient.key === 'frango')) {
    if (!room()) break
    if (!d.presencial || m.place !== 'fora' || m.phase !== 'refeicao') continue
    const to = pick(it, (f) => ingredientOf(f).key === 'frango-desfiado')
    if (to) {
      push(m, it, to, 'Mesmo frango, desfiado: aguenta melhor na marmita e muda a textura.')
      variety++
    }
  }

  // 3) Breakfast that leaves the house: bread that travels (pão sírio recheado / sanduíche).
  for (const { d, m, it } of candidates((it) => it.ingredient.cook?.role === 'cuscuz')) {
    if (!room()) break
    if (!d.presencial || m.place !== 'fora' || m.phase === 'refeicao') continue
    const to = pick(it, (f) => ingredientOf(f).group === 'pao')
    if (to) {
      push(m, it, to, 'Vira pão recheado: pega e sai, sem pote pra esquentar.')
      variety++
    }
  }

  // 4) One remote-day lunch with a protein already bought for another day (reuse, not a new purchase).
  const lunchFrango = candidates((it) => it.ingredient.group === 'frango').filter(({ d, m }) => !d.presencial && m.phase === 'refeicao' && m.place === 'casa')
  for (const { m, it } of lunchFrango) {
    if (!room()) break
    const to = pick(it, (f) => {
      const ing = ingredientOf(f)
      return ing.group !== 'frango' && ing.group !== 'ovo' && (bought.has(buyKeyOf(ing)) || (!!ing.group && groups.has(ing.group)))
    })
    if (to) {
      const ing = ingredientOf(parseSubstitution(to).food)
      push(m, it, to, `Aproveita ${ing.group === 'carne' ? 'a carne' : `o ${ing.short}`} que já entra na semana — variedade sem compra extra.`)
      variety++
      break
    }
  }

  return proposals
}

export function diversify(db: DB, weekStart: DateKey, opts: DiversifyOptions = {}): DiversifyProposal[] {
  const plan = opts.plan ?? planFor(db, weekStart)
  return diversifyMenu(db, weekMenu(db, weekStart, plan), opts)
}

/** Merge proposals into a choices map (for actions.update('mealPrepPlans', …)). */
export function applyProposals(choices: Record<string, string>, proposals: DiversifyProposal[]): Record<string, string> {
  return { ...choices, ...Object.fromEntries(proposals.map((p) => [p.key, p.to])) }
}
