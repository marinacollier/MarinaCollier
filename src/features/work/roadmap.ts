/**
 * Project roadmap (ProjectMilestone with group + status). Pure helpers — no "atrasado" anywhere:
 * a roadmap item is either on the roadmap, in progress or done.
 */
import type { ProjectMilestone } from '@/data/types'

export type RoadmapStatus = NonNullable<ProjectMilestone['status']>

export const ROADMAP_STATUS: Record<RoadmapStatus, { label: string; cls: string }> = {
  roadmap: { label: 'roadmap', cls: 'bg-surface-2 text-ink-2' },
  em_andamento: { label: 'em andamento', cls: 'bg-ocean-soft text-ocean' },
  feito: { label: 'feito ✓', cls: 'bg-sage-soft text-sage' },
}

export const ROADMAP_ORDER: RoadmapStatus[] = ['roadmap', 'em_andamento', 'feito']

/** Status with a fallback for older milestones that only have `done`. */
export function milestoneStatus(m: Pick<ProjectMilestone, 'status' | 'done'>): RoadmapStatus {
  return m.status ?? (m.done ? 'feito' : 'roadmap')
}

/** Tap cycles roadmap → em andamento → feito → roadmap. */
export function nextRoadmapStatus(s: RoadmapStatus): RoadmapStatus {
  return ROADMAP_ORDER[(ROADMAP_ORDER.indexOf(s) + 1) % ROADMAP_ORDER.length]
}

/** Patch that keeps `done` mirroring `status === 'feito'`. */
export function statusPatch(s: RoadmapStatus): Pick<ProjectMilestone, 'status' | 'done'> {
  return { status: s, done: s === 'feito' }
}

export const NO_GROUP = 'Outros'

export interface RoadmapLane {
  group: string
  items: ProjectMilestone[]
}

/**
 * Lanes in the order their first item appears (by `order`); items keep their order inside a lane.
 * Milestones without a group go to a final "Outros" lane.
 */
export function groupRoadmap(list: ProjectMilestone[]): RoadmapLane[] {
  const sorted = [...list].sort((a, b) => a.order - b.order)
  const lanes = new Map<string, ProjectMilestone[]>()
  const loose: ProjectMilestone[] = []
  for (const m of sorted) {
    const g = m.group?.trim()
    if (!g) {
      loose.push(m)
      continue
    }
    lanes.set(g, [...(lanes.get(g) ?? []), m])
  }
  const out = [...lanes.entries()].map(([group, items]) => ({ group, items }))
  if (loose.length) out.push({ group: NO_GROUP, items: loose })
  return out
}

/** Distinct groups used by a project's milestones, in roadmap order. */
export function roadmapGroups(list: ProjectMilestone[]): string[] {
  return groupRoadmap(list)
    .map((l) => l.group)
    .filter((g) => g !== NO_GROUP)
}

/** Counts per status (information only — never a percent). */
export function roadmapCounts(list: ProjectMilestone[]): Record<RoadmapStatus, number> {
  const out: Record<RoadmapStatus, number> = { roadmap: 0, em_andamento: 0, feito: 0 }
  for (const m of list) out[milestoneStatus(m)]++
  return out
}
