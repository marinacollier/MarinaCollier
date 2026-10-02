/**
 * Sheet registry: SheetName → lazy component in the owning feature folder.
 * Each component is a default export taking `SheetProps<name>`.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { SheetName } from './sheet-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySheet = LazyExoticComponent<ComponentType<any>>

export const SHEETS: Record<SheetName, AnySheet> = {
  quickAdd: lazy(() => import('@/components/layout/QuickAddSheet')),
  brainDump: lazy(() => import('@/features/inbox/BrainDumpSheet')),
  brainDumpTriage: lazy(() => import('@/features/inbox/BrainDumpTriageSheet')),
  note: lazy(() => import('@/features/inbox/NoteSheet')),
  task: lazy(() => import('@/features/tasks/TaskSheet')),
  priorities: lazy(() => import('@/features/today/PrioritiesSheet')),
  routineEditor: lazy(() => import('@/features/today/RoutineEditorSheet')),
  dailyClosing: lazy(() => import('@/features/today/DailyClosingSheet')),
  expense: lazy(() => import('@/features/finance/ExpenseSheet')),
  meal: lazy(() => import('@/features/body/MealSheet')),
  workout: lazy(() => import('@/features/body/WorkoutSheet')),
  workoutLog: lazy(() => import('@/features/body/WorkoutLogSheet')),
  checkin: lazy(() => import('@/features/body/CheckinSheet')),
  workoutGoal: lazy(() => import('@/features/body/WorkoutGoalSheet')),
  goal: lazy(() => import('@/features/goals/GoalSheet')),
  study: lazy(() => import('@/features/learning/StudySheet')),
  book: lazy(() => import('@/features/learning/BookSheet')),
  trip: lazy(() => import('@/features/travel/TripSheet')),
  tripItem: lazy(() => import('@/features/travel/TripItemSheet')),
  event: lazy(() => import('@/features/agenda/EventSheet')),
  project: lazy(() => import('@/features/work/ProjectSheet')),
  win: lazy(() => import('@/features/work/WinSheet')),
  workInboxItem: lazy(() => import('@/features/work/WorkInboxItemSheet')),
  meeting: lazy(() => import('@/features/work/MeetingSheet')),
  content: lazy(() => import('@/features/creator/ContentSheet')),
  partnership: lazy(() => import('@/features/creator/PartnershipSheet')),
  petTask: lazy(() => import('@/features/life/PetTaskSheet')),
  commandPalette: lazy(() => import('@/features/command/CommandPaletteSheet')),
}
