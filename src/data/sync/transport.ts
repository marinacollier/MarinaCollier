/**
 * What the sync engine needs from a cloud: rows changed since a cursor, and a way to send rows.
 * Two implementations: Supabase PostgREST (postgrest.ts) and the Claude Artifact db (artifact-db.ts).
 */
export interface RemoteRow {
  collection: string
  id: string
  /** null for a tombstone. */
  data: unknown
  version: number
  deleted: boolean
  /** Transport cursor position of this row (server seq / write time in ms). The engine keeps the max. */
  seq?: number
}

export interface PushResult {
  /** Rows the transport could not store (e.g. over the document size limit). They stay in the outbox. */
  skipped?: { collection: string; id: string; reason: 'too-big' }[]
}

export interface SyncTransport {
  /**
   * Every row changed after `cursor` (oldest first, pages internally). The transport may re-read a small
   * overlap before the cursor (late commits, clock skew); re-reading an applied row is a no-op.
   */
  pull(cursor: number): Promise<RemoteRow[]>
  /** Store rows. */
  push(rows: RemoteRow[]): Promise<PushResult | void>
}
