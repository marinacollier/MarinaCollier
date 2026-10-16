/**
 * Content hash of a record, stable across a round trip through Postgres jsonb (which reorders keys):
 * canonical JSON (sorted keys, undefined dropped) → 53-bit cyrb53. A change detector, not crypto.
 */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined && typeof o[k] !== 'function')
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

export function hashString(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export const hashData = (v: unknown): string => hashString(canonical(v))
