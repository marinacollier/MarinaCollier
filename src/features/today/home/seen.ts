/**
 * ChangeFeed baseline (profile.lumosLastSeenAt). Home computes "o que mudou" when it opens, holds
 * that snapshot, and only moves the baseline when Marina LEAVES Home (navigates away, backgrounds the
 * app) — so the brief she's reading never empties under her. At most one write per hour.
 */
import { useEffect } from 'react'
import { actions, getDB } from '@/data/store'
import { nowISO } from '@/lib/id'

export const SEEN_EVERY_MIN = 60

export function shouldMarkSeen(last: string | undefined, nowIso: string): boolean {
  if (!last) return true
  const a = Date.parse(last)
  const b = Date.parse(nowIso)
  if (Number.isNaN(a) || Number.isNaN(b)) return true
  return b - a >= SEEN_EVERY_MIN * 60_000
}

export function markSeen(): void {
  const now = nowISO()
  if (shouldMarkSeen(getDB().profile.lumosLastSeenAt, now)) actions.setProfile({ lumosLastSeenAt: now })
}

export function useMarkSeenOnLeave(): void {
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && markSeen()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', markSeen)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', markSeen)
      markSeen()
    }
  }, [])
}
