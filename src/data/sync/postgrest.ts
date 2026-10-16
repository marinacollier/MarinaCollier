/**
 * The `records` table over Supabase's REST API (PostgREST), with plain fetch and the user's access
 * token — no SDK. RLS on the server limits every request to her own rows.
 */
export interface RemoteRow {
  collection: string
  id: string
  /** null for a tombstone. */
  data: unknown
  version: number
  deleted: boolean
  /** Server change counter (pull cursor). */
  seq?: number
}

export interface RecordsApi {
  /** Every row changed after `afterSeq`, oldest first (pages internally). */
  pull(afterSeq: number): Promise<RemoteRow[]>
  /** Upsert rows (the server keeps the higher version). */
  push(rows: RemoteRow[]): Promise<void>
}

export type SyncErrorCode = 'auth' | 'network' | 'http'

export class SyncError extends Error {
  readonly code: SyncErrorCode
  readonly status?: number
  constructor(code: SyncErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'SyncError'
    this.code = code
    this.status = status
  }
}

export interface RecordsApiOptions {
  /** https://<ref>.supabase.co */
  baseUrl: string
  anonKey: string
  token: () => Promise<string | undefined>
  fetchImpl?: typeof fetch
  pageSize?: number
  pushBatch?: number
}

export function createRecordsApi(o: RecordsApiOptions): RecordsApi {
  const pageSize = o.pageSize ?? 500
  const pushBatch = o.pushBatch ?? 200
  const root = `${o.baseUrl.replace(/\/+$/, '')}/rest/v1/records`

  async function req(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await o.token()
    if (!token) throw new SyncError('auth', 'Entre na sua conta para sincronizar')
    let res: Response
    try {
      res = await (o.fetchImpl ?? fetch)(url, {
        ...init,
        headers: { apikey: o.anonKey, Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.headers ?? {}) },
        credentials: 'omit',
      })
    } catch {
      throw new SyncError('network', 'Sem conexão com a nuvem')
    }
    if (res.status === 401 || res.status === 403) throw new SyncError('auth', 'Sessão expirada: entre de novo', res.status)
    if (!res.ok) throw new SyncError('http', `A nuvem respondeu erro ${res.status}`, res.status)
    return res
  }

  return {
    async pull(afterSeq) {
      const out: RemoteRow[] = []
      let after = afterSeq
      for (;;) {
        const q = `select=collection,id,data,version,deleted,seq&seq=gt.${after}&order=seq.asc&limit=${pageSize}`
        const page = (await (await req(`${root}?${q}`)).json()) as RemoteRow[]
        for (const r of page) out.push({ ...r, version: Number(r.version), seq: Number(r.seq) })
        if (page.length < pageSize) return out
        after = Number(page[page.length - 1].seq)
      }
    },
    async push(rows) {
      for (let i = 0; i < rows.length; i += pushBatch) {
        const body = rows.slice(i, i + pushBatch).map((r) => ({ collection: r.collection, id: r.id, data: r.deleted ? null : r.data, version: r.version, deleted: r.deleted }))
        await req(`${root}?on_conflict=user_id,collection,id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(body),
        })
      }
    },
  }
}
