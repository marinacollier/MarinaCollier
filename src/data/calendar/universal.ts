/**
 * Calendário universal — ONE read model of everything in her life that has a date (and maybe a time).
 *
 * A PROJECTION, never a copy: every entry points at the record it came from (`sourceType` + `sourceId`)
 * and nothing here writes. Records stay where they are (events, workouts, tasks, trip items, Luna,
 * bills, receivables…), so there is nothing to migrate and nothing to keep in sync.
 *
 * Reuses the existing day logic instead of re-implementing it: `eventsFor` (sources, recurrence, exdates,
 * modo viagem), `contextWorkouts` (records + the weekly template's fixed lines), `tasksForDay`,
 * `workBlocks` (BASE hours; off on trip days), `travelClassOn` (the expedition's class), `petTasksDue`,
 * `overrideFor` (ScheduleOverride "só nesse dia": time / cancelled), `billDueDate`/`billPaid`,
 * `receivablesFor`, `bookingStatusOf` (trip status vocabulary), `conflictsOn` + expedition `findConflicts`.
 *
 *   calendarEntries(db, '2026-11-09', '2026-11-09')
 *   → [Aula · Bayswater 09:00–15:10, Caiaque com focas — Hout Bay 13:00–15:00 (pendente), Prazo: …]
 */
import { ROUTES } from '@/app/routes'
import type { SheetName, SheetProps } from '@/app/sheet-types'
import type {
  CalendarEvent,
  DateKey,
  DB,
  ID,
  Recurrence,
  Task,
  TimeHM,
  Trip,
  TripItem,
  Workout,
} from '../types'
import { addDays, addMonths, hmToMinutes, minutesToHM, monthKey, startOfMonth, todayKey } from '@/lib/date'
import { occurrenceFor } from '@/lib/recurrence'
import { eventsFor, isTaskDoneOn, modalityOf, petTasksDue, tasksForDay } from '../selectors'
import { conflictsOn, PERIOD_RANGES, workBlocks } from '../planning'
import { contextWorkouts } from '../fuel'
import { overrideFor } from '../timeline'
import { classLineOn, isSchoolAbsence } from '../travel-mode'
import { tripItemKind } from './kind'
import { billDueDate, billPaid, isBill } from '../finance/bills'
import { isIncome, receivablesFor } from '../finance/receivables'
import { BOOKING_STATUS_META, bookingStatusOf } from '@/features/travel/expedition/command'
import { findConflicts } from '@/features/travel/expedition/logic'
import { brandOf, isLive } from '../ugc/model'

// ─── Types ──────────────────────────────────────────────────────────────────

export type CalendarCategory = 'trabalho' | 'pessoal' | 'estudo' | 'treino' | 'saude' | 'viagem' | 'financas' | 'luna' | 'social' | 'outro'

export type CalendarStatus = 'planejado' | 'confirmado' | 'pendente' | 'feito' | 'cancelado'

export type CalendarSourceType =
  | 'event'
  | 'workout'
  | 'task'
  | 'taskDeadline'
  | 'waiting'
  | 'tripItem'
  | 'tripDeadline'
  | 'trip'
  | 'school'
  | 'work'
  | 'petTask'
  | 'petBirthday'
  | 'bill'
  | 'receivable'
  | 'milestone'
  | 'delivery'
  | 'content'
  | 'partnership'
  | 'meeting'
  | 'opportunity'
  | 'contact'
  | 'ugcFollowUp'

/** A moment in the source's own wall time (see `timezone`). */
export interface CalendarPoint {
  date: DateKey
  time?: TimeHM
}

/** Where the record lives: open its module, or its existing editor (second-level actions). */
export type CalendarEdit = { [N in SheetName]: { sheet: N; props: SheetProps<N> } }[SheetName]

export interface CalendarOpen {
  /** "Abrir em <label>". */
  module?: { label: string; route: string }
  /** "Editar": the record's own sheet. Missing = edited only inside its module. */
  edit?: CalendarEdit
}

export interface CalendarEntry {
  /** Stable: `${sourceType}:${sourceId}` (+ `:${date}` for one occurrence of something recurring). */
  id: string
  title: string
  description?: string
  startAt: CalendarPoint
  /** Same date as start for single-day entries; the last day (inclusive) for spans. */
  endAt: CalendarPoint
  /** IANA zone of the stored wall times (trip items: the expedition's zone). */
  timezone: string
  category: CalendarCategory
  sourceType: CalendarSourceType
  sourceId: ID
  /** External identity (iCalUID / provider id) when the record came from outside. */
  sourceExternalId?: string
  status: CalendarStatus
  /** Her own status words when the source has them ("AGUARDANDO RESPOSTA"). */
  statusLabel?: string
  location?: string
  allDay: boolean
  recurrence?: Recurrence
  visibility: 'normal' | 'privado'
  /** Title/details replaced by a generic line (privacy). The real title is not in the entry. */
  masked?: boolean
  linkedProjectId?: ID
  linkedTaskId?: ID
  linkedBookingId?: ID
  updatedAt?: string
  open: CalendarOpen
  /** Same real thing found in other records (dedupe): kept as links, never as a second row. */
  alsoFrom?: { sourceType: CalendarSourceType; sourceId: ID; id: string }[]
  /** Name of the module it comes from ("Viagem · South Africa 2026"). */
  sourceLabel: string
  /** Time derived from a period ("noite"), not exact. */
  approx?: boolean
  /** BASE plan (work hours): background, never a conflict. */
  base?: boolean
  /** A dated extra she has not committed to (trip OPCIONAL). */
  optional?: boolean
  /** Trip item: what it does to the class day (she already decided → not a clash with the class). */
  schoolImpact?: 'parcial' | 'dia'
  /** A class she missed: stays on the day (status 'cancelado', never a clash), tagged "faltei". */
  absent?: boolean
  /** What to do next, when the source says. */
  nextAction?: string
  /** Extra lines for the detail view (label → value). Never amounts when finance is locked. */
  details?: { label: string; value: string }[]
  /** Money (finance only; not shown at first level, absent when the finance area is locked). */
  amountCents?: number
  currency?: string
}

export interface CalendarOptions {
  /** Today (São Paulo) — the weekly template's lines stand in only from today on. Default: todayKey(). */
  today?: DateKey
  /** Show health/therapy titles. Default false: a generic "Compromisso pessoal". */
  revealPrivate?: boolean
  /** Finance area locked: no amounts and neutral titles ("Pagamento"). */
  financeLocked?: boolean
  /** Career area locked: neutral titles for career follow-ups. */
  careerLocked?: boolean
  /** Include cancelled entries (default: left out). */
  includeCancelled?: boolean
}

// ─── Category look ──────────────────────────────────────────────────────────

/** One discreet color per category, built only from the theme tokens (works in light and dark). */
export const CATEGORY_META: Record<CalendarCategory, { label: string; color: string; soft: string }> = {
  trabalho: { label: 'Trabalho', color: 'var(--ink-2)', soft: 'color-mix(in oklab, var(--ink-2) 9%, var(--surface))' },
  pessoal: { label: 'Pessoal', color: 'var(--accent)', soft: 'var(--accent-soft)' },
  estudo: { label: 'Estudo', color: 'var(--ocean)', soft: 'var(--ocean-soft)' },
  treino: { label: 'Treino', color: 'var(--sage)', soft: 'var(--sage-soft)' },
  saude: { label: 'Saúde', color: 'var(--plum)', soft: 'var(--plum-soft)' },
  viagem: { label: 'Viagem', color: 'var(--sand)', soft: 'var(--sand-soft)' },
  financas: { label: 'Finanças', color: 'color-mix(in oklab, var(--accent) 50%, var(--sand))', soft: 'color-mix(in oklab, var(--accent-soft) 50%, var(--sand-soft))' },
  luna: { label: 'Luna', color: 'color-mix(in oklab, var(--plum) 55%, var(--sand))', soft: 'color-mix(in oklab, var(--plum-soft) 50%, var(--sand-soft))' },
  social: { label: 'Social', color: 'color-mix(in oklab, var(--ocean) 50%, var(--plum))', soft: 'color-mix(in oklab, var(--ocean-soft) 50%, var(--plum-soft))' },
  outro: { label: 'Outro', color: 'var(--muted)', soft: 'var(--surface-2)' },
}

export const CATEGORY_ORDER: CalendarCategory[] = ['trabalho', 'pessoal', 'estudo', 'treino', 'saude', 'viagem', 'financas', 'luna', 'social', 'outro']

export const STATUS_LABEL: Record<CalendarStatus, string> = {
  planejado: 'planejado',
  confirmado: 'confirmado',
  pendente: 'pendente',
  feito: 'feito',
  cancelado: 'cancelado',
}

export const PRIVATE_TITLE = 'Compromisso pessoal'

// ─── Small helpers ──────────────────────────────────────────────────────────

const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Accent/case/punctuation-free title (for dedupe). */
export const normTitle = (t: string) => fold(t).replace(/[^a-z0-9]+/g, ' ').trim()

const PRIVATE_RE = /terapia|terapeuta|psic[oó]|psiqui|consulta|m[eé]dic|dentista|exame|fisio|ginec|dermat|cuidar de mim/i

/** Health / therapy: private by default. */
export function isPrivateTitle(title: string): boolean {
  return PRIVATE_RE.test(fold(title)) || PRIVATE_RE.test(title)
}

const plusMin = (hm: TimeHM, min: number): TimeHM => minutesToHM(Math.min(hmToMinutes(hm) + min, 23 * 60 + 59))

const overlapsRange = (start: DateKey, end: DateKey, from: DateKey, to: DateKey) => start <= to && end >= from

function eachDay(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

/** Months (first day) touching the range. */
function eachMonth(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let m = startOfMonth(from); m <= to && out.length < 24; m = addMonths(m, 1)) out.push(m)
  return out
}

function eventCategory(e: CalendarEvent): CalendarCategory {
  const cat = fold(e.category ?? '')
  if (/social|amig|anivers|festa/.test(cat) || /anivers/.test(fold(e.title))) return 'social'
  switch (e.kind) {
    case 'trabalho':
      return 'trabalho'
    case 'treino':
      return 'treino'
    case 'viagem':
      return 'viagem'
    case 'saude':
      return 'saude'
    case 'luna':
      return 'luna'
    case 'estudo':
      return 'estudo'
    case 'pessoal':
    case 'criatividade':
      return 'pessoal'
  }
  if (/trabalho|carreira/.test(cat)) return 'trabalho'
  if (/saude/.test(cat)) return 'saude'
  if (/estudo/.test(cat)) return 'estudo'
  if (e.tripId) return 'viagem'
  return e.kind === 'outro' ? 'outro' : 'pessoal'
}

function taskCategory(t: Task): CalendarCategory {
  if (t.tripId || t.context === 'viagem' || t.area === 'viagem') return 'viagem'
  if (t.context === 'luna' || t.lifeAdminCategory === 'luna') return 'luna'
  if (t.context === 'estudo' || t.area === 'estudo') return 'estudo'
  if (t.projectId || t.careerKind || t.context === 'trabalho' || t.context === 'carreira' || t.context === 'conteudo' || t.area === 'profissional' || t.area === 'conteudo') return 'trabalho'
  if (t.area === 'financeiro') return 'financas'
  if (t.area === 'corpo') return 'saude'
  return 'pessoal'
}

function taskStatus(db: DB, t: Task, date: DateKey, cancelled?: boolean): CalendarStatus {
  if (cancelled) return 'cancelado'
  if (isTaskDoneOn(db, t, date)) return 'feito'
  if (t.status === 'archived') return 'cancelado'
  if (t.status === 'review' || t.status === 'waiting' || t.planType === 'a_confirmar') return 'pendente'
  return t.planType === 'fixo' ? 'confirmado' : 'planejado'
}

/** Trip status vocabulary → calendar status (honest: nothing is "confirmado" without proof). */
export function tripItemStatus(i: TripItem): CalendarStatus {
  const s = bookingStatusOf(i)
  switch (s) {
    case 'concluido':
      return 'feito'
    case 'cancelado':
      return 'cancelado'
    case 'reservado':
    case 'reserva_emitida':
    case 'confirmado':
      return 'confirmado'
    case 'aguardando_resposta':
    case 'aguardando_pagamento':
    case 'a_reservar':
    case 'a_cotar':
      return 'pendente'
    case 'opcional':
    case 'planejado':
      return 'planejado'
  }
}

const tripLabel = (trip?: Trip) => (trip ? `Viagem · ${trip.name}` : 'Viagem')

function compact<T extends { label: string; value?: string }>(rows: T[]): { label: string; value: string }[] {
  return rows.filter((r) => !!r.value?.trim()).map((r) => ({ label: r.label, value: r.value!.trim() }))
}

// ─── Projection ─────────────────────────────────────────────────────────────

/**
 * Every dated thing touching [from, to] (inclusive), deduplicated, sorted (all-day first, then by time).
 * Pure: (db, range, options) → entries. Each entry links back to its record.
 */
export function calendarEntries(db: DB, from: DateKey, to: DateKey, opts: CalendarOptions = {}): CalendarEntry[] {
  const today = opts.today ?? todayKey()
  const homeTz = db.profile.timezone ?? 'America/Sao_Paulo'
  const out: CalendarEntry[] = []
  const push = (e: CalendarEntry) => out.push(e)
  const tripsById = new Map(db.trips.map((t) => [t.id, t]))
  const tzOfTrip = (tripId?: ID) => (tripId && tripsById.get(tripId)?.expedition?.timeZone) || homeTz
  const sources = new Map(db.calendarSources.map((s) => [s.id, s]))
  const projectRoute = (id?: ID) => (id ? { label: 'Projeto', route: ROUTES.project(id) } : undefined)

  for (const date of eachDay(from, to)) {
    // 1. Calendar events (sources, recurrence, exdates, modo viagem pause — all in eventsFor).
    for (const e of eventsFor(db, date)) {
      const multi = !e.recurrence && !!e.endDate && e.endDate > e.date
      const o = overrideFor(db, date, 'event', e.id)
      const occ = occurrenceFor(db.occurrences, 'event', e.id, date)
      const start = e.allDay ? undefined : (o?.time ?? e.startTime ?? (e.period ? PERIOD_RANGES[e.period][0] : undefined))
      const approx = !e.allDay && !o?.time && !e.startTime && !!e.period
      const dur = e.startTime && e.endTime ? hmToMinutes(e.endTime) - hmToMinutes(e.startTime) : 60
      const end = e.allDay ? undefined : o?.endTime ?? (o?.time ? plusMin(o.time, Math.max(dur, 15)) : e.endTime ?? (approx && e.period ? PERIOD_RANGES[e.period][1] : start ? plusMin(start, 60) : undefined))
      const status: CalendarStatus = o?.cancelled ? 'cancelado' : occ?.status === 'done' ? 'feito' : e.planType === 'a_confirmar' ? 'pendente' : e.planType === 'flexivel' ? 'planejado' : 'confirmado'
      const src = sources.get(e.sourceId)
      const category = eventCategory(e)
      push({
        id: e.recurrence ? `event:${e.id}:${date}` : `event:${e.id}`,
        title: e.title,
        description: e.notes,
        startAt: { date: multi ? e.date : date, time: multi ? e.startTime : start },
        endAt: { date: multi ? e.endDate! : date, time: multi ? e.endTime : end },
        timezone: homeTz,
        category,
        sourceType: 'event',
        sourceId: e.id,
        sourceExternalId: e.external?.globalId ?? e.external?.externalId,
        status,
        location: e.location,
        allDay: e.allDay || (multi && !e.startTime),
        recurrence: e.recurrence,
        visibility: category === 'saude' || isPrivateTitle(e.title) ? 'privado' : 'normal',
        linkedProjectId: e.projectId,
        updatedAt: e.updatedAt,
        sourceLabel: src && src.provider !== 'local' ? src.name : 'Agenda',
        approx,
        open: {
          module: projectRoute(e.projectId) ?? (e.tripId ? { label: 'Viagem', route: ROUTES.trip(e.tripId) } : undefined),
          // External events are edited at the origin; the sheet says so itself.
          edit: { sheet: 'event', props: { id: e.id, date: e.recurrence ? date : undefined } },
        },
        details: compact([
          { label: 'Link', value: e.url },
          { label: 'Calendário', value: src?.name },
        ]),
      })
    }

    // 2. Workouts: real records (done ones marked) + the weekly template's fixed lines from today on.
    for (const w of contextWorkouts(db, date) as Workout[]) {
      const fromTemplate = w.id.startsWith('template:')
      if (fromTemplate && date < today) continue
      const o = overrideFor(db, date, fromTemplate ? 'weekTemplate' : 'workout', fromTemplate ? w.templateId ?? '' : w.id)
      const m = modalityOf(db, w.modality)
      const dur = w.durationMin ?? w.plannedDurationMin ?? 60
      const start = w.time ?? (w.period ? PERIOD_RANGES[w.period][0] : undefined)
      const approx = !w.time && !!w.period
      push({
        id: `workout:${w.id}`,
        title: w.title || m.label,
        description: [w.goal, w.notes].filter(Boolean).join('\n') || undefined,
        startAt: { date, time: start },
        endAt: { date, time: o?.endTime ?? (w.time ? plusMin(w.time, dur) : approx ? PERIOD_RANGES[w.period!][1] : undefined) },
        timezone: homeTz,
        category: 'treino',
        sourceType: 'workout',
        sourceId: w.id,
        sourceExternalId: w.external?.externalId,
        status: o?.cancelled ? 'cancelado' : w.status === 'feito' || w.status === 'adaptado' ? 'feito' : w.planType === 'a_confirmar' ? 'pendente' : 'planejado',
        allDay: false,
        visibility: 'normal',
        updatedAt: w.updatedAt || undefined,
        sourceLabel: fromTemplate ? 'Treino · semana modelo' : 'Treino',
        approx,
        open: {
          module: { label: 'Treino', route: ROUTES.body },
          edit: fromTemplate ? undefined : { sheet: 'workout', props: { id: w.id } },
        },
        details: compact([
          { label: 'Modalidade', value: m.label },
          { label: 'Duração', value: w.plannedDurationMin ? `${w.plannedDurationMin}${w.plannedDurationMaxMin ? `–${w.plannedDurationMaxMin}` : ''} min` : undefined },
          { label: 'Treino-chave', value: w.isKeySession ? 'sim' : undefined },
        ]),
      })
    }

    // 3. Tasks with a time that day (or placed there by an override).
    for (const t of tasksForDay(db, date)) {
      if (t.status === 'archived' || t.status === 'waiting') continue
      const o = overrideFor(db, date, 'task', t.id)
      const time = o?.anytime ? undefined : (o?.time ?? t.time)
      if (!time) continue
      push({
        id: t.recurrence ? `task:${t.id}:${date}` : `task:${t.id}`,
        title: t.title,
        description: t.notes,
        startAt: { date, time },
        endAt: { date, time: o?.endTime ?? plusMin(time, t.durationMin ?? 30) },
        timezone: t.tripId ? tzOfTrip(t.tripId) : homeTz,
        category: taskCategory(t),
        sourceType: 'task',
        sourceId: t.id,
        status: taskStatus(db, t, date, o?.cancelled),
        allDay: false,
        recurrence: t.recurrence,
        visibility: isPrivateTitle(t.title) ? 'privado' : 'normal',
        linkedProjectId: t.projectId,
        linkedTaskId: t.id,
        updatedAt: t.updatedAt,
        sourceLabel: 'Tarefa',
        open: { module: projectRoute(t.projectId) ?? { label: 'Tarefas', route: ROUTES.tasks }, edit: { sheet: 'task', props: { id: t.id } } },
        details: compact([{ label: 'Feito quando', value: t.doneCriteria }]),
      })
    }

    // 4. BASE work hours (+ commute) — off on trip days. Background, filterable.
    for (const b of workBlocks(db, date)) {
      push({
        id: `work:${b.kind}:${date}:${b.start}`,
        title: b.title,
        startAt: { date, time: b.start },
        endAt: { date, time: b.end },
        timezone: homeTz,
        category: 'trabalho',
        sourceType: 'work',
        sourceId: `${b.kind}:${date}`,
        status: 'planejado',
        allDay: false,
        visibility: 'normal',
        sourceLabel: 'Trabalho · horário base',
        base: true,
        open: { module: { label: 'Trabalho', route: ROUTES.work } },
      })
    }

    // 5. Modo viagem: the expedition's class (her English course) on class days.
    const cls = classLineOn(db, date)
    if (cls) {
      const school = cls.trip.expedition?.school
      push({
        id: `school:${cls.trip.id}:${date}`,
        title: `Aula · ${cls.name}`,
        description: school?.focus?.length ? `Foco: ${school.focus.join(', ')}` : undefined,
        startAt: { date, time: cls.start },
        endAt: { date, time: cls.end },
        timezone: tzOfTrip(cls.trip.id),
        category: 'estudo',
        sourceType: 'school',
        sourceId: cls.trip.id,
        status: cls.absent ? 'cancelado' : 'confirmado',
        absent: cls.absent ? true : undefined,
        location: school?.address,
        allDay: false,
        visibility: 'normal',
        sourceLabel: tripLabel(cls.trip),
        open: { module: { label: 'Viagem', route: ROUTES.trip(cls.trip.id) }, edit: { sheet: 'trip', props: { id: cls.trip.id } } },
        details: compact([{ label: 'Revisão diária', value: school?.reviewMinutes }]),
      })
    }

    // 6. Luna: one-off care on its day + recurring care that is not the daily routine (bath, meds, vet…).
    for (const p of petTasksDue(db, date)) {
      if (p.recurrence?.kind === 'daily') continue
      if (!p.recurrence && p.dueDate !== date) continue // overdue one-offs stay on their own day
      const o = overrideFor(db, date, 'petTask', p.id)
      const occ = occurrenceFor(db.occurrences, 'petTask', p.id, date)
      push({
        id: p.recurrence ? `petTask:${p.id}:${date}` : `petTask:${p.id}`,
        title: p.title,
        description: p.notes,
        startAt: { date, time: o?.anytime ? undefined : o?.time },
        endAt: { date, time: o?.time && !o.anytime ? o.endTime ?? plusMin(o.time, 30) : undefined },
        timezone: homeTz,
        category: 'luna',
        sourceType: 'petTask',
        sourceId: p.id,
        status: o?.cancelled || occ?.status === 'skipped' ? 'cancelado' : occ?.status === 'done' ? 'feito' : 'planejado',
        allDay: !o?.time || !!o.anytime,
        recurrence: p.recurrence,
        visibility: 'normal',
        updatedAt: p.updatedAt,
        sourceLabel: 'Luna',
        open: { module: { label: 'Luna', route: ROUTES.luna }, edit: { sheet: 'petTask', props: { id: p.id } } },
      })
    }
  }

  // ── Record-based sources (dated fields) ──

  // 7. Trips (the span) and their dated items: passeios, voos, hospedagens, reservas.
  for (const trip of db.trips) {
    if (trip.startDate && overlapsRange(trip.startDate, trip.endDate ?? trip.startDate, from, to) && trip.status !== 'sonhando') {
      push({
        id: `trip:${trip.id}`,
        title: trip.name,
        description: trip.summary,
        startAt: { date: trip.startDate },
        endAt: { date: trip.endDate ?? trip.startDate },
        timezone: tzOfTrip(trip.id),
        category: 'viagem',
        sourceType: 'trip',
        sourceId: trip.id,
        status: trip.status === 'concluida' ? 'feito' : trip.status === 'confirmada' || trip.status === 'em_andamento' || trip.datesConfirmed ? 'confirmado' : 'planejado',
        location: trip.place,
        allDay: true,
        visibility: 'normal',
        updatedAt: trip.updatedAt,
        sourceLabel: 'Viagens',
        open: { module: { label: 'Viagem', route: ROUTES.trip(trip.id) }, edit: { sheet: 'trip', props: { id: trip.id } } },
      })
    }
  }
  for (const i of db.tripItems) {
    const trip = tripsById.get(i.tripId)
    const status = tripItemStatus(i)
    if (status === 'cancelado' && !opts.includeCancelled) continue
    // Her "Falta na escola" is shown on the class itself ("faltei"), not as a second line.
    if (isSchoolAbsence(i) && i.date && classLineOn(db, i.date)?.absent) continue
    const meta = BOOKING_STATUS_META[bookingStatusOf(i)]
    const details = compact([
      { label: 'Saída', value: i.leaveTime },
      { label: 'Volta', value: i.returnTime },
      { label: 'Endereço', value: i.address },
      { label: 'Transporte', value: i.route },
      { label: tripItemKind(i) === 'reserva' ? 'Fornecedor' : 'Com', value: i.supplier },
      { label: 'Atenção', value: i.caveat },
      { label: 'Plano B', value: i.planB },
      { label: 'Aula', value: i.schoolImpact === 'parcial' ? 'saída antecipada (parte da aula)' : i.schoolImpact === 'dia' ? 'ausência no dia' : undefined },
      { label: 'Referência', value: i.confirmationCode },
      { label: 'Fonte', value: i.source },
    ])
    if (i.date && overlapsRange(i.date, i.endDate ?? i.date, from, to)) {
      const span = !!i.endDate && i.endDate > i.date
      const lodging = i.section === 'hospedagem'
      push({
        id: `tripItem:${i.id}`,
        title: i.title,
        description: i.notes,
        startAt: { date: i.date, time: lodging ? undefined : i.time },
        endAt: { date: i.endDate ?? i.date, time: lodging ? undefined : i.endTime ?? (i.time && !span ? plusMin(i.time, 60) : undefined) },
        timezone: tzOfTrip(i.tripId),
        category: 'viagem',
        sourceType: 'tripItem',
        sourceId: i.id,
        sourceExternalId: i.confirmationCode,
        status,
        statusLabel: meta.label,
        location: i.address ?? i.group,
        allDay: lodging || !i.time,
        visibility: 'normal',
        linkedBookingId: i.id,
        updatedAt: i.updatedAt,
        sourceLabel: tripLabel(trip),
        optional: !!i.optional || bookingStatusOf(i) === 'opcional',
        schoolImpact: i.schoolImpact,
        nextAction: i.nextAction,
        details,
        open: { module: { label: 'Viagem', route: ROUTES.trip(i.tripId) }, edit: { sheet: 'tripItem', props: { id: i.id, tripId: i.tripId } } },
      })
    }
    // Deadline to resolve it (open items only).
    if (i.deadline && i.deadline >= from && i.deadline <= to && status !== 'feito' && status !== 'cancelado' && status !== 'confirmado') {
      push({
        id: `tripDeadline:${i.id}`,
        title: `Prazo: ${i.title}`,
        startAt: { date: i.deadline },
        endAt: { date: i.deadline },
        timezone: tzOfTrip(i.tripId),
        category: 'viagem',
        sourceType: 'tripDeadline',
        sourceId: i.id,
        status: 'pendente',
        statusLabel: meta.label,
        allDay: true,
        visibility: 'normal',
        linkedBookingId: i.id,
        updatedAt: i.updatedAt,
        sourceLabel: tripLabel(trip),
        nextAction: i.nextAction,
        open: { module: { label: 'Viagem', route: ROUTES.trip(i.tripId) }, edit: { sheet: 'tripItem', props: { id: i.id, tripId: i.tripId } } },
      })
    }
  }

  // 8. Task deadlines ("Prazo: …") — unless the task is already on that day with a time.
  for (const t of db.tasks) {
    if (!t.dueDate || t.recurrence || t.status === 'archived' || t.dueDate < from || t.dueDate > to) continue
    if (t.date === t.dueDate && t.time) continue
    push({
      id: `taskDeadline:${t.id}`,
      title: `Prazo: ${t.title}`,
      description: t.notes,
      startAt: { date: t.dueDate },
      endAt: { date: t.dueDate },
      timezone: t.tripId ? tzOfTrip(t.tripId) : homeTz,
      category: taskCategory(t),
      sourceType: 'taskDeadline',
      sourceId: t.id,
      status: t.status === 'done' ? 'feito' : 'pendente',
      allDay: true,
      visibility: isPrivateTitle(t.title) ? 'privado' : 'normal',
      linkedProjectId: t.projectId,
      linkedTaskId: t.id,
      updatedAt: t.updatedAt,
      sourceLabel: 'Tarefa',
      open: { module: projectRoute(t.projectId) ?? (t.tripId ? { label: 'Viagem', route: ROUTES.trip(t.tripId) } : { label: 'Tarefas', route: ROUTES.tasks }), edit: { sheet: 'task', props: { id: t.id } } },
    })
  }

  // 9. Waiting For: the day she said she'd follow up.
  for (const t of db.tasks) {
    const f = t.status === 'waiting' ? t.waiting?.followUpOn : undefined
    if (!f || f < from || f > to) continue
    push({
      id: `waiting:${t.id}`,
      title: `Cobrar ${t.waiting!.who}: ${t.title}`,
      startAt: { date: f },
      endAt: { date: f },
      timezone: homeTz,
      category: taskCategory(t),
      sourceType: 'waiting',
      sourceId: t.id,
      status: 'pendente',
      allDay: true,
      visibility: 'normal',
      linkedTaskId: t.id,
      linkedProjectId: t.projectId,
      updatedAt: t.updatedAt,
      sourceLabel: 'Aguardando resposta',
      open: { module: { label: 'Tarefas', route: ROUTES.tasks }, edit: { sheet: 'task', props: { id: t.id } } },
    })
  }

  // 10. Money: recurring bills with a due day she gave + receivables (expected income). No amounts at first level.
  for (const month of eachMonth(from, to)) {
    for (const c of db.financialCategories) {
      if (!isBill(c)) continue
      const due = billDueDate(c, month)
      if (!due || due < from || due > to) continue
      const paid = !!billPaid(db, c, due)
      push({
        id: `bill:${c.id}:${due}`,
        title: opts.financeLocked ? 'Pagamento' : `Pagar ${c.name}`,
        startAt: { date: due },
        endAt: { date: due },
        timezone: homeTz,
        category: 'financas',
        sourceType: 'bill',
        sourceId: c.id,
        status: paid ? 'feito' : 'pendente',
        allDay: true,
        recurrence: { kind: 'monthly', dayOfMonth: c.bill.every === 'mes' ? (c.bill.dueDay ?? 1) : 1 },
        visibility: 'normal',
        updatedAt: c.updatedAt,
        sourceLabel: 'Dinheiro · contas do mês',
        open: { module: { label: 'Dinheiro', route: ROUTES.money } },
      })
    }
    const stored = new Set(db.expenses.map((e) => e.id))
    for (const r of receivablesFor(db, monthKey(month))) {
      const d = r.expectedDate ?? r.date
      if (!d || d < from || d > to || !isIncome(r)) continue
      if (r.status === 'cancelled' && !opts.includeCancelled) continue
      const cents = r.status === 'received' ? (r.receivedAmountCents ?? r.amountCents) : (r.expectedAmountCents ?? r.amountCents)
      push({
        id: `receivable:${r.id}`,
        title: opts.financeLocked ? 'Recebimento' : `Receber: ${r.title}`,
        description: opts.financeLocked ? undefined : r.notes,
        startAt: { date: d },
        endAt: { date: d },
        timezone: homeTz,
        category: 'financas',
        sourceType: 'receivable',
        sourceId: r.id,
        status: r.status === 'received' ? 'feito' : r.status === 'cancelled' ? 'cancelado' : 'pendente',
        allDay: true,
        visibility: 'normal',
        updatedAt: r.updatedAt,
        sourceLabel: r.contractId ? 'Dinheiro · contrato' : 'Dinheiro · receita',
        amountCents: opts.financeLocked ? undefined : cents,
        currency: opts.financeLocked ? undefined : r.currency ?? 'BRL',
        open: { module: { label: 'Dinheiro', route: ROUTES.money }, edit: stored.has(r.id) ? { sheet: 'receivable', props: { id: r.id } } : undefined },
      })
    }
  }

  // 11. Work & content deadlines, meetings, career follow-ups.
  for (const m of db.milestones) {
    if (!m.date || m.date < from || m.date > to) continue
    push({
      id: `milestone:${m.id}`,
      title: m.title,
      startAt: { date: m.date },
      endAt: { date: m.date },
      timezone: homeTz,
      category: 'trabalho',
      sourceType: 'milestone',
      sourceId: m.id,
      status: m.done || m.status === 'feito' ? 'feito' : 'planejado',
      allDay: true,
      visibility: 'normal',
      linkedProjectId: m.projectId,
      updatedAt: m.updatedAt,
      sourceLabel: 'Projeto · marco',
      open: { module: projectRoute(m.projectId) },
    })
  }
  for (const p of db.projects) {
    const d = p.nextDelivery?.date
    if (!d || p.status === 'concluido' || d < from || d > to) continue
    push({
      id: `delivery:${p.id}`,
      title: `Entrega: ${p.nextDelivery!.title}`,
      startAt: { date: d },
      endAt: { date: d },
      timezone: homeTz,
      category: 'trabalho',
      sourceType: 'delivery',
      sourceId: p.id,
      status: 'pendente',
      allDay: true,
      visibility: 'normal',
      linkedProjectId: p.id,
      updatedAt: p.updatedAt,
      sourceLabel: `Projeto · ${p.name}`,
      open: { module: projectRoute(p.id), edit: { sheet: 'project', props: { id: p.id } } },
    })
  }
  for (const c of db.contentItems) {
    if (!c.deadline || c.stage === 'publicado' || c.deadline < from || c.deadline > to) continue
    push({
      id: `content:${c.id}`,
      title: `Prazo: ${c.title}`,
      startAt: { date: c.deadline },
      endAt: { date: c.deadline },
      timezone: homeTz,
      category: 'trabalho',
      sourceType: 'content',
      sourceId: c.id,
      status: 'pendente',
      allDay: true,
      visibility: 'normal',
      updatedAt: c.updatedAt,
      sourceLabel: 'Conteúdo',
      open: { module: { label: 'Creator', route: ROUTES.creator }, edit: { sheet: 'content', props: { id: c.id } } },
    })
  }
  for (const p of db.partnerships) {
    if (!p.deadline || p.stage === 'finalizado' || p.deadline < from || p.deadline > to) continue
    push({
      id: `partnership:${p.id}`,
      title: `${p.brand}: entrega`,
      startAt: { date: p.deadline },
      endAt: { date: p.deadline },
      timezone: homeTz,
      category: 'trabalho',
      sourceType: 'partnership',
      sourceId: p.id,
      status: 'pendente',
      allDay: true,
      visibility: 'normal',
      updatedAt: p.updatedAt,
      sourceLabel: 'Parcerias',
      open: { module: { label: 'Creator', route: ROUTES.creator }, edit: { sheet: 'partnership', props: { id: p.id } } },
    })
  }
  for (const m of db.meetings ?? []) {
    if (m.date < from || m.date > to) continue
    push({
      id: `meeting:${m.id}`,
      title: m.title,
      description: m.notes,
      startAt: { date: m.date, time: m.startTime },
      endAt: { date: m.date, time: m.endTime ?? (m.startTime ? plusMin(m.startTime, 60) : undefined) },
      timezone: homeTz,
      category: 'trabalho',
      sourceType: 'meeting',
      sourceId: m.id,
      sourceExternalId: m.external?.globalId ?? m.external?.externalId,
      status: 'confirmado',
      allDay: !m.startTime,
      visibility: 'normal',
      linkedProjectId: m.projectId,
      updatedAt: m.updatedAt,
      sourceLabel: 'Reunião',
      open: { module: projectRoute(m.projectId) ?? { label: 'Trabalho', route: ROUTES.work }, edit: { sheet: 'meeting', props: { id: m.id } } },
      // Meeting notes linked to a calendar event are the same real meeting (see dedupe).
      alsoFrom: m.eventId ? [{ sourceType: 'event', sourceId: m.eventId, id: `event:${m.eventId}` }] : undefined,
    })
  }
  for (const o of db.opportunities ?? []) {
    const d = o.nextActionDate
    if (!d || o.status === 'fechada' || o.status === 'descartada' || d < from || d > to) continue
    push({
      id: `opportunity:${o.id}`,
      title: opts.careerLocked ? 'Próxima ação de carreira' : `${o.nextAction ?? 'Próxima ação'} · ${o.role} (${o.company})`,
      startAt: { date: d },
      endAt: { date: d },
      timezone: homeTz,
      category: 'trabalho',
      sourceType: 'opportunity',
      sourceId: o.id,
      status: 'pendente',
      allDay: true,
      visibility: 'normal',
      masked: opts.careerLocked || undefined,
      updatedAt: o.updatedAt,
      sourceLabel: 'Carreira',
      open: { module: { label: 'Carreira', route: ROUTES.career }, edit: opts.careerLocked ? undefined : { sheet: 'opportunity', props: { id: o.id } } },
    })
  }
  for (const c of db.contacts ?? []) {
    const d = c.nextFollowUp
    if (!d || d < from || d > to) continue
    push({
      id: `contact:${c.id}`,
      title: opts.careerLocked ? 'Follow-up de networking' : `Follow-up com ${c.name}${c.company ? ` (${c.company})` : ''}`,
      startAt: { date: d },
      endAt: { date: d },
      timezone: homeTz,
      category: 'social',
      sourceType: 'contact',
      sourceId: c.id,
      status: 'pendente',
      allDay: true,
      visibility: 'normal',
      masked: opts.careerLocked || undefined,
      updatedAt: c.updatedAt,
      sourceLabel: 'Carreira · networking',
      open: { module: { label: 'Carreira', route: ROUTES.career }, edit: opts.careerLocked ? undefined : { sheet: 'contact', props: { id: c.id } } },
    })
  }

  // CRM: the day to write again to a brand. Live deals only (not closed / lost / refused / paused, brand not
  // archived, no `crm.noFollowUp`). A projection of the opportunity — nothing is copied.
  for (const o of db.ugcOpportunities ?? []) {
    const d = o.nextFollowUpAt
    if (!d || d < from || d > to || !isLive(db, o)) continue
    const brand = brandOf(db, o)
    push({
      id: `ugcFollowUp:${o.id}`,
      title: `Follow-up: ${brand?.name ?? o.title}`,
      startAt: { date: d },
      endAt: { date: d },
      timezone: homeTz,
      category: 'trabalho',
      sourceType: 'ugcFollowUp',
      sourceId: o.id,
      status: 'pendente',
      allDay: true,
      visibility: 'normal',
      linkedProjectId: o.projectId,
      updatedAt: o.updatedAt,
      sourceLabel: 'CRM · marcas',
      details: o.followUpWindowEnd && o.followUpWindowEnd !== d ? [{ label: 'Janela', value: `até ${o.followUpWindowEnd.split('-').reverse().slice(0, 2).join('/')}` }] : undefined,
      open: { module: { label: 'CRM', route: ROUTES.ugcBrand(o.brandId) } },
    })
  }

  // 12. Luna's birthday (every year, from her birth date).
  for (const pet of db.pets ?? []) {
    if (!pet.birthDate) continue
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
      const d = `${y}${pet.birthDate.slice(4)}`
      if (d < from || d > to || d <= pet.birthDate) continue
      push({
        id: `petBirthday:${pet.id}:${y}`,
        title: `Aniversário da ${pet.name}`,
        startAt: { date: d },
        endAt: { date: d },
        timezone: homeTz,
        category: 'luna',
        sourceType: 'petBirthday',
        sourceId: pet.id,
        status: 'confirmado',
        allDay: true,
        recurrence: undefined,
        visibility: 'normal',
        sourceLabel: 'Luna',
        open: { module: { label: 'Luna', route: ROUTES.luna } },
      })
    }
  }

  const visible = opts.includeCancelled ? out : out.filter((e) => e.status !== 'cancelado' || e.absent)
  return sortEntries(dedupeEntries(visible).map((e) => applyPrivacy(e, opts)))
}

// ─── Privacy ────────────────────────────────────────────────────────────────

/** Private entries become a neutral line unless revealed (the real title never reaches the UI). */
export function applyPrivacy(e: CalendarEntry, opts: Pick<CalendarOptions, 'revealPrivate'>): CalendarEntry {
  if (e.visibility !== 'privado' || opts.revealPrivate) return e
  return { ...e, title: PRIVATE_TITLE, description: undefined, location: undefined, details: undefined, nextAction: undefined, masked: true }
}

// ─── Dedupe ─────────────────────────────────────────────────────────────────

/** Richer source wins when the same real thing shows up twice. */
const SOURCE_RANK: Partial<Record<CalendarSourceType, number>> = { tripItem: 0, workout: 1, event: 2, meeting: 3, task: 4, school: 5 }
const rank = (e: CalendarEntry) => SOURCE_RANK[e.sourceType] ?? 9

function richness(e: CalendarEntry): number {
  return [e.description, e.location, e.startAt.time, e.endAt.time, e.nextAction, e.sourceExternalId].filter(Boolean).length + (e.details?.length ?? 0)
}

function merge(primary: CalendarEntry, other: CalendarEntry): CalendarEntry {
  const also = [...(primary.alsoFrom ?? []).filter((a) => a.id !== other.id), { sourceType: other.sourceType, sourceId: other.sourceId, id: other.id }, ...(other.alsoFrom ?? []).filter((a) => a.id !== primary.id)]
  const seen = new Set<string>()
  return {
    ...primary,
    description: primary.description ?? other.description,
    location: primary.location ?? other.location,
    linkedTaskId: primary.linkedTaskId ?? (other.sourceType === 'task' ? other.sourceId : other.linkedTaskId),
    linkedBookingId: primary.linkedBookingId ?? (other.sourceType === 'tripItem' ? other.sourceId : other.linkedBookingId),
    linkedProjectId: primary.linkedProjectId ?? other.linkedProjectId,
    sourceExternalId: primary.sourceExternalId ?? other.sourceExternalId,
    visibility: primary.visibility === 'privado' || other.visibility === 'privado' ? 'privado' : 'normal',
    alsoFrom: also.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))),
  }
}

const sameStart = (a: CalendarEntry, b: CalendarEntry, slackMin = 0) => {
  if (a.startAt.date !== b.startAt.date) return false
  if (!a.startAt.time || !b.startAt.time) return !a.startAt.time && !b.startAt.time && a.allDay === b.allDay
  return Math.abs(hmToMinutes(a.startAt.time) - hmToMinutes(b.startAt.time)) <= slackMin
}

/** Same title: equal, or one contains the other (the shorter one at least 8 characters). */
export function sameTitle(a: string, b: string): boolean {
  const x = normTitle(a)
  const y = normTitle(b)
  if (!x || !y) return false
  if (x === y) return true
  const [s, l] = x.length <= y.length ? [x, y] : [y, x]
  return s.length >= 8 && l.includes(s)
}

const isWorkoutEvent = (e: CalendarEntry) => e.sourceType === 'event' && e.category === 'treino'

/**
 * Rules (each tested in universal.test.ts):
 * 1. same entry id (a multi-day record reached from several days) → one;
 * 2. events with the same external identity (iCalUID / globalId) on the same day, from different calendars
 *    (Toki + Google + Outlook) → one, the richer kept;
 * 3. meeting notes linked to an event (`eventId`) → the event row, the meeting as a link;
 * 4. a workout and a 'treino' event on the same day starting within 15 min → the workout;
 * 5. the same title + day + start time from two different sources (a trip item also typed as a task or an
 *    event) → the richer source (trip item > workout > event > meeting > task), the other kept in `alsoFrom`.
 */
export function dedupeEntries(list: CalendarEntry[]): CalendarEntry[] {
  // 1.
  const byId = new Map<string, CalendarEntry>()
  for (const e of list) if (!byId.has(e.id)) byId.set(e.id, e)
  let items = [...byId.values()]

  const absorb = (keep: CalendarEntry, drop: CalendarEntry) => {
    const idx = items.indexOf(keep)
    items[idx] = merge(keep, drop)
    items = items.filter((x) => x !== drop)
  }

  // 2.
  const byGlobal = new Map<string, CalendarEntry>()
  for (const e of [...items]) {
    if (e.sourceType !== 'event' || !e.sourceExternalId) continue
    const k = `${e.sourceExternalId.trim().toLowerCase()}|${e.startAt.date}`
    const prev = byGlobal.get(k)
    if (!prev) {
      byGlobal.set(k, e)
      continue
    }
    const [keep, drop] = richness(e) > richness(prev) ? [e, prev] : [prev, e]
    absorb(keep, drop)
    byGlobal.set(k, items.find((x) => x.id === keep.id)!)
  }

  // 3.
  for (const m of items.filter((e) => e.sourceType === 'meeting' && e.alsoFrom?.length)) {
    const evId = m.alsoFrom![0].sourceId
    const ev = items.find((e) => e.sourceType === 'event' && e.sourceId === evId && e.startAt.date === m.startAt.date)
    if (ev) absorb(ev, m)
  }

  // 4.
  for (const w of items.filter((e) => e.sourceType === 'workout')) {
    const ev = items.find((e) => isWorkoutEvent(e) && sameStart(e, w, 15))
    if (ev) absorb(items.find((x) => x.id === w.id)!, ev)
  }

  // 5.
  const sorted = [...items].sort((a, b) => rank(a) - rank(b))
  for (const a of sorted) {
    if (!items.includes(a)) continue
    for (const b of sorted) {
      if (a === b || !items.includes(b) || a.sourceType === b.sourceType || a.base || b.base) continue
      if (!sameStart(a, b) || !sameTitle(a.title, b.title)) continue
      const current = items.find((x) => x.id === a.id)!
      absorb(current, b)
    }
  }
  return items
}

// ─── Reading helpers ────────────────────────────────────────────────────────

const sortKey = (e: CalendarEntry) => `${e.startAt.date}|${e.allDay || e.startAt.date !== e.endAt.date ? '0' : '1'}|${e.startAt.time ?? '99:99'}|${e.base ? '1' : '0'}`

export function sortEntries(list: CalendarEntry[]): CalendarEntry[] {
  return [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.title.localeCompare(b.title))
}

/** Spans several days (hospedagem, trip, multi-day event). */
export const isSpan = (e: CalendarEntry) => e.endAt.date > e.startAt.date

/** Has a time on the grid of `date` (single-day, timed). */
export const isTimed = (e: CalendarEntry) => !e.allDay && !!e.startAt.time && !isSpan(e)

/** Entries that touch `date` (spans on every day of their range), all-day first, then by time. */
export function entriesOn(list: CalendarEntry[], date: DateKey): CalendarEntry[] {
  return list.filter((e) => e.startAt.date <= date && e.endAt.date >= date)
}

// ─── Conflicts ──────────────────────────────────────────────────────────────

export interface CalendarConflict {
  /** Stable (overlap keys match the planning ones, so an acknowledged conflict stays quiet here too). */
  key: string
  kind: 'sobreposicao' | 'checkin' | 'aula' | 'voo' | 'mergulho_voo'
  date: DateKey
  /** CalendarEntry ids involved. */
  ids: string[]
  text: string
}

const DEFAULT_MIN: Partial<Record<CalendarSourceType, number>> = { task: 30 }

function windowOf(e: CalendarEntry): { start: number; end: number } {
  const s = hmToMinutes(e.startAt.time!)
  let end = e.endAt.time ? hmToMinutes(e.endAt.time) : s + (DEFAULT_MIN[e.sourceType] ?? 60)
  if (end <= s) end = s + (DEFAULT_MIN[e.sourceType] ?? 60)
  return { start: s, end }
}

const live = (e: CalendarEntry) => e.status !== 'feito' && e.status !== 'cancelado'

/**
 * Overlapping timed entries that still matter (not done/cancelled, not the BASE work hours, not a
 * period-only "noite"). A trip item that already says what happens to the class (saída antecipada /
 * ausência) is her decision, not a clash with the class. With `db`, also the planning check-in limit
 * (TotalPass) and the expedition's own warnings (crossing the class without saying, flight, dive → flight).
 * Acknowledged conflicts (Pontos de atenção → "ok, sei disso") stay out.
 */
export function calendarConflicts(entries: CalendarEntry[], db?: DB): CalendarConflict[] {
  const out: CalendarConflict[] = []
  const keys = new Set<string>()
  const add = (c: CalendarConflict) => {
    if (keys.has(c.key)) return
    keys.add(c.key)
    out.push(c)
  }
  const byDate = new Map<DateKey, CalendarEntry[]>()
  for (const e of entries) {
    if (!isTimed(e) || !live(e) || e.base || e.approx) continue
    byDate.set(e.startAt.date, [...(byDate.get(e.startAt.date) ?? []), e])
  }
  for (const [date, day] of byDate) {
    for (let i = 0; i < day.length; i++) {
      for (let j = i + 1; j < day.length; j++) {
        const a = day[i]
        const b = day[j]
        const schoolPair = (a.sourceType === 'school' && b.schoolImpact) || (b.sourceType === 'school' && a.schoolImpact)
        if (schoolPair) continue
        const wa = windowOf(a)
        const wb = windowOf(b)
        if (!(wa.start < wb.end && wb.start < wa.end)) continue
        add({
          key: `overlap:${date}:${[a.sourceId, b.sourceId].sort().join('+')}`,
          kind: 'sobreposicao',
          date,
          ids: [a.id, b.id],
          text: `${a.title} e ${b.title} estão no mesmo horário.`,
        })
      }
    }
  }

  if (db) {
    const idOf = (type: string, id: string, date: DateKey) =>
      entries.find((e) => (e.sourceType === type && e.sourceId === id && e.startAt.date <= date && e.endAt.date >= date) || e.alsoFrom?.some((a) => a.sourceType === type && a.sourceId === id))?.id
    // Check-in limits (TotalPass 1/dia): only days with two or more workouts.
    const workoutDays = new Map<DateKey, number>()
    for (const e of entries) if (e.sourceType === 'workout' && live(e)) workoutDays.set(e.startAt.date, (workoutDays.get(e.startAt.date) ?? 0) + 1)
    for (const [date, n] of workoutDays) {
      if (n < 2) continue
      for (const c of conflictsOn(db, date)) {
        if (c.kind !== 'checkin_limit') continue
        const ids = c.refs.map((r) => idOf(r.type, r.id, date)).filter((x): x is string => !!x)
        if (ids.length) add({ key: c.key, kind: 'checkin', date, ids, text: c.message.replace(/^⚠️\s*/, '') })
      }
    }
    // Expedição: crossing the class without saying, touching a flight, flying too soon after a dive.
    const dates = entries.map((e) => e.startAt.date).sort()
    const [first, last] = [dates[0], dates.at(-1)]
    for (const trip of db.trips) {
      if (!trip.expedition || !first || !last || !trip.startDate || !overlapsRange(trip.startDate, trip.endDate ?? trip.startDate, first, last)) continue
      const items = db.tripItems.filter((i) => i.tripId === trip.id)
      for (const c of findConflicts(trip, items)) {
        if (c.kind === 'sobreposicao' || c.date < first || c.date > last) continue
        const ids = c.items.map((i) => idOf('tripItem', i.id, c.date)).filter((x): x is string => !!x)
        if (c.kind === 'aula') {
          const school = entries.find((e) => e.sourceType === 'school' && e.startAt.date === c.date)
          if (school) ids.push(school.id)
        }
        if (ids.length) add({ key: c.key, kind: c.kind, date: c.date, ids, text: c.text })
      }
    }
    const acked = new Set((db.conflictAcks ?? []).map((a) => a.key))
    return out.filter((c) => !acked.has(c.key))
  }
  return out
}

/** entry id → its conflicts (for the subtle marker on the entry). */
export function conflictIndex(conflicts: CalendarConflict[]): Map<string, CalendarConflict[]> {
  const m = new Map<string, CalendarConflict[]>()
  for (const c of conflicts) for (const id of c.ids) m.set(id, [...(m.get(id) ?? []), c])
  return m
}

// ─── Time zones ─────────────────────────────────────────────────────────────

/** The device's zone (falls back to the profile's). */
export function deviceTimeZone(fallback = 'America/Sao_Paulo'): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback
  } catch {
    return fallback
  }
}

const TZ_CITY: Record<string, string> = {
  'Africa/Johannesburg': 'Cape Town',
  'America/Sao_Paulo': 'São Paulo',
}

/** "horário de Cape Town" — shown when the stored wall time is not the device's. */
export function tzNote(e: Pick<CalendarEntry, 'timezone'>, device: string): string | undefined {
  if (!e.timezone || e.timezone === device) return undefined
  const city = TZ_CITY[e.timezone] ?? e.timezone.split('/').pop()?.replace(/_/g, ' ')
  return `horário de ${city}`
}

