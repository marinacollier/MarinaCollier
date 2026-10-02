import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import type { CalendarEvent, DB, Task } from '@/data/types'
import { SEED_IDS } from '@/data/seed/ids'
import { createSeedContext } from '@/data/seed/context'
import { entryRange, layoutDay, timelineBounds } from './layout'
import { ceilQuarter, findFreeSlots, fitIntoSlots } from './free-slots'
import { dayEntries, looseItemsFor, upcomingAgenda, weekAgenda } from './selectors'
import { seedAgenda } from './seed'

const at = (time: string, endTime?: string, id = time) => ({ id, time, endTime, allDay: false })

describe('layout', () => {
  it('uses 30 min when there is no (valid) end', () => {
    expect(entryRange({ time: '09:00' })).toEqual({ start: 540, end: 570 })
    expect(entryRange({ time: '09:00', endTime: '08:00' })).toEqual({ start: 540, end: 570 })
  })

  it('non-overlapping entries take the full width', () => {
    const r = layoutDay([at('07:00', '08:00'), at('09:00', '10:00')])
    expect(r.map((p) => [p.col, p.cols, p.span])).toEqual([
      [0, 1, 1],
      [0, 1, 1],
    ])
  })

  it('back-to-back entries do not overlap', () => {
    const r = layoutDay([at('09:00', '10:00'), at('10:00', '11:00')])
    expect(r.every((p) => p.cols === 1)).toBe(true)
  })

  it('overlapping entries go side by side', () => {
    const r = layoutDay([at('09:00', '11:00', 'a'), at('09:30', '10:00', 'b'), at('10:30', '11:30', 'c')])
    const by = Object.fromEntries(r.map((p) => [p.item.id, p]))
    expect(by.a.col).toBe(0)
    expect(by.b.col).toBe(1)
    expect(by.c.col).toBe(1) // reuses b's column once it ends
    expect(by.a.cols).toBe(2)
  })

  it('three-way overlap → 3 columns; a block can span free columns to its right', () => {
    const r = layoutDay([at('09:00', '12:00', 'a'), at('09:00', '10:00', 'b'), at('09:30', '10:30', 'c'), at('11:00', '11:30', 'd')])
    const by = Object.fromEntries(r.map((p) => [p.item.id, p]))
    expect(by.a.cols).toBe(3)
    expect([by.a.col, by.b.col, by.c.col].sort()).toEqual([0, 1, 2])
    expect(by.d.col).toBe(1)
    expect(by.d.span).toBe(2)
  })

  it('short entries collide visually using the minimum duration', () => {
    const r = layoutDay([at('09:00', '09:05', 'a'), at('09:10', '09:40', 'b')])
    expect(r[0].cols).toBe(2)
  })

  it('ignores all-day and untimed items', () => {
    expect(layoutDay([{ allDay: true }, { allDay: false }])).toHaveLength(0)
  })

  it('timeline widens for early / late entries', () => {
    expect(timelineBounds([])).toEqual({ fromHour: 6, toHour: 23 })
    expect(timelineBounds([at('05:15'), at('23:00', '23:45')])).toEqual({ fromHour: 5, toHour: 24 })
  })
})

describe('free slots', () => {
  it('finds gaps between entries', () => {
    const slots = findFreeSlots([at('07:00', '08:00'), at('09:00', '12:30'), at('12:30', '13:30'), at('15:00', '16:00')], {
      from: '06:00',
      to: '21:00',
      minMinutes: 30,
    })
    expect(slots.map((s) => `${s.start}-${s.end}`)).toEqual(['06:00-07:00', '08:00-09:00', '13:30-15:00', '16:00-21:00'])
    expect(slots[3].minutes).toBe(300)
  })

  it('handles overlaps, entries outside the window and minMinutes', () => {
    const slots = findFreeSlots([at('05:00', '06:30'), at('10:00', '11:00'), at('10:30', '12:00'), at('20:45', '22:00')], {
      from: '06:00',
      to: '21:00',
      minMinutes: 60,
    })
    expect(slots.map((s) => `${s.start}-${s.end}`)).toEqual(['06:30-10:00', '12:00-20:45'])
  })

  it('empty day is one big slot; untimed entries do not block', () => {
    expect(findFreeSlots([{ allDay: true }], { from: '08:00', to: '12:00' })).toEqual([{ start: '08:00', end: '12:00', minutes: 240 }])
  })

  it('fits items into the biggest slots first and keeps the rest', () => {
    const slots = findFreeSlots([at('09:00', '14:00'), at('15:00', '16:00')], { from: '08:00', to: '18:00' })
    // 08-09 (60), 14-15 (60), 16-18 (120)
    const { placed, rest } = fitIntoSlots(['a', 'b', 'c', 'd', 'e'], slots, 45, 60)
    expect(placed.map((p) => [p.slot.start, p.items])).toEqual([
      ['08:00', ['b']],
      ['14:00', ['c']],
      ['16:00', ['a', 'd']],
    ])
    expect(rest).toEqual(['e'])
  })

  it('ceilQuarter rounds up', () => {
    expect(ceilQuarter(14 * 60 + 1)).toBe('14:15')
    expect(ceilQuarter(14 * 60)).toBe('14:00')
  })
})

function dbWith(events: Partial<CalendarEvent>[], tasks: Partial<Task>[] = []): DB {
  const ctx = createSeedContext('2026-10-02')
  const db = emptyDB()
  db.calendarSources = seedAgenda(ctx).calendarSources ?? []
  db.events = events.map((e, i) =>
    ctx.make('events', { sourceId: SEED_IDS.sourceLocal, title: `ev${i}`, date: '2026-10-02', allDay: false, ...e } as CalendarEvent),
  )
  db.tasks = tasks.map((t, i) => ctx.make('tasks', { title: `t${i}`, status: 'todo', order: i, ...t } as Task))
  return db
}

describe('agenda selectors', () => {
  it('seed has only the local source and no events', () => {
    const part = seedAgenda(createSeedContext('2026-10-02'))
    expect(part.calendarSources?.[0].id).toBe(SEED_IDS.sourceLocal)
    expect(part.events).toBeUndefined()
  })

  it('groups a week Monday..Sunday', () => {
    const db = dbWith([
      { date: '2026-09-28', startTime: '09:00', title: 'seg' },
      { date: '2026-10-04', startTime: '10:00', title: 'dom' },
      { date: '2026-10-05', startTime: '10:00', title: 'next week' },
    ])
    const week = weekAgenda(db, '2026-10-02')
    expect(week.map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
    expect(week[0].entries.map((e) => e.title)).toEqual(['seg'])
    expect(week[6].entries.map((e) => e.title)).toEqual(['dom'])
    expect(week.flatMap((d) => d.entries)).toHaveLength(2)
  })

  it('upcoming only lists busy days and shows multi-day events once', () => {
    const db = dbWith([
      { date: '2026-10-03', endDate: '2026-10-06', allDay: true, title: 'Recife', kind: 'viagem' },
      { date: '2026-10-05', startTime: '15:00', title: 'reunião', kind: 'trabalho' },
    ])
    const up = upcomingAgenda(db, '2026-10-02', 30)
    expect(up.map((d) => d.date)).toEqual(['2026-10-03', '2026-10-05'])
    expect(up[0].entries[0].rangeLabel).toBe('3–6 de out.')
    expect(up[1].entries.map((e) => e.title)).toEqual(['reunião'])
  })

  it('multi-day timed events go to the all-day row', () => {
    const db = dbWith([{ date: '2026-10-01', endDate: '2026-10-03', startTime: '10:00', title: 'congresso' }])
    const [e] = dayEntries(db, '2026-10-02')
    expect(e.allDay).toBe(true)
    expect(e.time).toBeUndefined()
  })

  it('loose items: high priority or due today, untimed and open', () => {
    const db = dbWith(
      [],
      [
        { title: 'alta', priority: 'alta', date: '2026-10-02' },
        { title: 'vence', dueDate: '2026-10-02' },
        { title: 'normal', date: '2026-10-02' },
        { title: 'com hora', priority: 'alta', date: '2026-10-02', time: '10:00' },
        { title: 'feita', priority: 'alta', date: '2026-10-02', status: 'done' },
      ],
    )
    expect(looseItemsFor(db, '2026-10-02').map((l) => l.title)).toEqual(['alta', 'vence'])
  })
})

describe('free slots with minimum block length', () => {
  it('a 15-min entry blocks 30 min when minBlockMin = 30', () => {
    const slots = findFreeSlots([at('13:45', '14:00'), at('15:00', '16:00')], { from: '13:00', to: '16:00', minMinutes: 30, minBlockMin: 30 })
    expect(slots.map((s) => `${s.start}-${s.end}`)).toEqual(['13:00-13:45', '14:15-15:00'])
  })
})
