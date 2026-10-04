/**
 * Food sentences → what she wants. Lumos executes the nutritionist's plan (data/nutrition): she logs
 * what was eaten, answers with plan + real consumption + training + time, and suggests only from the
 * plan, its substitutions or — clearly labelled — her other prescribed days. Never prescribes.
 */
import type { DateKey, DB, TimeHM } from '@/data/types'
import { addDays } from '@/lib/date'
import { normalize } from '@/lib/text'
import { parseFoodText } from '@/data/nutrition'

export type MealWord = 'cafe' | 'almoco' | 'lanche' | 'jantar' | 'pre' | 'pos' | 'intra'

export type FoodIntent =
  | { kind: 'log'; text: string; at?: TimeHM; date: DateKey }
  | { kind: 'macros'; date: DateKey }
  | { kind: 'protein'; date: DateKey }
  | { kind: 'remaining'; date: DateKey }
  | { kind: 'keep'; date: DateKey; meal?: MealWord }
  | { kind: 'fits'; date: DateKey; craving?: string }
  | { kind: 'dinner'; date: DateKey }
  | { kind: 'skip'; date: DateKey; meal: MealWord }
  | { kind: 'swap'; date: DateKey; meal: MealWord }

const MEAL_RE = '(cafe(?: da manha)?|almoco|lanche(?: da (?:manha|tarde))?|jantar|janta|pre[ -]?treino|pos[ -]?treino|intra[ -]?treino)'

export function mealWordOf(s: string): MealWord | undefined {
  const t = normalize(s)
  if (/jant/.test(t)) return 'jantar'
  if (/almoc/.test(t)) return 'almoco'
  if (/lanche/.test(t)) return 'lanche'
  if (/pre[ -]?treino/.test(t)) return 'pre'
  if (/pos[ -]?treino/.test(t)) return 'pos'
  if (/intra/.test(t)) return 'intra'
  if (/cafe/.test(t)) return 'cafe'
  return undefined
}

const LOG_START = /^(?:eu\s+)?(?:acabei de\s+|agora\s+|hoje\s+|tambem\s+)?(?:comi|tomei|bebi|belisquei|lanchei)\b/
const TIME_IN_TEXT = /(?:^|\s)(?:as|a|pelas)\s+(\d{1,2})(?::(\d{2})|h(\d{2})?)?(?=\s|$)/

const FILLERS = /(?:^|\s)(agora|agorinha|ha pouco|hoje|de manha|a tarde|a noite|no lanche|de sobremesa)(?=\s|$)/g

/**
 * Removes "agora", "às 15h", "hoje" from a food sentence; returns the time when there was one.
 * Keeps her own spelling ("YoPRO") — normalize() keeps positions, so the cuts map back 1:1.
 */
export function cleanFoodText(text: string): { text: string; at?: TimeHM } {
  const raw = text.trim().replace(/[.!]+$/g, '')
  const n = normalize(raw)
  const cut: [number, number][] = []
  const m = TIME_IN_TEXT.exec(n)
  let at: TimeHM | undefined
  if (m) {
    const h = Number(m[1])
    const min = Number(m[2] ?? m[3] ?? 0)
    if (h <= 23 && min < 60) at = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    cut.push([m.index, m.index + m[0].length])
  }
  for (const f of n.matchAll(FILLERS)) cut.push([f.index!, f.index! + f[0].length])
  const src = raw.length === n.length ? raw : n
  let out = ''
  for (let i = 0; i < src.length; i++) out += cut.some(([x, y]) => i >= x && i < y) ? ' ' : src[i]
  return { text: out.replace(/\s+/g, ' ').trim(), at }
}

/** Something to eat said without a verb ("banana com duas fatias de queijo"): every part is a food. */
export function looksLikeFood(db: DB, text: string): boolean {
  const n = normalize(text)
  if (n.endsWith('?') || n.split(/\s+/).length > 10) return false
  const r = parseFoodText(db, cleanFoodText(text).text)
  return r.unknown.length === 0 && r.items.length + r.needsChoice.length > 0
}

export function foodIntentOf(text: string, today: DateKey): FoodIntent | undefined {
  const n = normalize(text).replace(/\s+/g, ' ').trim()
  const date = /\bamanha\b/.test(n) ? addDays(today, 1) : today
  const question = n.endsWith('?')
  const q = n.replace(/[?!.]+$/g, '')

  if (/\b(macro|macros)\b/.test(q) || /como (esta|estao|ta|tao) (a )?(minha )?(alimentacao|dieta|comida)/.test(q)) return { kind: 'macros', date }
  if (/proteina/.test(q) && /(falta|faltando|quanto|ainda)/.test(q)) return { kind: 'protein', date }
  if (/opcao de jantar|sugestao de jantar|sugere (um )?jantar|ideia de jantar|me da (uma )?opcao/.test(q)) return { kind: 'dinner', date }
  if (/(quero|vontade de|posso|da pra) comer|o que cabe|cabe (um|uma|algum)/.test(q)) {
    const craving = /(?:comer|cabe)\s+(?:um |uma |algum |alguma )?([a-z ]+?)(?:,|\s+o que|$)/.exec(q)?.[1]?.trim()
    return { kind: 'fits', date, craving: craving || q }
  }
  const skip = new RegExp(`(?:nao vou (?:fazer|comer|tomar|ter)|vou pular|pular|sem)\\s+(?:o |a |meu |minha )?${MEAL_RE}`).exec(q)
  if (skip && !question) return { kind: 'skip', date, meal: mealWordOf(skip[1])! }
  const keep = new RegExp(`(?:posso|da pra|consigo|vou) manter (?:o |a |meu |minha )?${MEAL_RE}|muda (?:o |a |meu |minha )?${MEAL_RE}|${MEAL_RE}.*posso manter|precisa mudar`).exec(q)
  if (keep) return { kind: 'keep', date, meal: mealWordOf(keep[0]) }
  const swap = new RegExp(`(?:troca|trocar|substitui|substituir|muda|mudar)\\s+(?:o |a |meu |minha )?${MEAL_RE}`).exec(q)
  if (swap) return { kind: 'swap', date, meal: mealWordOf(swap[1])! }
  if (/o que (ainda )?(falta|tem) (pra |para )?comer|o que (ainda )?vem (hoje )?(de comida|pra comer)|quais refeicoes faltam/.test(q)) return { kind: 'remaining', date }
  if (LOG_START.test(q) && !question) {
    const { text: clean, at } = cleanFoodText(text)
    return { kind: 'log', text: clean, at, date: today }
  }
  return undefined
}
