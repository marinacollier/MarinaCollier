/**
 * Integration hook for finished activities (Strava-shaped). There is NO Strava connection in the app
 * yet — this is the matching logic a future sync (or a pasted / manual activity) calls:
 *   activity { date, sport, start?, duration?, distance? } → the planned workout it completes
 *   (same day + same modality group, closest start time / duration) → ActionGraph 'activityDone'.
 */
import type { DateKey, DB, ID, TimeHM, TrainingGroup } from '../types'
import { contextWorkouts } from '../fuel'
import { modalityGroup } from '../planning'
import { hmToMinutes } from '@/lib/date'
import { normalize } from '@/lib/text'
import type { GraphChange } from './types'

export interface ActivityInput {
  date: DateKey
  /** Strava sport_type ("Run", "Ride", "GravelRide", "Swim", "WeightTraining"…) or a pt-BR word. */
  sport: string
  startTime?: TimeHM
  durationMin?: number
  distanceKm?: number
  source: 'strava' | 'manual'
}

const SPORT_GROUP: [RegExp, TrainingGroup][] = [
  [/trail|run|corrida|correr|virtualrun/, 'corrida'],
  [/ride|bike|pedal|cycling|gravel|mtb|speed/, 'bike'],
  [/swim|nata|piscina/, 'natacao'],
  [/weight|crossfit|muscula|forca|strength|workout/, 'forca'],
  [/yoga|pilates|mobilidade|stretch/, 'mobilidade'],
  [/walk|hike|caminhada|surf|circo/, 'fun'],
]

export function sportGroup(sport: string): TrainingGroup | undefined {
  const s = normalize(sport).replace(/\s+/g, '')
  return SPORT_GROUP.find(([re]) => re.test(s))?.[1]
}

export interface ActivityMatch {
  workoutId: ID
  title: string
  score: number
}

/** The planned workout this activity completes (same day + modality group), or undefined. */
export function matchActivity(db: DB, a: ActivityInput): ActivityMatch | undefined {
  const group = sportGroup(a.sport)
  if (!group) return undefined
  const candidates = contextWorkouts(db, a.date).filter((w) => w.status === 'planejado' && modalityGroup(db.profile, w.modality) === group)
  let best: ActivityMatch | undefined
  for (const w of candidates) {
    let score = 100
    const planned = w.plannedDurationMin ?? w.durationMin
    if (planned && a.durationMin) score -= Math.min(50, (Math.abs(planned - a.durationMin) / planned) * 50)
    if (w.time && a.startTime) score -= Math.min(40, Math.abs(hmToMinutes(w.time) - hmToMinutes(a.startTime)) / 6)
    if (!best || score > best.score) best = { workoutId: w.id, title: w.title || w.modality, score }
  }
  return best
}

/** The ActionGraph change for an activity, when it matches a planned workout. */
export function activityChange(db: DB, a: ActivityInput): Extract<GraphChange, { kind: 'activityDone' }> | undefined {
  const m = matchActivity(db, a)
  if (!m) return undefined
  return { kind: 'activityDone', date: a.date, workoutId: m.workoutId, activity: { durationMin: a.durationMin, distanceKm: a.distanceKm, source: a.source } }
}
