import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { emptyDB } from '@/data/defaults'
import { buildSeed } from '@/data/seed'
import { routineItemsFor, routineProgress } from '@/data/selectors'
import { SEED_IDS } from '@/data/seed/ids'
import { addPriority, carryToTomorrow, isCarried, MAX_PRIORITIES, prioritiesOf, setPriorityDone } from './priorities'
import { closingSummary, ensureCheckin } from './closing'

const TODAY = '2026-10-02' // sexta
const TOMORROW = '2026-10-03'

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(emptyDB())
})

describe('Top 3 priorities', () => {
  it('never holds more than 3 per day', () => {
    expect(addPriority(TODAY, 'Um').ok).toBe(true)
    expect(addPriority(TODAY, 'Dois').ok).toBe(true)
    expect(addPriority(TODAY, 'Três').ok).toBe(true)
    const fourth = addPriority(TODAY, 'Quatro')
    expect(fourth).toEqual({ ok: false, reason: 'full' })
    expect(prioritiesOf(getDB(), TODAY)).toHaveLength(MAX_PRIORITIES)
  })

  it('refuses empty and duplicate titles', () => {
    expect(addPriority(TODAY, '   ')).toEqual({ ok: false, reason: 'empty' })
    addPriority(TODAY, 'Estudar inglês')
    expect(addPriority(TODAY, 'estudar inglês ')).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('carries an open priority to tomorrow, respecting the max', () => {
    const r = addPriority(TODAY, 'Entregar revisão')
    if (!r.ok) throw new Error('should add')
    expect(carryToTomorrow(r.priority.id).ok).toBe(true)
    expect(prioritiesOf(getDB(), TOMORROW).map((p) => p.title)).toEqual(['Entregar revisão'])
    expect(isCarried(getDB(), r.priority)).toBe(true)
    // carrying again is a duplicate, not a 2nd copy
    expect(carryToTomorrow(r.priority.id)).toEqual({ ok: false, reason: 'duplicate' })

    const other = addPriority(TODAY, 'Outra')
    addPriority(TOMORROW, 'A')
    addPriority(TOMORROW, 'B')
    if (!other.ok) throw new Error('should add')
    expect(carryToTomorrow(other.priority.id)).toEqual({ ok: false, reason: 'full' })
  })

  it('checking a priority that points at a task completes the task (and back)', () => {
    const task = actions.create('tasks', { title: 'Revisão', status: 'todo', date: TODAY, order: 0 })
    const r = addPriority(TODAY, 'Revisão', { type: 'task', id: task.id })
    if (!r.ok) throw new Error('should add')
    setPriorityDone(r.priority.id, true)
    expect(getDB().tasks.find((t) => t.id === task.id)?.status).toBe('done')
    setPriorityDone(r.priority.id, false)
    expect(getDB().tasks.find((t) => t.id === task.id)?.status).toBe('todo')
  })
})

describe('routine occurrences', () => {
  it('toggling today does not touch other days', () => {
    actions.replaceDB(buildSeed(TODAY))
    const items = routineItemsFor(getDB(), SEED_IDS.routineMorning, TODAY)
    expect(items.length).toBe(8)
    actions.toggleOccurrence('routineItem', items[0].id, TODAY)
    expect(routineProgress(getDB(), SEED_IDS.routineMorning, TODAY).done).toBe(1)
    expect(routineProgress(getDB(), SEED_IDS.routineMorning, '2026-10-01').done).toBe(0)
    expect(routineProgress(getDB(), SEED_IDS.routineMorning, TOMORROW).done).toBe(0)
  })

  it('"Preparar coisas do dia" only shows on weekdays', () => {
    actions.replaceDB(buildSeed(TODAY))
    const titles = (d: string) => routineItemsFor(getDB(), SEED_IDS.routineMorning, d).map((i) => i.title)
    expect(titles(TODAY)).toContain('Preparar coisas do dia') // sexta
    expect(titles(TOMORROW)).not.toContain('Preparar coisas do dia') // sábado
    expect(titles(TOMORROW)).toHaveLength(7)
  })
})

describe('daily closing', () => {
  it('creates the check-in with empty habits only when missing', () => {
    const a = ensureCheckin(TODAY)
    expect(a.habits).toEqual({ agua: 0, proteina: false, fruta: false, vegetais: false, refeicoesPlanejadas: false })
    const b = ensureCheckin(TODAY)
    expect(b.id).toBe(a.id)
    expect(getDB().checkins).toHaveLength(1)
  })

  it('summarizes the day', () => {
    actions.create('tasks', { title: 'x', status: 'done', completedAt: '2026-10-02T15:00:00.000Z', order: 0 })
    actions.create('tasks', { title: 'y', status: 'todo', order: 1 })
    actions.create('workouts', { date: TODAY, modality: 'natacao', status: 'feito', order: 0 })
    actions.create('expenses', { title: 'Café', amountCents: 1250, date: TODAY, categoryId: 'cat-restaurante', status: 'paid', origin: 'manual' })
    addPriority(TODAY, 'Aberta')
    const s = closingSummary(getDB(), TODAY)
    expect(s.tasksDone).toBe(1)
    expect(s.workouts.map((w) => w.label)).toEqual(['Natação'])
    expect(s.spentCents).toBe(1250)
    expect(s.openPriorities.map((p) => p.title)).toEqual(['Aberta'])
  })
})

describe('seed', () => {
  it('has the morning routine, today’s 3 priorities and no invented appointments', () => {
    const seed = buildSeed(TODAY)
    expect(seed.routines.find((r) => r.id === SEED_IDS.routineMorning)?.name).toBe('Minha manhã')
    expect(prioritiesOf(seed, TODAY).map((p) => p.title)).toEqual(['Entregar revisão do projeto X', 'Fazer treino de natação', 'Estudar inglês'])
    const ref = prioritiesOf(seed, TODAY)[0].ref
    expect(ref && seed.tasks.some((t) => t.id === ref.id)).toBe(true)
    expect(seed.tasks.every((t) => !t.time)).toBe(true)
  })
})
