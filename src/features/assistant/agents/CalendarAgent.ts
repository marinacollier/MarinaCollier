import { ROUTES } from '@/app/routes'
import { agendaFor, eventsFor, isTaskOpen, petTasksDue, prioritiesFor } from '@/data/selectors'
import { addDays, hmToMinutes, inMinutesLabel, weekDays, WEEKDAY_LONG, weekday } from '@/lib/date'
import { routeAction, sheetAction } from '@/features/search/actions'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { capitalize, dayLabel, listJoin, plural, taskItem } from './common'

function urgentToday({ db, today, minutes }: AgentContext): AnswerBlock[] {
  const blocks: AnswerBlock[] = []
  const parts: string[] = []

  const prios = prioritiesFor(db, today).filter((p) => !p.done)
  if (prios.length) {
    blocks.push({
      kind: 'list',
      title: 'Suas prioridades de hoje',
      emoji: '⭐',
      items: prios.map((p) => ({ id: `prio:${p.id}`, emoji: '⭐', title: p.title, action: sheetAction('priorities', { date: today }) })),
    })
    parts.push(plural(prios.length, 'prioridade aberta', 'prioridades abertas'))
  }

  const deadlines = db.tasks
    .filter((t) => isTaskOpen(t) && !t.recurrence && t.status !== 'waiting')
    .filter((t) => (t.dueDate && t.dueDate <= today) || (t.date === today && t.priority === 'alta'))
    .sort((a, b) => (a.dueDate ?? a.date ?? '').localeCompare(b.dueDate ?? b.date ?? ''))
  if (deadlines.length) {
    blocks.push({
      kind: 'list',
      title: 'Prazos de hoje',
      emoji: '⏰',
      items: deadlines.map((t) => taskItem(db, t, today, t.dueDate && t.dueDate < today ? 'ficou de antes — quando der' : 'vence hoje')),
    })
    parts.push(plural(deadlines.length, 'prazo hoje', 'prazos hoje'))
  }

  const needsMe = db.tasks.filter((t) => isTaskOpen(t) && t.needsMe && !deadlines.includes(t))
  if (needsMe.length) {
    blocks.push({ kind: 'list', title: 'Precisa de você', emoji: '🙋‍♀️', items: needsMe.map((t) => taskItem(db, t, today)) })
    parts.push(plural(needsMe.length, 'coisa precisa de você', 'coisas precisam de você'))
  }

  const upcoming = eventsFor(db, today).filter((e) => !e.allDay && e.startTime && hmToMinutes(e.startTime) >= minutes)
  if (upcoming.length) {
    blocks.push({
      kind: 'list',
      title: 'Ainda hoje na agenda',
      emoji: '📅',
      items: upcoming.map((e) => ({
        id: `event:${e.id}`,
        emoji: '📅',
        title: e.title,
        subtitle: [e.startTime, e.location].filter(Boolean).join(' · '),
        trailing: inMinutesLabel(hmToMinutes(e.startTime!) - minutes),
        action: sheetAction('event', { id: e.id }),
      })),
    })
    const soon = upcoming.filter((e) => hmToMinutes(e.startTime!) - minutes <= 180)
    parts.push(soon.length ? `${plural(soon.length, 'compromisso', 'compromissos')} nas próximas horas` : plural(upcoming.length, 'compromisso mais tarde', 'compromissos mais tarde'))
  }

  const luna = petTasksDue(db, today).filter((p) => !db.occurrences.some((o) => o.parentType === 'petTask' && o.parentId === p.id && o.date === today))
  if (luna.length) {
    blocks.push({
      kind: 'list',
      title: 'Luna',
      emoji: '🐾',
      items: luna.map((p) => ({ id: `petTask:${p.id}`, emoji: '🐾', title: p.title, action: sheetAction('petTask', { id: p.id }) })),
    })
  }

  const headline = parts.length
    ? `${capitalize(listJoin(parts))}. Vai uma coisa de cada vez 💛`
    : 'Nada urgente hoje ✨ Dia leve pra focar no que importa.'
  return [{ kind: 'headline', text: headline }, ...blocks]
}

function agendaItems(ctx: AgentContext, date: string): AnswerItem[] {
  return agendaFor(ctx.db, date).map((e) => ({
    id: `${e.kind}:${e.id}`,
    emoji: e.emoji,
    title: e.title,
    subtitle: e.allDay ? 'dia todo' : [e.time, e.endTime].filter(Boolean).join('–') || undefined,
    action: e.kind === 'event' ? sheetAction('event', { id: e.id }) : e.kind === 'workout' ? sheetAction('workout', { id: e.id }) : sheetAction('task', { id: e.id }),
  }))
}

function dayAgenda(ctx: AgentContext, date: string): AnswerBlock[] {
  const items = agendaItems(ctx, date)
  const label = dayLabel(date, ctx.today)
  return [
    { kind: 'headline', text: items.length ? `${capitalize(label)}: ${plural(items.length, 'coisa marcada', 'coisas marcadas')}.` : `${capitalize(label)} está livre na agenda ✨` },
    ...(items.length
      ? [{ kind: 'list', title: capitalize(label), emoji: '📅', items, more: { label: 'Abrir agenda', action: routeAction(ROUTES.agenda) } } as AnswerBlock]
      : []),
  ]
}

function weekAgenda(ctx: AgentContext): AnswerBlock[] {
  const days = weekDays(ctx.today).filter((d) => d >= ctx.today)
  const items: AnswerItem[] = days.map((d) => {
    const entries = agendaFor(ctx.db, d)
    return {
      id: `day:${d}`,
      emoji: entries.length ? '📅' : '🌿',
      title: capitalize(d === ctx.today ? 'hoje' : d === addDays(ctx.today, 1) ? 'amanhã' : WEEKDAY_LONG[weekday(d)]),
      subtitle: entries.length ? entries.slice(0, 3).map((e) => `${e.time ? e.time + ' ' : ''}${e.title}`).join(' · ') : 'livre',
      trailing: entries.length ? String(entries.length) : undefined,
      action: routeAction(ROUTES.agenda),
    }
  })
  const busy = items.filter((i) => i.trailing).length
  return [
    { kind: 'headline', text: `Até domingo: ${plural(busy, 'dia com coisas marcadas', 'dias com coisas marcadas')}, ${plural(items.length - busy, 'livre', 'livres')}.` },
    { kind: 'list', title: 'Sua semana', emoji: '🗓️', items },
  ]
}

export const CalendarAgent: Agent = {
  id: 'calendar',
  name: 'Agenda',
  emoji: '🗓️',
  match(q) {
    if (has(q, 'urgente', 'urgentes', 'urgencia', 'importante hoje', 'meu dia', 'fazer hoje')) return 0.95
    if (has(q, 'agenda', 'compromisso*', 'reuniao', 'reunioes', 'evento*', 'marcado')) return 0.85
    if (q.time === 'hoje' || q.time === 'amanha') return 0.5
    if (q.time === 'semana' && has(q, 'tenho', 'como')) return 0.45
    return 0
  },
  answer(ctx) {
    const { q } = ctx
    if (has(q, 'urgente', 'urgentes', 'urgencia', 'importante hoje', 'meu dia', 'fazer hoje')) return urgentToday(ctx)
    if (q.time === 'amanha') return dayAgenda(ctx, addDays(ctx.today, 1))
    if (q.time === 'semana') return weekAgenda(ctx)
    if (has(q, 'agenda', 'compromisso*', 'reuniao', 'reunioes', 'evento*')) return dayAgenda(ctx, ctx.today)
    return urgentToday(ctx)
  },
}
