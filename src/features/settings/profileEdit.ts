/** Small pure helpers for the profile sections in Ajustes. */
import type { Weekday, WorkDayMode, WorkSchedule } from '@/data/types'

export const WORK_MODE_OPTIONS: { value: WorkDayMode; short: string; label: string }[] = [
  { value: 'presencial', short: 'presencial', label: 'Presencial' },
  { value: 'remoto', short: 'remoto', label: 'Remoto' },
  { value: 'flexivel', short: 'flexível', label: 'Flexível' },
  { value: 'off', short: 'off', label: 'Off' },
]

export function setWorkDay(days: WorkSchedule['days'], day: Weekday, mode: WorkDayMode): WorkSchedule['days'] {
  return { ...days, [day]: mode }
}

/** Trims, drops empties and case-insensitive duplicates, keeps order. */
export function normalizeChecklist(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const t = raw.trim()
    const k = t.toLocaleLowerCase('pt-BR')
    if (!t || seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/**
 * The home widget list for Personalizar: the profile order first (unknown ids dropped), then any
 * known widget missing from the profile, appended hidden — so new widgets can be switched on.
 */
export function mergeWidgets<Id extends string>(profileWidgets: { id: Id; visible: boolean }[], known: readonly Id[]): { id: Id; visible: boolean }[] {
  const knownSet = new Set<string>(known)
  const listed = profileWidgets.filter((w) => knownSet.has(w.id))
  const have = new Set<string>(listed.map((w) => w.id))
  return [...listed, ...known.filter((id) => !have.has(id)).map((id) => ({ id, visible: false }))]
}

/** "presencial: ter, qua" style summary of a work week. */
export function workWeekSummary(days: WorkSchedule['days']): string {
  const short = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const order: Weekday[] = [1, 2, 3, 4, 5, 6, 0]
  const pres = order.filter((d) => days[d] === 'presencial').map((d) => short[d])
  return pres.length ? `presencial: ${pres.join(', ')}` : 'sem dias presenciais'
}
