/**
 * "Quais são minhas prioridades da semana?" — read-only, from the real current state (no plan invented):
 *   Atrasado (with since when) · Esta semana (to-dos by day/deadline, high priority first) · Agenda (fixed
 *   appointments) · No radar (backlog windows this week) · Esperando (Waiting For).
 */
import { dayItems } from '@/data/agenda/items'
import { radarItems } from '@/data/briefing/backlog'
import { isCareerQuota, isTaskOpen } from '@/data/selectors'
import type { DateKey, DB, Task } from '@/data/types'
import { addDays, formatDayMonth, relativeDay, startOfWeek } from '@/lib/date'
import type { HandlerInput, LumosReply, ReplyLine, ReplySection } from '../types'

const WEEK = /\bprioridades?\b.*\b(?:da|dessa|desta|nessa|nesta|pra|para a|pra essa)\s+semana\b|\b(?:o que|oque)\b.*\b(?:importa|e prioridade)\b.*\bsemana\b/

const RANK: Record<string, number> = { alta: 0, media: 1, baixa: 2 }
const whenOf = (t: Task) => t.date ?? t.dueDate

function frontOf(db: DB, t: Task): string | undefined {
  return db.projects.find((p) => p.id === t.projectId)?.name ?? (t.tripId ? `Viagem · ${db.trips.find((x) => x.id === t.tripId)?.name ?? ''}` : undefined)
}

export function weekPriorities(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!WEEK.test(n)) return undefined
  const today = now.date
  const end = addDays(startOfWeek(today), 6)
  const open = db.tasks.filter((t) => isTaskOpen(t) && t.status !== 'waiting' && !t.recurrence && !isCareerQuota(t))
  const line = (t: Task, sub?: string): ReplyLine => ({ text: t.title, sub: [sub, frontOf(db, t), t.priority === 'alta' ? 'prioridade alta' : undefined].filter(Boolean).join(' · ') || undefined })
  const late = open.filter((t) => (t.dueDate ?? t.date ?? '9999') < today).sort((a, b) => whenOf(a)!.localeCompare(whenOf(b)!))
  const week = open
    .filter((t) => !late.includes(t) && whenOf(t) && whenOf(t)! >= today && whenOf(t)! <= end)
    .sort((a, b) => whenOf(a)!.localeCompare(whenOf(b)!) || (RANK[a.priority ?? ''] ?? 3) - (RANK[b.priority ?? ''] ?? 3) || a.order - b.order)
  const agenda: ReplyLine[] = []
  for (let d = today; d <= end; d = addDays(d, 1))
    for (const i of dayItems(db, d, today).filter((x) => x.refType === 'event' && x.start)) agenda.push({ text: i.title, sub: `${relativeDay(d, today)} · ${i.start}` })
  const radar = radarItems(db, today).filter((i) => i.sub !== 'sem data')
  const waiting = db.tasks.filter((t) => t.status === 'waiting')
  const sections: ReplySection[] = [
    { title: 'Atrasado', lines: late.map((t) => line(t, `desde ${formatDayMonth(whenOf(t)!)}`)) },
    { title: 'Esta semana', lines: week.slice(0, 12).map((t) => line(t, t.date ? relativeDay(t.date, today) : `prazo ${relativeDay(t.dueDate!, today)}`)) },
    { title: 'Agenda', lines: agenda.slice(0, 6) },
    { title: 'No radar', lines: radar.map((i) => ({ text: i.title, sub: [i.sub, i.front.label].filter(Boolean).join(' · ') })) },
    { title: 'Esperando', lines: waiting.map((t) => ({ text: t.waiting ? `${t.waiting.who} · ${t.title}` : t.title, sub: t.waiting?.since ? `desde ${formatDayMonth(t.waiting.since)}` : undefined })) },
  ].filter((s) => s.lines.length)
  const top = [...late, ...week].slice(0, 3).map((t) => t.title)
  return {
    area: 'semana',
    text: top.length ? `Pra semana, primeiro: ${top.join(' · ')}.` : 'Nada com dia ou prazo nesta semana — dá pra puxar algo do radar.',
    sub: [late.length ? `${late.length} atrasad${late.length === 1 ? 'o' : 'os'}` : undefined, `${week.length} com dia ou prazo até ${formatDayMonth(end as DateKey)}`, waiting.length ? `${waiting.length} esperando retorno` : undefined].filter(Boolean).join(' · '),
    sections,
    provenance: 'fact',
  }
}
