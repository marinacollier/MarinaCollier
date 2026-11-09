/**
 * Sentence → a LumosReply that READS, REASONS and (inside action.run) WRITES. Pure: nothing is
 * written here. The order is deliberate — the most specific handlers first, Brain Dump capture last
 * (its "preciso…" / "ideia…" patterns are the broadest).
 */
import type { Now } from '@/data/intel'
import type { DB } from '@/data/types'
import { backupHandler } from './handlers/backup'
import { booksHandler } from './handlers/books'
import { briefingHandler } from './handlers/briefing'
import { recurringHandler } from './handlers/recurring'
import { backlogHandler } from './handlers/backlog'
import { ugcHandler } from './handlers/ugc'
import { attachmentHandler } from './handlers/attachment'
import { calendarHandler } from './handlers/calendar'
import { careHandler, crisisReply } from './handlers/care'
import { careerHandler } from './handlers/career'
import { captureHandler } from './handlers/capture'
import { dayHandler } from './handlers/day'
import { kitchenHandler } from './handlers/kitchen'
import { memoryHandler } from './handlers/memory'
import { placesHandler } from './handlers/places'
import { priorityHandler } from './handlers/priority'
import { studyHandler } from './handlers/study'
import { tasksHandler } from './handlers/tasks'
import { travelHandler } from './handlers/travel'
import { tripHandler } from './handlers/trip'
import { tripOpsHandler } from './handlers/trip-ops'
import { universeHandler } from './handlers/universe'
import { workHandler } from './handlers/work'
import { hasCrisisSignal } from '@/features/care/support'
import { norm } from './text'
import type { AttachmentReading } from '../attach/types'
import type { Handler, LumosReply, TurnContext } from './types'

/** Cuidar de Mim comes first: a crisis signal is answered with human help before anything else. */
export const HANDLERS: Handler[] = [careHandler, priorityHandler, briefingHandler, backupHandler, placesHandler, tripOpsHandler, tripHandler, recurringHandler, ugcHandler, backlogHandler, universeHandler, careerHandler, calendarHandler, attachmentHandler, memoryHandler, booksHandler, kitchenHandler, workHandler, tasksHandler, dayHandler, travelHandler, studyHandler, captureHandler]

export function respond(db: DB, text: string, now: Now, ctx: TurnContext = {}, attachment?: AttachmentReading): LumosReply | undefined {
  const n = norm(text)
  if (!n && !attachment) return undefined
  // Crisis signals win over everything, attachments included.
  if (hasCrisisSignal(text)) return crisisReply()
  // With a file, what was read decides first (the sentence is the intent); then the usual handlers.
  const order = attachment ? [calendarHandler, attachmentHandler, ...HANDLERS.filter((h) => h !== calendarHandler && h !== attachmentHandler)] : HANDLERS
  for (const h of order) {
    const r = h.run({ db, text: text.trim(), n, now, ctx, attachment })
    if (r) return r
  }
  return undefined
}
