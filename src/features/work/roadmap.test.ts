import { describe, expect, it } from 'vitest'
import type { CalendarEvent, ProjectMilestone } from '@/data/types'
import { emptyDB } from '@/data/defaults'
import { groupRoadmap, milestoneStatus, nextRoadmapStatus, NO_GROUP, roadmapCounts, roadmapGroups, ROADMAP_STATUS, statusPatch } from './roadmap'
import { getRitualChecks, nextEventDate, resetRitualChecks, ritualKey, toggleRitualCheck, upcomingRituals } from './rituals'

const TS = '2026-09-01T12:00:00.000Z'
let n = 0
function m(p: Partial<ProjectMilestone>): ProjectMilestone {
  n++
  return { id: `m${n}`, createdAt: TS, updatedAt: TS, projectId: 'p', title: `M${n}`, done: false, order: n, ...p }
}

describe('roadmap grouping', () => {
  it('groups by lane in order of first appearance; ungrouped go last', () => {
    const list = [m({ group: 'Busca', order: 2 }), m({ group: 'Infra', order: 1 }), m({ order: 0 }), m({ group: 'Busca', order: 5 }), m({ group: ' ', order: 6 })]
    const lanes = groupRoadmap(list)
    expect(lanes.map((l) => l.group)).toEqual(['Infra', 'Busca', NO_GROUP])
    expect(lanes[1].items.map((x) => x.order)).toEqual([2, 5])
    expect(lanes[2].items).toHaveLength(2)
    expect(roadmapGroups(list)).toEqual(['Infra', 'Busca'])
  })

  it('status cycles roadmap → em andamento → feito and never says atrasado', () => {
    expect(nextRoadmapStatus('roadmap')).toBe('em_andamento')
    expect(nextRoadmapStatus('em_andamento')).toBe('feito')
    expect(nextRoadmapStatus('feito')).toBe('roadmap')
    expect(statusPatch('feito')).toEqual({ status: 'feito', done: true })
    expect(statusPatch('em_andamento')).toEqual({ status: 'em_andamento', done: false })
    expect(Object.values(ROADMAP_STATUS).some((s) => /atras/i.test(s.label))).toBe(false)
  })

  it('falls back to done for older milestones and counts per status', () => {
    expect(milestoneStatus({ done: true })).toBe('feito')
    expect(milestoneStatus({ done: false })).toBe('roadmap')
    const list = [m({ status: 'roadmap' }), m({ status: 'em_andamento' }), m({ done: true }), m({})]
    expect(roadmapCounts(list)).toEqual({ roadmap: 2, em_andamento: 1, feito: 1 })
  })
})

describe('rituals', () => {
  const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
    id: `e${n++}`,
    createdAt: TS,
    updatedAt: TS,
    sourceId: 'src',
    title: 'Ritual',
    date: '2026-10-03',
    allDay: false,
    ...p,
  })

  it('next occurrence honors recurrence and exdates', () => {
    const weekly = ev({ recurrence: { kind: 'weekly', weekdays: [6] }, exdates: ['2026-10-03'] })
    expect(nextEventDate(weekly, '2026-10-02')).toBe('2026-10-10')
    expect(nextEventDate(ev({ date: '2026-09-01' }), '2026-10-02')).toBeUndefined()
  })

  it('only events with a template from enabled sources are rituals', () => {
    const db = emptyDB()
    db.calendarSources = [{ id: 'src', createdAt: TS, updatedAt: TS, provider: 'local', name: 'x', syncDirection: 'none', color: 'x', enabled: true }]
    db.events = [
      ev({ title: 'Sem pauta', recurrence: { kind: 'weekly', weekdays: [6] } }),
      ev({ title: 'Board', date: '2026-10-31', recurrence: { kind: 'monthly', dayOfMonth: 'last' }, template: ['Mês'] }),
      ev({ title: 'CEO', recurrence: { kind: 'weekly', weekdays: [6] }, template: ['Wins'] }),
      ev({ title: 'Outra fonte', sourceId: 'off', template: ['x'] }),
    ]
    expect(upcomingRituals(db, '2026-10-02').map((r) => r.event.title)).toEqual(['CEO', 'Board'])
  })

  it('pauta checks are per occurrence and toggle', () => {
    resetRitualChecks()
    const a = ritualKey('e', '2026-10-03')
    const b = ritualKey('e', '2026-10-10')
    toggleRitualCheck(a, 0)
    toggleRitualCheck(a, 2)
    expect(getRitualChecks(a)).toEqual([0, 2])
    expect(getRitualChecks(b)).toEqual([])
    toggleRitualCheck(a, 0)
    expect(getRitualChecks(a)).toEqual([2])
  })
})
