/**
 * Modos de rotina (manual > período > viagem > Brasil) and the base day projected in the universal calendar.
 */
import { describe, expect, it } from 'vitest'
import { emptyDB } from './defaults'
import type { CalendarEvent, DayBlock, DB, Routine, RoutineItem, Trip, TripExpedition, WeekTemplateItem, Workout } from './types'
import { SEED_IDS } from './seed/ids'
import { autoEssentialReason, dayBlocksOn, routineModeInfo, routineModeOn, routineModeToday, withManualMode, withoutManualMode } from './routine-modes'
import { isTravelDay } from './travel-mode'
import { proposeWeekFromTemplate, workBlocks, workMode } from './planning'
import { contextWorkouts } from './fuel'
import { routineItemsInMode } from './timeline'
import { routineProgress } from './selectors'
import { calendarConflicts, calendarEntries } from './calendar/universal'
import { isHomeEntry } from '@/features/today/home/clean'
import { routineMode, routineView } from '@/features/today/routine'

const AT = '2026-11-01T10:00:00.000Z'
const ent = { createdAt: AT, updatedAt: AT }
const MON = '2026-11-09'
const TUE = '2026-11-10'
const SUN = '2026-11-15'
const TODAY = '2026-11-09'

const trip = (p: Partial<Trip> = {}): Trip => ({
  ...ent,
  id: 'trip-1',
  name: 'Cape Town',
  flag: '🇿🇦',
  datesConfirmed: true,
  interests: [],
  tone: 'ocean' as Trip['tone'],
  links: [],
  status: 'confirmada',
  order: 0,
  startDate: '2026-11-01',
  endDate: '2026-11-08',
  expedition: { timeZone: 'Africa/Johannesburg' } as unknown as TripExpedition,
  ...p,
})

const morning: Routine = { ...ent, id: SEED_IDS.routineMorning, name: 'Milagre da Manhã', period: 'manha', order: 0, active: true, hasEssential: true, startTime: '05:00' }
const rItem = (id: string, essential: boolean, order: number): RoutineItem => ({ ...ent, id, routineId: morning.id, title: id, recurrence: { kind: 'daily' }, order, active: true, durationMin: 10, essential })

function base(patch: (db: DB) => void = () => {}): DB {
  const db = emptyDB()
  db.profile.work = { ...db.profile.work, start: '09:00', end: '17:30', days: { 0: 'off', 1: 'remoto', 2: 'remoto', 3: 'remoto', 4: 'remoto', 5: 'remoto', 6: 'off' }, commuteBeforeMin: 45, commuteAfterMin: 45 }
  db.routines = [morning]
  db.routineItems = [rItem('despertar', true, 0), rItem('leitura', false, 1), rItem('meditacao', true, 2), rItem('journaling', false, 3)]
  patch(db)
  return db
}

const block = (p: Partial<DayBlock> & Pick<DayBlock, 'id' | 'title' | 'start' | 'end'>): DayBlock => ({ category: 'estudo', weekdays: [1, 2, 3, 4, 5], kind: 'base', ...p })
const ev = (p: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'title' | 'date'>): CalendarEvent => ({ ...ent, sourceId: 'cal-local', allDay: false, ...p })

describe('routineModeOn · manual > período > viagem > Brasil', () => {
  it('defaults to brasil, trip days are viagem (trip zone), nothing configured = old behaviour', () => {
    const db = base((d) => (d.trips = [trip()]))
    expect(routineModeOn(db, MON)).toBe('brasil')
    expect(routineModeInfo(db, MON)).toMatchObject({ mode: 'brasil', source: 'padrao', timeZone: 'America/Sao_Paulo' })
    expect(routineModeInfo(db, '2026-11-05')).toMatchObject({ mode: 'viagem', source: 'viagem', until: '2026-11-08', timeZone: 'Africa/Johannesburg' })
    expect(isTravelDay(db, '2026-11-05')).toBe(true)
  })

  it('an explicit period beats the trip, the manual override beats the period (only inside its dates)', () => {
    const db = base((d) => {
      d.trips = [trip()]
      d.profile.routineModes = {
        periods: [
          { mode: 'transicao', from: '2026-11-07', to: '2026-11-12', label: 'Volta da África' },
          { mode: 'ferias', from: '2026-12-20', label: 'Natal' },
        ],
        manual: { mode: 'brasil', from: '2026-11-11', to: '2026-11-11' },
      }
    })
    expect(routineModeOn(db, '2026-11-05')).toBe('viagem') // trip, no period
    expect(routineModeInfo(db, '2026-11-08')).toMatchObject({ mode: 'transicao', source: 'periodo', label: 'Volta da África', timeZone: 'America/Sao_Paulo' })
    expect(isTravelDay(db, '2026-11-08')).toBe(false) // transição is not a paused day
    expect(routineModeOn(db, MON)).toBe('transicao')
    expect(routineModeInfo(db, '2026-11-11')).toMatchObject({ mode: 'brasil', source: 'manual' })
    expect(routineModeOn(db, '2026-11-12')).toBe('transicao') // manual ended
    expect(routineModeOn(db, '2026-11-13')).toBe('brasil')
    expect(routineModeOn(db, '2027-01-03')).toBe('ferias') // open-ended period
    expect(isTravelDay(db, '2027-01-03')).toBe(true)
  })

  it('manual edits: open-ended manual, then back to automatic keeps the periods', () => {
    const p = { routineModes: { periods: [{ mode: 'ferias' as const, from: '2026-12-20', to: '2026-12-31' }] } }
    const withManual = withManualMode(p, 'transicao', MON)
    expect(withManual).toEqual({ periods: p.routineModes.periods, manual: { mode: 'transicao', from: MON } })
    const db = base((d) => (d.profile.routineModes = withManual))
    expect(routineModeOn(db, '2026-12-01')).toBe('transicao')
    expect(routineModeOn(db, '2026-12-21')).toBe('transicao') // manual wins over the period
    expect(withoutManualMode({ routineModes: withManual })).toEqual({ periods: p.routineModes.periods })
    expect(withoutManualMode({ routineModes: { periods: [], manual: withManual.manual } })).toBeUndefined()
  })

  it("today in the trip's zone during viagem (late night in São Paulo is already tomorrow in Cape Town)", () => {
    const db = base((d) => (d.trips = [trip({ startDate: MON, endDate: TUE })]))
    const now = new Date('2026-11-10T02:30:00.000Z') // 23:30 on 09/11 in São Paulo, 04:30 on 10/11 in Cape Town
    expect(routineModeToday(db, now)).toMatchObject({ mode: 'viagem', date: TUE, timeZone: 'Africa/Johannesburg' })
    expect(routineModeToday(base(), now)).toMatchObject({ mode: 'brasil', date: MON })
  })
})

describe('work base by mode', () => {
  it('all-remote 09:00–17:30: one block, no commute', () => {
    const db = base()
    expect(workMode(db, MON)).toBe('remoto')
    expect(workBlocks(db, MON)).toEqual([{ kind: 'work', title: 'Trabalho remoto', start: '09:00', end: '17:30', mode: 'remoto' }])
    const entries = calendarEntries(db, MON, MON, { today: TODAY }).filter((e) => e.sourceType === 'work')
    expect(entries.map((e) => [e.startAt.time, e.endAt.time, e.base])).toEqual([['09:00', '17:30', true]])
  })

  it('only modo Brasil has the work base (viagem, férias, transição → off)', () => {
    for (const mode of ['viagem', 'ferias', 'transicao'] as const) {
      const db = base((d) => (d.profile.routineModes = { periods: [{ mode, from: MON, to: MON }] }))
      expect(workMode(db, MON)).toBe('off')
      expect(workBlocks(db, MON)).toEqual([])
      expect(workBlocks(db, TUE)).toHaveLength(1)
    }
  })
})

describe('day blocks in the universal calendar', () => {
  const blocks = [
    block({ id: 'ingles', title: 'Inglês', start: '19:00', end: '19:45', category: 'idiomas' }),
    block({ id: 'almoco', title: 'Almoço', start: '12:00', end: '13:00', category: 'almoco', weekdays: [0, 1, 2, 3, 4, 5, 6], modes: ['brasil', 'transicao'] }),
    block({ id: 'criar', title: 'Criar', start: '14:00', end: '15:00', category: 'criatividade', kind: 'sugerido', modes: ['transicao'] }),
    block({ id: 'leitura', title: 'Leitura', start: '20:00', end: '21:00', category: 'pessoal', kind: 'sugerido' }),
  ]

  it('per weekday and mode (default modes = brasil); base = background, sugerido = planejado + suggested', () => {
    const db = base((d) => (d.profile.dayPlan = { blocks }))
    expect(dayBlocksOn(db, MON).map((b) => b.id)).toEqual(['almoco', 'ingles', 'leitura'])
    expect(dayBlocksOn(db, SUN).map((b) => b.id)).toEqual(['almoco'])
    const day = calendarEntries(db, MON, MON, { today: TODAY }).filter((e) => e.sourceType === 'dayBlock')
    expect(day.map((e) => e.id)).toEqual(['dayBlock:almoco:2026-11-09', 'dayBlock:ingles:2026-11-09', 'dayBlock:leitura:2026-11-09'])
    const ingles = day.find((e) => e.sourceId === 'ingles')!
    expect(ingles).toMatchObject({ base: true, status: 'planejado', category: 'estudo', startAt: { date: MON, time: '19:00' }, endAt: { date: MON, time: '19:45' }, timezone: 'America/Sao_Paulo' })
    expect(ingles.suggested).toBeUndefined()
    expect(day.find((e) => e.sourceId === 'leitura')).toMatchObject({ suggested: true, status: 'planejado' })
    expect(day.find((e) => e.sourceId === 'leitura')!.base).toBeUndefined()
    // Home stays clean.
    expect(day.some(isHomeEntry)).toBe(false)
  })

  it('transição shows only the blocks made for it; viagem without blocks for it shows none', () => {
    const db = base((d) => {
      d.profile.dayPlan = { blocks }
      d.profile.routineModes = { periods: [{ mode: 'transicao', from: MON, to: MON }, { mode: 'viagem', from: TUE, to: TUE }] }
    })
    expect(dayBlocksOn(db, MON).map((b) => b.id)).toEqual(['almoco', 'criar'])
    expect(dayBlocksOn(db, TUE)).toEqual([])
  })

  it('a real event beats a suggested block (hidden that day, no conflict); base blocks never conflict', () => {
    const db = base((d) => {
      d.profile.dayPlan = { blocks }
      d.events = [
        ev({ id: 'jantar', title: 'Jantar com a Bia', date: MON, startTime: '20:30', endTime: '22:00' }),
        ev({ id: 'aula', title: 'Aula experimental', date: MON, startTime: '19:15', endTime: '20:00' }),
      ]
    })
    const mon = calendarEntries(db, MON, TUE, { today: TODAY })
    expect(mon.find((e) => e.id === 'dayBlock:leitura:2026-11-09')).toBeUndefined()
    expect(mon.find((e) => e.id === 'dayBlock:leitura:2026-11-10')).toMatchObject({ suggested: true }) // the next day is free
    expect(mon.find((e) => e.id === 'dayBlock:ingles:2026-11-09')).toMatchObject({ base: true }) // base stays as background
    expect(calendarConflicts(mon, db)).toEqual([])
  })

  it('invalid blocks (end before start, no weekday) are ignored', () => {
    const db = base((d) => (d.profile.dayPlan = { blocks: [block({ id: 'x', title: 'X', start: '10:00', end: '09:00' }), block({ id: 'y', title: 'Y', start: '10:00', end: '11:00', weekdays: [] })] }))
    expect(dayBlocksOn(db, MON)).toEqual([])
  })
})

describe('transição: light workouts, essential routines', () => {
  const tpl: WeekTemplateItem = { ...ent, id: 'tpl-seg-forca', weekday: 1, modalities: ['musculacao'], choice: 'fixed', title: 'Força', time: '07:00', durationMin: 60, planType: 'fixo', order: 0, active: true, isKeySession: true }

  it('week template sessions are flexível, light and optional on a transition day', () => {
    const db = base((d) => {
      d.weekTemplate = [tpl]
      d.profile.routineModes = { periods: [{ mode: 'transicao', from: MON, to: MON }] }
    })
    expect(contextWorkouts(db, MON)[0]).toMatchObject({ planType: 'flexivel', isKeySession: false })
    expect(proposeWeekFromTemplate(db, MON).find((p) => p.date === MON)).toMatchObject({ planType: 'flexivel', workout: { planType: 'flexivel' } })
    const w = calendarEntries(db, MON, MON, { today: TODAY }).find((e) => e.sourceType === 'workout')!
    expect(w).toMatchObject({ light: true, status: 'planejado' })
    // The next week (Brasil) is normal again.
    const next = base((d) => (d.weekTemplate = [tpl]))
    expect(contextWorkouts(next, MON)[0].planType).toBeUndefined()
    expect(calendarEntries(next, MON, MON, { today: TODAY }).find((e) => e.sourceType === 'workout')!.light).toBeUndefined()
  })

  it('Milagre da Manhã in its essential version on a transition day; full on a normal day; her choice wins', () => {
    const db = base((d) => (d.profile.routineModes = { periods: [{ mode: 'transicao', from: MON, to: MON }] }))
    expect(autoEssentialReason(db, morning, MON)).toBe('transicao')
    expect(routineMode(db, morning, MON)).toBe('essential')
    expect(routineView(db, morning, MON).items.map((i) => i.id)).toEqual(['despertar', 'meditacao'])
    expect(routineItemsInMode(db, morning, MON)).toMatchObject({ essential: true })
    expect(routineProgress(db, morning.id, MON).total).toBe(2)
    expect(db.routineItems).toHaveLength(4) // nothing deleted
    expect(routineMode(db, morning, TUE)).toBe('completa')
    expect(routineView(db, morning, TUE).items).toHaveLength(4)
    const chosen = structuredClone(db)
    chosen.checkins = [{ ...ent, id: 'c', date: MON, habits: { agua: 0, proteina: false, fruta: false, vegetais: false, refeicoesPlanejadas: false }, routineModes: { [morning.id]: 'completa' } }]
    expect(routineMode(chosen, morning, MON)).toBe('completa')
  })

  it('a workout before 08:00 makes the morning essential once routine modes are set up (no config = old behaviour)', () => {
    const early: Workout = { ...ent, id: 'w1', date: MON, modality: 'natacao', status: 'planejado', time: '06:30', order: 0 }
    const old = base((d) => (d.workouts = [early]))
    expect(routineMode(old, morning, MON)).toBe('completa')
    const db = base((d) => {
      d.workouts = [early]
      d.profile.routineModes = { periods: [] }
    })
    expect(autoEssentialReason(db, morning, MON)).toBe('treino_cedo')
    expect(routineMode(db, morning, MON)).toBe('essential')
    db.workouts = [{ ...early, time: '08:00' }]
    expect(routineMode(db, morning, MON)).toBe('completa')
  })
})
