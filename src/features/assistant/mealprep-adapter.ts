/**
 * Thin adapter between Lumos's chat and the MEAL PREP engine (src/data/mealprep). The chat only talks
 * to these functions and shapes, so the cards stay compact and the engine can evolve freely.
 *
 *   "faz minhas marmitas" / "organiza minha alimentação da semana" / "lista de supermercado"
 *       → weekMealPrep: weekReport in the section-15 order, compact (full screen: ROUTES.mealPrep)
 *   "amanhã vou presencial o dia inteiro" → presencialKitFor: KIT <DIA> — PRESENCIAL
 *   "o que faço com essa porção?" / "receita do almoço" → recipeFor (1 or 4 porções)
 *
 * The engine never prescribes: quantities are the plan's, swaps only the plan's substitutions.
 */
import { ROUTES } from '@/app/routes'
import { KIT_ICON, presencialKit, recipeFor, weekReport, type PrepItem, type Recipe } from '@/data/mealprep'
import type { DateKey, DB, TimeHM } from '@/data/types'
import { addDays, startOfWeek, weekday, WEEKDAY_LONG } from '@/lib/date'

export const MEAL_PREP_PATH = ROUTES.mealPrep

export type { Recipe }

/** One compact section of the week answer, in the section-15 order. */
export interface MealPrepSection {
  title: string
  lines: string[]
}

export interface MealPrepWeek {
  weekStart: DateKey
  headline: string
  sections: MealPrepSection[]
}

export interface KitLine {
  time?: TimeHM
  title: string
  /** ❄️ geladeira · 🔥 micro-ondas · 🎒 bolsa · 🧊 bolsa térmica */
  tags: string[]
}

export interface PresencialKit {
  date: DateKey
  title: string
  intro: string
  lines: KitLine[]
  /** Night before + on the way out — already in the Linha do dia (kind 'prep'). */
  checklist: PrepItem[]
  legend: string[]
}

export function mealPrepReady(): boolean {
  return true
}

/** Fri–Sun talk about NEXT week's prep (the cooking is on the weekend); otherwise this week. */
export function prepWeekFor(today: DateKey): DateKey {
  const wd = weekday(today)
  return startOfWeek(wd === 0 || wd >= 5 ? addDays(today, 3) : today)
}

const more = (n: number) => (n > 0 ? ` (+${n})` : '')

/** "faz minhas marmitas": the week in the section-15 order, a few lines each. */
export function weekMealPrep(db: DB, today: DateKey): MealPrepWeek | undefined {
  const r = weekReport(db, prepWeekFor(today))
  if (!r.menu.days.some((d) => d.meals.length)) return undefined
  const s: MealPrepSection[] = []
  s.push({ title: 'Estratégia da semana', lines: r.strategy.slice(0, 4) })
  s.push({
    title: 'Cardápio por dia',
    lines: r.menu.days.map((d) => {
      const tr = d.trainings.map((t) => `${t.title}${t.time ? ` ${t.time}` : ''}`).join(' + ')
      return `${d.short} · ${d.meals.length} refeições${d.planName ? ` (${d.planName})` : ''}${tr ? ` · ${tr}` : ''}${d.presencial ? ' · presencial' : ''}`
    }),
  })
  s.push({
    title: 'Lista de supermercado',
    lines: r.shopping.groups.map((g) => `${g.emoji} ${g.label}: ${g.lines.slice(0, 3).map((l) => `${l.label} ${l.buy}`).join(' · ')}${more(g.lines.length - 3)}`),
  })
  s.push({
    title: `Meal prep · ${WEEKDAY_LONG[weekday(r.batch.prepDate)]}`,
    lines: [...r.batch.bases.slice(0, 5).map((b) => `${b.label}: ${b.text}`), ...(r.batch.bases.length > 5 ? [`e mais ${r.batch.bases.length - 5} bases`] : [])],
  })
  s.push({ title: 'Montagem dos potes', lines: [...r.pots.slice(0, 4).map((p) => p.line), ...(r.pots.length > 4 ? [`e mais ${r.pots.length - 4} potes`] : [])] })
  if (r.grab.length) s.push({ title: 'Cafés e lanches portáteis', lines: r.grab.slice(0, 3).map((g) => `${g.title} (${g.days.map((d) => d.label).join(' · ')}): ${g.items.map((i) => i.title.toLowerCase()).join(' + ')}`) })
  s.push({
    title: 'Geladeira x freezer',
    lines: [`❄️ Geladeira: ${r.storage.fridge.length} potes · 🧊 Freezer: ${r.storage.freezer.length} potes`, ...r.storage.transfers.slice(0, 1).map((t) => `${t.title} (na noite anterior)`)],
  })
  if (r.kits.length) s.push({ title: 'Kit dos dias presenciais', lines: r.kits.map((k) => `${k.title}: ${k.meals.filter((m) => m.place === 'fora').map((m) => `${m.time ?? ''} ${m.name.toLowerCase()}`.trim()).join(' · ')}`) })
  return { weekStart: r.weekStart, headline: r.headline, sections: s.filter((x) => x.lines.length) }
}

/** "Amanhã vou presencial o dia inteiro." (undefined when that day isn't presencial in her work profile). */
export function presencialKitFor(db: DB, date: DateKey): PresencialKit | undefined {
  const k = presencialKit(db, date)
  if (!k) return undefined
  return {
    date,
    title: k.title,
    intro: k.intro,
    lines: k.meals.map((m) => ({
      time: m.time,
      title: m.take.length ? `${m.name}: ${m.take.map((t) => t.text).join(' · ')}` : `${m.name} — ${m.note ?? 'em casa'}`,
      tags: [...new Set(m.take.flatMap((t) => t.icons))].map((i) => KIT_ICON[i].emoji),
    })),
    checklist: k.checklist,
    legend: k.icons.map((i) => `${KIT_ICON[i].emoji} ${KIT_ICON[i].label}`),
  }
}

/** "o que faço com essa porção?" — keeps the plan's quantities. `mealRef` = '<plan>#<index>'. */
export function recipeForMeal(db: DB, date: DateKey, mealRef: string, portions: 1 | 4): Recipe | undefined {
  const index = Number(mealRef.slice(mealRef.lastIndexOf('#') + 1))
  return Number.isInteger(index) ? recipeFor(db, date, index, portions) : undefined
}
