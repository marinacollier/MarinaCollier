/** Small pt-BR text helpers for the act handlers (her own spelling is kept wherever possible). */
import type { DateKey, Weekday } from '@/data/types'
import { addDays, formatDayMonth, weekday } from '@/lib/date'
import { normalize } from '@/lib/text'

/** normalize() + collapse spaces + drop trailing punctuation. */
export function norm(s: string): string {
  return normalize(s).replace(/\s+/g, ' ').replace(/[?!.…]+$/g, '').trim()
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20,
}

/** "6" / "seis" → 6. */
export function numberOf(word: string | undefined): number | undefined {
  if (!word) return undefined
  const w = normalize(word)
  if (/^\d+$/.test(w)) return Number(w)
  return NUMBER_WORDS[w]
}

export const NUMBER_RE = `(\\d+|${Object.keys(NUMBER_WORDS).join('|')})`

export const WEEKDAY_WORDS: Record<string, Weekday> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 }

/** First weekday mentioned ("na terça" → 2). */
export function weekdayIn(n: string): Weekday | undefined {
  for (const [w, wd] of Object.entries(WEEKDAY_WORDS)) if (new RegExp(`\\b${w}s?\\b`).test(n)) return wd
  return undefined
}

/** "hoje" / "amanhã" / a weekday (next occurrence, today included) → DateKey. */
export function dayIn(n: string, today: DateKey): DateKey | undefined {
  if (/\bdepois de amanha\b/.test(n)) return addDays(today, 2)
  if (/\bamanha\b/.test(n)) return addDays(today, 1)
  if (/\bhoje\b/.test(n)) return today
  const wd = weekdayIn(n)
  if (wd === undefined) return undefined
  return addDays(today, (wd - weekday(today) + 7) % 7)
}

/** "terças" plural label. */
export const WEEKDAY_PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'] as const

/** Capitalize the first letter only. */
export function cap(s: string): string {
  const t = s.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

/** Strip a leading phrase (normalized match) from the ORIGINAL text, keeping her spelling. */
export function stripLead(original: string, lead: RegExp): string {
  const n = normalize(original)
  const m = lead.exec(n)
  if (!m || m.index !== 0) return original.trim()
  // normalize() keeps length for pt-BR letters (NFD + strip marks keeps 1:1 for precomposed input).
  return original.trim().slice(m[0].length).trim()
}

/** Cuts a normalized span [from, to) out of the original string (normalize keeps positions 1:1). */
export function sliceOriginal(original: string, from: number, to?: number): string {
  const src = original.normalize('NFC')
  return src.slice(from, to).trim()
}

export function ddmm(date: DateKey): string {
  return formatDayMonth(date)
}

/** Words that matter for matching titles (no articles/preps). */
const STOP = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'pra', 'para', 'com', 'meu', 'minha', 'the', 'of', 'to', 'and'])
export function keyWords(s: string): string[] {
  return norm(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
}

/** Best title match: the full normalized title inside the sentence, or most of its key words. */
export function matchTitle<T extends { title: string }>(items: T[], n: string): T | undefined {
  const full = items.filter((i) => norm(i.title).length >= 3 && n.includes(norm(i.title)))
  if (full.length) return full.sort((a, b) => b.title.length - a.title.length)[0]
  const words = new Set(n.split(/[^a-z0-9]+/))
  let best: { item: T; score: number } | undefined
  for (const it of items) {
    const kw = keyWords(it.title)
    if (!kw.length) continue
    const hit = kw.filter((w) => words.has(w)).length
    const score = hit / kw.length
    if (hit >= Math.min(2, kw.length) && score >= 0.5 && (!best || score > best.score)) best = { item: it, score }
  }
  return best?.item
}

/** "a, b e c" split ("arroz, whey e café"). */
export function splitList(s: string): string[] {
  return s
    .split(/\s*,\s*|\s+e\s+/)
    .map((x) => x.replace(/^(o|a|os|as|um|uma|de|do|da)\s+/i, '').trim())
    .filter(Boolean)
}
