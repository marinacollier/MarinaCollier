import type { DateKey } from '@/data/types'
import { diffDays } from '@/lib/date'

export const DAY_PHRASES = [
  'Um dia de cada vez.',
  'Vamos fazer o que importa?',
  'Corpo, mente e vida em movimento.',
  'Leve, mas com intenção.',
  'Começa pelo que te faz bem.',
  'Pouca coisa, bem feita.',
  'Respira. Você dá conta do que importa.',
  'Hoje cabe o essencial. O resto espera.',
  'Em constante movimento — no seu ritmo.',
  'Faz o próximo passo. Só ele.',
]

/** Same phrase all day, a different one tomorrow. */
export function phraseFor(date: DateKey): string {
  const n = Math.abs(diffDays('2024-01-01', date))
  return DAY_PHRASES[n % DAY_PHRASES.length]
}

export function greetingEmoji(minutes: number): string {
  const h = minutes / 60
  if (h >= 4 && h < 12) return '☀️'
  if (h >= 12 && h < 18) return '🌤️'
  return '🌙'
}
