import { useEffect, useState } from 'react'
import { minutesOfDay, todayKey } from '@/lib/date'

/**
 * Current São Paulo day + minute of day. Re-renders every 30s and when the app comes back
 * to the foreground, so the home flips from morning to evening (and to a new day) on its own.
 */
export function useNow(): { today: string; minutes: number; now: Date } {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = setInterval(tick, 30_000)
    const onVis = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', tick)
    }
  }, [])
  return { today: todayKey(now), minutes: minutesOfDay(now), now }
}

export function useToday(): string {
  return useNow().today
}
