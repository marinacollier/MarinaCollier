import { describe, expect, it } from 'vitest'
import { emptyDB, SCHEMA_VERSION } from '@/data/defaults'
import type { DB, NotificationPref, Task } from '@/data/types'
import { addDays, toInstant, weekday } from '@/lib/date'
import { backupFilename, makeBackup, validateBackup } from './backup'
import { BOM, datasetCSV, escapeCell, toCSV } from './csv'
import { computeDueNotifications } from './notifications'

const T = '2026-01-01T00:00:00.000Z'
const meta = { createdAt: T, updatedAt: T }

describe('validateBackup', () => {
  it('accepts a good backup and counts collections', () => {
    const db = emptyDB()
    db.tasks = [{ id: 't1', ...meta, title: 'A', status: 'todo', order: 0 }]
    const r = validateBackup(JSON.parse(JSON.stringify(makeBackup(db))))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.total).toBe(1)
    expect(r.counts).toEqual([{ key: 'tasks', label: 'Tarefas', count: 1 }])
    expect(r.upgraded).toBe(false)
  })

  it('accepts a bare DB and an older schema (flagged for upgrade)', () => {
    const bare = { ...emptyDB(), schemaVersion: 0 }
    const r = validateBackup(bare)
    expect(r.ok && r.upgraded).toBe(true)
    const wrapped = validateBackup({ app: 'marina-os', schemaVersion: 0, db: { profile: { name: 'M' }, tasks: [] } })
    expect(wrapped.ok).toBe(true)
  })

  it('rejects bad shapes', () => {
    expect(validateBackup(null).ok).toBe(false)
    expect(validateBackup([]).ok).toBe(false)
    expect(validateBackup({ app: 'other', db: emptyDB() }).ok).toBe(false)
    expect(validateBackup({ app: 'marina-os' }).ok).toBe(false)
    expect(validateBackup({ app: 'marina-os', db: { tasks: [] } }).ok).toBe(false)
    expect(validateBackup({ app: 'marina-os', db: { profile: {}, tasks: 'x' } }).ok).toBe(false)
    expect(validateBackup({ app: 'marina-os', db: { profile: {}, tasks: [{ title: 'sem id' }] } }).ok).toBe(false)
    expect(validateBackup({ app: 'marina-os', db: { profile: {} } }).ok).toBe(false)
  })

  it('rejects backups from a newer schema', () => {
    const r = validateBackup({ app: 'marina-os', schemaVersion: SCHEMA_VERSION + 1, db: emptyDB() })
    expect(r.ok).toBe(false)
  })

  it('names the file by São Paulo date', () => {
    // 01:30 UTC on Oct 3 is still Oct 2 in São Paulo
    expect(backupFilename(new Date('2026-10-03T01:30:00Z'))).toBe('marina-os-backup-2026-10-02.json')
  })
})

describe('csv', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(escapeCell('simples')).toBe('simples')
    expect(escapeCell('a,b')).toBe('"a,b"')
    expect(escapeCell('ela disse "oi"')).toBe('"ela disse ""oi"""')
    expect(escapeCell('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"')
    expect(escapeCell(' espaço')).toBe('" espaço"')
    expect(escapeCell(undefined)).toBe('')
    expect(escapeCell(null)).toBe('')
    expect(escapeCell(true)).toBe('sim')
    expect(escapeCell(3.5)).toBe('3.5')
  })

  it('builds a CSV with BOM and CRLF', () => {
    const csv = toCSV(['A', 'B'], [['x', 'y,z']])
    expect(csv.startsWith(BOM)).toBe(true)
    expect(csv).toBe(`${BOM}A,B\r\nx,"y,z"\r\n`)
    expect(toCSV(['A'], [], { bom: false })).toBe('A\r\n')
  })

  it('exports expenses with category name and decimal comma', () => {
    const db = emptyDB()
    db.financialCategories = [{ id: 'cat-mercado', ...meta, name: 'Mercado', emoji: '🛒', tone: 'sage', order: 0, archived: false }]
    db.expenses = [{ id: 'e1', ...meta, title: 'Feira, frutas', amountCents: 123456, date: '2026-10-02', categoryId: 'cat-mercado', status: 'paid', origin: 'manual' }]
    const lines = datasetCSV(db, 'gastos').replace(BOM, '').split('\r\n')
    expect(lines[0]).toContain('Valor (R$)')
    expect(lines[1]).toBe('02/10/2026,"Feira, frutas","1234,56",Mercado,,pago,,')
  })

  it('every dataset produces a header even when empty', () => {
    const db = emptyDB()
    for (const id of ['gastos', 'tarefas', 'treinos', 'livros', 'estudos', 'wins'] as const) {
      expect(datasetCSV(db, id).split('\r\n').length).toBe(2)
    }
  })
})

describe('computeDueNotifications', () => {
  const DAY = '2026-10-07' // a Wednesday
  const allOn: NotificationPref[] = [
    { category: 'compromisso', enabled: true, leadMinutes: 30 },
    { category: 'deadline', enabled: true },
    { category: 'treino', enabled: true, leadMinutes: 60 },
    { category: 'rotina', enabled: true },
    { category: 'viagem', enabled: true },
    { category: 'waiting_for', enabled: true },
    { category: 'revisao_semanal', enabled: true },
  ]
  const task = (p: Partial<Task>): Task => ({ id: 'x', ...meta, title: 'T', status: 'todo', order: 0, ...p })

  function base(): DB {
    const db = emptyDB()
    db.events = [
      { id: 'ev1', ...meta, sourceId: 'cal', title: 'Reunião', date: DAY, startTime: '10:00', allDay: false },
      { id: 'ev2', ...meta, sourceId: 'cal', title: 'Tarde', date: DAY, startTime: '15:00', allDay: false },
    ]
    return db
  }

  it('next event only inside the lead window', () => {
    const db = base()
    const at = (hm: string) => computeDueNotifications(db, toInstant(DAY, hm), allOn).filter((n) => n.category === 'compromisso')
    expect(at('09:20')).toHaveLength(0)
    const due = at('09:40')
    expect(due).toHaveLength(1)
    expect(due[0].id).toBe(`compromisso:ev1:${DAY}`)
    expect(due[0].title).toContain('em 20 min')
    expect(at('10:05')).toHaveLength(0)
  })

  it('respects disabled categories', () => {
    const db = base()
    const prefs = allOn.map((p) => (p.category === 'compromisso' ? { ...p, enabled: false } : p))
    expect(computeDueNotifications(db, toInstant(DAY, '09:40'), prefs).some((n) => n.category === 'compromisso')).toBe(false)
  })

  it('deadline today for open tasks only', () => {
    const db = emptyDB()
    db.tasks = [task({ id: 'a', dueDate: DAY }), task({ id: 'b', dueDate: DAY, status: 'done' }), task({ id: 'c', dueDate: addDays(DAY, 1) })]
    const due = computeDueNotifications(db, toInstant(DAY, '08:00'), allOn).filter((n) => n.category === 'deadline')
    expect(due.map((n) => n.id)).toEqual([`deadline:a:${DAY}`])
  })

  it("today's planned workout: timed within lead, untimed after morning starts", () => {
    const db = emptyDB()
    db.workouts = [
      { id: 'w1', ...meta, date: DAY, time: '18:00', modality: 'corrida', status: 'planejado', order: 0 },
      { id: 'w2', ...meta, date: DAY, modality: 'yoga', status: 'planejado', order: 1 },
      { id: 'w3', ...meta, date: DAY, time: '17:30', modality: 'bike', status: 'feito', order: 2 },
    ]
    const ids = (hm: string) => computeDueNotifications(db, toInstant(DAY, hm), allOn).filter((n) => n.category === 'treino').map((n) => n.id)
    expect(ids('02:00')).toEqual([])
    expect(ids('09:00')).toEqual([`treino:w2:${DAY}`])
    expect(ids('17:15')).toEqual([`treino:w1:${DAY}`, `treino:w2:${DAY}`])
  })

  it('trip 7 days and 1 day before', () => {
    const db = emptyDB()
    db.trips = [
      { id: 'tr', ...meta, name: 'Recife', flag: '🇧🇷', startDate: addDays(DAY, 7), datesConfirmed: true, interests: [], tone: 'ocean', links: [], status: 'confirmada', order: 0 },
    ]
    const v = (d: string) => computeDueNotifications(db, toInstant(d, '09:00'), allOn).filter((n) => n.category === 'viagem')
    expect(v(DAY)[0]?.id).toBe('viagem:tr:7')
    expect(v(addDays(DAY, 1))).toHaveLength(0)
    expect(v(addDays(DAY, 6))[0]?.title).toContain('amanhã')
  })

  it('waiting-for older than 7 days, aggregated', () => {
    const db = emptyDB()
    db.tasks = [
      task({ id: 'w1', status: 'waiting', waiting: { who: 'Ana', since: addDays(DAY, -10) } }),
      task({ id: 'w2', status: 'waiting', waiting: { who: 'Bia', since: addDays(DAY, -3) } }),
    ]
    const due = computeDueNotifications(db, toInstant(DAY, '09:00'), allOn).filter((n) => n.category === 'waiting_for')
    expect(due).toHaveLength(1)
    expect(due[0].title).toContain('Ana')
  })

  it('weekly review on Sunday evening unless already done', () => {
    let sunday = DAY
    while (weekday(sunday) !== 0) sunday = addDays(sunday, 1)
    const db = emptyDB()
    const r = (hm: string) => computeDueNotifications(db, toInstant(sunday, hm), allOn).filter((n) => n.category === 'revisao_semanal')
    expect(r('10:00')).toHaveLength(0)
    expect(r('19:00')).toHaveLength(1)
    expect(computeDueNotifications(db, toInstant(DAY, '19:00'), allOn).some((n) => n.category === 'revisao_semanal')).toBe(false)
    db.weeklyReviews = [{ id: 'r', ...meta, weekStart: addDays(sunday, -6), answers: {}, nextPriorities: [], completedAt: T }]
    expect(r('19:00')).toHaveLength(0)
  })

  it('morning routine reminder only in the morning with pending items', () => {
    const db = emptyDB()
    db.routines = [{ id: 'routine-manha', ...meta, name: 'Minha manhã', period: 'manha', order: 0, active: true }]
    db.routineItems = [{ id: 'ri', ...meta, routineId: 'routine-manha', title: 'Água', recurrence: { kind: 'daily' }, order: 0, active: true }]
    const r = (hm: string) => computeDueNotifications(db, toInstant(DAY, hm), allOn).filter((n) => n.category === 'rotina')
    expect(r('07:00')).toHaveLength(1)
    expect(r('14:00')).toHaveLength(0)
    db.occurrences = [{ id: 'o', ...meta, parentType: 'routineItem', parentId: 'ri', date: DAY, status: 'done' }]
    expect(r('07:00')).toHaveLength(0)
  })
})
