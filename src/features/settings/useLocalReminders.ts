/**
 * Shows local reminders while the app is open (no push server yet).
 * Mount once in App: `useLocalReminders()`.
 *
 * - Only runs when Notification permission is 'granted'.
 * - Each reminder id is shown at most once per session (ids kept in sessionStorage).
 * - Uses the service worker registration so it works from the installed iPhone app (iOS 16.4+).
 */
import { useEffect } from 'react'
import { getDB } from '@/data/store'
import { computeDueNotifications, type DueNotification } from './notifications'
import { notificationPermission } from './platform'

const SEEN_KEY = 'marina-os-reminders-seen'
const CHECK_EVERY_MS = 60_000

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)))
  } catch {
    /* ignore */
  }
}

export async function showReminder(n: Pick<DueNotification, 'id' | 'title' | 'body' | 'url'>): Promise<boolean> {
  const options: NotificationOptions = { body: n.body, tag: n.id, icon: '/pwa-192.png', badge: '/pwa-192.png', data: { url: n.url } }
  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000)),
      ])
      if (reg) {
        await reg.showNotification(n.title, options)
        return true
      }
    }
    new Notification(n.title, options)
    return true
  } catch (err) {
    console.warn('[marina-os] notification failed', err)
    return false
  }
}

export function useLocalReminders(): void {
  useEffect(() => {
    let running = false
    const check = async () => {
      if (running || notificationPermission() !== 'granted') return
      running = true
      try {
        const db = getDB()
        const due = computeDueNotifications(db, new Date(), db.profile.notificationPrefs)
        const seen = readSeen()
        for (const n of due) {
          if (seen.has(n.id)) continue
          seen.add(n.id)
          writeSeen(seen)
          await showReminder(n)
        }
      } finally {
        running = false
      }
    }
    void check()
    const id = setInterval(() => void check(), CHECK_EVERY_MS)
    const onVis = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
}
