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
import { clausesOf, understand, type LumosTurn } from './router'
import { settle } from './act/commit'

/** 'saving': written in memory, waiting for the device. Only 'done' means it is saved. */
export type ReplyStatus = 'done' | 'pending' | 'undone' | 'cancelled' | 'saving' | 'failed'

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
  /** The "pulei essa refeição" write: saving on the device, or failed (rolled back). */
  skipSave?: 'saving' | 'failed'
  lumos?: { reply: LumosReply; status: ReplyStatus }
  /** Part of a sentence with two actions: the id of the first part (her words are shown once). */
  partOf?: number
  /** A save that failed after the change was already confirmed (e.g. Desfazer): shown under the card. */
  saveNote?: string
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

function patchLumos(id: number, status: ReplyStatus, extra: Partial<Exchange> = {}) {
  const e = find(id)
  if (e?.lumos) patch(id, { ...extra, lumos: { ...e.lumos, status } })
}

/** Writes that run inside begin() are settled only after the exchange is on screen. */
let after: (() => void)[] = []
function drain() {
  const run = after
  after = []
  for (const f of run) f()
}

function tryRun(run: () => Undo): Undo | undefined {
  try {
    return run()
  } catch (err) {
    console.error('[lumos] action failed', err instanceof Error ? err.message : 'unknown')
    return undefined
  }
}

/** A reply action ran in memory: confirm once saved, otherwise roll back and say so. */
function settleReply(id: number) {
  settle(
    () => {
      haptic('success')
      patchLumos(id, 'done', { saveNote: undefined })
    },
    () => {
      undos.get(id)?.()
      undos.delete(id)
    },
    () => patchLumos(id, 'failed'),
  )
}

function startReply(id: number, run: () => Undo): ReplyStatus {
  const undo = tryRun(run)
  if (!undo) return 'failed'
  undos.set(id, undo)
  after.push(() => settleReply(id))
  return 'saving'
}

// ─── Food (logged with a LifeEvent) ─────────────────────────────────────────

function logNow(id: number, foods: LoggedFood[], savable: Savable[], now: Now, at?: string): FoodLogState {
  let r: ReturnType<typeof logFromChat>
  let undoLog: Undo
  try {
    r = logFromChat({ foods, at })
    undoLog = logEvents([eventDraft(now, { kind: 'logged', title: `Comeu ${describeFoods(foods)}${at ? ` às ${at}` : ''}`, area: 'alimentacao', ref: { type: 'meal', id: r.meal.id } })])
  } catch {
    return { status: 'failed', foods, savable }
  }
  after.push(() =>
    settle(
      () => {
        haptic('success')
        const e = find(id)
        if (e?.food) patch(id, { food: { ...e.food, status: 'logged' } })
      },
      () => {
        undoLog()
        r.undo()
      },
      () => patch(id, { food: { status: 'failed', foods, savable } }),
    ),
  )
  return {
    status: 'saving',
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
    if (r.action?.mode === 'direct') out.lumos = { reply: r, status: startReply(ex.id, r.action.run) }
    else out.lumos = { reply: r, status: r.action ? 'pending' : 'done' }
  }

  if (turn.kind === 'adjust') {
    const plan = turn.plan
    if (hasWork(plan) && planMode(db, plan) === 'direct') out.adjust = { plan, status: startAdjust(ex.id, plan, now) }
    else out.adjust = { plan, status: 'preview' }
  }

  if (turn.kind === 'foodLog') {
    const parsed = parseLog(db, turn.intent.text)
    if (!parsed.items.length && !needsAnswer(parsed)) out.turn = { kind: 'answer' }
    else out.food = needsAnswer(parsed) ? { status: 'resolving' } : logNow(ex.id, parsed.items.map(toLoggedFood), [], now, turn.intent.at)
  }

  if (turn.kind === 'food') {
    const reply = answerFood(db, turn.intent, now.date, now.minutes)
    out.foodReply = reply
    if (reply.skip) {
      const draft = reply.skip.draft
      const undo = tryRun(() => {
        const undoSkip = saveAdjustment(draft).undo
        const undoLog = logEvents([eventDraft(now, { kind: 'changed', title: draft.reason, area: 'alimentacao' })])
        return () => {
          undoLog()
          undoSkip()
        }
      })
      if (!undo) out.skipSave = 'failed'
      else {
        undos.set(ex.id, undo)
        out.skipSave = 'saving'
        after.push(() =>
          settle(
            () => {
              haptic('success')
              patch(ex.id, { skipSave: undefined })
            },
            () => {
              undos.get(ex.id)?.()
              undos.delete(ex.id)
            },
            () => patch(ex.id, { skipSave: 'failed' }),
          ),
        )
      }
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
  // Two actions in one sentence → each runs through the same pipeline, in order.
  if (useStore.getState().hydrated) {
    const parts = clausesOf(getDB(), q, now.date, now.minutes, useConversation.getState().ctx)
    if (parts.length > 1) {
      const first = nextId
      useConversation.setState({ draft: '' })
      const say = (text: string, i: number) => {
        const pid = nextId++
        const ex: Exchange = { id: pid, question: i === 0 ? q : text, waiting: true, partOf: i === 0 ? undefined : first }
        useConversation.setState((s) => ({ exchanges: [...s.exchanges, ex] }))
        patch(pid, begin({ ...ex, question: text }, now))
        patch(pid, { question: ex.question })
        drain()
      }
      parts.forEach(say)
      markSeen()
      return first
    }
  }
  const id = nextId++
  const ex: Exchange = { id, question: q, waiting: true }
  useConversation.setState((s) => ({ exchanges: [...s.exchanges, ex], draft: '' }))
  if (useStore.getState().hydrated) {
    patch(id, begin(ex, now))
    drain()
    markSeen()
  }
  return id
}

/** Resolves turns asked before the DB was loaded (called once hydrated). */
export function resolveWaiting(now: Now = nowOf()) {
  const pending = useConversation.getState().exchanges.filter((e) => e.waiting)
  for (const e of pending) {
    patch(e.id, begin(e, now))
    drain()
  }
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

/** Confirm a pending action — or try a failed one again. */
export function confirmReply(id: number) {
  const e = find(id)
  if (!e?.lumos?.reply.action || (e.lumos.status !== 'pending' && e.lumos.status !== 'failed')) return
  patchLumos(id, startReply(id, e.lumos.reply.action.run))
  drain()
}

/** Desfazer is a write too: "Desfeito" only once the device holds it; if not, the change is put back. */
export function undoReply(id: number) {
  const e = find(id)
  const u = undos.get(id)
  if (!e?.lumos || !u || e.lumos.status !== 'done') return
  const redo = e.lumos.reply.action?.run
  u()
  undos.delete(id)
  patchLumos(id, 'saving')
  settle(
    () => patchLumos(id, 'undone', { saveNote: undefined }),
    () => {
      const again = redo && tryRun(redo)
      if (again) undos.set(id, again)
    },
    () => patchLumos(id, 'done', { saveNote: 'Não consegui salvar o desfazer no aparelho — ficou como estava.' }),
  )
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
  // The option's own action, so "Tentar de novo" and the redo after a failed Desfazer run it again.
  const reply: LumosReply = { area: 'feito', text: o.act.done, action: { mode: 'direct', run: o.act.run } }
  useConversation.setState((s) => ({ exchanges: [...s.exchanges, { id, question: o.label, turn: { kind: 'reply', reply }, lumos: { reply, status: 'saving' } }] }))
  patchLumos(id, startReply(id, o.act.run))
  drain()
}

// ─── Day / training plans ───────────────────────────────────────────────────

function patchAdjust(id: number, status: AdjustStatus, extra: Partial<Exchange> = {}) {
  const e = find(id)
  if (e?.adjust) patch(id, { ...extra, adjust: { ...e.adjust, status } })
}

function startAdjust(id: number, plan: ChangePlan, now?: Now): AdjustStatus {
  let snap: ApplySnapshot
  try {
    snap = applyPlan(plan, now)
  } catch {
    return 'failed'
  }
  snaps.set(id, snap)
  after.push(() =>
    settle(
      () => {
        haptic('success')
        patchAdjust(id, 'applied', { saveNote: undefined })
      },
      () => {
        undoPlan(snap)
        snaps.delete(id)
      },
      () => patchAdjust(id, 'failed'),
    ),
  )
  return 'saving'
}

/** Confirm a preview — or try a failed one again. */
export function confirmAdjust(id: number) {
  const e = find(id)
  if (!e?.adjust || (e.adjust.status !== 'preview' && e.adjust.status !== 'failed')) return
  patchAdjust(id, startAdjust(id, e.adjust.plan))
  drain()
}

export function undoAdjust(id: number) {
  const e = find(id)
  const snap = snaps.get(id)
  if (!e?.adjust || !snap || e.adjust.status !== 'applied') return
  const plan = e.adjust.plan
  undoPlan(snap)
  snaps.delete(id)
  patchAdjust(id, 'saving')
  settle(
    () => patchAdjust(id, 'undone', { saveNote: undefined }),
    () => snaps.set(id, applyPlan(plan)),
    () => patchAdjust(id, 'applied', { saveNote: 'Não consegui salvar o desfazer no aparelho — ficou como estava.' }),
  )
}

export function setAdjust(id: number, adjust: Exchange['adjust']) {
  patch(id, { adjust })
}

/** She picked one reading of an ambiguous sentence: apply it right away when the policy allows. */
export function chooseAdjust(id: number, plan: ChangePlan) {
  if (hasWork(plan) && planMode(getDB(), plan) === 'direct') {
    patch(id, { adjust: { plan, status: 'saving' } })
    patchAdjust(id, startAdjust(id, plan))
    drain()
  } else patch(id, { adjust: { plan, status: 'preview' } })
}

// ─── Food ───────────────────────────────────────────────────────────────────

export function logFood(id: number, foods: LoggedFood[], savable: Savable[]) {
  const e = find(id)
  if (e?.turn?.kind !== 'foodLog') return
  patch(id, { food: logNow(id, foods, savable, nowOf(), e.turn.intent.at) })
  drain()
}

export function undoFood(id: number) {
  const e = find(id)
  if (e?.food?.status !== 'logged' || !e.food.undo) return
  const food = e.food
  food.undo!()
  patch(id, { food: { ...food, status: 'saving' } })
  settle(
    () => patch(id, { food: { status: 'undone' }, saveNote: undefined }),
    () => {
      // Put the same foods back (a new record with the same content).
      const again = logNow(id, food.foods ?? [], food.savable ?? [], nowOf(), e.turn?.kind === 'foodLog' ? e.turn.intent.at : undefined)
      after = []
      patch(id, { food: { ...again, status: 'logged' } })
    },
    () => patch(id, { saveNote: 'Não consegui salvar o desfazer no aparelho — o registro continua.' }),
  )
}

export function undoSkip(id: number) {
  const u = undos.get(id)
  if (!u) return
  u()
  undos.delete(id)
  patch(id, { skipSave: 'saving' })
  settle(
    () => patch(id, { skipUndone: true, skipSave: undefined }),
    () => {
      const e = find(id)
      const draft = e?.foodReply?.skip?.draft
      if (draft) undos.set(id, saveAdjustment(draft).undo)
    },
    () => patch(id, { skipSave: undefined, saveNote: 'Não consegui salvar o desfazer no aparelho — ficou como estava.' }),
  )
}
