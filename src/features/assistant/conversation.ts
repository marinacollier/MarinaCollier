/**
 * The Lumos conversation — one session-only store shared by every LumosInline (Home, /lumos).
 * Asking runs READ · REASON · WRITE · ACT: the turn is understood, then (by ./act/policy.ts) simple
 * internal changes are executed right away with Desfazer, sensitive ones wait for a tap. Every write
 * logs a LifeEvent; every undo removes it. Answers that only read are recomputed from live data.
 */
import { create } from 'zustand'
import type { Now } from '@/data/intel'
import { describeFoods, saveAdjustment, toLoggedFood } from '@/data/nutrition'
import { actions, getDB, useStore } from '@/data/store'
import type { LoggedFood } from '@/data/types'
import { minutesOfDay, todayKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'
import { applyPlan, hasWork, undoPlan, type ApplySnapshot } from './adjust/apply'
import type { AdjustStatus } from './adjust/AdjustCard'
import type { ChangePlan } from './adjust/types'
import { eventDraft, logEvents } from './act/log'
import { planMode } from './act/policy'
import type { LumosReply, ReplyOption, TurnContext, Undo } from './act/types'
import { answerFood, type FoodReply } from './food/answer'
import type { FoodLogState } from './food/FoodCards'
import { logFromChat, needsAnswer, parseLog, type Savable } from './food/log'
import { understand, type LumosTurn } from './router'

export type ReplyStatus = 'done' | 'pending' | 'undone' | 'cancelled'

export interface Exchange {
  id: number
  question: string
  /** Asked before the data was loaded: resolved once it is. */
  waiting?: boolean
  turn?: LumosTurn
  adjust?: { plan: ChangePlan; status: AdjustStatus }
  food?: FoodLogState
  foodReply?: FoodReply
  skipUndone?: boolean
  lumos?: { reply: LumosReply; status: ReplyStatus }
}

interface ConversationState {
  exchanges: Exchange[]
  draft: string
  ctx: TurnContext
  /** lumosLastSeenAt is written once per session, after the first answer used the old value. */
  seenMarked: boolean
}

export const useConversation = create<ConversationState>(() => ({ exchanges: [], draft: '', ctx: {}, seenMarked: false }))

const undos = new Map<number, Undo>()
const snaps = new Map<number, ApplySnapshot>()
let nextId = 1

function nowOf(): Now {
  const d = new Date()
  return { date: todayKey(d), minutes: minutesOfDay(d), iso: d.toISOString() }
}

function patch(id: number, p: Partial<Exchange>) {
  useConversation.setState((s) => ({ exchanges: s.exchanges.map((e) => (e.id === id ? { ...e, ...p } : e)) }))
}

function find(id: number): Exchange | undefined {
  return useConversation.getState().exchanges.find((e) => e.id === id)
}

// ─── Food (logged with a LifeEvent) ─────────────────────────────────────────

function logNow(foods: LoggedFood[], savable: Savable[], now: Now, at?: string): FoodLogState {
  const r = logFromChat({ foods, at })
  const undoLog = logEvents([eventDraft(now, { kind: 'logged', title: `Comeu ${describeFoods(foods)}${at ? ` às ${at}` : ''}`, area: 'alimentacao', ref: { type: 'meal', id: r.meal.id } })])
  haptic('success')
  return {
    status: 'logged',
    mealId: r.meal.id,
    adjustmentIds: r.adjustments.map((a) => a.id),
    summary: r.adapt?.summary ?? `Registrei ${describeFoods(foods)} ✓`,
    autoApplied: r.autoApplied,
    foods,
    savable,
    undo: () => {
      undoLog()
      r.undo()
    },
  }
}

// ─── Begin a turn ───────────────────────────────────────────────────────────

function begin(ex: Exchange, now: Now): Exchange {
  const db = getDB()
  const ctx = useConversation.getState().ctx
  const turn = understand(db, ex.question, now.date, now.minutes, ctx)
  const out: Exchange = { ...ex, waiting: false, turn }

  if (turn.kind === 'reply') {
    const r = turn.reply
    if (r.ref) useConversation.setState({ ctx: { lastRef: r.ref } })
    if (r.action?.mode === 'direct') {
      undos.set(ex.id, r.action.run())
      haptic('success')
      out.lumos = { reply: r, status: 'done' }
    } else out.lumos = { reply: r, status: r.action ? 'pending' : 'done' }
  }

  if (turn.kind === 'adjust') {
    const plan = turn.plan
    if (hasWork(plan) && planMode(db, plan) === 'direct') {
      snaps.set(ex.id, applyPlan(plan, now))
      haptic('success')
      out.adjust = { plan, status: 'applied' }
    } else out.adjust = { plan, status: 'preview' }
  }

  if (turn.kind === 'foodLog') {
    const parsed = parseLog(db, turn.intent.text)
    if (!parsed.items.length && !needsAnswer(parsed)) out.turn = { kind: 'answer' }
    else out.food = needsAnswer(parsed) ? { status: 'resolving' } : logNow(parsed.items.map(toLoggedFood), [], now, turn.intent.at)
  }

  if (turn.kind === 'food') {
    const reply = answerFood(db, turn.intent, now.date, now.minutes)
    out.foodReply = reply
    if (reply.skip) {
      const undoSkip = saveAdjustment(reply.skip.draft).undo
      const undoLog = logEvents([eventDraft(now, { kind: 'changed', title: reply.skip.draft.reason, area: 'alimentacao' })])
      undos.set(ex.id, () => {
        undoLog()
        undoSkip()
      })
      haptic('success')
    }
  }
  return out
}

function markSeen() {
  if (useConversation.getState().seenMarked) return
  useConversation.setState({ seenMarked: true })
  actions.setProfile({ lumosLastSeenAt: nowISO() })
}

/** Ask Lumos (from the composer, a chip, a suggestion on Home, a ?q= link). */
export function ask(question: string, now: Now = nowOf()): number | undefined {
  const q = question.trim()
  if (!q) return undefined
  haptic('light')
  const id = nextId++
  const ex: Exchange = { id, question: q, waiting: true }
  useConversation.setState((s) => ({ exchanges: [...s.exchanges, ex], draft: '' }))
  if (useStore.getState().hydrated) {
    patch(id, begin(ex, now))
    markSeen()
  }
  return id
}

/** Resolves turns asked before the DB was loaded (called once hydrated). */
export function resolveWaiting(now: Now = nowOf()) {
  const pending = useConversation.getState().exchanges.filter((e) => e.waiting)
  for (const e of pending) patch(e.id, begin(e, now))
  if (pending.length) markSeen()
}

export function setDraft(draft: string) {
  useConversation.setState({ draft })
}

/** A line Lumos says without a turn (e.g. "ainda não leio esse tipo de arquivo"). */
export function say(question: string, reply: LumosReply) {
  const id = nextId++
  useConversation.setState((s) => ({ exchanges: [...s.exchanges, { id, question, turn: { kind: 'reply', reply }, lumos: { reply, status: 'done' } }] }))
}

export function clearConversation() {
  useConversation.setState({ exchanges: [], ctx: {} })
}

// ─── Replies (act) ──────────────────────────────────────────────────────────

export function confirmReply(id: number) {
  const e = find(id)
  if (!e?.lumos?.reply.action || e.lumos.status !== 'pending') return
  undos.set(id, e.lumos.reply.action.run())
  haptic('success')
  patch(id, { lumos: { ...e.lumos, status: 'done' } })
}

export function undoReply(id: number) {
  const e = find(id)
  const u = undos.get(id)
  if (!e?.lumos || !u) return
  u()
  undos.delete(id)
  patch(id, { lumos: { ...e.lumos, status: 'undone' } })
}

export function cancelReply(id: number) {
  const e = find(id)
  if (e?.lumos) patch(id, { lumos: { ...e.lumos, status: 'cancelled' } })
}

export function canUndo(id: number): boolean {
  return undos.has(id) || snaps.has(id)
}

/** A small direct action from an option ("Deixa pra lá") — its own line in the conversation, with Desfazer. */
export function runOption(o: ReplyOption) {
  if (o.prefill !== undefined) return setDraft(o.prefill)
  if (o.ask) return void ask(o.ask)
  if (!o.act) return
  const id = nextId++
  undos.set(id, o.act.run())
  haptic('success')
  const reply: LumosReply = { area: 'feito', text: o.act.done, action: { mode: 'direct', run: () => () => {} } }
  useConversation.setState((s) => ({ exchanges: [...s.exchanges, { id, question: o.label, turn: { kind: 'reply', reply }, lumos: { reply, status: 'done' } }] }))
}

// ─── Day / training plans ───────────────────────────────────────────────────

export function confirmAdjust(id: number) {
  const e = find(id)
  if (!e?.adjust) return
  snaps.set(id, applyPlan(e.adjust.plan))
  haptic('success')
  patch(id, { adjust: { ...e.adjust, status: 'applied' } })
}

export function undoAdjust(id: number) {
  const e = find(id)
  const snap = snaps.get(id)
  if (!e?.adjust || !snap) return
  undoPlan(snap)
  snaps.delete(id)
  patch(id, { adjust: { ...e.adjust, status: 'undone' } })
}

export function setAdjust(id: number, adjust: Exchange['adjust']) {
  patch(id, { adjust })
}

/** She picked one reading of an ambiguous sentence: apply it right away when the policy allows. */
export function chooseAdjust(id: number, plan: ChangePlan) {
  if (hasWork(plan) && planMode(getDB(), plan) === 'direct') {
    snaps.set(id, applyPlan(plan))
    haptic('success')
    patch(id, { adjust: { plan, status: 'applied' } })
  } else patch(id, { adjust: { plan, status: 'preview' } })
}

// ─── Food ───────────────────────────────────────────────────────────────────

export function logFood(id: number, foods: LoggedFood[], savable: Savable[]) {
  const e = find(id)
  if (e?.turn?.kind !== 'foodLog') return
  patch(id, { food: logNow(foods, savable, nowOf(), e.turn.intent.at) })
}

export function undoFood(id: number) {
  const e = find(id)
  e?.food?.undo?.()
  patch(id, { food: { status: 'undone' } })
}

export function undoSkip(id: number) {
  const u = undos.get(id)
  if (!u) return
  u()
  undos.delete(id)
  patch(id, { skipUndone: true })
}
