/** Small pure formatters shared by the nutrition screens, seed and report. */
import type { DateKey, NutritionSource, PlannedMeal, UserProfile, Workout } from '@/data/types'
import { findModality } from '@/data/planning'
import { formatDayMonth } from '@/lib/date'

export const SOURCE_LABEL: Record<NutritionSource, string> = {
  nutricionista: 'nutricionista',
  usuaria: 'eu',
  outro_profissional: 'outro profissional',
}

/** "orientação do nutricionista · 02/10" — never more than who said it and when. */
export function sourceLine(source: NutritionSource | undefined, date?: DateKey): string {
  const who = source === 'usuaria' ? 'orientação minha' : source === 'outro_profissional' ? 'orientação de outro profissional' : 'orientação do nutricionista'
  return date ? `${who} · ${formatDayMonth(date)}` : who
}

/** Plain-text version of a prescribed meal (used to fill strategies from the plans). */
export function mealToText(meal: PlannedMeal, opts: { withSubstitutions?: boolean } = {}): string {
  const head = [meal.time, meal.name].filter(Boolean).join(' · ')
  const lines = [head]
  for (const it of meal.items) {
    lines.push(`• ${it.food}${it.qty ? ` — ${it.qty}` : ''}`)
    if (opts.withSubstitutions && it.substitutions?.length) lines.push(`  ou: ${it.substitutions.join(' / ')}`)
  }
  if (meal.notes) lines.push(`Observações: ${meal.notes}`)
  return lines.join('\n')
}

/** "60–75 min", "2h–3h", "45 min" or undefined. */
export function durationRange(w: Pick<Workout, 'plannedDurationMin' | 'plannedDurationMaxMin'>): string | undefined {
  const a = w.plannedDurationMin
  const b = w.plannedDurationMaxMin
  if (a == null && b == null) return undefined
  const fmt = (m: number, unit: boolean) => (m >= 120 && m % 60 === 0 ? `${m / 60}h` : unit ? `${m} min` : `${m}`)
  if (a != null && b != null && b !== a) {
    if (a >= 120 && b >= 120 && a % 60 === 0 && b % 60 === 0) return `${a / 60}–${b / 60}h`
    return `${fmt(a, false)}–${fmt(b, true)}`
  }
  return fmt((a ?? b)!, true)
}

export function workoutEmoji(profile: UserProfile, w: Workout): string {
  return findModality(profile, w.modality)?.emoji ?? '✨'
}

export function workoutTitle(profile: UserProfile, w: Workout): string {
  return w.title?.trim() || findModality(profile, w.modality)?.label || 'Treino'
}
