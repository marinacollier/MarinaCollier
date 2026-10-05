/**
 * Lumos Intelligence Layer — public API (CONTRACT).
 *
 * Home and the Lumos chat import ONLY from here. Engines live in this folder:
 *   context.ts   LifeContextEngine — lifeContext(db, now) / dayContext: today, tomorrow, week; trainings,
 *                commitments, nutrition day, free windows, energy, next trip; `notes` with provenance.
 *   proactive.ts dailyBrief (one line) · homeSuggestions (≤ 3, contextual) · proactiveInsights (0–3, acked keys hidden)
 *   attention.ts NeedsAttention — needsAttention(db, now): conflicts, ambiguities, decisions, waiting-for due;
 *                ackAttention(key, how) to resolve / dismiss / snooze.
 *   changes.ts   ChangeFeed — changeFeed(db, now, since?) real deltas (life log + entity timestamps, seed ignored);
 *                sinceYesterday(now) for "desde ontem"; markLumosSeen(now) moves the baseline.
 *   graph.ts     ActionGraph — planChange(db, change, now) → { lines, apply(): undo, sensitive }
 *                (moveWorkout / setDuration / cancel / workMode / activityDone and their dependencies).
 *   planner.ts   SmartPlanner — planWeek(db, now, weekStart?) layered week + apply(): undo.
 *   memory.ts    TemporalMemory — memoryView + rememberFact / updateState / observe / markPatternAsked /
 *                confirmPattern / correctMemory / forget (all logged + undoable).
 *   capture.ts   Universal Capture — normalizeCapture(input) and capture(input) (honest about unsupported kinds).
 *   strava.ts    Integration hook — matchActivity / activityChange (activity → planned workout → activityDone).
 *   log.ts       Life timeline — logLife(draft) / lifeHistory(db, opts) / lastEventFor.
 *   ops.ts       Write units: previewOps(db, ops) / commitOps(ops) (one undo).
 * Pantry writes (addToPantry / recordPrepared / …) come from the meal prep engine and are re-exported here.
 *
 * Central rule: if Lumos can solve it without interrupting Marina, it solves and offers Undo;
 * relevant ambiguity or sensitive external action → ask (GraphPlan.sensitive).
 * Every write logs a LifeEvent (provenance + by) and the same undo removes it.
 * "Now" is always passed in: { date: DateKey, minutes: minutes since 00:00 in São Paulo, iso? }.
 */
export type {
  AttentionItem,
  CaptureInput,
  ChangeItem,
  DayContext,
  GraphChange,
  GraphPlan,
  Insight,
  LifeContext,
  LifeEventDraft,
  MemoryLayer,
  MemoryView,
  Now,
  PlanLayer,
  Sourced,
  Undo,
  WeekProposal,
  WeekProposalItem,
} from './types'

export { busyIntervals, dayContext, dayLabel, fmtDuration, freeWindows, lifeContext, trainingNoun, tripOpenItems } from './context'
export { dailyBrief, homeSuggestions, proactiveInsights } from './proactive'
export { ackAttention, isAcked, needsAttention } from './attention'
export { changeFeed, markLumosSeen, sinceYesterday } from './changes'
export { planChange, resolveWorkout } from './graph'
export { defaultPlanWeek, planWeek } from './planner'
export { confirmedMemory, confirmPattern, correctMemory, forget, markPatternAsked, memoryByKey, memoryView, observe, PATTERN_EVIDENCE, rememberFact, updateState, type RememberOptions } from './memory'
export { CAPTURE_SUPPORT, capture, normalizeCapture, type NormalizedCapture, type RoutedCapture } from './capture'
export { activityChange, matchActivity, sportGroup, type ActivityInput, type ActivityMatch } from './strava'
export { eventOp, lastEventFor, lifeHistory, logLife, type EventInput } from './log'
export { commitOps, createOp, fromScheduleOps, previewOps, type IntelOp } from './ops'
export { addToPantry, pantryNames, preparedStock, recordPrepared, removeFromPantry, usePrepared, type PreparedStock } from '../mealprep/pantry'

/** "Now" for the real clock (screens); engines and tests pass their own. */
export { nowFor } from './now'
