/**
 * Lumos · motor de prioridade. Reads, except "tenho MAIS/MENOS N minutos", which changes the day's timeline
 * through the same allocation the Home uses (persisted, with the sentence of what changed):
 *   "tenho 40 minutos livres" / "tenho 1 hora"           → the plan for that much time
 *   "estou cansada" / "tô sem energia"                    → the plan with low energy (rest said explicitly)
 *   "o que faço agora?" / "o que posso fazer agora?"      → the plan for the rest of the day
 *   "o que posso adiar?" / "o que pode esperar?"          → only "Podem esperar", with reasons
 *   "quero estudar política" / "não quero idiomas" / "quero descansar" (with any of the above) → interest of the day
 * Answers come from planDay (deterministic), with the engine's reasons. No AI is simulated.
 */
import { ROUTES } from '@/app/routes'
import type { Energy } from '@/data/priority/contract'
import { planDay, type DayPlan, type PlanItem } from '@/data/priority/engine'
import { minutesToHM } from '@/lib/date'
import { activeDay } from '@/features/today/local-day'
import { parseAdjust, runAdjust } from '@/features/today/home/adjust'
import { dayContextFor, formatMin } from '@/features/today/home/day-checkin'
import { NUMBER_RE, numberOf } from '../text'
import type { Handler, HandlerInput, LumosReply, ReplyLine } from '../types'

const AREA = 'agora'

const FREE = new RegExp(`\\btenho (?:so |uns |umas |mais )?(meia|${NUMBER_RE.slice(1, -1)}) ?(min|minutos?|h|horas?|hora)(?: e meia)?(?: (?:livres?|de folga|sobrando))?(?: hoje| agora)?(?=$|,| o que| e | pra | para )`)
const TIRED = /\b(?:estou|to|tou|ando|me sinto|fiquei)\s+(?:muito\s+|meio\s+|super\s+|bem\s+)?(?:cansad[ao]|exaust[ao]|esgotad[ao]|sem energia|sem pique)\b|^sem energia\b/
const NOW = /\bo que (?:eu )?(?:faco|posso fazer|devo fazer|vale fazer|da pra fazer|faz sentido fazer)(?: agora| hoje| ainda hoje| com (?:esse|o meu|meu) tempo(?: livre)?)?$/
const DEFER = /\bo que (?:eu )?(?:posso|da pra|consigo) (?:adiar|deixar pra depois|empurrar)\b|\bo que pode esperar\b/
const INTEREST = /\b(?:quero (?:estudar|descansar|focar em|ler sobre)|nao quero [a-z]+)\b.*$/

function itemLine(i: PlanItem, emoji: string): ReplyLine {
  return {
    text: i.c.title,
    emoji,
    sub: [`~${formatMin(i.minutes)}`, i.slot ? `${i.slot.start}–${i.slot.end}` : undefined, ...i.c.reasons.slice(0, 2), i.c.nextStep ? `Próximo passo: ${i.c.nextStep}` : undefined]
      .filter(Boolean)
      .join(' · '),
  }
}

function planReply(plan: DayPlan, lead: string): LumosReply {
  const lines: ReplyLine[] = []
  if (plan.primary) lines.push(itemLine(plan.primary, '⭐'))
  for (const s of plan.secondary) lines.push(itemLine(s, '•'))
  const sections = [
    plan.essentials.length
      ? {
          title: 'Essenciais',
          lines: [{ text: plan.essentials.map((e) => e.title).join(' · ') }],
        }
      : undefined,
    {
      title: 'Espaço livre',
      lines: [
        {
          text: `${formatMin(plan.freeSpaceMin)} sem nada marcado — de propósito`,
        },
      ],
    },
    plan.later.length
      ? {
          title: 'Podem esperar',
          lines: plan.later.slice(0, 5).map((l) => ({ text: l.c.title, sub: l.why })),
        }
      : undefined,
  ].filter((s): s is NonNullable<typeof s> => !!s)
  const text = plan.primary ? `${lead} Eu começaria por: ${plan.primary.c.title}.` : `${lead} Nada precisa caber agora — aproveita o espaço.`
  return {
    area: AREA,
    text,
    sub: plan.restHint,
    lines,
    sections,
    link: { label: 'Ver no Início', to: ROUTES.today },
  }
}

function run(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  // Anything about studying ("o que eu estudo", "não quero estudar") is the Learning Engine's to answer.
  if (/\bestud/.test(n)) return undefined
  const free = FREE.exec(n)
  const tired = TIRED.test(n)
  const asksNow = NOW.test(n)
  const defer = DEFER.test(n)
  const interestMatch = INTEREST.exec(n)
  const local = activeDay(db, now.date, new Date(now.iso ?? Date.now()), now.minutes)
  // "tenho MAIS 30 minutos" / "menos tempo" change the day's timeline for real (same engine as the Home bar).
  const adj = parseAdjust(n)
  if (adj && (adj.kind === 'mais' || adj.kind === 'menos')) {
    const r = runAdjust(adj, local.date, local.minutes)
    return { area: AREA, text: r.message, link: { label: 'Ver no Início', to: ROUTES.today } }
  }
  if (!free && !tired && !asksNow && !defer && !(interestMatch && /^(?:hoje )?(?:so )?(?:quero descansar|nao quero estudar)\b/.test(n))) return undefined

  const base = dayContextFor(db, local.date, local.minutes)
  const ctx = { ...base.ctx, now: minutesToHM(local.minutes) }
  if (free) {
    const q = free[1] === 'meia' ? 30 : (numberOf(free[1]) ?? 0)
    const mins = free[2].startsWith('h') ? q * 60 + (/e meia/.test(free[0]) ? 30 : 0) : free[1] === 'meia' ? 30 : q
    ctx.freeMin = mins
    ctx.focusMin = undefined
  }
  if (tired) ctx.energy = (/\bmuito|exaust|esgotad/.test(n) ? 1 : Math.min(2, ctx.energy)) as Energy
  if (interestMatch) ctx.interest = [ctx.interest, interestMatch[0]].filter(Boolean).join(', ')

  const plan = planDay(db, ctx, { windows: base.cap.windows, skip: base.skip })
  if (defer && !free && !tired && !asksNow) {
    const flexible = [plan.primary, ...plan.secondary]
      .filter((i): i is PlanItem => !!i && i.c.moscow === 'could')
      .map((i) => ({ c: i.c, why: 'Cabe hoje, mas pode ficar pra outro dia' }))
    const can = [...flexible, ...plan.later]
    if (!can.length)
      return {
        area: AREA,
        text: 'Nada aqui dá pra adiar sem custo — o que está no plano é importante e cabe no teu dia.',
      }
    return {
      area: AREA,
      text: `Isso pode esperar sem prejuízo (${can.length}):`,
      lines: can.slice(0, 8).map((l) => ({ text: l.c.title, sub: l.why })),
      sub: plan.essentials.length ? `Os essenciais ficam: ${plan.essentials.map((e) => e.title).join(' · ')}.` : undefined,
    }
  }
  const lead = free ? `Com ${formatMin(ctx.freeMin)}, guardando espaço livre:` : tired ? 'Vamos no leve hoje.' : 'Pelo teu dia agora:'
  return planReply(plan, lead)
}

export const priorityHandler: Handler = { id: 'priority', run }
