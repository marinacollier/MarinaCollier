import { actions } from '@/data/store'
import { nowISO } from '@/lib/id'
import type { PlanOps } from './plan'

/** Writes a confirmed plan. Only called from the last step ("Montar semana"). */
export function commitPlan(ops: PlanOps): void {
  if (ops.workouts.length) actions.createMany('workouts', ops.workouts)
  if (ops.goals.length) actions.createMany('goals', ops.goals)
  if (ops.priorities.length) actions.createMany('priorities', ops.priorities)
  const confirmedAt = nowISO()
  if (ops.weekPlan.existingId) actions.update('weekPlans', ops.weekPlan.existingId, { confirmedAt })
  else actions.create('weekPlans', { weekStart: ops.weekPlan.weekStart, confirmedAt })
}
