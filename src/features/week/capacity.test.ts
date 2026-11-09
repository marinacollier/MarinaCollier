import { describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { calendarEntries } from '@/data/calendar/universal'
import type { CalendarEvent, DB, Project, Task } from '@/data/types'
import { capacityFlag, countsForCapacity, gapsBetween, mergeIntervals, weekCapacity, weekFeasibility } from './capacity'

const meta = { createdAt: '', updatedAt: '' }
const WEEK = '2026-11-09' // Monday
const TODAY = '2026-11-09'

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  ...meta,
  id,
  name: id,
  emoji: '💼',
  tone: 'ocean',
  status: 'ativo',
  priority: 'media',
  links: [],
  files: [],
  people: [],
  decisions: [],
  changelog: [],
  kind: 'default',
  order: 0,
  ...extra,
})

const task = (id: string, extra: Partial<Task> = {}): Task => ({ ...meta, id, title: id, status: 'todo', order: 0, ...extra })

const event = (id: string, date: string, startTime: string, endTime: string, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ ...meta, id, title: id, date, startTime, endTime, allDay: false, sourceId: 'local', ...extra }) as CalendarEvent

function fixture(): DB {
  const db = emptyDB()
  db.profile.work = { ...db.profile.work, start: '09:00', end: '17:30' }
  db.profile.rhythm = { wakeTime: '07:00', sleepTime: '23:00' }
  db.projects = [
    project('proj-fashionfinder', { name: 'Fashion Finder', weeklyHours: 20 }),
    project('seed:work:tranquilo-sp', { name: 'Tranquilo', weeklyHours: 10, weeklyHoursFrom: '2026-12-01' }),
    project('proj-santander', { name: 'Santander', status: 'concluido', weeklyHours: 40 }),
  ]
  return db
}

const run = (db: DB, today = TODAY) => {
  const entries = calendarEntries(db, WEEK, '2026-11-15', { today })
  return { cap: weekCapacity(db, entries, WEEK, today), feas: weekFeasibility(db, entries, WEEK, today) }
}

describe('capacity math', () => {
  it('available window = work days × (end − start − 1h almoço); Santander never counts; Tranquilo only from its date', () => {
    const db = fixture()
    const { cap } = run(db)
    expect(cap.workDays).toHaveLength(5)
    expect(cap.availableMin).toBe(5 * 7.5 * 60)
    expect(cap.projects.map((p) => p.project.id)).toEqual(['proj-fashionfinder'])
    expect(cap.plannedMin).toBe(20 * 60)
    expect(cap.pct).toBe(Math.round((1200 / 2250) * 100))
    expect(cap.flag).toBe('ok')
    expect(cap.freeMin).toBe(2250 - 1200)
  })

  it('Tranquilo counts once active, with weeklyHours, in a week on/after weeklyHoursFrom', () => {
    const db = fixture()
    const tranquilo = db.projects[1]
    expect(countsForCapacity(tranquilo, '2026-11-15')).toBe(false)
    expect(countsForCapacity(tranquilo, '2026-12-06')).toBe(true)
    expect(countsForCapacity({ ...tranquilo, weeklyHoursFrom: undefined, weeklyHours: undefined }, '2026-12-06')).toBe(false)
    expect(countsForCapacity({ ...tranquilo, weeklyHoursFrom: undefined, status: 'pausado' }, '2026-12-06')).toBe(false)
    db.projects[1] = { ...tranquilo, weeklyHoursFrom: undefined }
    const { cap } = run(db)
    expect(cap.projects.map((p) => p.project.name)).toEqual(['Fashion Finder', 'Tranquilo'])
    expect(cap.plannedMin).toBe(30 * 60)
    expect(cap.pct).toBe(80)
    expect(cap.flag).toBe('ok')
  })

  it('thresholds: > 85% apertado, > 100% sobrecarga', () => {
    expect(capacityFlag(85)).toBe('ok')
    expect(capacityFlag(86)).toBe('apertado')
    expect(capacityFlag(100)).toBe('apertado')
    expect(capacityFlag(101)).toBe('sobrecarga')
    const db = fixture()
    db.projects[0].weeklyHours = 34 // 34 / 37.5 = 91%
    expect(run(db).cap.flag).toBe('apertado')
    db.projects[0].weeklyHours = 40
    const { cap } = run(db)
    expect(cap.flag).toBe('sobrecarga')
    expect(cap.freeMin).toBe(0)
  })

  it('scheduled from linked entries, done from feito entries and completed tasks (spentMin wins); top-3 priorities and waiting', () => {
    const db = fixture()
    db.events = [event('Sprint FF', '2026-11-10', '10:00', '12:00', { projectId: 'proj-fashionfinder' }), event('Reunião FF', '2026-11-11', '14:00', '15:00', { projectId: 'proj-fashionfinder' })]
    db.tasks = [
      task('Ajustar busca', { projectId: 'proj-fashionfinder', date: '2026-11-12', time: '09:00', durationMin: 90, priority: 'alta' }),
      task('Revisar PR', { projectId: 'proj-fashionfinder', status: 'done', completedAt: '2026-11-09T15:00:00.000Z', durationMin: 60, spentMin: 45 }),
      task('Resposta do cliente', { projectId: 'proj-fashionfinder', status: 'waiting', waiting: { who: 'Ana', since: '2026-11-05' } }),
      task('Baixa', { projectId: 'proj-fashionfinder', priority: 'baixa' }),
      task('Média', { projectId: 'proj-fashionfinder', dueDate: '2026-11-13' }),
      task('Santander velho', { projectId: 'proj-santander', date: '2026-11-10', time: '13:00', durationMin: 60 }),
    ]
    const { cap } = run(db)
    const ff = cap.projects[0]
    expect(ff.scheduledMin).toBe(120 + 60 + 90)
    expect(ff.doneMin).toBe(45)
    expect(ff.priorities.map((p) => p.title)).toEqual(['Ajustar busca', 'Média', 'Baixa'])
    expect(ff.meetings.map((m) => m.title)).toEqual(['Reunião FF'])
    expect(ff.waiting.map((w) => w.who)).toEqual(['Ana'])
    expect(cap.scheduledMin).toBe(270)
  })

  it('flags days over the project "até X min/dia" constraint', () => {
    const db = fixture()
    db.constraints = [{ ...meta, id: 'c', name: 'FF até 1h/dia', kind: 'max_minutes_per_day', limit: 60, projectId: 'proj-fashionfinder', active: true }]
    db.events = [event('Longo', '2026-11-10', '10:00', '12:00', { projectId: 'proj-fashionfinder' })]
    expect(run(db).cap.projects[0].overLimit).toEqual({ limitMin: 60, days: ['2026-11-10'] })
  })
})

describe('feasibility', () => {
  it('interval helpers', () => {
    expect(mergeIntervals([{ start: 60, end: 120 }, { start: 100, end: 180 }, { start: 200, end: 210 }])).toEqual([{ start: 60, end: 180 }, { start: 200, end: 210 }])
    expect(gapsBetween([{ start: 60, end: 120 }], 0, 180)).toEqual([{ start: 0, end: 60 }, { start: 120, end: 180 }])
  })

  it('detects overlaps (not with the BASE work hours) and suggests a move in text', () => {
    const db = fixture()
    db.events = [event('Dentista', '2026-11-11', '18:00', '19:00'), event('Call com Ana', '2026-11-11', '18:30', '19:30')]
    db.tasks = [task('Ligar banco', { date: '2026-11-11', time: '18:15', durationMin: 30 })]
    const { feas } = run(db)
    const wed = feas.days.find((d) => d.date === '2026-11-11')!
    expect(wed.overlaps.length).toBe(3)
    expect(feas.days.find((d) => d.date === '2026-11-10')!.overlaps).toEqual([])
    expect(feas.suggestions.some((s) => /^Mover "Ligar banco" para quarta \d\d:\d\d/.test(s))).toBe(true)
    // Nothing was written.
    expect(db.tasks[0].time).toBe('18:15')
  })

  it('acknowledged overlaps stay out', () => {
    const db = fixture()
    db.events = [event('A', '2026-11-11', '18:00', '19:00'), event('B', '2026-11-11', '18:30', '19:30')]
    db.conflictAcks = [{ ...meta, id: 'k', key: 'overlap:2026-11-11:A+B' } as DB['conflictAcks'][number]]
    expect(run(db).feas.overlaps).toEqual([])
  })

  it('days with < 1h free are flagged, with a suggestion', () => {
    const db = fixture()
    db.events = [event('Curso', '2026-11-12', '07:00', '09:00'), event('Jantar', '2026-11-12', '17:30', '22:30')]
    db.tasks = [task('Estudar', { date: '2026-11-12', time: '22:30', durationMin: 30 })]
    const { feas } = run(db)
    const thu = feas.days.find((d) => d.date === '2026-11-12')!
    expect(thu.freeMin).toBe(0)
    expect(thu.tight).toBe(true)
    expect(feas.tightDays).toEqual(['2026-11-12'])
    expect(feas.suggestions.some((s) => s.startsWith('Quinta fica com 0 h livre'))).toBe(true)
    const mon = feas.days[0]
    expect(mon.busyMin).toBe(8.5 * 60)
    expect(mon.freeMin).toBe(16 * 60 - 8.5 * 60)
  })
})
