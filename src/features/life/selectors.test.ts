import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { createSeedContext } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { DB, Occurrence, PetTask, Task } from '@/data/types'
import { addDays } from '@/lib/date'
import {
  groupLifeAdmin,
  isReviewTime,
  lastDoneLabel,
  lifeAdminCounts,
  lunaExpensesThisMonth,
  lunaPendingToday,
  lunaToday,
  nextDateLabel,
  petAge,
  petTaskState,
  weekGoalsLabel,
  weekGoalsSummary,
} from './selectors'
import { seedLife } from './seed'

// 2026-10-02 is a Friday.
const TODAY = '2026-10-02'
const NOW = '2026-10-02T12:00:00.000Z'
let n = 0
const base = () => ({ id: `id-${n++}`, createdAt: NOW, updatedAt: NOW })

function pet(data: Partial<PetTask>): PetTask {
  return { ...base(), petId: SEED_IDS.petLuna, title: 'x', category: 'lembrete', active: true, order: 0, ...data }
}
function task(data: Partial<Task>): Task {
  return { ...base(), title: 't', status: 'todo', context: 'vida_real', order: 0, ...data }
}
function occ(parentType: Occurrence['parentType'], parentId: string, date: string): Occurrence {
  return { ...base(), parentType, parentId, date, status: 'done' }
}
function db(patch: Partial<DB>): DB {
  return { ...emptyDB(), ...patch }
}

describe('labels', () => {
  it('nextDateLabel', () => {
    expect(nextDateLabel(TODAY, TODAY)).toBe('hoje')
    expect(nextDateLabel('2026-10-03', TODAY)).toBe('amanhã')
    expect(nextDateLabel('2026-10-09', TODAY)).toBe('sex, 09/10')
    expect(nextDateLabel('2026-09-20', TODAY)).toBe('hoje')
  })
  it('lastDoneLabel', () => {
    expect(lastDoneLabel(undefined, TODAY)).toBeUndefined()
    expect(lastDoneLabel(TODAY, TODAY)).toBe('feito hoje')
    expect(lastDoneLabel('2026-10-01', TODAY)).toBe('feito ontem')
    expect(lastDoneLabel('2026-09-27', TODAY)).toBe('feito há 5 dias')
    expect(lastDoneLabel('2026-06-01', TODAY)).toBe('feito em 01/06')
  })
  it('petAge', () => {
    expect(petAge('2023-08-15', TODAY)).toBe('3 anos e 1 mês')
    expect(petAge('2026-02-02', TODAY)).toBe('8 meses')
    expect(petAge('2025-10-02', TODAY)).toBe('1 ano')
    expect(petAge('2026-09-18', TODAY)).toBe('2 semanas')
    expect(petAge(undefined, TODAY)).toBeUndefined()
  })
  it('weekGoalsLabel never scolds', () => {
    expect(weekGoalsLabel(0, 0)).toMatch(/que tal/)
    expect(weekGoalsLabel(2, 4)).toBe('2 de 4 feitas')
    expect(weekGoalsLabel(3, 3)).toMatch(/feitas/)
  })
  it('isReviewTime is Fri–Sun', () => {
    expect(isReviewTime('2026-10-02')).toBe(true) // sex
    expect(isReviewTime('2026-10-04')).toBe(true) // dom
    expect(isReviewTime('2026-10-05')).toBe(false) // seg
  })
})

describe('Luna due logic', () => {
  const bath = pet({ title: 'Banho', category: 'banho', recurrence: { kind: 'every_n_days', days: 15, anchor: '2026-09-01', fromLastDone: true } })

  it('every_n_days fromLastDone: due when never done after anchor', () => {
    const s = petTaskState(db({ petTasks: [bath] }), bath, TODAY)
    expect(s.dueToday).toBe(true)
    expect(s.detail).toBe('a cada 15 dias · próximo: hoje')
  })

  it('done 5 days ago → not due, next label in 10 days', () => {
    const d = db({ petTasks: [bath], occurrences: [occ('petTask', bath.id, '2026-09-27')] })
    const s = petTaskState(d, bath, TODAY)
    expect(s.dueToday).toBe(false)
    expect(s.next).toBe('2026-10-12')
    expect(s.detail).toBe('a cada 15 dias · próximo: seg, 12/10')
    expect(lunaToday(d, TODAY)).toHaveLength(0)
  })

  it('done today → stays on Hoje (checked), next counts from today', () => {
    const d = db({ petTasks: [bath], occurrences: [occ('petTask', bath.id, '2026-09-10'), occ('petTask', bath.id, TODAY)] })
    const s = petTaskState(d, bath, TODAY)
    expect(s.doneToday).toBe(true)
    expect(s.dueToday).toBe(true)
    expect(s.next).toBe('2026-10-17')
    expect(lunaToday(d, TODAY).map((x) => x.task.id)).toEqual([bath.id])
    expect(lunaPendingToday(d, TODAY)).toBe(0)
  })

  it('daily walk: due every day, no "próximo" noise', () => {
    const walk = pet({ title: 'Passeio', category: 'passeio', recurrence: { kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] } })
    const s = petTaskState(db({ petTasks: [walk] }), walk, TODAY)
    expect(s.dueToday).toBe(true)
    expect(s.detail).toBe('todo dia')
  })

  it('one-off: due on/after its date, done = inactive, undated never due', () => {
    const vac = pet({ title: 'Vacina', dueDate: '2026-09-30' })
    const later = pet({ title: 'Hotel', dueDate: '2026-10-20' })
    const reminder = pet({ title: 'Check-up' })
    const doneOne = pet({ title: 'Feito', dueDate: '2026-09-30', active: false })
    const d = db({ petTasks: [vac, later, reminder, doneOne] })
    expect(lunaToday(d, TODAY).map((x) => x.task.title)).toEqual(['Vacina'])
    expect(petTaskState(d, vac, TODAY).detail).toBe('ficou de 30/09')
    expect(petTaskState(d, reminder, TODAY).detail).toMatch(/quando der/)
  })

  it('paused recurring tasks are not due', () => {
    const paused = { ...bath, id: 'paused', active: false }
    expect(lunaToday(db({ petTasks: [paused] }), TODAY)).toHaveLength(0)
  })

  it('sums only this month Luna expenses', () => {
    const e = (amountCents: number, date: string, categoryId = 'cat-luna') => ({
      ...base(),
      title: 'x',
      amountCents,
      date,
      categoryId,
      status: 'paid' as const,
      origin: 'manual' as const,
    })
    const d = db({ expenses: [e(5000, '2026-10-01'), e(2000, TODAY), e(9999, '2026-09-30'), e(700, TODAY, 'cat-mercado')] })
    const r = lunaExpensesThisMonth(d, TODAY)
    expect(r.total).toBe(7000)
    expect(r.list).toHaveLength(2)
  })
})

describe('Vida real grouping', () => {
  it('groups by state and date/bucket', () => {
    const tasks = [
      task({ title: 'hoje-bucket', bucket: 'hoje' }),
      task({ title: 'hoje-date', date: '2026-09-28', bucket: 'algum_dia' }),
      task({ title: 'semana-date', dueDate: '2026-10-04' }),
      task({ title: 'semana-bucket', bucket: 'semana' }),
      task({ title: 'algum', bucket: 'algum_dia' }),
      task({ title: 'next-week', date: '2026-10-07' }),
      task({ title: 'wait', status: 'waiting', waiting: { who: 'mecânico', since: TODAY } }),
      task({ title: 'rev', status: 'review', bucket: 'semana' }),
      task({ title: 'old-done', status: 'done', completedAt: '2026-09-01T12:00:00.000Z' }),
      task({ title: 'done-now', status: 'done', completedAt: NOW }),
      task({ title: 'other-context', context: 'trabalho', bucket: 'hoje' }),
      task({ title: 'archived', status: 'archived' }),
    ]
    const g = groupLifeAdmin(db({ tasks }), TODAY)
    const titles = (k: keyof typeof g) => g[k].map((x) => x.task.title).sort()
    expect(titles('hoje')).toEqual(['done-now', 'hoje-bucket', 'hoje-date'])
    expect(titles('semana')).toEqual(['semana-bucket', 'semana-date'])
    expect(titles('algum_dia')).toEqual(['algum', 'next-week'])
    expect(titles('waiting')).toEqual(['wait'])
    expect(titles('review')).toEqual(['rev'])
    expect(g.waiting[0].detail).toBe('com mecânico')
    // done items sort last and don't count
    expect(g.hoje[g.hoje.length - 1].task.title).toBe('done-now')
    expect(lifeAdminCounts(db({ tasks }), TODAY)).toEqual({ hoje: 2, semana: 4, review: 1 })
  })

  it('filters by category (missing category = outros)', () => {
    const tasks = [task({ title: 'a', lifeAdminCategory: 'carro' }), task({ title: 'b' })]
    expect(groupLifeAdmin(db({ tasks }), TODAY, 'carro').semana).toHaveLength(0)
    const all = Object.values(groupLifeAdmin(db({ tasks }), TODAY, 'outros')).flat()
    expect(all.map((x) => x.task.title)).toEqual(['b'])
  })

  it('recurring maintenance: next date + done today', () => {
    const filter = task({
      title: 'Trocar filtro',
      lifeAdminCategory: 'manutencao',
      recurrence: { kind: 'every_n_days', days: 90, anchor: '2026-08-01', fromLastDone: true },
    })
    const monthly = task({ title: 'Conta de luz', recurrence: { kind: 'monthly', dayOfMonth: 20 } })
    let d = db({ tasks: [filter, monthly], occurrences: [occ('task', filter.id, '2026-09-01')] })
    let g = groupLifeAdmin(d, TODAY)
    expect(g.algum_dia.map((x) => x.task.title).sort()).toEqual(['Conta de luz', 'Trocar filtro'])
    expect(g.algum_dia.find((x) => x.task.id === filter.id)!.detail).toBe('a cada 90 dias · próximo: seg, 30/11')
    // due today when last done > 90 days ago; checked today stays in "hoje"
    d = db({ tasks: [filter], occurrences: [occ('task', filter.id, '2026-06-01')] })
    expect(groupLifeAdmin(d, TODAY).hoje).toHaveLength(1)
    d = db({ tasks: [filter], occurrences: [occ('task', filter.id, '2026-06-01'), occ('task', filter.id, TODAY)] })
    g = groupLifeAdmin(d, TODAY)
    expect(g.hoje[0].doneToday).toBe(true)
    expect(g.hoje[0].next).toBe(addDays(TODAY, 90))
  })

  it('week goals summary uses this week Monday and ignores soltas', () => {
    const goal = (status: 'ativa' | 'feita' | 'solta', period = '2026-09-28') => ({
      ...base(),
      level: 'semana' as const,
      title: status,
      category: 'pessoal' as const,
      period,
      big: false,
      status,
      order: 0,
    })
    const d = db({ goals: [goal('ativa'), goal('feita'), goal('solta'), goal('ativa', '2026-09-21')] })
    const s = weekGoalsSummary(d, TODAY)
    expect([s.done, s.total]).toEqual([1, 2])
  })
})

describe('seed', () => {
  it('creates Luna, her care rules and vida real examples without money or appointments', () => {
    const ctx = createSeedContext(TODAY)
    const part = seedLife(ctx)
    expect(part.pets?.[0]).toMatchObject({ id: SEED_IDS.petLuna, name: 'Luna', breed: 'Border Collie' })
    expect(part.petTasks).toHaveLength(5)
    expect(part.petTasks!.every((t) => t.petId === SEED_IDS.petLuna)).toBe(true)
    const racao = part.petTasks!.find((t) => t.title.startsWith('Ração'))!
    expect(racao.recurrence).toEqual({ kind: 'every_n_days', days: 30, anchor: TODAY, fromLastDone: true })
    const vet = part.petTasks!.find((t) => t.category === 'veterinario')!
    expect(vet.recurrence).toBeUndefined()
    expect(vet.dueDate).toBeUndefined()
    expect(part.tasks!.every((t) => t.context === 'vida_real')).toBe(true)
    expect(part.tasks!.filter((t) => t.tripId === SEED_IDS.tripAfrica)).toHaveLength(2)
    expect(part.tasks!.filter((t) => t.status === 'review').length).toBeGreaterThanOrEqual(4)
    expect(Object.keys(part).sort()).toEqual(['petTasks', 'pets', 'tasks'])

    // First open is calm: just the walk + ração due today.
    const d = db({ pets: part.pets, petTasks: part.petTasks, tasks: part.tasks })
    expect(lunaToday(d, TODAY).map((s) => s.task.category).sort()).toEqual(['alimentacao', 'passeio'])
  })
})
