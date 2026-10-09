/**
 * Attachment Understanding Layer — what Lumos read from a print / photo / PDF, in one generic shape.
 * The reader (on-device text or the vision function) only EXTRACTS; deciding and writing stay with the
 * same handlers text and voice use (e.g. an `event` goes to create_calendar_event).
 */
import type { EventDraft } from '@/data/calendar/events'
import type { DateKey } from '@/data/types'

export type AttachmentCategory = 'event' | 'travel' | 'task' | 'food' | 'work' | 'book' | 'shopping' | 'unknown'

export interface AttachmentReading {
  name: string
  kind: 'image' | 'pdf' | 'other'
  category: AttachmentCategory
  /** One line, in Portuguese, of what it is ("Convite de aniversário"). */
  summary?: string
  /** Visible text, when the reader returns it (never stored with the record). */
  text?: string
  event?: EventDraft
  task?: { title: string; due?: DateKey; who?: string }
  book?: { title: string; author?: string }
  items?: string[]
  confidence: 'high' | 'medium' | 'low'
}
