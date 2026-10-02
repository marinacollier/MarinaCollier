/**
 * Creator OS read helpers. Pure functions — use inside useMemo.
 */
import type { BrandPartnership, ContentItem, ContentStage, DateKey, ID, PartnershipStage, Project, Task } from '@/data/types'
import { diffDays, relativeDay } from '@/lib/date'
import { CATEGORIES, CONTENT_STAGES, PARTNERSHIP_STAGES } from './constants'

const PARTNERSHIP_ORDER = PARTNERSHIP_STAGES.map((s) => s.value)
const CONTENT_ORDER = CONTENT_STAGES.map((s) => s.value)

/** Next stage in the pipeline, or undefined at the end. */
export function nextPartnershipStage(stage: PartnershipStage): PartnershipStage | undefined {
  const i = PARTNERSHIP_ORDER.indexOf(stage)
  return i >= 0 && i < PARTNERSHIP_ORDER.length - 1 ? PARTNERSHIP_ORDER[i + 1] : undefined
}

export function nextContentStage(stage: ContentStage): ContentStage | undefined {
  const i = CONTENT_ORDER.indexOf(stage)
  return i >= 0 && i < CONTENT_ORDER.length - 1 ? CONTENT_ORDER[i + 1] : undefined
}

const byDeadlineThenOrder = <T extends { deadline?: DateKey; order: number }>(a: T, b: T) =>
  (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.order - b.order

/** Partnerships grouped by stage, in pipeline order (every stage present, maybe empty). */
export function partnershipsByStage(list: BrandPartnership[]) {
  return PARTNERSHIP_STAGES.map((meta) => ({
    meta,
    items: list.filter((p) => p.stage === meta.value).sort(byDeadlineThenOrder),
  }))
}

export function contentByStage(list: ContentItem[]) {
  return CONTENT_STAGES.map((meta) => ({
    meta,
    items: list.filter((c) => c.stage === meta.value).sort(byDeadlineThenOrder),
  }))
}

/** Stages where there is still something for Marina to deliver. */
const DELIVERY_STAGES: PartnershipStage[] = ['fechado', 'producao', 'aguardando_aprovacao', 'negociacao', 'contato', 'ideia']

/** Open partnerships with a deadline, soonest first. */
export function upcomingDeliveries(list: BrandPartnership[], limit = 3): BrandPartnership[] {
  return list
    .filter((p) => !!p.deadline && DELIVERY_STAGES.includes(p.stage))
    .sort(byDeadlineThenOrder)
    .slice(0, limit)
}

export function awaitingPayment(list: BrandPartnership[]): { totalCents: number; count: number; barterOnly: number } {
  const items = list.filter((p) => p.stage === 'aguardando_pagamento')
  return {
    totalCents: items.reduce((s, p) => s + (p.valueCents ?? 0), 0),
    count: items.length,
    barterOnly: items.filter((p) => !p.valueCents).length,
  }
}

/** Partnerships that are still moving (not finalized). */
export function activePartnerships(list: BrandPartnership[]): BrandPartnership[] {
  return list.filter((p) => p.stage !== 'finalizado')
}

export function contentForPartnership(items: ContentItem[], partnershipId: ID): ContentItem[] {
  return items.filter((c) => c.partnershipId === partnershipId).sort((a, b) => a.order - b.order)
}

export function ideas(items: ContentItem[]): ContentItem[] {
  return items
    .filter((c) => c.stage === 'ideia')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.order - b.order)
}

export interface ContentFilter {
  category?: string
  platform?: string
  /** Creator project / series. */
  projectId?: ID
}

export function filterContent(items: ContentItem[], f: ContentFilter): ContentItem[] {
  return items.filter(
    (c) =>
      (!f.category || c.category === f.category) &&
      (!f.platform || c.platform === f.platform) &&
      (!f.projectId || c.projectId === f.projectId),
  )
}

// ─── Creator projects / series ──────────────────────────────────────────────

/** Creator-kind projects (UGC front, series) that are not finished, in project order. */
export function creatorProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.kind === 'creator' && p.status !== 'concluido').sort((a, b) => a.order - b.order)
}

/**
 * Category options for a content item: the chosen project's own categories, else the union of all
 * creator projects' categories, else the default list. `current` is always kept.
 */
export function categoryOptions(projects: Project[], projectId?: ID, current?: string): string[] {
  const own = projectId ? projects.find((p) => p.id === projectId)?.categories : undefined
  let list: string[]
  if (own?.length) list = [...own]
  else {
    const union = new Set<string>()
    for (const p of creatorProjects(projects)) for (const c of p.categories ?? []) union.add(c)
    list = union.size ? [...union] : [...CATEGORIES]
  }
  if (current && !list.includes(current)) list.push(current)
  return list
}

/** Open "revisar / confirmar" tasks tied to partnerships (Breevo: "revisar hoje"). Never 'late'. */
export function partnershipReviews(tasks: Task[], partnershipId?: ID): Task[] {
  return tasks
    .filter((t) => !!t.partnershipId && t.status === 'review' && (!partnershipId || t.partnershipId === partnershipId))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.order - b.order)
}

/** "revisar hoje" / "revisar sexta" / "revisar quando der" — a past date reads as "revisar hoje". */
export function reviewLabel(task: Pick<Task, 'date'>, today: DateKey): string {
  if (!task.date) return 'revisar quando der'
  if (task.date <= today) return 'revisar hoje'
  return `revisar ${relativeDay(task.date, today)}`
}

/** Distinct non-empty values of a field, in the order of a reference list (unknown values last). */
export function usedValues(items: ContentItem[], field: 'category' | 'platform', reference: readonly string[]): string[] {
  const set = new Set(items.map((c) => c[field]).filter((v): v is string => !!v))
  const known = reference.filter((v) => set.has(v))
  const extra = [...set].filter((v) => !reference.includes(v)).sort()
  return [...known, ...extra]
}

/** Neutral deadline label — never "atrasado". */
export function deadlineLabel(deadline: DateKey, today: DateKey): string {
  const d = diffDays(today, deadline)
  if (d < 0) return `prazo era ${relativeDay(deadline, today)}`
  return `prazo ${relativeDay(deadline, today)}`
}

export function deadlineSoon(deadline: DateKey | undefined, today: DateKey): boolean {
  return !!deadline && diffDays(today, deadline) <= 2
}
