/**
 * Sync transport over the claude.ai Artifact document store. One document per record in collection `rec`:
 *   rec/<docId>  { c: collection, id, v: version, d: data | null, del, at: ISO write time, dev: device }
 * The profile is just another record (`_profile` / `me`), so it has its own document.
 *
 * - Cursor = the highest `at` seen (ms). pull = where('at','>=',cursor − overlap).orderBy('at').limit(1000),
 *   paginated. The overlap re-reads a few minutes so a device with a slightly late clock (or a write that
 *   landed out of order) is still picked up; merge uses `v`, never `at`, so a re-read is a no-op.
 * - `at` is max(now, last seen + 1): a device writes after everything it has already seen.
 * - Writes go one per document, a few at a time, with exponential backoff on `resource_exhausted`.
 * - A body over the 256 KiB limit is not sent (reported as skipped; the record stays on this device).
 */
import { isArtifactDbError, type ArtifactDB, type ArtifactDbError, type ArtifactUnsubscribe } from '@/integrations/artifact-db'
import { hashString } from './hash'
import { SyncError } from './postgrest'
import type { PushResult, RemoteRow, SyncTransport } from './transport'
import type { SyncEngine } from './engine'

export const REC_COLLECTION = 'rec'
/** The platform limit is 256 KiB serialized; keep a margin for its own encoding. */
export const MAX_DOC_BYTES = 250_000
const MAX_SEGMENT = 200
const SAFE = /[A-Za-z0-9_\-.:@]/

function encodePart(s: string): string {
  let out = ''
  for (const ch of s) {
    if (SAFE.test(ch)) out += ch
    else for (const b of new TextEncoder().encode(ch)) out += `~${b.toString(16).padStart(2, '0')}`
  }
  return out
}

/**
 * Document id for a record: `<collection>+<id>`, each part keeping letters/digits/`_-.:@` and writing any
 * other byte as `~xx` (so `+` never appears inside a part → injective). Over 200 bytes → a prefix plus a
 * hash of the full key (the original id is always in the body).
 */
export function docIdFor(collection: string, id: string): string {
  const full = `${encodePart(collection)}+${encodePart(id)}`
  if (full.length <= MAX_SEGMENT) return full
  return `${full.slice(0, 170)}~h${hashString(`${collection}\u0000${id}`)}`
}

export interface ArtifactTransportOptions {
  db: ArtifactDB
  deviceId: string
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Parallel writes (kept low: the store rate-limits per viewer). */
  concurrency?: number
  /** How far before the cursor each pull re-reads (clock skew between devices). */
  overlapMs?: number
  pageSize?: number
  /** Attempts on resource_exhausted before giving up for this round. */
  maxAttempts?: number
}

export interface ArtifactTransport extends SyncTransport {
  /** True when no record document exists yet. */
  isEmpty(): Promise<boolean>
  /**
   * One live subscription (newest writes first, small window). Calls onRemote when another device wrote;
   * onError on a terminal subscription error. Returns the unsubscribe.
   */
  watch(onRemote: () => void, onError: (e: ArtifactDbError) => void): ArtifactUnsubscribe
}

const bytes = (s: string) => new TextEncoder().encode(s).length

function toSyncError(e: unknown): SyncError {
  if (e instanceof SyncError) return e
  if (!isArtifactDbError(e)) return new SyncError('network', 'erro inesperado no armazenamento do Claude')
  switch (e.code) {
    case 'quota_exceeded':
      return new SyncError('http', 'armazenamento do Claude cheio')
    case 'resource_exhausted':
      return new SyncError('network', 'muitas gravações seguidas; tento de novo em instantes')
    case 'revoked':
    case 'not_granted':
    case 'capability_disabled':
    case 'capability_removed':
      return new SyncError('auth', 'armazenamento do Claude indisponível nesta visualização')
    case 'invalid_argument':
    case 'transform_error':
      return new SyncError('http', 'o Claude recusou um registro')
    default:
      return new SyncError('network', 'sem conexão com o Claude')
  }
}

export function createArtifactTransport(o: ArtifactTransportOptions): ArtifactTransport {
  const now = o.now ?? Date.now
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const concurrency = Math.max(1, o.concurrency ?? 3)
  const overlap = o.overlapMs ?? 10 * 60_000
  const pageSize = Math.min(1000, o.pageSize ?? 1000)
  const maxAttempts = o.maxAttempts ?? 6
  const coll = () => o.db.collection(REC_COLLECTION)
  let lastAt = 0

  async function retry<T>(fn: () => Promise<T>): Promise<T> {
    let unavailable = 0
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn()
      } catch (e) {
        const code = isArtifactDbError(e) ? e.code : ''
        if (code === 'resource_exhausted' && attempt < maxAttempts) {
          await sleep(Math.min(30_000, 500 * 2 ** (attempt - 1)) * (1 + Math.random() * 0.3))
          continue
        }
        if (code === 'unavailable' && unavailable++ < 1) {
          await sleep(300 + Math.random() * 700)
          continue
        }
        throw toSyncError(e)
      }
    }
  }

  function rowOf(body: Record<string, unknown> | undefined): RemoteRow | null {
    if (!body || typeof body.c !== 'string' || typeof body.id !== 'string' || typeof body.v !== 'number') return null
    const at = Date.parse(String(body.at))
    const deleted = body.del === true
    return {
      collection: body.c,
      id: body.id,
      version: body.v,
      deleted,
      data: deleted ? null : (body.d ?? null),
      seq: Number.isFinite(at) ? at : 0,
    }
  }

  return {
    async pull(cursor) {
      const out: RemoteRow[] = []
      const seen = new Set<string>()
      let from = new Date(Math.max(0, cursor > 0 ? cursor - overlap : 0)).toISOString()
      for (;;) {
        const snap = await retry(() => coll().where('at', '>=', from).orderBy('at').limit(pageSize).get())
        let fresh = 0
        for (const d of snap.docs) {
          if (seen.has(d.id)) continue
          seen.add(d.id)
          fresh++
          const r = rowOf(d.data())
          if (!r) continue
          out.push(r)
          if (r.seq! > lastAt) lastAt = r.seq!
        }
        if (snap.size < pageSize || !fresh) return out
        from = String(snap.docs[snap.docs.length - 1].data()?.at ?? from)
      }
    },

    async push(rows): Promise<PushResult> {
      const skipped: NonNullable<PushResult['skipped']> = []
      const queue = [...rows]
      let failed = false
      const worker = async () => {
        for (let r = queue.shift(); r && !failed; r = queue.shift()) {
          lastAt = Math.max(now(), lastAt + 1)
          const body = {
            c: r.collection,
            id: r.id,
            v: r.version,
            d: r.deleted ? null : (r.data ?? null),
            del: r.deleted,
            at: new Date(lastAt).toISOString(),
            dev: o.deviceId,
          }
          if (bytes(JSON.stringify(body)) > MAX_DOC_BYTES) {
            skipped.push({
              collection: r.collection,
              id: r.id,
              reason: 'too-big',
            })
            continue
          }
          const ref = coll().doc(docIdFor(r.collection, r.id))
          try {
            await retry(() => ref.set(body))
          } catch (e) {
            failed = true // the others stop too; what didn't go stays in the outbox
            throw e
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker))
      return { skipped }
    },

    async isEmpty() {
      return (await retry(() => coll().limit(1).get())).empty
    },

    watch(onRemote, onError) {
      let first = true
      return coll()
        .orderBy('at', 'desc')
        .limit(20)
        .onSnapshot((snap) => {
          if (first) {
            first = false
            return
          }
          const remote = snap.docChanges().some((ch) => ch.type !== 'removed' && ch.doc.data()?.dev !== o.deviceId)
          if (remote) onRemote()
        }, onError)
    },
  }
}

/**
 * First time a device talks to the Claude store (or its sync bookkeeping was lost). `beforeMerge` runs
 * first (the caller keeps a restorable copy of the DB).
 *  - store empty → upload everything, read it back and compare (counts + content hashes);
 *  - store has data → adopt it: the cloud wins every record this device never synced (a fresh install's
 *    seed never overwrites her data); records only here are sent on the following sync.
 * Returns how many records were too big to upload. Throws when the upload did not verify.
 */
export async function claudeFirstRun(engine: SyncEngine, transport: ArtifactTransport, beforeMerge: () => Promise<unknown>): Promise<number> {
  await beforeMerge()
  if (!(await transport.isEmpty())) {
    await engine.adopt()
    return 0
  }
  const report = await engine.uploadAll()
  if (!report.ok) throw new SyncError('http', 'o primeiro envio não conferiu; tento de novo')
  return report.issues.filter((i) => i.kind === 'too-big').length
}
