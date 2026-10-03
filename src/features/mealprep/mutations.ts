/**
 * Meal prep state changes. Pure helpers (tested) + a hook that creates the week's MealPrepPlan
 * lazily, on the first interaction (by: 'marina').
 */
import { useMemo } from 'react'
import { actions, getDB, useDB } from '@/data/store'
import type { DateKey, MealPrepPlan } from '@/data/types'
import { emptyPlanData } from '@/data/mealprep'
import type { PotState } from '@/data/mealprep'

export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** Set (or clear, with undefined) a substitution choice. */
export function withChoice(choices: Record<string, string>, key: string, value: string | undefined): Record<string, string> {
  const next = { ...choices }
  if (value === undefined) delete next[key]
  else next[key] = value
  return next
}

/** Pot state; going back to the default location removes the override. */
export function withPotState(pots: MealPrepPlan['pots'], key: string, state: PotState, defaultState: PotState): NonNullable<MealPrepPlan['pots']> {
  const next = { ...(pots ?? {}) }
  if (state === defaultState) delete next[key]
  else next[key] = state
  return next
}

export function findPlan(plans: MealPrepPlan[], weekStart: DateKey): MealPrepPlan | undefined {
  return plans.find((p) => p.weekStart === weekStart)
}

/** Week plan + a patch() that creates it on first use. */
export function useMealPrepPlan(weekStart: DateKey) {
  const plans = useDB((db) => db.mealPrepPlans)
  const plan = useMemo(() => findPlan(plans, weekStart), [plans, weekStart])

  const patch = (fn: (p: MealPrepPlan) => Partial<MealPrepPlan>) => {
    const current = findPlan(getDB().mealPrepPlans, weekStart) ?? actions.create('mealPrepPlans', emptyPlanData(weekStart, 'marina'))
    actions.update('mealPrepPlans', current.id, fn(current))
  }

  return { plan, patch }
}
