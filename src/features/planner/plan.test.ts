import { beforeEach, describe, expect, it } from 'vitest'
import { emptyDB } from '@/data/defaults'
import { getDB, useStore } from '@/data/store'
import type { DB, Workout } from '@/data/types'
import { commitPlan } from './commit'
import {
  buildOps,
  cancelOncePatch,
  defaultWeekStart,
  emptyDraft,
  flexSuggestions,
  gatherFixed,
  moveOptions,
  personalLife,
  planConflicts,
  plannedSummaryLine,
  plannedTemplateId,
  plannedWorkouts,
  planDays,
  studyGoalTitle,
  studyOptions,
  top3Room,
  trainingLines,
  workDeadlines,
  weekTrips,
  weekLoad,
  lineDate,
  type WeekDraft,
} from './plan'

const meta = { createdAt: '', updatedAt: '' }
// 2026-10-05 is a Monday. Planning "next week" from Sunday 2026-10-04.
const WS = '2026-10-05'
const TODAY = '2026-10-04'

function fixture(): DB {
  const db = emptyDB()
  db.profile.work = {
    start: '09:00',
    end: '18:00',
    location: 'Escritório',
    days: { 0: 'off', 1: 'remoto', 2: 'presencial', 3: 'presencial', 4: 'remoto', 5: 'remoto', 6: 'off' },
    commuteBeforeMin: 60,
    commuteAfterMin: 60,
    presencialChecklist: [],
  }
  db.constraints = [{ ...meta, id: 'c1', name: 'Pass — 1 check-in/dia', kind: 'max_checkins_per_day', limit: 1, modalities: ['natacao', 'yoga', 'musculacao'], active: true }]
  db.weekTemplate = [
    { ...meta, id: 't-seg', weekday: 1, modalities: ['corrida'], choice: 'fixed', period: 'manha', planType: 'base', order: 0, active: true },
    { ...meta, id: 't-qua', weekday: 3, modalities: ['natacao'], choice: 'fixed', time: '07:00', durationMin: 60, planType: 'base', order: 0, active: true },
    { ...meta, id: 't-qua-forca', weekday: 3, modalities: ['musculacao'], choice: 'optional', planType: 'flexivel', order: 1, active: true },
    { ...meta, id: 't-qui', weekday: 4, modalities: ['bike', 'corrida'], choice: 'one_of', time: '06:00', planType: 'flexivel', order: 0, active: true },
    { ...meta, id: 't-dom', weekday: 0, modalities: [], choice: 'rest', title: 'Recovery / OFF', planType: 'base', order: 0, active: true },
  ]
  db.events = [
    { ...meta, id: 'e-cer', sourceId: 's', title: 'Atelier', date: '2026-09-28', allDay: false, period: 'noite', planType: 'base', category: 'Vida / Criatividade', kind: 'criatividade', recurrence: { kind: 'weekly', weekdays: [1, 4] } },
    { ...meta, id: 'e-rev', sourceId: 's', title: 'Review semanal', date: '2026-10-03', startTime: '09:00', allDay: false, planType: 'fixo', recurrence: { kind: 'weekly', weekdays: [6] } },
    { ...meta, id: 'e-jantar', sourceId: 's', title: 'Jantar com amigas', date: '2026-10-08', startTime: '20:00', allDay: false, kind: 'pessoal', planType: 'a_confirmar' },
  ]
  db.workoutGoals = [
    { ...meta, id: 'g-yoga', title: 'Yoga', kind: 'habit', modality: 'yoga', startDate: '2026-09-01', milestones: [], status: 'ativa', perWeek: 1, planType: 'flexivel', preferredWeekdays: [4] },
  ]
  return db
}

const draftWith = (patch: Partial<WeekDraft> = {}): WeekDraft => ({ ...emptyDraft(WS), ...patch })

describe('week', () => {
  it('defaults to next week on weekends and the current week on weekdays', () => {
    expect(defaultWeekStart('2026-10-02')).toBe('2026-09-28') // Friday
    expect(defaultWeekStart('2026-10-03')).toBe('2026-10-05') // Saturday
    expect(defaultWeekStart('2026-10-04')).toBe('2026-10-05') // Sunday
    expect(planDays('2026-09-28', '2026-10-02')).toEqual(['2026-10-02', '2026-10-03', '2026-10-04'])
  })
})

describe('step 1 · fixos', () => {
  it('lists presencial work, anchored events and BASE template trainings per day', () => {
    const days = gatherFixed(fixture(), WS)
    expect(days).toHaveLength(7)
    const mon = days[0]
    expect(mon.mode).toBe('remoto')
    expect(mon.entries.map((e) => e.title)).toEqual(['Corrida', 'Atelier'])
    expect(mon.entries.find((e) => e.title === 'Atelier')?.cancellable).toBe(true)
    const wed = days[2]
    expect(wed.entries.map((e) => e.kind)).toEqual(['template', 'work'])
    expect(wed.entries.some((e) => e.kind === 'template' && e.time === '07:00')).toBe(true)
    // flexible / a_confirmar things are not "fixos"
    expect(days[3].entries.some((e) => e.title === 'Jantar com amigas')).toBe(false)
    expect(days[5].entries.some((e) => e.title === 'Review semanal')).toBe(true)
  })

  it('cancels one occurrence via exdates only', () => {
    const db = fixture()
    const e = db.events[0]
    const patch = cancelOncePatch(e, '2026-10-05')
    db.events[0] = { ...e, ...patch }
    expect(gatherFixed(db, WS)[0].entries.some((x) => x.title === 'Atelier')).toBe(false)
    expect(gatherFixed(db, WS)[3].entries.some((x) => x.title === 'Atelier')).toBe(true)
    expect(cancelOncePatch(db.events[0], '2026-10-05').exdates).toEqual(['2026-10-05'])
  })

  it('finds trips touching the week', () => {
    const db = fixture()
    db.trips = [
      { ...meta, id: 'tr1', name: 'Praia', flag: '🌴', startDate: '2026-10-10', endDate: '2026-10-20', datesConfirmed: true, interests: [], tone: 'ocean', links: [], status: 'planejando', order: 0 },
      { ...meta, id: 'tr2', name: 'Longe', flag: '✈️', startDate: '2026-11-10', datesConfirmed: true, interests: [], tone: 'ocean', links: [], status: 'planejando', order: 1 },
    ]
    expect(weekTrips(db, WS).map((t) => t.id)).toEqual(['tr1'])
  })
})

describe('step 2 · treinos', () => {
  it('turns the template into lines: fixed pre-checked, one_of/optional need a choice', () => {
    const lines = trainingLines(fixture(), WS, TODAY)
    const byId = Object.fromEntries(lines.map((l) => [l.templateId, l]))
    expect(byId['t-seg'].defaultPick).toBe('corrida')
    expect(byId['t-qui'].defaultPick).toBeNull()
    expect(byId['t-qui'].options).toEqual(['bike', 'corrida'])
    expect(byId['t-qua-forca'].defaultPick).toBeNull()
    expect(byId['t-dom'].defaultPick).toBe('recuperacao')
  })

  it('skips past days and lines already materialized (even if moved to another day)', () => {
    const db = fixture()
    db.workouts = [{ ...meta, id: 'x', date: '2026-10-06', modality: 'corrida', status: 'planejado', templateId: 't-seg', order: 0 }]
    expect(trainingLines(db, WS, TODAY).some((l) => l.templateId === 't-seg')).toBe(false)
    expect(trainingLines(fixture(), WS, '2026-10-08').map((l) => l.date).every((d) => d >= '2026-10-08')).toBe(true)
  })

  it('builds planned workouts from picks, with deterministic ids', () => {
    const db = fixture()
    const lines = trainingLines(db, WS, TODAY)
    const planned = plannedWorkouts(db, draftWith({ picks: { 't-qui': 'bike', 't-seg': null } }), lines)
    expect(planned.find((w) => w.templateId === 't-qui')?.modality).toBe('bike')
    expect(planned.some((w) => w.templateId === 't-seg')).toBe(false)
    expect(planned.find((w) => w.templateId === 't-dom')?.status).toBe('descanso')
    expect(planned.find((w) => w.templateId === 't-qua')?.id).toBe(plannedTemplateId(WS, 't-qua'))
    expect(plannedSummaryLine(db, WS, planned)).toBe('1 natação · 1 bike · 1 recovery')
  })

  it('suggests flexible windows that respect the simulated plan', () => {
    const db = fixture()
    const lines = trainingLines(db, WS, TODAY)
    const planned = plannedWorkouts(db, draftWith(), lines)
    const s = flexSuggestions(db, db.workoutGoals[0], WS, TODAY, planned)
    expect(s.length).toBeGreaterThan(0)
    // Wednesday already has the swim (same check-in) → never suggested for yoga
    expect(s.some((x) => x.date === '2026-10-07')).toBe(false)
    expect(s[0].date).toBe('2026-10-08') // preferred weekday first
  })
})

describe('steps 3–5 · gathering', () => {
  it('offers active/continuous study tracks with current items', () => {
    const db = fixture()
    db.studyTracks = [
      { ...meta, id: 'tr-a', name: 'Idioma', emoji: '🗣️', tone: 'ocean', order: 0, archived: false, status: 'ativo' },
      { ...meta, id: 'tr-b', name: 'Pausado', emoji: '⏸️', tone: 'ink', order: 1, archived: false, status: 'pausado' },
    ]
    db.studyItems = [
      { ...meta, id: 'i1', trackId: 'tr-a', title: 'Conversação', kind: 'aula', status: 'proximo', progress: 0, order: 0 },
      { ...meta, id: 'i2', trackId: 'tr-a', title: 'Vocabulário', kind: 'tema', status: 'estudando', progress: 0, order: 1 },
      { ...meta, id: 'i3', trackId: 'tr-a', title: 'Antigo', kind: 'tema', status: 'finalizado', progress: 100, order: 2 },
    ]
    const opts = studyOptions(db)
    expect(opts.map((o) => o.track.id)).toEqual(['tr-a'])
    expect(opts[0].items.map((i) => i.id)).toEqual(['i2', 'i1'])
    expect(studyGoalTitle(db, { trackId: 'tr-a', itemId: 'i2' })).toBe('🗣️ Idioma — Vocabulário')
  })

  it('collects professional deadlines of the week', () => {
    const db = fixture()
    db.projects = [{ ...meta, id: 'p1', name: 'Projeto X', emoji: '🧪', tone: 'ink', status: 'ativo', priority: 'alta', links: [], files: [], people: [], decisions: [], changelog: [], kind: 'default', order: 0, nextDelivery: { title: 'Demo', date: '2026-10-09' } }]
    db.milestones = [
      { ...meta, id: 'm1', projectId: 'p1', title: 'Busca', date: '2026-10-07', done: false, order: 0, status: 'roadmap' },
      { ...meta, id: 'm2', projectId: 'p1', title: 'Feito', date: '2026-10-07', done: true, order: 1, status: 'feito' },
    ]
    db.tasks = [
      { ...meta, id: 't1', title: 'Mandar proposta', status: 'todo', dueDate: '2026-10-06', context: 'trabalho', order: 0 },
      { ...meta, id: 't2', title: 'Comprar ração', status: 'todo', dueDate: '2026-10-06', context: 'vida_real', order: 1 },
    ]
    const d = workDeadlines(db, WS)
    expect(d.map((x) => x.key)).toEqual(['task:t1', 'milestone:m1', 'delivery:p1'])
  })

  it('collects personal life: non-anchor events, pet care, life admin and next trip to confirm', () => {
    const db = fixture()
    db.pets = [{ ...meta, id: 'pet', name: 'Pet', species: 'cachorro', documents: [] }]
    db.petTasks = [
      { ...meta, id: 'pt1', petId: 'pet', title: 'Banho', category: 'banho', dueDate: '2026-10-07', active: true, order: 0 },
      { ...meta, id: 'pt2', petId: 'pet', title: 'Comida', category: 'alimentacao', recurrence: { kind: 'daily' }, active: true, order: 1 },
    ]
    db.tasks = [{ ...meta, id: 't2', title: 'Trocar filtro', status: 'todo', bucket: 'semana', context: 'vida_real', order: 1 }]
    db.trips = [{ ...meta, id: 'tr1', name: 'Praia', flag: '🌴', startDate: '2026-10-20', datesConfirmed: true, interests: [], tone: 'ocean', links: [], status: 'planejando', order: 0 }]
    db.tripItems = [
      { ...meta, id: 'ti1', tripId: 'tr1', section: 'voo', title: 'Revisar voo', status: 'a_confirmar', order: 0 },
      { ...meta, id: 'ti2', tripId: 'tr1', section: 'mala', title: 'Mala', status: 'feito', order: 1 },
    ]
    const life = personalLife(db, WS, TODAY)
    expect(life.events.map((e) => e.title)).toEqual(['Jantar com amigas'])
    expect(life.pet.map((p) => p.title)).toEqual(['Banho'])
    expect(life.tasks.map((t) => t.title)).toEqual(['Trocar filtro'])
    expect(life.trip?.items.map((i) => i.id)).toEqual(['ti1'])
  })
})

describe('step 6 · conflitos', () => {
  it('simulates chosen workouts and lets a planned one move to a calmer day', () => {
    const db = fixture()
    const lines = trainingLines(db, WS, TODAY)
    const draft = draftWith({ picks: { 't-qua-forca': 'musculacao' } })
    const planned = plannedWorkouts(db, draft, lines)
    const cs = planConflicts(db, WS, TODAY, planned)
    const checkin = cs.find((c) => c.kind === 'checkin_limit')!
    expect(checkin.date).toBe('2026-10-07')
    expect(db.workouts).toHaveLength(0) // nothing written
    const forcaId = plannedTemplateId(WS, 't-qua-forca')
    const opts = moveOptions(db, planned, forcaId, ['2026-10-05', '2026-10-07', '2026-10-09'])
    expect(opts.find((o) => o.date === '2026-10-09')?.conflicts).toBe(0)
    const moved = plannedWorkouts(db, { ...draft, moved: { [forcaId]: '2026-10-09' } }, lines)
    expect(planConflicts(db, WS, TODAY, moved).some((c) => c.kind === 'checkin_limit')).toBe(false)
  })
})

describe('load hierarchy (🔥 / PREP)', () => {
  const withKey = () => {
    const db = fixture()
    db.weekTemplate.push({
      ...meta,
      id: 't-sex',
      weekday: 5,
      modalities: ['corrida'],
      choice: 'fixed',
      time: '06:00',
      durationMin: 60,
      durationMaxMin: 75,
      planType: 'base',
      order: 0,
      active: true,
      isKeySession: true,
      isLongSession: true,
      loadCategory: 'key',
      requiresPreviousDayPrep: true,
      tags: ['long-run'],
    })
    return db
  }

  it('marks key sessions and the PREP day before them, from template data', () => {
    const db = withKey()
    const lines = trainingLines(db, WS, TODAY)
    expect(lines.find((l) => l.templateId === 't-sex')?.load.isKeySession).toBe(true)
    const load = weekLoad(db, WS, plannedWorkouts(db, draftWith(), lines))
    expect(load.find((d) => d.key)?.date).toBe('2026-10-09')
    expect(load.filter((d) => d.prepFor).map((d) => d.date)).toEqual(['2026-10-08'])
  })

  it('PREP follows the key session when it is moved', () => {
    const db = withKey()
    const lines = trainingLines(db, WS, TODAY)
    const id = plannedTemplateId(WS, 't-sex')
    const draft = draftWith({ moved: { [id]: '2026-10-10' } })
    const load = weekLoad(db, WS, plannedWorkouts(db, draft, lines))
    expect(load.find((d) => d.key)?.date).toBe('2026-10-10')
    expect(load.filter((d) => d.prepFor).map((d) => d.date)).toEqual(['2026-10-09'])
    expect(lineDate(draft, lines.find((l) => l.templateId === 't-sex')!)).toBe('2026-10-10')
    // and the created workout carries the load fields
    const ops = buildOps(db, draft, lines)
    expect(ops.workouts.find((w) => w.templateId === 't-sex')).toMatchObject({ date: '2026-10-10', isKeySession: true, requiresPreviousDayPrep: true, plannedDurationMaxMin: 75 })
  })
})

describe('step 7 · confirmo', () => {
  beforeEach(() => useStore.setState({ db: fixture() }))

  const fullDraft = (db: DB): WeekDraft => {
    db.studyTracks = [{ ...meta, id: 'tr-a', name: 'Idioma', emoji: '🗣️', tone: 'ocean', order: 0, archived: false, status: 'ativo' }]
    return draftWith({
      picks: { 't-qui': 'corrida' },
      flex: [{ goalId: 'g-yoga', date: '2026-10-08', time: '18:30' }],
      study: [{ trackId: 'tr-a' }],
      top3: [{ date: '2026-10-06', title: 'Mandar proposta' }],
    })
  }

  it('creates nothing before confirming, then everything at once', () => {
    const db = getDB()
    const draft = fullDraft(db)
    useStore.setState({ db })
    const lines = trainingLines(db, WS, TODAY)
    const ops = buildOps(db, draft, lines)
    expect(getDB().workouts).toHaveLength(0)
    commitPlan(ops)
    const after = getDB()
    expect(after.workouts.map((w) => w.templateId ?? w.workoutGoalId).sort()).toEqual(['g-yoga', 't-dom', 't-qua', 't-qui', 't-seg'])
    expect(after.workouts.find((w) => w.templateId === 't-qua')).toMatchObject({ planType: 'base', time: '07:00', date: '2026-10-07' })
    expect(after.goals).toMatchObject([{ level: 'semana', category: 'estudo', period: WS, title: '🗣️ Idioma' }])
    expect(after.priorities).toMatchObject([{ domain: 'trabalho', date: '2026-10-06', title: 'Mandar proposta' }])
    expect(after.weekPlans).toHaveLength(1)
    expect(after.weekPlans[0].confirmedAt).toBeTruthy()
  })

  it('is idempotent: re-running the same week does not duplicate', () => {
    const db = getDB()
    const draft = fullDraft(db)
    useStore.setState({ db })
    commitPlan(buildOps(db, draft, trainingLines(db, WS, TODAY)))
    const once = getDB()
    // Re-open the flow: lines already materialized disappear, the same draft adds nothing.
    // (only the optional line she didn't pick is still offered)
    expect(trainingLines(once, WS, TODAY).map((l) => l.templateId)).toEqual(['t-qua-forca'])
    const again = buildOps(once, draft, trainingLines(db, WS, TODAY))
    expect(again.workouts).toHaveLength(0)
    expect(again.goals).toHaveLength(0)
    expect(again.priorities).toHaveLength(0)
    expect(again.weekPlan.existingId).toBe(once.weekPlans[0].id)
    commitPlan(again)
    expect(getDB().workouts).toHaveLength(once.workouts.length)
    expect(getDB().weekPlans).toHaveLength(1)
  })

  it('keeps a moved line idempotent too and respects the Top 3 cap', () => {
    const db = getDB()
    const lines = trainingLines(db, WS, TODAY)
    const id = plannedTemplateId(WS, 't-seg')
    commitPlan(buildOps(db, draftWith({ moved: { [id]: '2026-10-06' } }), lines))
    expect(getDB().workouts.find((w) => w.id === id)?.date).toBe('2026-10-06')
    const again = buildOps(getDB(), draftWith(), lines)
    expect(again.workouts.some((w) => w.templateId === 't-seg')).toBe(false)

    const d2 = getDB()
    d2.priorities = [0, 1].map((i) => ({ ...meta, id: `p${i}`, date: '2026-10-06', domain: 'trabalho' as const, title: `P${i}`, order: i, done: false }))
    const draft = draftWith({ top3: [{ date: '2026-10-06', title: 'A' }, { date: '2026-10-06', title: 'B' }] })
    expect(top3Room(d2, draftWith(), '2026-10-06')).toBe(1)
    expect(buildOps(d2, draft, []).priorities.map((p) => p.title)).toEqual(['A'])
  })

  it('never writes through the store before commit', () => {
    const before = getDB()
    const lines = trainingLines(before, WS, TODAY)
    plannedWorkouts(before, draftWith(), lines)
    planConflicts(before, WS, TODAY, [] as Workout[])
    expect(getDB()).toBe(before)
  })
})
