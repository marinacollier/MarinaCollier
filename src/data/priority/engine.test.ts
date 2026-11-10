/**
 * Motor de prioridade: capacidade (compromissos, trabalho, folgas, margem, energia), MoSCoW contextual,
 * essenciais nunca descartados, energia baixa, 20 % livre, interesse do dia, estudos sem dominar.
 */
import { describe, expect, it, vi } from 'vitest'
import { emptyDB } from '../defaults'
import type { CalendarEvent, DB, Goal, PetTask, Pet, Task } from '../types'
import { CAPACITY, dayCapacity } from './capacity'
import { interestOf, learnedPreference, moscowOf, planDay, planFromCandidates, rankCandidates } from './engine'
import { taskCandidates } from './sources'
import type { Candidate, DayContext } from './contract'

// The engine's own rules are tested in isolation; study candidates have their own tests (features/learning).
vi.mock('@/features/learning/candidates', () => ({ studyCandidates: () => [] }))

const AT = '2026-11-01T10:00:00.000Z'
const ent = { createdAt: AT, updatedAt: AT }
const MON = '2026-11-09'
const SAT = '2026-11-14'

function base(patch: Partial<DB> = {}): DB {
  const db = emptyDB()
  return {
    ...db,
    ...patch,
    profile: {
      ...db.profile,
      rhythm: { wakeTime: '07:00', sleepTime: '23:00' },
    },
  }
}

const task = (p: Partial<Task> & { id: string; title: string }): Task => ({
  ...ent,
  status: 'todo',
  order: 0,
  ...p,
})
const event = (p: Partial<CalendarEvent> & { id: string; title: string; date: string }): CalendarEvent => ({ ...ent, sourceId: 'local', allDay: false, ...p })

const ctx = (p: Partial<DayContext> = {}): DayContext => ({
  date: MON,
  freeMin: 120,
  energy: 3,
  now: '18:00',
  ...p,
})

describe('capacity', () => {
  it('free day (Saturday): now → sleep, minus meals reserve, 15 % margin', () => {
    const c = dayCapacity(base(), SAT, 14 * 60 + 30) // 14:30 → 23:00 = 510 min; jantar 40 reserved
    expect(c.openMin).toBe(510)
    expect(c.reserveMin).toBe(40)
    expect(c.freeMin).toBe(Math.floor((470 * (1 - CAPACITY.margin)) / 5) * 5)
    expect(c.windows).toEqual([{ start: '14:30', end: '23:00' }])
  })

  it('work hours are busy on a work day (mode brasil), with 10-min buffers', () => {
    const c = dayCapacity(base(), MON, 8 * 60) // 08:00; work 09:00–18:00 → busy 08:50–18:10
    expect(c.windows).toEqual([
      { start: '08:00', end: '08:50' },
      { start: '18:10', end: '23:00' },
    ])
    expect(c.openMin).toBe(50 + 290)
  })

  it('a real event takes its time + buffers; suggested base-day blocks do not', () => {
    const db = base({
      events: [
        event({
          id: 'e1',
          title: 'Jantar com Ana',
          date: SAT,
          startTime: '19:00',
          endTime: '20:00',
        }),
      ],
    })
    db.profile.dayPlan = {
      blocks: [
        {
          id: 'b1',
          title: 'Leitura',
          category: 'estudo',
          weekdays: [6],
          start: '16:00',
          end: '17:00',
          kind: 'sugerido',
        },
      ],
    }
    const c = dayCapacity(db, SAT, 15 * 60)
    expect(c.windows).toEqual([
      { start: '15:00', end: '18:50' },
      { start: '20:10', end: '23:00' },
    ])
  })

  it('essential base blocks (luna, almoço…) are busy', () => {
    const db = base()
    db.profile.dayPlan = {
      blocks: [
        {
          id: 'b1',
          title: 'Passeio Luna',
          category: 'luna',
          weekdays: [6],
          start: '17:00',
          end: '17:30',
          kind: 'base',
        },
      ],
    }
    expect(dayCapacity(db, SAT, 15 * 60).windows[0]).toEqual({
      start: '15:00',
      end: '16:50',
    })
  })

  it('energy factor shrinks focus, never free time', () => {
    const lo = dayCapacity(base(), SAT, 15 * 60, 1)
    const hi = dayCapacity(base(), SAT, 15 * 60, 5)
    expect(lo.freeMin).toBe(hi.freeMin)
    expect(hi.focusMin).toBe(hi.freeMin)
    expect(lo.focusMin).toBe(Math.floor((lo.freeMin * 0.4) / 5) * 5)
  })
})

describe('MoSCoW', () => {
  it('a deadline coming within 48 h flips should → must', () => {
    const goal: Goal = {
      ...ent,
      id: 'g',
      level: 'maior',
      title: 'Inglês fluente',
      category: 'estudo',
      big: true,
      status: 'ativa',
      order: 0,
    }
    const far = task({
      id: 't',
      title: 'Redação',
      goalId: 'g',
      dueDate: '2026-11-20',
    })
    const db = base({ goals: [goal], tasks: [far] })
    const [c] = taskCandidates(db, ctx())
    expect(moscowOf(db, c, ctx()).moscow).toBe('should')
    const near = {
      ...c,
      deadline: '2026-11-11',
      task: { ...far, dueDate: '2026-11-11' },
    }
    expect(moscowOf(db, near, ctx()).moscow).toBe('must')
  })

  it('prep for a meeting tonight outranks a high-priority task carried from before', () => {
    const db = base({
      tasks: [task({ id: 'old', title: 'Solucionar conta Google', priority: 'alta', date: '2026-11-05' })],
      events: [event({ id: 'm', title: 'Fashion Finder — Tutorial', date: MON, startTime: '21:00', endTime: '22:00', url: 'https://meet.google.com/abc-defg-hij' })],
    })
    const ranked = rankCandidates(db, ctx())
    expect(ranked[0].title).toBe('Preparar: Fashion Finder — Tutorial')
    expect(ranked[0].moscow).toBe('must')
    expect(planDay(db, ctx()).primary?.c.title).toBe('Preparar: Fashion Finder — Tutorial')
  })

  it('explicit moscow wins; carried tasks are must; plain backlog is could', () => {
    const db = base({
      tasks: [task({ id: 'a', title: 'A', moscow: 'could', dueDate: MON }), task({ id: 'b', title: 'B', date: '2026-11-05' }), task({ id: 'c', title: 'C' })],
    })
    const r = Object.fromEntries(rankCandidates(db, ctx()).map((c) => [c.key, c.moscow]))
    expect(r).toEqual({
      'task:a': 'could',
      'task:b': 'must',
      'task:c': 'could',
    })
  })

  it('waiting / done / archived tasks and tasks of concluded projects are not candidates', () => {
    const db = base({
      projects: [
        {
          ...ent,
          id: 'p',
          name: 'Velho',
          emoji: '',
          tone: 'olive',
          status: 'concluido',
          priority: 'media',
          links: [],
          files: [],
          people: [],
          decisions: [],
          changelog: [],
          kind: 'default',
          order: 0,
        } as never,
      ],
      tasks: [
        task({ id: 'w', title: 'W', status: 'waiting' }),
        task({ id: 'd', title: 'D', status: 'done' }),
        task({ id: 'x', title: 'X', status: 'archived' }),
        task({ id: 'p1', title: 'P', projectId: 'p' }),
      ],
    })
    expect(rankCandidates(db, ctx())).toEqual([])
  })

  it('a real meeting in the next 48 h creates "Preparar: X" as must', () => {
    const db = base({
      events: [
        event({
          id: 'm',
          title: 'Reunião com cliente',
          date: '2026-11-10',
          startTime: '10:00',
          endTime: '11:00',
        }),
      ],
    })
    const [c] = rankCandidates(db, ctx())
    expect(c.title).toBe('Preparar: Reunião com cliente')
    expect(c.moscow).toBe('must')
    expect(c.reasons.join(' ')).toMatch(/48 h/)
  })

  it('reasons carry every score component', () => {
    const db = base({
      tasks: [
        task({
          id: 'r',
          title: 'R',
          dueDate: '2026-11-10',
          rice: { reach: 5, impact: 5, confidence: 1, effort: 1 },
        }),
      ],
    })
    const [c] = rankCandidates(db, ctx())
    expect(c.score).toBe(60 + 20)
    expect(c.reasons.some((r) => r.startsWith('Impacto (RICE) 60'))).toBe(true)
    expect(c.reasons.some((r) => r.startsWith('Urgência 20'))).toBe(true)
  })
})

describe('planDay', () => {
  const many = () =>
    base({
      tasks: Array.from({ length: 6 }, (_, i) => task({ id: `t${i}`, title: `Tarefa ${i}`, durationMin: 30, date: MON })),
    })

  it('essentials are always there, whatever the scores (Luna, meals, sleep)', () => {
    const pet: Pet = { ...ent, id: 'luna', name: 'Luna' } as Pet
    const walk: PetTask = {
      ...ent,
      id: 'pw',
      petId: 'luna',
      title: 'Passeio da Luna',
      category: 'passeio',
      recurrence: { kind: 'daily' } as never,
      active: true,
      order: 0,
    }
    const db = { ...many(), pets: [pet], petTasks: [walk] }
    const p = planDay(db, ctx({ freeMin: 0, energy: 1 }))
    const keys = p.essentials.map((e) => e.key)
    expect(keys).toContain('luna:pw')
    expect(keys).toContain('sleep')
    expect(p.essentials.every((e) => e.essential && e.moscow === 'must')).toBe(true)
    expect(p.later.some((l) => l.c.essential)).toBe(false)
  })

  it('keeps ≥ 20 % of the free time as Espaço livre and picks 1 primary + ≤ 2 secondary', () => {
    const p = planDay(many(), ctx({ freeMin: 100, energy: 4 }))
    expect(p.primary).toBeTruthy()
    expect(p.secondary.length).toBeLessThanOrEqual(2)
    const used = p.primary!.minutes + p.secondary.reduce((s, i) => s + i.minutes, 0)
    expect(used).toBeLessThanOrEqual(80)
    expect(p.freeSpaceMin).toBeGreaterThanOrEqual(20)
    expect(p.later.length).toBe(6 - 1 - p.secondary.length)
  })

  it('low energy: shorter items, at most 1 secondary, rest suggested', () => {
    const db = base({
      tasks: [
        task({ id: 'big', title: 'Grande', durationMin: 90, date: MON }),
        task({ id: 's1', title: 'S1', durationMin: 20, date: MON }),
        task({ id: 's2', title: 'S2', durationMin: 20, date: MON }),
        task({ id: 's3', title: 'S3', durationMin: 20, date: MON }),
      ],
    })
    const p = planDay(db, ctx({ freeMin: 240, energy: 2 }))
    expect(p.lowEnergy).toBe(true)
    expect(p.secondary.length).toBeLessThanOrEqual(1)
    for (const i of [p.primary!, ...p.secondary]) expect(i.minutes).toBeLessThanOrEqual(30)
    expect(p.restHint).toMatch(/descansar/)
  })

  it('energy-heavy items wait with a kind reason', () => {
    const db = base({
      tasks: [task({ id: 'h', title: 'Pesada', energyNeed: 5, date: MON })],
    })
    const p = planDay(db, ctx({ energy: 2 }))
    expect(p.primary).toBeUndefined()
    expect(p.later[0].why).toBe('Pede mais energia do que tu tem hoje')
  })

  it('skipped keys go to Podem esperar with her reason; deterministic', () => {
    const p1 = planDay(many(), ctx(), { skip: { 'task:t0': 'Hoje não' } })
    const p2 = planDay(many(), ctx(), { skip: { 'task:t0': 'Hoje não' } })
    expect(p1).toEqual(p2)
    expect(p1.later.find((l) => l.c.key === 'task:t0')?.why).toBe('Hoje não')
    expect(p1.primary?.c.key).not.toBe('task:t0')
  })

  it('suggests a time slot from the capacity windows', () => {
    const p = planDay(many(), ctx({ now: '18:00' }), {
      windows: [{ start: '18:10', end: '23:00' }],
    })
    expect(p.primary?.slot).toEqual({ start: '18:10', end: '18:40' })
  })
})

describe('interest of the day', () => {
  it('reads rest, wants and avoids', () => {
    expect(interestOf('quero descansar').rest).toBe(true)
    expect(interestOf('não quero idiomas').avoid).toContain('ingles')
    expect(interestOf('quero estudar política').want).toContain('politica')
  })

  it('"não quero idiomas" sends language items to Podem esperar; a stated interest boosts', () => {
    const db = base({
      tasks: [
        task({ id: 'en', title: 'Inglês: listening', date: MON }),
        task({ id: 'po', title: 'Ler sobre política', date: MON }),
        task({ id: 'x', title: 'Organizar armário', date: MON }),
      ],
    })
    const p = planDay(db, ctx({ interest: 'não quero idiomas, quero política' }))
    expect(p.later.find((l) => l.c.key === 'task:en')?.why).toBe('Tu disse que hoje não')
    expect(p.primary?.c.key).toBe('task:po')
  })

  it('"quero descansar": no study, nothing beyond a must, rest proposed', () => {
    const db = base({
      tasks: [task({ id: 'a', title: 'A', date: MON }), task({ id: 'm', title: 'M', dueDate: MON })],
    })
    const p = planDay(db, ctx({ interest: 'quero descansar' }))
    expect(p.primary?.c.key).toBe('task:m')
    expect(p.secondary).toEqual([])
    expect(p.restHint).toMatch(/descansar/)
  })
})

describe('study never dominates', () => {
  it('only the best 2 study candidates compete', () => {
    const studies: Candidate[] = [1, 2, 3, 4].map((i) => ({
      key: `study:s${i}`,
      title: `Estudo ${i}`,
      area: 'idiomas',
      minMin: 10,
      maxMin: 20,
      energyNeed: 2,
      moscow: 'should',
      score: 90 - i,
      reasons: ['x'],
      open: { kind: 'study' },
    }))
    const p = planFromCandidates(base(), ctx({ freeMin: 300, energy: 4 }), studies)
    const waiting = p.later.filter((l) => l.why === 'Um ou dois estudos por dia já bastam')
    expect(waiting.map((l) => l.c.key)).toEqual(['study:s3', 'study:s4'])
  })
})

describe('preferência aprendida de horário', () => {
  const ck = (date: string, start: string, by: 'marina' | 'motor' = 'marina') => ({ id: date, date, changes: [], createdAt: '', updatedAt: '', blocks: [{ key: 'study:lang:en', start, end: '23:59', status: 'planejado' as const, by, title: 'x', at: '' }] })
  it('3+ days moving studies to the morning → morning first; one move or engine moves never teach', () => {
    expect(learnedPreference({ dayCheckins: [ck('2026-11-01', '08:00'), ck('2026-11-03', '07:30'), ck('2026-11-05', '09:00')] }, '2026-11-09').study).toBe('manha')
    expect(learnedPreference({ dayCheckins: [ck('2026-11-01', '08:00')] }, '2026-11-09').study).toBeUndefined()
    expect(learnedPreference({ dayCheckins: [ck('2026-11-01', '08:00', 'motor'), ck('2026-11-02', '08:00', 'motor'), ck('2026-11-03', '08:00', 'motor')] }, '2026-11-09').study).toBeUndefined()
  })
  it('a preferred part of the day is tried first when placing', () => {
    const c: Candidate = { key: 'study:x', title: 'Estudo', area: 'idiomas', minMin: 20, maxMin: 20, energyNeed: 2, moscow: 'should', score: 50, reasons: [] }
    const windows = [{ start: '07:00', end: '08:00' }, { start: '15:00', end: '16:00' }]
    const db = base()
    expect(planFromCandidates(db, ctx({ now: '06:00' }), [c], { windows, prefer: () => 'tarde' }).primary?.slot?.start).toBe('15:00')
    expect(planFromCandidates(db, ctx({ now: '06:00' }), [c], { windows }).primary?.slot?.start).toBe('07:00')
  })
})
