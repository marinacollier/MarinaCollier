/**
 * DAILY MARINA OS — the morning answer ("bom dia", "o que eu tenho hoje?", Lumos opened in the morning).
 * Eight short sections, always in this order (an empty one is left out, except Agenda and Treino):
 *
 *   1 Agenda do dia            — the universal calendar for the active day (real entries only)
 *   2 Três prioridades do dia  — the ones she chose (or up to 3 suggestions, marked as such)
 *   3 Trabalho por projeto     — today's tasks/meetings grouped by project (ended projects left out)
 *   4 Treino planejado         — today's training; a rest/transition day said kindly (never a failure)
 *   5 Idioma ou faculdade      — Inglês / Espanhol / Pós-graduação things of the day
 *   6 Luna                     — her care of the day (a time only when the record has one)
 *   7 Pendências financeiras   — bills/receivables due in the next 3 days (nothing when finance is locked)
 *   8 Conflitos e sobrecarga   — overlapping entries today and a day over 100% of her awake time
 *
 * Every line carries ONE tag: confirmado · planejado · sugerido · concluído · adiado — derived from the
 * record (status, planType, override, postponedFrom). Nothing is "confirmado" without the record saying so.
 * Pure: (db, now, options) → sections. The day is the active one (the trip's local day while traveling).
 */
import { SEED_IDS } from '@/data/seed/ids'
import { calendarConflicts, calendarEntries, entriesOn, isSpan, isTimed, tzNote, type CalendarEntry } from '@/data/calendar/universal'
import { kindOfEntry } from '@/data/calendar/kind'
import type { Now } from '@/data/intel'
import { overrideFor } from '@/data/timeline'
import { prioritiesFor, tasksForDay, isTaskDoneOn } from '@/data/selectors'
import type { DateKey, DayPriority, DB, Project, Task, TimeHM } from '@/data/types'
import { addDays, diffDays, hmToMinutes, minutesToHM } from '@/lib/date'
import { formatBRL } from '@/lib/money'
import { activeDay } from '@/features/today/local-day'
import type { ReplyLine, ReplySection } from '../act/types'

export type DailyTag = 'confirmado' | 'planejado' | 'sugerido' | 'concluído' | 'adiado'
export const DAILY_TAGS: readonly DailyTag[] = ['confirmado', 'planejado', 'sugerido', 'concluído', 'adiado']

export type DailySectionKey = 'agenda' | 'prioridades' | 'projetos' | 'treino' | 'estudo' | 'luna' | 'financas' | 'alertas'

export const DAILY_TITLES: Record<DailySectionKey, string> = {
  agenda: 'Agenda do dia',
  prioridades: 'Três prioridades do dia',
  projetos: 'Trabalho por projeto',
  treino: 'Treino planejado',
  estudo: 'Idioma ou faculdade',
  luna: 'Luna',
  financas: 'Pendências financeiras',
  alertas: 'Conflitos e sobrecarga',
}

export const DEFAULT_BRIEFING_TIME: TimeHM = '06:15'

/** Her briefing time (Ajustes may set it; default 06:15). */
export function briefingTimeOf(db: Pick<DB, 'profile'>): TimeHM {
  const t = db.profile.briefingTime
  return t && /^\d{2}:\d{2}$/.test(t) ? t : DEFAULT_BRIEFING_TIME
}

/** Morning window for the briefing: from her briefing time until midday. */
export function isBriefingWindow(db: Pick<DB, 'profile'>, minutes: number): boolean {
  return minutes >= hmToMinutes(briefingTimeOf(db)) && minutes < (db.profile.dayParts?.middayStart ?? 12) * 60
}

export interface DailyLine extends ReplyLine {
  tag?: DailyTag
}

export interface DailySection extends ReplySection {
  key: DailySectionKey
  lines: DailyLine[]
}

export interface DailyBriefing {
  /** The active day (trip's local day while traveling). */
  date: DateKey
  /** Minutes of the active day "now". */
  minutes: number
  timeZone?: string
  sections: DailySection[]
  /** Share of her awake time already committed (0–∞, rounded %). */
  loadPct: number
}

export interface DailyOptions {
  financeLocked?: boolean
  careerLocked?: boolean
  /** Suggestions when she hasn't chosen today's priorities (the "organiza meu dia" picker). */
  suggest?: (db: DB, date: DateKey) => { title: string; why?: string }[]
}

/** Projects that ended: never a section of the day, even with old tasks still around. */
const ENDED_PROJECT_IDS = new Set<string>([SEED_IDS.projSantander])

export function isEndedProject(db: DB, p: Project, day: DateKey): boolean {
  if (p.status === 'concluido' || ENDED_PROJECT_IDS.has(p.id)) return true
  const contracts = (db.contracts ?? []).filter((c) => c.projectId === p.id)
  return contracts.length > 0 && contracts.every((c) => c.status === 'encerrado' || (!!c.endDate && c.endDate < day))
}

const STUDY_RE = /ingl[eê]s|english|cambly|espanhol|spanish|p[oó]s[- ]?gradua|\bp[oó]s\b|faculdade|\bmba\b/i

const AGENDA_SOURCES = new Set<CalendarEntry['sourceType']>(['event', 'meeting', 'school', 'tripItem', 'task'])
const PROJECT_SOURCES = new Set<CalendarEntry['sourceType']>(['event', 'meeting', 'milestone', 'delivery', 'content', 'partnership', 'ugcFollowUp'])

// ─── Tags ───────────────────────────────────────────────────────────────────

/** Moved later that day by an override (her "empurra pra tarde"). */
function movedLater(db: DB, e: CalendarEntry, day: DateKey): boolean {
  const base = e.sourceType === 'event' ? db.events.find((x) => x.id === e.sourceId)?.startTime : e.sourceType === 'task' ? db.tasks.find((x) => x.id === e.sourceId)?.time : e.sourceType === 'workout' ? db.workouts.find((x) => x.id === e.sourceId)?.time : undefined
  if (!base) return false
  const type = e.sourceType === 'event' ? 'event' : e.sourceType === 'task' ? 'task' : 'workout'
  const o = overrideFor(db, day, type, e.sourceId)
  return !!o?.time && !o.cancelled && hmToMinutes(o.time) > hmToMinutes(base)
}

export function entryTag(db: DB, e: CalendarEntry, day: DateKey): DailyTag {
  if (e.status === 'feito') return 'concluído'
  if (e.optional) return 'sugerido'
  if (e.sourceType === 'task') {
    const t = db.tasks.find((x) => x.id === e.sourceId)
    if (t?.postponedFrom && t.postponedFrom < day) return 'adiado'
  }
  if (movedLater(db, e, day)) return 'adiado'
  return e.status === 'confirmado' ? 'confirmado' : 'planejado'
}

export function taskTag(db: DB, t: Task, day: DateKey): DailyTag {
  if (isTaskDoneOn(db, t, day)) return 'concluído'
  if (t.postponedFrom && t.postponedFrom < day) return 'adiado'
  return t.planType === 'fixo' ? 'confirmado' : 'planejado'
}

const priorityTag = (p: DayPriority): DailyTag => (p.done ? 'concluído' : 'planejado')

// ─── Lines ──────────────────────────────────────────────────────────────────

function whenOf(e: CalendarEntry, zone: string | undefined): string | undefined {
  if (e.allDay || !e.startAt.time) return e.approx ? undefined : 'dia todo'
  const range = e.endAt.time && e.endAt.time !== e.startAt.time ? `${e.startAt.time}–${e.endAt.time}` : e.startAt.time
  const tz = zone ? tzNote(e, zone) : undefined
  return [e.approx ? `por volta de ${e.startAt.time}` : range, tz].filter(Boolean).join(' · ')
}

const subOf = (tag: DailyTag, ...rest: (string | undefined)[]) => [tag, ...rest].filter(Boolean).join(' · ')

function entryLine(db: DB, e: CalendarEntry, day: DateKey, zone: string | undefined, emoji: string, extra?: string): DailyLine {
  const tag = entryTag(db, e, day)
  return { text: e.title, emoji, tag, sub: subOf(tag, whenOf(e, zone), extra) }
}

const EMOJI: Partial<Record<CalendarEntry['category'], string>> = { trabalho: '💼', estudo: '📚', treino: '🏃‍♀️', saude: '🩺', viagem: '✈️', financas: '💸', luna: '🐾', social: '🥂' }

// ─── Busy load ──────────────────────────────────────────────────────────────

/** Committed minutes of the day (timed entries merged + untimed tasks' durations) over awake minutes. */
export function dayLoad(db: DB, entries: CalendarEntry[], day: DateKey): number {
  const wake = hmToMinutes(db.profile.rhythm.wakeTime)
  let sleep = hmToMinutes(db.profile.rhythm.sleepTime)
  if (sleep <= wake) sleep += 24 * 60
  const awake = Math.max(60, sleep - wake)
  const spans = entries
    .filter((e) => isTimed(e) && e.startAt.date === day && e.status !== 'feito' && e.status !== 'cancelado' && !e.optional)
    .map((e) => {
      const s = hmToMinutes(e.startAt.time!)
      const end = e.endAt.time ? hmToMinutes(e.endAt.time) : s + 30
      return [s, end > s ? end : s + 30] as const
    })
    .sort((a, b) => a[0] - b[0])
  let busy = 0
  let cursor = -1
  for (const [s, e] of spans) {
    const from = Math.max(s, cursor)
    if (e > from) busy += e - from
    cursor = Math.max(cursor, e)
  }
  const timedTaskIds = new Set(entries.filter((e) => e.sourceType === 'task').map((e) => e.sourceId))
  for (const t of tasksForDay(db, day)) {
    if (timedTaskIds.has(t.id) || t.time || isTaskDoneOn(db, t, day) || t.status === 'waiting') continue
    busy += t.durationMin ?? 0
  }
  return Math.round((busy / awake) * 100)
}

// ─── The briefing ───────────────────────────────────────────────────────────

export function dailyBriefing(db: DB, now: Now, opts: DailyOptions = {}): DailyBriefing {
  // Same rule as Home: while traveling, the trip's local day and clock.
  const clock = now.iso ? new Date(now.iso) : new Date(`${now.date}T${minutesToHM(now.minutes)}:00-03:00`)
  const active = activeDay(db, now.date, clock, now.minutes)
  const day = active.date
  const zone = active.timeZone ?? db.profile.timezone ?? 'America/Sao_Paulo'
  const range = calendarEntries(db, day, addDays(day, 3), { today: day, financeLocked: opts.financeLocked, careerLocked: opts.careerLocked })
  const todays = entriesOn(range, day).filter((e) => e.sourceType !== 'trip')

  // Each entry of the day lands in exactly one section.
  const claimed = new Set<string>()
  const claim = (e: CalendarEntry) => claimed.add(e.id)
  const isTraining = (e: CalendarEntry) => e.category === 'treino' || (e.sourceType === 'tripItem' && kindOfEntry(db, e) === 'treino')
  const isStudy = (e: CalendarEntry) => e.sourceType === 'school' || STUDY_RE.test(e.title)
  const isLuna = (e: CalendarEntry) => e.category === 'luna' && e.sourceType !== 'petBirthday'

  const sections: DailySection[] = []
  const push = (key: DailySectionKey, lines: DailyLine[], keepEmpty?: DailyLine) => {
    if (lines.length) sections.push({ key, title: DAILY_TITLES[key], lines })
    else if (keepEmpty) sections.push({ key, title: DAILY_TITLES[key], lines: [keepEmpty] })
  }

  // 4 · 5 · 6 claim first (so the agenda doesn't repeat them).
  const training = todays.filter(isTraining)
  training.forEach(claim)
  const studyEntries = todays.filter((e) => !claimed.has(e.id) && isStudy(e))
  studyEntries.forEach(claim)
  const luna = todays.filter((e) => !claimed.has(e.id) && isLuna(e))
  luna.forEach(claim)

  // 1 · Agenda (a project's task shows under its project instead).
  const projects = db.projects.filter((p) => !isEndedProject(db, p, day)).sort((a, b) => a.order - b.order)
  const live = new Set(projects.map((p) => p.id))
  const agenda = todays.filter((e) => !claimed.has(e.id) && AGENDA_SOURCES.has(e.sourceType) && (!isSpan(e) || e.startAt.date === day || e.endAt.date === day) && !e.optional && !e.base && (e.sourceType !== 'task' || (isTimed(e) && !(e.linkedProjectId && live.has(e.linkedProjectId)))))
  agenda.forEach(claim)
  push(
    'agenda',
    agenda.slice(0, 6).map((e) => entryLine(db, e, day, zone, EMOJI[e.category] ?? '📅')),
    { text: 'Nada marcado na agenda hoje', emoji: '🌿' },
  )
  if (agenda.length > 6) sections[sections.length - 1].lines.push({ text: `e mais ${agenda.length - 6}`, emoji: '…' })

  // 2 · Prioridades (max 3).
  const chosen = prioritiesFor(db, day)
  const prio: DailyLine[] = chosen.length
    ? chosen.slice(0, 3).map((p, i) => ({ text: `${String(i + 1).padStart(2, '0')} ${p.title}`, tag: priorityTag(p), sub: priorityTag(p) }))
    : (opts.suggest?.(db, day) ?? []).slice(0, 3).map((p, i) => ({ text: `${String(i + 1).padStart(2, '0')} ${p.title}`, tag: 'sugerido' as const, sub: subOf('sugerido', p.why), provenance: 'suggestion' as const }))
  push('prioridades', prio)

  // 3 · Trabalho por projeto (ended projects stay out).
  const byProject = new Map<string, DailyLine[]>()
  const add = (pid: string, l: DailyLine) => byProject.set(pid, [...(byProject.get(pid) ?? []), l])
  const projTaskIds = new Set<string>()
  for (const t of tasksForDay(db, day)) {
    if (!t.projectId || !live.has(t.projectId) || t.status === 'waiting') continue
    projTaskIds.add(t.id)
    const tag = taskTag(db, t, day)
    add(t.projectId, { text: t.title, emoji: '•', tag, sub: subOf(tag, t.time) })
  }
  for (const e of todays) {
    if (claimed.has(e.id) || !e.linkedProjectId || !live.has(e.linkedProjectId)) continue
    if (e.sourceType === 'task' ? projTaskIds.has(e.sourceId) : !PROJECT_SOURCES.has(e.sourceType)) continue
    claim(e)
    const l = entryLine(db, e, day, zone, '•')
    add(e.linkedProjectId, l)
  }
  const projLines: DailyLine[] = []
  for (const p of projects) {
    const ls = byProject.get(p.id)
    if (!ls?.length) continue
    for (const l of ls.slice(0, 3)) projLines.push({ ...l, emoji: p.emoji, sub: `${p.name} · ${l.sub}` })
    if (ls.length > 3) projLines.push({ text: `${p.name}: e mais ${ls.length - 3}`, emoji: p.emoji })
  }
  push('projetos', projLines)

  // 4 · Treino (rest is part of the plan — never a failure).
  const rest = db.workouts.find((w) => w.date === day && w.status === 'descanso')
  const liveTraining = training.filter((e) => e.status !== 'cancelado')
  const easy = (e: CalendarEntry) => /transi|recupera|regenera|descanso/i.test(e.title) || db.workouts.find((w) => w.id === e.sourceId)?.modality === 'recuperacao'
  let trainLines: DailyLine[] = liveTraining.map((e) => entryLine(db, e, day, zone, '🏃‍♀️', easy(e) ? 'dia leve de transição — no seu ritmo' : undefined))
  if (!trainLines.length) {
    trainLines = rest
      ? [{ text: rest.title || 'Dia de descanso', emoji: '🌿', tag: 'planejado', sub: subOf('planejado', 'descansar também é treino — o corpo agradece') }]
      : [{ text: 'Sem treino hoje', emoji: '🌿', tag: 'sugerido', sub: subOf('sugerido', 'descanso também conta — aproveita pra recuperar') }]
  }
  push('treino', trainLines)

  // 5 · Idioma ou faculdade (entries + untimed tasks of the day).
  const studyLines = studyEntries.map((e) => entryLine(db, e, day, zone, '📚'))
  for (const t of tasksForDay(db, day)) {
    if (t.time || !STUDY_RE.test(t.title) || projTaskIds.has(t.id) || t.status === 'waiting') continue
    const tag = taskTag(db, t, day)
    studyLines.push({ text: t.title, emoji: '📚', tag, sub: subOf(tag, 'sem horário') })
  }
  push('estudo', studyLines.slice(0, 4))

  // 6 · Luna (a time only when the record has one).
  const lunaLines = luna.map((e) => {
    const tag = entryTag(db, e, day)
    return { text: e.title, emoji: '🐾', tag, sub: subOf(tag, e.startAt.time && !e.allDay ? whenOf(e, zone) : 'sem horário') }
  })
  for (const t of tasksForDay(db, day)) {
    if (t.time || t.context !== 'luna' || t.status === 'waiting') continue
    const tag = taskTag(db, t, day)
    lunaLines.push({ text: t.title, emoji: '🐾', tag, sub: subOf(tag, 'sem horário') })
  }
  push('luna', lunaLines.slice(0, 4))

  // 7 · Finanças: due in the next 3 days; locked area → no titles, no amounts.
  const due = range.filter((e) => (e.sourceType === 'bill' || e.sourceType === 'receivable') && e.status === 'pendente' && e.startAt.date >= day && e.startAt.date <= addDays(day, 3))
  if (opts.financeLocked) {
    if (due.length) push('financas', [{ text: `${due.length} ${due.length === 1 ? 'pendência' : 'pendências'} nos próximos 3 dias`, emoji: '🔒', tag: 'planejado', sub: subOf('planejado', 'Finanças bloqueadas — desbloqueie para ver') }])
  } else {
    push(
      'financas',
      due.slice(0, 4).map((e) => {
        const d = diffDays(day, e.startAt.date)
        const when = d === 0 ? (e.sourceType === 'bill' ? 'vence hoje' : 'previsto pra hoje') : d === 1 ? (e.sourceType === 'bill' ? 'vence amanhã' : 'previsto pra amanhã') : `em ${d} dias`
        const amount = e.amountCents != null ? formatBRL(e.amountCents) : undefined
        return { text: e.title, emoji: e.sourceType === 'bill' ? '💸' : '💰', tag: 'planejado' as const, sub: subOf('planejado', when, amount) }
      }),
    )
  }

  // 8 · Conflitos e sobrecarga.
  const conflicts = calendarConflicts(todays, db).filter((c) => c.date === day)
  const alerts: DailyLine[] = conflicts.slice(0, 3).map((c) => ({ text: c.text, emoji: '⚠️', tag: 'planejado', sub: subOf('planejado', 'conflito de horário') }))
  const loadPct = dayLoad(db, todays, day)
  if (loadPct > 100) alerts.push({ text: `Dia acima da capacidade: ~${loadPct}% do seu tempo acordada`, emoji: '🔥', tag: 'planejado', sub: subOf('planejado', 'vale tirar ou mover alguma coisa') })
  push('alertas', alerts)

  return { date: day, minutes: active.minutes, timeZone: active.timeZone, sections, loadPct }
}
