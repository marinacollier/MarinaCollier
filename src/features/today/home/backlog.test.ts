import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import type { DB, Project, Task } from '@/data/types'
import { backlogCounts, backlogOf, filterBacklog } from './backlog'

const TODAY = '2026-11-10'

let n = 0
const task = (p: Partial<Task> & { title: string }): Task => ({ id: `t${++n}`, createdAt: '', updatedAt: '', status: 'todo', order: n, ...p }) as Task
const project = (p: Partial<Project> & { id: string; name: string }): Project => ({ status: 'ativo', priority: 'media', ...p }) as Project

function db(tasks: Task[], projects: Project[] = []): DB {
  return { ...emptyDB(), tasks, projects }
}

const titles = (xs: { title: string }[]) => xs.map((x) => x.title)

describe('backlogOf', () => {
  const projects = [project({ id: 'p1', name: 'Day One' }), project({ id: 'p2', name: 'Santander', status: 'concluido' })]

  it('only open, non-recurring tasks of live projects', () => {
    const items = backlogOf(
      db(
        [
          task({ title: 'aberta' }),
          task({ title: 'fazendo', status: 'doing' }),
          task({ title: 'feita', status: 'done' }),
          task({ title: 'arquivada', status: 'archived' }),
          task({ title: 'revisar', status: 'review' }),
          task({ title: 'rotina', recurrence: { kind: 'daily' } as Task['recurrence'] }),
          task({ title: 'santander', projectId: 'p2' }),
          task({ title: 'day one', projectId: 'p1' }),
        ],
        projects,
      ),
      TODAY,
    )
    expect(titles(items).sort()).toEqual(['aberta', 'day one', 'fazendo'])
    expect(items.find((i) => i.title === 'day one')?.projectName).toBe('Day One')
  })

  it('a task planned for today or later is not backlog; a waiting one is; an older plan is', () => {
    const items = backlogOf(
      db([
        task({ title: 'hoje', date: TODAY }),
        task({ title: 'amanhã', date: '2026-11-11' }),
        task({ title: 'ontem', date: '2026-11-09', postponedFrom: '2026-11-08' }),
        task({ title: 'esperando', status: 'waiting', date: TODAY, waiting: { who: 'Ana', since: TODAY } }),
      ]),
      TODAY,
    )
    expect(titles(items).sort()).toEqual(['esperando', 'ontem'])
    expect(items.find((i) => i.title === 'esperando')).toMatchObject({ bucket: 'aguardando', waitingWho: 'Ana' })
    expect(items.find((i) => i.title === 'ontem')?.postponed).toBe(true)
  })

  it('buckets, sort and counts', () => {
    const items = backlogOf(
      db([
        task({ title: 'Zeta calma' }),
        task({ title: 'Alfa calma', dueDate: '2026-12-01' }),
        task({ title: 'alta', priority: 'alta' }),
        task({ title: 'must', moscow: 'must' }),
        task({ title: 'vence logo', dueDate: '2026-11-13' }),
        task({ title: 'vencida', dueDate: '2026-11-01' }),
        task({ title: 'espera', status: 'waiting' }),
      ]),
      TODAY,
    )
    expect(items.map((i) => [i.title, i.bucket])).toEqual([
      ['vencida', 'prioritario'],
      ['vence logo', 'prioritario'],
      ['alta', 'prioritario'],
      ['must', 'prioritario'],
      ['espera', 'aguardando'],
      ['Alfa calma', 'sem_urgencia'],
      ['Zeta calma', 'sem_urgencia'],
    ])
    expect(backlogCounts(items)).toEqual({ total: 7, prioritario: 4, aguardando: 1, sem_urgencia: 2 })
  })

  it('skips ids already in the plan (task:<id> or bare id)', () => {
    const a = task({ title: 'a' })
    const b = task({ title: 'b' })
    const c = task({ title: 'c' })
    expect(titles(backlogOf(db([a, b, c]), TODAY, new Set([`task:${a.id}`, b.id])))).toEqual(['c'])
  })
})

describe('filterBacklog', () => {
  const items = backlogOf(
    db(
      [
        task({ title: 'vencida', dueDate: '2026-11-05', projectId: 'p1' }),
        task({ title: 'semana', dueDate: '2026-11-15', priority: 'baixa' }),
        task({ title: 'longe', dueDate: '2026-12-20', priority: 'alta' }),
        task({ title: 'sem prazo', projectId: 'p1' }),
        task({ title: 'espera', status: 'waiting' }),
      ],
      [project({ id: 'p1', name: 'Day One' })],
    ),
    TODAY,
  )
  it('by project, priority, due and bucket', () => {
    expect(titles(filterBacklog(items, { project: 'p1' }, TODAY)).sort()).toEqual(['sem prazo', 'vencida'])
    expect(titles(filterBacklog(items, { priority: 'alta' }, TODAY))).toEqual(['longe'])
    expect(titles(filterBacklog(items, { due: 'vencidas' }, TODAY))).toEqual(['vencida'])
    expect(titles(filterBacklog(items, { due: '7dias' }, TODAY))).toEqual(['semana'])
    expect(titles(filterBacklog(items, { due: 'sem_prazo' }, TODAY)).sort()).toEqual(['espera', 'sem prazo'])
    expect(titles(filterBacklog(items, { bucket: 'aguardando' }, TODAY))).toEqual(['espera'])
    expect(filterBacklog(items, {}, TODAY)).toHaveLength(5)
  })
})
