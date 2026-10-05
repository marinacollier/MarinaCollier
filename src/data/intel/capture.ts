/**
 * Universal Capture — one pipeline for anything Marina hands to Lumos:
 *   capture(input) → normalized (text + attachments + honest support flag) → routed text for Lumos.
 * Today only text (and voice WITH a transcript, e.g. the iOS keyboard dictation) is understood.
 * Audio, images, screenshots and files are accepted by the contract but answered honestly:
 * Lumos asks for the content in text instead of pretending to read it.
 */
import type { CaptureInput } from './types'

export interface NormalizedCapture {
  text?: string
  attachments: { kind: string; name?: string }[]
  supported: boolean
  note?: string
}

/** What each input kind can do right now (the UI uses it to show or hide buttons honestly). */
export const CAPTURE_SUPPORT: Record<CaptureInput['kind'], { supported: boolean; note?: string }> = {
  text: { supported: true },
  voice: { supported: true, note: 'Por enquanto, voz entra pelo ditado do teclado (texto).' },
  image: { supported: false, note: 'Ainda não leio imagens — me conta em texto o que tem nela.' },
  screenshot: { supported: false, note: 'Ainda não leio prints — me conta em texto o que aparece nele.' },
  file: { supported: false, note: 'Ainda não leio arquivos — me conta em texto o que tem nele.' },
}

/** Normalize any input into something Lumos can route. Unsupported kinds say so honestly. */
export function normalizeCapture(input: CaptureInput): NormalizedCapture {
  if (input.kind === 'text') return { text: input.text.trim(), attachments: [], supported: true }
  if (input.kind === 'voice') {
    if (input.transcript?.trim()) return { text: input.transcript.trim(), attachments: [], supported: true }
    return { attachments: [{ kind: 'voice' }], supported: false, note: 'Ainda não transcrevo áudio aqui — usa o ditado do teclado ou me escreve?' }
  }
  return {
    text: input.caption?.trim() || undefined,
    attachments: [{ kind: input.kind, name: input.name }],
    supported: false,
    note: CAPTURE_SUPPORT[input.kind].note,
  }
}

export interface RoutedCapture extends NormalizedCapture {
  /** 'lumos' = send `text` to the conversation; 'ask_text' = answer with `note` and wait for text. */
  route: 'lumos' | 'ask_text'
  /** Where it came from (shown as a tiny label: "por voz", "legenda do print"). */
  via: CaptureInput['kind']
}

/**
 * Full pipeline. An unsupported attachment WITH a caption still routes the caption to Lumos
 * (the note is kept so Lumos can say it didn't read the file itself).
 */
export function capture(input: CaptureInput): RoutedCapture {
  const n = normalizeCapture(input)
  const route = n.text ? 'lumos' : 'ask_text'
  return { ...n, route, via: input.kind }
}
