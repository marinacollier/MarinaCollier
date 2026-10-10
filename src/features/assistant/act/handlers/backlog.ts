/**
 * The briefing's backlog by conversation (a BacklogItem is NOT a task until she gives it a day):
 *   "isso do Santander coloca terça"   → becomes a real to-do on Tuesday (direct + Desfazer)
 *   "coloca multas do carro hoje"      → same; when it is already a task, that task moves
 *   "B.O. feito" · "multas do carro feito" → the to-do (or the backlog item) is done
 *   "JNB fica pra segunda"             → the to-do of the day moves (same as "passa … pra segunda")
 */
import { isTaskOpen } from '@/data/selectors'
import { promoteBacklog } from '@/data/briefing/backlog'
import type { BacklogItem, DateKey, DB, Task } from '@/data/types'
import { formatDayMonth, relativeDay } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'
import { lex } from '../../adjust/lexicon'
import { eventDraft, runLogged, updateUndoable } from '../log'
import { dayIn, keyWords } from '../text'
import type { Handler, HandlerInput, LumosReply, Undo } from '../types'

const AREA = 'tarefas'
const DAY = '((?:depois de )?amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?'
const VERB = '(?:coloca|coloque|poe|bota|joga|passa|deixa|agenda|marca|manda)'
const THAT = /^(?:isso|esse|essa|aquilo|aquele|aquela)\s+(?:item\s+|tema\s+|lance\s+)?d[oa]s?\s+(.+?)\s+(?:a gente\s+)?(?:coloca|coloque|poe|bota|joga|passa|deixa|agenda|marca|fica)\s+(?:pra|para|pro|na|no|em)?\s*(.+)$/
const PUT = new RegExp(`^${VERB}\\s+(?:isso\\s+d[oa]s?\\s+|o\\s+|a\\s+)?(.+?)\\s+(?:pra|para|pro|na|no|em)?\\s*${DAY}$`)
const STAYS = /^(?:a\s+|o\s+)?(.+?)\s+fica\s+(?:pra|para|pro)\s+(.+)$/
const DONE = /^(?:o\s+|a\s+)?(.+?)\s+(?:ja\s+)?(?:(?:ta|esta|foi)\s+)?(?:feito|feita|resolvido|resolvida|concluido|concluida|pronto|pronta)$/

const GENERIC = new Set(['isso', 'esse', 'essa', 'tarefa', 'task', 'coisa', 'item'])
const tokens = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter(Boolean)

/** "B.O." / "JNB" / "LinkedIn": short or dotted names match as written (consecutive letters). */
function phraseHits(title: string, phrase: string): boolean {
  const kw = keyWords(phrase).filter((w) => !GENERIC.has(w))
  const tt = tokens(title)
  if (kw.length && kw.every((w) => tt.some((x) => x === w || (x.length >= 5 && w.length >= 4 && (x.startsWith(w) || w.startsWith(x)))))) return true
  const compact = normalize(phrase).replace(/[^a-z0-9]/g, '')
  if (!compact || compact.length > 6 || kw.length) return false
  // consecutive tiny tokens of the title spell it ("abrir b o de pedagio" ← "b.o.")
  for (let i = 0; i < tt.length; i++) {
    let acc = ''
    for (let j = i; j < tt.length && tt[j].length <= 3 && acc.length < compact.length; j++) {
      acc += tt[j]
      if (acc === compact) return true
    }
  }
  return false
}

function backlogHits(db: DB, phrase: string): BacklogItem[] {
  const p = normalize(phrase)
  return db.backlogItems.filter((b) => b.kind === 'scheduled' && (b.status === 'open' || b.status === 'promoted') && (phraseHits(b.title, phrase) || (!!b.front && (normalize(b.front) === p || normalize(b.front).replace(/\s+/g, '') === p.replace(/\s+/g, '')))))
}

const dayLabel = (d: DateKey, today: DateKey) => `${relativeDay(d, today)}${relativeDay(d, today).match(/^\d/) ? '' : ` (${formatDayMonth(d)})`}`

/** BacklogItem → a real to-do on `date` (its own record; the backlog item points at it). */
function promote(b: BacklogItem, date: DateKey, input: HandlerInput): Undo {
  return runLogged(() => promoteBacklog(b.id, date), [eventDraft(input.now, { kind: b.promotedTaskId ? 'moved' : 'created', title: `${b.title} → ${formatDayMonth(date)}`, area: 'rotina' })])
}

function put(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = THAT.exec(n) ?? PUT.exec(n)
  if (!m) return undefined
  const explicit = THAT.test(n)
  const date = dayIn(m[2], now.date)
  if (!date) return undefined
  const hits = backlogHits(db, m[1])
  if (!hits.length) return undefined
  // "coloca X terça" without "isso do": an open to-do with that name is the tasks handler's.
  if (!explicit && db.tasks.some((t) => isTaskOpen(t) && t.status !== 'waiting' && phraseHits(t.title, m[1]) && !hits.some((b) => b.promotedTaskId === t.id))) return undefined
  const act = (b: BacklogItem) => ({ done: `“${b.title}” ${b.promotedTaskId ? 'vai pra' : 'virou tarefa pra'} ${dayLabel(date, now.date)} ✓`, run: () => promote(b, date, input) })
  if (hits.length > 1) return { area: AREA, text: 'Qual delas?', options: hits.slice(0, 5).map((b) => ({ label: b.title, act: act(b) })) }
  const a = act(hits[0])
  return { area: AREA, text: a.done, sub: hits[0].window ? `No briefing: ${hits[0].window.label}` : undefined, ref: { type: 'backlogItem', id: hits[0].id }, action: { mode: 'direct', run: a.run } }
}

function openTasksFor(db: DB, phrase: string, today: DateKey): Task[] {
  const hits = db.tasks.filter((t) => isTaskOpen(t) && t.status !== 'waiting' && !t.recurrence && phraseHits(t.title, phrase))
  const ofDay = hits.filter((t) => t.date && t.date <= today)
  return ofDay.length ? ofDay : hits
}

function done(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = DONE.exec(n)
  if (!m) return undefined
  if (lex(db, m[1], now.date).mods.length) return undefined // trainings are the training planner's
  const tasks = openTasksFor(db, m[1], now.date)
  const items = tasks.length ? [] : backlogHits(db, m[1]).filter((b) => b.status === 'open')
  if (!tasks.length && !items.length) return undefined
  const finishTask = (t: Task) => ({ done: `“${t.title}” feito ✓`, run: () => runLogged(() => updateUndoable('tasks', t.id, { status: 'done', completedAt: nowISO() } as Partial<Task>), [eventDraft(now, { kind: 'done', title: `Feito: ${t.title}`, area: 'rotina', ref: { type: 'task', id: t.id } })]) })
  const finishItem = (b: BacklogItem) => ({ done: `“${b.title}” resolvido ✓`, run: () => runLogged(() => updateUndoable('backlogItems', b.id, { status: 'done' }), [eventDraft(now, { kind: 'done', title: `Resolvido: ${b.title}`, area: 'rotina' })]) })
  const acts = [...tasks.map(finishTask), ...items.map(finishItem)]
  const labels = [...tasks.map((t) => t.title), ...items.map((b) => b.title)]
  if (acts.length > 1) return { area: AREA, text: 'Qual delas?', options: acts.slice(0, 5).map((a, i) => ({ label: labels[i], act: a })) }
  return { area: 'feito', text: acts[0].done, ref: tasks[0] ? { type: 'task', id: tasks[0].id } : undefined, action: { mode: 'direct', run: acts[0].run } }
}

/** "JNB fica pra segunda" → the to-do moves (or the backlog item becomes one on that day). */
function stays(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = STAYS.exec(n)
  if (!m) return undefined
  const date = dayIn(m[2], now.date)
  if (!date || /\d/.test(m[2].replace(/\bdia\s+\d+/, ''))) return undefined
  if (lex(db, m[1], now.date).mods.length) return undefined
  const tasks = openTasksFor(db, m[1], now.date)
  if (!tasks.length) {
    const hits = backlogHits(db, m[1])
    if (hits.length !== 1) return undefined
    return { area: AREA, text: `“${hits[0].title}” virou tarefa pra ${dayLabel(date, now.date)} ✓`, action: { mode: 'direct', run: () => promote(hits[0], date, input) } }
  }
  const move = (t: Task) => ({
    done: `“${t.title}” vai pra ${dayLabel(date, now.date)} ✓`,
    run: () => runLogged(() => updateUndoable('tasks', t.id, { date, bucket: undefined } as Partial<Task>), [eventDraft(now, { kind: 'moved', title: `${t.title} → ${formatDayMonth(date)}`, area: 'rotina', ref: { type: 'task', id: t.id } })]),
  })
  if (tasks.length > 1) return { area: AREA, text: 'Qual delas?', options: tasks.slice(0, 5).map((t) => ({ label: t.title, act: move(t) })) }
  const a = move(tasks[0])
  return { area: AREA, text: a.done, sub: tasks[0].date === now.date ? 'Saiu de hoje.' : undefined, ref: { type: 'task', id: tasks[0].id }, action: { mode: 'direct', run: a.run } }
}

export const backlogHandler: Handler = {
  id: 'backlog',
  run(input) {
    return put(input) ?? stays(input) ?? done(input)
  },
}
