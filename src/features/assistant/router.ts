/**
 * One sentence → what kind of turn it is. Deterministic, pure (reads the DB, never writes).
 *
 * Order matters and is deliberate:
 *   0 READ · REASON · WRITE · ACT handlers (./act): books, pantry/feira, work, the day and the week,
 *     travel, saved studies, memory, Brain Dump capture → a LumosReply (direct + Desfazer, or confirm)
 *   1 "acordei agora" (+ "tô 30 min atrasada") → replan from now (or wake + the offset)
 *   2 meal prep / "vou presencial"          → Meal prep mode (adapter) / portable kit
 *   3 food ("comi…", macros, jantar, doce…) → nutrition engine
 *   4 checklist of a day                    → meals + prep items
 *   5 the day + training ("cancelei meu inglês", "troco a corrida por surf") → one ChangePlan
 *   6 a food said plainly ("banana com duas fatias de queijo") → log
 *   7 everything else                       → the Chief of Staff answers (agents)
 */
import { looksLikeBriefing } from '@/data/briefing/import'
import type { DateKey, DB } from '@/data/types'
import { normalize } from '@/lib/text'
import { lex } from './adjust/lexicon'
import type { ChangePlan } from './adjust/types'
import { planChecklist, planPresencial } from './day/checklist'
import { planDay, planWake, WOKE_UP } from './day/plan'
import { cleanFoodText, foodIntentOf, looksLikeFood, type FoodIntent } from './food/intent'
import { mealPrepIntentOf, type MealPrepIntent } from './food/mealprep'
import { respond } from './act/respond'
import type { LumosReply, TurnContext } from './act/types'
import type { AttachmentReading } from './attach/types'
import { firstRoutineStart } from './day/wake'

export type LumosTurn =
  | { kind: 'adjust'; plan: ChangePlan }
  | { kind: 'foodLog'; intent: Extract<FoodIntent, { kind: 'log' }> }
  | { kind: 'food'; intent: Exclude<FoodIntent, { kind: 'log' }> }
  | { kind: 'mealprep'; intent: Exclude<MealPrepIntent, { kind: 'presencial' }> }
  | { kind: 'reply'; reply: LumosReply }
  | { kind: 'answer' }

const CHECKLIST_LIST =
  /^(?:(?:monta|montar|mostra|mostrar|ver|cria|criar|faz|fazer|qual|como esta)\s+)?(?:o |meu |um |a )?checklist(?: (?:da|de|do) (?:alimentacao|comida|refeicoes))?(?: (?:de|pra|para|da|do)? ?(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo))?$/

const LATE = /\b(\d{1,3}|meia)\s*(min|minutos?|h|horas?|hora)\b.*\batrasad/

/** "tô 30 min atrasada": replan from the planned wake + the offset (never earlier than now). */
export function wakeMinutes(db: DB, n: string, today: DateKey, nowMinutes: number): number {
  const m = LATE.exec(n)
  if (!m) return nowMinutes
  const offset = m[1] === 'meia' ? 30 : m[2].startsWith('h') ? Number(m[1]) * 60 : Number(m[1])
  const start = firstRoutineStart(db, today)
  return start === undefined ? nowMinutes : Math.max(nowMinutes, start + offset)
}

export function understand(db: DB, text: string, today: DateKey, nowMinutes: number, ctx: TurnContext = {}, attachment?: AttachmentReading): LumosTurn {
  const t = text.trim()
  const n = normalize(t).replace(/[?!.]+$/g, '').trim()
  // A print/PDF + (maybe) a sentence: the reading gives the data, the sentence the intent — one turn.
  if (attachment) {
    const reply = respond(db, t, { date: today, minutes: nowMinutes }, ctx, attachment)
    return reply ? { kind: 'reply', reply } : { kind: 'answer' }
  }
  if (!n) return { kind: 'answer' }

  if (WOKE_UP.test(n) && !t.endsWith('?')) return { kind: 'adjust', plan: planWake(db, today, wakeMinutes(db, n, today, nowMinutes)) }

  const reply = respond(db, t, { date: today, minutes: nowMinutes }, ctx)
  if (reply) return { kind: 'reply', reply }

  const mp = mealPrepIntentOf(t, today)
  if (mp?.kind === 'presencial') return { kind: 'adjust', plan: planPresencial(db, mp.date, today) }
  if (mp) return { kind: 'mealprep', intent: mp }

  const food = foodIntentOf(t, today)
  if (food?.kind === 'log') return { kind: 'foodLog', intent: food }
  if (food) return { kind: 'food', intent: food }

  if (CHECKLIST_LIST.test(n)) {
    const day = lex(db, t, today).days[0]?.date ?? today
    return { kind: 'adjust', plan: planChecklist(db, day, today) }
  }

  const plan = planDay(db, t, today)
  if (plan) return { kind: 'adjust', plan }

  if (looksLikeFood(db, t)) {
    const { text: clean, at } = cleanFoodText(t)
    return { kind: 'foodLog', intent: { kind: 'log', text: clean, at, date: today } }
  }
  return { kind: 'answer' }
}

// ─── Two things in one sentence ─────────────────────────────────────────────

const JOIN = /\s*(?:,|;|\s)\s*(?:e\s+(?:tambem\s+)?|mas\s+|tambem\s+)(?=\S)|\s*[;,]\s+(?=(?:ja|passa|passar|joga|empurra|move|muda|adia|hoje|amanha|nao|coloca|adiciona|registra|recebi|comi|cancela|marca|fiz|terminei|acabei)\b)/

/** Lumos understood this clause on its own (an action, a choice, or a precise answer like "não estava no seu dia"). */
function actionable(t: LumosTurn): boolean {
  if (t.kind === 'reply') return true
  if (t.kind === 'adjust') return t.plan.changes.length > 0 || !!t.plan.scheduleOps?.length || !!t.plan.taskCreates?.length || !!t.plan.needsChoice
  // Food sentences are lists ("arroz e feijão"): never split them.
  return false
}

/**
 * "já fiz yoga e passa LinkedIn pra amanhã" → two clauses, each its own turn through the same pipeline.
 * Split only when EVERY part is something Lumos can act on alone; otherwise it stays one sentence
 * ("arroz e feijão", "Ana e Bia") — never a guess.
 */
export function clausesOf(db: DB, text: string, today: DateKey, nowMinutes: number, ctx: TurnContext = {}): string[] {
  // A pasted briefing / JSON block is one thing, never split into sentences.
  if (looksLikeBriefing(text)) return [text]
  const n = normalize(text)
  const cuts: number[] = []
  const re = new RegExp(JOIN.source, 'g')
  for (let m = re.exec(n); m; m = re.exec(n)) cuts.push(m.index, m.index + m[0].length)
  if (!cuts.length) return [text]
  const parts: string[] = []
  let from = 0
  for (let i = 0; i < cuts.length; i += 2) {
    parts.push(text.slice(from, cuts[i]).trim())
    from = cuts[i + 1]
  }
  parts.push(text.slice(from).trim())
  const clean = parts.map((p) => p.replace(/^(?:lumos[,\s]+)/i, '').trim()).filter(Boolean)
  if (clean.length < 2) return [text]
  // A day said once at the start applies to the next clause too ("amanhã não tenho inglês e passa a corrida pras 7").
  const day = /^(hoje|amanh[aã]|depois de amanh[aã])\b/i.exec(clean[0])?.[1]
  const withDay = clean.map((c, i) => (i > 0 && day && !/\b(hoje|amanh[aã]|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)\b/i.test(c) ? `${day} ${c}` : c))
  const turns = withDay.map((c) => understand(db, c, today, nowMinutes, ctx))
  // At least one real action, and every part understood on its own.
  const acts = turns.filter((t) => (t.kind === 'reply' ? !!t.reply.action || !!t.reply.options?.some((o) => o.act) : actionable(t)))
  return acts.length && turns.every(actionable) ? withDay : [text]
}
