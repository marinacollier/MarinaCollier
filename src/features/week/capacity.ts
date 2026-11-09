/**
 * "Minha semana" — capacidade de trabalho e viabilidade da semana. Pure: (db, calendar entries, week) → numbers
 * and plain-text suggestions. Nothing here writes; suggestions are never applied automatically.
 *
 * Capacity (per project, per week):
 *   - only projects with status 'ativo' AND `weeklyHours` > 0 (and `weeklyHoursFrom` ≤ week end) count;
 *     a concluded project (status 'concluido') never counts, whatever it has stored.
 *   - planned   = weeklyHours (planejamento, not a contract)
 *   - scheduled = timed calendar entries linked to the project (events, meetings, timed tasks), not cancelled
 *   - done      = timed linked entries marked feito + project tasks completed that week (`spentMin` ?? duration)
 *   - available = work days of the week (BASE work blocks in the calendar) × (end − start − 1 h almoço)
 *   - load      = Σ max(planned, scheduled); pct = load / available → "sobrecarga" > 100 %, "apertado" > 85 %
 *
 * Feasibility (per day, from the same calendar entries):
 *   - awake window = profile.rhythm wake → sleep
 *   - busy = union of timed, non-cancelled, exact-time entries (work hours, events, workouts, classes, timed tasks)
 *   - overlaps = two live, exact-time, non-base entries at the same time (acknowledged conflicts stay out)
 *   - tight day = less than 1 h free inside the awake window
 */
import type { DateKey, DB, ID, Priority, Project, Task, TimeHM } from '@/data/types'
import type { CalendarEntry } from '@/data/calendar/universal'
import { kindOfEntry } from '@/data/calendar/kind'
import { addDays, hmToMinutes, minutesToHM, todayKey, WEEKDAY_LONG, weekday } from '@/lib/date'

// ─── Small time helpers ─────────────────────────────────────────────────────

export interface Interval {
  start: number
  end: number
}

const DEFAULT_MIN: Partial<Record<CalendarEntry['sourceType'], number>> = { task: 30 }
const LUNCH_MIN = 60
export const TIGHT_FREE_MIN = 60
export const OVERLOAD_PCT = 100
export const TIGHT_PCT = 85

const timedOn = (e: CalendarEntry, date: DateKey) => !e.allDay && !!e.startAt.time && e.startAt.date === date && e.endAt.date === date

/** Minutes-of-day window of a timed entry (missing / inverted end → default duration). */
export function entryWindow(e: CalendarEntry): Interval {
  const start = hmToMinutes(e.startAt.time!)
  let end = e.endAt.time ? hmToMinutes(e.endAt.time) : NaN
  if (!Number.isFinite(end) || end <= start) end = start + (DEFAULT_MIN[e.sourceType] ?? 60)
  return { start, end: Math.min(end, 24 * 60) }
}

export const entryMinutes = (e: CalendarEntry) => {
  const w = entryWindow(e)
  return w.end - w.start
}

/** Merge overlapping intervals (sorted, disjoint result). */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const i of sorted) {
    const last = out.at(-1)
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else out.push({ ...i })
  }
  return out
}

const clip = (list: Interval[], lo: number, hi: number) => list.map((i) => ({ start: Math.max(i.start, lo), end: Math.min(i.end, hi) })).filter((i) => i.end > i.start)
const total = (list: Interval[]) => list.reduce((s, i) => s + (i.end - i.start), 0)

/** Gaps of [lo, hi] not covered by `busy` (merged). */
export function gapsBetween(busy: Interval[], lo: number, hi: number): Interval[] {
  const out: Interval[] = []
  let cursor = lo
  for (const b of mergeIntervals(clip(busy, lo, hi))) {
    if (b.start > cursor) out.push({ start: cursor, end: b.start })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < hi) out.push({ start: cursor, end: hi })
  return out
}

export const weekDates = (weekStart: DateKey): DateKey[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

const dayName = (date: DateKey) => WEEKDAY_LONG[weekday(date)]

/** "7h30", "45 min", "0 h". */
export function hoursLabel(min: number): string {
  const m = Math.round(Math.max(0, min))
  if (!m) return '0 h'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h} h`
}

// ─── Work window ────────────────────────────────────────────────────────────

/** BASE work blocks of the week (the calendar already turns them off on trip days / overrides). */
export function workWindow(entries: CalendarEntry[], weekStart: DateKey): { days: DateKey[]; availableMin: number } {
  const dates = new Set(weekDates(weekStart))
  const days: DateKey[] = []
  let availableMin = 0
  for (const e of entries) {
    if (e.sourceType !== 'work' || !e.sourceId.startsWith('work:') || !dates.has(e.startAt.date) || !e.startAt.time) continue
    const span = entryMinutes(e)
    days.push(e.startAt.date)
    availableMin += Math.max(0, span - (span >= 5 * 60 ? LUNCH_MIN : 0))
  }
  return { days: [...new Set(days)].sort(), availableMin }
}

// ─── Capacity ───────────────────────────────────────────────────────────────

export interface CapacityItem {
  id: ID
  title: string
  date?: DateKey
  time?: TimeHM
  kind: 'tarefa' | 'marco' | 'entrega' | 'reuniao' | 'aguardando'
  /** Waiting: who she is waiting for. */
  who?: string
}

export interface ProjectCapacity {
  project: Project
  plannedMin: number
  scheduledMin: number
  doneMin: number
  /** Top 3 open priorities / deliveries (priority, then date). */
  priorities: CapacityItem[]
  /** Next meetings linked to the project (from today on, this week). */
  meetings: CapacityItem[]
  /** Tasks waiting on someone else. */
  waiting: CapacityItem[]
  /** Days whose scheduled minutes exceed the project's "até X min/dia" constraint. */
  overLimit?: { limitMin: number; days: DateKey[] }
}

export type CapacityFlag = 'sobrecarga' | 'apertado' | 'ok'

export interface WeekCapacity {
  weekStart: DateKey
  weekEnd: DateKey
  workDays: DateKey[]
  availableMin: number
  projects: ProjectCapacity[]
  plannedMin: number
  scheduledMin: number
  doneMin: number
  /** Σ max(planned, scheduled) per project. */
  loadMin: number
  /** Flexible hours left for meetings / support (available − load, never negative). */
  freeMin: number
  /** load / available, in %, rounded (0 when there is no work window). */
  pct: number
  flag: CapacityFlag
}

/** Does this project enter the week's capacity? Active + planned hours (+ already valid that week). */
export function countsForCapacity(p: Project, weekEnd: DateKey): boolean {
  if (p.status !== 'ativo') return false
  if (!p.weeklyHours || p.weeklyHours <= 0) return false
  return !p.weeklyHoursFrom || p.weeklyHoursFrom <= weekEnd
}

export function capacityFlag(pct: number): CapacityFlag {
  if (pct > OVERLOAD_PCT) return 'sobrecarga'
  if (pct > TIGHT_PCT) return 'apertado'
  return 'ok'
}

const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 }
const isoDay = (iso?: string) => (iso ? todayKey(new Date(iso)) : undefined)
const openTask = (t: Task) => t.status !== 'done' && t.status !== 'archived'

function projectPriorities(db: DB, p: Project, weekEnd: DateKey): CapacityItem[] {
  type Ranked = CapacityItem & { rank: number }
  const soon = addDays(weekEnd, 7)
  const dated = (date?: DateKey) => (date && date <= soon ? 0 : 1)
  const list: Ranked[] = []
  for (const t of db.tasks) {
    if (t.projectId !== p.id || !openTask(t) || t.status === 'waiting' || t.recurrence || t.careerKind) continue
    list.push({ id: t.id, title: t.title, date: t.dueDate ?? t.date, kind: 'tarefa', rank: PRIORITY_RANK[t.priority ?? 'media'] })
  }
  for (const m of db.milestones ?? []) {
    if (m.projectId !== p.id || m.done || m.status === 'feito' || !m.date) continue
    list.push({ id: m.id, title: m.title, date: m.date, kind: 'marco', rank: dated(m.date) ? 1 : 0 })
  }
  if (p.nextDelivery?.title) list.push({ id: `delivery:${p.id}`, title: p.nextDelivery.title, date: p.nextDelivery.date, kind: 'entrega', rank: dated(p.nextDelivery.date) ? 1 : 0 })
  return list
    .sort((a, b) => a.rank - b.rank || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map(({ rank: _rank, ...item }) => item)
}

const isMeeting = (db: DB, e: CalendarEntry) => e.sourceType === 'meeting' || kindOfEntry(db, e) === 'reuniao'

/**
 * Capacity of the week (`entries` = calendarEntries of that week, e.g. from `useCalendar`).
 * `today` limits "próximas reuniões" to what is still ahead.
 */
export function weekCapacity(db: DB, entries: CalendarEntry[], weekStart: DateKey, today: DateKey): WeekCapacity {
  const weekEnd = addDays(weekStart, 6)
  const inWeek = (d?: DateKey) => !!d && d >= weekStart && d <= weekEnd
  const { days: workDays, availableMin } = workWindow(entries, weekStart)
  const timed = entries.filter((e) => inWeek(e.startAt.date) && timedOn(e, e.startAt.date) && !e.base && e.status !== 'cancelado')
  const tasksById = new Map(db.tasks.map((t) => [t.id, t]))

  const projects: ProjectCapacity[] = db.projects
    .filter((p) => countsForCapacity(p, weekEnd))
    .sort((a, b) => (b.weeklyHours ?? 0) - (a.weeklyHours ?? 0) || a.order - b.order)
    .map((p) => {
      const linked = timed.filter((e) => e.linkedProjectId === p.id)
      const scheduledMin = linked.reduce((s, e) => s + entryMinutes(e), 0)

      // Done: entries marked feito (a task's own log wins), then tasks completed that week without an entry.
      const counted = new Set<ID>()
      let doneMin = 0
      for (const e of linked) {
        if (e.status !== 'feito') continue
        const t = e.linkedTaskId ? tasksById.get(e.linkedTaskId) : undefined
        if (t) counted.add(t.id)
        doneMin += t?.spentMin ?? entryMinutes(e)
      }
      for (const t of db.tasks) {
        if (t.projectId !== p.id || t.status !== 'done' || counted.has(t.id) || !inWeek(isoDay(t.completedAt))) continue
        doneMin += t.spentMin ?? t.durationMin ?? 0
      }

      const meetings = linked
        .filter((e) => e.startAt.date >= today && isMeeting(db, e))
        .sort((a, b) => a.startAt.date.localeCompare(b.startAt.date) || a.startAt.time!.localeCompare(b.startAt.time!))
        .slice(0, 3)
        .map<CapacityItem>((e) => ({ id: e.id, title: e.title, date: e.startAt.date, time: e.startAt.time, kind: 'reuniao' }))

      const waiting = db.tasks
        .filter((t) => t.projectId === p.id && t.status === 'waiting')
        .map<CapacityItem>((t) => ({ id: t.id, title: t.title, date: t.waiting?.followUpOn, kind: 'aguardando', who: t.waiting?.who }))

      const limit = db.constraints.find((c) => c.active && c.kind === 'max_minutes_per_day' && c.projectId === p.id)
      let overLimit: ProjectCapacity['overLimit']
      if (limit) {
        const perDay = new Map<DateKey, number>()
        for (const e of linked) perDay.set(e.startAt.date, (perDay.get(e.startAt.date) ?? 0) + entryMinutes(e))
        const days = [...perDay].filter(([, m]) => m > limit.limit).map(([d]) => d).sort()
        if (days.length) overLimit = { limitMin: limit.limit, days }
      }

      return { project: p, plannedMin: Math.round((p.weeklyHours ?? 0) * 60), scheduledMin, doneMin, priorities: projectPriorities(db, p, weekEnd), meetings, waiting, overLimit }
    })

  const plannedMin = projects.reduce((s, p) => s + p.plannedMin, 0)
  const scheduledMin = projects.reduce((s, p) => s + p.scheduledMin, 0)
  const doneMin = projects.reduce((s, p) => s + p.doneMin, 0)
  const loadMin = projects.reduce((s, p) => s + Math.max(p.plannedMin, p.scheduledMin), 0)
  const pct = availableMin ? Math.round((loadMin / availableMin) * 100) : loadMin ? 999 : 0
  return {
    weekStart,
    weekEnd,
    workDays,
    availableMin,
    projects,
    plannedMin,
    scheduledMin,
    doneMin,
    loadMin,
    freeMin: Math.max(0, availableMin - loadMin),
    pct,
    flag: capacityFlag(pct),
  }
}

// ─── Feasibility ────────────────────────────────────────────────────────────

export interface Overlap {
  key: string
  date: DateKey
  a: CalendarEntry
  b: CalendarEntry
}

export interface DayFeasibility {
  date: DateKey
  awake: Interval
  awakeMin: number
  /** Union of committed time inside the awake window. */
  busyMin: number
  freeMin: number
  /** Free gaps of 30 min or more inside the awake window. */
  gaps: Interval[]
  overlaps: Overlap[]
  /** Less than 1 h free. */
  tight: boolean
}

export interface WeekFeasibility {
  days: DayFeasibility[]
  overlaps: Overlap[]
  tightDays: DateKey[]
  /** Plain text ("Mover "X" para quinta 19:00"). Never applied automatically. */
  suggestions: string[]
}

/** Awake window from profile.rhythm (sleep past midnight → end of day). */
export function awakeWindow(db: DB): Interval {
  const wake = hmToMinutes(db.profile.rhythm?.wakeTime ?? '07:00')
  let sleep = hmToMinutes(db.profile.rhythm?.sleepTime ?? '23:00')
  if (!Number.isFinite(wake) || !Number.isFinite(sleep)) return { start: 7 * 60, end: 23 * 60 }
  if (sleep <= wake) sleep = 24 * 60
  return { start: wake, end: sleep }
}

/** Takes time that day: exact time, not cancelled, not a "maybe" extra. Work hours included. */
const commits = (e: CalendarEntry, date: DateKey) => timedOn(e, date) && e.status !== 'cancelado' && !e.approx && !e.optional

/** Can clash: still to happen, exact time, not the BASE work hours. */
const clashable = (e: CalendarEntry, date: DateKey) => commits(e, date) && !e.base && e.status !== 'feito'

export function findOverlaps(entries: CalendarEntry[], date: DateKey, acked: Set<string> = new Set()): Overlap[] {
  const day = entries.filter((e) => clashable(e, date))
  const out: Overlap[] = []
  for (let i = 0; i < day.length; i++) {
    for (let j = i + 1; j < day.length; j++) {
      const a = day[i]
      const b = day[j]
      if ((a.sourceType === 'school' && b.schoolImpact) || (b.sourceType === 'school' && a.schoolImpact)) continue
      const wa = entryWindow(a)
      const wb = entryWindow(b)
      if (!(wa.start < wb.end && wb.start < wa.end)) continue
      const key = `overlap:${date}:${[a.sourceId, b.sourceId].sort().join('+')}`
      if (acked.has(key)) continue
      out.push({ key, date, a, b })
    }
  }
  return out
}

function dayFeasibility(entries: CalendarEntry[], date: DateKey, awake: Interval, acked: Set<string>): DayFeasibility {
  const busy = mergeIntervals(clip(entries.filter((e) => commits(e, date)).map(entryWindow), awake.start, awake.end))
  const awakeMin = awake.end - awake.start
  const busyMin = total(busy)
  const freeMin = awakeMin - busyMin
  return {
    date,
    awake,
    awakeMin,
    busyMin,
    freeMin,
    gaps: gapsBetween(busy, awake.start, awake.end).filter((g) => g.end - g.start >= 30),
    overlaps: findOverlaps(entries, date, acked),
    tight: freeMin < TIGHT_FREE_MIN,
  }
}

/** Which of two clashing entries is easier to move: a task, then the less firm one, then the shorter one. */
export function movableOf(a: CalendarEntry, b: CalendarEntry): CalendarEntry {
  const score = (e: CalendarEntry) => (e.sourceType === 'task' ? 0 : 2) + (e.status === 'confirmado' ? 1 : 0)
  const sa = score(a)
  const sb = score(b)
  if (sa !== sb) return sa < sb ? a : b
  return entryMinutes(a) <= entryMinutes(b) ? a : b
}

const fixedSource = (e: CalendarEntry) => e.base || e.sourceType === 'school' || e.sourceType === 'tripItem' || e.sourceType === 'trip'

/** First free gap (≥ `minutes`) for an entry, from `from` on, never before today; gap start rounded to :00/:30. */
function findSlot(days: DayFeasibility[], minutes: number, from: DateKey, today: DateKey, skip?: { date: DateKey; at: Interval }): { date: DateKey; time: TimeHM } | undefined {
  const order = [...days.filter((d) => d.date >= from), ...days.filter((d) => d.date < from)].filter((d) => d.date >= today)
  for (const d of order) {
    for (const g of d.gaps) {
      const start = Math.ceil(g.start / 30) * 30
      if (g.end - start < minutes) continue
      if (skip && skip.date === d.date && start < skip.at.end && skip.at.start < start + minutes) continue
      return { date: d.date, time: minutesToHM(start) }
    }
  }
  return undefined
}

/** Feasibility of the whole week from its calendar entries. `today` keeps suggestions out of the past. */
export function weekFeasibility(db: DB, entries: CalendarEntry[], weekStart: DateKey, today: DateKey): WeekFeasibility {
  const awake = awakeWindow(db)
  const acked = new Set((db.conflictAcks ?? []).map((a) => a.key))
  const days = weekDates(weekStart).map((d) => dayFeasibility(entries, d, awake, acked))
  const overlaps = days.flatMap((d) => d.overlaps)
  const tightDays = days.filter((d) => d.tight).map((d) => d.date)
  const suggestions: string[] = []
  const moved = new Set<string>()

  for (const o of overlaps) {
    if (o.date < today) continue
    const m = fixedSource(o.a) && !fixedSource(o.b) ? o.b : fixedSource(o.b) && !fixedSource(o.a) ? o.a : movableOf(o.a, o.b)
    if (moved.has(m.id)) continue
    moved.add(m.id)
    const other = m === o.a ? o.b : o.a
    const slot = findSlot(days, entryMinutes(m), o.date, today, { date: o.date, at: entryWindow(m) })
    suggestions.push(
      slot
        ? `Mover "${m.title}" para ${dayName(slot.date)} ${slot.time} (bate com "${other.title}").`
        : `"${m.title}" bate com "${other.title}" na ${dayName(o.date)} — sem janela livre nesta semana; vale escolher um dos dois.`,
    )
  }

  for (const d of days) {
    if (!d.tight || d.date < today) continue
    const movable = entries
      .filter((e) => clashable(e, d.date) && !fixedSource(e) && !moved.has(e.id))
      .sort((a, b) => entryMinutes(b) - entryMinutes(a))[0]
    const roomiest = days.filter((x) => x.date !== d.date && x.date >= today).sort((a, b) => b.freeMin - a.freeMin)[0]
    const slot = movable && roomiest ? findSlot([roomiest], entryMinutes(movable), roomiest.date, today) : undefined
    if (movable && slot) {
      moved.add(movable.id)
      suggestions.push(`${cap(dayName(d.date))} fica com ${hoursLabel(d.freeMin)} livre: mover "${movable.title}" para ${dayName(slot.date)} ${slot.time}.`)
    } else {
      suggestions.push(`${cap(dayName(d.date))} fica com ${hoursLabel(d.freeMin)} livre — vale proteger um respiro.`)
    }
  }

  return { days, overlaps, tightDays, suggestions }
}

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase())
