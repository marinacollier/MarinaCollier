/**
 * When the Lumos sheet may fold itself into a toast: the latest sentence was only simple direct
 * actions, already saved (past tense + Desfazer), with nothing to choose, confirm or read.
 * Confirm-mode replies, questions with options, previews and lists keep the sheet open.
 */
import type { Exchange } from './conversation'

/** The exchanges of the latest sentence (a sentence with two actions is two exchanges). */
export function latestGroup(exchanges: Exchange[]): Exchange[] {
  const last = exchanges.at(-1)
  if (!last) return []
  const first = last.partOf ?? last.id
  return exchanges.filter((e) => e.id === first || e.partOf === first)
}

/** Max lines a "done" reply may carry and still fold — more than that is something to read. */
const MAX_LINES = 3

export function collapsible(group: Exchange[], undoable: (id: number) => boolean): boolean {
  return (
    group.length > 0 &&
    group.every((e) => {
      const l = e.lumos
      if (!l || l.status !== 'done' || e.saveNote) return false
      const r = l.reply
      return (
        r.action?.mode === 'direct' &&
        undoable(e.id) &&
        !r.options?.length &&
        !r.sections?.length &&
        (r.lines?.length ?? 0) <= MAX_LINES &&
        !r.lines?.some((x) => x.options?.length)
      )
    })
  )
}

/** The toast sentence for a folded group. */
export function toastText(group: Exchange[]): string {
  if (group.length === 1) return group[0].lumos?.reply.text ?? 'Feito ✓'
  return `Feito: ${group.length} coisas ✓`
}
