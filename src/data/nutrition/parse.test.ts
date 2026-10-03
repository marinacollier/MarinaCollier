import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import type { DB, FoodItem } from '@/data/types'
import { parseFoodText, parseQuantity, resolveChoice, splitPhrases } from './parse'
import { gramsFromQty, matchReference, plannedFoodInfo } from './nutrients'
import { REFERENCE_FOODS } from './foods.reference'

const db = emptyDB()

function withMine(...foods: Partial<FoodItem>[]): DB {
  const d = emptyDB()
  d.foods = foods.map((f, i) => ({
    id: `f${i}`,
    createdAt: '',
    updatedAt: '',
    name: 'X',
    aliases: [],
    serving: { label: 'unidade' },
    nutrients: { kcal: 100, protein: 10, carbs: 5, fat: 2 },
    confidence: 'label',
    mine: true,
    ...f,
  }))
  return d
}

describe('quantities and phrases', () => {
  it('splits on com / e / vírgula and drops "comi"', () => {
    expect(splitPhrases(db, 'Comi banana com duas fatias de queijo')).toEqual(['banana', 'duas fatias de queijo'])
    expect(splitPhrases(db, 'café com leite')).toEqual(['cafe', 'leite'])
    expect(splitPhrases(db, 'arroz, feijão e frango')).toEqual(['arroz', 'feijao', 'frango'])
  })
  it('reads numbers, words, halves and units', () => {
    expect(parseQuantity('duas fatias de queijo')).toMatchObject({ qty: 2, unit: 'fatia', rest: 'queijo' })
    expect(parseQuantity('meia banana')).toMatchObject({ qty: 0.5, rest: 'banana' })
    expect(parseQuantity('150g de arroz')).toMatchObject({ qty: 150, unit: 'g', rest: 'arroz' })
    expect(parseQuantity('2 colheres de sopa de mel')).toMatchObject({ qty: 2, unit: 'colher', rest: 'mel' })
    expect(parseQuantity('1 yopro')).toMatchObject({ qty: 1, rest: 'yopro' })
  })
})

describe('parseFoodText', () => {
  it('banana com duas fatias de queijo → reference foods with plan portions', () => {
    const r = parseFoodText(db, 'banana com duas fatias de queijo')
    expect(r.unknown).toEqual([])
    expect(r.items.map((i) => i.name)).toEqual(['Banana prata', 'Queijo muçarela'])
    const [banana, queijo] = r.items
    expect(banana.grams).toBe(65)
    expect(banana.confidence).toBe('reference')
    expect(queijo.grams).toBe(40)
    expect(queijo.nutrients!.protein).toBeCloseTo(9, 0)
  })

  it('a packaged product without label asks instead of inventing numbers', () => {
    const r = parseFoodText(db, 'comi um YoPRO')
    expect(r.items).toEqual([])
    expect(r.needsChoice).toHaveLength(1)
    const c = r.needsChoice[0]
    expect(c.typed).toBe('YoPRO')
    expect(c.options.map((o) => o.kind)).toEqual(['rotulo', 'estimativa', 'sem_numeros'])
    const est = resolveChoice(db, c, c.options[1])
    expect(est.confidence).toBe('estimated')
    expect(est.name).toBe('YoPRO')
    const label = resolveChoice(db, c, c.options[0], { kcal: 160, protein: 15, carbs: 18, fat: 3 })
    expect(label).toMatchObject({ confidence: 'label', nutrients: { protein: 15 } })
  })

  it('"um brownie" → "Qual brownie?"', () => {
    const r = parseFoodText(db, 'um brownie')
    expect(r.needsChoice[0].question).toBe('Qual brownie?')
  })

  it('plurals: "dois brownies" → Qual brownie? ×2', () => {
    const c = parseFoodText(db, 'dois brownies').needsChoice[0]
    expect(c).toMatchObject({ question: 'Qual brownie?', qty: 2 })
    expect(parseFoodText(db, 'duas bananas').items[0]).toMatchObject({ name: 'Banana prata', grams: 130 })
  })

  it('"comi japonês" is logged without fake precision', () => {
    const c = parseFoodText(db, 'comi japonês').needsChoice[0]
    expect(c.options.map((o) => o.kind)).toEqual(['sem_numeros'])
    expect(resolveChoice(db, c, c.options[0])).toMatchObject({ confidence: 'unknown', name: 'Japonês' })
  })

  it('Meus alimentos win and make "1 YoPRO" a 1-second log', () => {
    const d = withMine({ name: 'YoPRO morango', aliases: ['yopro'], nutrients: { kcal: 160, protein: 15, carbs: 18, fat: 3 } })
    const r = parseFoodText(d, '1 YoPRO')
    expect(r.needsChoice).toEqual([])
    expect(r.items[0]).toMatchObject({ foodId: 'f0', source: 'meus', confidence: 'label', nutrients: { protein: 15 } })
  })

  it('two saved foods with the same name → asks which', () => {
    const d = withMine({ name: 'Brownie da padaria', aliases: ['brownie'] }, { id: 'b2', name: 'Brownie fit', aliases: ['brownie'] })
    expect(parseFoodText(d, 'um brownie').needsChoice[0].options.map((o) => o.kind)).toEqual(['meu', 'meu'])
  })

  it('iogurte proteico is a category, iogurte alone is the reference', () => {
    expect(parseFoodText(db, 'iogurte proteico').needsChoice).toHaveLength(1)
    expect(parseFoodText(db, 'um iogurte').items[0].name).toBe('Iogurte natural')
  })

  it('unrecognized phrases are reported', () => {
    expect(parseFoodText(db, 'xyzzy').unknown).toEqual(['xyzzy'])
  })

  it('whey is recognized but has no TACO numbers → offer label', () => {
    expect(parseFoodText(db, 'whey').items[0]).toMatchObject({ confidence: 'unknown', canUseLabel: true })
  })
})

describe('plan foods × reference', () => {
  it('reads grams from the plan quantity text', () => {
    expect(gramsFromQty('2 Fatia(s) (50g)')).toBe(50)
    expect(gramsFromQty('1 Xícara(s) chá (200ml)')).toBe(200)
    expect(gramsFromQty('1.5 colher (67.5g)')).toBe(67.5)
    expect(gramsFromQty('À vontade')).toBeUndefined()
  })
  it('matches the plan names to the right reference food', () => {
    const cases: [string, string | undefined][] = [
      ['Doce de leite cremoso', 'doce-de-leite'],
      ['Leite de vaca integral em pó', 'leite-po-integral'],
      ['Leite de vaca integral UHT', 'leite-integral'],
      ['Queijo muçarela/mussarela', 'mucarela'],
      ['Filé de frango grelhado', 'frango-grelhado'],
      ['Frango desfiado', 'frango-desfiado'],
      ['Salada de frutas - laranja, banana, maçã e mamão', 'salada-frutas'],
      ['Requeijão light 30% menos gordura (betania)', 'requeijao-light'],
      ['Tangerina Ponkã', 'tangerina'],
      ['Ameixa', undefined],
    ]
    for (const [name, key] of cases) expect(matchReference(name)?.key, name).toBe(key)
  })
  it('planned macros = plan grams × reference, confidence plan', () => {
    const info = plannedFoodInfo({ food: 'Arroz branco cozido', qty: '6 colher(es) de sopa cheia(s) (150g)' })
    expect(info.confidence).toBe('plan')
    expect(info.nutrients!.carbs).toBeCloseTo(42.2, 1)
    expect(plannedFoodInfo({ food: 'Whey protein concentrado', qty: '1 Medidor(es) (30g)' }).confidence).toBe('unknown')
    expect(plannedFoodInfo({ food: 'Salada alface lisa, alface roxa, rúcula e sal', qty: 'À vontade' }).negligible).toBe(true)
  })
  it('reference table sanity: macros never exceed 100 g and kcal roughly matches', () => {
    for (const f of REFERENCE_FOODS) {
      if (!f.per100) continue
      const { protein, carbs, fat, kcal } = f.per100
      expect(protein + carbs + fat, f.key).toBeLessThanOrEqual(100)
      const est = protein * 4 + carbs * 4 + fat * 9
      expect(Math.abs(est - kcal) / Math.max(kcal, 20), f.key).toBeLessThan(0.35)
    }
  })
})
