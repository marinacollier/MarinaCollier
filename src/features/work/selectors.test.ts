import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import type { DB, Project, ProfessionalWin, ProjectMilestone, Task, WorkInboxItem } from '@/data/types'
import {
  attentionItems,
  datedWorkItems,
  dueLabel,
  groupWinsByMonth,
  inboxPatchAfterConversion,
  laterDeadlines,
  projectLastUpdate,
  resumeBullets,
  splitProjects,
  taskFromInboxItem,
  thisWeekItems,
  todayWorkTasks,
  updatedAgoLabel,
  waitingLabel,
  waitingWork,
  withChangelog,
} from './selectors'

const TODAY = '2026-10-02' // sexta
const TS = '2026-09-01T12:00:00.000Z'

let n = 0
function task(p: Partial<Task>): Task {
  return { id: `t${n++}`, createdAt: TS, updatedAt: TS, title: 'x', status: 'todo', order: n, ...p }
}
function project(p: Partial<Project>): Project {
  return {
    id: `p${n++}`,
    createdAt: TS,
    updatedAt: TS,
    name: 'P',
    emoji: '💼',
    tone: 'ink',
    status: 'ativo',
    priority: 'media',
    links: [],
    files: [],
    people: [],
    decisions: [],
    changelog: [],
    kind: 'default',
    order: n,
    ...p,
  }
}
function inbox(p: Partial<WorkInboxItem>): WorkInboxItem {
  return { id: `i${n++}`, createdAt: TS, updatedAt: TS, source: 'manual', subject: 'Assunto', kind: 'responder', status: 'novo', ...p }
}
function milestone(p: Partial<ProjectMilestone>): ProjectMilestone {
  return { id: `m${n++}`, createdAt: TS, updatedAt: TS, projectId: 'p', title: 'M', done: false, order: n, ...p }
}
function win(p: Partial<ProfessionalWin>): ProfessionalWin {
  return { id: `w${n++}`, createdAt: TS, updatedAt: TS, title: 'Win', kind: 'entrega', date: TODAY, ...p }
}
function db(p: Partial<DB>): DB {
  return { ...emptyDB(), ...p }
}

describe('attentionItems', () => {
  it('includes needsMe work tasks and new inbox items that ask something, nothing else', () => {
    const d = db({
      tasks: [
        task({ id: 'a', context: 'trabalho', needsMe: true }),
        task({ id: 'b', context: 'trabalho' }),
        task({ id: 'c', context: 'trabalho', needsMe: true, status: 'done' }),
        task({ id: 'd', needsMe: true }), // not work
      ],
      workInbox: [
        inbox({ id: 'i1', kind: 'aprovacao' }),
        inbox({ id: 'i2', kind: 'mencao' }),
        inbox({ id: 'i3', kind: 'pedido', status: 'ignorado' }),
      ],
    })
    expect(attentionItems(d).map((a) => a.id)).toEqual(['a', 'i1'])
  })
})

describe('todayWorkTasks', () => {
  it('picks date/dueDate/bucket today and recurring routines, skips waiting and life tasks', () => {
    const d = db({
      tasks: [
        task({ id: 'date', context: 'trabalho', date: TODAY }),
        task({ id: 'due', projectId: 'p1', dueDate: TODAY }),
        task({ id: 'bucket', context: 'trabalho', bucket: 'hoje' }),
        task({ id: 'waiting', context: 'trabalho', date: TODAY, status: 'waiting' }),
        task({ id: 'life', date: TODAY }),
        task({ id: 'friday', context: 'trabalho', recurrence: { kind: 'weekly', weekdays: [5] } }),
        task({ id: 'saturday', context: 'trabalho', recurrence: { kind: 'weekly', weekdays: [6] } }),
      ],
    })
    expect(todayWorkTasks(d, TODAY).map((t) => t.id).sort()).toEqual(['bucket', 'date', 'due', 'friday'])
  })
})

describe('deadlines', () => {
  const p = project({ id: 'p1', name: 'Santander', deadline: '2026-12-01', nextDelivery: { title: 'MVP', date: '2026-10-03' } })
  const paused = project({ id: 'p2', status: 'pausado', deadline: '2026-10-02' })
  const d = db({
    projects: [p, paused],
    milestones: [milestone({ projectId: 'p1', title: 'Kickoff', date: '2026-10-20' }), milestone({ projectId: 'p1', title: 'Feito', date: '2026-10-02', done: true })],
    tasks: [
      task({ id: 'tk', context: 'trabalho', title: 'Deck', dueDate: '2026-10-01' }),
      task({ id: 'tp', projectId: 'p2', title: 'Pausado', dueDate: '2026-10-04' }),
      task({ id: 'td', context: 'trabalho', title: 'Done', dueDate: '2026-10-04', status: 'done' }),
    ],
  })

  it('sorts by proximity and skips done / paused', () => {
    expect(datedWorkItems(d).map((i) => i.title)).toEqual(['Deck', 'MVP', 'Kickoff', 'Deadline · Santander'])
  })

  it('splits this week vs later', () => {
    expect(thisWeekItems(d, TODAY).map((i) => i.title)).toEqual(['Deck', 'MVP'])
    expect(laterDeadlines(d, TODAY).map((i) => i.title)).toEqual(['Kickoff', 'Deadline · Santander'])
  })

  it('labels kindly', () => {
    expect(dueLabel('2026-10-01', TODAY)).toBe('ficou de ontem')
    expect(dueLabel('2026-09-20', TODAY)).toBe('ficou de antes')
    expect(dueLabel(TODAY, TODAY)).toBe('hoje')
    expect(dueLabel('2026-10-03', TODAY)).toBe('amanhã')
  })
})

describe('waiting for', () => {
  it('lists work waiting tasks, oldest first, with a neutral label', () => {
    const a = task({ id: 'a', context: 'trabalho', status: 'waiting', waiting: { who: 'Ana', since: '2026-09-28' } })
    const b = task({ id: 'b', projectId: 'p1', status: 'waiting', waiting: { who: '', since: '2026-09-20' } })
    const c = task({ id: 'c', status: 'waiting', waiting: { who: 'Banco', since: '2026-09-01' } })
    const d = db({ tasks: [a, b, c] })
    expect(waitingWork(d).map((t) => t.id)).toEqual(['b', 'a'])
    expect(waitingWork(d, 'p1').map((t) => t.id)).toEqual(['b'])
    expect(waitingLabel(a, TODAY)).toBe('Aguardando retorno de Ana · há 4 dias')
    expect(waitingLabel(b, TODAY)).toBe('Aguardando retorno · há 12 dias')
  })
})

describe('projectLastUpdate', () => {
  it('takes the latest updatedAt across project and related records', () => {
    const p = project({ id: 'p1', updatedAt: '2026-09-01T00:00:00.000Z' })
    const d = db({
      projects: [p],
      tasks: [task({ projectId: 'p1', updatedAt: '2026-09-10T00:00:00.000Z' }), task({ updatedAt: '2026-10-01T00:00:00.000Z' })],
      milestones: [milestone({ projectId: 'p1', updatedAt: '2026-09-15T00:00:00.000Z' })],
      wins: [win({ projectId: 'p1', updatedAt: '2026-09-20T15:00:00.000Z' })],
    })
    expect(projectLastUpdate(d, 'p1')).toBe('2026-09-20T15:00:00.000Z')
    expect(updatedAgoLabel('2026-09-20T15:00:00.000Z', TODAY)).toBe('atualizado há 12 dias')
    expect(updatedAgoLabel('2026-10-02T15:00:00.000Z', TODAY)).toBe('atualizado hoje')
  })
})

describe('splitProjects', () => {
  it('keeps paused/finished apart, ordered', () => {
    const d = db({ projects: [project({ id: 'b', order: 2 }), project({ id: 'z', order: 0, status: 'pausado' }), project({ id: 'a', order: 1, status: 'planejando' })] })
    const { live, resting } = splitProjects(d)
    expect(live.map((p) => p.id)).toEqual(['a', 'b'])
    expect(resting.map((p) => p.id)).toEqual(['z'])
  })
})

describe('withChangelog', () => {
  it('appends lines for status, priority and deadline changes', () => {
    const p = project({ status: 'ativo', priority: 'media' })
    const patch = withChangelog(p, { status: 'pausado', priority: 'alta', deadline: '2026-11-10', name: 'x' }, TODAY)
    expect(patch.changelog?.map((c) => c.text)).toEqual(['Status: ativo → pausado', 'Prioridade: média → alta', 'Deadline: 10 de nov.'])
    expect(patch.changelog?.every((c) => c.date === TODAY)).toBe(true)
  })
  it('leaves the patch alone when nothing tracked changed', () => {
    const p = project({ status: 'ativo' })
    const patch = { status: 'ativo' as const, nextAction: 'y' }
    expect(withChangelog(p, patch, TODAY)).toBe(patch)
  })
})

describe('inbox conversions', () => {
  const item = inbox({ id: 'in1', subject: 'Aprovar budget', kind: 'aprovacao', sender: 'Carla', projectId: 'p1', dueDate: '2026-10-10' })
  it('builds a work task with origin, project and due date', () => {
    const t = taskFromInboxItem(item, 'task', TODAY, 7)
    expect(t).toMatchObject({
      title: 'Aprovar budget',
      status: 'todo',
      context: 'trabalho',
      projectId: 'p1',
      dueDate: '2026-10-10',
      origin: { type: 'workInbox', id: 'in1' },
      needsMe: true,
      order: 7,
    })
    expect(inboxPatchAfterConversion('task', 'tX')).toEqual({ status: 'virou_tarefa', taskId: 'tX' })
  })
  it('builds a waiting-for task from the sender', () => {
    const t = taskFromInboxItem(item, 'waiting', TODAY, 0)
    expect(t.status).toBe('waiting')
    expect(t.waiting).toEqual({ who: 'Carla', since: TODAY })
    expect(inboxPatchAfterConversion('waiting', 'tY')).toEqual({ status: 'waiting', taskId: 'tY' })
  })
})

describe('wins', () => {
  const wins = [
    win({ id: 'a', title: 'Lançou MVP', date: '2026-09-10', projectId: 'p1', impact: '2k usuários' }),
    win({ id: 'b', title: 'Contrato fechado', date: '2026-10-01', kind: 'contrato' }),
    win({ id: 'c', title: 'Palestra', date: '2025-05-01' }),
  ]
  it('groups by month, newest first', () => {
    const g = groupWinsByMonth(wins)
    expect(g.map((x) => x.month)).toEqual(['2026-10', '2026-09', '2025-05'])
    expect(g[0].label).toBe('outubro 2026')
  })
  it('builds clean CV bullets for a period', () => {
    const text = resumeBullets(wins, [project({ id: 'p1', name: 'FashionFinder' })], '2026-01-01', TODAY)
    expect(text).toBe('• Lançou MVP — 2k usuários (FashionFinder, set/2026)\n• Contrato fechado (out/2026)')
  })
})
