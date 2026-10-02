/**
 * Planning questions: "Amanhã é presencial?", "O que levar amanhã?", "Tem conflito essa semana?".
 * Everything comes from data (profile.work, constraints, calendar, workouts) via data/planning.ts.
 */
import { ROUTES } from '@/app/routes'
import { conflictsBetween, PERIOD_LABEL, workMode } from '@/data/planning'
import { modalityOf } from '@/data/selectors'
import type { DateKey, WorkDayMode } from '@/data/types'
import { addDays, endOfWeek, hmToMinutes, minutesToHM, startOfWeek } from '@/lib/date'
import { routeAction, sheetAction } from '@/features/search/actions'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { capitalize, dayLabel, plural } from './common'

const PRESENCIAL_WORDS = ['presencial', 'escritorio', 'levar', 'mochila', 'bolsa', 'remoto', 'home office']
const CONFLICT_WORDS = ['conflito*', 'choque', 'competir', 'compete*', 'sobrepo*', 'encavalad*']

const MODE_WORD: Record<WorkDayMode, string> = {
  presencial: 'presencial 👜',
  remoto: 'remoto 💻',
  flexivel: 'flexível 💻',
  off: 'dia sem trabalho 🌿',
}

function targetDay({ q, today }: AgentContext): DateKey {
  return q.time === 'hoje' ? today : addDays(today, 1)
}

function presencial(ctx: AgentContext): AnswerBlock[] {
  const { db, today } = ctx
  const date = targetDay(ctx)
  const label = date === today ? 'hoje' : 'amanhã'
  const work = db.profile.work
  const mode = workMode(db.profile, date)
  const workouts = db.workouts
    .filter((w) => w.date === date && w.status !== 'pulado' && w.status !== 'descanso')
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  const blocks: AnswerBlock[] = []

  const workoutItems: AnswerItem[] = workouts.map((w) => {
    const m = modalityOf(db, w.modality)
    return {
      id: `workout:${w.id}`,
      emoji: m.emoji,
      title: w.title || m.label,
      subtitle: [w.time, !w.time && w.period ? PERIOD_LABEL[w.period] : undefined, 'separar o equipamento'].filter(Boolean).join(' · '),
      action: sheetAction('workout', { id: w.id }),
    }
  })

  if (mode === 'presencial') {
    const leave = work.commuteBeforeMin > 0 ? minutesToHM(Math.max(0, hmToMinutes(work.start) - work.commuteBeforeMin)) : undefined
    blocks.push({
      kind: 'headline',
      text: `Sim — ${label} é presencial 👜${work.location ? ` (${work.location})` : ''}. Base ${work.start}–${work.end}${leave ? `, saindo por volta de ${leave}` : ''}.`,
    })
    if (work.presencialChecklist.length)
      blocks.push({
        kind: 'list',
        title: date === today ? 'Pra levar' : 'Pra deixar pronto hoje',
        emoji: '👜',
        items: work.presencialChecklist.map((text, i) => ({ id: `check:${i}`, emoji: '▫️', title: text })),
        more: { label: 'Editar a lista', action: routeAction(ROUTES.settings) },
      })
    else blocks.push({ kind: 'text', text: 'Dá pra ter uma listinha do que levar nos dias presenciais — fica em Ajustes.' })
    if (workoutItems.length) blocks.push({ kind: 'list', title: `Treino de ${label}`, emoji: '🎒', items: workoutItems })
    const early = workouts.some((w) => w.time && hmToMinutes(w.time) < hmToMinutes(work.start) - work.commuteBeforeMin)
    const short = db.routines.find((r) => r.active && r.hasEssential)
    if (early && short)
      blocks.push({ kind: 'text', text: `Treino cedo + presencial: se a manhã apertar, a versão ${short.essentialName ?? 'curta'} de “${short.name}” segura o dia ✨` })
    return blocks
  }

  blocks.push({ kind: 'headline', text: `Não — ${label} é ${MODE_WORD[mode]}${has(ctx.q, 'levar', 'mochila', 'bolsa') ? ', nada de mochila de escritório' : ''}.` })
  let next: DateKey | undefined
  for (let d = addDays(date, 1); d <= addDays(date, 7); d = addDays(d, 1)) {
    if (workMode(db.profile, d) === 'presencial') {
      next = d
      break
    }
  }
  if (next) blocks.push({ kind: 'text', text: `O próximo presencial é ${dayLabel(next, today)}.` })
  if (workoutItems.length) blocks.push({ kind: 'list', title: `Treino de ${label}`, emoji: '🎒', items: workoutItems })
  return blocks
}

function range({ q, today }: AgentContext): { from: DateKey; to: DateKey; label: string } {
  if (has(q, 'proxima semana', 'semana que vem')) {
    const from = addDays(startOfWeek(today), 7)
    return { from, to: addDays(from, 6), label: 'na semana que vem' }
  }
  if (q.time === 'amanha') return { from: addDays(today, 1), to: addDays(today, 1), label: 'amanhã' }
  if (q.time === 'hoje') return { from: today, to: today, label: 'hoje' }
  return { from: today, to: endOfWeek(today), label: 'essa semana' }
}

function conflicts(ctx: AgentContext): AnswerBlock[] {
  const { db, today } = ctx
  const r = range(ctx)
  const list = conflictsBetween(db, r.from, r.to)
  if (!list.length)
    return [
      { kind: 'headline', text: `Nenhum conflito ${r.label} ✨ Tudo cabendo direitinho.` },
      { kind: 'list', title: 'Planejar', emoji: '🧭', items: [{ id: 'planner', emoji: '🧭', title: 'Montar minha semana', action: routeAction(ROUTES.weekPlanner) }] },
    ]
  const sorted = [...list].sort((a, b) => (a.severity === b.severity ? a.date.localeCompare(b.date) : a.severity === 'warn' ? -1 : 1))
  const warn = list.filter((c) => c.severity === 'warn').length
  const shown = sorted.slice(0, 4)
  return [
    {
      kind: 'headline',
      text: warn
        ? `${capitalize(plural(warn, 'coisa', 'coisas'))} pra olhar ${r.label}. Eu não mudo nada sozinha — você decide.`
        : `Nada sério ${r.label}, só ${plural(list.length, 'aviso', 'avisos')} pra você saber.`,
    },
    {
      kind: 'conflicts',
      items: shown.map((conflict) => ({ conflict, dayLabel: capitalize(dayLabel(conflict.date, today)) })),
      more: list.length > shown.length ? { label: `Ver todos (${list.length})`, action: sheetAction('conflicts', { from: r.from, to: r.to }) } : undefined,
    },
  ]
}

export const PlanningAgent: Agent = {
  id: 'planning',
  name: 'Planejamento',
  emoji: '🧭',
  match(q) {
    if (has(q, ...CONFLICT_WORDS)) return 0.97
    // "O que levar pra África?" is a trip question.
    if (has(q, ...PRESENCIAL_WORDS)) return q.trips.length ? 0 : 0.97
    return 0
  },
  answer(ctx) {
    if (has(ctx.q, ...CONFLICT_WORDS)) return conflicts(ctx)
    return presencial(ctx)
  },
}
