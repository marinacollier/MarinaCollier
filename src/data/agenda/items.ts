/**
 * ActionItem — one operational queue for the Home, projected from the existing models (never copied):
 *   the day's timeline (workouts, events, routines, meals/fuel, timed tasks, Luna, meal-prep checklist)
 *   + untimed tasks of the day + tasks carried over from before + Waiting For follow-ups due
 *   + career next actions (opportunities, contacts) + trip to-dos with a date + deadlines (content,
 *   partnerships, milestones, project deliveries).
 * Each item points at its own record (`refType` + `refId`); nothing here writes, nothing is turned into a Task.
 * Pure: the UI decides how to check/open each kind (see `check`).
 */
import { dayTimeline } from '../timeline'
import { carriedOverTasks, isCareerQuota, prioritiesFor, tasksForDay } from '../selectors'
import type { DateKey, DB, DayPriority, Project, Task, TimeHM, TimelineEntry } from '../types'
import { addDays, hmToMinutes } from '@/lib/date'

/** Filter chips: Tudo · Trabalho · Corpo · Vida. Career, study and content count as Trabalho. */
export type FrontGroup = 'trabalho' | 'corpo' | 'vida'

export interface Front {
  /** Small uppercase label: SANTANDER, TREINO, NUTRIÇÃO, CARREIRA, LUNA, VIAGEM… ('' when there's none). */
  label: string
  group: FrontGroup
}

/**
 * How the Home completes it:
 *  toggle  → the record's own done-state (task, routine step, Luna, prep, trip to-do)
 *  routine → every step of that routine at once
 *  workout → mark the training as done (sheet to add duration/distance)
 *  meal    → "comi" with the real time
 *  none    → not something you tick (events, deadlines, follow-ups): tap opens it
 */
export type CheckKind = 'toggle' | 'routine' | 'workout' | 'meal' | 'none'

export type ActionSource = 'timeline' | 'task' | 'waiting' | 'opportunity' | 'contact' | 'tripItem' | 'deadline'

export interface ActionItem {
  /** Unique in a day: `${refType}:${refId}`. */
  key: string
  source: ActionSource
  refType: string
  refId: string
  date: DateKey
  start?: TimeHM
  end?: TimeHM
  title: string
  sub?: string
  emoji?: string
  front: Front
  status: 'pending' | 'done' | 'skipped' | 'cancelled'
  doneAt?: TimeHM
  check: CheckKind
  /** 0..2 when it is one of the day's Top 3. */
  priority?: number
  /** Worth showing in a compact day: events, key sessions, priorities, deadlines, timed tasks. */
  important: boolean
  /** Planned for an earlier day and still open ("ficou de antes"). */
  carried?: boolean
  /** Routine steps / sub-items. */
  children?: ActionItem[]
  /** The timeline row this came from (for the existing check/open helpers). */
  entry?: TimelineEntry
}

export interface ItemOptions {
  /** Areas whose details must not show (privacy lock): their items become a neutral line. */
  hidden?: { carreira?: boolean; dinheiro?: boolean }
}

const NONE: Front = { label: '', group: 'vida' }
const up = (s: string) => s.toLocaleUpperCase('pt-BR')

function projectFront(p: Project | undefined): Front | undefined {
  if (!p) return undefined
  return { label: up(p.name), group: 'trabalho' }
}

export function taskFront(db: DB, t: Task): Front {
  const project = projectFront(t.projectId ? db.projects.find((p) => p.id === t.projectId) : undefined)
  if (project) return project
  if (t.tripId) {
    const trip = db.trips.find((x) => x.id === t.tripId)
    return { label: trip ? `VIAGEM · ${up(trip.name)}` : 'VIAGEM', group: 'vida' }
  }
  switch (t.context) {
    case 'carreira':
      return { label: 'CARREIRA', group: 'trabalho' }
    case 'estudo':
      return { label: 'ESTUDO', group: 'trabalho' }
    case 'conteudo':
      return { label: 'CONTEÚDO', group: 'trabalho' }
    case 'trabalho':
      return { label: 'TRABALHO', group: 'trabalho' }
    case 'viagem':
      return { label: 'VIAGEM', group: 'vida' }
    case 'luna':
      return { label: 'LUNA', group: 'vida' }
    case 'vida_real':
      return { label: t.lifeAdminCategory === 'luna' ? 'LUNA' : 'VIDA', group: 'vida' }
  }
  if (t.careerKind) return { label: 'CARREIRA', group: 'trabalho' }
  return NONE
}

function entryFront(db: DB, e: TimelineEntry): Front {
  switch (e.kind) {
    case 'workout':
      return { label: 'TREINO', group: 'corpo' }
    case 'meal':
      return { label: 'NUTRIÇÃO', group: 'corpo' }
    case 'prep':
      return { label: 'NUTRIÇÃO', group: 'corpo' }
    case 'petTask':
      return { label: 'LUNA', group: 'vida' }
    case 'routineItem':
    case 'routine':
      return { label: 'ROTINA', group: 'vida' }
    case 'event': {
      const ev = db.events.find((x) => x.id === e.ref.id)
      const project = projectFront(ev?.projectId ? db.projects.find((p) => p.id === ev.projectId) : undefined)
      if (project) return project
      const cat = (ev?.category ?? '').toLowerCase()
      if (/trabalho|carreira/.test(cat)) return { label: 'AGENDA · TRABALHO', group: 'trabalho' }
      if (/sa[uú]de|corpo|treino/.test(cat)) return { label: 'AGENDA · SAÚDE', group: 'corpo' }
      return { label: 'AGENDA', group: 'vida' }
    }
    case 'task': {
      const t = db.tasks.find((x) => x.id === e.ref.id)
      return t ? taskFront(db, t) : NONE
    }
    default:
      return NONE
  }
}

function checkFor(e: TimelineEntry): CheckKind {
  if (e.kind === 'workout') return e.ref.type === 'workout' ? 'workout' : 'none'
  if (e.kind === 'meal') return e.ref.type === 'planMeal' && !e.ref.id.startsWith('meal:') ? 'meal' : 'none'
  if (e.kind === 'event' || e.kind === 'work') return 'none'
  return e.editable.check ? 'toggle' : 'none'
}

function fromEntry(db: DB, e: TimelineEntry): ActionItem {
  const w = e.kind === 'workout' ? db.workouts.find((x) => x.id === e.ref.id) : undefined
  return {
    key: `${e.ref.type}:${e.ref.id}`,
    source: 'timeline',
    refType: e.ref.type,
    refId: e.ref.id,
    date: e.date,
    start: e.timeSource === 'anytime' ? undefined : e.start,
    end: e.timeSource === 'anytime' ? undefined : e.end,
    title: e.title,
    sub: e.subtitle,
    emoji: e.emoji,
    front: entryFront(db, e),
    status: e.status,
    doneAt: e.doneAt,
    check: checkFor(e),
    important: e.kind === 'event' || !!w?.isKeySession || !!w?.isLongSession || (e.kind === 'task' && !!e.start && e.timeSource !== 'anytime'),
    entry: e,
  }
}

function taskItem(db: DB, t: Task, date: DateKey, carried = false): ActionItem {
  const done = t.status === 'done'
  return {
    key: `task:${t.id}`,
    source: 'task',
    refType: 'task',
    refId: t.id,
    date,
    title: t.title,
    sub: carried && t.date ? 'ficou de antes' : t.dueDate === date && t.date !== date ? 'prazo hoje' : undefined,
    front: taskFront(db, t),
    status: done ? 'done' : 'pending',
    check: 'toggle',
    important: t.priority === 'alta' || t.needsMe === true || t.dueDate === date,
    carried,
  }
}

/** Routine steps collapse into ONE row per routine ("Milagre da Manhã · 2/8"), steps as children. */
function collapseRoutines(db: DB, items: ActionItem[]): ActionItem[] {
  const routineOfItem = new Map(db.routineItems.map((i) => [i.id, i.routineId]))
  const out: ActionItem[] = []
  const groups = new Map<string, ActionItem>()
  for (const it of items) {
    const rid = it.refType === 'routineItem' ? routineOfItem.get(it.refId) : undefined
    const routine = rid ? db.routines.find((r) => r.id === rid) : undefined
    if (!routine) {
      out.push(it)
      continue
    }
    let g = groups.get(routine.id)
    if (!g) {
      g = { key: `routine:${routine.id}`, source: 'timeline', refType: 'routine', refId: routine.id, date: it.date, start: it.start, end: it.end, title: routine.name, emoji: routine.emoji, front: { label: 'ROTINA', group: 'vida' }, status: 'pending', check: 'routine', important: false, children: [] }
      groups.set(routine.id, g)
      out.push(g)
    }
    g.children!.push(it)
    if (it.start && (!g.start || it.start < g.start)) g.start = it.start
    if (it.end && (!g.end || it.end > g.end)) g.end = it.end
  }
  for (const g of groups.values()) {
    const live = g.children!.filter((c) => c.status !== 'cancelled' && c.status !== 'skipped')
    const done = live.filter((c) => c.status === 'done').length
    g.sub = `${done}/${live.length}`
    g.status = live.length === 0 ? 'cancelled' : done === live.length ? 'done' : 'pending'
    g.doneAt = g.status === 'done' ? live.map((c) => c.doneAt).filter(Boolean).sort().at(-1) : undefined
  }
  return out
}

function markPriorities(items: ActionItem[], priorities: DayPriority[]): void {
  priorities.forEach((p, rank) => {
    const hit = items.find((it) => (p.ref && it.refType === p.ref.type && it.refId === p.ref.id) || it.title.trim().toLowerCase() === p.title.trim().toLowerCase())
    if (hit) {
      hit.priority = rank
      hit.important = true
    }
  })
}

/** Everything Marina has to do (or attend) on `date`, one row per real record. */
export function dayItems(db: DB, date: DateKey, today: DateKey, opts: ItemOptions = {}): ActionItem[] {
  const entries = dayTimeline(db, date).filter((e) => e.kind !== 'work')
  const items: ActionItem[] = collapseRoutines(db, entries.map((e) => fromEntry(db, e)))
  const seen = new Set(items.map((i) => i.key))
  const push = (it: ActionItem) => {
    if (seen.has(it.key)) return
    seen.add(it.key)
    items.push(it)
  }

  // Tasks of the day without a time (the timeline only places timed ones).
  for (const t of tasksForDay(db, date)) {
    if (t.status === 'waiting' || t.status === 'archived' || isCareerQuota(t) || t.recurrence) continue
    push(taskItem(db, t, date))
  }
  // Recurring tasks without a time (e.g. the monthly Executive Review).
  for (const t of tasksForDay(db, date).filter((x) => x.recurrence && !x.time)) {
    const done = db.occurrences.some((o) => o.parentType === 'task' && o.parentId === t.id && o.date === date && o.status === 'done')
    push({ ...taskItem(db, t, date), status: done ? 'done' : 'pending' })
  }
  if (date === today) for (const t of carriedOverTasks(db, date)) if (!isCareerQuota(t)) push(taskItem(db, t, date, true))

  // Waiting For: the day she said she'd follow up (overdue ones show today).
  for (const t of db.tasks) {
    const f = t.status === 'waiting' ? t.waiting?.followUpOn : undefined
    if (!f || !(f === date || (date === today && f < today))) continue
    push({ key: `waiting:${t.id}`, source: 'waiting', refType: 'task', refId: t.id, date, title: `Cobrar ${t.waiting!.who}: ${t.title}`, sub: f < date ? 'era pra antes' : undefined, front: taskFront(db, t), status: 'pending', check: 'none', important: true })
  }

  // Career next actions (opportunities, people).
  const careerHidden = !!opts.hidden?.carreira
  for (const o of db.opportunities ?? []) {
    const d = o.nextActionDate
    if (!d || o.status === 'fechada' || o.status === 'descartada' || !(d === date || (date === today && d < today))) continue
    push({ key: `opportunity:${o.id}`, source: 'opportunity', refType: 'opportunity', refId: o.id, date, title: careerHidden ? 'Próxima ação de carreira' : `${o.nextAction ?? 'Próxima ação'} · ${o.role} (${o.company})`, front: { label: 'CARREIRA', group: 'trabalho' }, status: 'pending', check: 'none', important: true })
  }
  for (const c of db.contacts ?? []) {
    const d = c.nextFollowUp
    if (!d || !(d === date || (date === today && d < today))) continue
    push({ key: `contact:${c.id}`, source: 'contact', refType: 'contact', refId: c.id, date, title: careerHidden ? 'Follow-up de networking' : `Follow-up com ${c.name}${c.company ? ` (${c.company})` : ''}`, front: { label: 'CARREIRA', group: 'trabalho' }, status: 'pending', check: 'none', important: true })
  }

  // Trip to-dos on that day.
  for (const ti of db.tripItems) {
    if (ti.date !== date || (ti.status !== 'a_fazer' && ti.status !== 'a_confirmar' && ti.status !== 'feito')) continue
    const trip = db.trips.find((x) => x.id === ti.tripId)
    push({ key: `tripItem:${ti.id}`, source: 'tripItem', refType: 'tripItem', refId: ti.id, date, start: ti.time, title: ti.status === 'a_confirmar' ? `Confirmar: ${ti.title}` : ti.title, front: { label: trip ? `VIAGEM · ${up(trip.name)}` : 'VIAGEM', group: 'vida' }, status: ti.status === 'feito' ? 'done' : 'pending', check: 'toggle', important: !!ti.time })
  }

  // Deadlines that land on that day (information: open the record to act).
  for (const c of db.contentItems) {
    if (c.deadline !== date || c.stage === 'publicado') continue
    push({ key: `content:${c.id}`, source: 'deadline', refType: 'content', refId: c.id, date, title: c.title, sub: 'prazo', front: { label: 'CONTEÚDO', group: 'trabalho' }, status: 'pending', check: 'none', important: true })
  }
  for (const p of db.partnerships) {
    if (p.deadline !== date || p.stage === 'finalizado') continue
    push({ key: `partnership:${p.id}`, source: 'deadline', refType: 'partnership', refId: p.id, date, title: `${p.brand}: entrega`, sub: 'prazo', front: { label: 'CONTEÚDO', group: 'trabalho' }, status: 'pending', check: 'none', important: true })
  }
  for (const m of db.milestones) {
    if (m.date !== date || m.done || m.status === 'feito') continue
    const p = db.projects.find((x) => x.id === m.projectId)
    push({ key: `milestone:${m.id}`, source: 'deadline', refType: 'milestone', refId: m.id, date, title: m.title, sub: 'marco', front: projectFront(p) ?? { label: 'TRABALHO', group: 'trabalho' }, status: 'pending', check: 'none', important: true })
  }
  for (const p of db.projects) {
    if (p.status === 'concluido' || p.nextDelivery?.date !== date) continue
    push({ key: `delivery:${p.id}`, source: 'deadline', refType: 'project', refId: p.id, date, title: p.nextDelivery.title, sub: 'entrega', front: projectFront(p)!, status: 'pending', check: 'none', important: true })
  }

  markPriorities(items, prioritiesFor(db, date))
  return items
}

const startOf = (i: ActionItem) => (i.start ? hmToMinutes(i.start) : undefined)
const endOf = (i: ActionItem) => (i.end ? hmToMinutes(i.end) : startOf(i) !== undefined ? startOf(i)! + 30 : undefined)
const live = (i: ActionItem) => i.status !== 'cancelled' && i.status !== 'skipped'

/** Untimed order: Top 3 first, then what matters (deadline, needs-me), then carried, then by front. */
function untimedOrder(a: ActionItem, b: ActionItem): number {
  const pa = a.priority ?? 9
  const pb = b.priority ?? 9
  if (pa !== pb) return pa - pb
  if (a.important !== b.important) return a.important ? -1 : 1
  if (!!a.carried !== !!b.carried) return a.carried ? 1 : -1
  return a.front.label.localeCompare(b.front.label) || a.title.localeCompare(b.title)
}

export interface TodaySections {
  /** Timed and still open, but its time already passed ("mais cedo"). */
  earlier: ActionItem[]
  /** Happening now. */
  now: ActionItem[]
  /** Later today, chronological. */
  later: ActionItem[]
  /** No time: "quando der hoje" — never given an invented time. */
  anytime: ActionItem[]
  /** Done today (collapsed on Home). */
  done: ActionItem[]
  total: number
}

export function todaySections(items: ActionItem[], nowMinutes: number): TodaySections {
  const open = items.filter((i) => live(i) && i.status !== 'done')
  const done = items.filter((i) => i.status === 'done').sort((a, b) => (a.doneAt ?? a.start ?? '').localeCompare(b.doneAt ?? b.start ?? ''))
  const timed = open.filter((i) => startOf(i) !== undefined).sort((a, b) => startOf(a)! - startOf(b)! || a.title.localeCompare(b.title))
  const now = timed.filter((i) => startOf(i)! <= nowMinutes && nowMinutes < endOf(i)!)
  const earlier = timed.filter((i) => endOf(i)! <= nowMinutes && !now.includes(i))
  const later = timed.filter((i) => startOf(i)! > nowMinutes)
  const anytime = open.filter((i) => startOf(i) === undefined).sort(untimedOrder)
  return { earlier, now, later, anytime, done, total: items.filter(live).length }
}

export interface UpcomingDay {
  date: DateKey
  items: ActionItem[]
  /** Open, not cancelled. */
  count: number
  prioCount: number
  /** What a compact day shows: priorities, events, key sessions, deadlines, timed tasks (max 3). */
  highlights: ActionItem[]
}

/** The next `days` days after today, each with its full list and a compact summary. */
export function upcomingDays(db: DB, today: DateKey, days = 6, opts: ItemOptions = {}): UpcomingDay[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i + 1)).map((date) => {
    const items = dayItems(db, date, today, opts).filter(live)
    const open = items.filter((i) => i.status !== 'done')
    const sorted = [...open].sort((a, b) => (startOf(a) ?? 1e4) - (startOf(b) ?? 1e4) || untimedOrder(a, b))
    const highlights = [...sorted.filter((i) => i.priority !== undefined), ...sorted.filter((i) => i.priority === undefined && i.important)].slice(0, 3)
    return { date, items: sorted, count: open.length, prioCount: open.filter((i) => i.priority !== undefined).length, highlights }
  })
}

/** Open to-dos with no day at all — still findable from Home ("sem dia"), grouped by front. */
export function undatedItems(db: DB, today: DateKey): ActionItem[] {
  const out: ActionItem[] = []
  for (const t of db.tasks) {
    if (t.date || t.dueDate || t.recurrence || t.bucket === 'hoje' || t.status === 'done' || t.status === 'archived' || t.status === 'waiting' || isCareerQuota(t)) continue
    out.push(taskItem(db, t, today))
  }
  const soonTrips = new Set(db.trips.filter((tr) => tr.status !== 'concluida' && (!tr.endDate || tr.endDate >= today)).map((tr) => tr.id))
  for (const ti of db.tripItems) {
    if (ti.date || !soonTrips.has(ti.tripId) || (ti.status !== 'a_fazer' && ti.status !== 'a_confirmar')) continue
    const trip = db.trips.find((x) => x.id === ti.tripId)
    out.push({ key: `tripItem:${ti.id}`, source: 'tripItem', refType: 'tripItem', refId: ti.id, date: today, title: ti.status === 'a_confirmar' ? `Confirmar: ${ti.title}` : ti.title, front: { label: trip ? `VIAGEM · ${up(trip.name)}` : 'VIAGEM', group: 'vida' }, status: 'pending', check: 'toggle', important: false })
  }
  return out.sort((a, b) => a.front.label.localeCompare(b.front.label) || a.title.localeCompare(b.title))
}
