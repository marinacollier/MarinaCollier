import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import type { DB, NewItem, Task } from '@/data/types'
import { groupTasks, todayTasks } from './groups'

const TODAY = '2026-10-02' // sexta; semana termina domingo 04

let n = 0
const task = (data: Partial<NewItem<'tasks'>> & { title: string }): Task =>
  ({ id: `t${++n}`, createdAt: '', updatedAt: '', status: 'todo', order: n, ...data }) as Task

function db(tasks: Task[]): DB {
  return { ...emptyDB(), tasks }
}

describe('groupTasks', () => {
  const tasks = [
    task({ title: 'hoje', date: TODAY }),
    task({ title: 'ontem', date: '2026-10-01' }),
    task({ title: 'domingo', date: '2026-10-04' }),
    task({ title: 'semana', bucket: 'semana' }),
    task({ title: 'mês que vem', date: '2026-11-10' }),
    task({ title: 'algum dia', bucket: 'algum_dia' }),
    task({ title: 'esperando', status: 'waiting', waiting: { who: 'Ana', since: TODAY } }),
    task({ title: 'confirmar', status: 'review' }),
    task({ title: 'feita', status: 'done', completedAt: '2026-10-02T13:00:00.000Z', date: TODAY }),
    task({ title: 'domingos', recurrence: { kind: 'weekly', weekdays: [0] } }),
    task({ title: 'trabalho', date: TODAY, context: 'trabalho' }),
  ]

  const byId = (d: DB, ctx?: Task['context']) =>
    Object.fromEntries(groupTasks(d, TODAY, ctx).map((s) => [s.id, s.tasks.map((t) => t.title)]))

  it('puts every open task in exactly one section', () => {
    const g = byId(db(tasks))
    expect(g.hoje).toEqual(['ontem', 'hoje', 'trabalho'])
    expect(g.semana).toEqual(['domingo', 'semana'])
    expect(g.depois).toEqual(['mês que vem'])
    expect(g.algum_dia).toEqual(['algum dia'])
    expect(g.esperando).toEqual(['esperando'])
    expect(g.revisar).toEqual(['confirmar'])
    expect(g.recorrentes).toEqual(['domingos'])
    expect(g.feitas).toEqual(['feita'])
    const all = Object.entries(g).filter(([k]) => k !== 'feitas').flatMap(([, v]) => v)
    expect(new Set(all).size).toBe(all.length)
  })

  it('filters by context', () => {
    const g = byId(db(tasks), 'trabalho')
    expect(g.hoje).toEqual(['trabalho'])
    expect(g.semana).toEqual([])
  })

  it('todayTasks separates carried-over ("ficou de antes") from today', () => {
    const t = todayTasks(db(tasks), TODAY)
    expect(t.open.map((x) => x.title)).toEqual(['hoje', 'trabalho'])
    expect(t.carried.map((x) => x.title)).toEqual(['ontem'])
    expect(t.done.map((x) => x.title)).toEqual(['feita'])
  })
})
