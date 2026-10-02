/** Recent searches: a per-device convenience in localStorage (never required to work). */
const KEY = 'marina-os:recent-searches'
const MAX = 6

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

export function pushRecent(query: string): string[] {
  const q = query.trim()
  if (q.length < 2) return loadRecent()
  const next = [q, ...loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode / quota: fine */
  }
  return next
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
