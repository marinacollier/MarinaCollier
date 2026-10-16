/**
 * The claude.ai Artifact document store (`await window.claude.use("db")`), typed with the subset this
 * app uses (from the platform's db.d.ts). Outside an Artifact — tests, a normal browser tab, a saved copy —
 * `getArtifactDb()` resolves null and nothing else here runs.
 */

export type ArtifactDbErrorCode =
  | 'invalid_argument'
  | 'resource_exhausted'
  | 'quota_exceeded'
  | 'unavailable'
  | 'revoked'
  | 'not_granted'
  | 'capability_disabled'
  | 'capability_removed'
  | 'transform_error'

export interface ArtifactDbError {
  code: ArtifactDbErrorCode | string
  message: string
}

export interface ArtifactDocSnapshot {
  id: string
  exists: boolean
  data(): Record<string, unknown> | undefined
  metadata: { fromCache: boolean; hasPendingWrites: boolean }
}

export interface ArtifactDocChange {
  type: 'added' | 'modified' | 'removed'
  doc: ArtifactDocSnapshot
  oldIndex: number
  newIndex: number
}

export interface ArtifactQuerySnapshot {
  docs: ArtifactDocSnapshot[]
  size: number
  empty: boolean
  docChanges(): ArtifactDocChange[]
  metadata: { fromCache: boolean; hasPendingWrites: boolean }
}

export type ArtifactUnsubscribe = () => void

export interface ArtifactDocRef {
  id: string
  path: string
  get(): Promise<ArtifactDocSnapshot>
  set(data: Record<string, unknown>): Promise<void>
  update(data: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
  onSnapshot(next: (s: ArtifactDocSnapshot) => void, error?: (e: ArtifactDbError) => void): ArtifactUnsubscribe
}

export interface ArtifactQuery {
  where(field: string, op: string, value: unknown): ArtifactQuery
  orderBy(field: string, dir?: 'asc' | 'desc'): ArtifactQuery
  limit(n: number): ArtifactQuery
  get(): Promise<ArtifactQuerySnapshot>
  onSnapshot(next: (s: ArtifactQuerySnapshot) => void, error?: (e: ArtifactDbError) => void): ArtifactUnsubscribe
}

export interface ArtifactCollectionRef extends ArtifactQuery {
  path: string
  doc(id?: string): ArtifactDocRef
}

export interface ArtifactDB {
  doc(path: string): ArtifactDocRef
  collection(path: string): ArtifactCollectionRef
}

interface ClaudeRuntime {
  use?: (name: string) => Promise<unknown>
}

let pending: Promise<ArtifactDB | null> | undefined

/**
 * The Artifact db, or null when this page is not running inside an Artifact that granted it. Resolves
 * within ~12 s at most (the platform answers null after 10 s when the host never responds). Memoized.
 */
export function getArtifactDb(timeoutMs = 12_000): Promise<ArtifactDB | null> {
  return (pending ??= (async () => {
    if (typeof window === 'undefined') return null
    const c = (window as unknown as { claude?: ClaudeRuntime }).claude
    if (!c || typeof c.use !== 'function') return null
    try {
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))
      const db = await Promise.race([c.use('db'), timeout])
      return db && typeof (db as ArtifactDB).collection === 'function' ? (db as ArtifactDB) : null
    } catch {
      return null
    }
  })())
}

export const isArtifactDbError = (e: unknown): e is ArtifactDbError => !!e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string'
