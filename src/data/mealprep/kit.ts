/**
 * Presencial mode: "KIT TERÇA — PRESENCIAL". For each planned meal: where she'll be, what to take
 * and how it travels (❄️ 🔥 🎒 🧊), plus a timed prep checklist (night before + on the way out).
 * prepChecklistFor(date) gives the Life Timeline every meal-prep item that happens on that date.
 */
import type { DateKey, DB, MealPrepPlan, TimeHM } from '@/data/types'
import { contextWorkouts } from '@/data/fuel'
import { isPresencial } from '@/data/planning'
import { addDays, hmToMinutes, minutesToHM, startOfWeek, weekday, WEEKDAY_LONG } from '@/lib/date'
import type { KitIcon } from './catalog'
import { potsFromMenu, type Pot } from './batch'
import { grabItemsFor, type GrabItem } from './grab'
import { menuDay, nightTime, planFor, shortItem, weekMenu, type DayOut, type MealPlace, type MenuDay } from './menu'
import { storageFromMenu } from './storage'

export interface KitTake {
  text: string
  icons: KitIcon[]
}

export interface KitMeal {
  time?: TimeHM
  name: string
  place: MealPlace
  /** What to take (empty when she eats at home). */
  take: KitTake[]
  /** Short line for home meals ("em casa, antes de sair"). */
  note?: string
}

export interface PrepItem {
  /** Stable key: 'mealprep:<date>:<slug>' (date = when it happens). */
  key: string
  date: DateKey
  time: TimeHM
  title: string
  detail?: string
}

export interface PresencialKit {
  date: DateKey
  /** "KIT TERÇA — PRESENCIAL" */
  title: string
  out: DayOut
  meals: KitMeal[]
  /** Night before + on the way out, with times. */
  checklist: PrepItem[]
  /** Short intro in Lumos' voice. */
  intro: string
  /** Icons that appear in this kit (for the legend). */
  icons: KitIcon[]
}

const POT_ICONS: KitIcon[] = ['geladeira', 'microondas', 'termica']
const uniq = <T,>(xs: T[]) => [...new Set(xs)]

function potText(p: Pot): string {
  return `🍱 marmita: ${p.parts.map((x) => `${x.short} ${x.amount != null ? `${String(x.amount).replace('.', ',')}${x.unit ?? 'g'}` : ''}`.trim()).join(' · ')}`
}

function grabText(g: GrabItem): string {
  // "Banana: banana 65g" → "banana 65g"
  return g.detail.toLowerCase().startsWith(g.title.toLowerCase()) ? g.detail : `${g.title}: ${g.detail}`
}

function buildKit(db: DB, day: MenuDay, pots: Pot[], hasPrep: boolean): PresencialKit | undefined {
  if (!day.out) return undefined
  const out = day.out
  const meals: KitMeal[] = []
  const nightItems: string[] = []
  const bagCold: string[] = []
  const bagDry: string[] = []
  let gel = false

  for (const m of day.meals) {
    const pot = pots.find((p) => p.key === m.potKey)
    if (m.place !== 'fora') {
      const after = m.time && hmToMinutes(m.time) >= hmToMinutes(out.back)
      meals.push({
        time: m.time,
        name: m.name,
        place: m.place,
        take: [],
        note: after ? (pot ? 'ao chegar: marmita pronta na geladeira, só aquecer 🍱' : 'ao chegar, em casa') : 'em casa, antes de sair',
      })
      continue
    }
    const take: KitTake[] = []
    if (pot) {
      take.push({ text: potText(pot), icons: POT_ICONS })
      bagCold.push(`marmita ${m.time ?? ''}`.trim())
      for (const it of m.items.filter((i) => !i.ingredient.potted || i.free)) {
        if (it.ingredient.key === 'folhas') {
          take.push({ text: `pote de folhas (${shortItem(it)}), molho à parte`, icons: ['geladeira', 'termica'] })
          bagCold.push('pote de folhas')
        } else {
          take.push({ text: `${it.ingredient.carry.form}: ${shortItem(it)}`, icons: it.ingredient.carry.icons })
          if (it.ingredient.carry.icons.includes('termica')) bagCold.push(it.ingredient.short)
          else bagDry.push(it.ingredient.short)
        }
      }
    } else {
      for (const g of grabItemsFor(m)) {
        take.push({ text: grabText(g), icons: g.icons })
        const label = g.title.charAt(0).toLowerCase() + g.title.slice(1)
        if (g.when === 'vespera') nightItems.push(label)
        if (g.icons.includes('termica')) bagCold.push(label)
        else bagDry.push(label)
        if (g.itemKeys.some((k) => m.items.find((i) => i.key === k)?.ingredient.key === 'gel')) gel = true
      }
    }
    meals.push({ time: m.time, name: m.name, place: 'fora', take })
  }

  const night = addDays(day.date, -1)
  const nt = nightTime(db)
  const checklist: PrepItem[] = []
  if (hasPrep) {
    const freezerPots = pots.filter((p) => p.date === day.date && p.state === 'freezer')
    if (freezerPots.length)
      checklist.push({ key: `mealprep:${night}:descongelar`, date: night, time: nt, title: `Transferir do freezer pra geladeira: ${freezerPots.map((p) => p.label).join(', ')}` })
  }
  if (nightItems.length)
    checklist.push({ key: `mealprep:${night}:montar-kit`, date: night, time: nt, title: `Deixar pronto: ${uniq(nightItems).join(', ')}` })
  if (bagCold.length) {
    checklist.push({
      key: `mealprep:${night}:bolsa-termica`,
      date: night,
      time: nt,
      title: 'Separar a bolsa térmica e pôr o gelo reutilizável no freezer',
    })
    checklist.push({ key: `mealprep:${day.date}:levar-termica`, date: day.date, time: out.leave, title: `Pôr na bolsa térmica: ${uniq(bagCold).join(', ')}` })
  }
  const shaker = bagDry.find((b) => b.includes('shaker'))
  if (shaker) checklist.push({ key: `mealprep:${day.date}:shaker`, date: day.date, time: out.leave, title: 'Levar o shaker (kit seco)' })
  const dry = uniq(bagDry.filter((b) => !b.includes('shaker') && !b.startsWith('gel')))
  if (dry.length) checklist.push({ key: `mealprep:${day.date}:bolsa`, date: day.date, time: out.leave, title: `Na bolsa: ${dry.join(', ')}` })
  if (gel) checklist.push({ key: `mealprep:${day.date}:gel`, date: day.date, time: out.leave, title: 'Pegar o gel' })

  const icons = uniq(meals.flatMap((m) => m.take.flatMap((t) => t.icons)))
  const long = WEEKDAY_LONG[weekday(day.date)]
  const dayName = long.toUpperCase()
  const Long = long.charAt(0).toUpperCase() + long.slice(1)
  const lunchOut = meals.some((m) => m.place === 'fora' && m.take.some((t) => t.text.startsWith('🍱')))
  return {
    date: day.date,
    title: `KIT ${dayName} — PRESENCIAL`,
    out,
    meals,
    checklist: checklist.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    intro: lunchOut
      ? `${Long} é presencial, então você não vai depender de cozinhar nada durante o dia. Tudo no esquema pegou e saiu.`
      : `${Long} é presencial: deixei o que precisa sair de casa pronto pra levar.`,
    icons,
  }
}

/** KIT <DIA> — PRESENCIAL for a date (undefined when it isn't a presencial day). */
export function presencialKit(db: DB, date: DateKey, plan: MealPrepPlan | undefined = planFor(db, date)): PresencialKit | undefined {
  if (!isPresencial(db, date)) return undefined
  const menu = weekMenu(db, startOfWeek(date), plan)
  const day = menu.days.find((d) => d.date === date)!
  const all = potsFromMenu(menu, plan)
  return buildKit(db, day, all, !!plan)
}

/**
 * Every meal-prep checklist item that HAPPENS on `date`, with time:
 * kit items (night before a presencial day / on the way out), freezer→fridge transfers when a meal
 * prep exists for that week, and intra-workout reminders (separar na véspera · pegar antes do treino).
 */
export function prepChecklistFor(db: DB, date: DateKey): PrepItem[] {
  const out = new Map<string, PrepItem>()
  const add = (i: PrepItem) => i.date === date && !out.has(i.key) && out.set(i.key, i)

  for (const d of [date, addDays(date, 1)]) {
    presencialKit(db, d)?.checklist.forEach(add)
  }

  const tomorrow = addDays(date, 1)
  const plan = planFor(db, tomorrow)
  if (plan) {
    const st = storageFromMenu(db, weekMenu(db, startOfWeek(tomorrow), plan), plan)
    st.transfers.forEach((t) => add({ key: t.key, date: t.date, time: t.time, title: t.title }))
  }

  // Intra-workout: separate the night before, grab before leaving to train.
  const intra = (d: DateKey) => menuDay(db, d, planFor(db, d)).meals.filter((m) => m.phase === 'intra')
  const tm = intra(tomorrow)
  if (tm.length)
    add({ key: `mealprep:${date}:separar-intra`, date, time: nightTime(db), title: `Separar o intra de amanhã: ${tm.flatMap((m) => m.items.map(shortItem)).join(' · ')}` })
  const today = intra(date)
  if (today.length) {
    const first = contextWorkouts(db, date).find((w) => w.time)?.time
    const time = first ? minutesToHM(Math.max(0, hmToMinutes(first) - 10)) : (today[0].time ?? '06:00')
    add({ key: `mealprep:${date}:pegar-intra`, date, time, title: `Pegar o intra: ${today.flatMap((m) => m.items.map(shortItem)).join(' · ')}` })
  }

  return [...out.values()].sort((a, b) => a.time.localeCompare(b.time))
}

/** All presencial kits of a week. */
export function presencialKits(db: DB, weekStart: DateKey, plan: MealPrepPlan | undefined = planFor(db, weekStart)): PresencialKit[] {
  const menu = weekMenu(db, weekStart, plan)
  const all = potsFromMenu(menu, plan)
  return menu.days.filter((d) => d.presencial).map((d) => buildKit(db, d, all, !!plan)).filter((k): k is PresencialKit => !!k)
}
