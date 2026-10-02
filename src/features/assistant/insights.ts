/**
 * 2–4 gentle, deterministic observations for the top of the Mari page.
 * Facts + a next step. Never scores, never guilt.
 */
import type { DateKey, DB, Tone } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { isTaskOpen, petTasksDue, prioritiesFor, upcomingTrips, waitingFor } from '@/data/selectors'
import { addDays, diffDays } from '@/lib/date'
import { routeAction, sheetAction, type ResultAction } from '@/features/search/actions'
import { projectsNeedingCare } from './agents/WorkAgent'
import { plural } from './agents/common'

export interface Insight {
  id: string
  emoji: string
  text: string
  tone: Tone
  action?: ResultAction
  /** Follow-up question to ask Mari when tapped (preferred over action). */
  ask?: string
}

export function buildInsights(db: DB, today: DateKey, minutes: number, max = 4): Insight[] {
  const out: Insight[] = []

  // Waiting on someone for a while.
  const oldWaiting = waitingFor(db).filter((t) => t.waiting && diffDays(t.waiting.since, today) > 7)
  if (oldWaiting.length)
    out.push({
      id: 'waiting',
      emoji: '⏳',
      tone: 'sand',
      text: `${plural(oldWaiting.length, 'coisa esperando alguém', 'coisas esperando alguém')} há mais de 7 dias`,
      ask: 'O que estou esperando?',
    })

  // A trip coming up with things to confirm.
  const trip = upcomingTrips(db, today).find((t) => t.startDate && diffDays(today, t.startDate) <= 60)
  if (trip) {
    const open = db.tripItems.filter((i) => i.tripId === trip.id && (i.status === 'a_confirmar' || i.status === 'a_fazer')).length
    const days = diffDays(today, trip.startDate!)
    const when = days <= 0 ? 'é agora' : days === 1 ? 'é amanhã' : `é em ${days} dias`
    out.push({
      id: `trip:${trip.id}`,
      emoji: trip.flag,
      tone: 'ocean',
      text: open ? `${trip.name} ${when} — ${plural(open, 'item a confirmar', 'itens a confirmar')}` : `${trip.name} ${when} — tudo certinho ✨`,
      ask: open ? `O que tenho pendente antes de ${trip.name}?` : undefined,
      action: routeAction(ROUTES.trip(trip.id)),
    })
  }

  // Things needing Marina at work.
  const needsMe = db.tasks.filter((t) => isTaskOpen(t) && t.needsMe)
  if (needsMe.length)
    out.push({
      id: 'needsMe',
      emoji: '🙋‍♀️',
      tone: 'accent',
      text: `${plural(needsMe.length, 'coisa do trabalho precisa', 'coisas do trabalho precisam')} de você`,
      ask: 'Tenho alguma coisa urgente hoje?',
    })

  // No workout planned for tomorrow (only for people who log workouts).
  const tomorrow = addDays(today, 1)
  if (db.workouts.length && !db.workouts.some((w) => w.date === tomorrow && w.status !== 'pulado'))
    out.push({
      id: 'workout-tomorrow',
      emoji: '🏃‍♀️',
      tone: 'sage',
      text: 'Nenhum treino planejado para amanhã ainda',
      action: sheetAction('workout', { date: tomorrow }),
    })

  // Luna today.
  const luna = petTasksDue(db, today).filter((p) => !db.occurrences.some((o) => o.parentType === 'petTask' && o.parentId === p.id && o.date === today))
  if (luna.length)
    out.push({ id: 'luna', emoji: '🐾', tone: 'sand', text: `Luna: ${luna.map((p) => p.title.toLowerCase()).join(', ')} hoje`, action: routeAction(ROUTES.luna) })

  // A project that might need some love.
  const care = projectsNeedingCare(db, today)[0]
  if (care)
    out.push({ id: 'project-care', emoji: care.project.emoji, tone: 'plum', text: `${care.project.name} talvez precise de um carinho`, ask: 'Que projeto está ficando para trás?' })

  // Brain dump piling up.
  const inbox = db.brainDump.filter((b) => b.status === 'inbox').length
  if (inbox >= 5) out.push({ id: 'braindump', emoji: '🧠', tone: 'ink', text: `${inbox} ideias no brain dump esperando um destino`, action: routeAction(ROUTES.inbox) })

  // Morning without priorities.
  if (minutes < 14 * 60 && prioritiesFor(db, today).length === 0)
    out.push({ id: 'priorities', emoji: '⭐', tone: 'accent', text: 'Que tal escolher as 3 prioridades de hoje?', action: sheetAction('priorities', { date: today }) })

  if (out.length < 2)
    out.push({ id: 'calm', emoji: '✨', tone: 'sage', text: 'Tudo calmo por aqui. Pergunte o que quiser — eu cruzo seus dados pra você.' })

  return out.slice(0, max)
}
