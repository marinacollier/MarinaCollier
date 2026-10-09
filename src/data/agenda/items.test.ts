/** The Home's operational queue: every front shows up, once, from its own record; ticks persist. */
import { beforeEach, describe, expect, it } from 'vitest'
import { buildSeed } from '../seed'
import { SEED_IDS } from '../seed/ids'
import { actions, detachStorage, flushNow, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { addDays } from '@/lib/date'
import { dayItems, todaySections, undatedItems, upcomingDays } from './items'
import { checkItem } from '@/features/today/home/act'

const MON = '2026-10-12'
let device: ReturnType<typeof createMemoryAdapter>

beforeEach(async () => {
  detachStorage()
  device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(buildSeed(MON))
  const t = (title: string, extra: object) => actions.create('tasks', { title, status: 'todo', date: MON, order: 1, ...extra })
  t('Responder documentação X', { projectId: SEED_IDS.projSantander, context: 'trabalho' })
  t('Revisar Y', { projectId: SEED_IDS.projFashionFinder, context: 'trabalho', time: '11:00' })
  t('Atualizar LinkedIn', { context: 'carreira' })
  t('Testar prompt de IA', { projectId: SEED_IDS.projDayOne, context: 'trabalho' })
  t('Comprar ração da Luna', { context: 'vida_real', lifeAdminCategory: 'luna' })
  t('Confirmar hotel', { context: 'viagem', tripId: SEED_IDS.tripAfrica })
  t('Estudar capítulo 3', { context: 'estudo' })
  actions.create('tasks', { title: 'Organizar documentos', status: 'todo', order: 9 }) // no day at all
})

const keys = (d = MON) => dayItems(getDB(), d, MON).map((i) => i.key)

describe('Home projection (ActionItem)', () => {
  it('every front appears, labelled by where it comes from', () => {
    const items = dayItems(getDB(), MON, MON)
    const label = (title: string) => items.find((i) => i.title === title)?.front.label
    expect(label('Responder documentação X')).toBe('SANTANDER')
    expect(label('Revisar Y')).toBe('FASHIONFINDER')
    expect(label('Atualizar LinkedIn')).toBe('CARREIRA')
    expect(label('Testar prompt de IA')).toMatch(/DAY ONE/)
    expect(label('Comprar ração da Luna')).toBe('LUNA')
    expect(label('Confirmar hotel')).toMatch(/^VIAGEM/)
    expect(label('Estudar capítulo 3')).toBe('ESTUDO')
    // Training, routine, nutrition and calendar come from their own records.
    expect(items.some((i) => i.refType === 'workout' && i.front.label === 'TREINO')).toBe(true)
    expect(items.some((i) => i.refType === 'routine' && i.children!.length > 1)).toBe(true)
    expect(items.some((i) => i.front.label === 'NUTRIÇÃO' && i.check === 'meal')).toBe(true)
  })

  it('nothing is duplicated and nothing is turned into a Task', () => {
    const before = getDB().tasks.length
    const k = keys()
    expect(new Set(k).size).toBe(k.length)
    expect(getDB().tasks.length).toBe(before)
    // A training is projected, never a "Fazer natação" task.
    expect(dayItems(getDB(), MON, MON).filter((i) => /nata/i.test(i.title)).map((i) => i.refType)).toEqual(['workout'])
  })

  it('timed items are chronological; untimed go to "quando der hoje" without an invented time', () => {
    const s = todaySections(dayItems(getDB(), MON, MON), 10 * 60)
    const times = s.later.map((i) => i.start!)
    expect([...times].sort()).toEqual(times)
    const anytime = s.anytime.find((i) => i.title === 'Atualizar LinkedIn')!
    expect(anytime.start).toBeUndefined()
  })

  it('each tickable kind is checked from Home and stays checked after reopening the app', async () => {
    const items = dayItems(getDB(), MON, MON)
    const pick = (f: (i: (typeof items)[number]) => boolean) => items.find(f)!
    const task = pick((i) => i.title === 'Responder documentação X')
    const workout = pick((i) => i.check === 'workout')
    const meal = pick((i) => i.check === 'meal')
    const routine = pick((i) => i.check === 'routine')
    const luna = pick((i) => i.refType === 'petTask')
    for (const i of [task, workout, meal, routine, luna]) expect(checkItem(i), i.title).toBe(true)
    await flushNow()
    await hydrate(device)
    const after = new Map(dayItems(getDB(), MON, MON).map((i) => [i.key, i.status]))
    for (const i of [task, workout, meal, routine, luna]) expect(after.get(i.key), i.title).toBe('done')
    expect(todaySections(dayItems(getDB(), MON, MON), 600).done.length).toBeGreaterThanOrEqual(5)
  })

  it('everything that can be ticked has a check — events too ("fui / feito"); only work hours do not', () => {
    for (const d of [MON, addDays(MON, 1), addDays(MON, 2), addDays(MON, 3), addDays(MON, 4)])
      for (const i of dayItems(getDB(), d, MON)) expect(i.check, i.title).not.toBe('none')
  })

  it('próximos: the next days with counts and highlights; undated to-dos are still findable', () => {
    const days = upcomingDays(getDB(), MON, 6)
    expect(days.map((d) => d.date)).toEqual([1, 2, 3, 4, 5, 6].map((n) => addDays(MON, n)))
    expect(days.every((d) => d.highlights.length <= 3)).toBe(true)
    expect(days.find((d) => d.date === addDays(MON, 6))!.items.some((i) => i.refType === 'workout')).toBe(true)
    expect(undatedItems(getDB(), MON).map((i) => i.title)).toContain('Organizar documentos')
  })

  it('moving a task to tomorrow takes it out of today and puts it on tomorrow', () => {
    const t = getDB().tasks.find((x) => x.title === 'Atualizar LinkedIn')!
    actions.update('tasks', t.id, { date: addDays(MON, 1) })
    expect(keys()).not.toContain(`task:${t.id}`)
    expect(keys(addDays(MON, 1))).toContain(`task:${t.id}`)
  })
})
