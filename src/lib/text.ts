/** Lowercase + strip accents, for search and matching. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function includesNormalized(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false
  return normalize(haystack).includes(normalize(needle))
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
