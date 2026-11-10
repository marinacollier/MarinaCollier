/**
 * Text → one concrete change of the day's plan ("tenho mais 30 min", "estou cansada", "não quero idiomas").
 * Shared by the Home bar, the Home Lumos line and the Lumos page.
 */
import type { CalendarEntry } from '@/data/calendar/universal'
import { getDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { hmToMinutes } from '@/lib/date'
import { normalize } from '@/lib/text'
import { addCapacity, lowerEnergy, replanRest, type Outcome } from './allocation'
import { checkinOf, formatMin } from './day-checkin'

// ─── Text → one concrete command ────────────────────────────────────────────

export type Adjust = { kind: 'mais'; min: number } | { kind: 'menos'; min: number } | { kind: 'tenho'; min: number } | { kind: 'cansada' } | { kind: 'interesse'; text: string } | { kind: 'replanejar' }

const NUM: Record<string, number> = { meia: 0.5, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, dez: 10, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50 }

/** Minutes said in the text ("45 min", "meia hora", "1h30", "uma hora"); undefined when none. */
export function minutesIn(t: string): number | undefined {
  const m = t.match(/\b(\d+(?:[.,]\d+)?|meia|uma?|duas?|dois|tres|quatro|cinco|dez|quinze|vinte|trinta|quarenta|cinquenta)\s*(h|hr|hrs|hora|horas|min|mins|minuto|minutos)\b(?:\s*e\s*(meia|\d+))?/)
  if (!m) return /\bmeia hora\b/.test(t) ? 30 : undefined
  const n = NUM[m[1]] ?? Number(m[1].replace(',', '.'))
  const hours = m[2].startsWith('h')
  const extra = m[3] === 'meia' ? 30 : m[3] ? Number(m[3]) : 0
  return Math.round(hours ? n * 60 + extra : n)
}

export function parseAdjust(text: string): Adjust | undefined {
  const t = normalize(text)
  const min = minutesIn(t)
  if (/\b(cansad[ao]|exaust[ao]|sem energia|sem pique|esgotad[ao])\b/.test(t)) return { kind: 'cansada' }
  if (/\b(menos tempo|nao tenho (?:mais )?tempo|preciso sair|tenho que sair)\b/.test(t)) return { kind: 'menos', min: min ?? 30 }
  if (min && /\b(mais|extras?|a mais|sobr(?:ou|aram)|ganhei|acabei|terminei|livre antes)\b/.test(t)) return { kind: 'mais', min }
  if (min && /\btenho\b/.test(t)) return { kind: 'tenho', min }
  if (/\b(acabei|terminei)\b.*\bmais cedo\b/.test(t)) return { kind: 'replanejar' }
  if (/\b(nao quero|quero (?:estudar|descansar|focar|fazer)|preciso focar|focar n[oa]|so quero|hoje e dia de)\b/.test(t)) return { kind: 'interesse', text: text.trim() }
  if (/\b(replanej|reorganiz|refaz)/.test(t)) return { kind: 'replanejar' }
  return undefined
}

export function runAdjust(a: Adjust, date: DateKey, nowMin: number, entries?: CalendarEntry[]): Outcome {
  if (a.kind === 'mais') return addCapacity(date, nowMin, a.min, entries)
  if (a.kind === 'menos') return addCapacity(date, nowMin, -a.min, entries)
  if (a.kind === 'cansada') return lowerEnergy(date, nowMin, entries)
  if (a.kind === 'tenho') {
    const r = replanRest(date, nowMin, entries, { freeMin: plannedDone(date) + a.min })
    return { ...r, message: `Com ${formatMin(a.min)} pela frente: ${r.message}` }
  }
  if (a.kind === 'interesse') {
    const prev = checkinOf(getDB(), date)?.interest
    const r = replanRest(date, nowMin, entries, { interest: [prev, a.text].filter(Boolean).join(', ') })
    return { ...r, message: `Anotei “${a.text}”. ${r.message}`, changed: true }
  }
  return replanRest(date, nowMin, entries)
}

/** Minutes already done today in placed blocks (so "tenho 45 min" means 45 min ahead). */
function plannedDone(date: DateKey): number {
  return (checkinOf(getDB(), date)?.blocks ?? []).filter((b) => b.status === 'feito').reduce((s, b) => s + hmToMinutes(b.end) - hmToMinutes(b.start), 0)
}

