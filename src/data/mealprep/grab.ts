/**
 * "Peguei e saí": breakfast / pré / pós / intra / lanche turned into ready-to-grab formats.
 * Rule-based by food category (bread + protein → sanduíche; cuscuz → pote porcionado + omelete
 * assada; whey + leite em pó → kit seco no shaker; castanhas → saquinho; fruta → inteira ou pote).
 * Quantities are always the plan's. Nothing new is added (no wrap tortilla, no extra food).
 */
import type { DateKey, DB, MealPrepPlan, TimeHM } from '@/data/types'
import type { KitIcon } from './catalog'
import { planFor, shortItem, slotLabel, weekMenu, type MealPlace, type MenuItem, type MenuMeal, type WeekMenu } from './menu'
import { potsFromMenu } from './batch'

export type PrepWhen = 'domingo' | 'vespera' | 'na_hora'

export interface GrabItem {
  title: string
  /** Contents with the plan's quantities ("pão sírio 90g · ovo 100g · muçarela 20g"). */
  detail: string
  icons: KitIcon[]
  /** What to do ahead, and when. */
  prep?: string
  when: PrepWhen
  /** Item keys covered. */
  itemKeys: string[]
}

export interface GrabMeal {
  date: DateKey
  mealIndex: number
  time?: TimeHM
  name: string
  label: string
  place: MealPlace
  items: GrabItem[]
}

const has = (items: MenuItem[], pred: (i: MenuItem) => boolean) => items.filter(pred)
const k = (i: MenuItem) => i.ingredient.key
const g = (i: MenuItem) => i.ingredient.group
const role = (i: MenuItem) => i.ingredient.cook?.role
const SEEDS = new Set(['chia', 'gergelim', 'linhaca', 'psyllium'])
const PROTEIN_FILL = (i: MenuItem) => k(i) === 'ovo' || k(i) === 'peito-de-peru' || g(i) === 'frango' || k(i) === 'patinho-moido'
const COLD: KitIcon[] = ['geladeira', 'termica']
const COLD_HOT: KitIcon[] = ['geladeira', 'microondas', 'termica']
const list = (xs: MenuItem[]) => xs.map(shortItem).join(' · ')

/** Converts one meal's items. Pure; exported for the kit and for Lumos. */
export function grabItemsFor(meal: MenuMeal): GrabItem[] {
  const items = meal.items
  const used = new Set<string>()
  const out: GrabItem[] = []
  const take = (xs: MenuItem[]) => xs.forEach((x) => used.add(x.key))
  const away = meal.place === 'fora'

  const breads = has(items, (i) => g(i) === 'pao')
  const fills = has(items, PROTEIN_FILL)
  const cheeses = has(items, (i) => g(i) === 'queijo' && k(i) !== 'canastra')
  const seeds = has(items, (i) => SEEDS.has(k(i)))
  const cuscuz = has(items, (i) => role(i) === 'cuscuz' || k(i) === 'inhame')

  if (breads.length && (fills.length || cheeses.length)) {
    const sirio = breads.some((b) => k(b) === 'pao-sirio')
    const parts = [...breads, ...fills, ...cheeses, ...seeds]
    take(parts)
    out.push({
      title: sirio ? 'Pão sírio recheado' : 'Sanduíche pronto',
      detail: list(parts),
      icons: COLD,
      prep: fills.some((f) => k(f) === 'ovo') ? 'Ovo mexido ou omelete na noite anterior; monte, embrulhe em papel-manteiga e guarde na geladeira.' : 'Monte na noite anterior, embrulhe e guarde na geladeira.',
      when: 'vespera',
      itemKeys: parts.map((p) => p.key),
    })
  } else if (cuscuz.length) {
    const inPot = [...cuscuz, ...seeds, ...fills.filter((f) => g(f) === 'frango')]
    take(inPot)
    out.push({
      title: `Pote de ${cuscuz.map((c) => c.ingredient.short).join(' + ')} porcionado`,
      detail: list(inPot),
      icons: COLD_HOT,
      prep: 'Porcionado no dia do meal prep (já com a semente por cima).',
      when: 'domingo',
      itemKeys: inPot.map((p) => p.key),
    })
    const eggs = fills.filter((f) => k(f) === 'ovo')
    if (eggs.length) {
      take(eggs)
      out.push({ title: 'Omelete assada individual', detail: list(eggs), icons: COLD_HOT, prep: away ? 'Assada no meal prep — 3 dias na geladeira.' : 'Ou ovo mexido na hora, 3 min.', when: away ? 'domingo' : 'na_hora', itemKeys: eggs.map((e) => e.key) })
    }
    const rest = fills.filter((f) => !used.has(f.key))
    if (rest.length) {
      take(rest)
      out.push({ title: 'Proteína separada', detail: list(rest), icons: COLD_HOT, when: 'domingo', itemKeys: rest.map((r) => r.key) })
    }
    if (cheeses.length) {
      take(cheeses)
      out.push({ title: 'Queijo separado', detail: list(cheeses), icons: COLD, when: 'vespera', itemKeys: cheeses.map((c) => c.key) })
    }
  }

  // Shaker: whey + leite em pó (+ aveia). Liquid milk travels apart.
  const powders = has(items, (i) => !used.has(i.key) && (k(i) === 'whey' || k(i) === 'leite-po' || k(i) === 'leite-po-desnatado' || k(i) === 'aveia'))
  if (powders.some((p) => k(p) === 'whey')) {
    take(powders)
    out.push({
      title: 'Kit seco no shaker',
      detail: list(powders),
      icons: ['bolsa'],
      prep: 'Coloque o pó no shaker seco na noite anterior; na hora é só água gelada e chacoalhar.',
      when: 'vespera',
      itemKeys: powders.map((p) => p.key),
    })
    const milk = has(items, (i) => !used.has(i.key) && k(i) === 'leite-uht')
    if (milk.length) {
      take(milk)
      out.push({ title: 'Leite gelado na garrafinha', detail: list(milk), icons: COLD, prep: 'Misture no shaker na hora.', when: 'vespera', itemKeys: milk.map((m) => m.key) })
    }
  }

  // Intra combo: pão de queijo + queijo in a bag.
  const pq = has(items, (i) => !used.has(i.key) && (k(i) === 'pao-de-queijo' || k(i) === 'canastra'))
  if (pq.some((p) => k(p) === 'pao-de-queijo')) {
    take(pq)
    out.push({ title: 'Saquinho do intra', detail: list(pq), icons: ['bolsa'], prep: 'Asse o pão de queijo na véspera e separe o queijo.', when: 'vespera', itemKeys: pq.map((p) => p.key) })
  }

  // Café + canela.
  const coffee = has(items, (i) => !used.has(i.key) && (k(i) === 'cafe' || k(i) === 'canela'))
  if (coffee.some((c) => k(c) === 'cafe')) {
    take(coffee)
    out.push({ title: away ? 'Café com canela na garrafinha térmica' : 'Café coado com canela', detail: list(coffee), icons: away ? ['bolsa'] : [], when: 'na_hora', itemKeys: coffee.map((c) => c.key) })
  }

  // Everything else, one by one, with its default carry form.
  for (const it of items) {
    if (used.has(it.key)) continue
    const ing = it.ingredient
    let title = cap(it.ingredient.short)
    let when: PrepWhen = 'na_hora'
    let prep: string | undefined
    if (ing.group === 'castanha') {
      title = `Saquinho de ${ing.short}`
      when = 'domingo'
      prep = 'Porcione os saquinhos da semana de uma vez.'
    } else if (ing.category === 'frutas' && ing.carry.form.includes('pote')) {
      title = `Pote de ${ing.short}`
      when = 'vespera'
      prep = ing.key === 'salada-frutas' ? 'Corte a cada 2 dias; a banana, na hora.' : 'Lave/corte na véspera.'
    } else if (ing.key.startsWith('suco') || ing.key === 'acerola') {
      title = `${cap(ing.short)} na garrafinha`
      when = 'vespera'
      prep = 'Prepare na véspera e deixe na geladeira.'
    } else if (ing.category === 'frutas') {
      title = cap(ing.short)
      prep = 'Vai inteira, lavada e seca.'
    } else if (ing.key === 'gel' || ing.key === 'gatorade') {
      title = ing.key === 'gel' ? 'Gel no bolso' : 'Isotônico na garrafa'
    } else if (ing.key === 'doce-de-leite' || ing.key === 'mel' || ing.key === 'goiabada') {
      title = `Potinho de ${ing.short}`
      when = 'domingo'
      prep = 'Porcione os potinhos da semana de uma vez.'
    }
    out.push({ title, detail: shortItem(it), icons: ing.carry.icons, prep, when, itemKeys: [it.key] })
  }
  return out
}

/** Meals that are not pots (breakfast, pré/pós/intra, lanches) as grab-and-go formats. */
export function grabFromMenu(menu: WeekMenu): GrabMeal[] {
  const potKeys = new Set(potsFromMenu(menu).map((p) => p.key))
  const out: GrabMeal[] = []
  for (const day of menu.days)
    for (const m of day.meals) {
      if (potKeys.has(m.potKey)) continue
      out.push({ date: day.date, mealIndex: m.index, time: m.time, name: m.name, label: slotLabel(day.date, m.time), place: m.place, items: grabItemsFor(m) })
    }
  return out
}

export interface GrabGroup {
  /** "Café da manhã (pós-treino) · 08:00" */
  title: string
  name: string
  time?: TimeHM
  /** Days sharing exactly the same format. */
  days: { date: DateKey; label: string; place: MealPlace }[]
  items: GrabItem[]
}

/** Same meal, same format → one card ("SEG · QUA · QUI — pote de cuscuz + omelete + queijo"). */
export function groupGrab(meals: GrabMeal[]): GrabGroup[] {
  const map = new Map<string, GrabGroup>()
  for (const m of meals) {
    const sig = `${m.name}|${m.time}|${m.items.map((i) => `${i.title}:${i.detail}`).join('|')}`
    const g0 = map.get(sig) ?? { title: `${m.name}${m.time ? ` · ${m.time}` : ''}`, name: m.name, time: m.time, days: [], items: m.items }
    g0.days.push({ date: m.date, label: m.label.split(' ')[0], place: m.place })
    map.set(sig, g0)
  }
  return [...map.values()].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.days[0].date.localeCompare(b.days[0].date))
}

/** Breakfast/pre/pos/snack conversions for the week. */
export function grabAndGo(db: DB, weekStart: DateKey, plan: MealPrepPlan | undefined = planFor(db, weekStart)): GrabMeal[] {
  return grabFromMenu(weekMenu(db, weekStart, plan))
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
