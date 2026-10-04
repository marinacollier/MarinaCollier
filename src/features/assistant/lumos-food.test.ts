/** Lumos food — Marina's sentences against the real seed + nutrition engine. Never punitive. */
import { beforeEach, describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { getDB, useStore } from '@/data/store'
import { nutritionLedger } from '@/data/nutrition'
import { toInstant } from '@/lib/date'
import { answerFood } from './food/answer'
import { cleanFoodText, foodIntentOf, looksLikeFood } from './food/intent'
import { logFromChat, parseLog, resolveAll } from './food/log'
import { understand } from './router'
import { weekMealPrep, presencialKitFor, recipeForMeal } from './mealprep-adapter'

const MONDAY = '2026-10-05' // regular day (no key session)
const SATURDAY = '2026-10-03' // day before the long ride → protected
const PUNITIVE = /ultrapass|compens|pule o|pular o jantar|você falhou|excesso|culpa/i

beforeEach(() => {
  useStore.setState({ db: buildSeed(SATURDAY), hydrated: true })
})

const ask = (text: string, date = MONDAY, min = 14 * 60 + 30) => {
  const t = understand(getDB(), text, date, min)
  if (t.kind !== 'food') throw new Error(`${text} → ${t.kind}`)
  return answerFood(getDB(), t.intent, date, min)
}

describe('logging', () => {
  it('recognizes her ways of saying it', () => {
    for (const s of ['comi um YoPRO', 'comi um brownie', 'comi japonês', 'Comi um brownie agora.']) expect(understand(getDB(), s, MONDAY, 600).kind, s).toBe('foodLog')
    expect(understand(getDB(), 'banana com duas fatias de queijo', MONDAY, 600).kind).toBe('foodLog')
    expect(looksLikeFood(getDB(), 'Que livros coloquei na fila?')).toBe(false)
  })

  it('keeps her spelling and the time she said', () => {
    expect(cleanFoodText('Comi um YoPRO agora')).toEqual({ text: 'Comi um YoPRO', at: undefined })
    expect(cleanFoodText('comi um brownie às 15h')).toEqual({ text: 'comi um brownie', at: '15:00' })
    expect(parseLog(getDB(), 'comi um YoPRO').needsChoice[0].typed).toBe('YoPRO')
  })

  it('unknown values → asks (rótulo / estimativa), estimates are labelled', () => {
    const p = parseLog(getDB(), 'comi um brownie')
    expect(p.needsChoice[0].question).toBe('Qual brownie?')
    const est = p.needsChoice[0].options.find((o) => o.kind === 'estimativa')!
    const r = resolveAll(getDB(), p, { [p.needsChoice[0].phrase]: { option: est } })
    expect(r.foods[0].confidence).toBe('estimated')
    expect(r.savable[0]).toMatchObject({ name: 'Brownie', confidence: 'estimated' })
  })

  it('"banana com duas fatias de queijo" logs at the real time, enters consumption, undo removes it', () => {
    const p = parseLog(getDB(), 'banana com duas fatias de queijo')
    const { foods } = resolveAll(getDB(), p, {})
    const res = logFromChat({ foods, now: toInstant(MONDAY, '10:15') })
    expect(res.meal).toMatchObject({ time: '10:15', loggedVia: 'lumos', contentSource: 'marina' })
    expect(nutritionLedger(getDB(), MONDAY, 10 * 60 + 20).consumed.protein).toBeGreaterThan(5)
    expect(res.adapt?.summary).toMatch(/^Registrei/)
    expect(res.adapt?.summary ?? '').not.toMatch(PUNITIVE)
    res.undo()
    expect(getDB().meals.some((m) => m.id === res.meal.id)).toBe(false)
  })

  it('a big extra on a regular day → proposal for future meals only (proteína e vegetais mantidos)', () => {
    const brownies = [{ name: 'Brownie', qty: 2, nutrients: { kcal: 500, protein: 6, carbs: 64, fat: 26 }, confidence: 'estimated' as const }]
    const res = logFromChat({ foods: brownies, now: toInstant(MONDAY, '15:00') })
    expect(res.adapt?.summary).toMatch(/administrável/)
    expect(res.adapt?.summary).toMatch(/Vou considerar como estimativa/)
    for (const a of res.adjustments) {
      expect(a.status).toBe('proposed')
      expect(a.by).toBe('lumos')
      expect(a.planMealRef).not.toMatch(/#2$/) // lunch (12:00) is past — never touched
    }
  })

  it('protected day (before the long ride): the plan stays', () => {
    const res = logFromChat({ foods: [{ name: 'Brownie', qty: 2, nutrients: { kcal: 500, protein: 6, carbs: 64, fat: 26 }, confidence: 'estimated' }], now: toInstant(SATURDAY, '15:00') })
    expect(res.adjustments).toHaveLength(0)
    expect(res.adapt?.summary).toMatch(/amanhã você tem pedal longo/)
  })
})

describe('questions', () => {
  it('"como estão meus macros hoje?" → human headline + consumido / planejado', () => {
    const r = ask('como estão meus macros hoje?')
    expect(r.headline).toMatch(/Ainda vêm lanche da tarde \(16:00\) e jantar \(20:00\)/)
    expect(r.macros?.map((m) => m.key)).toEqual(['protein', 'carbs', 'fat'])
    expect(JSON.stringify(r)).not.toMatch(PUNITIVE)
  })

  it('"o que falta de proteína?"', () => {
    expect(ask('o que falta de proteína?').headline).toMatch(/^Faltam ~\d+ g de proteína/)
  })

  it('"posso manter o jantar normal?" / "comi isso agora, muda meu jantar?"', () => {
    expect(ask('posso manter o jantar normal?').headline).toMatch(/Pode manter sim ✓ Seu jantar das 20:00/)
    expect(foodIntentOf('comi isso agora, muda meu jantar?', MONDAY)).toMatchObject({ kind: 'keep', meal: 'jantar' })
    // From the meal sheet link:
    expect(foodIntentOf('lanche da tarde de hoje: posso manter como está?', MONDAY)).toMatchObject({ kind: 'keep', meal: 'lanche' })
  })

  it('after a real extra the dinner question can offer a light, optional adjustment', () => {
    logFromChat({ foods: [{ name: 'Brownie', qty: 2, nutrients: { kcal: 500, protein: 6, carbs: 64, fat: 26 }, confidence: 'estimated' }], now: toInstant(MONDAY, '14:00') })
    const r = ask('comi isso agora, muda meu jantar?')
    expect(r.headline).toMatch(/^Pode manter/)
    expect(JSON.stringify(r)).not.toMatch(PUNITIVE)
  })

  it('"quero comer doce, o que cabe?" → only plan / plan swaps / clearly-labelled ideas', () => {
    const r = ask('quero comer doce, o que cabe?')
    expect(r.fits?.length).toBeGreaterThan(0)
    for (const f of r.fits!) if (f.badge === 'lumos') expect(f.note).toMatch(/não está cadastrada como substituição/)
  })

  it('"me dá uma opção de jantar considerando o que já comi."', () => {
    expect(ask('me dá uma opção de jantar considerando o que já comi.').headline).toMatch(/jantar/)
  })

  it('"não vou fazer lanche hoje." → skip draft (she decides; nothing compensated)', () => {
    const r = ask('não vou fazer lanche hoje.')
    expect(r.skip?.draft).toMatchObject({ kind: 'pular', status: 'applied' })
    expect(r.headline).toMatch(/O resto do dia segue como planejado/)
  })

  it('"troca meu almoço." → only the nutritionist\'s substitutions; at 21:00 lunch is never touched', () => {
    const r = ask('troca meu almoço.', MONDAY, 9 * 60)
    expect(r.swaps?.length).toBeGreaterThan(0)
    expect(r.swaps!.every((s) => s.subs.length > 0)).toBe(true)
    expect(ask('troca meu almoço.', MONDAY, 21 * 60).headline).toMatch(/já passou/)
  })
})

describe('meal prep adapter (engine)', () => {
  it('week answer in the section-15 order', () => {
    const w = weekMealPrep(getDB(), SATURDAY)!
    expect(w.sections.map((s) => s.title.replace(/ · .*$/, ''))).toEqual([
      'Estratégia da semana',
      'Cardápio por dia',
      'Lista de supermercado',
      'Meal prep',
      'Montagem dos potes',
      'Cafés e lanches portáteis',
      'Geladeira x freezer',
      'Kit dos dias presenciais',
    ])
  })

  it('presencial kit + recipe keep the plan quantities', () => {
    expect(presencialKitFor(getDB(), '2026-10-06')?.title).toBe('KIT TERÇA — PRESENCIAL')
    expect(presencialKitFor(getDB(), MONDAY)).toBeUndefined()
    const r = recipeForMeal(getDB(), MONDAY, 'seed:nutrition:plano-segunda#2', 4)!
    expect(r.servings).toBe(4)
    expect(r.note).toMatch(/Quantidades do seu plano/)
  })
})
