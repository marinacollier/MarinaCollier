/**
 * "Lumos controla o dia" — sentence → ONE ChangePlan (same preview → Confirmar → Desfazer flow as
 * the training adjustments in ../adjust). Deterministic and pure: reads the DB, never writes it.
 *
 *   "amanhã coloca minha leitura às 5h10"          → planSetTime (that day only)
 *   "joga meu banho pra depois da natação"          → moveAfter
 *   "amanhã quero acordar 5h30"                     → shiftRoutine (the morning routine)
 *   "terça não faço meditação de manhã"             → cancelOn (one day, never the default)
 *   "amanhã cancelei meu inglês"                    → find it on that day's timeline (event, template
 *                                                     line, task, routine item…) → cancelOn (+ prep) →
 *                                                     "Inglês de amanhã cancelado ✓ Seu horário das 19h ficou livre."
 *   "amanhã cancelei o inglês e vou correr às 18h"  → both changes in one plan + the plan's pre/intra/pós
 *                                                     meals re-timed around the training's new time
 *   "me lembra de levar o shaker amanhã às 7h"      → checklist item (a dated Task with a time)
 *   "acordei agora"                                 → replanFrom(now) proposal ("Aplicar")
 *
 * Training sentences ("amanhã troco a corrida longa por surf") still go to ../adjust/planner.ts;
 * mixed sentences are split and both halves land in the same plan. Ambiguity → a short question with
 * tappable options. Every write is by 'lumos' and undoable as a unit.
 */
import { skipMeal } from '@/data/nutrition'
import { applyOpsToDB, cancelOn, moveAfter, planSetTime, replanFrom, shiftRoutine, type ScheduleOp, type ScheduleRef } from '@/data/schedule'
import { dayTimeline, endMin, findEntry, isAnytime, refKey, startMin } from '@/data/timeline'
import type { DateKey, DB, Task, TimeHM, TimelineEntry } from '@/data/types'
import { addDays, hmToMinutes, minutesToHM } from '@/lib/date'
import { uid } from '@/lib/id'
import { capitalize, dayLabel, listJoin } from '../agents/common'
import { consequencesOf, simulate } from '../adjust/consequences'
import { lex, splitClauses, type Lexed } from '../adjust/lexicon'
import { planAdjustment } from '../adjust/planner'
import type { ChangePlan, DayRow, MealAdjustmentDraft, PlanChange, TaskDraft } from '../adjust/types'
import { findOnDay, queryWords, spoken, type Found } from './match'
import { compactRows, dayDiff, opKeys, sortRows } from './preview'
import { cancelledWord, hourLabel, ofDay, onDay } from './text'

// ─── Intent of one clause ───────────────────────────────────────────────────

export type DayIntent =
  | { kind: 'wake'; time: TimeHM }
  | { kind: 'relative'; where: 'after' | 'before'; target: string[]; anchor: string[] }
  | { kind: 'cancel' }
  | { kind: 'create'; time?: TimeHM }
  | { kind: 'setTime'; time: TimeHM }

const CANCEL = new Set(['cancelei', 'cancela', 'cancelar', 'cancelo', 'cancelado', 'cancelada', 'cancelou', 'tira', 'tirar', 'tirei', 'pula', 'pular', 'pulo', 'remove', 'remover'])
const NOT_DOING = new Set(['faco', 'vou', 'vai', 'tem', 'rola', 'quero', 'farei', 'tenho'])
const CREATE = new Set(['adiciona', 'adicionar', 'adicione', 'inclui', 'incluir', 'cria', 'criar', 'crie', 'lembra', 'lembrar', 'lembrete', 'checklist'])
const PREP = new Set(['levar', 'leva', 'pegar', 'pega', 'separar', 'separa', 'descongelar', 'descongela', 'preparar', 'prepara', 'montar', 'monta', 'bolsa', 'shaker', 'marmita', 'marmitas'])
const WAKE = new Set(['acordar', 'acordo', 'levantar', 'levanto'])
const LINKS = new Set(['de', 'da', 'do', 'das', 'dos'])

export function dayIntentOf(lx: Lexed): DayIntent | undefined {
  const t = lx.tokens
  if (lx.time && t.some((x) => WAKE.has(x))) return { kind: 'wake', time: lx.time.hm }
  const rel = t.findIndex((x, i) => (x === 'depois' || x === 'antes') && LINKS.has(t[i + 1] ?? ''))
  if (rel > 0) {
    const target = queryWords(t.slice(0, rel).join(' '))
    const anchor = queryWords(t.slice(rel + 2).join(' '))
    if (target.length && anchor.length) return { kind: 'relative', where: t[rel] === 'depois' ? 'after' : 'before', target, anchor }
  }
  const nao = t.indexOf('nao')
  if (t.some((x) => CANCEL.has(x)) || (nao >= 0 && NOT_DOING.has(t[nao + 1] ?? ''))) return { kind: 'cancel' }
  if (t.some((x) => CREATE.has(x))) return { kind: 'create', time: lx.time?.hm }
  if (lx.time) return { kind: 'setTime', time: lx.time.hm }
  return undefined
}

/** "pré-treino" / "pós-treino" are food, not a training mention. */
function mentionsTraining(lx: Lexed): boolean {
  if (lx.mods.length) return true
  return lx.genericAt.some((p) => !['pre', 'pos'].includes(lx.tokens[p - 1] ?? ''))
}

// ─── Clauses ────────────────────────────────────────────────────────────────

interface Part {
  text: string
  lx: Lexed
  kind: 'day' | 'training' | 'none'
  intent?: DayIntent
  day?: DateKey
}

/** What she picked when Lumos asked ("Qual leitura?"). */
interface Pick {
  ref?: ScheduleRef
  anchor?: ScheduleRef
  date?: DateKey
  time?: TimeHM
  mealRef?: string
}

interface ClauseOut {
  ops: ScheduleOp[]
  tasks: TaskDraft[]
  meals: MealAdjustmentDraft[]
  date?: DateKey
  line?: string
  done?: string
  info?: string
  free?: DayRow
  choice?: { question: string; options: { label: string; pick: Pick }[] }
}

const empty = (): ClauseOut => ({ ops: [], tasks: [], meals: [] })

const entryLabel = (e: TimelineEntry) => `${e.emoji ? `${e.emoji} ` : ''}${e.title}${e.start && !isAnytime(e) ? ` · ${e.start}` : ''}`

function periodOf(lx: Lexed) {
  return lx.period?.period && lx.period.period !== 'almoco' ? lx.period.period : undefined
}


/** Look on the other days of the week when it isn't on the day she said. */
function elsewhere(db: DB, date: DateKey, words: string[], today: DateKey): { e: TimelineEntry; date: DateKey }[] {
  const out: { e: TimelineEntry; date: DateKey }[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i)
    if (d === date) continue
    const f = findOnDay(db, d, words)
    if ('ok' in f) out.push({ e: f.ok, date: d })
    else if ('many' in f) out.push(...f.many.map((e) => ({ e, date: d })))
  }
  return out.slice(0, 4)
}

function resolve(db: DB, date: DateKey, words: string[], forced: ScheduleRef | undefined, opts: Parameters<typeof findOnDay>[3] = {}): Found {
  if (forced) {
    const e = findEntry(dayTimeline(db, date), forced)
    return e ? { ok: e } : { none: true }
  }
  return findOnDay(db, date, words, opts)
}

function notFound(db: DB, date: DateKey, text: string, words: string[], today: DateKey, verb: string): ClauseOut {
  const quoted = spoken(text, words)
  const other = elsewhere(db, date, words, today)
  if (!other.length) return { ...empty(), info: words.length ? `Não achei “${quoted}” ${onDay(date, today)} na sua linha do dia 🙂` : 'Me diz o que você quer mudar — por exemplo “amanhã coloca minha leitura às 5h10”.' }
  return {
    ...empty(),
    choice: {
      question: `${capitalize(onDay(date, today))} não tem “${quoted}”. Você quis ${verb}…`,
      options: other.map((o) => ({ label: `${entryLabel(o.e)} · ${dayLabel(o.date, today)}`, pick: { ref: o.e.ref, date: o.date } })),
    },
  }
}

function manyChoice(list: TimelineEntry[], text: string, words: string[], verb: string): ClauseOut {
  return {
    ...empty(),
    choice: {
      question: `Qual ${spoken(text, words.slice(0, 2)) || 'deles'} você quer ${verb}?`,
      options: list.map((e) => ({ label: entryLabel(e), pick: { ref: e.ref } })),
    },
  }
}

// ── cancel ──

function runCancel(db: DB, p: Part, today: DateKey, pick: Pick): ClauseOut {
  const date = pick.date ?? p.day ?? today
  const words = queryWords(p.text)
  const f = resolve(db, date, words, pick.ref, { period: periodOf(p.lx) })
  if ('none' in f) return notFound(db, date, p.text, words, today, 'cancelar')
  if ('many' in f) return manyChoice(f.many, p.text, words, 'cancelar')
  const e = f.ok
  const when = ofDay(date, today)
  if (e.ref.type === 'planMeal' && !e.ref.id.startsWith('meal:')) {
    const s = skipMeal(db, date, e.ref.id)
    if (!s.draft) return { ...empty(), info: s.summary }
    return {
      ...empty(),
      date,
      meals: [{ ...s.draft, by: 'lumos', reason: `${e.title} ${when} fica de fora (pela Lumos).` }],
      line: `${e.title} ${when}: fica de fora`,
      done: `${e.title} ${when} fica de fora ✓ ${e.phase && e.phase !== 'refeicao' ? 'É uma refeição do treino no seu plano — se mudar de ideia, é só desfazer.' : 'O resto do dia segue como planejado.'}`,
    }
  }
  const prop = cancelOn(db, date, e.ref, 'lumos', 'pela conversa com a Lumos')
  const timeline = dayTimeline(db, date)
  const prep = prop.cancelled.slice(1).map((r) => findEntry(timeline, r)?.title).filter(Boolean) as string[]
  const freed = prop.freed
  return {
    ...empty(),
    ops: prop.ops,
    date,
    free: freed ? { key: `free:${refKey(e.ref)}`, title: 'livre', state: 'free', from: freed.start, to: freed.end } : undefined,
    line: `${e.title} ${when}: ${cancelledWord(e.title)}${prep.length ? ` (e ${listJoin(prep.map((x) => x.toLowerCase()))} junto)` : ''}`,
    done: `${e.title} ${when} ${cancelledWord(e.title)} ✓${freed ? ` Seu horário das ${hourLabel(freed.start)} ficou livre.` : ''}${prep.length ? ` Tirei ${listJoin(prep.map((x) => x.toLowerCase()))} junto.` : ''}`,
  }
}

// ── set a time ──

function runSetTime(db: DB, p: Part, today: DateKey, pick: Pick, time: TimeHM): ClauseOut {
  const date = pick.date ?? p.day ?? today
  const words = queryWords(p.text)
  const f = resolve(db, date, words, pick.ref, { period: periodOf(p.lx), near: time })
  if ('none' in f) {
    if (words.some((w) => PREP.has(w))) return runCreate(db, p, today, pick, time)
    return notFound(db, date, p.text, words, today, 'mudar')
  }
  if ('many' in f) return manyChoice(f.many, p.text, words, 'mudar')
  const e = f.ok
  const when = ofDay(date, today)
  if (e.start === time && !isAnytime(e)) return { ...empty(), info: `${e.title} ${when} já está às ${time} ✓` }
  return {
    ...empty(),
    ops: planSetTime(db, date, e.ref, time, 'lumos'),
    date,
    line: `${e.title} ${when}: ${isAnytime(e) ? 'sem horário' : e.start} → ${time}`,
    done: `Feito ✓ ${e.title} ${when} às ${time}. O padrão continua o mesmo nos outros dias.`,
  }
}

// ── after / before something ──

function runRelative(db: DB, p: Part, today: DateKey, pick: Pick, intent: Extract<DayIntent, { kind: 'relative' }>): ClauseOut {
  let date = pick.date ?? p.day
  if (!date) {
    // "joga meu banho pra depois da natação": the first day (from today) that has both.
    for (let i = 0; i < 7 && !date; i++) {
      const d = addDays(today, i)
      if (!('none' in findOnDay(db, d, intent.target)) && !('none' in findOnDay(db, d, intent.anchor))) date = d
    }
  }
  if (!date) {
    const missing = 'none' in findOnDay(db, today, intent.target) ? intent.target : intent.anchor
    return { ...empty(), info: `Não achei “${spoken(p.text, missing)}” na sua linha do dia nos próximos dias 🙂` }
  }
  const target = resolve(db, date, intent.target, pick.ref)
  if ('none' in target) return { ...empty(), info: `Não achei “${spoken(p.text, intent.target)}” ${onDay(date, today)} 🙂` }
  if ('many' in target) return manyChoice(target.many, p.text, intent.target, 'mudar')
  const anchor = resolve(db, date, intent.anchor, pick.anchor)
  if ('none' in anchor) return { ...empty(), info: `Não achei “${spoken(p.text, intent.anchor)}” ${onDay(date, today)} 🙂` }
  if ('many' in anchor) {
    return {
      ...empty(),
      choice: {
        question: `${intent.where === 'after' ? 'Depois' : 'Antes'} de qual?`,
        options: anchor.many.map((e) => ({ label: entryLabel(e), pick: { ref: target.ok.ref, anchor: e.ref, date } })),
      },
    }
  }
  const e = target.ok
  const a = anchor.ok
  if (isAnytime(a)) return { ...empty(), info: `${a.title} ${ofDay(date, today)} ainda não tem horário — me diz a hora e eu encaixo.` }
  let ops: ScheduleOp[]
  let time: TimeHM
  if (intent.where === 'after') {
    const prop = moveAfter(db, date, e.ref, a.ref, 'lumos')
    ops = prop.ops
    time = minutesToHM(endMin(a)!)
  } else {
    const dur = Math.max(5, (endMin(e) ?? 0) - (startMin(e) ?? 0)) || 10
    time = minutesToHM(Math.max(0, startMin(a)! - dur))
    ops = planSetTime(db, date, e.ref, time, 'lumos')
  }
  if (!ops.length) return { ...empty(), info: `${e.title} já está ${intent.where === 'after' ? 'depois' : 'antes'} de ${a.title.toLowerCase()} ✓` }
  const rel = `${intent.where === 'after' ? 'depois' : 'antes'} de ${a.title.toLowerCase()}`
  return {
    ...empty(),
    ops,
    date,
    line: `${e.title} ${ofDay(date, today)}: ${isAnytime(e) ? 'sem horário' : e.start} → ${time}, ${rel}`,
    done: `Feito ✓ ${e.title} vai pra ${time}, ${rel} (${onDay(date, today)}).`,
  }
}

// ── wake up later/earlier ──

function morningRoutine(db: DB, date: DateKey) {
  const timeline = dayTimeline(db, date)
  const itemRoutine = new Map(db.routineItems.map((i) => [i.id, i.routineId]))
  const firstOf = new Map<string, number>()
  for (const e of timeline) {
    if (e.ref.type !== 'routineItem' || isAnytime(e)) continue
    const rid = itemRoutine.get(e.ref.id)
    if (rid && !firstOf.has(rid)) firstOf.set(rid, startMin(e)!)
  }
  const routines = db.routines.filter((r) => r.active && firstOf.has(r.id))
  return routines.find((r) => r.period === 'manha') ?? [...routines].sort((a, b) => firstOf.get(a.id)! - firstOf.get(b.id)!)[0]
}

function runWake(db: DB, p: Part, today: DateKey, time: TimeHM): ClauseOut {
  const date = p.day ?? today
  const routine = morningRoutine(db, date)
  if (!routine) return { ...empty(), info: `${capitalize(onDay(date, today))} não tem rotina da manhã com horário — quando tiver, eu mexo nela toda de uma vez.` }
  const prop = shiftRoutine(db, date, routine.id, time, 'lumos')
  if (!prop.ops.length) return { ...empty(), info: `${routine.name} ${ofDay(date, today)} já começa às ${time} ✓` }
  return {
    ...empty(),
    ops: prop.ops,
    date,
    line: `${routine.name} ${ofDay(date, today)} começa às ${time}`,
    done: `Feito ✓ ${capitalize(onDay(date, today))} você acorda às ${time} — ${routine.name} vem junto.`,
  }
}

// ── checklist / prep item ──

const B = '(?<![\\p{L}\\p{N}])'
const E = '(?![\\p{L}\\p{N}])'
const DAY_WORDS = new RegExp(`${B}(depois de amanh[ãa]|amanh[ãa]|hoje|(?:na |no |nesta |neste |pr[óo]xima |pr[óo]ximo )?(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?(?: que vem)?)${E}`, 'giu')
const TIME_WORDS = new RegExp(`${B}(?:(?:[àa]s?|pelas)\\s+)?\\d{1,2}(?::\\d{2}|h\\d{0,2})(?:\\s*da\\s*(?:manh[ãa]|tarde|noite))?${E}`, 'giu')
const CUE_LEAD = /^\s*(?:me\s+lembra(?:r)?\s+(?:de\s+)?|lembrete\s+(?:de\s+|pra\s+|para\s+)?|(?:adiciona|adicionar|adicione|inclui|incluir|cria|criar|crie|coloca|colocar|bota|botar)\s+(?:um\s+item\s+)?(?:de\s+|pra\s+)?)/i
const CUE_WORDS = new RegExp(`${B}(?:no\\s+(?:meu\\s+)?checklist|na\\s+lista)${E}`, 'giu')

export function taskTitleFrom(text: string): string {
  const t = text.replace(DAY_WORDS, ' ').replace(CUE_LEAD, ' ').replace(CUE_WORDS, ' ').replace(TIME_WORDS, ' ').replace(/[.!]+$/g, '').replace(/\s+/g, ' ').trim()
  return capitalize(t.replace(/^(de|pra|para|o|a)\s+/i, ''))
}

function nextOrder(db: DB): number {
  return db.tasks.reduce((m, t) => Math.max(m, t.order), -1) + 1
}

export function prepTask(db: DB, title: string, date: DateKey, time: TimeHM, mealRef?: string): TaskDraft {
  return {
    id: uid(),
    title,
    status: 'todo',
    date,
    time,
    durationMin: 5,
    context: 'geral',
    order: nextOrder(db),
    ...(mealRef ? { origin: { type: 'meal' as const, id: mealRef } } : {}),
  }
}

function runCreate(db: DB, p: Part, today: DateKey, pick: Pick, time?: TimeHM): ClauseOut {
  const date = pick.date ?? p.day ?? today
  const title = taskTitleFrom(p.text)
  if (!title) return { ...empty(), info: 'O que eu coloco no checklist? Ex.: “me lembra de levar o shaker amanhã às 7h”.' }
  const at = pick.time ?? time
  if (!at) {
    const meals = dayTimeline(db, date).filter((e) => e.kind === 'meal' && e.status === 'pending' && !isAnytime(e) && e.ref.type === 'planMeal')
    const options = meals.slice(0, 3).map((m) => {
      const t = minutesToHM(Math.max(0, startMin(m)! - 30))
      return { label: `${t} · antes do ${m.title.toLowerCase()}`, pick: { time: t, mealRef: m.ref.id, date } }
    })
    if (!options.length) return { ...empty(), info: `Me diz o horário pra “${title}” — tudo no checklist tem hora 🙂` }
    return { ...empty(), choice: { question: `Que horas eu coloco “${title}”?`, options } }
  }
  return {
    ...empty(),
    tasks: [prepTask(db, title, date, at, pick.mealRef)],
    date,
    line: `${capitalize(onDay(date, today))}: + ${title} às ${at}`,
    done: `Coloquei “${title}” ${onDay(date, today)} às ${at} ✓`,
  }
}

function runDayClause(db: DB, p: Part, today: DateKey, pick: Pick = {}): ClauseOut {
  const intent = p.intent!
  switch (intent.kind) {
    case 'wake':
      return runWake(db, p, today, intent.time)
    case 'relative':
      return runRelative(db, p, today, pick, intent)
    case 'cancel':
      return runCancel(db, p, today, pick)
    case 'create':
      return runCreate(db, p, today, pick, intent.time)
    case 'setTime':
      return runSetTime(db, p, today, pick, intent.time)
  }
}

// ─── Section 11: plan meals follow the training ─────────────────────────────

const PHASES = new Set(['pre', 'intra', 'pos'])
const WINDOW_BEFORE = 180
const WINDOW_AFTER = 180

interface Retime {
  ops: ScheduleOp[]
  notes: string[]
}

/**
 * The training moved to another time that day → its pre/intra/pós plan meals move by the same amount
 * (one-day overrides, by 'lumos'), and prep items made for those meals follow. Nothing else in the
 * plan changes. A brand-new training on a day that already has another one only gets a note about the
 * plan meals around it — Lumos never invents a pre/pós.
 */
export function retimeMeals(after: DB, changes: PlanChange[], today: DateKey): Retime {
  const ops: ScheduleOp[] = []
  const notes: string[] = []
  for (const c of changes) {
    if (c.implicit || !c.after.time || c.after.status === 'pulado') continue
    const date = c.after.date
    if (date < today) continue
    const t1 = hmToMinutes(c.after.time)
    const sameDay = c.before && c.before.date === date
    let t0 = sameDay && c.before!.time ? hmToMinutes(c.before!.time) : undefined
    const dur = c.after.plannedDurationMin ?? c.after.durationMin ?? 60
    const timeline = dayTimeline(after, date)
    const phaseMeals = timeline.filter((e) => e.kind === 'meal' && e.ref.type === 'planMeal' && !e.ref.id.startsWith('meal:') && e.phase && PHASES.has(e.phase) && e.status === 'pending' && !isAnytime(e))
    if (t0 === undefined) {
      const others = timeline.filter((e) => e.kind === 'workout' && e.status !== 'cancelled' && !isAnytime(e) && e.ref.id !== c.after.id && e.timeSource !== 'approx')
      const pre = phaseMeals.find((m) => m.phase === 'pre')
      if (!others.length && pre) t0 = startMin(pre)! + 60
      else {
        const meals = timeline.filter((e) => e.kind === 'meal' && e.phase === 'refeicao' && !isAnytime(e) && e.status === 'pending')
        const prev = [...meals].reverse().find((m) => startMin(m)! <= t1)
        const next = meals.find((m) => startMin(m)! >= t1 + dur)
        const bits = [prev && `${prev.title.toLowerCase()} às ${prev.start} antes`, next && `${next.title.toLowerCase()} às ${next.start} depois`].filter(Boolean)
        if (bits.length) notes.push(`Em volta do treino das ${c.after.time}: ${listJoin(bits as string[])}, como no plano`)
        continue
      }
    }
    const delta = t1 - t0
    if (!delta) continue
    const lo = t0 - WINDOW_BEFORE
    const hi = t0 + dur + WINDOW_AFTER
    const moved: string[] = []
    for (const m of phaseMeals) {
      const s = startMin(m)!
      if (s < lo || s > hi) continue
      const to = minutesToHM(Math.max(0, Math.min(23 * 60 + 45, s + delta)))
      ops.push({ op: 'override', date, ref: m.ref, patch: { time: to, endTime: undefined, anytime: undefined, cancelled: undefined, reason: 'o treino mudou de horário' }, by: 'lumos' })
      moved.push(`${m.title} ${m.start} → ${to}`)
      // Prep items made for this meal follow it.
      for (const t of after.tasks.filter((x) => x.date === date && x.time && x.origin?.type === 'meal' && x.origin.id === m.ref.id)) {
        ops.push({ op: 'update', collection: 'tasks', id: t.id, patch: { time: minutesToHM(Math.max(0, hmToMinutes(t.time!) + delta)) } })
      }
      // Two things at the same time: say it, don't decide it.
      const meal = timeline.find((x) => x.kind === 'meal' && x.phase === 'refeicao' && !isAnytime(x) && Math.abs(startMin(x)! - hmToMinutes(to)) < 30)
      if (meal) notes.push(`${m.title} (${to}) fica colado no ${meal.title.toLowerCase()} (${meal.start}) — os dois continuam como o nutri prescreveu`)
    }
    if (moved.length) notes.unshift(`Refeições do treino acompanham o novo horário: ${moved.join(' · ')}`)
  }
  return { ops, notes }
}

// ─── Composition ────────────────────────────────────────────────────────────

function toTask(t: TaskDraft): Task {
  return { ...t, createdAt: '', updatedAt: '' } as Task
}

function withTasks(db: DB, tasks: TaskDraft[]): DB {
  return tasks.length ? { ...db, tasks: [...db.tasks, ...tasks.map(toTask)] } : db
}

function withMeals(db: DB, meals: MealAdjustmentDraft[]): DB {
  if (!meals.length) return db
  return { ...db, mealAdjustments: [...db.mealAdjustments, ...meals.map((m, i) => ({ ...m, id: `preview-${i}`, createdAt: '', updatedAt: '9999' }))] }
}

function compose(db: DB, today: DateKey, parts: Part[], training: ChangePlan | undefined, forced: Map<number, Pick>): ChangePlan {
  if (training?.needsChoice) {
    return {
      ...training,
      needsChoice: {
        question: training.needsChoice.question,
        options: training.needsChoice.options.map((o) => ({ label: o.label, plan: compose(db, today, parts, o.plan, forced) })),
      },
    }
  }
  const changes = training?.changes ?? []
  let work = simulate(db, changes)
  const rt = retimeMeals(work, changes, today)
  const ops: ScheduleOp[] = [...rt.ops]
  work = applyOpsToDB(work, rt.ops)
  const tasks: TaskDraft[] = []
  const meals: MealAdjustmentDraft[] = []
  const lines: string[] = training?.summary ? [training.summary] : []
  const dones: string[] = []
  const infos: string[] = []
  const free: DayRow[] = []
  const dates = new Set<DateKey>(changes.filter((c) => !c.implicit).map((c) => c.after.date))
  for (const op of rt.ops) if (op.op !== 'update') dates.add(op.date)

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.kind !== 'day') continue
    const out = runDayClause(work, p, today, forced.get(i))
    if (out.choice) {
      return {
        summary: out.choice.question,
        changes: [],
        consequences: [],
        warnings: [],
        needsChoice: {
          question: out.choice.question,
          options: out.choice.options.map((o) => ({ label: o.label, plan: compose(db, today, parts, training, new Map([...forced, [i, { ...forced.get(i), ...o.pick }]])) })),
        },
      }
    }
    ops.push(...out.ops)
    tasks.push(...out.tasks)
    meals.push(...out.meals)
    work = withMeals(withTasks(applyOpsToDB(work, out.ops), out.tasks), out.meals)
    if (out.date) dates.add(out.date)
    if (out.line) lines.push(out.line)
    if (out.done) dones.push(out.done)
    if (out.info) infos.push(out.info)
    if (out.free) free.push(out.free)
  }

  const cons = changes.length ? consequencesOf(db, changes, today) : { consequences: [], warnings: [], offerStrategy: false }
  const sortedDates = [...dates].sort()
  const dayDate = sortedDates[0]
  const primary = opKeys(ops)
  for (const t of tasks) primary.add(`task:${t.id}`)
  const rows = dayDate ? compactRows(sortRows([...dayDiff(db, work, dayDate, { skipWorkouts: changes.length > 0, primary }), ...free])) : []
  const trainingDone = training && changes.length ? 'Feito ✓ Ficou assim:' : undefined
  const hasWork = changes.length > 0 || ops.length > 0 || tasks.length > 0 || meals.length > 0
  const summary = [...lines, ...infos].join(' · ')
  return {
    summary: hasWork ? summary : [...infos, ...lines].join(' · ') || 'Nada pra mudar por aqui ✓',
    changes,
    consequences: [...(hasWork ? infos : []), ...cons.consequences, ...rt.notes],
    warnings: cons.warnings,
    offerStrategy: cons.offerStrategy || undefined,
    scheduleOps: ops.length ? ops : undefined,
    taskCreates: tasks.length ? tasks : undefined,
    mealAdjustments: meals.length ? meals : undefined,
    dayRows: rows.length ? rows : undefined,
    dayDate,
    previewTitle: hasWork ? 'Vou ajustar assim:' : undefined,
    subtitle: hasWork && !changes.length ? lines.join(' · ') : undefined,
    doneTitle: dones.length ? [...dones, ...(changes.length && training?.summary ? [`${training.summary} ✓`] : [])].join(' ') : trainingDone,
  }
}

/**
 * The whole sentence → one ChangePlan, or undefined when it isn't a change to the day (questions,
 * food, small talk). Pure training sentences keep the exact behaviour of ../adjust/planner.ts.
 */
export function planDay(db: DB, text: string, today: DateKey): ChangePlan | undefined {
  const whole = lex(db, text, today)
  if (whole.isQuestion || text.trim().endsWith('?')) return undefined
  const parts: Part[] = splitClauses(text).map((t) => {
    const lx = lex(db, t, today)
    const intent = dayIntentOf(lx)
    const training = mentionsTraining(lx)
    const kind: Part['kind'] = intent && (!training || intent.kind === 'relative' || intent.kind === 'wake') ? 'day' : training ? 'training' : 'none'
    return { text: t, lx, kind, intent, day: lx.days[0]?.date }
  })
  if (!parts.some((p) => p.kind === 'day')) return planAdjustment(db, text, today)
  // A clause without a day takes the day of the clause before it (or the first day mentioned).
  const firstDay = parts.find((p) => p.day)?.day
  let last = firstDay
  for (const p of parts) {
    if (p.day) last = p.day
    else p.day = last
  }
  const trainingText = parts
    .filter((p) => p.kind === 'training')
    .map((p) => p.text)
    .join(' e ')
  const training = trainingText ? planAdjustment(db, trainingText, today, { defaultDay: parts.find((p) => p.kind === 'training')?.day }) : undefined
  return compose(db, today, parts, training, new Map())
}

// ─── "Acordei agora" ────────────────────────────────────────────────────────

export const WOKE_UP = /\bacordei\b|\bacabei de acordar\b|\bperdi a hora\b/

/** Proposal for the rest of the morning from now. Nothing applied until "Aplicar". */
export function planWake(db: DB, today: DateKey, nowMinutes: number): ChangePlan {
  const prop = replanFrom(db, today, nowMinutes, { by: 'lumos' })
  const timeline = dayTimeline(db, today)
  const rows: DayRow[] = prop.lines.map((l) => {
    const e = findEntry(timeline, l.ref)
    return { key: refKey(l.ref), title: l.title, emoji: l.emoji, state: l.kept ? 'kept' : 'moved', from: e?.start, to: l.time, lumos: !l.kept }
  })
  const drops = prop.drops.map((d) => d.title)
  return {
    summary: prop.message,
    changes: [],
    consequences: drops.length ? [`Fica pra depois hoje: ${listJoin(drops.map((d) => d.toLowerCase()))}`] : [],
    warnings: [],
    scheduleOps: prop.ops.length ? prop.ops : undefined,
    dayRows: rows.length ? rows : undefined,
    dayDate: today,
    previewTitle: prop.message,
    doneTitle: 'Manhã reorganizada ✓ Bora, no seu ritmo ✨',
    confirmLabel: 'Aplicar',
  }
}
