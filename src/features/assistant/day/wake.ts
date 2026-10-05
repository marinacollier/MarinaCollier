/** When the day's first timed routine item starts (the planned wake-up), in minutes. */
import { dayTimeline, isAnytime, startMin } from '@/data/timeline'
import type { DateKey, DB } from '@/data/types'

export function firstRoutineStart(db: DB, date: DateKey): number | undefined {
  const starts = dayTimeline(db, date)
    .filter((e) => e.ref.type === 'routineItem' && !isAnytime(e))
    .map((e) => startMin(e))
    .filter((m): m is number => m !== undefined)
  return starts.length ? Math.min(...starts) : undefined
}
