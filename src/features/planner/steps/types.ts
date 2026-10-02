import type { Dispatch, SetStateAction } from 'react'
import type { DateKey, DB, Workout } from '@/data/types'
import type { TrainingLine, WeekDraft } from '../plan'

export interface StepProps {
  db: DB
  today: DateKey
  weekStart: DateKey
  /** Days still plannable (from today on). */
  days: DateKey[]
  draft: WeekDraft
  setDraft: Dispatch<SetStateAction<WeekDraft>>
  lines: TrainingLine[]
  /** Workouts the draft would create (simulation only). */
  planned: Workout[]
}
