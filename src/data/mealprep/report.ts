/**
 * Weekly meal prep in the section-15 order, as structured data the screen and Lumos render:
 * 1 estratégia · 2 cardápio por dia · 3 lista · 4 meal prep · 5 potes · 6 cafés e lanches portáteis
 * · 7 geladeira x freezer · 8 kit dos dias presenciais.
 */
import type { DateKey, DB, MealPrepPlan } from '@/data/types'
import { DAY_TYPE_LABEL } from '@/data/fuel'
import { formatDayMonth, weekday, WEEKDAY_LONG } from '@/lib/date'
import { batchFromMenu, potsFromMenu, type BatchPlan, type Pot } from './batch'
import { diversifyMenu, type DiversifyProposal } from './diversify'
import { grabFromMenu, groupGrab, type GrabGroup } from './grab'
import { presencialKits, type PresencialKit } from './kit'
import { planFor, weekMenu, type WeekMenu } from './menu'
import { shoppingFromMenu, type ShoppingList } from './shopping'
import { storageFromMenu, type StoragePlan } from './storage'

export interface WeekReport {
  weekStart: DateKey
  /** One line in Lumos' voice. */
  headline: string
  strategy: string[]
  menu: WeekMenu
  shopping: ShoppingList
  batch: BatchPlan
  pots: Pot[]
  grab: GrabGroup[]
  storage: StoragePlan
  kits: PresencialKit[]
  /** Variety Lumos would propose (not applied). */
  suggestions: DiversifyProposal[]
  /** Swaps already chosen this week. */
  swaps: number
}

const listPt = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

export function strategyLines(db: DB, menu: WeekMenu, batch: BatchPlan, swaps: number): string[] {
  const lines: string[] = []
  const pres = menu.days.filter((d) => d.presencial).map((d) => WEEKDAY_LONG[weekday(d.date)])
  if (pres.length) lines.push(`${cap(listPt(pres))} ${pres.length > 1 ? 'são presenciais' : 'é presencial'}: o que sai de casa vai pronto, no esquema pegou e saiu.`)
  const plans = new Set(menu.days.map((d) => d.planId).filter(Boolean))
  lines.push(`${plans.size} ${plans.size === 1 ? 'plano' : 'planos'} do seu nutri nessa semana — cada dia segue o plano do treino daquele dia.`)
  const keyDays = menu.days.filter((d) => d.trainings.some((t) => t.long || t.key))
  if (keyDays.length)
    lines.push(`Dias de treino-chave: ${keyDays.map((d) => `${d.short.toLowerCase()} (${DAY_TYPE_LABEL[d.dayType].toLowerCase()})`).join(', ')} — pré e intra ficam separados na véspera.`)
  const [a, b] = batch.totalMinutes
  lines.push(
    `Uma cozinhada no ${WEEKDAY_LONG[weekday(batch.prepDate)]} (${formatDayMonth(batch.prepDate)}), ~${hours(a)}–${hours(b)}: ${batch.fridgeCount} potes pra geladeira e ${batch.freezerCount} pro freezer.`,
  )
  if (batch.second) lines.push(`${cap(batch.second.label)}: rodada rápida (~${batch.second.minutes} min) só pro que não congela bem.`)
  lines.push(
    swaps
      ? `${swaps} ${swaps === 1 ? 'troca escolhida' : 'trocas escolhidas'}, todas da lista do seu nutri. Base comum mantida pra não comprar demais.`
      : 'Base comum pra semana toda; variedade só com as trocas que o seu nutri já deixou.',
  )
  if (db.profile.foodPrefs?.dislikes?.length) lines.push(`Respeitando o que você prefere evitar: ${db.profile.foodPrefs.dislikes.join(', ')}.`)
  return lines
}

function hours(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Section-15 report for a week. */
export function weekReport(db: DB, weekStart: DateKey, plan: MealPrepPlan | undefined = planFor(db, weekStart)): WeekReport {
  const menu = weekMenu(db, weekStart, plan)
  const shopping = shoppingFromMenu(menu, plan?.pantry ?? [])
  const batch = batchFromMenu(db, menu)
  const pots = potsFromMenu(menu, plan)
  const grab = groupGrab(grabFromMenu(menu))
  const st = storageFromMenu(db, menu, plan)
  const kits = presencialKits(db, menu.weekStart, plan)
  const swaps = Object.keys(plan?.choices ?? {}).length
  const pres = menu.days.filter((d) => d.presencial)
  const headline = pres.length
    ? `Semana com ${pres.length} ${pres.length === 1 ? 'dia presencial' : 'dias presenciais'}: deixei tudo no esquema pegou e saiu, sem você depender de cozinhar no meio da semana.`
    : 'Uma cozinhada e a semana fica resolvida — o resto é só montar.'
  return {
    weekStart: menu.weekStart,
    headline,
    strategy: strategyLines(db, menu, batch, swaps),
    menu,
    shopping,
    batch,
    pots,
    grab,
    storage: st,
    kits,
    suggestions: diversifyMenu(db, menu, { plan }),
    swaps,
  }
}
