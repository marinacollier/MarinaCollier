import { describe, expect, it } from 'vitest'
import { emptyDB } from './defaults'
import {
  checkWorkoutMove,
  conflictsOn,
  isPresencial,
  proposeWeekFromTemplate,
  suggestWindows,
  trainingWeekSummary,
  workBlocks,
} from './planning'
import { agendaFor, eventsFor } from './selectors'
import type { DB, Workout } from './types'

const meta = { createdAt: '', updatedAt: '' }

function fixture(): DB {
  const db = emptyDB()
  db.profile.work = {
    start: '09:00',
    end: '18:00',
    location: 'Escritório',
    days: { 0: 'off', 1: 'remoto', 2: 'presencial', 3: 'presencial', 4: 'remoto', 5: 'remoto', 6: 'off' },
    commuteBeforeMin: 60,
    commuteAfterMin: 60,
    presencialChecklist: ['notebook'],
  }
  db.constraints = [
    { ...meta, id: 'c1', name: 'Pass — 1 check-in/dia', kind: 'max_checkins_per_day', limit: 1, modalities: ['natacao', 'yoga', 'musculacao'], active: true },
    { ...meta, id: 'c2', name: 'Projeto Y — até 1h/dia', kind: 'max_minutes_per_day', limit: 60, projectId: 'p1', active: true },
  ]
  return db
}

const w = (id: string, date: string, modality: string, extra: Partial<Workout> = {}): Workout => ({
  ...meta,
  id,
  date,
  modality,
  status: 'planejado',
  order: 0,
  ...extra,
})

// 2026-09-28 is a Monday; 30/09 a Wednesday (presencial); 01/10 a Thursday.
describe('planning engine', () => {
  it('knows presencial days and builds work blocks with commute buffers', () => {
    const db = fixture()
    expect(isPresencial(db.profile, '2026-09-30')).toBe(true)
    expect(isPresencial(db.profile, '2026-10-01')).toBe(false)
    const blocks = workBlocks(db.profile, '2026-09-30')
    expect(blocks.map((b) => `${b.kind} ${b.start}-${b.end}`)).toEqual(['commute 08:00-09:00', 'work 09:00-18:00', 'commute 18:00-19:00'])
    expect(workBlocks(db.profile, '2026-10-01').map((b) => b.kind)).toEqual(['work'])
    expect(workBlocks(db.profile, '2026-10-04')).toEqual([])
  })

  it('flags two check-in workouts on the same day without deleting anything', () => {
    const db = fixture()
    db.workouts = [w('a', '2026-09-30', 'natacao', { time: '07:00' }), w('b', '2026-09-30', 'yoga', { time: '19:30' })]
    const cs = conflictsOn(db, '2026-09-30')
    const c = cs.find((x) => x.kind === 'checkin_limit')!
    expect(c.message).toContain('mesmo check-in')
    expect(c.refs.map((r) => r.id).sort()).toEqual(['a', 'b'])
    expect(db.workouts).toHaveLength(2)
  })

  it('hides a conflict once Marina keeps or ignores it', () => {
    const db = fixture()
    db.workouts = [w('a', '2026-09-30', 'natacao', { time: '07:00' }), w('b', '2026-09-30', 'yoga', { time: '19:30' })]
    const key = conflictsOn(db, '2026-09-30').find((x) => x.kind === 'checkin_limit')!.key
    db.conflictAcks = [{ ...meta, id: 'k', key, decision: 'manter', date: '2026-09-30' }]
    expect(conflictsOn(db, '2026-09-30').some((x) => x.kind === 'checkin_limit')).toBe(false)
    expect(conflictsOn(db, '2026-09-30', { includeAcknowledged: true }).some((x) => x.kind === 'checkin_limit')).toBe(true)
  })

  it('detects an approximate-period event colliding with a workout (cerâmica à noite × yoga à noite)', () => {
    const db = fixture()
    db.events = [
      { ...meta, id: 'e1', sourceId: 's', title: 'Cerâmica', date: '2026-09-28', allDay: false, period: 'noite', recurrence: { kind: 'weekly', weekdays: [1, 4] } },
    ]
    db.workouts = [w('y', '2026-10-01', 'yoga', { time: '19:00' })]
    const c = conflictsOn(db, '2026-10-01').find((x) => x.kind === 'overlap')!
    expect(c.message).toContain('mesmo período')
  })

  it('respects exdates: cancelling this week removes the event and the conflict', () => {
    const db = fixture()
    db.events = [
      { ...meta, id: 'e1', sourceId: 's', title: 'Cerâmica', date: '2026-09-28', allDay: false, period: 'noite', recurrence: { kind: 'weekly', weekdays: [1, 4] }, exdates: ['2026-10-01'] },
    ]
    db.workouts = [w('y', '2026-10-01', 'yoga', { time: '19:00' })]
    expect(eventsFor(db, '2026-10-01')).toHaveLength(0)
    expect(eventsFor(db, '2026-10-05')).toHaveLength(1)
    expect(conflictsOn(db, '2026-10-01').some((x) => x.kind === 'overlap')).toBe(false)
  })

  it('warns about long rides on presencial days and training inside commute', () => {
    const db = fixture()
    db.workouts = [w('g', '2026-09-30', 'gravel', { time: '06:00', plannedDurationMin: 150 })]
    const kinds = conflictsOn(db, '2026-09-30').map((c) => c.kind)
    expect(kinds).toContain('presencial_heavy')
    expect(kinds).toContain('work_hours') // 06:00 + 150min hits the 08:00 commute
  })

  it('checks a drag before it happens (never blocks)', () => {
    const db = fixture()
    db.workouts = [w('a', '2026-09-30', 'natacao', { time: '07:00' }), w('b', '2026-10-01', 'yoga', { time: '07:00' })]
    const res = checkWorkoutMove(db, 'b', '2026-09-30')
    expect(res.map((c) => c.kind)).toContain('checkin_limit')
    expect(checkWorkoutMove(db, 'b', '2026-10-02')).toEqual([])
  })

  it('caps project time per day', () => {
    const db = fixture()
    db.tasks = [
      { ...meta, id: 't1', title: 'Telas', status: 'todo', projectId: 'p1', date: '2026-10-01', durationMin: 120, order: 0 },
    ]
    expect(conflictsOn(db, '2026-10-01').find((c) => c.kind === 'project_time_cap')?.message).toContain('até 1h')
  })

  it('summarizes the training week by group, informational only', () => {
    const db = fixture()
    db.workouts = [
      w('1', '2026-09-28', 'corrida'),
      w('2', '2026-09-30', 'natacao', { status: 'feito' }),
      w('3', '2026-10-02', 'natacao'),
      w('4', '2026-10-01', 'bike'),
      w('5', '2026-10-04', 'recuperacao', { status: 'descanso' }),
      w('6', '2026-10-03', 'surf', { status: 'pulado' }),
    ]
    const s = trainingWeekSummary(db, '2026-10-02')
    expect(s.line).toBe('1 corrida · 2 natações · 1 bike · 1 recovery')
    expect(s.done.natacao).toBe(1)
  })

  it('suggests windows that respect the check-in limit and preferred days', () => {
    const db = fixture()
    db.workouts = [w('a', '2026-10-01', 'natacao', { time: '07:00' })]
    const s = suggestWindows(db, { modality: 'yoga', from: '2026-09-28', preferredWeekdays: [4] })
    expect(s.length).toBeGreaterThan(0)
    expect(s.every((x) => x.date !== '2026-10-01')).toBe(true) // Thursday already uses the check-in
    // Monday has free early morning before work
    expect(s.some((x) => x.date === '2026-09-28' && x.start === '06:00')).toBe(true)
  })

  it('expands the weekly template without duplicating materialized lines', () => {
    const db = fixture()
    db.weekTemplate = [
      { ...meta, id: 't-qua', weekday: 3, modalities: ['natacao'], choice: 'fixed', time: '07:00', planType: 'base', order: 0, active: true },
      { ...meta, id: 't-qui', weekday: 4, modalities: ['bike', 'corrida'], choice: 'one_of', period: 'manha', planType: 'flexivel', order: 0, active: true },
      { ...meta, id: 't-dom', weekday: 0, modalities: [], choice: 'rest', title: 'Recovery / OFF', planType: 'base', order: 0, active: true },
    ]
    const p = proposeWeekFromTemplate(db, '2026-10-02')
    expect(p.find((x) => x.templateId === 't-qua')?.workout?.date).toBe('2026-09-30')
    expect(p.find((x) => x.templateId === 't-qui')?.options).toEqual(['bike', 'corrida'])
    expect(p.find((x) => x.templateId === 't-dom')?.workout?.status).toBe('descanso')
    db.workouts = [w('x', '2026-09-30', 'natacao', { templateId: 't-qua' })]
    expect(proposeWeekFromTemplate(db, '2026-10-02').some((x) => x.templateId === 't-qua')).toBe(false)
  })

  it('agenda shows work blocks only when asked and approximate events with a label', () => {
    const db = fixture()
    db.events = [{ ...meta, id: 'e1', sourceId: 's', title: 'Cerâmica', date: '2026-09-28', allDay: false, period: 'noite' }]
    expect(agendaFor(db, '2026-09-28').some((e) => e.kind === 'block')).toBe(false)
    const full = agendaFor(db, '2026-09-28', { includeBlocks: true })
    expect(full.some((e) => e.kind === 'block')).toBe(true)
    const cer = full.find((e) => e.id === 'e1')!
    expect(cer.approx).toBe(true)
    expect(cer.time).toBe('18:00')
    expect(cer.subtitle).toContain('noite')
  })
})
