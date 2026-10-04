/**
 * Sentence → ChangePlan. Deterministic and pure: it reads the DB, never writes it.
 *
 * "amanhã troco a corrida longa por surf", "passa o pedal longo pro sábado", "hoje não vou treinar",
 * "o pedal de domingo vai ser de 4h", "quinta quero correr no almoço",
 * "vou nadar cedo e fazer perna à noite" (two changes).
 *
 * Sessions that only exist in the weekly template (no record yet) are written down when touched,
 * together with the other template sessions of that day, so nothing silently disappears.
 * Nothing is ever deleted: skipping is status 'pulado'.
 */
import { contextWorkouts } from '@/data/fuel'
import { findModality, modalityGroup } from '@/data/planning'
import type { DateKey, DB, Workout } from '@/data/types'
import { addDays } from '@/lib/date'
import { uid } from '@/lib/id'
import { capitalize, dayLabel, listJoin } from '../agents/common'
import { consequencesOf, changeToWorkout } from './consequences'
import { SESSION_SPECIFIC, sessionDefaults } from './defaults'
import { CONNECTORS, lex, splitClauses, type Lexed, type ModMention } from './lexicon'
import type { ChangePlan, PlanChange, WorkoutDraft } from './types'

/** Example chips on the Lumos page. */
export const ADJUST_EXAMPLES = ['Amanhã troco a corrida longa por surf', 'Domingo o pedal vai ser de 4h', 'Hoje não vou treinar']

const WINDOW_DAYS = 7
const TITLE_STOP = new Set(['treino', 'sessao', 'session', 'base', 'leve', 'longa', 'longo', 'semana', 'opcional'])

type Intent =
  | { kind: 'swap'; sourceFrom: number; sourceTo: number; target: ModMention; targetDay?: DateKey }
  | { kind: 'move'; sourceFrom: number; sourceTo: number; targetDay: DateKey }
  | { kind: 'skip' }
  | { kind: 'update' }
  | { kind: 'create'; mod: ModMention }

interface Clause {
  lx: Lexed
  intent: Intent
  /** Day of the session being referred to (not the move target). */
  day?: DateKey
}

const isVirtual = (w: Workout) => w.id.startsWith('template:')
const active = (w: Workout) => w.status !== 'pulado' && w.status !== 'descanso' && w.status !== 'feito' && w.status !== 'adaptado'

function emoji(db: DB, modality: string): string {
  return findModality(db.profile, modality)?.emoji ?? '✨'
}
function name(db: DB, w: Pick<Workout, 'title' | 'modality'>): string {
  return w.title || findModality(db.profile, w.modality)?.label || w.modality
}
export function workoutLine(db: DB, w: Pick<Workout, 'title' | 'modality'>): string {
  return `${emoji(db, w.modality)} ${name(db, w)}`
}

// ─── Intent ─────────────────────────────────────────────────────────────────

function intentOf(lx: Lexed): Intent | undefined {
  const end = lx.tokens.length
  if (lx.insteadAt !== undefined) {
    const source = lx.mods.find((m) => m.pos >= lx.insteadAt!)
    const target = lx.mods.find((m) => m !== source && (m.pos < lx.insteadAt! - 3 || (source && m.pos > source.pos)))
    if (target) {
      const from = lx.insteadAt
      const to = source ? source.pos + 3 : from + 3
      return { kind: 'swap', sourceFrom: from, sourceTo: Math.min(to, target.pos > from ? target.pos : end), target }
    }
  }
  const verb = lx.swapVerbAt ?? lx.moveVerbAt
  if (verb !== undefined) {
    for (let i = verb + 1; i < end; i++) {
      if (!CONNECTORS.has(lx.tokens[i])) continue
      const near = (p: number) => p > i && p <= i + 4
      const target = lx.mods.find((m) => near(m.pos))
      const day = lx.days.find((d) => near(d.pos))
      if (target) {
        const afterDay = lx.days.find((d) => d.pos > i)
        return { kind: 'swap', sourceFrom: verb + 1, sourceTo: i, target, targetDay: afterDay?.date }
      }
      if (day) return { kind: 'move', sourceFrom: verb + 1, sourceTo: i, targetDay: day.date }
      if ((lx.time && near(lx.time.pos)) || (lx.duration && near(lx.duration.pos)) || (lx.period && near(lx.period.pos))) return { kind: 'update' }
    }
  }
  if (lx.skip) return { kind: 'skip' }
  if (lx.becomesAt !== undefined) {
    const day = lx.days.find((d) => d.pos >= lx.becomesAt!)
    if (day && !lx.duration && !lx.time) return { kind: 'move', sourceFrom: 0, sourceTo: lx.becomesAt, targetDay: day.date }
  }
  if ((lx.time || lx.duration || lx.period) && (lx.mods.length || lx.genericAt.length)) return { kind: 'update' }
  if (lx.mods.length) {
    const wants = lx.tokens.some((t) => ['vou', 'quero', 'fazer', 'faco', 'farei', 'coloca', 'colocar', 'bota', 'marca', 'marcar', 'adiciona', 'adicionar', 'inclui', 'incluir', 'vai', 'tem'].includes(t))
    if (wants || lx.days.length) return { kind: 'create', mod: lx.mods[0] }
  }
  return undefined
}

/** The day the clause talks about (excluding the move/swap target day). */
function sourceDay(lx: Lexed, intent: Intent): DateKey | undefined {
  if (intent.kind === 'move' || intent.kind === 'swap') {
    const targetPos = intent.kind === 'move' ? lx.days.find((d) => d.date === intent.targetDay && d.pos >= intent.sourceTo)?.pos : intent.targetDay ? lx.days.find((d) => d.pos > intent.sourceTo)?.pos : undefined
    return lx.days.find((d) => d.pos !== targetPos)?.date
  }
  return lx.days[0]?.date
}

// ─── Matching sessions ──────────────────────────────────────────────────────

interface Ref {
  mods: ModMention[]
  long: boolean
  words: string[]
  generic: boolean
}

function refOf(lx: Lexed, from = 0, to = lx.tokens.length): Ref {
  const inside = (p: number) => p >= from && p < to
  return {
    mods: lx.mods.filter((m) => inside(m.pos)),
    long: lx.longAt.some(inside),
    words: lx.tokens.slice(from, to).filter((t) => t.length >= 4),
    generic: lx.genericAt.some(inside),
  }
}

function isLong(w: Workout): boolean {
  return !!w.isLongSession || !!w.tags?.some((t) => t.startsWith('long'))
}

const stem = (w: string) => w.replace(/s$/, '')

function score(db: DB, w: Workout, ref: Ref): number {
  let s = 0
  if (ref.mods.some((m) => m.ids.includes(w.modality))) s += 3
  else if (ref.mods.some((m) => modalityGroup(db.profile, m.id) === modalityGroup(db.profile, w.modality))) s += 1
  const title = (w.title ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !TITLE_STOP.has(t))
  if (title.some((t) => ref.words.some((x) => stem(x) === stem(t)))) s += 2
  if (!s && (ref.mods.length || !ref.generic)) return 0
  if (!s) s = 1
  if (ref.long) s += isLong(w) ? 2 : -2
  return s
}

class Workspace {
  changes: PlanChange[] = []
  constructor(readonly db: DB) {}

  /** Sessions of a day as they look with the changes so far (template sessions included). */
  sessionsOn(date: DateKey): Workout[] {
    const byBefore = new Map(this.changes.filter((c) => c.before).map((c) => [c.before!.id, c]))
    const base = contextWorkouts(this.db, date).map((w) => (byBefore.has(w.id) ? changeToWorkout(byBefore.get(w.id)!) : w))
    const moved = this.changes.filter((c) => c.after.date === date && (!c.before || c.before.date !== date)).map(changeToWorkout)
    const seen = new Set<string>()
    return [...base, ...moved].filter((w) => w.date === date && active(w) && !seen.has(w.id) && !!seen.add(w.id))
  }

  /** Records a change; a second change of the same session is merged into the first. */
  put(source: Workout, after: WorkoutDraft, sources: string[] = []) {
    const prev = this.changes.find((c) => c.before?.id === source.id || c.after.id === source.id)
    if (prev) {
      prev.after = { ...after, id: prev.after.id }
      prev.sources = [...new Set([...(prev.sources ?? []), ...sources])]
      return
    }
    const original = this.db.workouts.find((w) => w.id === source.id)
    if (original) this.changes.push({ kind: 'update', collection: 'workouts', id: original.id, before: original, after, sources })
    else {
      const id = uid()
      this.changes.push({ kind: 'create', collection: 'workouts', id, before: isVirtual(source) ? source : undefined, after: { ...after, id }, sources })
    }
  }

  nextOrder(date: DateKey): number {
    return [...this.db.workouts.filter((w) => w.date === date), ...this.changes.map((c) => c.after).filter((w) => w.date === date)].reduce((m, w) => Math.max(m, w.order), -1) + 1
  }
}

function draftOf(w: Workout): WorkoutDraft {
  const { createdAt: _c, updatedAt: _u, ...rest } = w
  if (isVirtual(w)) return { ...rest, id: w.id, planType: w.planType ?? 'fixo' } as WorkoutDraft
  return rest as WorkoutDraft
}

type Found = { ok: Workout } | { many: Workout[] } | { none: true; elsewhere: Workout[] }

function find(ws: Workspace, ref: Ref, day: DateKey | undefined, today: DateKey): Found {
  const days = day ? [day] : Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i))
  const scored = days.flatMap((d) => ws.sessionsOn(d).map((w) => ({ w, s: score(ws.db, w, ref) })))
  const best = Math.max(0, ...scored.map((x) => x.s))
  const top = best > 0 ? scored.filter((x) => x.s === best).map((x) => x.w) : []
  if (top.length === 1) return { ok: top[0] }
  if (top.length > 1) return { many: top }
  if (!day) return { none: true, elsewhere: [] }
  const other = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i))
    .filter((d) => d !== day)
    .flatMap((d) => ws.sessionsOn(d).map((w) => ({ w, s: score(ws.db, w, ref) })))
  const ob = Math.max(0, ...other.map((x) => x.s))
  return { none: true, elsewhere: ob > 0 ? other.filter((x) => x.s === ob).map((x) => x.w) : [] }
}

// ─── Building changes ───────────────────────────────────────────────────────

function clearSessionFields(d: WorkoutDraft): WorkoutDraft {
  const out = { ...d } as Record<string, unknown>
  for (const k of SESSION_SPECIFIC) out[k] = undefined
  return out as unknown as WorkoutDraft
}

function swap(ws: Workspace, w: Workout, lx: Lexed, target: ModMention, targetDay: DateKey | undefined, today: DateKey): string {
  const db = ws.db
  const date = targetDay ?? w.date
  const wantLong = lx.longAt.some((p) => p > target.pos - 1 && p <= target.pos + 1)
  const { fields, sources } = sessionDefaults(db, today, {
    modality: target.id,
    date,
    wantLong,
    time: lx.time?.hm,
    period: lx.period?.period,
    durationMin: lx.duration?.min,
    replaces: w,
  })
  const tplNotes = w.templateId ? db.weekTemplate.find((t) => t.id === w.templateId)?.notes : undefined
  const after: WorkoutDraft = {
    ...clearSessionFields(draftOf(w)),
    notes: w.notes && w.notes !== tplNotes ? w.notes : undefined,
    status: 'planejado',
    modality: target.id,
    date,
    period: undefined,
    order: date === w.date ? w.order : ws.nextOrder(date),
    ...fields,
  }
  ws.put(w, after, sources)
  const when = capitalize(dayLabel(date, today))
  return `${when}: ${workoutLine(db, w)} → ${workoutLine(db, after)}`
}

function move(ws: Workspace, w: Workout, lx: Lexed, targetDay: DateKey, today: DateKey): string {
  const after: WorkoutDraft = { ...draftOf(w), date: targetDay, order: ws.nextOrder(targetDay) }
  if (lx.time) {
    after.time = lx.time.hm
    after.period = undefined
  }
  if (lx.duration) after.plannedDurationMin = lx.duration.min
  ws.put(w, after)
  return `${workoutLine(ws.db, w)}: ${dayLabel(w.date, today)} → ${dayLabel(targetDay, today)}${lx.time ? `, ${lx.time.hm}` : ''}`
}

function skip(ws: Workspace, w: Workout): void {
  ws.put(w, { ...draftOf(w), status: 'pulado' })
}

function update(ws: Workspace, w: Workout, lx: Lexed, today: DateKey): string {
  const after: WorkoutDraft = { ...draftOf(w) }
  const sources: string[] = []
  const bits: string[] = []
  if (lx.duration) {
    after.plannedDurationMin = lx.duration.min
    after.plannedDurationMaxMin = undefined
    // Baseline for "a duração mudou bastante" (data/fuel.ts durationReviewSuggested).
    if (w.strategyReviewedAtMin == null && w.plannedDurationMin) after.strategyReviewedAtMin = w.plannedDurationMin
    bits.push(durationText(lx.duration.min))
  }
  if (lx.time) {
    after.time = lx.time.hm
    after.period = undefined
    bits.push(lx.time.hm)
  } else if (lx.period) {
    const d = sessionDefaults(ws.db, today, { modality: w.modality, date: w.date, wantLong: isLong(w), period: lx.period.period, replaces: w })
    after.time = d.fields.time
    after.period = d.fields.time ? undefined : lx.period.period
    sources.push(...d.sources.filter((s) => s.startsWith('horário') || s.startsWith('sem horário') || s.startsWith('mantive')))
    bits.push(after.time ?? lx.period.period.replace('manha', 'manhã').replace('almoco', 'almoço'))
  }
  ws.put(w, after, sources)
  return `${workoutLine(ws.db, w)} de ${dayLabel(w.date, today)}: ${bits.join(', ')}`
}

function create(ws: Workspace, mod: ModMention, lx: Lexed, date: DateKey, today: DateKey): string {
  const db = ws.db
  const { fields, sources } = sessionDefaults(db, today, {
    modality: mod.id,
    date,
    wantLong: lx.longAt.length > 0,
    time: lx.time?.hm,
    period: lx.period?.period,
    durationMin: lx.duration?.min,
  })
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay()
  const choiceLine = db.weekTemplate.find((t) => t.active && t.weekday === wd && t.choice !== 'fixed' && t.modalities.includes(mod.id))
  const id = uid()
  const after: WorkoutDraft = {
    id,
    date,
    modality: mod.id,
    status: 'planejado',
    planType: 'flexivel',
    order: ws.nextOrder(date),
    templateId: choiceLine?.id,
    ...fields,
  }
  ws.changes.push({ kind: 'create', collection: 'workouts', id, after, sources })
  return `${capitalize(dayLabel(date, today))}: + ${workoutLine(db, after)}${after.time ? ` às ${after.time}` : ''}`
}

export function durationText(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Template sessions of the touched days are written down too, so they don't vanish. */
function materialize(ws: Workspace): void {
  const dates = new Set(ws.changes.filter((c) => !c.implicit).map((c) => c.after.date))
  const consumed = new Set(ws.changes.flatMap((c) => [c.before?.templateId, c.after.templateId]).filter(Boolean))
  for (const date of dates) {
    if (ws.db.workouts.some((w) => w.date === date)) continue
    for (const v of contextWorkouts(ws.db, date)) {
      if (!isVirtual(v) || (v.templateId && consumed.has(v.templateId))) continue
      const id = uid()
      ws.changes.push({ kind: 'create', collection: 'workouts', id, after: { ...draftOf(v), id }, implicit: true })
    }
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

type ClauseOut = { line?: string; info?: string; choice?: { question: string; options: { label: string; w: Workout }[] } }

function optionLabel(db: DB, w: Workout, today: DateKey): string {
  return `${workoutLine(db, w)} · ${dayLabel(w.date, today)}${w.time ? ` ${w.time}` : ''}`
}

function runClause(ws: Workspace, c: Clause, today: DateKey, forced?: Workout): ClauseOut {
  const { lx, intent } = c
  const db = ws.db
  if (intent.kind === 'create') {
    const date = c.day ?? today
    const existing = ws.sessionsOn(date).find((w) => w.modality === intent.mod.id)
    if (existing && !forced) return { info: `${workoutLine(db, existing)} já está no plano de ${dayLabel(date, today)} ✓` }
    return { line: create(ws, intent.mod, lx, date, today) }
  }
  if (intent.kind === 'skip') {
    const ref = refOf(lx)
    const date = c.day ?? today
    if (!forced && !ref.mods.length && !ws.sessionsOn(date).some((w) => score(db, w, { ...ref, generic: false }) > 0)) {
      const list = ws.sessionsOn(date)
      if (!list.length) return { info: `${capitalize(dayLabel(date, today))} já está livre no plano — descanso tranquilo 🌿` }
      list.forEach((w) => skip(ws, w))
      return { line: `${capitalize(dayLabel(date, today))}: ${listJoin(list.map((w) => workoutLine(db, w)))} fica${list.length > 1 ? 'm' : ''} de fora (pulado)` }
    }
  }
  const ref = intent.kind === 'swap' || intent.kind === 'move' ? refOf(lx, intent.sourceFrom, intent.sourceTo) : refOf(lx)
  const found: Found = forced ? { ok: forced } : find(ws, ref, c.day, today)
  if ('many' in found) {
    return {
      choice: {
        question: `Qual ${found.many.every((w) => w.modality === found.many[0].modality) ? (findModality(db.profile, found.many[0].modality)?.label ?? 'treino').toLowerCase() : 'treino'} você quer ${verbOf(intent)}?`,
        options: found.many.map((w) => ({ label: optionLabel(db, w, today), w })),
      },
    }
  }
  if ('none' in found) {
    if (intent.kind === 'update' && lx.mods.length) return { line: create(ws, lx.mods[0], lx, c.day ?? today, today) }
    const what = ref.mods[0] ? `${ref.long ? `${findModality(db.profile, ref.mods[0].id)?.label.toLowerCase()} longa` : findModality(db.profile, ref.mods[0].id)?.label.toLowerCase()}` : 'esse treino'
    const where = c.day ? dayLabel(c.day, today) : 'nos próximos dias'
    const options = [...found.elsewhere]
    if (c.day && intent.kind === 'swap') {
      const day = ws.sessionsOn(c.day)
      const main = day.find((w) => w.isKeySession) ?? day[0]
      if (main && !options.includes(main)) options.push(main)
    }
    if (!options.length) return { info: `Não achei ${what} ${c.day ? `${where} ` : ''}no plano${c.day ? '' : ' dos próximos dias'} 🙂` }
    const day = c.day ? ws.sessionsOn(c.day) : []
    const has = day.length ? ` ${capitalize(where)} tem ${listJoin(day.map((w) => workoutLine(db, w)))}.` : ''
    return {
      choice: {
        question: `${capitalize(where)} não tem ${what} no plano.${has} Qual você quer ${verbOf(intent)}?`,
        options: options.map((w) => ({ label: optionLabel(db, w, today), w })),
      },
    }
  }
  const w = found.ok
  switch (intent.kind) {
    case 'swap':
      return { line: swap(ws, w, lx, intent.target, intent.targetDay, today) }
    case 'move':
      if (intent.targetDay === w.date) return { info: `${workoutLine(db, w)} já está ${dayLabel(w.date, today)} ✓` }
      return { line: move(ws, w, lx, intent.targetDay, today) }
    case 'skip':
      skip(ws, w)
      return { line: `${capitalize(dayLabel(w.date, today))}: ${workoutLine(db, w)} fica de fora (pulado)` }
    default:
      return { line: update(ws, w, lx, today) }
  }
}

function verbOf(intent: Intent): string {
  return { swap: 'trocar', move: 'mudar de dia', skip: 'pular', update: 'ajustar', create: 'fazer' }[intent.kind]
}

function parseClauses(db: DB, text: string, today: DateKey, defaultDay?: DateKey): Clause[] | undefined {
  const whole = lex(db, text, today)
  if (whole.isQuestion) return undefined
  const parts = splitClauses(text)
  let lexed = parts.map((p) => lex(db, p, today))
  // Only split when every part is a sentence of its own about a training.
  if (lexed.length > 1 && lexed.some((l) => !l.mods.length && !l.genericAt.length)) lexed = [whole]
  const clauses: Clause[] = []
  for (const lx of lexed) {
    const intent = intentOf(lx)
    if (!intent) {
      if (lexed.length === 1) return undefined
      continue
    }
    clauses.push({ lx, intent, day: sourceDay(lx, intent) ?? defaultDay })
  }
  if (!clauses.length) return undefined
  // "vou nadar cedo e fazer perna à noite": clauses without a day share the day of the others.
  if (clauses.length > 1) {
    let shared = clauses.find((c) => c.day)?.day
    if (!shared) {
      const ws = new Workspace(db)
      const found = clauses.filter((c) => c.intent.kind !== 'create').map((c) => find(ws, refOf(c.lx), undefined, today))
      const unique = found.find((f): f is { ok: Workout } => 'ok' in f)
      const many = found.find((f): f is { many: Workout[] } => 'many' in f)
      shared = unique?.ok.date ?? many?.many[0].date
    }
    for (const c of clauses) c.day ??= shared ?? today
  }
  return clauses
}

function build(db: DB, clauses: Clause[], today: DateKey, forced: Map<number, Workout>): ChangePlan {
  const ws = new Workspace(db)
  const lines: string[] = []
  const infos: string[] = []
  for (let i = 0; i < clauses.length; i++) {
    const out = runClause(ws, clauses[i], today, forced.get(i))
    if (out.choice) {
      const idx = i
      return {
        summary: out.choice.question,
        changes: [],
        consequences: [],
        warnings: [],
        needsChoice: {
          question: out.choice.question,
          options: out.choice.options.map((o) => ({ label: o.label, plan: build(db, clauses, today, new Map([...forced, [idx, o.w]])) })),
        },
      }
    }
    if (out.line) lines.push(out.line)
    if (out.info) infos.push(out.info)
  }
  materialize(ws)
  const { consequences, warnings, offerStrategy } = consequencesOf(db, ws.changes, today)
  return {
    summary: [...lines, ...infos].join(' · '),
    changes: ws.changes,
    consequences,
    warnings,
    offerStrategy: offerStrategy || undefined,
  }
}

/** A ChangePlan when the sentence is an adjustment of the training plan; undefined otherwise. */
export function planAdjustment(db: DB, text: string, today: DateKey, opts: { defaultDay?: DateKey } = {}): ChangePlan | undefined {
  const clauses = parseClauses(db, text, today, opts.defaultDay)
  if (!clauses) return undefined
  return build(db, clauses, today, new Map())
}

/** Main (non-bookkeeping) changes, for previews and "Ajustar". */
export function visibleChanges(plan: ChangePlan): PlanChange[] {
  return plan.changes.filter((c) => !c.implicit)
}
