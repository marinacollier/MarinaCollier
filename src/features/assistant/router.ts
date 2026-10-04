/**
 * One sentence → what kind of turn it is. Deterministic, pure (reads the DB, never writes).
 *
 * Order matters and is deliberate:
 *   1 "acordei agora"                       → replan proposal (Aplicar)
 *   2 meal prep / "vou presencial"          → Meal prep mode (adapter) / portable kit
 *   3 food ("comi…", macros, jantar, doce…) → nutrition engine
 *   4 checklist of a day                    → meals + prep items
 *   5 the day + training ("cancelei meu inglês", "troco a corrida por surf") → one ChangePlan
 *   6 a food said plainly ("banana com duas fatias de queijo") → log
 *   7 everything else                       → the Chief of Staff answers (agents)
 */
import type { DateKey, DB } from '@/data/types'
import { normalize } from '@/lib/text'
import { lex } from './adjust/lexicon'
import type { ChangePlan } from './adjust/types'
import { planChecklist, planPresencial } from './day/checklist'
import { planDay, planWake, WOKE_UP } from './day/plan'
import { cleanFoodText, foodIntentOf, looksLikeFood, type FoodIntent } from './food/intent'
import { mealPrepIntentOf, type MealPrepIntent } from './food/mealprep'

export type LumosTurn =
  | { kind: 'adjust'; plan: ChangePlan }
  | { kind: 'foodLog'; intent: Extract<FoodIntent, { kind: 'log' }> }
  | { kind: 'food'; intent: Exclude<FoodIntent, { kind: 'log' }> }
  | { kind: 'mealprep'; intent: Exclude<MealPrepIntent, { kind: 'presencial' }> }
  | { kind: 'answer' }

const CHECKLIST_LIST =
  /^(?:(?:monta|montar|mostra|mostrar|ver|cria|criar|faz|fazer|qual|como esta)\s+)?(?:o |meu |um |a )?checklist(?: (?:da|de|do) (?:alimentacao|comida|refeicoes))?(?: (?:de|pra|para|da|do)? ?(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo))?$/

export function understand(db: DB, text: string, today: DateKey, nowMinutes: number): LumosTurn {
  const t = text.trim()
  const n = normalize(t).replace(/[?!.]+$/g, '').trim()
  if (!n) return { kind: 'answer' }

  if (WOKE_UP.test(n) && !t.endsWith('?')) return { kind: 'adjust', plan: planWake(db, today, nowMinutes) }

  const mp = mealPrepIntentOf(t, today)
  if (mp?.kind === 'presencial') return { kind: 'adjust', plan: planPresencial(db, mp.date, today) }
  if (mp) return { kind: 'mealprep', intent: mp }

  const food = foodIntentOf(t, today)
  if (food?.kind === 'log') return { kind: 'foodLog', intent: food }
  if (food) return { kind: 'food', intent: food }

  if (CHECKLIST_LIST.test(n)) {
    const day = lex(db, t, today).days[0]?.date ?? today
    return { kind: 'adjust', plan: planChecklist(db, day, today) }
  }

  const plan = planDay(db, t, today)
  if (plan) return { kind: 'adjust', plan }

  if (looksLikeFood(db, t)) {
    const { text: clean, at } = cleanFoodText(t)
    return { kind: 'foodLog', intent: { kind: 'log', text: clean, at, date: today } }
  }
  return { kind: 'answer' }
}
