/**
 * Pure helpers for goals (metas). No React, no store — easy to test.
 */
import type { Area, DateKey, Goal, GoalLevel, Tone } from '@/data/types'
import { addDays, formatDayMonth, startOfWeek, weekday } from '@/lib/date'

export const MAX_BIG = 3

export const AREAS: {
  value: Area
  label: string
  emoji: string
  tone: Tone
}[] = [
  { value: 'pessoal', label: 'Pessoal', emoji: '🌿', tone: 'sage' },
  { value: 'corpo', label: 'Corpo', emoji: '🏃‍♀️', tone: 'accent' },
  { value: 'profissional', label: 'Profissional', emoji: '💼', tone: 'ink' },
  { value: 'estudo', label: 'Estudo', emoji: '📚', tone: 'ocean' },
  { value: 'financeiro', label: 'Financeiro', emoji: '💸', tone: 'sand' },
  { value: 'viagem', label: 'Viagem', emoji: '✈️', tone: 'ocean' },
  { value: 'conteudo', label: 'Conteúdo', emoji: '🎬', tone: 'plum' },
]

export function areaMeta(a: Area) {
  return AREAS.find((x) => x.value === a) ?? AREAS[0]
}

export const LEVELS: { value: GoalLevel; label: string }[] = [
  { value: 'dia', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'maior', label: 'Maiores' },
]

/** The period a new goal of this level gets ('maior' has none). */
export function defaultPeriod(level: GoalLevel, today: DateKey): DateKey | undefined {
  if (level === 'dia') return today
  if (level === 'semana') return startOfWeek(today)
  return undefined
}

/** True when a goal is visible (not let go). */
function visible(g: Goal) {
  return g.status !== 'solta'
}

/**
 * Goals of a level in a period. For 'maior', `period` is ignored and sub-goals whose parent
 * still exists are left out (they render nested under their parent).
 */
export function goalsIn(goals: Goal[], level: GoalLevel, period?: DateKey): Goal[] {
  const ids = new Set(goals.map((g) => g.id))
  return goals
    .filter((g) => g.level === level && visible(g))
    .filter((g) => (level === 'maior' ? !(g.parentId && ids.has(g.parentId)) : g.period === period))
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
}

export function splitBig(list: Goal[]): { big: Goal[]; small: Goal[] } {
  return { big: list.filter((g) => g.big), small: list.filter((g) => !g.big) }
}

/** Big goals that share the slot with `candidate` (same level + period), excluding itself. */
export function bigRivals(goals: Goal[], candidate: Pick<Goal, 'level' | 'period'> & { id?: string }): Goal[] {
  return goals.filter(
    (g) =>
      g.big &&
      visible(g) &&
      g.id !== candidate.id &&
      g.level === candidate.level &&
      (candidate.level === 'maior' ? !g.parentId : g.period === candidate.period),
  )
}

export function canBeBig(goals: Goal[], candidate: Pick<Goal, 'level' | 'period'> & { id?: string }): boolean {
  return bigRivals(goals, candidate).length < MAX_BIG
}

export function subGoals(goals: Goal[], parentId: string): Goal[] {
  return goals.filter((g) => g.parentId === parentId && visible(g)).sort((a, b) => a.order - b.order)
}

export function doneCount(list: Goal[]): { done: number; total: number } {
  return {
    done: list.filter((g) => g.status === 'feita').length,
    total: list.length,
  }
}

/** "nenhuma ainda", "1 de 5 feita", "3 de 5 feitas", "todas feitas ✨" */
export function progressWords(done: number, total: number): string {
  if (total === 0) return 'nenhuma ainda'
  if (done === total) return total === 1 ? 'feita ✨' : 'todas feitas ✨'
  return `${done} de ${total} ${done === 1 ? 'feita' : 'feitas'}`
}

/** "28/9 – 4/10" */
export function weekLabel(weekStart: DateKey): string {
  const short = (k: DateKey) => formatDayMonth(k).replace(/^0/, '').replace(/\/0/, '/')
  return `${short(weekStart)} – ${short(addDays(weekStart, 6))}`
}

/** Monday nudge: it's Monday, looking at the current week, and no big goals picked yet. */
export function showMondayNudge(goals: Goal[], today: DateKey, weekStart: DateKey): boolean {
  return (
    weekday(today) === 1 &&
    startOfWeek(today) === weekStart &&
    bigRivals(goals, { level: 'semana', period: weekStart }).length === 0
  )
}

/** Words, not percentages. */
export function progressLabel(p: number): string {
  if (p <= 0) return 'começando'
  if (p < 35) return 'primeiros passos'
  if (p < 65) return 'no meio do caminho'
  if (p < 100) return 'quase lá'
  return 'chegou lá ✨'
}
