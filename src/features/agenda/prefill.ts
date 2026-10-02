/**
 * Local workaround until the 'event' sheet props accept a time:
 * the timeline sets the tapped hour right before opening the sheet; EventSheet consumes it once.
 */
import type { TimeHM } from '@/data/types'

let pending: { time: TimeHM; at: number } | null = null

export function setPrefillTime(time: TimeHM) {
  pending = { time, at: Date.now() }
}

/** Returns the pending time if it was set in the last few seconds, then clears it. */
export function takePrefillTime(): TimeHM | undefined {
  const p = pending
  pending = null
  return p && Date.now() - p.at < 4000 ? p.time : undefined
}
