/**
 * MEAL PREP MODE triggers (Marina's prompt, sections 3, 6, 8, 15) → which answer. The content comes
 * from the meal prep engine through ../mealprep-adapter.ts.
 */
import type { DateKey } from '@/data/types'
import { addDays, weekday } from '@/lib/date'
import { normalize } from '@/lib/text'
import { mealWordOf, type MealWord } from './intent'

export type MealPrepIntent =
  | { kind: 'week' }
  | { kind: 'presencial'; date: DateKey }
  | { kind: 'recipe'; date: DateKey; meal?: MealWord; portions: 1 | 4 }

const WEEK = [
  /faz(er)? (as )?minhas marmitas/,
  /marmitas? da semana/,
  /organiza(r)? (a )?minha alimentacao da semana/,
  /alimentacao da semana/,
  /lista de (supermercado|mercado|compras)/,
  /deixar tudo pronto/,
  /o que (eu )?preparo (no )?domingo/,
  /nao quero cozinhar (durante|na) (a )?semana/,
  /meal ?prep/,
]

const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }

function dayOf(n: string, today: DateKey): DateKey {
  if (/\bamanha\b/.test(n)) return addDays(today, 1)
  for (const [w, wd] of Object.entries(WEEKDAYS)) if (new RegExp(`\\b${w}\\b`).test(n)) return addDays(today, (wd - weekday(today) + 7) % 7)
  return today
}

export function mealPrepIntentOf(text: string, today: DateKey): MealPrepIntent | undefined {
  const n = normalize(text).replace(/[?!.]+$/g, '')
  if (/receita|o que (eu )?faco com essa porcao|como (eu )?preparo (o |a |meu |minha )?(almoco|jantar|lanche|cafe)/.test(n)) {
    return { kind: 'recipe', date: dayOf(n, today), meal: mealWordOf(n), portions: /4 porc|quatro porc|meal ?prep|semana/.test(n) ? 4 : 1 }
  }
  // "Amanhã vou presencial o dia inteiro." (a statement — "Amanhã é presencial?" is a question for the Work agent)
  if (/\b(vou|estarei|fico|vou ficar|vou estar)\b.*\bpresencial\b/.test(n) && !text.trim().endsWith('?')) return { kind: 'presencial', date: dayOf(n, today) }
  if (WEEK.some((re) => re.test(n))) return { kind: 'week' }
  return undefined
}
