/**
 * Test-only in-memory stand-in for Supabase PostgREST + the `records` table (RLS by token, the
 * records_stamp trigger: server seq, higher-version-wins). Stores jsonb with keys reordered, like Postgres.
 */
import type { RemoteRow } from './postgrest'

interface Stored extends RemoteRow {
  user: string
  seq: number
}

const reorder = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(reorder)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return Object.fromEntries(Object.keys(o).reverse().map((k) => [k, reorder(o[k])]))
  }
  return v
}

export function createFakePostgrest() {
  const rows = new Map<string, Stored>()
  let seq = 0
  const server = {
    rows,
    offline: false,
    requests: 0,
    tokenFor: (user: string) => `h.${btoa(JSON.stringify({ sub: user }))}.s`,
    userRows: (user: string) => [...rows.values()].filter((r) => r.user === user),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      server.requests++
      if (server.offline) throw new TypeError('Failed to fetch')
      const url = new URL(String(input))
      const headers = (init?.headers ?? {}) as Record<string, string>
      const auth = headers.Authorization?.replace('Bearer ', '')
      let user: string | undefined
      try {
        user = (JSON.parse(atob(auth!.split('.')[1])) as { sub: string }).sub
      } catch {
        return new Response('{}', { status: 401 })
      }
      if (!headers.apikey) return new Response('{}', { status: 401 })
      if (!url.pathname.endsWith('/rest/v1/records')) return new Response('{}', { status: 404 })
      if ((init?.method ?? 'GET') === 'GET') {
        const after = Number(url.searchParams.get('seq')?.replace('gt.', '') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? 1000)
        const page = server
          .userRows(user)
          .filter((r) => r.seq > after)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, limit)
          .map(({ collection, id, data, version, deleted, seq }) => ({ collection, id, data, version, deleted, seq }))
        return new Response(JSON.stringify(page), { status: 200 })
      }
      const body = JSON.parse(String(init?.body)) as RemoteRow[]
      for (const r of body) {
        const key = `${user}/${r.collection}/${r.id}`
        const old = rows.get(key)
        if (old && r.version <= old.version) continue // trigger: skip non-newer updates
        rows.set(key, { user, collection: r.collection, id: r.id, data: reorder(JSON.parse(JSON.stringify(r.data))), version: r.version, deleted: r.deleted, seq: ++seq })
      }
      return new Response(null, { status: 201 })
    }) as typeof fetch,
  }
  return server
}
