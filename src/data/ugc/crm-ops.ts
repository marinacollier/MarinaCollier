/**
 * CRM Marcas / UGC Business — writers (through the store, each returns its undo).
 * UGC tasks are the existing Tasks: the same record Home checks.
 */
import { actions, getDB } from '../store'
import type { Brand, BrandCrm, CollectionKey, DateKey, ItemOf, Task, TaskStep, UgcCrmStatus, UgcDemo } from '../types'
import { uid } from '@/lib/id'
import { parseCrmPaste, reconcileCrm, taskStatePatch, type ReconcileReport, type UgcTaskState } from './crm'
import type { Undo } from './ops'

function patch<K extends CollectionKey>(key: K, id: string, p: Partial<ItemOf<K>>): Undo {
  const before = (getDB()[key] as unknown as Record<string, unknown>[]).find((r) => r.id === id)
  if (!before) return () => {}
  const restore = Object.fromEntries(Object.keys(p).map((k) => [k, before[k]])) as Partial<ItemOf<K>>
  actions.update(key, id, p)
  return () => actions.update(key, id, restore)
}

const task = (id: string) => getDB().tasks.find((t) => t.id === id)

export function setUgcTaskState(id: string, s: UgcTaskState, today: DateKey): Undo {
  const t = task(id)
  return t ? patch('tasks', id, taskStatePatch(t, s, today)) : () => {}
}

/** Move to another day: kept as the same task, marked "Adiado" with the day it was planned for. */
export function rescheduleTask(id: string, date: DateKey): Undo {
  const t = task(id)
  if (!t) return () => {}
  const from = t.date ?? t.dueDate
  const p: Partial<Task> = { date, postponedFrom: t.postponedFrom ?? from }
  if (t.dueDate && t.dueDate < date) p.dueDate = date
  if (t.status === 'done' || t.status === 'archived') Object.assign(p, { status: 'todo', completedAt: undefined })
  return patch('tasks', id, p)
}

export function setSteps(id: string, steps: TaskStep[]): Undo {
  return patch('tasks', id, { checklist: steps.length ? steps : undefined })
}
export function toggleStep(id: string, stepId: string): Undo {
  const t = task(id)
  return t ? setSteps(id, (t.checklist ?? []).map((s) => (s.id === stepId ? { ...s, done: !s.done } : s))) : () => {}
}
export function addStep(id: string, title: string): Undo {
  const t = task(id)
  return t && title.trim() ? setSteps(id, [...(t.checklist ?? []), { id: uid(), title: title.trim(), done: false }]) : () => {}
}
export function removeStep(id: string, stepId: string): Undo {
  const t = task(id)
  return t ? setSteps(id, (t.checklist ?? []).filter((s) => s.id !== stepId)) : () => {}
}

// ─── Demo / portfolio pieces ────────────────────────────────────────────────

export function patchDemo(contentId: string, p: Partial<UgcDemo>): Undo {
  const c = getDB().contentItems.find((x) => x.id === contentId)
  if (!c?.demo) return () => {}
  const demo = { ...c.demo, ...p }
  const stage = demo.inPortfolio ? 'publicado' : demo.editStatus === 'pronta' ? 'pronto' : demo.editStatus === 'nao_iniciada' ? (demo.recordDate ? 'gravar' : c.stage === 'publicado' ? 'ideia' : c.stage) : 'editando'
  return patch('contentItems', contentId, { demo, stage })
}
export function patchContent(contentId: string, p: { script?: string; title?: string }): Undo {
  return patch('contentItems', contentId, p)
}

// ─── Brand CRM ──────────────────────────────────────────────────────────────

function patchCrm(b: Brand, p: Partial<BrandCrm>): Undo {
  const crm = { ...(b.crm ?? {}), ...p }
  for (const k of Object.keys(crm) as (keyof BrandCrm)[]) if (crm[k] === undefined) delete crm[k]
  return patch('brands', b.id, { crm })
}
const brand = (id: string) => getDB().brands.find((b) => b.id === id)

/** Her own status, dated today (an older import never overwrites it). */
export function setCrmStatus(brandId: string, status: UgcCrmStatus | undefined, today: DateKey): Undo {
  const b = brand(brandId)
  if (!b) return () => {}
  return patchCrm(b, { status, statusAt: status ? today : undefined, evidence: undefined, noFollowUp: status === 'negativa' || status === 'afiliada_sem_vagas' ? true : undefined, affiliate: status === 'afiliada_sem_vagas' ? true : b.crm?.affiliate })
}
export function addCoupon(brandId: string, code?: string): Undo {
  const b = brand(brandId)
  return b ? patchCrm(b, { coupons: [...(b.crm?.coupons ?? []), code?.trim() ? { code: code.trim(), source: 'Marina' } : { source: 'Marina' }] }) : () => {}
}
export function removeCoupon(brandId: string, index: number): Undo {
  const b = brand(brandId)
  return b ? patchCrm(b, { coupons: (b.crm?.coupons ?? []).filter((_, i) => i !== index) }) : () => {}
}
export function addPressKit(brandId: string, receivedAt?: DateKey): Undo {
  const b = brand(brandId)
  return b ? patchCrm(b, { pressKits: [...(b.crm?.pressKits ?? []), receivedAt ? { receivedAt } : {}] }) : () => {}
}
export function removePressKit(brandId: string, index: number): Undo {
  const b = brand(brandId)
  return b ? patchCrm(b, { pressKits: (b.crm?.pressKits ?? []).filter((_, i) => i !== index) }) : () => {}
}

// ─── Paste import ───────────────────────────────────────────────────────────

/** Paste the sheet (CSV/TSV/JSON): reconciled into the brands, saved now, one undo. */
export function importCrmText(text: string, now: string = new Date().toISOString()): { report: ReconcileReport; warnings: string[]; rows: number; undo: Undo } {
  const { rows, warnings } = parseCrmPaste(text)
  const db = getDB()
  const { db: next, report } = reconcileCrm(db, rows, { now })
  const undos: Undo[] = []
  for (const key of ['brands', 'ugcOpportunities'] as const) {
    const old = new Map((db[key] as { id: string }[]).map((r) => [r.id, r]))
    for (const r of next[key] as (Brand & { id: string })[]) {
      const before = old.get(r.id)
      if (!before) {
        actions.create(key, r as never)
        undos.push(() => void actions.remove(key, r.id))
      } else if (before !== r) {
        const restore = before as unknown as Record<string, unknown>
        actions.update(key, r.id, r as never)
        undos.push(() => {
          const now2 = getDB()[key] as unknown as Record<string, unknown>[]
          const cur = now2.find((x) => x.id === r.id) ?? {}
          // remove keys the import added, then restore the old values
          const cleared = Object.fromEntries(Object.keys(cur).filter((k) => !(k in restore)).map((k) => [k, undefined]))
          actions.update(key, r.id, { ...cleared, ...restore } as never)
        })
      }
    }
  }
  return { report, warnings, rows: rows.length, undo: () => [...undos].reverse().forEach((u) => u()) }
}
