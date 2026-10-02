import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { createSeedContext } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import type { CalendarEvent, DB, Occurrence, PetTask, Task } from '@/data/types'
import {
  adminKindOf,
  creativeThisWeek,
  groupLifeAdmin,
  hubOrder,
  isLunaOutOfRoutine,
  lifeCategoryCounts,
  lifeKindCounts,
  lifeTaskDefaults,
  lunaAreas,
  lunaPendingToday,
  lunaToday,
  lunaTodaySplit,
  outOfRoutinePlan,
  petTaskState,
  vidaPriorities,
} from './selectors'
import { seedLife } from './seed'

// 2026-10-02 is a Friday.
const TODAY = '2026-10-02'
const NOW = '2026-10-02T12:00:00.000Z'
let n = 0
const base = () => ({ id: `id-${n++}`, createdAt: NOW, updatedAt: NOW })
const pet = (data: Partial<PetTask>): PetTask => ({
  ...base(),
  petId: SEED_IDS.petLuna,
  title: 'x',
  category: 'lembrete',
  active: true,
  order: 0,
  ...data,
})
const task = (data: Partial<Task>): Task => ({ ...base(), title: 't', status: 'todo', context: 'vida_real', order: 0, ...data })
const occ = (parentId: string, date: string, status: Occurrence['status'] = 'done'): Occurrence => ({
  ...base(),
  parentType: 'petTask',
  parentId,
  date,
  status,
})
const db = (patch: Partial<DB>): DB => ({ ...emptyDB(), ...patch })

/** Apply outOfRoutinePlan to a plain DB (mirrors ops.setLunaOutOfRoutine). */
function applyOut(d: DB, date: string, on: boolean): DB {
  const plan = outOfRoutinePlan(d, date, on)
  return {
    ...d,
    occurrences: [
      ...d.occurrences.filter((o) => !plan.remove.includes(o.id)),
      ...plan.create.map((parentId) => occ(parentId, date, 'skipped')),
    ],
  }
}

describe('Luna seed (§32)', () => {
  const part = seedLife(createSeedContext(TODAY))
  const tasks = part.petTasks!

  it('has stable ids, Luna profile and no invented intervals or dates', () => {
    expect(part.pets?.[0]).toMatchObject({ id: SEED_IDS.petLuna, name: 'Luna', breed: 'Border Collie' })
    expect(tasks.every((t) => t.id.startsWith('seed:luna:'))).toBe(true)
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length)
    expect(tasks.some((t) => t.dueDate)).toBe(false)
    expect(tasks.some((t) => t.recurrence && t.recurrence.kind !== 'daily')).toBe(false)
    expect(tasks.some((t) => t.category === 'medicacao')).toBe(false)
    expect(Object.keys(part).sort()).toEqual(['petTasks', 'pets'])
  })

  it('3 flexible daily routines + 6 area slots', () => {
    const routines = tasks.filter((t) => t.recurrence)
    expect(routines.map((t) => t.title)).toEqual(['Passeio manhã', 'Passeio fim do dia', 'Alimentação'])
    const slots = tasks.filter((t) => !t.recurrence)
    expect(slots.map((t) => t.title)).toEqual(['Ração', 'Creche/hotel', 'Banho', 'Veterinário', 'Compras', 'Documentos'])
    expect(slots.every((t) => t.active)).toBe(true)
  })

  it('first open: only gentle routines on "hoje", nothing pending, all slots in Áreas', () => {
    const d = db({ pets: part.pets, petTasks: tasks })
    const split = lunaTodaySplit(d, TODAY)
    expect(split.routines).toHaveLength(3)
    expect(split.due).toHaveLength(0)
    expect(lunaPendingToday(d, TODAY)).toBe(0)
    expect(lunaAreas(d, TODAY).map((s) => s.task.title)).toEqual(['Ração', 'Creche/hotel', 'Banho', 'Veterinário', 'Compras', 'Documentos'])
  })
})

describe('Luna flexible routines', () => {
  const walk = pet({ title: 'Passeio manhã', category: 'passeio', recurrence: { kind: 'daily' }, order: 0 })
  const food = pet({ title: 'Alimentação', category: 'alimentacao', recurrence: { kind: 'daily' }, order: 1 })

  it('never nag: not counted as pending, no "feito há X dias", no "próximo"', () => {
    const d = db({ petTasks: [walk, food], occurrences: [occ(walk.id, '2026-09-20')] })
    expect(lunaPendingToday(d, TODAY)).toBe(0)
    const s = petTaskState(d, walk, TODAY)
    expect(s.flexible).toBe(true)
    expect(s.detail).toBe('todo dia')
    // yesterday not ticked → still just "today", nothing carried over
    expect(lunaToday(d, TODAY).every((x) => x.flexible && !x.doneToday)).toBe(true)
  })

  it('a dated one-off that came due does count', () => {
    const vet = pet({ title: 'Vet', category: 'veterinario', dueDate: TODAY })
    const d = db({ petTasks: [walk, vet] })
    expect(lunaPendingToday(d, TODAY)).toBe(1)
    expect(lunaTodaySplit(d, TODAY).due.map((s) => s.task.title)).toEqual(['Vet'])
  })

  it('one-offs without a date are never due today', () => {
    const slot = pet({ title: 'Banho', category: 'banho' })
    const d = db({ petTasks: [slot] })
    expect(petTaskState(d, slot, TODAY).dueToday).toBe(false)
    expect(lunaToday(d, TODAY)).toHaveLength(0)
    expect(petTaskState(d, slot, TODAY).detail).toMatch(/quando quiser/)
  })

  it('fora da rotina: skips leave "hoje" without counting as missed or done; reversible', () => {
    let d = db({ petTasks: [walk, food], occurrences: [occ(food.id, TODAY)] })
    expect(isLunaOutOfRoutine(d, TODAY)).toBe(false)
    d = applyOut(d, TODAY, true)
    // food was already done → untouched; walk skipped
    expect(d.occurrences.filter((o) => o.status === 'skipped').map((o) => o.parentId)).toEqual([walk.id])
    expect(isLunaOutOfRoutine(d, TODAY)).toBe(true)
    const w = petTaskState(d, walk, TODAY)
    expect(w.skippedToday).toBe(true)
    expect(w.doneToday).toBe(false)
    expect(w.dueToday).toBe(false)
    expect(lunaToday(d, TODAY).map((s) => s.task.id)).toEqual([food.id])
    // tomorrow is a normal day
    expect(petTaskState(d, walk, '2026-10-03').dueToday).toBe(true)
    // toggling off removes only skips
    d = applyOut(d, TODAY, false)
    expect(d.occurrences.map((o) => o.status)).toEqual(['done'])
    expect(isLunaOutOfRoutine(d, TODAY)).toBe(false)
  })

  it('weekly routines only skip on the days they happen; paused ones are ignored', () => {
    const sat = pet({ title: 'Trilha', category: 'passeio', recurrence: { kind: 'weekly', weekdays: [6] } })
    const paused = pet({ title: 'Pausado', recurrence: { kind: 'daily' }, active: false })
    expect(outOfRoutinePlan(db({ petTasks: [sat, paused] }), TODAY, true).create).toEqual([])
  })
})

describe('Vida real categories + kinds (§33)', () => {
  const tasks = [
    task({ title: 'trocar câmara', lifeAdminCategory: 'bike', adminKind: 'manutencao' }),
    task({ title: 'parafina', lifeAdminCategory: 'surf', adminKind: 'comprar' }),
    task({ title: 'renovar CNH', lifeAdminCategory: 'documentos', adminKind: 'resolver' }),
    task({ title: 'orçamento do mecânico', lifeAdminCategory: 'carro', adminKind: 'manutencao', status: 'waiting', waiting: { who: 'mecânico', since: TODAY } }),
    task({ title: 'legacy compras', lifeAdminCategory: 'compras' }),
    task({ title: 'untyped casa', lifeAdminCategory: 'casa' }),
  ]
  const d = db({ tasks })

  it('kind: waiting status wins, legacy categories map, default is resolver', () => {
    expect(tasks.map(adminKindOf)).toEqual(['manutencao', 'comprar', 'resolver', 'waiting', 'comprar', 'resolver'])
  })

  it('filters by category and kind together', () => {
    const titles = (f: Parameters<typeof groupLifeAdmin>[2]) =>
      Object.values(groupLifeAdmin(d, TODAY, f))
        .flat()
        .map((x) => x.task.title)
        .sort()
    expect(titles({ kind: 'manutencao' })).toEqual(['trocar câmara'])
    expect(titles({ kind: 'waiting' })).toEqual(['orçamento do mecânico'])
    expect(titles({ kind: 'comprar' })).toEqual(['legacy compras', 'parafina'])
    expect(titles({ category: 'carro', kind: 'waiting' })).toEqual(['orçamento do mecânico'])
    expect(titles({ category: 'carro', kind: 'manutencao' })).toEqual([])
    expect(titles({ category: 'outros' })).toEqual(['legacy compras'])
  })

  it('counts per category and per kind', () => {
    expect(lifeCategoryCounts(d, TODAY)).toEqual({ bike: 1, surf: 1, documentos: 1, carro: 1, outros: 1, casa: 1 })
    expect(lifeKindCounts(d, TODAY, 'carro')).toEqual({ manutencao: 0, comprar: 0, resolver: 0, waiting: 1 })
  })

  it('quick-add defaults per kind', () => {
    expect(lifeTaskDefaults('surf', 'comprar', TODAY)).toMatchObject({ context: 'vida_real', lifeAdminCategory: 'surf', adminKind: 'comprar' })
    expect(lifeTaskDefaults('carro', 'waiting', TODAY)).toMatchObject({ status: 'waiting', waiting: { who: '', since: TODAY } })
    expect(lifeTaskDefaults(undefined, undefined, TODAY).lifeAdminCategory).toBe('outros')
  })
})

describe('Vida hub', () => {
  it('weekend leads with activity, review and travel; chores come last', () => {
    for (const day of ['2026-10-03', '2026-10-04']) {
      const o = hubOrder(day)
      expect(o.indexOf('weekend')).toBe(1)
      expect(o.indexOf('week')).toBeLessThan(o.indexOf('home'))
      expect(o.indexOf('world')).toBeLessThan(o.indexOf('home'))
      expect(o.indexOf('world')).toBeLessThan(o.indexOf('self'))
    }
    expect(hubOrder(TODAY)).not.toContain('weekend')
  })

  it('"Montar minha semana" comes right after capture on Sunday and Monday', () => {
    expect(hubOrder('2026-10-05')[1]).toBe('plan') // seg
    expect(hubOrder('2026-10-01').indexOf('plan')).toBeGreaterThan(2) // qui
  })

  it('Top 3 Vida reads only domain "vida" of today, max 3', () => {
    const p = (title: string, domain?: 'vida' | 'trabalho', date = TODAY, order = 0) => ({ ...base(), title, domain, date, order, done: false })
    const d = db({
      priorities: [p('main'), p('work', 'trabalho'), p('v1', 'vida', TODAY, 1), p('v0', 'vida'), p('old', 'vida', '2026-10-01'), p('v2', 'vida', TODAY, 2), p('v3', 'vida', TODAY, 3)],
    })
    expect(vidaPriorities(d, TODAY).map((x) => x.title)).toEqual(['v0', 'v1', 'v2'])
  })

  it('creativity events by kind/category, with week-only cancellations kept visible', () => {
    const ev = (data: Partial<CalendarEvent>): CalendarEvent => ({ ...base(), sourceId: 'cal-local', title: 'Ateliê', date: '2026-09-07', allDay: false, ...data })
    const weekly = ev({ kind: 'criatividade', period: 'noite', recurrence: { kind: 'weekly', weekdays: [1, 4] }, exdates: ['2026-10-08'] })
    const byCategory = ev({ title: 'Oficina', category: 'Vida / Criatividade', date: '2026-10-03', startTime: '10:00' })
    const other = ev({ title: 'Reunião', kind: 'trabalho', date: '2026-10-05' })
    const slots = creativeThisWeek(db({ events: [weekly, byCategory, other] }), TODAY)
    expect(slots.map((s) => [s.event.title, s.date, s.cancelled])).toEqual([
      ['Oficina', '2026-10-03', false],
      ['Ateliê', '2026-10-05', false],
      ['Ateliê', '2026-10-08', true],
    ])
    expect(slots[1].when).toBe('seg, 05/10 · noite')
    expect(slots[0].recurring).toBe(false)
  })
})
