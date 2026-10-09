/**
 * READ · REASON · WRITE · ACT — the shape of a Lumos reply that is more than an answer.
 *
 * A handler reads the DB (pure), decides, and returns a LumosReply. Writes live inside
 * `action.run()`, so the same reply can be previewed, executed directly (internal, simple → done +
 * Desfazer) or held for confirmation (sensitive / external) — see ./policy.ts. Every run logs a
 * LifeEvent and its undo removes it again (./log.ts).
 */
import type { Now } from '@/data/intel'
import type { DB, Provenance } from '@/data/types'
import type { AttachmentReading } from '../attach/types'

export type Undo = () => void

export interface ReplyLine {
  text: string
  emoji?: string
  /** Second, quieter line. */
  sub?: string
  /** Shown only when it matters: inferência · integração · sugestão (fact / user stay silent). */
  provenance?: Provenance
  /** Something that is new / changed in a preview. */
  isNew?: boolean
  /** Tappable answers for this line (NeedsAttention items). */
  options?: ReplyOption[]
}

export interface ReplySection {
  title: string
  lines: ReplyLine[]
}

/**
 * A tappable next step. `ask` is sent to Lumos as Marina's sentence; `prefill` fills the composer;
 * `act` is a small direct action (dismiss, keep as is) that shows up as its own done line + Desfazer.
 */
export interface ReplyOption {
  label: string
  ask?: string
  prefill?: string
  act?: { run: () => Undo; done: string }
}

export interface ReplyAction {
  /** direct = already executed when the reply appears (Desfazer offered); confirm = waits for her tap. */
  mode: 'direct' | 'confirm'
  /** Confirm button ("Aplicar semana"). */
  label?: string
  /** Writes through the store; returns ONE undo for the whole unit (LifeEvents included). */
  run: () => Undo
  /** Sentence once executed (confirm mode); direct replies are already written in the past tense. */
  done?: string
}

export interface LumosReply {
  /** Small eyebrow ("livros", "sua semana"). */
  area: string
  /** The answer, in one natural sentence. Always something understood or executed. */
  text: string
  sub?: string
  lines?: ReplyLine[]
  sections?: ReplySection[]
  options?: ReplyOption[]
  action?: ReplyAction
  link?: { label: string; to: string }
  /** Where the whole answer comes from, when it isn't plain fact. */
  provenance?: Provenance
  /** What this reply was about — "esse livro" in the next sentence points here. */
  ref?: { type: string; id: string }
}

/** What the conversation remembers between turns (session only). */
export interface TurnContext {
  lastRef?: { type: string; id: string }
}

export interface Handler {
  id: string
  /** Pure: reads the DB, never writes. Returns undefined when the sentence isn't for this handler. */
  run(input: HandlerInput): LumosReply | undefined
}

export interface HandlerInput {
  db: DB
  text: string
  /** normalize()d, without trailing punctuation. */
  n: string
  now: Now
  ctx: TurnContext
  /** A print / photo / PDF sent with the sentence, already read (the sentence carries the intent). */
  attachment?: AttachmentReading
}
