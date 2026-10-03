/**
 * Geladeira x freezer. Never 7 days of food in the fridge: the next ~3 days stay there, the rest
 * goes to the freezer with a "na noite anterior, transfira" reminder. Leaves, cut fruit and
 * egg-based items get their own instructions.
 */
import type { DateKey, DB, MealPrepPlan, TimeHM } from '@/data/types'
import { addDays, weekday, WEEKDAY_LONG } from '@/lib/date'
import { FRIDGE_DAYS, potsFromMenu, prepDateOf, type Pot } from './batch'
import { nightTime, planFor, weekMenu, type WeekMenu } from './menu'

export interface Transfer {
  /** 'mealprep:<date>:descongelar' — the evening it happens. */
  key: string
  /** Evening of the transfer (day before the pots are eaten). */
  date: DateKey
  time: TimeHM
  forDate: DateKey
  title: string
  potKeys: string[]
}

export interface StorageTip {
  title: string
  text: string
}

export interface StoragePlan {
  prepDate: DateKey
  fridgeDays: number
  fridge: Pot[]
  freezer: Pot[]
  eaten: Pot[]
  transfers: Transfer[]
  tips: StorageTip[]
}

const GENERAL: StorageTip[] = [
  { title: 'Comida pronta', text: `Até ${FRIDGE_DAYS} dias na geladeira. O resto vai pro freezer no mesmo dia em que cozinhou.` },
  { title: 'Descongelar', text: 'Sempre na geladeira, na noite anterior — nunca na pia.' },
  { title: 'Etiqueta', text: 'Dia e hora no pote (ex.: QUI 12H): você abre o freezer e já sabe qual pegar.' },
]

export function storageFromMenu(db: DB, menu: WeekMenu, plan?: MealPrepPlan): StoragePlan {
  const all = potsFromMenu(menu, plan)
  const fridge = all.filter((p) => p.state === 'geladeira')
  const freezer = all.filter((p) => p.state === 'freezer')
  const eaten = all.filter((p) => p.state === 'consumido')
  const time = nightTime(db)

  const byDate = new Map<DateKey, Pot[]>()
  for (const p of freezer) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p])
  const transfers: Transfer[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([forDate, list]) => {
      const date = addDays(forDate, -1)
      return {
        key: `mealprep:${date}:descongelar`,
        date,
        time,
        forDate,
        title: `Transferir do freezer pra geladeira: ${list.map((p) => p.label).join(', ')}`,
        potKeys: list.map((p) => p.key),
      }
    })

  // Specific instructions only for what is actually in this week.
  const seen = new Map<string, StorageTip>()
  for (const day of menu.days)
    for (const m of day.meals)
      for (const it of m.items) {
        const tip = it.ingredient.storage.tip
        if (tip && !seen.has(it.ingredient.key)) seen.set(it.ingredient.key, { title: cap(it.ingredient.short), text: tip })
      }
  const noFreeze = [...new Set(all.flatMap((p) => p.noFreeze))]
  const tips = [...GENERAL]
  if (noFreeze.length)
    tips.push({ title: 'Não vai pro freezer', text: `${noFreeze.map(cap).join(', ')}: congela mal. Nos dias de freezer, esse item sai da segunda rodada rápida.` })
  tips.push(...seen.values())

  return { prepDate: prepDateOf(menu.weekStart), fridgeDays: FRIDGE_DAYS, fridge, freezer, eaten, transfers, tips }
}

/** Fridge (next ~3 days) vs freezer (rest), transfer reminders and specific tips. */
export function storage(db: DB, weekStart: DateKey, plan: MealPrepPlan | undefined = planFor(db, weekStart)): StoragePlan {
  return storageFromMenu(db, weekMenu(db, weekStart, plan), plan)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const weekdayLong = (d: DateKey) => WEEKDAY_LONG[weekday(d)]
