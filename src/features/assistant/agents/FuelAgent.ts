/**
 * Training fuel questions: "Qual minha estratégia pra amanhã?", "O que comer antes do pedal?",
 * "Como foi minha semana de treinos-chave?". Shows ONLY guidance Marina (or her nutritionist)
 * registered, with its source — never invents food, amounts or targets, never mentions body numbers.
 */
import { ROUTES } from '@/app/routes'
import { dayPlanFor, FUEL_LABEL, fuelPhases, keySessionTomorrow, strategyFor, strategyText, workoutsOnDay } from '@/data/fuel'
import { modalityGroup } from '@/data/planning'
import { modalityOf } from '@/data/selectors'
import type { DateKey, DB, FuelPhase, NutritionSource, PostWorkoutCheckin, Workout } from '@/data/types'
import { addDays, endOfWeek, startOfWeek } from '@/lib/date'
import { routeAction, sheetAction } from '@/features/search/actions'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { capitalize, dayLabel, plural } from './common'

const FUEL_WORDS = ['estrategia*', 'comer', 'como antes', 'comida', 'nutri*', 'combustivel', 'fuel', 'alimentacao', 'pre treino', 'pos treino', 'intra', 'gel', 'carbo*', 'whey']
const KEY_WEEK_WORDS = ['chave', 'treinos chave', 'key']

const SOURCE_LABEL: Record<NutritionSource, string> = {
  nutricionista: 'nutricionista',
  usuaria: 'você',
  outro_profissional: 'outro profissional',
}

/** Which fuel stages the question is about (undefined = all relevant ones). */
function askedPhases(ctx: AgentContext): FuelPhase[] | undefined {
  const { q } = ctx
  const out: FuelPhase[] = []
  if (has(q, 'vespera', 'ontem', 'noite anterior', 'dia anterior')) out.push('ontem')
  if (has(q, 'antes', 'pre', 'pre treino')) out.push('pre')
  if (has(q, 'durante', 'intra', 'gel')) out.push('intra')
  if (has(q, 'depois', 'pos', 'pos treino', 'recuperar', 'recovery')) out.push('pos')
  return out.length ? out : undefined
}

/** The training the question is about: tomorrow's key session, or the next one of the named modality. */
function targetWorkout(ctx: AgentContext): Workout | undefined {
  const { db, today, q } = ctx
  if (q.modalities.length) {
    const groups = new Set(q.modalities.map((m) => modalityGroup(db.profile, m)))
    for (let d = today; d <= addDays(today, 7); d = addDays(d, 1)) {
      const list = workoutsOnDay(db, d).filter((w) => q.modalities.includes(w.modality) || groups.has(modalityGroup(db.profile, w.modality)))
      const pick = list.find((w) => w.isKeySession) ?? list[0]
      if (pick) return pick
    }
    return undefined
  }
  const date = q.time === 'hoje' ? today : addDays(today, 1)
  if (date !== today) {
    const key = keySessionTomorrow(db, today)
    if (key) return key
  }
  return workoutsOnDay(db, date).find((w) => w.isKeySession) ?? workoutsOnDay(db, date)[0]
}


function workoutLabel(db: DB, w: Workout, today: DateKey): string {
  const m = modalityOf(db, w.modality)
  return `${m.emoji} ${w.title || m.label} ${dayLabel(w.date, today)}${w.time ? `, ${w.time}` : ''}`
}

function strategyAnswer(ctx: AgentContext): AnswerBlock[] {
  const { db, today } = ctx
  const w = targetWorkout(ctx)
  const createAction = sheetAction('nutritionStrategy', {})
  if (!w && !ctx.q.modalities.length) {
    const when = ctx.q.time === 'hoje' ? 'Hoje' : 'Amanhã'
    return [{ kind: 'headline', text: `${when} não tem treino no plano — nada de estratégia especial pra preparar 🙂` }]
  }
  if (!w) {
    const what = ctx.q.modalities.length ? modalityOf(db, ctx.q.modalities[0]).label.toLowerCase() : ctx.q.time === 'hoje' ? 'hoje' : 'amanhã'
    return [
      { kind: 'headline', text: `Não achei treino de ${what} no plano dos próximos dias — e não invento estratégia 🙂` },
      { kind: 'list', title: 'Nutrição', emoji: '🥗', items: [{ id: 'nutrition', emoji: '🥗', title: 'Abrir Nutrição', action: routeAction(ROUTES.nutrition) }] },
    ]
  }
  const s = strategyFor(db, w)
  const plan = dayPlanFor(db, w.date)
  const phases = askedPhases(ctx) ?? fuelPhases(w)
  const texts = phases.map((p) => ({ p, text: strategyText(s, p) })).filter((x) => !!x.text)
  const meals = plan ? plan.meals.filter((m) => !askedPhases(ctx) || (m.phase && m.phase !== 'refeicao' && phases.includes(m.phase))) : []

  if (!texts.length && !meals.length)
    return [
      { kind: 'headline', text: `${workoutLabel(db, w, today)}. Ainda não tem estratégia cadastrada pra isso.` },
      {
        kind: 'list',
        title: 'Quando quiser',
        emoji: '🥗',
        items: [{ id: 'create', emoji: '➕', title: 'Cadastrar a orientação da nutri', subtitle: 'eu só mostro o que estiver registrado', action: createAction }],
      },
    ]

  const blocks: AnswerBlock[] = [
    { kind: 'headline', text: `${workoutLabel(db, w, today)}${s ? ` — estratégia “${s.name}”` : ''}.` },
  ]
  for (const { p, text } of texts) blocks.push({ kind: 'text', text: `${FUEL_LABEL[p]}: ${text}` })
  if (s) blocks.push({ kind: 'text', text: `Fonte: ${s.sourceName ?? SOURCE_LABEL[s.source]}.` })
  if (meals.length && plan) {
    const items: AnswerItem[] = meals.map((m, i) => ({
      id: `meal:${plan.id}:${i}`,
      emoji: m.phase === 'pre' ? '🍌' : m.phase === 'intra' ? '💧' : m.phase === 'pos' ? '🥤' : '🍽️',
      title: [m.time, m.name].filter(Boolean).join(' · '),
      subtitle: m.items.map((f) => [f.food, f.qty].filter(Boolean).join(' ')).join(' · '),
    }))
    blocks.push({
      kind: 'list',
      title: `Plano do dia: ${plan.name} (${plan.sourceName ?? SOURCE_LABEL[plan.source]})`,
      emoji: '🥗',
      items,
      more: { label: 'Abrir combustível do treino', action: sheetAction('fuel', { workoutId: w.id }) },
    })
  } else blocks.push({ kind: 'list', title: 'Treino', emoji: '🥗', items: [{ id: 'fuel', emoji: '⛽', title: 'Abrir combustível do treino', action: sheetAction('fuel', { workoutId: w.id }) }] })
  return blocks
}

const CHECKIN_WORDS: Record<'energia' | 'treino' | 'nutricao' | 'recuperacao', Record<string, string>> = {
  energia: { baixa: 'energia baixa', ok: 'energia ok', otima: 'energia ótima' },
  treino: { mais_facil: 'mais fácil que o esperado', esperado: 'como esperado', mais_dificil: 'mais difícil que o esperado' },
  nutricao: { funcionou: 'nutrição funcionou', ajustar: 'nutrição a ajustar', nao_usei: 'sem estratégia' },
  recuperacao: { boa: 'recuperação boa', atencao: 'recuperação pede atenção' },
}

export function checkinWords(c?: PostWorkoutCheckin): string[] {
  if (!c) return []
  return (Object.keys(CHECKIN_WORDS) as (keyof typeof CHECKIN_WORDS)[]).map((k) => (c[k] ? CHECKIN_WORDS[k][c[k] as string] : undefined)).filter(Boolean) as string[]
}

function keyWeek({ db, today }: AgentContext): AnswerBlock[] {
  const from = startOfWeek(today)
  const to = endOfWeek(today)
  const keys = db.workouts.filter((w) => w.isKeySession && w.date >= from && w.date <= to && w.status !== 'pulado').sort((a, b) => a.date.localeCompare(b.date))
  if (!keys.length) return [{ kind: 'headline', text: 'Nenhum treino-chave marcado nessa semana — semana mais solta também é treino 🌿' }]
  const done = keys.filter((w) => w.status === 'feito' || w.status === 'adaptado')
  return [
    { kind: 'headline', text: `Esta semana: ${plural(keys.length, 'treino-chave', 'treinos-chave')}, ${plural(done.length, 'feito', 'feitos')}.` },
    {
      kind: 'list',
      title: 'Treinos-chave',
      emoji: '🔑',
      items: keys.map((w) => {
        const m = modalityOf(db, w.modality)
        const status = w.status === 'feito' || w.status === 'adaptado' ? 'feito ✓' : 'planejado'
        return {
          id: `key:${w.id}`,
          emoji: m.emoji,
          title: w.title || m.label,
          subtitle: [capitalize(dayLabel(w.date, today)), status, ...checkinWords(w.postCheckin)].join(' · '),
          action: w.postCheckin || w.status !== 'feito' ? sheetAction('workout', { id: w.id }) : sheetAction('postWorkoutCheckin', { workoutId: w.id }),
        }
      }),
    },
  ]
}

export const FuelAgent: Agent = {
  id: 'fuel',
  name: 'Nutrição de treino',
  emoji: '🥗',
  match(q) {
    if (has(q, ...KEY_WEEK_WORDS) && has(q, 'treino*', 'semana')) return 0.97
    if (has(q, ...FUEL_WORDS)) return 0.97
    return 0
  },
  answer(ctx) {
    if (has(ctx.q, ...KEY_WEEK_WORDS)) return keyWeek(ctx)
    return strategyAnswer(ctx)
  },
}
