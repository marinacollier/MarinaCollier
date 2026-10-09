const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

/** 12345 -> "R$ 123,45" */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

/** 12345 -> "R$ 123" (rounded, for summaries) */
export function formatBRLShort(cents: number): string {
  return brlCompact.format(Math.round(cents / 100))
}

/**
 * Parses what people type on a phone keyboard: "12", "12,5", "12,50", "1.234,56", "R$ 30".
 * Returns cents, or undefined when it is not a number.
 */
export function parseBRL(input: string): number | undefined {
  const clean = input.replace(/[^\d,.-]/g, '').trim()
  if (!clean) return undefined
  let normalized = clean
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.')
  // "18.500" / "1.234.567" are pt-BR thousands, not decimals ("12.5" stays 12,50).
  else if ((clean.match(/\./g) || []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(clean)) normalized = clean.replace(/\./g, '')
  const n = Number(normalized)
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * 100)
}

/** cents -> "12,50" for editing inputs */
export function centsToInput(cents?: number): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}

// ─── Spoken / typed amounts in a sentence ("recebi 18 mil e 500") ───────────

export type SpokenAmount =
  | { kind: 'none' }
  | { kind: 'ok'; cents: number }
  /** More than one reading is possible: ask, never pick silently. Options are in cents. */
  | { kind: 'ambiguous'; options: number[] }

const UNITS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400,
  quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
}

const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "dezoito mil e quinhentos" → 18500; undefined when the words don't form a number. */
function wordsToNumber(words: string[]): number | undefined {
  let total = 0
  let group = 0
  let seen = false
  for (const w of words) {
    if (w === 'e') continue
    if (w === 'mil') {
      total += (group || 1) * 1000
      group = 0
      seen = true
    } else if (w in UNITS) {
      group += UNITS[w]
      seen = true
    } else return undefined
  }
  return seen ? total + group : undefined
}

/**
 * Finds the amount in a sentence, the way she says or types it:
 * "18 mil", "18.000", "18000", "18 mil e 500", "18.500", "R$ 18.500", "18,5 mil", "dezoito mil".
 * Dates and times ("dia 15", "15/10", "6h45") are never read as money.
 * Anything with two readings ("recebi 18", "18,500", two different amounts) comes back ambiguous.
 */
export function parseSpokenBRL(text: string): SpokenAmount {
  let t = ` ${fold(text)} `
  t = t
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\b\d{1,2}h\d{0,2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b(dia|as|ate|desde|no dia)\s+\d{1,2}\b/g, ' ')
  const found: number[][] = []
  const re = /(r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d+)?)(\s*(?:mil|k)\b)?(?:\s+e\s+(\d{1,3})\b)?(\s*reais\b)?/g
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const [, rs, num, mil, extra, reais] = m
    const money = !!rs || !!reais
    if (mil) {
      if (/^\d{1,3}(\.\d{3})+$/.test(num)) {
        found.push([Number(num.replace(/\./g, '')) * 100, Number(num.replace(/\./g, '')) * 100_000])
        continue
      }
      const base = Number(num.replace(',', '.'))
      found.push([Math.round((base * 1000 + (extra ? Number(extra) : 0)) * 100)])
      continue
    }
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(num)) {
      found.push([Math.round(Number(num.replace(/\./g, '').replace(',', '.')) * 100)])
      continue
    }
    if (/^\d+,\d{3}$/.test(num)) {
      // "18,500": 18,50 or 18.500?
      found.push([Math.round(Number(num.replace(',', '.')) * 100), Number(num.replace(',', '')) * 100])
      continue
    }
    if (/^\d+,\d{1,2}$/.test(num)) {
      found.push([Math.round(Number(num.replace(',', '.')) * 100)])
      continue
    }
    if (/^\d+\.\d{1,2}$/.test(num)) {
      // "18.50": read as decimals only when written as money; otherwise ask.
      const dec = Math.round(Number(num) * 100)
      found.push(money ? [dec] : [dec, Number(num.replace('.', '')) * 100])
      continue
    }
    if (/^\d+\.\d+$/.test(num)) continue
    const n = Number(num)
    if (money || n >= 100) found.push([n * 100])
    else if (n > 0) found.push([n * 100, n * 100_000]) // "recebi 18": R$ 18 or 18 mil?
  }
  // Written numbers: only when they clearly are money ("... mil" or "... reais").
  const words = t.split(/[^a-z0-9$]+/).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    // "mil" right after digits belongs to the numeric reading above ("18 mil").
    if (!(words[i] in UNITS) && !(words[i] === 'mil' && !/\d$/.test(words[i - 1] ?? ''))) continue
    let j = i
    while (j < words.length && (words[j] in UNITS || words[j] === 'mil' || (words[j] === 'e' && j + 1 < words.length && (words[j + 1] in UNITS || words[j + 1] === 'mil')))) j++
    const run = words.slice(i, j)
    if (run.includes('mil') || words[j] === 'reais') {
      const v = wordsToNumber(run)
      if (v) found.push([v * 100])
    }
    i = j
  }
  const distinct = [...new Set(found.flat())]
  if (!found.length) return { kind: 'none' }
  if (found.length === 1 && found[0].length === 1) return { kind: 'ok', cents: found[0][0] }
  if (found.every((f) => f.length === 1) && distinct.length === 1) return { kind: 'ok', cents: distinct[0] }
  return { kind: 'ambiguous', options: distinct }
}
