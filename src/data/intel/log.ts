/**
 * Life timeline (db.lifeLog): real things that happened or really changed, with provenance.
 * Kept dependency-light (store + lib only) so the schedule / nutrition / meal prep engines can log too.
 */
import type { DateKey, DB, LifeEvent } from '../types'
import { actions } from '../store'
import { nowISO, uid } from '@/lib/id'
import { todayKey } from '@/lib/date'
import { normalize } from '@/lib/text'
import type { IntelOp } from './ops'
import type { LifeEventDraft, Undo } from './types'

export type EventInput = Omit<LifeEventDraft, 'at' | 'date'> & { at?: string; date?: DateKey; id?: string }

function complete(input: EventInput): LifeEventDraft & { id: string } {
  const at = input.at ?? nowISO()
  return { ...input, id: input.id ?? uid(), at, date: input.date ?? todayKey(new Date(at)) }
}

/** Store write: one LifeEvent, with undo. */
export function logLife(draft: EventInput): { event: LifeEvent; undo: Undo } {
  const event = actions.create('lifeLog', complete(draft))
  return { event, undo: () => void actions.remove('lifeLog', event.id) }
}

/** The same event as an op (part of a bigger unit with one undo). Returns the id for `causedBy` chains. */
export function eventOp(draft: EventInput): IntelOp & { op: 'create' } {
  return { op: 'create', collection: 'lifeLog', item: complete(draft) as unknown as { id: string } & Record<string, unknown> }
}

/** Past events for a period / area / words ("quando terminei o último livro?"), newest first. */
export function lifeHistory(db: DB, opts: { from?: DateKey; to?: DateKey; area?: LifeEvent['area']; text?: string } = {}): LifeEvent[] {
  const words = opts.text ? normalize(opts.text).split(/\s+/).filter((w) => w.length > 2) : []
  return (db.lifeLog ?? [])
    .filter((e) => (!opts.from || e.date >= opts.from) && (!opts.to || e.date <= opts.to) && (!opts.area || e.area === opts.area))
    .filter((e) => !words.length || words.some((w) => normalize(e.title).includes(w)))
    .sort((a, b) => b.at.localeCompare(a.at))
}

/** Latest event about a ref (e.g. when a book was finished). */
export function lastEventFor(db: DB, ref: NonNullable<LifeEvent['ref']>, kind?: LifeEvent['kind']): LifeEvent | undefined {
  return lifeHistory(db).find((e) => e.ref?.type === ref.type && e.ref.id === ref.id && (!kind || e.kind === kind))
}
