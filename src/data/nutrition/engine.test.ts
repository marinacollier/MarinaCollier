import { beforeEach, describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { getDB, useStore } from '@/data/store'
import type { DB, LoggedFood } from '@/data/types'
import { toInstant } from '@/lib/date'
import { dayDeviation, dayProtection, dinnerOption, MAX_ITEM_CUT, otherOptions, proposeAdjustments, skipMeal, SMALL_KCAL_SHARE, whatFits } from './adapt'
import { matchReference, plannedFoodInfo } from './nutrients'
import { dayMeals, macrosLine, nutritionLedger, remainingFor } from './ledger'
import { applyAdjustment, dismissAdjustment, logFood, markPlannedMealEaten, saveAdjustment, saveMyFood } from './log'

// Reference week (seed): QUA pernas (key) · QUI prep · SEX corrida longa · SÁB prep · DOM pedal longo.
const MONDAY = '2026-10-05' // natação, no key session, Tuesday isn't key → a regular day
const FRIDAY = '2026-10-02' // long run day
const SATURDAY = '2026-10-03' // day before the long ride

const at = (date: string, hm: string) => toInstant(date, hm)
const YOPRO: LoggedFood = { name: 'YoPRO', qty: 1, nutrients: { kcal: 130, protein: 15, carbs: 12, fat: 2 }, confidence: 'estimated' }

let db: DB
beforeEach(() => {
  db = buildSeed(FRIDAY)
  useStore.setState({ db, hydrated: true })
})

describe('protection rules', () => {
  it('protects key days and the day before a key session', () => {
    expect(dayProtection(db, FRIDAY)).toMatchObject({ protected: true, kind: 'key_today' })
    expect(dayProtection(db, SATURDAY)).toMatchObject({ protected: true, kind: 'prep_tomorrow' })
    expect(dayProtection(db, SATURDAY).reason).toMatch(/amanhã você tem pedal longo/)
    expect(dayProtection(db, MONDAY).protected).toBe(false)
  })
})

describe('ledger', () => {
  it('plan meals carry planned macros; whey makes the total partial (no fake precision)', () => {
    const l = nutritionLedger(db, MONDAY, 7 * 60)
    expect(l.plan?.name).toBe('Segunda')
    expect(l.planned.protein).toBeGreaterThan(50)
    expect(l.consumed.kcal).toBe(0)
    expect(l.partial).toBe(true)
    expect(l.coverage).toBeGreaterThan(0.5)
    expect(l.coverage).toBeLessThan(1)
  })

  it('"comi" records the real time next to the planned one and moves macros to consumed', () => {
    const ref = dayMeals(db, MONDAY).meals.find((m) => m.plannedTime === '08:00')!.ref
    const { meal, undo } = markPlannedMealEaten({ date: MONDAY, ref, now: at(MONDAY, '08:21') })
    expect(meal).toMatchObject({ plannedTime: '08:00', time: '08:21', planMealRef: ref, contentSource: 'nutri' })
    const l = nutritionLedger(getDB(), MONDAY, 9 * 60)
    expect(l.entries.find((e) => e.ref === ref)).toMatchObject({ status: 'consumed', consumedTime: '08:21', plannedTime: '08:00' })
    expect(l.consumed.protein).toBeGreaterThan(0)
    undo()
    expect(getDB().meals.some((m) => m.planMealRef === ref)).toBe(false)
  })

  it('remaining = plan meals still to come, never planned − consumed', () => {
    const r = remainingFor(db, MONDAY, 14 * 60 + 30)
    expect(r.meals.map((m) => m.plannedTime)).toEqual(['16:00', '20:00'])
    expect(r.summary).toMatch(/lanche da tarde \(16:00\) e jantar \(20:00\)/)
  })
})

describe('extras and the rest of the day', () => {
  const BIG: LoggedFood = { name: 'Brownie', qty: 2, nutrients: { kcal: 500, protein: 6, carbs: 64, fat: 26 }, confidence: 'estimated' }

  it('small deviation (YoPRO): "Não precisa mexer em nada", no proposal', () => {
    const res = logFood({ foods: [YOPRO], now: at(MONDAY, '14:30') })
    expect(res.meal).toMatchObject({ time: '14:30', slot: 'extra', contentSource: 'marina' })
    const dev = dayDeviation(getDB(), MONDAY, 14 * 60 + 30)
    expect(dev.kcalShare).toBeLessThan(SMALL_KCAL_SHARE)
    expect(dev.small).toBe(true)
    expect(res.adjustments).toHaveLength(0)
    expect(res.adapt!.summary).toBe('Registrei YoPRO ✓ Não precisa mexer em nada. Continua o plano normalmente. Vou considerar como estimativa.')
  })

  it('the small threshold is explicit: >10% kcal or one macro >15% is not small', () => {
    const l = nutritionLedger(db, MONDAY)
    const justOver: LoggedFood = { name: 'Algo', qty: 1, nutrients: { kcal: Math.ceil(l.planned.kcal * 0.11), protein: 0, carbs: 0, fat: 0 }, confidence: 'label' }
    logFood({ foods: [justOver], now: at(MONDAY, '10:00'), noAdapt: true })
    expect(dayDeviation(getDB(), MONDAY).small).toBe(false)
  })

  it('larger deviation: proportional, non-punitive — protein & vegetables kept, carbs/fat a bit less, nothing removed', () => {
    const res = logFood({ foods: [BIG], now: at(MONDAY, '14:30') })
    expect(res.adapt!.summary).toMatch(/Seu dia ainda está bem administrável\. Vou manter proteína e vegetais no .*jantar.* e ajustar um pouco o carboidrato\/gordura/)
    expect(res.adapt!.summary).not.toMatch(/pule|compens/i)
    expect(res.adjustments.length).toBeGreaterThanOrEqual(1)
    const day = dayMeals(getDB(), MONDAY)
    for (const adj of res.adjustments) {
      const view = day.meals.find((m) => m.ref === adj.planMealRef)!
      expect(view.phase).toBe('refeicao')
      expect(adj.kind).toBe('adaptar')
      // never removes an item
      expect(adj.items).toHaveLength(view.original.items.length)
      adj.items.forEach((it, i) => {
        const orig = view.original.items[i]
        expect(it.food).toBe(orig.food)
        const role = matchReference(orig.food)?.role
        if (role === 'proteina' || role === 'vegetal' || role === 'laticinio') expect(it).toMatchObject({ food: orig.food, badge: 'nutri' })
        if (it.badge === 'lumos') expect(it.grams! / plannedFoodInfo(orig).grams!).toBeGreaterThanOrEqual(1 - MAX_ITEM_CUT - 0.001)
      })
    }
    // A proposal is not the plan yet.
    expect(day.meals.every((m) => !m.adjustment)).toBe(true)
  })

  it('aplicar overlays the meal for today only (badge lumos); the plan itself is untouched; undo restores', () => {
    const res = logFood({ foods: [BIG], now: at(MONDAY, '14:30') })
    const adj = res.adjustments.find((a) => dayMeals(getDB(), MONDAY).meals.find((m) => m.ref === a.planMealRef)!.name === 'Jantar')!
    const undo = applyAdjustment(adj.id)
    const dinner = dayMeals(getDB(), MONDAY).meals.find((m) => m.ref === adj.planMealRef)!
    expect(dinner.badge).toBe('lumos')
    expect(dinner.items.some((i) => i.badge === 'lumos')).toBe(true)
    const planMeal = getDB().nutritionDayPlans.find((p) => p.id === dinner.plan.id)!.meals[dinner.index]
    expect(planMeal.items.every((i) => !('badge' in i))).toBe(true)
    undo()
    expect(dayMeals(getDB(), MONDAY).meals.find((m) => m.ref === adj.planMealRef)!.adjustment).toBeUndefined()
  })

  it('outra opção: nutritionist substitutions come after the plan’s own foods (pantry first)', () => {
    const res = logFood({ foods: [BIG], now: at(MONDAY, '14:30') })
    const adj = res.adjustments[0]
    const opts = otherOptions(getDB(), adj, 14 * 60 + 31)
    expect(opts[0].kind).toBe('adaptar')
    expect(opts.slice(1).every((o) => o.kind === 'trocar' && o.items.some((i) => i.badge === 'troca'))).toBe(true)
  })

  it('manter plano dismisses; undo of the log removes meal and proposals', () => {
    const res = logFood({ foods: [BIG], now: at(MONDAY, '14:30') })
    dismissAdjustment(res.adjustments[0].id)
    expect(getDB().mealAdjustments[0].status).toBe('dismissed')
    res.undo()
    expect(getDB().meals.some((m) => m.id === res.meal.id)).toBe(false)
    expect(getDB().mealAdjustments).toHaveLength(0)
  })

  it('logged at 21:00 → nothing to change (past meals are never candidates)', () => {
    const res = logFood({ foods: [BIG], now: at(MONDAY, '21:00') })
    expect(res.adjustments).toHaveLength(0)
    expect(res.adapt!.summary).toMatch(/já fechou/)
  })

  it('day before the long ride: never touches the evening carbs', () => {
    const res = logFood({ foods: [BIG], now: at(SATURDAY, '14:30') })
    expect(res.adjustments).toHaveLength(0)
    expect(res.adapt!.summary).toMatch(/Como amanhã você tem pedal longo, não mexi nos carboidratos/)
    expect(res.adapt!.summary).toMatch(/estimativa/)
  })

  it('long run day: plan stays, recovery first', () => {
    const res = logFood({ foods: [BIG], now: at(FRIDAY, '14:30') })
    expect(res.adjustments).toHaveLength(0)
    expect(res.adapt!.summary).toMatch(/recuperação vem primeiro/)
  })

  it('unknown numbers → keeps the plan', () => {
    const r = logFood({ foods: [{ name: 'Japonês', qty: 1, confidence: 'unknown' }], now: at(MONDAY, '14:30') })
    expect(r.adjustments).toHaveLength(0)
    expect(r.adapt!.summary).toMatch(/Sem números confiáveis/)
  })

  it('auto-apply small adjustments only when she turned it on (still undoable)', () => {
    useStore.setState({ db: { ...db, profile: { ...db.profile, lumosAutoApplySmall: true } } })
    const res = logFood({ foods: [BIG], now: at(MONDAY, '14:30') })
    expect(res.autoApplied).toBe(true)
    expect(getDB().mealAdjustments.some((a) => a.status === 'applied')).toBe(true)
    res.undo()
    expect(getDB().mealAdjustments).toHaveLength(0)
  })

  it('proposeAdjustments is pure (preview before applying)', () => {
    const res = logFood({ foods: [BIG], now: at(MONDAY, '14:30'), noAdapt: true })
    const before = getDB()
    const p = proposeAdjustments(before, MONDAY, 14 * 60 + 31, res.meal.id)
    expect(p.drafts.length).toBeGreaterThanOrEqual(1)
    expect(getDB()).toBe(before)
  })

  it('ledger exposes the day meta and what is missing ("faltam P48 C52 G14")', () => {
    const l = nutritionLedger(db, MONDAY, 7 * 60)
    expect(l.missing.protein).toBeCloseTo(l.planned.protein, 0)
    expect(macrosLine(l)).toMatch(/^Meta P\d+ C\d+ G\d+ · consumido P0 C0 G0 · faltam P\d+ C\d+ G\d+/)
  })
})

describe('chat helpers', () => {
  it('whatFits("doce") only offers the plan and its substitutions', () => {
    const r = whatFits(db, MONDAY, 13 * 60, 'quero comer doce')
    expect(r.options.every((o) => o.badge === 'nutri' || o.badge === 'troca' || o.badge === 'lumos')).toBe(true)
    expect(r.summary.length).toBeGreaterThan(5)
  })

  it('skipMeal never compensates', () => {
    const ref = dayMeals(db, MONDAY).meals.find((m) => m.plannedTime === '16:00')!.ref
    const s = skipMeal(db, MONDAY, ref)
    expect(s.draft).toMatchObject({ kind: 'pular', status: 'applied', by: 'marina' })
    saveAdjustment(s.draft!)
    const l = nutritionLedger(getDB(), MONDAY, 13 * 60)
    expect(l.entries.find((e) => e.ref === ref)!.status).toBe('skipped')
    expect(dayMeals(getDB(), MONDAY).meals.find((m) => m.plannedTime === '20:00')!.badge).toBe('nutri')
  })

  it('dinnerOption swaps only what she already ate, using the plan', () => {
    const ref = dayMeals(db, MONDAY).meals.find((m) => m.plannedTime === '12:00')!.ref
    markPlannedMealEaten({ date: MONDAY, ref, now: at(MONDAY, '12:10') })
    const d = dinnerOption(getDB(), MONDAY, 18 * 60)
    expect(d.meal?.name).toBe('Jantar')
    if (d.draft) expect(d.draft.items.some((i) => i.badge === 'troca')).toBe(true)
  })

  it('saveMyFood stores aliases for 1-second logs', () => {
    const { food, undo } = saveMyFood({ name: 'YoPRO', serving: { label: '1 garrafa' }, nutrients: YOPRO.nutrients!, confidence: 'label' })
    expect(food).toMatchObject({ mine: true, aliases: ['yopro'] })
    undo()
    expect(getDB().foods).toHaveLength(0)
  })
})
