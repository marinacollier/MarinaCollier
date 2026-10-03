/**
 * Agenda-specific reads on top of the shared `agendaFor`. Pure (db, args) functions.
 */
import type { CalendarEvent, DateKey, DayPeriod, DB, ID, PlanType, TimelineEntry, Tone, WorkDayMode } from '@/data/types'
import { dayTimeline, endMin, routineBlocks, startMin } from '@/data/timeline'
import { minutesToHM } from '@/lib/date'
import { agendaFor, isTaskDoneOn, isTaskOpen, prioritiesFor, tasksForDay, type AgendaEntry } from '@/data/selectors'
import { conflictsOn, PERIOD_LABEL, PERIOD_RANGES, workMode, type Conflict } from '@/data/planning'
import { addDays, formatShortDate, weekDays } from '@/lib/date'
import { SEED_IDS } from '@/data/seed/ids'

export type EventKind = NonNullable<CalendarEvent['kind']>

export const EVENT_KINDS: { value: EventKind; label: string; emoji: string; tone: Tone }[] = [
  { value: 'pessoal', label: 'pessoal', emoji: '📍', tone: 'accent' },
  { value: 'trabalho', label: 'trabalho', emoji: '💼', tone: 'ocean' },
  { value: 'treino', label: 'treino', emoji: '🏃‍♀️', tone: 'sage' },
  { value: 'viagem', label: 'viagem', emoji: '✈️', tone: 'sand' },
  { value: 'saude', label: 'saúde', emoji: '🩺', tone: 'plum' },
  { value: 'luna', label: 'luna', emoji: '🐾', tone: 'sand' },
  { value: 'criatividade', label: 'criatividade', emoji: '🏺', tone: 'plum' },
  { value: 'estudo', label: 'estudo', emoji: '📚', tone: 'ocean' },
  { value: 'outro', label: 'outro', emoji: '📅', tone: 'ink' },
]

export function kindMeta(kind: CalendarEvent['kind']) {
  return EVENT_KINDS.find((k) => k.value === kind) ?? { value: 'outro' as const, label: 'compromisso', emoji: '📅', tone: 'accent' as Tone }
}

export interface DayEntry extends Omit<AgendaEntry, 'kind'> {
  /** Agenda kinds + the Linha do dia's routine blocks and planned meals (day grid only). */
  kind: AgendaEntry['kind'] | 'routine' | 'meal'
  /** For 'routine' / 'meal': the timeline row(s) behind it (same times as Hoje). */
  timeline?: TimelineEntry
  /** For 'routine': the routine id. */
  routineId?: ID
  /** Unique key for React lists. */
  key: string
  /** CSS color of a non-local calendar source (Google, Outlook, ICS…). */
  sourceColor?: string
  /** Mirrored from outside: edit at the origin. */
  external?: boolean
  /** "2–5 out." for multi-day events. */
  rangeLabel?: string
  /** For multi-day events: first day of the range. */
  startsOn?: DateKey
  /** Recurring event (offers "só nesse dia"). */
  recurring?: boolean
  /** Event has a checklist template ("Pauta"). */
  hasTemplate?: boolean
  /** "noite" — for entries without an exact time (approx). */
  periodLabel?: string
  /** Open planning conflicts that involve this entry. */
  conflicts?: Conflict[]
  /** Workout marked as a key session of the week (🔥). */
  keySession?: boolean
}

export const PLAN_LABEL: Record<PlanType, string> = {
  fixo: 'FIXO',
  base: 'BASE',
  flexivel: 'FLEXÍVEL',
  a_confirmar: 'A CONFIRMAR',
}

/** Period of an approximate entry, recovered from its derived range. */
export function periodOfRange(time?: string, endTime?: string): DayPeriod | undefined {
  return (Object.keys(PERIOD_RANGES) as DayPeriod[]).find((p) => PERIOD_RANGES[p][0] === time && (!endTime || PERIOD_RANGES[p][1] === endTime))
}

/** Map "kind:id" (same as DayEntry.key) → conflicts that involve it. */
export function conflictMarkers(conflicts: Conflict[]): Map<string, Conflict[]> {
  const out = new Map<string, Conflict[]>()
  for (const c of conflicts) {
    for (const r of c.refs) {
      const k = `${r.type}:${r.id}`
      out.set(k, [...(out.get(k) ?? []), c])
    }
  }
  return out
}

export function isMultiDay(e: CalendarEvent): boolean {
  return !e.recurrence && !!e.endDate && e.endDate > e.date
}

export function rangeLabel(from: DateKey, to: DateKey): string {
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${formatShortDate(to)}`
  return `${formatShortDate(from)} – ${formatShortDate(to)}`
}

/**
 * Entries of a day, with nicer emoji/tones per event kind. Multi-day events go to the all-day row.
 * With `includeBlocks`, BASE work hours / commute come along as 'block' entries (timeline bands).
 * Each entry carries the open planning conflicts that involve it.
 */
export function dayEntries(db: DB, date: DateKey, opts: { includeBlocks?: boolean } = {}): DayEntry[] {
  const events = new Map(db.events.map((e) => [e.id, e]))
  const keyWorkouts = new Set(db.workouts.filter((w) => w.isKeySession).map((w) => w.id))
  const sources = new Map(db.calendarSources.map((s) => [s.id, s]))
  const markers = conflictMarkers(conflictsOn(db, date))
  // Per-day changes made on Hoje (ScheduleOverride: "só hoje às 20:00", "hoje não") show here too.
  const tl = new Map(dayTimeline(db, date).map((e) => [e.key, e]))
  return agendaFor(db, date, opts).flatMap((a): AgendaEntry[] => {
    const t = tl.get(`${a.kind}:${a.id}`)
    if (t?.status === 'cancelled') return []
    if (t?.timeSource === 'override') return [{ ...a, time: t.start, endTime: t.end, approx: false }]
    return [a]
  }).map((a) => {
    const key = `${a.kind}:${a.id}`
    const base: DayEntry = {
      ...a,
      key,
      conflicts: markers.get(key),
      periodLabel: a.approx ? PERIOD_LABEL[periodOfRange(a.time, a.endTime) ?? 'noite'] : undefined,
    }
    if (a.kind === 'workout' && keyWorkouts.has(a.id)) base.keySession = true
    if (a.kind !== 'event') return base
    const ev = events.get(a.id)
    if (!ev) return base
    const meta = kindMeta(ev.kind)
    const src = sources.get(ev.sourceId)
    const multi = isMultiDay(ev)
    return {
      ...base,
      emoji: meta.emoji,
      tone: meta.tone,
      external: !!ev.external,
      sourceColor: src && src.provider !== 'local' ? src.color : undefined,
      allDay: a.allDay || multi,
      time: a.allDay || multi ? undefined : a.time,
      rangeLabel: multi ? rangeLabel(ev.date, ev.endDate!) : undefined,
      startsOn: multi ? ev.date : undefined,
      recurring: !!ev.recurrence,
      hasTemplate: !!ev.template?.length,
    }
  })
}

/**
 * The Linha do dia inside the Agenda grid (same times as Hoje): one block per routine stretch
 * ("☀️ Milagre da Manhã 04:40–06:00", split where the training sits) + the day's planned meals.
 */
export function lifeEntries(db: DB, date: DateKey): DayEntry[] {
  const tl = dayTimeline(db, date, { includeAnytime: false })
  const out: DayEntry[] = []
  for (const b of routineBlocks(db, tl)) {
    const sorted = [...b.entries].sort((x, y) => (startMin(x) ?? 0) - (startMin(y) ?? 0))
    let run: TimelineEntry[] = []
    const flush = () => {
      if (!run.length) return
      const s = startMin(run[0])!
      const e = Math.max(...run.map((x) => endMin(x)!))
      const done = run.filter((x) => x.status === 'done').length
      out.push({
        kind: 'routine',
        id: `${b.routine.id}:${s}`,
        key: `routine:${b.routine.id}:${s}`,
        routineId: b.routine.id,
        timeline: run[0],
        title: b.routine.name,
        emoji: b.routine.emoji,
        date,
        time: minutesToHM(s),
        endTime: minutesToHM(e),
        allDay: false,
        done: done === run.length,
        tone: 'sand',
        subtitle: `${done}/${run.length}`,
        planType: b.routine.planType,
      })
      run = []
    }
    for (const x of sorted) {
      const last = run.at(-1)
      if (last && (startMin(x) ?? 0) > (endMin(last) ?? 0)) flush()
      run.push(x)
    }
    flush()
  }
  for (const m of tl) {
    if (m.kind !== 'meal' || m.status === 'cancelled') continue
    out.push({
      kind: 'meal',
      id: m.ref.id,
      key: m.key,
      timeline: m,
      title: m.title,
      emoji: m.emoji,
      date,
      time: m.start,
      endTime: m.end,
      allDay: false,
      done: m.status === 'done',
      tone: 'sand',
      subtitle: m.subtitle,
    })
  }
  return out
}

export const timedOnly = (list: DayEntry[]) => list.filter((e) => e.kind !== 'block' && !e.allDay && !!e.time)
export const blocksOnly = (list: DayEntry[]) => list.filter((e) => e.kind === 'block')
export const allDayOnly = (list: DayEntry[]) => list.filter((e) => e.allDay)

// ─── Week / upcoming ────────────────────────────────────────────────────────

export interface DayGroup {
  date: DateKey
  entries: DayEntry[]
  /** BASE work mode of the day (from profile.work). */
  mode: WorkDayMode
}

/** Monday..Sunday of the week containing `anyDate`, each with its entries (empty days kept). */
export function weekAgenda(db: DB, anyDate: DateKey): DayGroup[] {
  return weekDays(anyDate).map((date) => ({ date, entries: dayEntries(db, date), mode: workMode(db.profile, date) }))
}

/**
 * Next `days` days starting at `today`, only days with entries.
 * A multi-day event appears once (on the first day inside the window), with its range label.
 */
export function upcomingAgenda(db: DB, today: DateKey, days = 30): DayGroup[] {
  const seenMulti = new Set<ID>()
  const out: DayGroup[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i)
    const entries = dayEntries(db, date).filter((e) => {
      if (!e.rangeLabel) return true
      if (seenMulti.has(e.id)) return false
      seenMulti.add(e.id)
      return true
    })
    if (entries.length) out.push({ date, entries, mode: workMode(db.profile, date) })
  }
  return out
}

/** Days (of a list) that have at least one entry — for the dots on the week strip. */
export function busyDays(db: DB, dates: DateKey[]): Set<DateKey> {
  return new Set(dates.filter((d) => agendaFor(db, d).length > 0))
}

// ─── "Para encaixar": important untimed things of the day ──────────────────

export interface LooseItem {
  key: string
  kind: 'task' | 'priority'
  id: ID
  /** Task to open/complete (a priority may point to one). */
  taskId?: ID
  title: string
  /** Shown as a tiny label: "prioridade", "vence hoje", "alta". */
  reason: string
}

/** Top-3 priorities still open + open untimed tasks that are high priority or due that day. */
export function looseItemsFor(db: DB, date: DateKey, max = 6): LooseItem[] {
  const out: LooseItem[] = []
  const taken = new Set<ID>()
  const tasksById = new Map(db.tasks.map((t) => [t.id, t]))

  for (const p of prioritiesFor(db, date)) {
    if (p.done) continue
    const task = p.ref?.type === 'task' ? tasksById.get(p.ref.id) : undefined
    if (task) {
      taken.add(task.id)
      if (task.time || isTaskDoneOn(db, task, date)) continue
    }
    out.push({ key: `p:${p.id}`, kind: 'priority', id: p.id, taskId: task?.id, title: p.title, reason: 'prioridade' })
  }

  for (const t of tasksForDay(db, date)) {
    if (taken.has(t.id) || t.time) continue
    if (!isTaskOpen(t) || t.status === 'waiting' || isTaskDoneOn(db, t, date)) continue
    const due = t.dueDate === date
    if (t.priority !== 'alta' && !due) continue
    out.push({ key: `t:${t.id}`, kind: 'task', id: t.id, taskId: t.id, title: t.title, reason: due ? 'vence hoje' : 'importante' })
  }
  return out.slice(0, max)
}

// ─── Misc ───────────────────────────────────────────────────────────────────

export const LOCAL_SOURCE_ID = SEED_IDS.sourceLocal

/** Events that belong to MARINA OS itself (exportable as .ics). */
export function localEvents(db: DB): CalendarEvent[] {
  const localSources = new Set(db.calendarSources.filter((s) => s.provider === 'local').map((s) => s.id))
  return db.events.filter((e) => !e.external && (localSources.has(e.sourceId) || e.sourceId === LOCAL_SOURCE_ID))
}

