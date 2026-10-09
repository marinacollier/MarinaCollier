/**
 * The conversation's door to the Lumos Intelligence Layer (@/data/intel).
 *
 * Lumos always asks the real engines first. While the engines are still the contract placeholders
 * (detected by `lifeContext().week` being empty — a real engine always returns 7 days), a small local
 * fallback keeps every scenario working end-to-end. INTEGRATOR: once src/data/intel lands, the
 * `fallback*` functions here can be deleted — callers only use the exported wrappers.
 */
import {
  changeFeed,
  dailyBrief,
  lifeContext,
  needsAttention,
  planChange,
  planWeek,
  type AttentionItem,
  type ChangeItem,
  type GraphPlan,
  type LifeContext,
  type Now,
  type WeekProposal,
} from '@/data/intel'
import { areaLocked } from '@/app/lock-store'
import { conflictsBetween, proposeWeekFromTemplate, workMode } from '@/data/planning'
import { actions, getDB } from '@/data/store'
import { dayTimeline, isAnytime } from '@/data/timeline'
import type { DateKey, DB, ISODateTime, ScheduleOverride, WorkDayMode } from '@/data/types'
import { addDays, diffDays, endOfWeek, startOfWeek, toInstant, weekday, weekDays, WEEKDAY_LONG } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { capitalize, listJoin, plural } from '../agents/common'
import { eventDraft, logEvents } from './log'
import { patternQuestion, ripePatterns } from './memory'
import type { Undo } from './types'

const readyCache = new WeakMap<DB, boolean>()

/** True once the real intelligence engines are in (the placeholder never returns a week). */
export function intelReady(db: DB, now: Now): boolean {
  const hit = readyCache.get(db)
  if (hit !== undefined) return hit
  let ready = false
  try {
    ready = lifeContext(db, now).week.length > 0
  } catch {
    ready = false
  }
  readyCache.set(db, ready)
  return ready
}

export function contextOf(db: DB, now: Now): LifeContext | undefined {
  return intelReady(db, now) ? lifeContext(db, now) : undefined
}

// ─── NeedsAttention ─────────────────────────────────────────────────────────

export function attentionFor(db: DB, now: Now): AttentionItem[] {
  return intelReady(db, now) ? needsAttention(db, now) : fallbackAttention(db, now)
}

function acked(db: DB, key: string, today: DateKey): boolean {
  return db.attentionAcks.some((a) => a.key === key && (a.how !== 'snoozed' || !a.until || a.until >= today))
}

export function fallbackAttention(db: DB, now: Now): AttentionItem[] {
  const today = now.date
  const out: AttentionItem[] = []
  for (const c of conflictsBetween(db, today, addDays(today, 6))) {
    if (c.severity !== 'warn') continue
    out.push({ key: `conflict:${c.key}`, kind: 'conflict', title: c.message.replace(/^⚠️\s*/, ''), detail: `${capitalize(WEEKDAY_LONG[weekday(c.date)])} · ${c.title}`, provenance: 'inference', ref: c.refs[0] ? { type: c.refs[0].type, id: c.refs[0].id } : undefined })
  }
  for (const t of db.tasks) {
    if (t.status !== 'waiting' || !t.waiting) continue
    const due = t.waiting.followUpOn ? t.waiting.followUpOn <= today : diffDays(t.waiting.since, today) >= 7
    if (!due) continue
    const who = t.waiting.who || 'alguém'
    out.push({
      key: `waiting:${t.id}`,
      kind: 'waiting_reply',
      title: `${t.title} — esperando ${who}`,
      detail: t.waiting.followUpOn ? 'Era o dia de dar um toque.' : `Desde ${t.waiting.since.split('-').reverse().slice(0, 2).join('/')}.`,
      options: t.waiting.who ? [{ label: `${who} respondeu`, ask: `${who} me respondeu` }] : undefined,
      provenance: 'fact',
      ref: { type: 'task', id: t.id },
    })
  }
  for (const m of ripePatterns(db)) {
    out.push({
      key: `pattern:${m.id}`,
      kind: 'confirm_pattern',
      title: patternQuestion(m),
      options: [
        { label: 'Sim, considera', ask: `sim, considera como preferência: ${m.text}` },
        { label: 'Não, foi acaso', ask: `não considera: ${m.text}` },
      ],
      provenance: 'inference',
      ref: { type: 'memory', id: m.id },
    })
  }
  for (const it of db.tripItems) {
    if (it.status !== 'a_confirmar' || !it.date) continue
    const d = diffDays(today, it.date)
    if (d < 0 || d > 14) continue
    out.push({ key: `trip:${it.id}`, kind: 'ambiguity', title: `${it.title} ainda está a confirmar`, detail: `É ${d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`}.`, provenance: 'fact', ref: { type: 'tripItem', id: it.id } })
  }
  return out.filter((i) => !acked(db, i.key, today))
}

// ─── ChangeFeed ─────────────────────────────────────────────────────────────

/** Money and career records stay hidden in the feed while their area is locked (no title, value or name). */
export function lockedRedaction(db: DB): (ref: ChangeItem['ref']) => string | undefined {
  const money = areaLocked(db.profile.privacyLock, 'dinheiro')
  const career = areaLocked(db.profile.privacyLock, 'carreira')
  return (ref) => {
    if (!ref) return undefined
    if (money && (ref.type === 'expense' || ref.type === 'contract')) return 'Atualização em Dinheiro (protegido)'
    if (career && (ref.type === 'opportunity' || ref.type === 'contact')) return 'Atualização em Carreira (protegido)'
    return undefined
  }
}

export function changesSince(db: DB, now: Now, since?: ISODateTime): { since?: ISODateTime; items: ChangeItem[]; summary: string } {
  return intelReady(db, now) ? changeFeed(db, now, since, lockedRedaction(db)) : fallbackChanges(db, now, since)
}

export function fallbackChanges(db: DB, _now: Now, since?: ISODateTime): { since?: ISODateTime; items: ChangeItem[]; summary: string } {
  const from = since ?? db.profile.lumosLastSeenAt
  const redact = lockedRedaction(db)
  const items: ChangeItem[] = db.lifeLog
    .filter((e) => !from || Date.parse(e.at) >= Date.parse(from))
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((e) => ({ at: e.at, title: redact(e.ref) ?? e.title, by: e.by, provenance: e.provenance, ref: e.ref }))
  if (!items.length) return { since: from, items, summary: 'Nada mudou desde a última vez.' }
  const firsts = items.slice(0, 3).map((i) => i.title.replace(/[.✓\s]+$/g, ''))
  return { since: from, items, summary: `${capitalize(plural(items.length, 'mudança', 'mudanças'))}: ${listJoin(firsts)}${items.length > 3 ? '…' : '.'}` }
}

/** "desde ontem" → the start of yesterday in São Paulo. */
export function startOfDayISO(date: DateKey): ISODateTime {
  return toInstant(date, '00:00').toISOString()
}

// ─── Daily brief ────────────────────────────────────────────────────────────

export function briefFor(db: DB, now: Now): string | undefined {
  return intelReady(db, now) ? dailyBrief(db, now) : undefined
}

// ─── ActionGraph: per-day work mode ────────────────────────────────────────

/** "amanhã fiquei presencial" — per-day work override (refType 'work', refId = date). */
export function workModeChange(db: DB, date: DateKey, mode: WorkDayMode, now: Now): GraphPlan {
  if (intelReady(db, now)) return planChange(db, { kind: 'workMode', date, mode }, now)
  const before = workModeOn(db, date)
  return {
    lines: [{ text: `${capitalize(WEEKDAY_LONG[weekday(date)])} fica ${MODE_TEXT[mode]} (só esse dia)`, provenance: 'user' }],
    sensitive: false,
    apply: () => {
      const existing = getDB().scheduleOverrides.find((o) => o.refType === 'work' && o.refId === date)
      let undoWrite: Undo
      if (existing) {
        const prev: Partial<ScheduleOverride> = { workMode: existing.workMode, by: existing.by, reason: existing.reason }
        actions.update('scheduleOverrides', existing.id, { workMode: mode, by: 'lumos', reason: 'pela conversa com a Lumos' })
        undoWrite = () => actions.update('scheduleOverrides', existing.id, prev)
      } else {
        const o = actions.create('scheduleOverrides', { date, refType: 'work', refId: date, workMode: mode, by: 'lumos', reason: 'pela conversa com a Lumos' })
        undoWrite = () => void actions.remove('scheduleOverrides', o.id)
      }
      const undoLog = logEvents([eventDraft(now, { kind: 'changed', date, title: `${capitalize(WEEKDAY_LONG[weekday(date)])} virou ${MODE_TEXT[mode]} (antes: ${MODE_TEXT[before]})`, area: 'trabalho', ref: { type: 'work', id: date } })])
      return () => {
        undoLog()
        undoWrite()
      }
    },
  }
}

export const MODE_TEXT: Record<WorkDayMode, string> = { presencial: 'presencial', remoto: 'remoto', flexivel: 'flexível', off: 'sem trabalho' }

/** Work mode of a day honouring a per-day override (the engine may already do it in planning.workMode). */
export function workModeOn(db: DB, date: DateKey): WorkDayMode {
  const o = db.scheduleOverrides.find((x) => x.refType === 'work' && x.refId === date && x.workMode)
  return o?.workMode ?? workMode(db.profile, date)
}

/** A DB where `date`'s weekday has `mode` — only to PREVIEW kits/menus for a one-day change. */
export function withWorkMode(db: DB, date: DateKey, mode: WorkDayMode): DB {
  const work = db.profile.work
  return { ...db, profile: { ...db.profile, work: { ...work, days: { ...work.days, [weekday(date)]: mode } } } }
}

// ─── SmartPlanner ───────────────────────────────────────────────────────────

/** Which week "monta minha semana" means: from Friday on, the next one. */
export function weekToPlan(today: DateKey): DateKey {
  const wd = weekday(today)
  return wd === 0 || wd >= 5 ? startOfWeek(addDays(today, 3)) : startOfWeek(today)
}

export function weekFor(db: DB, now: Now): WeekProposal {
  const ws = weekToPlan(now.date)
  return intelReady(db, now) ? planWeek(db, now, ws) : fallbackWeek(db, now, ws)
}

export function fallbackWeek(db: DB, now: Now, weekStart: DateKey): WeekProposal {
  const days = weekDays(weekStart)
  const props = proposeWeekFromTemplate(db, weekStart)
  const conflicts = conflictsBetween(db, weekStart, endOfWeek(weekStart))
    .filter((c) => c.severity === 'warn')
    .map((c) => ({ date: c.date, text: c.message.replace(/^⚠️\s*/, '') }))
  const out: WeekProposal['days'] = days.map((date) => {
    const timeline = dayTimeline(db, date)
    const items: WeekProposal['days'][number]['items'] = []
    for (const e of timeline) {
      if (e.status === 'cancelled') continue
      if (e.kind === 'event' || e.kind === 'work') items.push({ time: isAnytime(e) ? undefined : e.start, title: e.title, layer: 'fixo', provenance: 'fact', isNew: false })
      if (e.kind === 'workout') {
        const w = db.workouts.find((x) => x.id === e.ref.id)
        const key = w?.isKeySession ?? db.weekTemplate.find((t) => t.id === e.ref.id)?.isKeySession
        // Template lines only stand in on the timeline: applying the week makes them real workouts.
        const fromTemplate = e.ref.type === 'weekTemplate'
        items.push({ time: isAnytime(e) ? undefined : e.start, title: e.title, layer: key ? 'treino_chave' : 'vida', provenance: fromTemplate ? 'suggestion' : 'fact', isNew: fromTemplate })
      }
    }
    for (const t of db.tasks) {
      if (t.dueDate === date && t.status !== 'done' && t.status !== 'archived') items.push({ title: t.title, layer: 'prazo', provenance: 'fact', isNew: false })
    }
    for (const p of props) {
      if (p.date !== date) continue
      if (p.choice === 'rest') items.push({ title: p.workout?.title ?? 'Descanso', layer: 'descanso', provenance: 'suggestion', isNew: true })
    }
    items.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
    return { date, items, free: [] }
  })
  const toCreate = props.filter((p) => p.workout)
  const summary = `${plural(out.reduce((s, d) => s + d.items.filter((i) => i.layer === 'fixo').length, 0), 'compromisso fixo', 'compromissos fixos')}, ${plural(out.reduce((s, d) => s + d.items.filter((i) => i.layer === 'treino_chave').length, 0), 'treino-chave', 'treinos-chave')}${conflicts.length ? ` e ${plural(conflicts.length, 'ponto', 'pontos')} pra decidir` : ''}.`
  return {
    weekStart,
    days: out,
    conflicts,
    summary,
    apply: () => {
      const created = toCreate.map((p) => actions.create('workouts', p.workout!))
      const existing = getDB().weekPlans.find((w) => w.weekStart === weekStart)
      const plan = existing ? undefined : actions.create('weekPlans', { weekStart, confirmedAt: nowISO() })
      const prevConfirmed = existing?.confirmedAt
      if (existing) actions.update('weekPlans', existing.id, { confirmedAt: nowISO() })
      const undoLog = logEvents([eventDraft(now, { kind: 'created', date: weekStart, title: `Semana de ${weekStart.split('-').reverse().slice(0, 2).join('/')} montada`, area: 'rotina', provenance: 'suggestion' })])
      return () => {
        undoLog()
        for (const w of created) actions.remove('workouts', w.id)
        if (plan) actions.remove('weekPlans', plan.id)
        if (existing) actions.update('weekPlans', existing.id, { confirmedAt: prevConfirmed })
      }
    },
  }
}
