/**
 * Every bottom sheet in the app, with its props. Sheet components live in feature folders and are
 * registered in ./sheets.tsx. Each sheet component receives its props plus nothing else; it closes
 * itself with closeSheet() from '@/app/ui-store'.
 */
import type {
  BookStatus,
  DateKey,
  Expense,
  GoalLevel,
  ID,
  MealSlot,
  StudyItem,
  Task,
  TripSection,
} from '@/data/types'

export interface SheetPropsMap {
  /** Global + menu (owner: app shell). */
  quickAdd: Record<string, never>
  /** Capture-first input (owner: features/inbox). */
  brainDump: { text?: string }
  /** Convert a brain dump item into something (owner: features/inbox). */
  brainDumpTriage: { id: ID }
  /** Create/edit any Task, incl. work tasks, life admin and waiting-for (owner: features/tasks). */
  task: { id?: ID; defaults?: Partial<Task> }
  /** Edit the day's top 3 (owner: features/today). */
  priorities: { date?: DateKey }
  /** Edit routine items + weekdays (owner: features/today). */
  routineEditor: { routineId: ID }
  /** Daily closing "Dia encerrado 🌙" (owner: features/today). */
  dailyClosing: { date?: DateKey }
  /** Note / idea (owner: features/inbox). */
  note: { id?: ID; kind?: 'nota' | 'ideia' }
  /** Expense or planned purchase (owner: features/finance). */
  expense: { id?: ID; defaults?: Partial<Expense> }
  /** Meal (owner: features/body). */
  meal: { id?: ID; date?: DateKey; slot?: MealSlot }
  /** Plan/edit workout (owner: features/body). */
  workout: { id?: ID; date?: DateKey }
  /** Quick post-workout log (owner: features/body). */
  workoutLog: { id: ID }
  /** Body check-in (owner: features/body). */
  checkin: { date?: DateKey }
  /** Sport goal (owner: features/body). */
  workoutGoal: { id?: ID }
  /** Goal of any level (owner: features/goals). */
  goal: { id?: ID; level?: GoalLevel }
  /** Study item (owner: features/learning). */
  study: { id?: ID; defaults?: Partial<StudyItem> }
  /** Book (owner: features/learning). */
  book: { id?: ID; status?: BookStatus }
  /** Trip (owner: features/travel). */
  trip: { id?: ID }
  /** Trip item (owner: features/travel). */
  tripItem: { id?: ID; tripId?: ID; section?: TripSection; group?: string }
  /** Calendar event (owner: features/agenda). */
  event: { id?: ID; date?: DateKey }
  /** Project (owner: features/work). */
  project: { id?: ID }
  /** Professional win (owner: features/work). */
  win: { id?: ID; projectId?: ID }
  /** Work inbox item (owner: features/work). */
  workInboxItem: { id?: ID }
  /** Meeting notes (owner: features/work). */
  meeting: { id?: ID; projectId?: ID }
  /** Content idea/piece (owner: features/creator). */
  content: { id?: ID }
  /** Brand partnership (owner: features/creator). */
  partnership: { id?: ID }
  /** Pet task (owner: features/life). */
  petTask: { id?: ID }
  /** Command palette / actions (owner: features/command). */
  commandPalette: { query?: string }
}

export type SheetName = keyof SheetPropsMap
export type SheetProps<N extends SheetName> = SheetPropsMap[N]
