/**
 * What's at home (db.pantry): ingredients ("já tenho arroz, whey e café") and prepared food
 * ("fiz seis porções de frango grelhado"). The shopping list subtracts both; prepared portions also
 * cover pots (less to cook). Writes log a LifeEvent and return one undo.
 */
import type { DB, MealPrepPlan, PantryItem } from '@/data/types'
import { actions, getDB } from '@/data/store'
import { logLife } from '@/data/intel/log'
import { todayKey } from '@/lib/date'
import { normalize } from '@/lib/text'
import { buyKeyOf, ingredientOf } from './catalog'

type Undo = () => void

/** Names to treat as "em casa": the week's MealPrepPlan.pantry + ingredient items of db.pantry. */
export function pantryNames(db: DB, plan?: MealPrepPlan): string[] {
  const fromDb = (db.pantry ?? []).filter((p) => p.kind === 'ingrediente').map((p) => normalize(p.name))
  return [...new Set([...(plan?.pantry ?? []).map(normalize), ...fromDb])].filter(Boolean)
}

export interface PreparedStock {
  id: string
  name: string
  /** Catalog keys it counts for (ingredient key + purchase key). */
  ingredientKey: string
  buyKey: string
  portions: number
  /** Ready grams per portion, when known. */
  grams?: number
}

/** Prepared food still available (remaining portions > 0). */
export function preparedStock(db: DB): PreparedStock[] {
  return (db.pantry ?? [])
    .filter((p) => p.kind === 'preparado' && (p.remaining ?? p.portions ?? 0) > 0)
    .map((p) => {
      const ing = ingredientOf(p.covers?.[0] ?? p.name)
      return { id: p.id, name: p.name, ingredientKey: ing.key, buyKey: buyKeyOf(ing), portions: p.remaining ?? p.portions ?? 0, grams: p.gramsPerPortion }
    })
}

const chain =
  (...undos: Undo[]): Undo =>
  () => {
    for (const u of [...undos].reverse()) u()
  }

/** "Já tenho arroz, whey e café." Adds (or refreshes) ingredient items. */
export function addToPantry(names: string[], opts: { recurring?: boolean } = {}): { items: PantryItem[]; undo: Undo } {
  const undos: Undo[] = []
  const items: PantryItem[] = []
  for (const raw of names.map((n) => n.trim()).filter(Boolean)) {
    const existing = getDB().pantry.find((p) => p.kind === 'ingrediente' && normalize(p.name) === normalize(raw))
    if (existing) {
      items.push(existing)
      continue
    }
    const it = actions.create('pantry', { name: raw.toLowerCase(), kind: 'ingrediente', storage: 'despensa', ...(opts.recurring ? { recurring: true } : {}) })
    items.push(it)
    undos.push(() => void actions.remove('pantry', it.id))
  }
  if (undos.length) undos.push(logLife({ kind: 'logged', title: `Em casa: ${items.map((i) => i.name).join(', ')}`, area: 'alimentacao', ref: { type: 'pantry', id: items[0].id }, by: 'lumos', provenance: 'user' }).undo)
  return { items, undo: chain(...undos) }
}

/** "Acabou o arroz." */
export function removeFromPantry(name: string): Undo {
  const found = getDB().pantry.filter((p) => normalize(p.name) === normalize(name) || normalize(p.name).includes(normalize(name)))
  const undos: Undo[] = []
  for (const p of found) {
    actions.remove('pantry', p.id)
    undos.push(() => actions.restore('pantry', p))
  }
  if (found.length) undos.push(logLife({ kind: 'changed', title: `Acabou: ${found.map((p) => p.name).join(', ')}`, area: 'alimentacao', by: 'lumos', provenance: 'user' }).undo)
  return chain(...undos)
}

/** "Fiz o frango grelhado e deixei seis porções prontas." */
export function recordPrepared(input: { name: string; portions: number; gramsPerPortion?: number; storage?: PantryItem['storage']; covers?: string[]; date?: string }): { item: PantryItem; undo: Undo } {
  const item = actions.create('pantry', {
    name: input.name,
    kind: 'preparado',
    portions: input.portions,
    remaining: input.portions,
    madeAt: input.date ?? todayKey(),
    storage: input.storage ?? 'geladeira',
    ...(input.gramsPerPortion ? { gramsPerPortion: input.gramsPerPortion } : {}),
    ...(input.covers?.length ? { covers: input.covers } : {}),
  })
  const log = logLife({ kind: 'created', title: `${input.portions} ${input.portions === 1 ? 'porção' : 'porções'} de ${input.name} prontas`, area: 'alimentacao', ref: { type: 'pantry', id: item.id }, by: 'lumos', provenance: 'user' })
  return { item, undo: chain(() => void actions.remove('pantry', item.id), log.undo) }
}

/** One (or n) portions eaten. */
export function usePrepared(id: string, n = 1): Undo {
  const p = getDB().pantry.find((x) => x.id === id)
  if (!p) return () => {}
  const before = p.remaining
  actions.update('pantry', id, { remaining: Math.max(0, (p.remaining ?? p.portions ?? 0) - n) })
  return () => actions.update('pantry', id, { remaining: before })
}
