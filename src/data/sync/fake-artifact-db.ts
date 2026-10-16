/**
 * Test-only in-memory stand-in for the claude.ai Artifact db (`claude.use("db")`): path grammar, 256 KiB
 * bodies, set = replace / update = merge-if-exists, where/orderBy/limit queries, live onSnapshot, and
 * injectable errors (e.g. resource_exhausted).
 */
import type { ArtifactCollectionRef, ArtifactDB, ArtifactDbError, ArtifactDocChange, ArtifactDocRef, ArtifactDocSnapshot, ArtifactQuery, ArtifactQuerySnapshot } from '@/integrations/artifact-db'

type Body = Record<string, unknown>
const SEG = /^[A-Za-z0-9_\-.~:@+]+$/
const meta = { fromCache: false, hasPendingWrites: false }
const err = (code: string, message = code): ArtifactDbError => ({
  code,
  message,
})

function checkPath(path: string, even: boolean) {
  const segs = path.split('/')
  if (segs.length % 2 !== (even ? 0 : 1)) throw new TypeError(`bad parity: ${path}`)
  for (const s of segs) if (!SEG.test(s) || s === '.' || s === '..' || new TextEncoder().encode(s).length > 200) throw new TypeError(`bad segment: ${s}`)
}

const snapOf = (id: string, body: Body | undefined): ArtifactDocSnapshot => ({
  id,
  exists: !!body,
  data: () => body,
  metadata: meta,
})

function cmp(a: unknown, b: unknown): number {
  if (a === undefined) return b === undefined ? 0 : 1
  if (b === undefined) return -1
  return a! < b! ? -1 : a! > b! ? 1 : 0
}

const OPS: Record<string, (a: unknown, b: unknown) => boolean> = {
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<': (a, b) => a !== undefined && cmp(a, b) < 0,
  '<=': (a, b) => a !== undefined && cmp(a, b) <= 0,
  '>': (a, b) => a !== undefined && cmp(a, b) > 0,
  '>=': (a, b) => a !== undefined && cmp(a, b) >= 0,
}

function deepMerge(a: Body, b: Body): Body {
  const out: Body = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur) ? deepMerge(cur as Body, v as Body) : v
  }
  return out
}

interface Q {
  coll: string
  filters: [string, string, unknown][]
  order?: [string, 'asc' | 'desc']
  max?: number
}

export function createFakeArtifactDb() {
  const docs = new Map<string, Body>()
  const listeners = new Set<() => void>()
  const state = {
    docs,
    writes: 0,
    reads: 0,
    /** Next N calls (reads or writes) reject with this code. */
    failNext: { code: '', times: 0 },
    maxDocs: 25_000,
  }
  const maybeFail = () => {
    if (state.failNext.times > 0) {
      state.failNext.times--
      throw err(state.failNext.code)
    }
  }
  const notify = () => queueMicrotask(() => listeners.forEach((l) => l()))

  function run(q: Q): ArtifactDocSnapshot[] {
    const prefix = `${q.coll}/`
    let list = [...docs.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map(([p, b]) => ({ id: p.slice(prefix.length), b }))
      .filter(({ b }) => q.filters.every(([f, op, v]) => OPS[op](b[f], v)))
    if (q.order) {
      const [f, dir] = q.order
      list.sort((x, y) => (dir === 'desc' ? -1 : 1) * cmp(x.b[f], y.b[f]) || cmp(x.id, y.id))
    } else list.sort((x, y) => cmp(x.id, y.id))
    if (q.max) list = list.slice(0, q.max)
    return list.map(({ id, b }) => snapOf(id, b))
  }

  const qsnap = (docsList: ArtifactDocSnapshot[], changes: ArtifactDocChange[]): ArtifactQuerySnapshot => ({
    docs: docsList,
    size: docsList.length,
    empty: !docsList.length,
    docChanges: () => changes,
    metadata: meta,
  })

  function query(q: Q): ArtifactQuery {
    return {
      where: (f, op, v) => {
        if (!OPS[op]) throw new TypeError(`op ${op}`)
        return query({ ...q, filters: [...q.filters, [f, op, v]] })
      },
      orderBy: (f, dir = 'asc') => {
        if (q.order) throw new TypeError('one orderBy')
        return query({ ...q, order: [f, dir] })
      },
      limit: (n) => {
        if (n < 1 || n > 1000) throw new TypeError('limit 1-1000')
        return query({ ...q, max: n })
      },
      get: async () => {
        state.reads++
        maybeFail()
        return qsnap(run(q), [])
      },
      onSnapshot: (next) => {
        let prev: ArtifactDocSnapshot[] = []
        const emit = () => {
          const cur = run(q)
          const before = new Map(prev.map((d, i) => [d.id, { d, i }]))
          const changes: ArtifactDocChange[] = []
          cur.forEach((d, i) => {
            const old = before.get(d.id)
            if (!old)
              changes.push({
                type: 'added',
                doc: d,
                oldIndex: -1,
                newIndex: i,
              })
            else if (old.d.data() !== d.data())
              changes.push({
                type: 'modified',
                doc: d,
                oldIndex: old.i,
                newIndex: i,
              })
            before.delete(d.id)
          })
          for (const { d, i } of before.values())
            changes.push({
              type: 'removed',
              doc: d,
              oldIndex: i,
              newIndex: -1,
            })
          prev = cur
          if (changes.length) next(qsnap(cur, changes))
        }
        queueMicrotask(() => {
          listeners.add(emit)
          const cur = run(q)
          prev = cur
          next(
            qsnap(
              cur,
              cur.map((d, i) => ({
                type: 'added',
                doc: d,
                oldIndex: -1,
                newIndex: i,
              })),
            ),
          )
        })
        return () => listeners.delete(emit)
      },
    }
  }

  function doc(path: string): ArtifactDocRef {
    checkPath(path, true)
    const id = path.split('/').pop()!
    const write = async (body: Body, merge: boolean) => {
      state.writes++
      maybeFail()
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw err('invalid_argument', 'body must be an object')
      const cur = docs.get(path)
      if (merge && !cur) throw err('invalid_argument', 'update requires an existing document')
      const next = JSON.parse(JSON.stringify(merge ? deepMerge(cur!, body) : body)) as Body
      if (new TextEncoder().encode(JSON.stringify(next)).length > 256 * 1024) throw err('invalid_argument', 'document over 256 KiB')
      if (!cur && docs.size >= state.maxDocs) throw err('quota_exceeded', 'documents in this database')
      docs.set(path, Object.freeze(next))
      notify()
    }
    return {
      id,
      path,
      get: async () => {
        state.reads++
        maybeFail()
        return snapOf(id, docs.get(path))
      },
      set: (b) => write(b, false),
      update: (b) => write(b, true),
      delete: async () => {
        state.writes++
        maybeFail()
        docs.delete(path)
        notify()
      },
      onSnapshot: (next) => {
        const emit = () => next(snapOf(id, docs.get(path)))
        queueMicrotask(() => {
          listeners.add(emit)
          emit()
        })
        return () => listeners.delete(emit)
      },
    }
  }

  const db: ArtifactDB = {
    doc,
    collection(path): ArtifactCollectionRef {
      checkPath(path, false)
      const base = query({ coll: path, filters: [] })
      return Object.assign(base, {
        path,
        doc: (id?: string) => doc(`${path}/${id ?? Math.random().toString(36).slice(2)}`),
      })
    },
  }
  return { db, state }
}
