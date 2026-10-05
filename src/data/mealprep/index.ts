/**
 * MEAL PREP ENGINE — "Lumos não é uma IA que consulta a dieta. Lumos é uma IA que operacionaliza a dieta."
 *
 * Pure, deterministic functions of the DB (no LLM). Source of truth = the nutritionist's day plans
 * (`db.nutritionDayPlans`, picked per date by `dayPlanFor` — days are never assumed equal).
 * The engine never prescribes: quantities are the plan's; swaps come only from
 * `PlannedFood.substitutions`. Anything outside the plan must be labelled with NOT_PRESCRIBED.
 *
 * State: one `MealPrepPlan` per week (`db.mealPrepPlans`, weekStart = Monday). Only decisions and
 * progress are stored; everything below is derived. Keys:
 *   choices  '<DateKey>#<meal index>#<item index>' → exact substitution text
 *   checked  'shop:<buyKey>' (shopping) · 'batch:<ingredient|step>' (cooking) · 'mealprep:<date>:<slug>' (checklists)
 *   pots     '<DateKey>#<meal index>' → 'geladeira' | 'freezer' | 'consumido'
 *   pantry   lowercase names ("arroz branco", "ovos") — subtracted from the shopping list
 * Every function takes an optional `plan` so Lumos can preview a change before saving it.
 *
 * API (for the Lumos chat and the Life Timeline)
 * - weekMenu(db, weekStart, plan?)        7 days × meals: time, name, phase, place (casa/fora/treino), items with grams, badge 'nutri' | 'troca'
 * - diversify(db, weekStart, opts?)       a few proposals {key, from, to, reason} using ONLY plan substitutions; respects profile.foodPrefs
 *   applyProposals(choices, proposals)    → new choices map
 * - shoppingList(db, weekStart, plan?)    consolidated by category with realistic purchase quantities, minus pantry
 * - batchPlan(db, weekStart, plan?)       bases to cook (cooked totals + raw), ordered steps, rough time, second round
 * - pots(db, weekStart, plan?)            "SEG 12H — arroz 150g · feijão 130g · frango 100g · legumes 110g"
 * - grabAndGo(db, weekStart, plan?)       breakfast / pré / pós / lanche as "peguei e saí" formats (groupGrab to merge equal days)
 * - storage(db, weekStart, plan?)         geladeira (próximos 3 dias) x freezer + transfers the night before + tips
 * - presencialKit(db, date, plan?)        KIT <DIA> — PRESENCIAL: per meal what to take with ❄️ 🔥 🎒 🧊 + timed checklist
 * - prepChecklistFor(db, date)            { key, date, time, title }[] happening on `date` — merged by the Life Timeline
 * - recipeFor(db, date, mealIndex, 1|4)   template recipe preserving the plan's quantities, or "monte assim…"
 * - weekReport(db, weekStart, plan?)      everything above in the section-15 order
 * - pantry: pantryNames / preparedStock (read) · addToPantry / removeFromPantry / recordPrepared / usePrepared (writes, logged + undo)
 */
export { emptyPlanData, NOT_PRESCRIBED } from './constants'
export { INGREDIENTS, ingredientOf, KIT_ICON, SHOP_CATEGORY_LABEL, SHOP_CATEGORY_ORDER, type Ingredient, type KitIcon, type ShopCategory } from './catalog'
export { parseQty, parseSubstitution } from './parse'
export { dayOut, menuDay, planFor, slotLabel, weekMenu, weekStartOf, type MealPlace, type MenuDay, type MenuItem, type MenuMeal, type WeekMenu } from './menu'
export { applyProposals, diversify, diversifyMenu, type DiversifyProposal } from './diversify'
export { purchaseFor, shoppingList, type ShoppingGroup, type ShoppingLine, type ShoppingList } from './shopping'
export { batchPlan, FRIDGE_DAYS, pots, prepDateOf, type BatchBase, type BatchPlan, type BatchStep, type Pot, type PotState } from './batch'
export { grabAndGo, grabItemsFor, groupGrab, type GrabGroup, type GrabItem, type GrabMeal } from './grab'
export { storage, type StoragePlan, type StorageTip, type Transfer } from './storage'
export { prepChecklistFor, presencialKit, presencialKits, type KitMeal, type PrepItem, type PresencialKit } from './kit'
export { recipeFor, recipeForMeal, type Recipe, type Servings } from './recipes'
export { weekReport, type WeekReport } from './report'
export { addToPantry, pantryNames, preparedStock, recordPrepared, removeFromPantry, usePrepared, type PreparedStock } from './pantry'
