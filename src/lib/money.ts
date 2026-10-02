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
  else if ((clean.match(/\./g) || []).length > 1) normalized = clean.replace(/\./g, '')
  const n = Number(normalized)
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * 100)
}

/** cents -> "12,50" for editing inputs */
export function centsToInput(cents?: number): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}
