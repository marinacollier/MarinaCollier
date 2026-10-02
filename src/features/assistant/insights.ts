/**
 * 2–4 gentle, deterministic observations for the top of the Mari page.
 * Facts + a next step. Never scores, never guilt.
 */
import type { DateKey, DB, Tone, Trip } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { conflictsBetween, isPresencial } from '@/data/planning'
import { isTaskOpen, modalityOf, petTasksDue, prioritiesFor, upcomingTrips, waitingFor } from '@/data/selectors'
import { addDays, diffDays, endOfWeek, relativeDay, weekDays } from '@/lib/date'
import { routeAction, sheetAction, type ResultAction } from '@/features/search/actions'
import { projectsNeedingCare } from './agents/WorkAgent'
import { capitalize, plural } from './agents/common'

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
  const out: Insight[] = [...planningInsights(db, today, minutes)]

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

  // A trip coming up with things to review (the ≤ 7 days case is a planning insight above).
  const trip = upcomingTrips(db, today).find((t) => t.startDate && t.startDate >= today && diffDays(today, t.startDate) <= 60)
  if (trip && !out.some((i) => i.id === `trip:${trip.id}`)) out.push(tripInsight(db, trip, today))

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

function tripInsight(db: DB, trip: Trip, today: DateKey): Insight {
  const open = db.tripItems.filter((i) => i.tripId === trip.id && (i.status === 'a_confirmar' || i.status === 'a_fazer')).length
  const days = diffDays(today, trip.startDate!)
  const when = days <= 0 ? 'é hoje' : days === 1 ? 'é amanhã' : `é em ${days} dias`
  return {
    id: `trip:${trip.id}`,
    emoji: trip.flag,
    tone: 'ocean',
    text: open ? `${trip.name} ${when} — ${plural(open, 'item pra revisar', 'itens pra revisar')}` : `${trip.name} ${when} — tudo certinho ✨`,
    ask: open ? `O que falta pra ${trip.name}?` : undefined,
    action: routeAction(ROUTES.trip(trip.id)),
  }
}

/**
 * Gentle planning observations, all from data: tomorrow presencial (evening), a check-in conflict
 * this week, a flexible weekly intention without a place yet, a trip in ≤ 7 days with things to review.
 */
export function planningInsights(db: DB, today: DateKey, minutes: number): Insight[] {
  const out: Insight[] = []
  const tomorrow = addDays(today, 1)

  if (minutes >= db.profile.dayParts.eveningStart * 60 && isPresencial(db.profile, tomorrow))
    out.push({ id: 'presencial-tomorrow', emoji: '👜', tone: 'sand', text: 'Amanhã é presencial. Quer preparar as coisas hoje?', ask: 'O que levar amanhã?' })

  const checkin = conflictsBetween(db, today, endOfWeek(today)).find((c) => c.kind === 'checkin_limit')
  if (checkin)
    out.push({
      id: `conflict:${checkin.key}`,
      emoji: '⚠️',
      tone: 'sand',
      text: `${capitalize(relativeDay(checkin.date, today))}: ${checkin.refs.length === 2 ? 'dois treinos podem' : 'treinos podem'} competir pelo mesmo check-in`,
      ask: 'Tem conflito essa semana?',
    })

  const soon = upcomingTrips(db, today).find((t) => t.startDate && t.startDate >= today && diffDays(today, t.startDate) <= 7)
  if (soon) out.push(tripInsight(db, soon, today))

  const week = weekDays(today)
  if (week.some((d) => d >= today)) {
    for (const g of db.workoutGoals) {
      if (g.status !== 'ativa' || g.planType !== 'flexivel' || !g.perWeek || !g.modality || g.obligation === false) continue
      const placed = db.workouts.filter((w) => w.modality === g.modality && week.includes(w.date) && w.status !== 'pulado' && w.status !== 'descanso').length
      if (placed >= g.perWeek) continue
      const m = modalityOf(db, g.modality)
      out.push({
        id: `flex:${g.id}`,
        emoji: m.emoji,
        tone: 'plum',
        text: `${m.label} ainda não tem lugar essa semana — quer que eu ache uma janela?`,
        ask: `Quando consigo encaixar ${m.label.toLowerCase()}?`,
      })
      break
    }
  }
  return out
}
