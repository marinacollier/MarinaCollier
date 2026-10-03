import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import type { DB, MealPrepPlan } from '@/data/types'
import {
  applyProposals,
  batchPlan,
  diversify,
  emptyPlanData,
  grabAndGo,
  ingredientOf,
  parseQty,
  parseSubstitution,
  pots,
  prepChecklistFor,
  presencialKit,
  purchaseFor,
  recipeFor,
  shoppingList,
  storage,
  weekMenu,
  weekReport,
} from './index'
import { dozens, weightRange } from './shopping'

const WEEK = '2026-10-05' // Monday; Tue 06 / Wed 07 presencial in her seed
const seed = () => buildSeed('2026-10-02')
const withPlan = (db: DB, patch: Partial<MealPrepPlan> = {}): MealPrepPlan => {
  const plan: MealPrepPlan = { id: 'mp', createdAt: '', updatedAt: '2026-10-03T00:00:00Z', ...emptyPlanData(WEEK), ...patch }
  db.mealPrepPlans = [plan]
  return plan
}

describe('parse', () => {
  it('reads grams/ml, counts and "à vontade"', () => {
    expect(parseQty('2 bife(s) pequeno(s) (100g)')).toEqual({ amount: 100, unit: 'g', count: 2 })
    expect(parseQty('1 Copo(s) americano(s) duplo(s) (240ml)')).toMatchObject({ amount: 240, unit: 'ml' })
    expect(parseQty('2.3 Colher(es) de servir cheia(s) (125.7g)').amount).toBe(125.7)
    expect(parseQty('À vontade')).toEqual({ free: true })
    expect(parseSubstitution('Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)')).toEqual({ food: 'Frango desfiado', qty: '4 colher(es) de sopa cheia(s) (100g)' })
    expect(parseSubstitution('Castanha do Brasil (castanha do Pará, castanha da Amazônia) - 4 unidade(s) (16g)').food).toMatch(/^Castanha do Brasil/)
  })

  it('classifies the plan foods (specific before generic)', () => {
    expect(ingredientOf('Frango desfiado').key).toBe('frango-desfiado')
    expect(ingredientOf('Filé de frango grelhado').key).toBe('frango')
    expect(ingredientOf('Filet Mignon Suíno Assado').key).toBe('suino')
    expect(ingredientOf('Pão de queijo assado').key).toBe('pao-de-queijo')
    expect(ingredientOf('Doce de leite cremoso').key).toBe('doce-de-leite')
    expect(ingredientOf('Leite de vaca integral em pó').key).toBe('leite-po')
    expect(ingredientOf('Queijo muçarela/mussarela').key).toBe('mussarela')
    expect(ingredientOf('Gel - Endurance - Tangerina (Marca: Vitafor)').key).toBe('gel')
    expect(ingredientOf('Macarrão integral cozido').key).toBe('macarrao-integral')
    expect(ingredientOf('Maçã Argentina').key).toBe('maca')
    expect(ingredientOf('Batata doce cozida').key).toBe('batata-doce')
  })
})

describe('week menu (real seed)', () => {
  it('uses a different prescribed plan per day type, never one plan for all', () => {
    const m = weekMenu(seed(), WEEK)
    expect(m.days).toHaveLength(7)
    const names = m.days.map((d) => d.planName)
    expect(names).toEqual(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'])
    const lunchCarb = (i: number) => m.days[i].meals.find((x) => x.name === 'Almoço')!.items[1]
    expect(lunchCarb(0).food).toBe('Arroz branco cozido')
    expect(lunchCarb(1).food).toBe('Arroz integral cozido') // Tuesday differs
    expect(lunchCarb(1).amount).toBe(80)
  })

  it('marks Tue/Wed presencial and places meals out of the house', () => {
    const m = weekMenu(seed(), WEEK)
    expect(m.days.filter((d) => d.presencial).map((d) => d.short)).toEqual(['TER', 'QUA'])
    const tue = m.days[1]
    expect(tue.out).toMatchObject({ leave: '05:30' })
    const place = (t: string) => tue.meals.find((x) => x.time === t)!.place
    expect(place('05:00')).toBe('casa')
    expect(place('08:00')).toBe('fora')
    expect(place('12:00')).toBe('fora')
    expect(place('16:00')).toBe('fora')
    expect(place('20:00')).toBe('casa') // back after yoga
    expect(m.days[0].meals.every((x) => x.place !== 'fora')).toBe(true)
  })

  it('honours a choice only when it is a prescribed substitution', () => {
    const db = seed()
    const sub = 'Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)'
    withPlan(db, { choices: { '2026-10-05#2#3': sub, '2026-10-05#2#1': 'Pizza - 1 fatia (100g)' } })
    const lunch = weekMenu(db, WEEK).days[0].meals.find((x) => x.index === 2)!
    expect(lunch.items[3]).toMatchObject({ food: 'Frango desfiado', amount: 100, badge: 'troca' })
    expect(lunch.items[3].original?.food).toBe('Filé de frango grelhado')
    expect(lunch.items[1]).toMatchObject({ food: 'Arroz branco cozido', badge: 'nutri' })
  })

  it('applies a one-day meal time override and drops cancelled meals', () => {
    const db = seed()
    const planId = weekMenu(db, WEEK).days[0].planId!
    db.scheduleOverrides = [
      { id: 'o1', createdAt: '', updatedAt: '', date: '2026-10-05', refType: 'planMeal', refId: `${planId}#3`, time: '17:00', by: 'marina' },
      { id: 'o2', createdAt: '', updatedAt: '', date: '2026-10-05', refType: 'planMeal', refId: `${planId}#4`, cancelled: true, by: 'marina' },
    ]
    const mon = weekMenu(db, WEEK).days[0]
    expect(mon.meals.find((x) => x.index === 3)).toMatchObject({ time: '17:00', moved: true })
    expect(mon.meals.some((x) => x.index === 4)).toBe(false)
  })
})

describe('diversify', () => {
  it('only proposes prescribed substitutions, a few, reusing the week base', () => {
    const db = seed()
    const props = diversify(db, WEEK)
    expect(props.length).toBeGreaterThan(0)
    expect(props.length).toBeLessThanOrEqual(3)
    const menu = weekMenu(db, WEEK)
    for (const p of props) {
      const [date, mi, ii] = p.key.split('#')
      const item = menu.days.find((d) => d.date === date)!.meals.find((m) => m.index === Number(mi))!.items[Number(ii)]
      expect(item.substitutions).toContain(p.to)
    }
    // Presencial lunch keeps chicken, shredded.
    expect(props.find((p) => p.key.startsWith('2026-10-07#2'))?.to).toMatch(/^Frango desfiado/)
  })

  it('never picks a disliked food and swaps a disliked prescribed item first', () => {
    const db = seed()
    db.profile.foodPrefs = { likes: [], dislikes: ['suíno', 'cuscuz'] }
    const props = diversify(db, WEEK, { max: 5 })
    expect(props.some((p) => /suino|suíno/i.test(p.to))).toBe(false)
    const cuscuzSwaps = props.filter((p) => /cuscuz/i.test(p.from))
    expect(cuscuzSwaps.length).toBeGreaterThan(0)
    expect(cuscuzSwaps.every((p) => !/cuscuz/i.test(p.to))).toBe(true)
    // Tuesday's prescribed pork lunch gets swapped too.
    expect(props.find((p) => p.key === '2026-10-06#2#3')).toBeTruthy()
  })

  it('applyProposals merges into choices', () => {
    expect(applyProposals({ a: 'x' }, [{ key: 'b', to: 'y', date: '', where: '', from: '', reason: '' }])).toEqual({ a: 'x', b: 'y' })
  })
})

describe('shopping list', () => {
  it('rounds like a real purchase', () => {
    expect(weightRange(1200, 1350)).toBe('aproximadamente 1,2–1,4 kg')
    expect(weightRange(410, 480)).toBe('aproximadamente 400–500 g')
    expect(dozens(5)).toBe('meia dúzia')
    expect(dozens(12)).toBe('1 dúzia')
    expect(dozens(14)).toBe('1 dúzia e meia')
    expect(dozens(20)).toBe('2 dúzias')
    // ~900 g de frango pronto → peito cru ~1,2–1,4 kg
    expect(purchaseFor(ingredientOf('Filé de frango grelhado'), 900, 'g').buy).toBe('aproximadamente 1,2–1,4 kg')
    // arroz cozido ≈ 2,5–3× o cru → 1 pacote
    expect(purchaseFor(ingredientOf('Arroz branco cozido'), 750, 'g').buy).toBe('1 pacote de 1 kg')
    expect(purchaseFor(ingredientOf('Banana prata'), 585, 'g').buy).toBe('9 bananas prata')
  })

  it('consolidates the week by category and subtracts the pantry', () => {
    const db = seed()
    const list = shoppingList(db, WEEK)
    const labels = list.groups.map((g) => g.label)
    expect(labels[0]).toBe('Proteínas e laticínios')
    expect(labels).toContain('Pré/intra-treino')
    const frango = list.groups.flatMap((g) => g.lines).find((l) => l.buyKey === 'frango')!
    expect(frango.buy).toMatch(/^aproximadamente \d,\d–\d,\d kg$/)
    expect(frango.approx).toBe(true)

    withPlan(db, { pantry: ['ovos', 'arroz branco'] })
    const after = shoppingList(db, WEEK)
    const keys = after.groups.flatMap((g) => g.lines).map((l) => l.buyKey)
    expect(keys).not.toContain('ovo')
    expect(keys).not.toContain('arroz-branco')
    expect(keys).toContain('arroz-integral') // "arroz branco" doesn't remove integral
    expect(after.atHome.map((l) => l.buyKey).sort()).toEqual(['arroz-branco', 'ovo'])
  })

  it('a swap changes the purchase (frango desfiado shares the chicken purchase)', () => {
    const db = seed()
    const before = shoppingList(db, WEEK).groups.flatMap((g) => g.lines).find((l) => l.buyKey === 'frango')!.total
    withPlan(db, { choices: { '2026-10-06#2#3': 'Frango desfiado - 5 colher(es) de sopa cheia(s) (125g)' } })
    const lines = shoppingList(db, WEEK).groups.flatMap((g) => g.lines)
    expect(lines.find((l) => l.buyKey === 'frango')!.total).toBe(before + 125)
    expect(lines.some((l) => l.buyKey === 'suino')).toBe(false)
  })
})

describe('batch, pots and storage', () => {
  it('pots carry the exact plan grams in the "SEG 12H — …" format', () => {
    const list = pots(seed(), WEEK)
    expect(list.find((p) => p.key === '2026-10-05#2')!.line).toBe('SEG 12H — arroz 150g · feijão 130g · frango 100g · legumes 110g')
    expect(list.every((p) => p.parts.every((x) => x.amount! > 0))).toBe(true)
  })

  it('fridge for the next 3 days, freezer for the rest, transfers the night before', () => {
    const db = seed()
    const st = storage(db, WEEK)
    expect(new Set(st.fridge.map((p) => p.date))).toEqual(new Set(['2026-10-05', '2026-10-06', '2026-10-07']))
    expect(st.freezer.every((p) => p.date >= '2026-10-08')).toBe(true)
    const thu = st.transfers.find((t) => t.forDate === '2026-10-08')!
    expect(thu).toMatchObject({ date: '2026-10-07', time: '21:00' })
    expect(st.tips.some((t) => /folhas/i.test(t.title) && /nunca congele/i.test(t.text))).toBe(true)
    // Marina moved a pot: it no longer needs a transfer.
    withPlan(db, { pots: { '2026-10-08#2': 'geladeira', '2026-10-08#4': 'consumido' } })
    expect(storage(db, WEEK).transfers.find((t) => t.forDate === '2026-10-08')).toBeUndefined()
  })

  it('cooks once with cooked→raw totals, and a second round for what does not freeze', () => {
    const b = batchPlan(seed(), WEEK)
    expect(b.prepDate).toBe('2026-10-04')
    const arroz = b.bases.find((x) => x.key === 'batch:arroz-branco')!
    expect(arroz.raw![0]).toBeCloseTo(arroz.ready / 3, 0)
    expect(b.steps[0].dayBefore).toBe(true) // feijão de molho
    expect(b.steps.at(-1)!.key).toBe('batch:porcionar')
    expect(b.second?.bases.map((x) => x.key)).toEqual(['batch:batata'])
    // second round within the fridge window of every day it feeds
    expect(b.second!.date >= '2026-10-08').toBe(true)
  })
})

describe('grab and go', () => {
  it('turns breakfasts/snacks into peguei-e-saí formats with the plan quantities', () => {
    const g = grabAndGo(seed(), WEEK)
    const tueBreakfast = g.find((m) => m.date === '2026-10-06' && m.time === '08:00')!
    expect(tueBreakfast.items[0].title).toBe('Sanduíche pronto')
    expect(tueBreakfast.items[0].detail).toContain('pão de forma 50g')
    const monBreakfast = g.find((m) => m.date === '2026-10-05' && m.time === '08:00')!
    expect(monBreakfast.items.map((i) => i.title)).toEqual(['Pote de cuscuz porcionado', 'Omelete assada individual', 'Queijo separado'])
    const snack = g.find((m) => m.date === '2026-10-09' && m.time === '16:00')!
    expect(snack.items.map((i) => i.title)).toEqual(['Kit seco no shaker', 'Saquinho de castanha de caju'])
    expect(snack.items[0].icons).toEqual(['bolsa'])
  })
})

describe('presencial kit + checklists', () => {
  it('builds KIT TERÇA with what to take, icons and timed checklist', () => {
    const db = seed()
    const kit = presencialKit(db, '2026-10-06')!
    expect(kit.title).toBe('KIT TERÇA — PRESENCIAL')
    const lunch = kit.meals.find((m) => m.time === '12:00')!
    expect(lunch.take[0].text).toMatch(/^🍱 marmita: arroz integral 80g/)
    expect(lunch.take[0].icons).toEqual(['geladeira', 'microondas', 'termica'])
    expect(kit.meals.find((m) => m.time === '16:00')!.take.some((t) => t.text.startsWith('Kit seco no shaker'))).toBe(true)
    expect(kit.checklist.find((c) => c.key === 'mealprep:2026-10-05:montar-kit')).toMatchObject({ time: '21:00' })
    expect(kit.checklist.find((c) => c.key === 'mealprep:2026-10-06:shaker')).toMatchObject({ time: '05:30', title: 'Levar o shaker (kit seco)' })
    expect(presencialKit(db, '2026-10-05')).toBeUndefined()
  })

  it('prepChecklistFor returns only what happens that date, with time', () => {
    const db = seed()
    const mon = prepChecklistFor(db, '2026-10-05')
    expect(mon.every((i) => i.date === '2026-10-05' && /^\d\d:\d\d$/.test(i.time))).toBe(true)
    expect(mon.some((i) => i.key === 'mealprep:2026-10-05:montar-kit')).toBe(true)
    // Thursday night: separate the gel for Friday's long run; no freezer transfer without a meal prep
    const thu = prepChecklistFor(db, '2026-10-08')
    expect(thu.some((i) => i.key === 'mealprep:2026-10-08:separar-intra')).toBe(true)
    expect(thu.some((i) => i.key.endsWith('descongelar'))).toBe(false)
    withPlan(db)
    expect(prepChecklistFor(db, '2026-10-08').some((i) => i.key === 'mealprep:2026-10-08:descongelar')).toBe(true)
    // Friday: grab the gel 10 min before the 06:00 run
    expect(prepChecklistFor(db, '2026-10-09').find((i) => i.key === 'mealprep:2026-10-09:pegar-intra')?.time).toBe('05:50')
  })
})

describe('recipes', () => {
  it('Cuscuz cremoso de frango preserves the plan quantities (1 and 4 servings)', () => {
    const db = seed()
    const r1 = recipeFor(db, '2026-10-06', 4, 1)!
    expect(r1.title).toBe('Cuscuz cremoso de frango')
    expect(r1.ingredients.find((i) => i.food.startsWith('Cuscuz'))!.amount).toBe('170 g')
    expect(r1.steps.join(' ')).toContain('20 g de creme de ricota')
    const r4 = recipeFor(db, '2026-10-06', 4, 4)!
    expect(r4.ingredients.find((i) => i.food.startsWith('Cuscuz'))!.amount).toBe('680 g')
    expect(r4.ingredients.find((i) => i.food.startsWith('Salada alface'))!.amount).toBe('à vontade')
  })

  it('every plan item appears in the recipe; unmatched meals become an assembly', () => {
    const db = seed()
    const lunch = recipeFor(db, '2026-10-05', 2)!
    expect(lunch.template).toBe('bowl-completo')
    expect(lunch.steps.join(' ')).toMatch(/suco de laranja/)
    const intra = recipeFor(db, '2026-10-11', 1)!
    expect(intra.assembly).toBe(true)
    expect(intra.steps.join(' ')).toContain('40 g')
  })
})

describe('week report', () => {
  it('follows the section-15 order with real data', () => {
    const r = weekReport(seed(), WEEK)
    expect(r.strategy[0]).toMatch(/^Terça e quarta são presenciais/)
    expect(r.kits.map((k) => k.date)).toEqual(['2026-10-06', '2026-10-07'])
    expect(r.pots.length).toBe(14)
    expect(r.shopping.count).toBeGreaterThan(20)
    expect(r.swaps).toBe(0)
  })
})
