import { ROUTES } from '@/app/routes'
import { modalityOf } from '@/data/selectors'
import { addDays, endOfWeek, minutesToHM, startOfWeek, WEEKDAY_LONG, weekday } from '@/lib/date'
import { routeAction, sheetAction } from '@/features/search/actions'
import { durationLabel, findWorkoutSlots, slotLabel } from '../freeSlots'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { capitalize, dayLabel, listJoin, plural } from './common'

const FIT_WORDS = ['encaixar', 'encaixo', 'encaixa', 'consigo', 'horario*', 'livre', 'tempo', 'espaco', 'janela', 'brecha']

function dayName(date: string, today: string): string {
  if (date === today) return 'hoje'
  if (date === addDays(today, 1)) return 'amanhã'
  return WEEKDAY_LONG[weekday(date)]
}

function fit({ db, today, minutes, q }: AgentContext): AnswerBlock[] {
  const modality = q.modalities[0] ?? 'musculacao'
  const m = modalityOf(db, modality)
  const label = m.label.toLowerCase()
  const res = findWorkoutSlots(db, today, minutes, modality)
  const items: AnswerItem[] = res.days.slice(0, 5).map((d) => {
    const best = d.slots.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a))
    return {
      id: `slot:${d.date}`,
      emoji: m.emoji,
      title: `${capitalize(dayName(d.date, today))} · ${slotLabel(best)}`,
      subtitle: d.slots.length > 1 ? `${durationLabel(best.end - best.start)} livres · +${plural(d.slots.length - 1, 'outra janela', 'outras janelas')}` : `${durationLabel(best.end - best.start)} livres`,
      action: sheetAction('workout', { date: d.date }),
    }
  })
  const lastDay = res.days.at(-1)?.date
  const range = !res.extended ? 'essa semana' : lastDay ? `até ${dayName(lastDay, today)}` : 'nos próximos dias'
  if (!items.length)
    return [
      { kind: 'headline', text: `A agenda está cheia ${range} entre 6h e 21h 😅 Talvez um treino curto de 30 min caiba — quer planejar mesmo assim?` },
      { kind: 'list', title: 'Planejar', emoji: m.emoji, items: [{ id: 'plan', emoji: m.emoji, title: `Planejar ${label}`, action: sheetAction('workout', { date: today }) }] },
    ]
  const first = res.days[0]
  const firstBest = first.slots.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a))
  const blocks: AnswerBlock[] = [
    {
      kind: 'headline',
      text: `Dá pra encaixar ${label} em ${plural(res.days.length, 'dia', 'dias')} ${range} — a primeira janela boa é ${dayName(first.date, today)}, ${minutesToHM(firstBest.start)}.`,
    },
    { kind: 'list', title: 'Janelas livres (60 min ou mais)', emoji: '🕐', items },
  ]
  if (res.skipped.length)
    blocks.push({
      kind: 'text',
      text: `Deixei de fora ${listJoin(res.skipped.map((d) => dayName(d, today)))} porque já tem ${label} por lá.`,
    })
  return blocks
}

function week({ db, today }: AgentContext): AnswerBlock[] {
  const from = startOfWeek(today)
  const to = endOfWeek(today)
  const list = db.workouts.filter((w) => w.date >= from && w.date <= to && w.status !== 'descanso').sort((a, b) => a.date.localeCompare(b.date))
  const done = list.filter((w) => w.status === 'feito' || w.status === 'adaptado')
  const planned = list.filter((w) => w.status === 'planejado' && w.date >= today)
  const tomorrow = db.workouts.filter((w) => w.date === addDays(today, 1) && w.status === 'planejado')
  const parts = [done.length && `${plural(done.length, 'treino feito', 'treinos feitos')}`, planned.length && `${plural(planned.length, 'planejado', 'planejados')}`].filter(Boolean) as string[]
  const blocks: AnswerBlock[] = [
    {
      kind: 'headline',
      text: parts.length ? `Essa semana: ${listJoin(parts)} 💪${tomorrow.length ? '' : ' Nada planejado pra amanhã ainda.'}` : 'Nenhum treino nessa semana ainda — sem pressa, quer planejar um?',
    },
  ]
  if (list.length)
    blocks.push({
      kind: 'list',
      title: 'Treinos da semana',
      emoji: '🏃‍♀️',
      items: list.map((w) => {
        const m = modalityOf(db, w.modality)
        return {
          id: `workout:${w.id}`,
          emoji: m.emoji,
          title: w.title || m.label,
          subtitle: [dayLabel(w.date, today), w.time, w.status === 'feito' ? 'feito ✓' : w.status].filter(Boolean).join(' · '),
          action: sheetAction('workout', { id: w.id }),
        }
      }),
      more: { label: 'Abrir Corpo', action: routeAction(ROUTES.body) },
    })
  else blocks.push({ kind: 'list', title: 'Planejar', emoji: '🏃‍♀️', items: [{ id: 'plan', emoji: '➕', title: 'Planejar treino', action: sheetAction('workout', { date: addDays(today, 1) }) }] })
  return blocks
}

export const TrainingAgent: Agent = {
  id: 'training',
  name: 'Treinos',
  emoji: '🏃‍♀️',
  match(q) {
    const sporty = q.modalities.length > 0 || has(q, 'treino*', 'treinar', 'exercicio*', 'malhar', 'academia')
    if (sporty && has(q, ...FIT_WORDS)) return 0.95
    if (sporty) return 0.85
    return 0
  },
  answer(ctx) {
    if (has(ctx.q, ...FIT_WORDS) || has(ctx.q, 'quando')) return fit(ctx)
    return week(ctx)
  },
}
