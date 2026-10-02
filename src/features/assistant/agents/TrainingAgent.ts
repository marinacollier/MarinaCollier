import { ROUTES } from '@/app/routes'
import { trainingWeekSummary, workMode } from '@/data/planning'
import { modalityOf } from '@/data/selectors'
import { addDays, endOfWeek, startOfWeek, weekday, WEEKDAY_LONG } from '@/lib/date'
import { createWorkoutAction, routeAction, sheetAction } from '@/features/search/actions'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { fitWindows } from '../windows'
import { capitalize, dayLabel, listJoin, plural } from './common'

const FIT_WORDS = ['encaixar', 'encaixo', 'encaixa', 'consigo', 'horario*', 'livre', 'tempo', 'espaco', 'janela', 'brecha']
const CONFLICT_WORDS = ['conflito*', 'choque', 'competir', 'compete*', 'sobrepo*']

/** "hoje", "amanhã", "quinta" (this/next 6 days) or "9 de out.". */
function dayName(date: string, today: string): string {
  return dayLabel(date, today)
}

function fit({ db, today, minutes, q }: AgentContext): AnswerBlock[] {
  const modality = q.modalities[0] ?? 'musculacao'
  const m = modalityOf(db, modality)
  const label = m.label.toLowerCase()
  const res = fitWindows(db, today, minutes, modality)
  const goalLine = res.goal?.perWeek ? `${res.goal.title}${res.goal.planType === 'flexivel' ? ' (flexível)' : ''}` : undefined
  const done = res.goal?.perWeek ? res.alreadyThisWeek.length >= res.goal.perWeek : false

  const items: AnswerItem[] = res.windows.map((w) => {
    const day = dayName(w.date, today)
    const presencial = workMode(db.profile, w.date) === 'presencial'
    return {
      id: `fit:${w.date}:${w.start}`,
      emoji: m.emoji,
      title: `${capitalize(day)} · ${w.start}–${w.end}`,
      subtitle: [w.reason, presencial && !w.reason.includes('presencial') ? 'dia presencial' : undefined].filter(Boolean).join(' · '),
      trailing: '+ planejar',
      action: createWorkoutAction(
        {
          date: w.date,
          time: w.start,
          modality,
          status: 'planejado',
          planType: 'flexivel',
          plannedDurationMin: res.durationMin,
          workoutGoalId: res.goal?.id,
          order: db.workouts.filter((x) => x.date === w.date).length,
        },
        `${m.emoji} ${m.label} no plano: ${day}, ${w.start} ✓`,
      ),
    }
  })

  const blocks: AnswerBlock[] = []
  if (!items.length) {
    blocks.push(
      { kind: 'headline', text: `A semana está cheia pra ${label} de ${res.durationMin} min sem competir com nada 😅 Quer escolher um horário mesmo assim?` },
      {
        kind: 'list',
        title: 'Planejar',
        emoji: m.emoji,
        items: [{ id: 'plan', emoji: '➕', title: `Planejar ${label}`, action: sheetAction('workout', { date: today, defaults: { modality, planType: 'flexivel' } }) }],
      },
    )
  } else {
    const preferred = res.windows.find((w) => res.goal?.preferredWeekdays?.includes(weekday(w.date)))
    const first = preferred ?? res.windows[0]
    blocks.push({
      kind: 'headline',
      text: done
        ? `${m.label} já tem lugar essa semana (${listJoin(res.alreadyThisWeek.map((d) => dayName(d, today)))}) ✓ Se quiser mais uma, ${dayName(first.date, today)} ${first.start} funciona.`
        : `Dá pra encaixar ${label} ${dayName(first.date, today)}, ${first.start}${preferred ? ' — o dia que você costuma preferir' : ' — sem competir com nada'}.`,
    })
    blocks.push({
      kind: 'list',
      title: 'Toque pra planejar',
      emoji: '🕐',
      items,
      more: { label: 'Escolher outro horário', action: sheetAction('workout', { date: first.date, defaults: { modality, planType: 'flexivel' } }) },
    })
  }

  const notes: string[] = []
  if (goalLine) notes.push(`${goalLine}: eu sugiro, você decide.`)
  if (res.blocked.length) {
    const byRule = new Map<string, string[]>()
    for (const b of res.blocked) byRule.set(b.constraint.name, [...(byRule.get(b.constraint.name) ?? []), dayName(b.date, today)])
    for (const [rule, days] of byRule) notes.push(`Deixei de fora ${listJoin(days)}: o check-in do dia já está em uso (${rule}).`)
  }
  if (notes.length) blocks.push({ kind: 'text', text: notes.join(' ') })
  return blocks
}

function week({ db, today }: AgentContext): AnswerBlock[] {
  const from = startOfWeek(today)
  const to = endOfWeek(today)
  const summary = trainingWeekSummary(db, today)
  const list = db.workouts
    .filter((w) => w.date >= from && w.date <= to && w.status !== 'pulado')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
  const doneCount = Object.values(summary.done).reduce((a, b) => a + b, 0)
  if (!summary.line)
    return [
      { kind: 'headline', text: 'Nenhum treino nessa semana ainda — sem pressa. Quer montar a semana?' },
      {
        kind: 'list',
        title: 'Planejar',
        emoji: '🏃‍♀️',
        items: [
          { id: 'planner', emoji: '🧭', title: 'Montar minha semana', action: routeAction(ROUTES.weekPlanner) },
          { id: 'plan', emoji: '➕', title: 'Planejar um treino', action: sheetAction('workout', { date: addDays(today, 1) }) },
        ],
      },
    ]
  const blocks: AnswerBlock[] = [{ kind: 'headline', text: `Esta semana: ${summary.line}.` }]
  if (doneCount) blocks.push({ kind: 'text', text: `${capitalize(plural(doneCount, 'treino feito', 'treinos feitos'))} até agora; o resto está no plano 💛` })
  blocks.push({
    kind: 'list',
    title: 'Treinos da semana',
    emoji: '🏃‍♀️',
    items: list.map((w) => {
      const m = modalityOf(db, w.modality)
      const status = w.status === 'feito' || w.status === 'adaptado' ? 'feito ✓' : w.status === 'descanso' ? 'descanso' : 'planejado'
      return {
        id: `workout:${w.id}`,
        emoji: m.emoji,
        title: w.title || m.label,
        subtitle: [capitalize(w.date === today ? 'hoje' : WEEKDAY_LONG[weekday(w.date)]), w.time, status].filter(Boolean).join(' · '),
        action: sheetAction('workout', { id: w.id }),
      }
    }),
    more: { label: 'Montar minha semana', action: routeAction(ROUTES.weekPlanner) },
  })
  return blocks
}

export const TrainingAgent: Agent = {
  id: 'training',
  name: 'Treinos',
  emoji: '🏃‍♀️',
  match(q) {
    const sporty = q.modalities.length > 0 || has(q, 'treino*', 'treinar', 'exercicio*', 'malhar', 'academia')
    // Conflicts, fuel and key-session questions belong to Planning / Fuel.
    if (sporty && has(q, ...CONFLICT_WORDS, 'comer', 'estrategia*', 'nutri*', 'chave', 'whey', 'gel')) return 0.5
    if (sporty && has(q, ...FIT_WORDS)) return 0.95
    if (sporty) return 0.85
    return 0
  },
  answer(ctx) {
    if (has(ctx.q, ...FIT_WORDS) || (has(ctx.q, 'quando') && ctx.q.modalities.length)) return fit(ctx)
    return week(ctx)
  },
}
