import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from './store'
import { createMemoryAdapter } from './storage'
import { buildSeed } from './seed'
import { seedId } from './seed/context'
import { SEED_IDS } from './seed/ids'
import {
  applyOpsToDB,
  cancelOn,
  clearOverride,
  effectiveTime,
  moveAfter,
  planSetDefault,
  planSetTime,
  reorderDay,
  replanFrom,
  setAnytimeOn,
  setTimeOn,
  shiftRoutine,
  upsertOverride,
} from './schedule'
import { dayTimeline } from './timeline'

const FRIDAY = '2026-10-02'
const SATURDAY = '2026-10-03'
const mid = (slug: string) => seedId('today', `milagre-${slug}`)
const item = (slug: string) => ({ type: 'routineItem' as const, id: mid(slug) })
const start = (ref: { type: never; id: string } | ReturnType<typeof item>, date = FRIDAY) => effectiveTime(getDB(), date, ref)?.start
const workoutRef = () => ({ type: 'workout' as const, id: getDB().workouts.find((w) => w.date === FRIDAY)!.id })

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(FRIDAY))
})

describe('per-day overrides', () => {
  it('setTimeOn changes only that day and is undoable', () => {
    const undo = setTimeOn(FRIDAY, item('leitura'), '20:00')
    expect(start(item('leitura'))).toBe('20:00')
    expect(start(item('leitura'), SATURDAY)).toBe('05:10')
    expect(getDB().routineItems.find((i) => i.id === mid('leitura'))?.time).toBeUndefined() // default untouched
    undo()
    expect(start(item('leitura'))).toBe('05:10')
    expect(getDB().scheduleOverrides).toHaveLength(0)
  })

  it('upsert keeps one override per (date, ref); undo restores the previous value', () => {
    upsertOverride(FRIDAY, item('leitura'), { time: '06:00' })
    const undo = upsertOverride(FRIDAY, item('leitura'), { time: '06:30' }, 'lumos')
    expect(getDB().scheduleOverrides).toHaveLength(1)
    expect(getDB().scheduleOverrides[0]).toMatchObject({ time: '06:30', by: 'lumos' })
    undo()
    expect(getDB().scheduleOverrides[0]).toMatchObject({ time: '06:00', by: 'marina' })
    const undoClear = clearOverride(FRIDAY, item('leitura'))
    expect(getDB().scheduleOverrides).toHaveLength(0)
    undoClear()
    expect(getDB().scheduleOverrides).toHaveLength(1)
  })

  it('anytime for one day', () => {
    setAnytimeOn(FRIDAY, item('meditacao'))
    expect(effectiveTime(getDB(), FRIDAY, item('meditacao'))?.source).toBe('anytime')
  })

  it('a dated workout gets its own time (other screens read it directly)', () => {
    const ops = planSetTime(getDB(), FRIDAY, workoutRef(), '07:30')
    expect(ops[0]).toMatchObject({ op: 'update', collection: 'workouts', patch: { time: '07:30' } })
  })

  it('"mudar o padrão também" edits the default and drops the day override', () => {
    upsertOverride(FRIDAY, item('leitura'), { time: '06:00' })
    const ops = planSetDefault(getDB(), FRIDAY, item('leitura'), '05:15')
    const next = applyOpsToDB(getDB(), ops)
    expect(next.routineItems.find((i) => i.id === mid('leitura'))).toMatchObject({ time: '05:15', timeMode: 'fixed' })
    expect(next.scheduleOverrides).toHaveLength(0)
    expect(effectiveTime(next, SATURDAY, item('leitura'))?.start).toBe('05:15')
  })
})

describe('smart moves', () => {
  it('moveAfter: "joga a leitura pra depois do treino"', () => {
    const p = moveAfter(getDB(), FRIDAY, item('leitura'), workoutRef())
    expect(p.summary).toContain('07:00')
    const undo = p.apply()
    expect(start(item('leitura'))).toBe('07:00')
    undo()
    expect(start(item('leitura'))).toBe('05:10')
  })

  it('reorderDay: dragging Leitura to after the training gives it the training end', () => {
    const keys = dayTimeline(getDB(), FRIDAY, { includeAnytime: false }).map((e) => e.key)
    const lk = `routineItem:${mid('leitura')}`
    const wk = `workout:${workoutRef().id}`
    const without = keys.filter((k) => k !== lk)
    const order = [...without.slice(0, without.indexOf(wk) + 1), lk, ...without.slice(without.indexOf(wk) + 1)]
    const p = reorderDay(getDB(), FRIDAY, order)
    expect(p.ops).toHaveLength(1)
    p.apply()
    expect(start(item('leitura'))).toBe('07:00')
    expect(start(workoutRef() as never)).toBe('06:00') // anchors never move
  })

  it('shiftRoutine: "amanhã quero acordar 5h30" slides the morning', () => {
    shiftRoutine(getDB(), SATURDAY, SEED_IDS.routineMorning, '05:30').apply()
    expect(start(item('despertar'), SATURDAY)).toBe('05:30')
    expect(start(item('higiene'), SATURDAY)).toBe('05:45')
    expect(start(item('despertar'))).toBe('04:40')
  })

  it('cancelOn a training also cancels the prep that depends on it, and frees the slot', () => {
    actions.update('routineItems', mid('preparar-o-dia'), { dependsOn: ['workout'] })
    const p = cancelOn(getDB(), FRIDAY, workoutRef(), 'lumos', 'cancelei')
    expect(p.cancelled).toHaveLength(2)
    expect(p.freed).toEqual({ start: '06:00', end: '07:00' })
    const undo = p.apply()
    expect(getDB().workouts.find((w) => w.id === workoutRef().id)?.status).toBe('pulado')
    expect(effectiveTime(getDB(), FRIDAY, item('preparar-o-dia'))?.status).toBe('cancelled')
    undo()
    expect(getDB().workouts.find((w) => w.id === workoutRef().id)?.status).toBe('planejado')
    expect(getDB().scheduleOverrides).toHaveLength(0)
  })

  it('cancelOn a recurring event uses exdates (only that day)', () => {
    const ev = getDB().events.find((e) => e.recurrence && e.startTime === '12:00')!
    const undo = cancelOn(getDB(), FRIDAY, { type: 'event', id: ev.id }).apply()
    expect(getDB().events.find((e) => e.id === ev.id)?.exdates).toEqual([FRIDAY])
    undo()
    expect(getDB().events.find((e) => e.id === ev.id)?.exdates).toBeUndefined()
  })
})

describe('replanFrom — "acordei agora"', () => {
  it('keeps the training, packs a short morning with the late pre-treino, drops the rest', () => {
    const p = replanFrom(getDB(), FRIDAY, 5 * 60 + 12)
    expect(p.message).toBe('São 05:12. Seu treino continua às 06:00. Montei uma manhã curta pra você:')
    expect(p.lines[0].time).toBe('05:12')
    expect(p.lines.at(-1)).toMatchObject({ time: '06:00', kept: true })
    expect(p.lines.some((l) => l.title === 'Pré-treino')).toBe(true)
    const last = p.lines.filter((l) => !l.kept).at(-1)!
    expect(last.time < '06:00').toBe(true)
    expect(p.drops.length).toBeGreaterThan(0)
    expect(getDB().scheduleOverrides).toHaveLength(0) // a proposal, nothing applied yet

    const undo = p.apply()
    const tl = dayTimeline(getDB(), FRIDAY)
    const firstLine = p.lines[0]
    expect(tl.find((e) => e.key === `${firstLine.ref.type}:${firstLine.ref.id}`)?.start).toBe('05:12')
    expect(getDB().scheduleOverrides.every((o) => o.by === 'marina')).toBe(true)
    undo()
    expect(getDB().scheduleOverrides).toHaveLength(0)
  })

  it('when everything fits it just slides the rest of the routine', () => {
    const p = replanFrom(getDB(), SATURDAY, 5 * 60, { by: 'lumos' })
    expect(p.drops).toEqual([])
    expect(p.message).toContain('Reorganizei')
    expect(p.ops.every((o) => o.op !== 'override' || o.by === 'lumos')).toBe(true)
  })
})
