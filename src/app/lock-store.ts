/** Session state of the privacy lock (memory only — every cold start begins locked). */
import { create } from 'zustand'
import type { LockArea, PrivacyLock } from '@/data/types'

interface LockState {
  unlockedAt?: number
  hiddenAt?: number
}

export const useLockState = create<LockState>(() => ({}))

export function unlockSession(): void {
  useLockState.setState({ unlockedAt: Date.now(), hiddenAt: undefined })
}

export function lockSession(): void {
  useLockState.setState({ unlockedAt: undefined })
}

export function areaLocked(lock: PrivacyLock | undefined, area: LockArea, state: LockState = useLockState.getState()): boolean {
  if (!lock?.enabled || !lock.areas.includes(area)) return false
  return !state.unlockedAt
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const s = useLockState.getState()
    if (document.visibilityState === 'hidden') useLockState.setState({ hiddenAt: Date.now() })
    else if (s.hiddenAt && s.unlockedAt) {
      // Read the relock window lazily to avoid a store import cycle.
      void import('@/data/store').then(({ getDB }) => {
        const mins = getDB().profile.privacyLock?.relockMinutes ?? 5
        if (Date.now() - (s.hiddenAt ?? 0) > mins * 60_000) lockSession()
        else useLockState.setState({ hiddenAt: undefined })
      })
    }
  })
}
