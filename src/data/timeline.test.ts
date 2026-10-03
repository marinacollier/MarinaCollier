import { describe, expect, it } from 'vitest'
import { buildSeed } from './seed'
import { seedId } from './seed/context'
import { SEED_IDS } from './seed/ids'
import type { DB, ScheduleOverride, TimelineEntry } from './types'
import { dayTimeline, findEntry, isAnytime, nowIndex, planMealRefId, routineBlocks, scheduleRoutine } from './timeline'

const FRIDAY = '2026-10-02' // corrida 06:00 in the seed, remote work
const SATURDAY = '2026-10-03'

const mid = (slug: string) => seedId('today', `milagre-${slug}`)
const at = (entries: TimelineEntry[], id: string) => findEntry(entries, { type: 'routineItem', id })

function ov(date: string, refType: ScheduleOverride['refType'], refId: string, patch: Partial<ScheduleOverride>): ScheduleOverride {
  return { id: `ov-${refId}-${date}`, createdAt: 'x', updatedAt: 'x', date, refType, refId, by: 'marina', ...patch }
}

describe('dayTimeline — Marina’s seed', () => {
  const db = buildSeed(FRIDAY)
  const tl = dayTimeline(db, FRIDAY)

  it('every seeded routine item has a real time (none silently "qualquer momento")', () => {
    for (const d of [FRIDAY, SATURDAY, '2026-10-06']) {
      const routineRows = dayTimeline(buildSeed(FRIDAY), d).filter((e) => e.kind === 'routineItem')
      expect(routineRows.length).toBeGreaterThan(15)
      expect(routineRows.filter(isAnytime)).toEqual([])
    }
    for (const it of db.routineItems) {
      expect(it.source).toBe('seed')
      expect(it.timeMode).toBeDefined()
      expect(it.time || it.timeMode === 'sequence').toBeTruthy()
    }
  })

  it('morning follows her rhythm: 04:40 despertar · 04:55 higiene · 05:05 shot · 05:10 leitura · 05:20 meditação', () => {
    expect(at(tl, mid('despertar'))?.start).toBe('04:40')
    expect(at(tl, mid('higiene'))).toMatchObject({ start: '04:55', end: '05:05', timeSource: 'derived' })
    expect(at(tl, mid('morning-shot'))?.start).toBe('05:05')
    expect(at(tl, mid('leitura'))?.start).toBe('05:10')
    expect(at(tl, mid('meditacao'))?.start).toBe('05:20')
  })

  it('each step has its own derived time', () => {
    const steps = at(tl, mid('despertar'))!.children!
    expect(steps.map((s) => s.start)).toEqual(['04:40', '04:42', '04:45', '04:48', '04:53'])
    expect(steps[0]).toMatchObject({ title: 'Acordar', ref: { type: 'routineStep', id: `${mid('despertar')}#0` } })
  })

  it('the chain slides past the training instead of overlapping it', () => {
    const w = tl.find((e) => e.kind === 'workout')!
    expect(w).toMatchObject({ start: '06:00', end: '07:00' })
    expect(at(tl, mid('movimento'))?.start).toBe('07:00')
    expect(at(tl, mid('preparar-o-dia'))?.start).toBe('07:40')
  })

  it('one life: routine, food, training, work and agenda in one time-ordered list', () => {
    const kinds = new Set(tl.map((e) => e.kind))
    for (const k of ['routineItem', 'meal', 'workout', 'work', 'event'] as const) expect(kinds.has(k)).toBe(true)
    const timed = tl.filter((e) => !isAnytime(e))
    expect(timed.map((e) => e.start)).toEqual([...timed.map((e) => e.start!)].sort())
    const pre = tl.find((e) => e.kind === 'meal' && e.phase === 'pre')!
    expect(pre).toMatchObject({ start: '05:00', emoji: '🍌' })
    // anytime group (Luna's tasks have no time yet) comes last
    const firstAnytime = tl.findIndex(isAnytime)
    expect(firstAnytime).toBeGreaterThan(0)
    expect(tl.slice(firstAnytime).every(isAnytime)).toBe(true)
    expect(dayTimeline(db, FRIDAY, { includeAnytime: false }).some(isAnytime)).toBe(false)
  })

  it('weekend morning without training keeps the plain sequence; Saturday review is an anchor', () => {
    const sat = dayTimeline(db, SATURDAY)
    expect(at(sat, mid('movimento'))?.start).toBe('05:50')
    expect(sat.find((e) => e.kind === 'event' && e.start === '09:00')).toBeTruthy()
    expect(sat.some((e) => e.kind === 'work')).toBe(false)
  })

  it('routine blocks group items back for the agenda grid', () => {
    const blocks = routineBlocks(db, tl)
    const morning = blocks.find((b) => b.routine.id === SEED_IDS.routineMorning)!
    expect(morning.start).toBe('04:40')
    expect(morning.total).toBe(10) // optional Luna walk doesn't count until done
  })

  it('nowIndex points at the first entry that has not started', () => {
    const i = nowIndex(tl, 5 * 60 + 12)
    expect(tl[i].start! > '05:12').toBe(true)
    expect(tl[i - 1].start! <= '05:12').toBe(true)
  })
})

describe('dayTimeline — overrides, status and badges', () => {
  const base = buildSeed(FRIDAY)
  const withPatch = (patch: Partial<DB>): DB => ({ ...base, ...patch })

  it('a per-day time moves only that day, and the moved item leaves the chain', () => {
    const db = withPatch({ scheduleOverrides: [ov(FRIDAY, 'routineItem', mid('leitura'), { time: '07:00' })] })
    const tl = dayTimeline(db, FRIDAY)
    expect(at(tl, mid('leitura'))).toMatchObject({ start: '07:00', timeSource: 'override' })
    expect(at(tl, mid('meditacao'))?.start).toBe('05:10') // the morning didn't follow Leitura
    expect(at(tl, mid('movimento'))?.start).toBe('05:40') // the freed 10 min now fit before the training
    expect(at(tl, mid('luna-sol'))?.start).toBe('07:10') // and nothing runs over Leitura at 07:00
    expect(at(dayTimeline(db, SATURDAY), mid('leitura'))?.start).toBe('05:10')
  })

  it('moving the first item slides the whole sequence', () => {
    const db = withPatch({ scheduleOverrides: [ov(SATURDAY, 'routineItem', mid('despertar'), { time: '05:30' })] })
    const tl = dayTimeline(db, SATURDAY)
    expect(at(tl, mid('despertar'))?.start).toBe('05:30')
    expect(at(tl, mid('higiene'))?.start).toBe('05:45')
  })

  it('cancelled and anytime overrides', () => {
    const db = withPatch({
      scheduleOverrides: [ov(FRIDAY, 'routineItem', mid('meditacao'), { cancelled: true }), ov(FRIDAY, 'routineItem', mid('afirmacoes'), { anytime: true })],
    })
    const tl = dayTimeline(db, FRIDAY)
    expect(at(tl, mid('meditacao'))?.status).toBe('cancelled')
    expect(at(tl, mid('afirmacoes'))?.timeSource).toBe('anytime')
    expect(at(tl, mid('journaling'))?.start).toBe('05:20') // freed slot is reused
  })

  it('done items carry the real time they happened', () => {
    const db = withPatch({
      occurrences: [
        { id: 'o1', createdAt: 'x', updatedAt: 'x', parentType: 'routineItem', parentId: mid('higiene'), date: FRIDAY, status: 'done', completedAt: '2026-10-02T08:12:00.000Z' },
      ],
    })
    expect(at(dayTimeline(db, FRIDAY), mid('higiene'))).toMatchObject({ status: 'done', doneAt: '05:12', start: '04:55' })
  })

  it('essential mode keeps only essential items, with their short labels, packed', () => {
    const db = withPatch({
      checkins: [{ id: 'c', createdAt: 'x', updatedAt: 'x', date: FRIDAY, habits: { agua: 0, proteina: false, fruta: false, vegetais: false, refeicoesPlanejadas: false }, routineModes: { [SEED_IDS.routineMorning]: 'essential' } }],
    })
    const rows = dayTimeline(db, FRIDAY).filter((e) => e.ref.type === 'routineItem' && db.routineItems.find((i) => i.id === e.ref.id)?.routineId === SEED_IDS.routineMorning)
    expect(rows.map((r) => `${r.start} ${r.title}`)).toEqual(['04:40 Respirar', '04:55 Higiene', '05:05 Morning shot', '05:10 5 min de leitura', '05:20 Agenda + Top 3'])
    expect(rows[0].children).toBeUndefined()
  })

  it('a planned meal: eaten → done with consumedAt; applied adjustment → badge', () => {
    const plan = base.nutritionDayPlans.find((p) => p.weekdays.includes(5) && p.dayType === 'corrida_longa')!
    const lunch = plan.meals.findIndex((m) => m.name === 'Almoço')
    const pre = plan.meals.findIndex((m) => m.phase === 'pre')
    const db = withPatch({
      meals: [
        { id: 'm1', createdAt: 'x', updatedAt: 'x', date: FRIDAY, slot: 'extra', description: 'Pré', done: true, tags: [], planMealRef: planMealRefId(plan.id, pre), consumedAt: '2026-10-02T08:07:00.000Z' },
      ],
      mealAdjustments: [
        { id: 'a1', createdAt: 'x', updatedAt: 'x', date: FRIDAY, planMealRef: planMealRefId(plan.id, lunch), kind: 'adaptar', items: [{ food: 'Arroz', badge: 'troca' }], reason: 'troca', status: 'applied', by: 'lumos' },
      ],
    })
    const tl = dayTimeline(db, FRIDAY)
    expect(findEntry(tl, { type: 'planMeal', id: planMealRefId(plan.id, pre) })).toMatchObject({ status: 'done', doneAt: '05:07' })
    expect(findEntry(tl, { type: 'planMeal', id: planMealRefId(plan.id, lunch) })).toMatchObject({ badge: 'troca', subtitle: 'Arroz' })
  })

  it('a week-template training (not materialized) still anchors the morning', () => {
    const tuesday = '2026-10-06'
    const tl = dayTimeline(base, tuesday)
    const w = tl.find((e) => e.kind === 'workout' && e.start === '06:00')!
    expect(w.ref.type).toBe('weekTemplate')
    expect(tl.some((e) => e.kind === 'work' && e.title.startsWith('Deslocamento'))).toBe(true) // presencial
  })
})

describe('scheduleRoutine — modes', () => {
  const db = buildSeed(FRIDAY)
  const routine = db.routines[0]
  const mk = (id: string, patch: object) => ({ ...db.routineItems[0], id, steps: undefined, stepDurations: undefined, time: undefined, ...patch })

  it('window items show their window; sequence without a start falls back to anytime', () => {
    const items = [mk('a', { timeMode: 'window', window: { start: '06:00', end: '06:30' }, durationMin: 10 }), mk('b', { timeMode: 'sequence', durationMin: 5 })]
    const slots = scheduleRoutine(db, FRIDAY, routine, items)
    expect(slots[0]).toMatchObject({ start: 360, end: 390, source: 'window' })
    expect(slots[1]).toMatchObject({ start: 370, source: 'derived' })
    const orphan = scheduleRoutine(db, FRIDAY, { ...routine, startTime: undefined }, [mk('c', { timeMode: 'sequence' })])
    expect(orphan[0].anytime).toBe(true)
  })

  it('dependsOn workout waits for the training to end', () => {
    const items = [mk('a', { timeMode: 'fixed', time: '05:00', durationMin: 10 }), mk('b', { timeMode: 'sequence', durationMin: 10, dependsOn: ['workout'] })]
    const slots = scheduleRoutine(db, FRIDAY, routine, items, [], 7 * 60)
    expect(slots[1].start).toBe(7 * 60)
  })
})
