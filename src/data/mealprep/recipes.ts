/**
 * "O que faço com essa porção?" — honest recipe templates that PRESERVE the plan's quantities.
 * A template only applies when the meal's own foods match it; nothing is added except seasoning
 * Marina already uses (sal, alho, ervas). No template fits → "monte assim…" with the items as they are.
 */
import type { DateKey, DB, MealPrepPlan } from '@/data/types'
import { startOfWeek } from '@/lib/date'
import { normalize } from '@/lib/text'
import { formatWeight } from './parse'
import { planFor, slotLabel, weekMenu, type MenuItem, type MenuMeal } from './menu'

export type Servings = 1 | 4

export interface RecipeIngredient {
  food: string
  /** Total for the servings asked ("400 g"), or the household text when there's no number. */
  amount: string
  /** One serving, exactly as in the plan. */
  perServing: string
  badge: MenuItem['badge']
}

export interface Recipe {
  /** Template id ('montagem' when no template fits). */
  template: string
  title: string
  emoji: string
  servings: Servings
  /** "SEG 12H · Almoço" */
  context: string
  ingredients: RecipeIngredient[]
  steps: string[]
  /** "1 porção = 490 g (exatamente o do plano)". */
  portion: string
  store: string
  carry: string
  reheat: string
  /** Always shown: quantities come from the plan. */
  note: string
  assembly: boolean
}

type Kind = 'carb' | 'bean' | 'protein' | 'veg' | 'egg' | 'cheese' | 'bread' | 'cuscuz' | 'pasta' | 'sauce' | 'leaves' | 'fruit' | 'drink' | 'powder' | 'oat' | 'seed' | 'other'

function kindOf(it: MenuItem): Kind {
  const ing = it.ingredient
  const role = ing.cook?.role
  if (ing.key === 'ovo') return 'egg'
  if (role === 'cuscuz') return 'cuscuz'
  if (role === 'massa') return 'pasta'
  if (role === 'grao' || role === 'tuberculo') return 'carb'
  if (role === 'feijao') return 'bean'
  if (role === 'proteina' || ing.key === 'peito-de-peru') return 'protein'
  if (role === 'legumes') return 'veg'
  if (ing.group === 'queijo') return 'cheese'
  if (ing.group === 'pao') return 'bread'
  if (ing.key === 'molho-tomate') return 'sauce'
  if (ing.key === 'folhas') return 'leaves'
  if (ing.key.startsWith('suco') || ing.key === 'acerola' || ing.key === 'agua-coco' || ing.key === 'cafe') return 'drink'
  if (ing.category === 'frutas') return 'fruit'
  if (ing.key === 'whey' || ing.key.startsWith('leite')) return 'powder'
  if (ing.key === 'aveia') return 'oat'
  if (['chia', 'gergelim', 'linhaca', 'psyllium'].includes(ing.key)) return 'seed'
  return 'other'
}

const amt = (it: MenuItem, n: number) => (it.free ? 'à vontade' : it.amount != null ? formatWeight(it.amount * n, it.unit ?? 'g') : (it.qty ?? ''))
const g1 = (it: MenuItem) => (it.free ? 'à vontade' : it.amount != null ? `${String(it.amount).replace('.', ',')} ${it.unit ?? 'g'}` : (it.qty ?? ''))
const name = (it: MenuItem) => it.ingredient.short

interface Ctx {
  meal: MenuMeal
  n: Servings
  by: Record<Kind, MenuItem[]>
  a: (it: MenuItem) => string
}

interface Template {
  id: string
  emoji: string
  test: (c: Ctx) => boolean
  title: (c: Ctx) => string
  steps: (c: Ctx) => string[]
  /** Overrides when the result keeps/travels differently from its raw items. */
  store?: string
  carry?: string
  reheat?: string
}

const one = (c: Ctx, k: Kind) => c.by[k][0]
const proteinWord = (it: MenuItem | undefined) => (it ? it.ingredient.short : 'proteína')
const portions = (c: Ctx, text: string) => (c.n === 4 ? `${text} Divida em 4 potes iguais.` : text)

const TEMPLATES: Template[] = [
  {
    id: 'cuscuz-cremoso-frango',
    emoji: '🌽',
    test: (c) => !!one(c, 'cuscuz') && c.by.protein.some((p) => p.ingredient.group === 'frango'),
    title: (c) => (c.by.cheese.length ? 'Cuscuz cremoso de frango' : 'Cuscuz com frango desfiado'),
    steps: (c) => {
      const cus = one(c, 'cuscuz')!
      const fr = c.by.protein.find((p) => p.ingredient.group === 'frango')!
      const ch = one(c, 'cheese')
      return [
        `Prepare ${c.a(cus)} de cuscuz (ou use o do meal prep) e solte com um garfo.`,
        `Aqueça ${c.a(fr)} de frango ${fr.ingredient.key === 'frango-desfiado' ? 'desfiado' : 'em tiras'} com alho e ervas.`,
        ch ? `Desligue o fogo e misture ${c.a(ch)} de ${name(ch)} no frango até ficar cremoso.` : 'Tempere a gosto (sal, alho, cheiro-verde).',
        portions(c, 'Junte com o cuscuz e sirva.'),
      ]
    },
  },
  {
    id: 'cuscuz-ovos',
    emoji: '🍳',
    test: (c) => !!one(c, 'cuscuz') && !!one(c, 'egg'),
    title: (c) => (c.n === 4 ? 'Cuscuz porcionado + omelete assada' : 'Cuscuz com ovos e queijo'),
    steps: (c) => {
      const cus = one(c, 'cuscuz')!
      const egg = one(c, 'egg')!
      const ch = one(c, 'cheese')
      const seed = one(c, 'seed')
      const out = [`Cuscuz: ${c.a(cus)} pronto (hidrate o flocão com água e sal 10 min e cozinhe ~10 min na cuscuzeira).`]
      out.push(
        c.n === 4
          ? `Omelete assada: bata ${c.a(egg)} de ovos (${Math.round(((egg.amount ?? 100) * c.n) / 50)} ovos) com sal, distribua em 4 forminhas e asse 20 min a 180 °C.`
          : `Ovos: mexa ${c.a(egg)} (${Math.round((egg.amount ?? 100) / 50)} ovos) com sal em fogo baixo.`,
      )
      if (ch) out.push(`Queijo: ${c.a(ch)} de ${name(ch)} — por cima do cuscuz quente ou separado.`)
      if (seed) out.push(`Finalize com ${c.a(seed)} de ${name(seed)}.`)
      if (c.n === 4) out.push('Porcione o cuscuz em 4 potes; omelete e queijo em potinhos separados.')
      return out
    },
  },
  {
    id: 'pao-recheado',
    emoji: '🥪',
    test: (c) => !!one(c, 'bread') && (!!one(c, 'egg') || !!one(c, 'protein') || !!one(c, 'cheese')),
    title: (c) => {
      const b = one(c, 'bread')!
      const fill = one(c, 'egg') ? 'ovo' : one(c, 'protein') ? proteinWord(one(c, 'protein')) : 'queijo'
      return b.ingredient.key === 'pao-sirio' ? `Pão sírio recheado de ${fill}` : `Sanduíche de ${fill}${one(c, 'cheese') && fill !== 'queijo' ? ' e queijo' : ''}`
    },
    steps: (c) => {
      const b = one(c, 'bread')!
      const egg = one(c, 'egg')
      const p = one(c, 'protein')
      const ch = one(c, 'cheese')
      const seed = one(c, 'seed')
      const out = [`Separe ${c.a(b)} de ${name(b)}${b.ingredient.key === 'pao-sirio' ? ' e abra em bolso' : ''}.`]
      if (egg) out.push(`Mexa ${c.a(egg)} de ovos com sal (ou use omelete assada).`)
      if (p) out.push(`Recheie com ${c.a(p)} de ${name(p)}.`)
      if (ch) out.push(`Junte ${c.a(ch)} de ${name(ch)}${egg ? ' ainda com o ovo quente, pra derreter' : ''}.`)
      if (seed) out.push(`Polvilhe ${c.a(seed)} de ${name(seed)} no recheio.`)
      out.push(c.n === 4 ? 'Monte 4 sanduíches, embrulhe cada um em papel-manteiga e guarde na geladeira (até 2 dias) ou congele.' : 'Feche, aperte e, se quiser, doure 2 min na frigideira.')
      return out
    },
  },
  {
    id: 'macarrao-sugo',
    emoji: '🍝',
    test: (c) => !!one(c, 'pasta') && !!one(c, 'sauce'),
    title: (c) => {
      const p = one(c, 'protein')
      if (p?.ingredient.key === 'patinho-moido') return 'Macarrão à bolonhesa'
      return p ? `Macarrão ao sugo com ${proteinWord(p)}` : 'Macarrão ao sugo'
    },
    steps: (c) => {
      const pa = one(c, 'pasta')!
      const s = one(c, 'sauce')!
      const p = one(c, 'protein')
      const ch = one(c, 'cheese')
      const out = [`Cozinhe o macarrão até chegar a ${c.a(pa)} pronto (al dente).`]
      if (p) out.push(`Refogue ${c.a(p)} de ${name(p)} com alho e cebola${p.ingredient.key === 'patinho-moido' ? ', soltinho' : ''}.`)
      out.push(`Junte ${c.a(s)} de molho de tomate e deixe apurar 3 min.`)
      out.push(portions(c, 'Misture com o macarrão.'))
      if (ch) out.push(`Na hora de comer: ${c.a(ch)} de ${name(ch)} por cima.`)
      return out
    },
  },
  {
    id: 'bowl-completo',
    emoji: '🍱',
    test: (c) => (!!one(c, 'carb') || !!one(c, 'pasta')) && !!one(c, 'bean') && !!one(c, 'protein'),
    title: (c) => `Bowl de ${name((one(c, 'carb') ?? one(c, 'pasta'))!)}, feijão e ${proteinWord(one(c, 'protein'))}`,
    steps: (c) => {
      const carb = (one(c, 'carb') ?? one(c, 'pasta'))!
      const b = one(c, 'bean')!
      const p = one(c, 'protein')!
      const v = one(c, 'veg')
      const out = [`Base: ${c.a(carb)} de ${name(carb)}.`, `Ao lado: ${c.a(b)} de ${name(b)} (com pouco caldo, pra não encharcar o pote).`, `Proteína: ${c.a(p)} de ${name(p)}, fatiado.`]
      if (v) out.push(`Legumes: ${c.a(v)} no vapor, al dente.`)
      out.push(c.n === 4 ? 'Monte 4 potes iguais; feijão num cantinho ou em potinho separado.' : 'Monte no prato ou no pote.')
      return out
    },
  },
  {
    id: 'batata-proteina',
    emoji: '🥔',
    test: (c) => c.by.carb.some((x) => x.ingredient.cook?.role === 'tuberculo') && !!one(c, 'protein'),
    title: (c) => `${capWord(name(one(c, 'carb')!))} com ${proteinWord(one(c, 'protein'))}${one(c, 'veg') ? ' e legumes' : ''}`,
    steps: (c) => {
      const carb = one(c, 'carb')!
      const p = one(c, 'protein')!
      const v = one(c, 'veg')
      const ch = one(c, 'cheese')
      const out = [`${capWord(name(carb))}: ${c.a(carb)} pronta.`, `${capWord(name(p))}: ${c.a(p)}, grelhado e fatiado.`]
      if (v) out.push(`Legumes no vapor: ${c.a(v)}.`)
      if (ch) out.push(`Finalize com ${c.a(ch)} de ${name(ch)}.`)
      out.push(c.n === 4 ? 'Divida em 4 potes iguais.' : 'Sirva.')
      return out
    },
  },
  {
    id: 'overnight',
    emoji: '🥣',
    test: (c) => c.by.powder.some((p) => p.ingredient.key === 'whey') && !!one(c, 'oat') && !!one(c, 'fruit'),
    title: () => 'Overnight proteico de fruta',
    store: 'Geladeira: até 2 dias, bem fechado. Não congele.',
    carry: 'Pote fechado na bolsa térmica 🧊 (precisa geladeira ❄️ até a hora).',
    reheat: 'Come gelado — não precisa aquecer.',
    steps: (c) => {
      const out = [`No pote: ${[...c.by.oat, ...c.by.powder].map((i) => `${c.a(i)} de ${name(i)}`).join(', ')}.`]
      out.push('Junte água (ou o leite do plano) até cobrir, mexa bem e deixe na geladeira de um dia pro outro.')
      out.push(`Na hora: ${c.by.fruit.map((f) => `${c.a(f)} de ${name(f)}`).join(' + ')} por cima.`)
      if (c.n === 4) out.push('Faça 4 potes (dura 2 dias na geladeira; o resto, monte na véspera).')
      return out
    },
  },
  {
    id: 'shake',
    emoji: '🥤',
    test: (c) => c.by.powder.some((p) => p.ingredient.key === 'whey'),
    title: () => 'Shake no shaker',
    store: 'Kit seco: dura a semana fora da geladeira. Depois de misturado, beba na hora.',
    carry: 'Shaker seco na bolsa 🎒; água gelada na hora.',
    reheat: 'Não precisa aquecer.',
    steps: (c) => {
      const out = [`Shaker: ${c.by.powder.concat(c.by.oat).map((i) => `${c.a(i)} de ${name(i)}`).join(' + ')}.`, 'Na hora, água gelada e chacoalhe.']
      if (c.by.fruit.length) out.push(`Junto: ${c.by.fruit.map((f) => `${c.a(f)} de ${name(f)}`).join(' + ')}.`)
      if (c.n === 4) out.push('Monte 4 kits secos de uma vez (saquinhos ou potinhos).')
      return out
    },
  },
  {
    id: 'salada-pote',
    emoji: '🥗',
    test: (c) => !!one(c, 'leaves') && !!one(c, 'protein') && !!(one(c, 'carb') || one(c, 'cuscuz') || one(c, 'pasta')),
    title: () => 'Salada de pote',
    steps: (c) => {
      const carb = (one(c, 'carb') ?? one(c, 'cuscuz') ?? one(c, 'pasta'))!
      const p = one(c, 'protein')!
      return [
        'Molho (se usar) no fundo do pote.',
        `Depois ${c.a(carb)} de ${name(carb)} e ${c.a(p)} de ${name(p)}.`,
        'Folhas à vontade por cima, sem encostar no molho. Misture só na hora.',
        c.n === 4 ? 'Faça os 4 potes — folhas aguentam bem até 3–4 dias assim.' : 'Feche e leve.',
      ]
    },
  },
]

const capWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const SIDE: Kind[] = ['drink', 'fruit', 'leaves', 'seed', 'powder', 'oat']

function storeText(meal: MenuMeal): string {
  const main = meal.items.filter((i) => !SIDE.includes(kindOf(i)))
  const cooked = main.filter((i) => i.ingredient.potted)
  const judge = cooked.length ? cooked : main
  const days = judge.length ? Math.min(...judge.map((i) => i.ingredient.storage.fridgeDays)) : 3
  const bad = judge.filter((i) => !i.ingredient.storage.freezer).map((i) => name(i))
  const leaves = meal.items.some((i) => i.ingredient.key === 'folhas')
  const parts = [`Geladeira: até ${Math.min(days, 3)} dias.`]
  parts.push(
    !judge.length || bad.length
      ? `Freezer: melhor não${bad.length ? ` (${bad.join(', ')} não congela bem)` : ''}.`
      : 'Freezer: até 1 mês — descongele na geladeira na noite anterior.',
  )
  if (leaves) parts.push('Folhas em pote separado, com papel-toalha.')
  return parts.join(' ')
}

function carryText(meal: MenuMeal): string {
  const icons = new Set(meal.items.flatMap((i) => i.ingredient.carry.icons))
  if (icons.has('microondas')) return 'Pote fechado na bolsa térmica 🧊 — precisa geladeira ❄️ e micro-ondas 🔥.'
  if (icons.has('termica')) return 'Na bolsa térmica 🧊 (precisa geladeira ❄️ até a hora).'
  return 'Pode ir na bolsa 🎒.'
}

function reheatText(meal: MenuMeal): string {
  const hot = meal.items.some((i) => ['grao', 'feijao', 'massa', 'tuberculo', 'proteina', 'legumes', 'cuscuz'].includes(i.ingredient.cook?.role ?? ''))
  if (!hot) return 'Não precisa aquecer.'
  const extra = meal.items.filter((i) => !i.ingredient.potted && !['drink', 'egg', 'fruit'].includes(kindOf(i))).map((i) => name(i))
  return `Micro-ondas 2–3 min, mexendo na metade (tampa entreaberta).${extra.length ? ` ${capWord(extra.join(', '))}: só depois de aquecer.` : ''}`
}

/** Builds the recipe for a meal of the menu. Pure. */
export function recipeForMeal(meal: MenuMeal, servings: Servings = 1): Recipe {
  const by = Object.fromEntries(
    (['carb', 'bean', 'protein', 'veg', 'egg', 'cheese', 'bread', 'cuscuz', 'pasta', 'sauce', 'leaves', 'fruit', 'drink', 'powder', 'oat', 'seed', 'other'] as Kind[]).map((k) => [k, [] as MenuItem[]]),
  ) as Record<Kind, MenuItem[]>
  for (const it of meal.items) by[kindOf(it)].push(it)
  const c: Ctx = { meal, n: servings, by, a: (it) => amt(it, servings) }
  const t = TEMPLATES.find((x) => x.test(c))
  const ingredients: RecipeIngredient[] = meal.items.map((it) => ({ food: it.food, amount: amt(it, servings), perServing: g1(it), badge: it.badge }))
  const totalOne = meal.items.reduce((s, it) => s + (!it.free && it.unit !== 'ml' && it.amount != null ? it.amount : 0), 0)
  const drinks = by.drink.map((d) => `${d.ingredient.short} (${g1(d)})`)
  const portion = `${servings === 4 ? '4 porções de' : '1 porção ='} ~${Math.round(totalOne)} g de comida${drinks.length ? ` + ${drinks.join(', ')}` : ''} — exatamente o do plano.`
  const base = {
    servings,
    context: `${slotLabel(meal.date, meal.time)} · ${meal.name}`,
    ingredients,
    portion,
    store: t?.store ?? storeText(meal),
    carry: t?.carry ?? carryText(meal),
    reheat: t?.reheat ?? reheatText(meal),
    note: 'Quantidades do seu plano — a receita só organiza o preparo, não muda nada.',
  }
  if (t) {
    const steps = t.steps(c)
    // Every item of the plan must appear: whatever the template didn't use goes along as is.
    const rest = meal.items.filter((it) => !steps.some((s) => normalize(s).includes(normalize(name(it)))))
    if (rest.length) steps.push(`Acompanha: ${rest.map((r) => `${r.ingredient.short} (${c.a(r)})`).join(' · ')}.`)
    return { ...base, template: t.id, title: t.title(c), emoji: t.emoji, steps, assembly: false }
  }
  return {
    ...base,
    template: 'montagem',
    title: `Monte assim: ${meal.name.toLowerCase()}`,
    emoji: '🧺',
    steps: [...meal.items.map((it) => `${capWord(it.ingredient.short)}: ${c.a(it)}.`), servings === 4 ? 'Repita em 4 potinhos/saquinhos.' : 'Pronto — sem receita, só montar.'],
    assembly: true,
  }
}

/** Template-based recipe for a day's meal (index = the plan's meal index), 1 or 4 servings. */
export function recipeFor(db: DB, date: DateKey, mealIndex: number, servings: Servings = 1, plan: MealPrepPlan | undefined = planFor(db, date)): Recipe | undefined {
  const day = weekMenu(db, startOfWeek(date), plan).days.find((d) => d.date === date)
  const meal = day?.meals.find((m) => m.index === mealIndex)
  return meal ? recipeForMeal(meal, servings) : undefined
}
