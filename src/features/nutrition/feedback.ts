/** UI feedback around the engine writes: haptic + toast with "Desfazer", never a macro report. */
import { toast } from '@/app/ui-store'
import { getDB } from '@/data/store'
import { haptic } from '@/lib/haptics'
import { minutesOfDay } from '@/lib/date'
import {
  applyAdjustment,
  dismissAdjustment,
  logFood,
  markPlannedMealEaten,
  otherOptions,
  replaceProposal,
  sameItems,
  unlogMeal,
  type LogFoodInput,
  type LogResult,
} from '@/data/nutrition'
import type { DateKey, ID } from '@/data/types'
import { hasNutritionHost, openNutritionSheet } from './sheet-host'

/** Where "ver ajuste" goes: the Home card when it's on screen, else the meal detail. */
export function showAdjustment(date: DateKey, ref: string): void {
  const el = typeof document !== 'undefined' ? document.getElementById('nutri-ajuste') : null
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  if (hasNutritionHost()) openNutritionSheet('mealDetail', { date, ref })
}

/** "Registrado ✓" — then, only if relevant, "ver ajuste". */
export function announceLog(res: LogResult): void {
  haptic('success')
  toast('Registrado ✓', { action: { label: 'Desfazer', run: res.undo } })
  const adj = res.adjustments[0]
  if (!adj) return
  setTimeout(() => {
    toast(res.autoApplied ? 'Atualizei o restante do seu dia' : 'Tenho um ajuste pro resto do dia', {
      action: { label: 'ver ajuste', run: () => showAdjustment(adj.date, adj.planMealRef) },
    })
  }, 900)
}

export function logAndAnnounce(input: LogFoodInput): LogResult {
  const res = logFood(input)
  announceLog(res)
  return res
}

/** "comi" on a planned meal: real time recorded; tapping again un-marks (undoable). */
export function toggleEaten(date: DateKey, ref: string, name: string): void {
  const db = getDB()
  const existing = db.meals.find((m) => m.date === date && m.planMealRef === ref && m.done)
  if (existing) {
    const undo = unlogMeal(existing.id)
    toast('Desmarcado', { action: { label: 'Desfazer', run: undo } })
    return
  }
  const { meal, undo } = markPlannedMealEaten({ date, ref })
  if (!meal) return
  haptic('success')
  toast(`${name} ✓ ${meal.time ?? ''}`.trim(), { action: { label: 'Desfazer', run: undo } })
}

export function applyWithToast(id: ID): void {
  const undo = applyAdjustment(id)
  haptic('success')
  toast('Ajuste aplicado ✓', { action: { label: 'Desfazer', run: undo } })
}

export function keepPlanWithToast(id: ID, message = 'Mantive o plano'): void {
  const undo = dismissAdjustment(id)
  toast(message, { action: { label: 'Desfazer', run: undo } })
}

/** "outra opção": next alternative for that meal; when there's only one, say so kindly. */
export function nextOption(id: ID): void {
  const db = getDB()
  const adj = db.mealAdjustments.find((a) => a.id === id)
  if (!adj) return
  const opts = otherOptions(db, adj, minutesOfDay())
  const i = opts.findIndex((o) => sameItems(o, adj))
  const next = opts.length > 1 ? opts[(i + 1) % opts.length] : undefined
  if (!next) {
    toast('Essa é a única opção dentro do plano — dá pra manter como está 🙂')
    return
  }
  const undo = replaceProposal(id, next)
  haptic('light')
  toast('Outra opção ✓', { action: { label: 'Desfazer', run: undo } })
}
