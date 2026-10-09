/**
 * Sentence → a LumosReply that READS, REASONS and (inside action.run) WRITES. Pure: nothing is
 * written here. The order is deliberate — the most specific handlers first, Brain Dump capture last
 * (its "preciso…" / "ideia…" patterns are the broadest).
 */
import type { Now } from '@/data/intel'
import type { DB } from '@/data/types'
import { backupHandler } from './handlers/backup'
import { booksHandler } from './handlers/books'
import { captureHandler } from './handlers/capture'
import { dayHandler } from './handlers/day'
import { kitchenHandler } from './handlers/kitchen'
import { memoryHandler } from './handlers/memory'
import { studyHandler } from './handlers/study'
import { travelHandler } from './handlers/travel'
import { workHandler } from './handlers/work'
import { norm } from './text'
import type { Handler, LumosReply, TurnContext } from './types'

export const HANDLERS: Handler[] = [backupHandler, memoryHandler, booksHandler, kitchenHandler, workHandler, dayHandler, travelHandler, studyHandler, captureHandler]

export function respond(db: DB, text: string, now: Now, ctx: TurnContext = {}): LumosReply | undefined {
  const n = norm(text)
  if (!n) return undefined
  for (const h of HANDLERS) {
    const r = h.run({ db, text: text.trim(), n, now, ctx })
    if (r) return r
  }
  return undefined
}
