/**
 * Lumos NUTRITION ENGINE — executes and organizes the nutritionist's plan. It never prescribes
 * diet, calories or medical conduct, never edits the plan, and never "compensates".
 *
 * Pure (db + date + minute-of-day in → result out; preview before applying):
 *   parseFoodText(db, text)            → { items, unknown, needsChoice }   "banana com duas fatias de queijo"
 *   resolveChoice(db, choice, option, label?) → ParsedFood                 answer to "Qual brownie?"
 *   toLoggedFood(parsed)               → LoggedFood (for logFood)
 *   dayMeals(db, date, now?)           → plan meals with status/badge/applied adjustment + extras
 *   nutritionLedger(db, date, now?)    → { planned, original, consumed, remaining, extra, entries, coverage, partial }
 *   remainingFor(db, date, now)        → "o que falta?" — future plan meals + one summary line
 *   proposeAdjustments(db, date, now, triggerMealId?) → { drafts, kept, summary, protection, trigger }
 *   otherOptions(db, adjustment, now)  → alternatives for "outra opção"
 *   dayProtection(db, date)            → key day / day before key session / heavy / recovery
 *   whatFits(db, date, now, craving?)  → "quero comer doce, o que cabe?" (nutri / troca / lumos options)
 *   dinnerOption(db, date, now)        → "uma opção de jantar considerando o que já comi"
 *   skipMeal(db, date, ref)            → draft 'pular' + summary ("não vou fazer lanche hoje")
 *   swapDraft(view, itemIndex, substitution, date) → "troca meu almoço" with a plan substitution
 *
 * Writes (store; every one returns `undo`, none toasts):
 *   logFood({ foods, description?, now?, via: 'lumos' }) → { meal, adapt, adjustments, autoApplied, undo }
 *   markPlannedMealEaten({ date, ref, now? }) · unlogMeal(id)
 *   applyAdjustment(id) · dismissAdjustment(id) · replaceProposal(id, draft) · saveAdjustment(draft)
 *   saveMyFood(data) · updateMyFood(id, patch) · removeMyFood(id)
 *
 * Contracts read by other modules: Meal.plannedTime / consumedAt / foods / contentSource and
 * db.mealAdjustments with status 'applied' (items carry badge nutri | troca | lumos).
 * Plan meal ref = '<NutritionDayPlan.id>#<meal index>' (planMealRef()).
 */
export * from './foods.reference'
export * from './nutrients'
export * from './parse'
export * from './ledger'
export * from './adapt'
export * from './log'
