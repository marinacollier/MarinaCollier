import { describe, expect, it } from 'vitest'
import { applyModuleSeeds } from '@/data/store'
import { buildSeed } from '@/data/seed'
import type { CalendarEvent, DB, Meeting, Task, TripItem, Workout } from '../types'
import { apply1106 } from './fixture-1106'
import {
  calendarConflicts,
  calendarEntries,
  dedupeEntries,
  entriesOn,
  PRIVATE_TITLE,
  sameTitle,
  tzNote,
  type CalendarEntry,
} from './universal'

const TODAY = '2026-11-06'
const MON = '2026-11-09'
const AT = '2026-11-06T10:00:00.000Z'
const ent = { createdAt: AT, updatedAt: AT }

let seeded: DB | undefined
/** Her database on 06/11: the seed + the module seeds + the 06/11 trip state. */
function herDB(): DB {
  seeded ??= apply1106(applyModuleSeeds(buildSeed(TODAY), TODAY))
  return structuredClone(seeded)
}

const ev = (p: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'title' | 'date'>): CalendarEvent => ({ ...ent, sourceId: 'cal-local', allDay: false, ...p })
const task = (p: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({ ...ent, status: 'todo', order: 0, ...p })
const workout = (p: Partial<Workout> & Pick<Workout, 'id' | 'date' | 'modality'>): Workout => ({ ...ent, status: 'planejado', order: 0, ...p })
const tripItem = (p: Partial<TripItem> & Pick<TripItem, 'id' | 'title'>): TripItem => ({ ...ent, tripId: 'trip-africa-do-sul', section: 'roteiro', status: 'a_fazer', order: 0, ...p })
const day = (db: DB, date = MON) => calendarEntries(db, date, date, { today: TODAY })
const byId = (list: CalendarEntry[], id: string) => list.find((e) => e.id === id)

describe('calendarEntries · 09/11 in one place', () => {
  it('shows the class, the caiaque, timed tasks/meetings, study blocks and workouts on Monday 09/11', () => {
    const db = herDB()
    db.tasks.push(task({ id: 't-ff', title: 'Reunião Fashion Finder', date: MON, time: '18:00', durationMin: 60, context: 'trabalho' }))
    db.events.push(ev({ id: 'e-study', title: 'Bloco de estudo — inglês', date: MON, startTime: '07:00', endTime: '08:00', kind: 'estudo' }))
    db.workouts.push(workout({ id: 'w-run', date: MON, time: '06:00', modality: 'corrida', title: 'Corrida leve', plannedDurationMin: 40 }))

    const list = day(db)
    const titles = list.map((e) => e.title)
    const cls = list.find((e) => e.sourceType === 'school')!
    expect(cls).toMatchObject({ title: 'Aula · Bayswater Cape Town', startAt: { date: MON, time: '09:00' }, endAt: { time: '15:10' }, category: 'estudo', timezone: 'Africa/Johannesburg' })
    const kayak = list.find((e) => /Caiaque/.test(e.title))!
    expect(kayak).toMatchObject({
      id: 'tripItem:seed:travel:za-caiaque',
      sourceType: 'tripItem',
      sourceId: 'seed:travel:za-caiaque',
      startAt: { date: MON, time: '13:00' },
      endAt: { date: MON, time: '15:00' },
      status: 'pendente',
      statusLabel: 'AGUARDANDO RESPOSTA',
      category: 'viagem',
      timezone: 'Africa/Johannesburg',
      nextAction: 'Aguardar a confirmação do grupo mínimo',
      linkedBookingId: 'seed:travel:za-caiaque',
    })
    expect(kayak.open.edit).toEqual({ sheet: 'tripItem', props: { id: 'seed:travel:za-caiaque', tripId: 'trip-africa-do-sul' } })
    expect(titles).toContain('Reunião Fashion Finder')
    expect(titles).toContain('Bloco de estudo — inglês')
    expect(titles).toContain('Corrida leve')
    expect(list.find((e) => e.title === 'Bloco de estudo — inglês')!.category).toBe('estudo')
    expect(list.find((e) => e.title === 'Corrida leve')).toMatchObject({ category: 'treino', startAt: { time: '06:00' }, endAt: { time: '06:40' } })
    // Deadlines and the trip context come along as all-day lines.
    expect(titles).toContain('Prazo: Confirmar transfer do safári (OR Tambo ↔ Pilanesberg)')
    expect(list.find((e) => e.sourceType === 'trip')).toMatchObject({ title: 'South Africa 2026', allDay: true })
    // São Paulo's BASE work week is paused on trip days.
    expect(list.some((e) => e.sourceType === 'work')).toBe(false)
    // Each real thing once.
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length)
    expect(list.filter((e) => /Caiaque/.test(e.title))).toHaveLength(1)
  })

  it('treats the class and the caiaque as her decision (saída antecipada), not a conflict', () => {
    const db = herDB()
    const list = day(db)
    expect(calendarConflicts(list, db)).toEqual([])
  })

  it('reads, never writes: no record is copied or changed', () => {
    const db = herDB()
    const before = JSON.stringify(db)
    const list = calendarEntries(db, '2026-10-20', '2026-12-10', { today: TODAY })
    expect(JSON.stringify(db)).toBe(before)
    // Every entry points at a record that exists where it always was.
    const kayak = byId(list, 'tripItem:seed:travel:za-caiaque')!
    expect(db.tripItems.find((i) => i.id === kayak.sourceId)?.time).toBe('13:00')
  })
})

describe('calendarEntries · sources', () => {
  it('a multi-day hospedagem is one all-day span, present on each of its days', () => {
    const db = herDB()
    const list = calendarEntries(db, '2026-11-01', '2026-11-30', { today: TODAY })
    const hosp = list.filter((e) => e.sourceId === 'seed:travel:trip-africa-do-sul-hosp-cape-town')
    expect(hosp).toHaveLength(1)
    expect(hosp[0]).toMatchObject({ allDay: true, startAt: { date: '2026-10-24' }, endAt: { date: '2026-11-13' } })
    expect(entriesOn(list, '2026-11-02').some((e) => e.id === hosp[0].id)).toBe(true)
    expect(entriesOn(list, '2026-11-14').some((e) => e.id === hosp[0].id)).toBe(false)
  })

  it('flights keep their time; cancelled items are left out unless asked; dated optional items read planejado', () => {
    const db = herDB()
    db.tripItems.push(
      tripItem({ id: 'voo-x', section: 'voo', title: 'Voo CPT → JNB', date: '2026-11-13', time: '10:05', endTime: '12:10' }),
      tripItem({ id: 'cancel-x', title: 'Passeio cancelado', date: '2026-11-13', time: '15:00', status: 'cancelado' }),
      tripItem({ id: 'opt-x', title: 'Wine tram', date: '2026-11-13', optional: true, status: 'a_confirmar' }),
    )
    const list = day(db, '2026-11-13')
    expect(byId(list, 'tripItem:voo-x')).toMatchObject({ startAt: { time: '10:05' }, endAt: { time: '12:10' }, allDay: false })
    expect(byId(list, 'tripItem:cancel-x')).toBeUndefined()
    expect(byId(calendarEntries(db, '2026-11-13', '2026-11-13', { today: TODAY, includeCancelled: true }), 'tripItem:cancel-x')?.status).toBe('cancelado')
    expect(byId(list, 'tripItem:opt-x')).toMatchObject({ status: 'planejado', optional: true, allDay: true })
  })

  it('maps the trip status vocabulary honestly', () => {
    const db = herDB()
    db.tripItems.push(
      tripItem({ id: 's1', title: 'Com voucher', date: '2026-11-13', bookingStatus: 'reservado', voucherUrl: 'https://x' }),
      tripItem({ id: 's2', title: 'Reservado sem prova', date: '2026-11-13', bookingStatus: 'reservado' }),
      tripItem({ id: 's3', title: 'A cotar', date: '2026-11-13', bookingStatus: 'a_cotar' }),
      tripItem({ id: 's4', title: 'Feito', date: '2026-11-13', status: 'feito' }),
    )
    const list = day(db, '2026-11-13')
    expect(byId(list, 'tripItem:s1')?.status).toBe('confirmado')
    expect(byId(list, 'tripItem:s2')?.status).toBe('planejado')
    expect(byId(list, 'tripItem:s3')?.status).toBe('pendente')
    expect(byId(list, 'tripItem:s4')?.status).toBe('feito')
  })

  it('recurring events: one entry per occurrence (id with the date), "só nesse dia" changes respected', () => {
    const db = herDB()
    db.trips = [] // a São Paulo week: recurring local events are not paused
    db.events.push(ev({ id: 'yoga', title: 'Aula de canto', date: '2026-12-01', startTime: '19:00', endTime: '20:00', recurrence: { kind: 'weekly', weekdays: [2] } }))
    db.scheduleOverrides.push({ ...ent, id: 'o1', date: '2026-12-08', refType: 'event', refId: 'yoga', time: '20:00', by: 'marina' })
    db.scheduleOverrides.push({ ...ent, id: 'o2', date: '2026-12-15', refType: 'event', refId: 'yoga', cancelled: true, by: 'marina' })
    const list = calendarEntries(db, '2026-12-01', '2026-12-15', { today: TODAY }).filter((e) => e.sourceId === 'yoga')
    expect(list.map((e) => e.id)).toEqual(['event:yoga:2026-12-01', 'event:yoga:2026-12-08'])
    expect(list[1].startAt.time).toBe('20:00')
    expect(list[0].recurrence).toEqual({ kind: 'weekly', weekdays: [2] })
    expect(list[0].open.edit).toEqual({ sheet: 'event', props: { id: 'yoga', date: '2026-12-01' } })
  })

  it('task deadlines are all-day "Prazo:" lines, except when the task is timed on its due day', () => {
    const db = herDB()
    db.tasks.push(task({ id: 'd1', title: 'Enviar NF', dueDate: '2026-11-20' }))
    db.tasks.push(task({ id: 'd2', title: 'Call com contador', date: '2026-11-20', time: '10:00', dueDate: '2026-11-20' }))
    const list = day(db, '2026-11-20')
    expect(byId(list, 'taskDeadline:d1')).toMatchObject({ title: 'Prazo: Enviar NF', allDay: true, status: 'pendente', linkedTaskId: 'd1' })
    expect(byId(list, 'taskDeadline:d2')).toBeUndefined()
    expect(byId(list, 'task:d2')).toMatchObject({ startAt: { time: '10:00' }, endAt: { time: '10:30' } })
  })

  it('workouts: done ones marked, all modalities', () => {
    const db = herDB()
    db.workouts.push(workout({ id: 'w-swim', date: '2026-11-20', time: '07:00', modality: 'natacao', status: 'feito', durationMin: 45 }))
    db.workouts.push(workout({ id: 'w-yoga', date: '2026-11-20', period: 'noite', modality: 'yoga' }))
    const list = day(db, '2026-11-20')
    expect(byId(list, 'workout:w-swim')).toMatchObject({ status: 'feito', category: 'treino', endAt: { time: '07:45' } })
    expect(byId(list, 'workout:w-yoga')).toMatchObject({ status: 'planejado', approx: true })
  })

  it('Luna: one-off care on its day; the daily walks/food stay in the routine', () => {
    const db = herDB()
    db.trips = []
    db.petTasks.push({ ...ent, id: 'vet', petId: db.pets[0]?.id ?? 'luna', title: 'Vacina V10', category: 'veterinario', dueDate: '2026-11-25', active: true, order: 0 })
    const list = day(db, '2026-11-25')
    expect(byId(list, 'petTask:vet')).toMatchObject({ category: 'luna', allDay: true, status: 'planejado' })
    expect(list.some((e) => e.sourceId === 'seed:luna:passeio-manha')).toBe(false)
    // Overdue one-offs don't spread over later days.
    expect(day(db, '2026-11-26').some((e) => e.sourceId === 'vet')).toBe(false)
  })

  it('money: bills due and expected income as financas, no amount when the finance area is locked', () => {
    const db = herDB()
    const aluguel = db.financialCategories.find((c) => c.id === 'cat-aluguel')!
    aluguel.bill = { every: 'mes', dueDay: 10 }
    const open = calendarEntries(db, '2026-12-01', '2026-12-31', { today: TODAY })
    expect(byId(open, 'bill:cat-aluguel:2026-12-10')).toMatchObject({ title: 'Pagar Aluguel', category: 'financas', status: 'pendente', allDay: true })
    const santander = open.find((e) => e.sourceType === 'receivable' && /Santander/.test(e.title))!
    expect(santander).toMatchObject({ category: 'financas', status: 'pendente', startAt: { date: '2026-12-15' } })
    expect(santander.amountCents).toBeGreaterThan(0)
    const locked = calendarEntries(db, '2026-12-01', '2026-12-31', { today: TODAY, financeLocked: true })
    const fin = locked.filter((e) => e.category === 'financas')
    expect(fin.length).toBeGreaterThan(0)
    expect(fin.every((e) => e.amountCents === undefined && (e.title === 'Pagamento' || e.title === 'Recebimento'))).toBe(true)
  })

  it('BASE work hours come as base entries on a São Paulo week day', () => {
    const db = herDB()
    const list = day(db, '2026-11-24')
    const work = list.filter((e) => e.sourceType === 'work')
    expect(work.length).toBeGreaterThan(0)
    expect(work.every((e) => e.base && e.category === 'trabalho')).toBe(true)
  })
})

describe('dedupe', () => {
  it('rule 1: a multi-day event reached from several days is one entry', () => {
    const db = herDB()
    db.events.push(ev({ id: 'conf', title: 'Conferência', date: '2026-11-20', endDate: '2026-11-22', allDay: true }))
    const list = calendarEntries(db, '2026-11-19', '2026-11-23', { today: TODAY })
    expect(list.filter((e) => e.sourceId === 'conf')).toHaveLength(1)
    expect(byId(list, 'event:conf')).toMatchObject({ startAt: { date: '2026-11-20' }, endAt: { date: '2026-11-22' } })
  })

  it('rule 2: the same external event (iCalUID) from two calendars is one, the other kept as a link', () => {
    const db = herDB()
    db.calendarSources.push({ ...ent, id: 'g', provider: 'google', name: 'Google', color: '#888', syncDirection: 'read', enabled: true })
    db.calendarSources.push({ ...ent, id: 't', provider: 'toki', name: 'Toki', color: '#888', syncDirection: 'read', enabled: true })
    const ext = (provider: 'google' | 'toki', id: string) => ({ provider, externalId: id, globalId: 'UID-123@x', syncStatus: 'synced' as const })
    db.events.push(ev({ id: 'eg', sourceId: 'g', title: 'Dentista', date: '2026-11-20', startTime: '09:00', location: 'Rua X', external: ext('google', 'g1') }))
    db.events.push(ev({ id: 'et', sourceId: 't', title: 'Dentista', date: '2026-11-20', startTime: '09:00', external: ext('toki', 't1') }))
    const list = calendarEntries(db, '2026-11-20', '2026-11-20', { today: TODAY, revealPrivate: true })
    const hits = list.filter((e) => e.title === 'Dentista')
    expect(hits).toHaveLength(1)
    expect(hits[0].sourceId).toBe('eg') // richer (has a location)
    expect(hits[0].alsoFrom).toEqual([{ sourceType: 'event', sourceId: 'et', id: 'event:et' }])
    expect(hits[0].sourceExternalId).toBe('UID-123@x')
  })

  it('rule 3: meeting notes linked to an event are the same meeting', () => {
    const db = herDB()
    db.events.push(ev({ id: 'ev-1on1', title: '1:1 com Ana', date: '2026-11-24', startTime: '11:00', endTime: '11:30', kind: 'trabalho' }))
    const m: Meeting = { ...ent, id: 'mt-1', title: '1:1 Ana — notas', date: '2026-11-24', startTime: '11:00', eventId: 'ev-1on1', decisions: [], actionItems: [], links: [], notes: 'pauta' }
    db.meetings.push(m)
    const list = day(db, '2026-11-24')
    expect(byId(list, 'meeting:mt-1')).toBeUndefined()
    expect(byId(list, 'event:ev-1on1')).toMatchObject({ description: 'pauta', alsoFrom: [{ sourceType: 'meeting', sourceId: 'mt-1', id: 'meeting:mt-1' }] })
  })

  it('rule 4: a workout that also has a treino event shows once, as the workout', () => {
    const db = herDB()
    db.workouts.push(workout({ id: 'w-long', date: '2026-11-21', time: '06:00', modality: 'corrida', title: 'Longão 18 km', plannedDurationMin: 110 }))
    db.events.push(ev({ id: 'ev-long', title: 'Corrida longa', date: '2026-11-21', startTime: '06:10', endTime: '08:00', kind: 'treino' }))
    const list = day(db, '2026-11-21')
    expect(byId(list, 'event:ev-long')).toBeUndefined()
    expect(byId(list, 'workout:w-long')?.alsoFrom).toEqual([{ sourceType: 'event', sourceId: 'ev-long', id: 'event:ev-long' }])
  })

  it('rule 5: a trip item also typed as a task (same title, day and time) → one row, the trip item, linked to the task', () => {
    const db = herDB()
    db.tasks.push(task({ id: 'task-kayak', title: 'Caiaque com focas — Hout Bay', date: MON, time: '13:00', tripId: 'trip-africa-do-sul' }))
    db.events.push(ev({ id: 'ev-kayak', title: 'Caiaque com focas — Hout Bay (Kayak Adventures)', date: MON, startTime: '13:00', endTime: '15:00' }))
    const list = day(db)
    const kayak = list.filter((e) => /caiaque/i.test(e.title))
    expect(kayak).toHaveLength(1)
    expect(kayak[0]).toMatchObject({ sourceType: 'tripItem', linkedTaskId: 'task-kayak' })
    expect(kayak[0].alsoFrom?.map((a) => a.id).sort()).toEqual(['event:ev-kayak', 'task:task-kayak'])
  })

  it('rule 5 does not merge different things that only share a word or a time', () => {
    const a = { id: 'a', title: 'Aula', sourceType: 'event', sourceId: 'a', startAt: { date: MON, time: '09:00' }, endAt: { date: MON, time: '10:00' } } as CalendarEntry
    const b = { ...a, id: 'b', sourceType: 'task', sourceId: 'b', title: 'Aula · Bayswater Cape Town' } as CalendarEntry
    const c = { ...a, id: 'c', sourceType: 'tripItem', sourceId: 'c', title: 'Surf' } as CalendarEntry
    expect(dedupeEntries([a, b, c])).toHaveLength(3)
    expect(sameTitle('Caiaque com focas', 'caiaque com focas — Hout Bay')).toBe(true)
    expect(sameTitle('Aula', 'Aula · Bayswater')).toBe(false)
  })
})

describe('privacy', () => {
  it('health / therapy entries are private: generic title in the grid unless revealed', () => {
    const db = herDB()
    db.trips = []
    db.tasks.push(task({ id: 'psi', title: 'Consulta com a psicóloga', date: '2026-11-27', time: '19:00' }))
    const hidden = day(db, '2026-11-27')
    const fisio = hidden.find((e) => e.sourceId === 'seed:agenda:fisioterapia')!
    expect(fisio).toMatchObject({ title: PRIVATE_TITLE, visibility: 'privado', masked: true, category: 'saude' })
    expect(fisio.location).toBeUndefined()
    expect(byId(hidden, 'task:psi')).toMatchObject({ title: PRIVATE_TITLE, masked: true })
    expect(JSON.stringify(hidden)).not.toMatch(/psic[oó]loga|Fisioterapia/)
    const shown = calendarEntries(db, '2026-11-27', '2026-11-27', { today: TODAY, revealPrivate: true })
    expect(shown.find((e) => e.sourceId === 'seed:agenda:fisioterapia')?.title).toBe('Fisioterapia')
    expect(byId(shown, 'task:psi')?.title).toBe('Consulta com a psicóloga')
  })
})

describe('conflicts', () => {
  const base = { allDay: false, timezone: 'America/Sao_Paulo', category: 'pessoal', status: 'planejado', visibility: 'normal', open: {}, sourceLabel: '' } as const
  const E = (id: string, type: CalendarEntry['sourceType'], start: string, end?: string, extra: Partial<CalendarEntry> = {}): CalendarEntry => ({
    ...base,
    id: `${type}:${id}`,
    title: id,
    sourceType: type,
    sourceId: id,
    startAt: { date: MON, time: start },
    endAt: { date: MON, time: end },
    ...extra,
  })

  it('flags overlapping timed entries', () => {
    const c = calendarConflicts([E('a', 'event', '10:00', '11:00'), E('b', 'task', '10:30', '11:00'), E('c', 'event', '11:00', '12:00')])
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'sobreposicao', date: MON, ids: ['event:a', 'task:b'], key: `overlap:${MON}:a+b` })
  })

  it('ignores done/cancelled, BASE work hours, approximate windows and all-day lines', () => {
    const list = [
      E('a', 'event', '10:00', '11:00'),
      E('done', 'workout', '10:00', '11:00', { status: 'feito' }),
      E('work', 'work', '09:00', '18:00', { base: true }),
      E('approx', 'workout', '06:00', '12:00', { approx: true }),
      E('allday', 'tripItem', '10:00', undefined, { allDay: true }),
    ]
    expect(calendarConflicts(list)).toEqual([])
  })

  it('class vs activity: a clash unless the item already says what happens to the class', () => {
    const cls = E('trip', 'school', '09:00', '15:10')
    expect(calendarConflicts([cls, E('kayak', 'tripItem', '13:00', '15:00', { schoolImpact: 'parcial' })])).toEqual([])
    expect(calendarConflicts([cls, E('surf', 'tripItem', '13:00', '15:00')])).toHaveLength(1)
  })

  it('with the DB: the expedition warns about an item crossing the class; acknowledged overlaps stay quiet', () => {
    const db = herDB()
    db.tripItems.push(tripItem({ id: 'surf', section: 'reserva', title: 'Aula de surf', date: '2026-11-10', time: '11:00', endTime: '12:30' }))
    db.events.push(ev({ id: 'call', title: 'Call', date: '2026-11-10', startTime: '11:30', endTime: '12:00' }))
    const list = day(db, '2026-11-10')
    const conflicts = calendarConflicts(list, db)
    expect(conflicts.some((c) => c.kind === 'aula' && c.ids.includes('tripItem:surf') && c.ids.includes('school:trip-africa-do-sul:2026-11-10'))).toBe(true)
    const overlap = conflicts.find((c) => c.kind === 'sobreposicao' && c.ids.includes('event:call') && c.ids.includes('tripItem:surf'))!
    expect(overlap).toBeTruthy()
    db.conflictAcks.push({ ...ent, id: 'ack', key: overlap.key, date: '2026-11-10', decision: 'manter' })
    expect(calendarConflicts(list, db).some((c) => c.key === overlap.key)).toBe(false)
  })
})

describe('time zones', () => {
  it('notes the stored wall time only when the device is elsewhere', () => {
    expect(tzNote({ timezone: 'Africa/Johannesburg' }, 'America/Sao_Paulo')).toBe('horário de Cape Town')
    expect(tzNote({ timezone: 'Africa/Johannesburg' }, 'Africa/Johannesburg')).toBeUndefined()
  })
})

describe('calendarEntries · CRM follow-ups (projection of ugcOpportunities)', () => {
  const brand = (id: string, name: string, extra: Partial<DB['brands'][number]> = {}): DB['brands'][number] => ({ ...ent, id, name, ...extra })
  const opp = (id: string, brandId: string, extra: Partial<DB['ugcOpportunities'][number]> = {}): DB['ugcOpportunities'][number] => ({
    ...ent,
    id,
    brandId,
    title: 'UGC',
    stage: 'contatada',
    status: 'aguardando_resposta',
    nextFollowUpAt: MON,
    ...extra,
  })

  function crmDB(): DB {
    const db = herDB()
    db.brands = [brand('b1', 'Ocean Drop', { city: 'São Paulo', country: 'BR' }), brand('b2', 'Lost Co'), brand('b3', 'Paused Co'), brand('b4', 'No FU', { crm: { noFollowUp: true } }), brand('b5', 'Archived', { archived: true }), brand('b6', 'Done Co')]
    db.ugcOpportunities = [
      opp('o1', 'b1', { projectId: 'proj-ugc' }),
      opp('o2', 'b2', { status: 'perdida' }),
      opp('o3', 'b3', { status: 'pausada' }),
      opp('o4', 'b4'),
      opp('o5', 'b5'),
      opp('o6', 'b6', { status: 'concluida' }),
      opp('o7', 'b1', { nextFollowUpAt: undefined }),
    ]
    return db
  }

  it('projects a live follow-up: "Follow-up: <marca>", all-day, trabalho, pendente, opens the brand in the CRM', () => {
    const list = day(crmDB()).filter((e) => e.sourceType === 'ugcFollowUp')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 'ugcFollowUp:o1',
      title: 'Follow-up: Ocean Drop',
      sourceId: 'o1',
      allDay: true,
      category: 'trabalho',
      status: 'pendente',
      linkedProjectId: 'proj-ugc',
      startAt: { date: MON },
      open: { module: { label: 'CRM', route: '/trabalho/creator/ugc/marca/b1' } },
    })
  })

  it('skips closed / lost / paused deals, archived brands and brands with crm.noFollowUp', () => {
    const ids = day(crmDB()).map((e) => e.id)
    for (const o of ['o2', 'o3', 'o4', 'o5', 'o6', 'o7']) expect(ids).not.toContain(`ugcFollowUp:${o}`)
  })

  it('is a projection: nothing is written and nothing on other days', () => {
    const db = crmDB()
    const before = JSON.stringify(db.ugcOpportunities)
    expect(calendarEntries(db, '2026-11-10', '2026-11-12', { today: TODAY }).some((e) => e.sourceType === 'ugcFollowUp')).toBe(false)
    expect(JSON.stringify(db.ugcOpportunities)).toBe(before)
  })
})
