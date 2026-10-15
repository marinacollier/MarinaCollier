import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import { dayItems, type ActionItem } from '@/data/agenda/items'
import { overrideFor } from '@/data/timeline'
import { AGORA_MAX, areaOf, homeLists, rowView } from './rows'
import { editSpec } from './edit'

const TODAY = '2026-10-02'
const item = (p: Partial<ActionItem>): ActionItem => ({ key: p.title ?? 'x', source: 'task', refType: 'task', refId: 'x', date: TODAY, title: 'x', front: { label: '', group: 'vida' }, status: 'pending', check: 'toggle', important: false, ...p })

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(TODAY))
})

describe('Home rows', () => {
  it('maps fronts to one area tag', () => {
    expect(areaOf(item({ front: { label: 'TREINO', group: 'corpo' } }))).toBe('corpo')
    expect(areaOf(item({ front: { label: 'SANTANDER', group: 'trabalho' } }))).toBe('trabalho')
    expect(areaOf(item({ front: { label: 'UGC', group: 'trabalho' } }))).toBe('creator')
    expect(areaOf(item({ front: { label: 'VIAGEM · SOUTH AFRICA', group: 'vida' } }))).toBe('viagem')
    expect(areaOf(item({ front: { label: 'BÍBLIA', group: 'vida' } }))).toBe('fe')
  })

  it('Agora holds max 3 (now, soon, latest overdue) and never repeats them in Hoje; done goes to Feitos', () => {
    const list = [
      item({ key: 'a', title: 'a', start: '09:50', end: '10:30' }),
      item({ key: 'b', title: 'b', start: '10:30' }),
      item({ key: 'c', title: 'c', start: '08:00', check: 'workout' }),
      item({ key: 'd', title: 'd', start: '07:00' }),
      item({ key: 'e', title: 'e', start: '18:00' }),
      item({ key: 'f', title: 'f' }),
      item({ key: 'g', title: 'g', status: 'done' }),
    ]
    const l = homeLists(list, 600)
    expect(l.agora.map((i) => i.key)).toEqual(['a', 'b', 'c'])
    expect(l.agora.length).toBeLessThanOrEqual(AGORA_MAX)
    expect(l.hoje.map((i) => i.key)).toEqual(['d', 'e', 'f'])
    expect(l.done.map((i) => i.key)).toEqual(['g'])
  })

  it('says overdue and carried in one fact', () => {
    const v = rowView(getDB(), item({ start: '08:00' }), TODAY, 600)
    expect(v).toMatchObject({ meta: 'passou das 08:00', late: true })
    expect(rowView(getDB(), item({ carried: true, sub: 'atrasado desde 30/09' }), TODAY, 600).meta).toBe('atrasado desde 30/09')
  })
})

describe('Quick edit (Dia · Hora · Obs)', () => {
  it('a one-off task: day, time and notes change the record, each undoable', () => {
    const t = actions.create('tasks', { title: 'Ligar banco', status: 'todo', date: TODAY, order: 0 })
    const it = dayItems(getDB(), TODAY, TODAY).find((i) => i.refId === t.id)!
    const spec = editSpec(getDB(), it)
    const undoDay = spec.day!.set('2026-10-03')
    expect(getDB().tasks.find((x) => x.id === t.id)?.date).toBe('2026-10-03')
    undoDay()
    expect(getDB().tasks.find((x) => x.id === t.id)?.date).toBe(TODAY)
    spec.time!.set('always', '15:00', '15:30')
    expect(getDB().tasks.find((x) => x.id === t.id)).toMatchObject({ time: '15:00', durationMin: 30 })
    const undoNotes = spec.notes!.set('levar RG')
    expect(getDB().tasks.find((x) => x.id === t.id)?.notes).toBe('levar RG')
    undoNotes()
    expect(getDB().tasks.find((x) => x.id === t.id)?.notes).toBeUndefined()
  })

  it('a routine: "só hoje" is a per-day override, "sempre" changes the default', () => {
    const r = dayItems(getDB(), TODAY, TODAY).find((i) => i.check === 'routine' && i.start)
    if (!r) return
    const spec = editSpec(getDB(), r)
    expect(spec.time!.scopes).toEqual(['today', 'always'])
    expect(spec.day).toBeUndefined()
    const first = r.children!.find((c) => c.start === r.start)!
    const undo = spec.time!.set('today', '03:30')
    expect(overrideFor(getDB(), TODAY, 'routineItem', first.refId)?.time).toBe('03:30')
    undo()
    expect(overrideFor(getDB(), TODAY, 'routineItem', first.refId)).toBeUndefined()
    spec.time!.set('always', '03:30')
    expect(getDB().routineItems.find((i) => i.id === first.refId)?.time).toBe('03:30')
    expect(overrideFor(getDB(), TODAY, 'routineItem', first.refId)).toBeUndefined()
  })
})
