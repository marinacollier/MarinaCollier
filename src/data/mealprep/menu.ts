/**
 * Week menu: the nutritionist's plan for each of the 7 days (dayPlanFor — never "all days equal"),
 * with Marina's chosen substitutions applied and each meal placed at home / out / training.
 */
import type { DateKey, DB, FuelPhase, MealPrepPlan, NutritionDayType, PlannedFood, TimeHM, WorkDayMode } from '@/data/types'
import { contextWorkouts, dayPlanFor, dayTrainingContext } from '@/data/fuel'
import { workBlocks, workMode } from '@/data/planning'
import { agendaFor } from '@/data/selectors'
import { addDays, hmToMinutes, minutesToHM, startOfWeek, weekday, WEEKDAY_SHORT, WEEKDAY_LONG } from '@/lib/date'
import { ingredientOf, type Ingredient } from './catalog'
import { parseQty, parseSubstitution } from './parse'

export type Badge = 'nutri' | 'troca'
/** casa = eats at home · fora = away (presencial day, commute) · treino = during training. */
export type MealPlace = 'casa' | 'fora' | 'treino'

export interface MenuItem {
  /** '<DateKey>#<meal index>#<item index>' — same key as MealPrepPlan.choices. */
  key: string
  food: string
  qty?: string
  amount?: number
  unit?: 'g' | 'ml'
  /** "À vontade". */
  free?: boolean
  badge: Badge
  /** The prescribed item when a substitution is in use. */
  original?: { food: string; qty?: string }
  /** Prescribed options for this slot (always from the plan). */
  substitutions: string[]
  ingredient: Ingredient
}

export interface MenuMeal {
  date: DateKey
  index: number
  time?: TimeHM
  name: string
  phase: FuelPhase | 'refeicao'
  notes?: string
  items: MenuItem[]
  /** '<NutritionDayPlan.id>#<meal index>' */
  planMealRef: string
  /** '<DateKey>#<meal index>' (MealPrepPlan.pots key). */
  potKey: string
  place: MealPlace
  /** Time changed for this day only (ScheduleOverride). */
  moved?: boolean
}

export interface DayOut {
  /** When she leaves home (HH:MM) and why. */
  leave: TimeHM
  back: TimeHM
  reason: string
}

export interface MenuDay {
  date: DateKey
  short: string
  long: string
  planId?: string
  planName?: string
  dayType: NutritionDayType
  mode: WorkDayMode
  presencial: boolean
  out?: DayOut
  trainings: { time?: TimeHM; title: string; key: boolean; long: boolean }[]
  meals: MenuMeal[]
}

export interface WeekMenu {
  weekStart: DateKey
  days: MenuDay[]
}

export function weekStartOf(date: DateKey): DateKey {
  return startOfWeek(date)
}

/** The stored meal prep record for a week (one per week). */
export function planFor(db: DB, weekStart: DateKey): MealPrepPlan | undefined {
  const ws = startOfWeek(weekStart)
  return db.mealPrepPlans.find((p) => p.weekStart === ws)
}

/** Choice text is honoured ONLY when it is one of the item's prescribed substitutions. */
export function effectiveItem(item: PlannedFood, key: string, choice: string | undefined): MenuItem {
  const subs = item.substitutions ?? []
  if (choice && subs.includes(choice)) {
    const s = parseSubstitution(choice)
    const q = parseQty(s.qty)
    return {
      key,
      food: s.food,
      qty: s.qty,
      amount: q.amount,
      unit: q.unit,
      free: q.free,
      badge: 'troca',
      original: { food: item.food, qty: item.qty },
      substitutions: subs,
      ingredient: ingredientOf(s.food),
    }
  }
  const q = parseQty(item.qty)
  return {
    key,
    food: item.food,
    qty: item.qty,
    amount: item.grams ?? q.amount,
    unit: item.grams != null ? 'g' : q.unit,
    free: q.free,
    badge: 'nutri',
    substitutions: subs,
    ingredient: ingredientOf(item.food),
  }
}

function mealOverride(db: DB, date: DateKey, ref: string) {
  const hits = db.scheduleOverrides.filter((o) => o.date === date && o.refType === 'planMeal' && o.refId === ref)
  return hits.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).pop()
}

/**
 * When she is out of the house on a presencial day. If a training starts before the commute she
 * leaves for it (30 min before) and goes straight on; she is back after the commute, or after a
 * training/event that starts right after it. Driven only by profile.work + the day's agenda.
 */
export function dayOut(db: DB, date: DateKey): DayOut | undefined {
  if (workMode(db, date) !== 'presencial') return undefined
  const blocks = workBlocks(db, date)
  if (!blocks.length) return undefined
  const first = hmToMinutes(blocks[0].start)
  const last = hmToMinutes(blocks[blocks.length - 1].end)
  const early = contextWorkouts(db, date)
    .filter((w) => w.time && hmToMinutes(w.time) < first)
    .map((w) => hmToMinutes(w.time!))
  let leave = first
  let reason = 'saída pro trabalho'
  if (early.length) {
    leave = Math.max(0, Math.min(...early) - 30)
    reason = 'sai pro treino e emenda no trabalho'
  }
  let back = last
  const later: { start: number; end: number }[] = []
  for (const e of agendaFor(db, date)) {
    if (!e.time || e.allDay || e.kind === 'block' || e.kind === 'workout') continue
    const s = hmToMinutes(e.time)
    later.push({ start: s, end: e.endTime ? hmToMinutes(e.endTime) : s + 60 })
  }
  for (const w of contextWorkouts(db, date)) {
    if (!w.time) continue
    const s = hmToMinutes(w.time)
    later.push({ start: s, end: s + (w.durationMin ?? w.plannedDurationMin ?? 60) })
  }
  for (const r of later.sort((a, b) => a.start - b.start)) if (r.start >= back && r.start <= back + 60) back = Math.max(back, r.end)
  return { leave: minutesToHM(leave), back: minutesToHM(back), reason }
}

function placeOf(phase: MenuMeal['phase'], time: TimeHM | undefined, out: DayOut | undefined): MealPlace {
  if (phase === 'intra') return 'treino'
  if (!out || !time) return 'casa'
  const t = hmToMinutes(time)
  return t >= hmToMinutes(out.leave) && t < hmToMinutes(out.back) ? 'fora' : 'casa'
}

export function menuDay(db: DB, date: DateKey, plan?: MealPrepPlan): MenuDay {
  const dayPlan = dayPlanFor(db, date)
  const ctx = dayTrainingContext(db, date)
  const out = dayOut(db, date)
  const choices = plan?.choices ?? {}
  const meals: MenuMeal[] = []
  dayPlan?.meals.forEach((m, mi) => {
    const ref = `${dayPlan.id}#${mi}`
    const ov = mealOverride(db, date, ref)
    if (ov?.cancelled) return
    const time = ov?.time ?? m.time
    const phase = m.phase ?? 'refeicao'
    meals.push({
      date,
      index: mi,
      time,
      name: m.name,
      phase,
      notes: m.notes,
      items: m.items.map((it, ii) => {
        const key = `${date}#${mi}#${ii}`
        return effectiveItem(it, key, choices[key])
      }),
      planMealRef: ref,
      potKey: `${date}#${mi}`,
      place: placeOf(phase, time, out),
      moved: !!ov?.time && ov.time !== m.time,
    })
  })
  meals.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.index - b.index)
  const mode = workMode(db, date)
  return {
    date,
    short: WEEKDAY_SHORT[weekday(date)],
    long: WEEKDAY_LONG[weekday(date)],
    planId: dayPlan?.id,
    planName: dayPlan?.name,
    dayType: ctx.dayType,
    mode,
    presencial: mode === 'presencial',
    out,
    trainings: ctx.workouts.map((w) => ({ time: w.time, title: w.title ?? w.modality, key: !!w.isKeySession, long: !!w.isLongSession })),
    meals,
  }
}

/** 7 days × meals (time, name, phase, items with grams, chosen substitution, badge). */
export function weekMenu(db: DB, weekStart: DateKey, plan: MealPrepPlan | undefined = planFor(db, weekStart)): WeekMenu {
  const ws = startOfWeek(weekStart)
  return { weekStart: ws, days: Array.from({ length: 7 }, (_, i) => menuDay(db, addDays(ws, i), plan)) }
}

/** "SEG 12H" / "DOM 06H40". */
export function slotLabel(date: DateKey, time?: TimeHM): string {
  const d = WEEKDAY_SHORT[weekday(date)]
  if (!time) return d
  const [h, m] = time.split(':')
  return `${d} ${h}H${m === '00' ? '' : m}`
}

/** "arroz 150g" — short pot/kit wording. */
export function shortItem(it: MenuItem): string {
  if (it.free) return `${it.ingredient.short} à vontade`
  if (it.amount == null) return it.qty ? `${it.ingredient.short} (${it.qty})` : it.ingredient.short
  return `${it.ingredient.short} ${String(Math.round(it.amount * 10) / 10).replace('.', ',')}${it.unit ?? 'g'}`
}

/** Bedtime − 1h (min 19:00), the moment for "na noite anterior". */
export function nightTime(db: DB): TimeHM {
  const sleep = db.profile.rhythm?.sleepTime
  if (!sleep) return '21:00'
  return minutesToHM(Math.max(19 * 60, hmToMinutes(sleep) - 60))
}
