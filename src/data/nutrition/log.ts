/**
 * Store wrappers for the nutrition engine. Every write returns an `undo` that restores the exact
 * previous state (records created are taken out, records changed get their old fields back).
 * They never toast — the caller (Home card, sheet, Lumos chat) decides how to tell her.
 */
import { actions, getDB } from '@/data/store'
import type { DateKey, FoodItem, FoodTag, ID, LoggedFood, Meal, MealAdjustment, MealPurpose, MealSlot, PlannedMeal } from '@/data/types'
import { hmToMinutes, minutesOfDay, toTimeHM, todayKey } from '@/lib/date'
import { dayTrainingContext } from '@/data/fuel'
import { proposeAdjustments, type AdaptResult, type AdjustmentDraft } from './adapt'
import { dayMeals, type BadgedFood } from './ledger'
import { plannedFoodInfo } from './nutrients'
import { describeFoods } from './parse'
import { logLife } from '@/data/intel/log'

export type Undo = () => void

const chain =
  (...undos: Undo[]): Undo =>
  () => {
    for (const u of [...undos].reverse()) u()
  }

function updateWithUndo<K extends 'meals' | 'mealAdjustments' | 'foods'>(key: K, id: ID, patch: Record<string, unknown>): Undo {
  const before = (getDB()[key] as { id: ID }[]).find((x) => x.id === id) as Record<string, unknown> | undefined
  if (!before) return () => {}
  actions.update(key, id, patch as never)
  return () => {
    const cleared: Record<string, unknown> = {}
    for (const k of Object.keys(patch)) cleared[k] = before[k]
    actions.update(key, id, cleared as never)
  }
}

/** Which slot a prescribed meal falls into (training meals are 'extra'). */
export function slotForPlannedMeal(m: Pick<PlannedMeal, 'phase' | 'time'>): MealSlot {
  if (m.phase === 'pre' || m.phase === 'intra') return 'extra'
  const min = m.time ? hmToMinutes(m.time) : 12 * 60
  if (min < 10 * 60 + 30) return 'cafe'
  if (min < 11 * 60 + 30) return 'lanche_manha'
  if (min < 15 * 60) return 'almoco'
  if (min < 18 * 60 + 30) return 'lanche_tarde'
  return 'jantar'
}

/** Is an adjustment "small" enough to auto-apply (when she turned that on)? At most two items of one meal. */
export function isSmall(d: AdjustmentDraft, originalCount: number): boolean {
  if (d.kind !== 'trocar' && d.kind !== 'adaptar') return false
  const changed = d.items.filter((i) => i.badge !== 'nutri').length + Math.max(0, originalCount - d.items.length)
  return changed <= 2
}

/** Creates adjustment records from drafts; a proposal replaces older pending ones for that meal. */
function storeDrafts(drafts: AdjustmentDraft[], autoApply: boolean, originalCounts: Record<string, number>): { created: MealAdjustment[]; undo: Undo; autoApplied: boolean } {
  const undos: Undo[] = []
  const created: MealAdjustment[] = []
  let autoApplied = false
  for (const d of drafts) {
    for (const old of getDB().mealAdjustments.filter((a) => a.date === d.date && a.planMealRef === d.planMealRef && a.status === 'proposed')) {
      undos.push(updateWithUndo('mealAdjustments', old.id, { status: 'dismissed' }))
    }
    const apply = autoApply && isSmall(d, originalCounts[d.planMealRef] ?? d.items.length)
    if (apply) {
      autoApplied = true
      for (const old of getDB().mealAdjustments.filter((a) => a.date === d.date && a.planMealRef === d.planMealRef && a.status === 'applied')) {
        undos.push(updateWithUndo('mealAdjustments', old.id, { status: 'dismissed' }))
      }
    }
    const item = actions.create('mealAdjustments', { ...d, status: apply ? 'applied' : d.status })
    created.push(item)
    undos.push(() => void actions.remove('mealAdjustments', item.id))
  }
  return { created, undo: chain(...undos), autoApplied }
}

export interface LogFoodInput {
  date?: DateKey
  foods: LoggedFood[]
  /** Text she typed (kept as the description when given). */
  description?: string
  now?: Date
  slot?: MealSlot
  via?: Meal['loggedVia']
  tags?: FoodTag[]
  purpose?: MealPurpose
  workoutId?: ID
  /** Skip re-evaluating the rest of the day (e.g. logging a past day). */
  noAdapt?: boolean
}

export interface LogResult {
  meal: Meal
  adapt?: AdaptResult
  adjustments: MealAdjustment[]
  /** A small adjustment was applied automatically (profile.lumosAutoApplySmall). */
  autoApplied: boolean
  undo: Undo
}

/**
 * "comi um YoPRO": records the extra at the real time, then re-evaluates the REST of the day
 * (proposals only, unless she enabled auto-apply for small ones). Meals already eaten never change.
 */
export function logFood(input: LogFoodInput): LogResult {
  const now = input.now ?? new Date()
  const date = input.date ?? todayKey(now)
  const isToday = date === todayKey(now)
  const undos: Undo[] = []
  const meal = actions.create('meals', {
    date,
    slot: input.slot ?? 'extra',
    description: input.description?.trim() || describeFoods(input.foods) || 'Refeição',
    done: true,
    tags: input.tags ?? [],
    time: isToday ? toTimeHM(now) : undefined,
    consumedAt: isToday ? now.toISOString() : undefined,
    foods: input.foods,
    contentSource: 'marina',
    loggedVia: input.via ?? 'formulario',
    ...(input.purpose ? { purpose: input.purpose } : {}),
    ...(input.workoutId ? { workoutId: input.workoutId } : {}),
  })
  undos.push(() => void actions.remove('meals', meal.id))

  for (const id of new Set(input.foods.map((f) => f.foodId).filter(Boolean) as ID[])) {
    const f = getDB().foods.find((x) => x.id === id)
    if (f) undos.push(updateWithUndo('foods', id, { uses: (f.uses ?? 0) + 1, lastUsedAt: now.toISOString() }))
  }

  let adapt: AdaptResult | undefined
  let adjustments: MealAdjustment[] = []
  let autoApplied = false
  if (isToday && !input.noAdapt) {
    const db = getDB()
    adapt = proposeAdjustments(db, date, minutesOfDay(now), meal.id)
    const counts = Object.fromEntries(dayMeals(db, date).meals.map((m) => [m.ref, m.original.items.length]))
    const stored = storeDrafts(adapt.drafts, !!db.profile.lumosAutoApplySmall, counts)
    adjustments = stored.created
    autoApplied = stored.autoApplied
    undos.push(stored.undo)
  }
  // Lumos writes always land in the life timeline (history + "o que mudou?"); the same undo takes it out.
  if (input.via === 'lumos') {
    undos.push(
      logLife({ kind: 'logged', title: `Comeu ${meal.description}${meal.time ? ` às ${meal.time}` : ''}`, date, area: 'alimentacao', ref: { type: 'meal', id: meal.id }, by: 'lumos', provenance: 'user', at: now.toISOString() }).undo,
    )
  }
  return { meal: getDB().meals.find((m) => m.id === meal.id) ?? meal, adapt, adjustments, autoApplied, undo: chain(...undos) }
}

const PURPOSE: Record<string, MealPurpose> = { pre: 'pre_treino', intra: 'intra_treino', pos: 'pos_treino' }

function asLogged(items: BadgedFood[]): LoggedFood[] {
  return items.map((it) => {
    const info = plannedFoodInfo(it)
    return { name: it.food, qty: 1, ...(it.qty ? { unitLabel: it.qty } : {}), ...(info.grams != null ? { grams: info.grams } : {}), ...(info.nutrients ? { nutrients: info.nutrients } : {}), confidence: info.nutrients ? 'plan' : 'unknown' }
  })
}

/**
 * "comi" on a planned meal: records the REAL time (planned 08:00, tapped 08:21 → consumedAt 08:21)
 * next to the planned one. When an adjustment was applied, the eaten foods are its items.
 */
export function markPlannedMealEaten(input: { date: DateKey; ref: string; now?: Date }): { meal?: Meal; undo: Undo } {
  const now = input.now ?? new Date()
  const db = getDB()
  const view = dayMeals(db, input.date).meals.find((m) => m.ref === input.ref)
  if (!view) return { undo: () => {} }
  if (view.consumed) return { meal: view.consumed, undo: () => {} }
  const isToday = input.date === todayKey(now)
  const ctx = dayTrainingContext(db, input.date)
  const w = ctx.key ?? ctx.workouts[0]
  const training = view.phase && view.phase !== 'refeicao'
  const undos: Undo[] = []
  const meal = actions.create('meals', {
    date: input.date,
    slot: slotForPlannedMeal(view.original),
    description: view.items.map((it) => it.food).join(' + '),
    done: true,
    planned: true,
    tags: [],
    planMealRef: view.ref,
    plannedTime: view.plannedTime,
    time: isToday ? toTimeHM(now) : view.plannedTime,
    consumedAt: isToday ? now.toISOString() : undefined,
    contentSource: view.badge,
    loggedVia: 'botao',
    purpose: PURPOSE[view.phase ?? ''] ?? 'geral',
    ...(training && w && !w.id.startsWith('template:') ? { workoutId: w.id } : {}),
    ...(view.adjustment ? { foods: asLogged(view.items) } : {}),
  })
  undos.push(() => void actions.remove('meals', meal.id))
  // A pending suggestion for a meal already eaten no longer makes sense.
  for (const p of getDB().mealAdjustments.filter((a) => a.date === input.date && a.planMealRef === view.ref && a.status === 'proposed')) {
    undos.push(updateWithUndo('mealAdjustments', p.id, { status: 'dismissed' }))
  }
  return { meal, undo: chain(...undos) }
}

/** Remove a logged meal (planned or extra), with undo. */
export function unlogMeal(id: ID): Undo {
  const removed = actions.remove('meals', id)
  return removed ? () => actions.restore('meals', removed) : () => {}
}

/** Apply a proposal ("aplicar"); any other applied version for that meal steps aside. */
export function applyAdjustment(id: ID): Undo {
  const adj = getDB().mealAdjustments.find((a) => a.id === id)
  if (!adj) return () => {}
  const undos: Undo[] = []
  for (const other of getDB().mealAdjustments.filter((a) => a.id !== id && a.date === adj.date && a.planMealRef === adj.planMealRef && a.status === 'applied')) {
    undos.push(updateWithUndo('mealAdjustments', other.id, { status: 'dismissed' }))
  }
  undos.push(updateWithUndo('mealAdjustments', id, { status: 'applied' }))
  return chain(...undos)
}

/** "manter plano" / "voltar ao plano original". */
export function dismissAdjustment(id: ID): Undo {
  return updateWithUndo('mealAdjustments', id, { status: 'dismissed' })
}

/** "outra opção": replace a pending proposal's content with another alternative. */
export function replaceProposal(id: ID, draft: AdjustmentDraft): Undo {
  return updateWithUndo('mealAdjustments', id, { kind: draft.kind, items: draft.items, reason: draft.reason })
}

/** Store a draft from the chat helpers (skipMeal, dinnerOption, swapDraft). Applied drafts replace older applied ones. */
export function saveAdjustment(draft: AdjustmentDraft): { adjustment: MealAdjustment; undo: Undo } {
  const undos: Undo[] = []
  for (const old of getDB().mealAdjustments.filter((a) => a.date === draft.date && a.planMealRef === draft.planMealRef && (a.status === 'proposed' || (draft.status === 'applied' && a.status === 'applied')))) {
    undos.push(updateWithUndo('mealAdjustments', old.id, { status: 'dismissed' }))
  }
  const adjustment = actions.create('mealAdjustments', draft)
  undos.push(() => void actions.remove('mealAdjustments', adjustment.id))
  return { adjustment, undo: chain(...undos) }
}

export type MyFoodInput = Pick<FoodItem, 'name' | 'serving' | 'nutrients' | 'confidence'> & Partial<Pick<FoodItem, 'aliases' | 'emoji' | 'sourceNote'>>

/** "salvar em Meus alimentos" — next time "comi um YoPRO" is a 1-second log. */
export function saveMyFood(data: MyFoodInput): { food: FoodItem; undo: Undo } {
  const aliases = [...new Set([data.name, ...(data.aliases ?? [])].map((a) => a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()).filter(Boolean))]
  const food = actions.create('foods', { ...data, aliases, mine: true, uses: 0 })
  return { food, undo: () => void actions.remove('foods', food.id) }
}

export function updateMyFood(id: ID, patch: Partial<MyFoodInput>): Undo {
  const next: Record<string, unknown> = { ...patch }
  if (patch.name || patch.aliases) {
    const cur = getDB().foods.find((f) => f.id === id)
    const name = patch.name ?? cur?.name ?? ''
    next.aliases = [...new Set([name, ...(patch.aliases ?? cur?.aliases ?? [])].map((a) => a.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()).filter(Boolean))]
  }
  return updateWithUndo('foods', id, next)
}

export function removeMyFood(id: ID): Undo {
  const removed = actions.remove('foods', id)
  return removed ? () => actions.restore('foods', removed) : () => {}
}
