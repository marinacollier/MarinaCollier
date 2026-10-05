/**
 * Kitchen by conversation — Lumos operationalizes the nutritionist's plan, never prescribes.
 *   "fiz seis porções de frango grelhado"  → PantryItem 'preparado' (6 porções), tied to the plan's meals
 *   "já tenho arroz, whey e café"          → pantry + the week's meal prep record; the list shrinks
 *   "faz minha feira" / "lista de compras" → the week's list from the plan's 7 days, minus what's at home
 *                                            and what's already prepared, skipping trip days, with the
 *                                            presencial days called out
 *   "acabou o whey"                         → out of the pantry
 */
import { ROUTES } from '@/app/routes'
import { emptyPlanData, ingredientOf, planFor, weekMenu, type Ingredient } from '@/data/mealprep'
import { buyKeyOf } from '@/data/mealprep/catalog'
import { purchaseFor, shoppingFromMenu, type ShoppingLine } from '@/data/mealprep/shopping'
import { getDB } from '@/data/store'
import type { DateKey, DB, PantryItem } from '@/data/types'
import { addDays, formatDayMonth, WEEKDAY_LONG, weekday } from '@/lib/date'
import { normalize } from '@/lib/text'
import { listJoin, plural } from '../../agents/common'
import { prepWeekFor } from '../../mealprep-adapter'
import { all, createUndoable, eventDraft, removeUndoable, runLogged, updateUndoable } from '../log'
import { policyFor } from '../policy'
import { cap, norm, NUMBER_RE, numberOf, splitList } from '../text'
import type { Handler, HandlerInput, LumosReply, ReplyLine, ReplySection, Undo } from '../types'

const AREA = 'cozinha'
const FRIDGE_DAYS = 3

// ─── Shopping ───────────────────────────────────────────────────────────────

export interface WeekShopping {
  weekStart: DateKey
  groups: { label: string; emoji: string; lines: (ShoppingLine & { note?: string })[] }[]
  atHome: string[]
  prepared: string[]
  skipped?: { from: DateKey; to: DateKey; trip: string }
  presencial: DateKey[]
  count: number
  recurring: string[]
}

/** Names Lumos treats as "em casa": pantry ingredients (db.pantry + the week's meal prep record). */
function pantryNames(db: DB, weekStart: DateKey): string[] {
  const plan = planFor(db, weekStart)
  const names = new Set<string>((plan?.pantry ?? []).map((p) => normalize(p)))
  for (const p of db.pantry) if (p.kind === 'ingrediente' && !p.recurring) names.add(normalize(p.name))
  return [...names]
}

/** The week's list: plan days (minus trip days) → shopping lines − pantry − prepared portions. */
export function weekShopping(db: DB, today: DateKey): WeekShopping {
  const weekStart = prepWeekFor(today)
  const menu = weekMenu(db, weekStart)
  const days = new Set(menu.days.map((d) => d.date))
  const trip = db.trips.find((t) => t.startDate && t.endDate && t.startDate <= addDays(weekStart, 6) && t.endDate >= weekStart && t.status !== 'concluida')
  let skipped: WeekShopping['skipped']
  if (trip) {
    const from = trip.startDate! > weekStart ? trip.startDate! : weekStart
    const to = trip.endDate! < addDays(weekStart, 6) ? trip.endDate! : addDays(weekStart, 6)
    for (let d = from; d <= to; d = addDays(d, 1)) days.delete(d)
    skipped = { from, to, trip: trip.name }
  }
  const kept = { ...menu, days: menu.days.filter((d) => days.has(d.date)) }
  const base = shoppingFromMenu(kept, pantryNames(db, weekStart))

  // Prepared food ("6 porções de frango") covers servings of the same purchase.
  const ingByKey = new Map<string, Ingredient>()
  for (const d of kept.days) for (const m of d.meals) for (const it of m.items) ingByKey.set(buyKeyOf(it.ingredient), it.ingredient)
  const preparedLeft = new Map<string, { name: string; left: number }>()
  for (const p of db.pantry) {
    if (p.kind !== 'preparado' || !(p.remaining ?? p.portions)) continue
    const k = buyKeyOf(ingredientOf(p.name))
    const prev = preparedLeft.get(k)
    preparedLeft.set(k, { name: p.name, left: (prev?.left ?? 0) + (p.remaining ?? p.portions ?? 0) })
  }
  const prepared: string[] = []
  const groups: WeekShopping['groups'] = []
  for (const g of base.groups) {
    const lines: WeekShopping['groups'][number]['lines'] = []
    for (const l of g.lines) {
      const prep = preparedLeft.get(l.buyKey)
      if (!prep) {
        lines.push(l)
        continue
      }
      const missing = Math.max(0, l.servings - prep.left)
      prepared.push(`${prep.name} (${plural(prep.left, 'porção pronta', 'porções prontas')})`)
      if (!missing) continue
      const ing = ingByKey.get(l.buyKey)
      const p = ing ? purchaseFor(ing, (l.total * missing) / l.servings, l.unit) : undefined
      lines.push({ ...l, buy: p?.buy ?? l.buy, detail: p?.detail ?? l.detail, note: `já tem ${plural(prep.left, 'porção pronta', 'porções prontas')} — compra só pro resto` })
    }
    if (lines.length) groups.push({ label: g.label, emoji: g.emoji, lines })
  }
  const recurring = db.pantry.filter((p) => p.recurring).map((p) => p.name)
  return {
    weekStart,
    groups,
    atHome: base.atHome.map((l) => l.label),
    prepared,
    skipped,
    presencial: kept.days.filter((d) => d.presencial).map((d) => d.date),
    count: groups.reduce((s, g) => s + g.lines.length, 0) + recurring.length,
    recurring,
  }
}

const SHOP = /\b(feira|lista de (?:compras|mercado|supermercado)|o que (?:eu )?(?:preciso )?comprar)\b/

function dayNames(dates: DateKey[]): string {
  return listJoin(dates.map((d) => WEEKDAY_LONG[weekday(d)]))
}

function shopping(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!SHOP.test(n) || /\b(livro|leitura)\b/.test(n)) return undefined
  const s = weekShopping(db, now.date)
  if (!s.groups.length && !s.recurring.length) {
    const why = s.skipped ? ` — você viaja (${s.skipped.trip})` : !db.nutritionDayPlans.some((p) => p.active) ? ' — ainda não tem plano do nutri cadastrado, e sem plano eu não invento lista' : ''
    return { area: AREA, text: `Nada pra comprar na semana de ${formatDayMonth(s.weekStart)}${why} 🙂`, link: { label: 'Abrir Meal prep', to: ROUTES.mealPrep } }
  }
  const sections: ReplySection[] = s.groups.map((g) => ({
    title: `${g.emoji} ${g.label}`,
    lines: g.lines.map((l) => ({ text: `${l.label} — ${l.buy}`, sub: l.note ?? l.detail })),
  }))
  if (s.recurring.length) sections.push({ title: '🔁 Toda semana', lines: s.recurring.map((r) => ({ text: r })) })
  const context: ReplyLine[] = []
  if (s.presencial.length) context.push({ text: `${cap(dayNames(s.presencial))} ${s.presencial.length === 1 ? 'é presencial' : 'são presenciais'}: as marmitas desses dias já entram na conta.`, emoji: '👜' })
  if (s.skipped) context.push({ text: `${s.skipped.trip}: deixei de fora de ${formatDayMonth(s.skipped.from)} a ${formatDayMonth(s.skipped.to)}.`, emoji: '✈️' })
  if (s.prepared.length) context.push({ text: `Já pronto: ${listJoin(s.prepared)}.`, emoji: '🍱' })
  if (s.atHome.length) context.push({ text: `Em casa: ${listJoin(s.atHome.map((x) => x.toLowerCase()))}.`, emoji: '🏠' })
  return {
    area: 'feira da semana',
    text: `Sua feira da semana de ${formatDayMonth(s.weekStart)}: ${plural(s.count, 'item', 'itens')}, do plano do seu nutri pros 7 dias.`,
    lines: context,
    sections,
    options: [{ label: 'Já tenho alguma coisa', prefill: 'já tenho ' }],
    link: { label: 'Abrir Meal prep', to: ROUTES.mealPrep },
  }
}

// ─── "já tenho arroz, whey e café" ──────────────────────────────────────────

const HAVE = /^(?:eu\s+)?(?:ja\s+)?(?:tenho|tem)\s+(?:aqui\s+)?(?:em casa\s+)?(.+?)(?:\s+(?:em casa|aqui))?$/

function have(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  if (!/^(eu\s+)?ja\s+(tenho|tem)\b|\b(tenho|tem) em casa\b/.test(n)) return undefined
  const m = HAVE.exec(n)
  if (!m) return undefined
  const offset = n.indexOf(m[1])
  const raw = text.normalize('NFC').slice(offset, offset + m[1].length)
  const names = splitList(raw.replace(/\s+(em casa|aqui)$/i, '')).map((x) => x.toLowerCase())
  if (!names.length || names.some((x) => x.split(' ').length > 4)) return undefined
  const ws = prepWeekFor(now.date)
  const before = weekShopping(db, now.date)
  const existing = new Set(db.pantry.filter((p) => p.kind === 'ingrediente').map((p) => normalize(p.name)))
  const plan = planFor(db, ws)
  const newNames = names.filter((x) => !existing.has(normalize(x)))
  const sim: DB = {
    ...db,
    pantry: [...db.pantry, ...newNames.map((name, i) => ({ id: `sim-${i}`, createdAt: '', updatedAt: '', name, kind: 'ingrediente' as const, storage: 'despensa' as const }))],
  }
  const after = weekShopping(sim, now.date)
  const removed = before.count - after.count
  return {
    area: AREA,
    text: removed > 0 ? `Tirei ${listJoin(names)} da lista ✓ ${after.count ? `Faltam ${plural(after.count, 'item', 'itens')}.` : 'A feira tá completa.'}` : `Anotei que tem ${listJoin(names)} em casa ✓`,
    sub: removed > 0 ? undefined : 'Nenhum deles estava na lista dessa semana — fica guardado pra próxima.',
    action: {
      mode: policyFor('pantry'),
      run: () =>
        runLogged(() => {
          const undos: Undo[] = newNames.map((name) => createUndoable('pantry', { name, kind: 'ingrediente', storage: 'despensa' }).undo)
          const cur = planFor(getDB(), ws)
          if (cur) {
            const merged = [...new Set([...cur.pantry, ...names.map((x) => normalize(x))])]
            undos.push(updateUndoable('mealPrepPlans', cur.id, { pantry: merged }))
          } else if (!plan) {
            undos.push(createUndoable('mealPrepPlans', { ...emptyPlanData(ws, 'lumos'), pantry: names.map((x) => normalize(x)) }).undo)
          }
          return all(undos)
        }, [eventDraft(now, { kind: 'logged', title: `Em casa: ${listJoin(names)}`, area: 'alimentacao', ref: { type: 'pantry', id: names.join(',') } })]),
    },
    options: [{ label: 'Ver a feira', ask: 'faz minha feira' }],
  }
}

const OUT = /^(?:acabou|acabaram|terminou|nao tenho mais)\s+(?:o |a |os |as )?(.+)$/

function ranOut(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = OUT.exec(n)
  if (!m) return undefined
  const names = splitList(m[1])
  const hits = db.pantry.filter((p) => names.some((x) => norm(p.name) === norm(x) || norm(p.name).startsWith(norm(x))))
  if (!hits.length) return undefined
  return {
    area: AREA,
    text: `Tirei ${listJoin(hits.map((h) => h.name))} do que tem em casa ✓ Volta pra feira quando o plano pedir.`,
    action: {
      mode: policyFor('pantry'),
      run: () => runLogged(() => all(hits.map((h) => removeUndoable('pantry', h.id))), [eventDraft(now, { kind: 'changed', title: `Acabou ${listJoin(hits.map((h) => h.name))}`, area: 'alimentacao', ref: { type: 'pantry', id: hits[0].id } })]),
    },
  }
}

// ─── "fiz seis porções de frango grelhado" ──────────────────────────────────

const PREPARED = new RegExp(`\\b(?:fiz|preparei|cozinhei|deixei|montei|congelei)\\b.*?\\b${NUMBER_RE}\\s+(porcoes|porcao|marmitas?|potes?)\\b`)
const FOOD_AFTER = /\b(?:porcoes|porcao|marmitas?|potes?)\s+(?:prontas?\s+)?(?:de|com)\s+(.+)$/
const FOOD_BEFORE = /\b(?:fiz|preparei|cozinhei|montei)\s+(.+?)(?:\s+e\s+(?:deixei|separei|congelei|fiz)\b|,|$)/

/** Plan items (any active day plan) that this food covers, with their prescribed grams. */
function planCoverage(db: DB, food: string): { keys: string[]; grams?: number; meals: number } {
  const key = buyKeyOf(ingredientOf(food))
  const keys: string[] = []
  const grams: number[] = []
  for (const p of db.nutritionDayPlans) {
    if (!p.active) continue
    p.meals.forEach((m, mi) =>
      m.items.forEach((it, ii) => {
        if (buyKeyOf(ingredientOf(it.food)) !== key) return
        keys.push(`${p.id}#${mi}#${ii}`)
        if (it.grams) grams.push(it.grams)
      }),
    )
  }
  grams.sort((a, b) => a - b)
  return { keys, grams: grams.length ? grams[Math.floor(grams.length / 2)] : undefined, meals: keys.length }
}

/** How many of this week's planned meals use the same purchase (frango grelhado / desfiado = frango). */
function weekUses(db: DB, today: DateKey, food: string): { meals: number; next?: DateKey } {
  const key = buyKeyOf(ingredientOf(food))
  const menu = weekMenu(db, prepWeekFor(today))
  let meals = 0
  let next: DateKey | undefined
  for (const d of menu.days)
    for (const m of d.meals)
      if (m.items.some((it) => buyKeyOf(it.ingredient) === key)) {
        meals += 1
        if (!next && d.date >= today) next = d.date
      }
  return { meals, next }
}

function prepared(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  const m = PREPARED.exec(n)
  if (!m) return undefined
  const portions = numberOf(m[1])
  if (!portions) return undefined
  const src = text.normalize('NFC')
  const after = FOOD_AFTER.exec(n)
  const before = FOOD_BEFORE.exec(n)
  const span = after ?? before
  if (!span) return undefined
  const start = span.index + span[0].indexOf(span[1])
  let food = src.slice(start, start + span[1].length).replace(/\b(prontas?|pra semana|para a semana|da semana)\b/gi, '').replace(/^(o|a|os|as|um|uma)\s+/i, '').replace(/[.!]+$/, '').trim()
  if (!food || /^\d/.test(food)) return undefined
  food = food.toLowerCase()
  const cov = planCoverage(db, food)
  const uses = weekUses(db, now.date, food)
  const fridge = Math.min(portions, FRIDGE_DAYS)
  const freezer = portions - fridge
  const lines: ReplyLine[] = []
  if (uses.meals) lines.push({ text: `Cobre ${Math.min(portions, uses.meals)} das ${uses.meals} refeições da semana que levam ${ingredientOf(food).short} no plano.`, emoji: '🍱', provenance: 'inference' })
  else if (!cov.meals) lines.push({ text: 'Não achei esse alimento no plano do seu nutri — guardei como comida pronta, sem tratar como equivalente.', emoji: 'ℹ️' })
  if (cov.grams) lines.push({ text: `No plano a porção é ~${cov.grams} g.`, emoji: '⚖️' })
  lines.push({ text: freezer > 0 ? `${fridge} na geladeira (até ${FRIDGE_DAYS} dias) e ${freezer} no freezer — na noite anterior, passa uma pra geladeira.` : `${fridge} na geladeira — boas por até ${FRIDGE_DAYS} dias.`, emoji: '❄️' })
  lines.push({ text: 'A feira da semana já desconta essas porções.', emoji: '🛒' })
  const existing = db.pantry.find((p) => p.kind === 'preparado' && norm(p.name) === norm(food) && p.madeAt === now.date)
  return {
    area: AREA,
    text: `Anotado: ${plural(portions, 'porção', 'porções')} de ${food} prontas ✓`,
    lines,
    options: [{ label: 'Ver a feira', ask: 'faz minha feira' }],
    action: {
      mode: policyFor('pantry'),
      run: () =>
        runLogged(() => {
          if (existing) return updateUndoable('pantry', existing.id, { portions: (existing.portions ?? 0) + portions, remaining: (existing.remaining ?? existing.portions ?? 0) + portions })
          const item: Omit<PantryItem, 'id' | 'createdAt' | 'updatedAt'> = { name: food, kind: 'preparado', portions, remaining: portions, madeAt: now.date, storage: 'geladeira', gramsPerPortion: cov.grams, covers: cov.keys.length ? cov.keys : [food] }
          return createUndoable('pantry', item).undo
        }, [eventDraft(now, { kind: 'created', title: `Fez ${plural(portions, 'porção', 'porções')} de ${food}`, area: 'alimentacao', ref: { type: 'pantry', id: food } })]),
    },
  }
}

export const kitchenHandler: Handler = {
  id: 'kitchen',
  run(input) {
    return prepared(input) ?? have(input) ?? ranOut(input) ?? shopping(input)
  },
}
