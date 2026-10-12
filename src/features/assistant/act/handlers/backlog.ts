/**
 * The briefing's backlog by conversation (a BacklogItem is NOT a task until she gives it a day):
 *   "isso do Santander coloca terça"   → becomes a real to-do on Tuesday (direct + Desfazer)
 *   "coloca multas do carro hoje"      → same; when it is already a task, that task moves
 *   "B.O. feito" · "multas do carro feito" → the to-do (or the backlog item) is done
 *   "JNB fica pra segunda"             → the to-do of the day moves (same as "passa … pra segunda")
 *   "já revisei o LinkedIn"            → the to-do whose ACTION she named (not "Criar página no LinkedIn")
 *   "já resolvi a hospedagem de JNB"   → the to-do about exactly that (not "hospedagem e safari")
 *   "o B.O. ainda está pendente"       → nothing changes; she hears where it stands (atrasado desde 10/10)
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
  if (!hits.length) {
    // "isso do X coloca terça" is clearly about the backlog: say so instead of guessing something else.
    return explicit ? { area: AREA, text: `Não achei nada de “${m[1]}” no backlog pra colocar ${dayLabel(date, now.date)}.`, sub: 'Se for uma tarefa nova, me diz o nome que eu crio.' } : undefined
  }
  // "coloca X terça" without "isso do": an open to-do with that name is the tasks handler's.
  if (!explicit && db.tasks.some((t) => isTaskOpen(t) && t.status !== 'waiting' && phraseHits(t.title, m[1]) && !hits.some((b) => b.promotedTaskId === t.id))) return undefined
  const act = (b: BacklogItem) => ({ done: `“${b.title}” ${b.promotedTaskId ? 'vai pra' : 'virou tarefa pra'} ${dayLabel(date, now.date)} ✓`, run: () => promote(b, date, input) })
  if (hits.length > 1) return { area: AREA, text: 'Qual delas?', options: hits.slice(0, 5).map((b) => ({ label: b.title, act: act(b) })) }
  const a = act(hits[0])
  return { area: AREA, text: a.done, sub: hits[0].window ? `No briefing: ${hits[0].window.label}` : undefined, ref: { type: 'backlogItem', id: hits[0].id }, action: { mode: 'direct', run: a.run } }
}

const namesOf = (t: Task) => [t.title, ...(t.aliases ?? [])]

function openTasksFor(db: DB, phrase: string, today: DateKey): Task[] {
  const hits = db.tasks.filter((t) => isTaskOpen(t) && t.status !== 'waiting' && !t.recurrence && namesOf(t).some((x) => phraseHits(x, phrase)))
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

// ─── "já revisei o LinkedIn" · "já resolvi a hospedagem de JNB" ───────────────

const DID = /^(?:eu\s+)?ja\s+([a-z]{2,}?)(?:ei|i|ou)\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)$/
/** Verbs that only say "it's done" — they name no particular action. */
const GENERIC_DONE = /^(?:resolv|termin|conclu|finaliz|fech|acab|fiz|faz|cumpr)/
const stemOf = (v: string) => v.replace(/gu$/, 'g').replace(/qu$/, 'c')
const firstWord = (s: string) => tokens(s)[0] ?? ''
const VERBISH = /(?:ar|er|ir)$/
/** What a title acts on, without its verb ("Organizar hospedagem JNB" → hospedagem, jnb). */
const objectOf = (s: string) => {
  const w = keyWords(s)
  return w.length > 1 && VERBISH.test(w[0]) ? w.slice(1) : w
}
const covered = (words: string[], said: string[]) => words.every((w) => said.some((x) => x === w || (x.length >= 4 && w.length >= 4 && (x.startsWith(w) || w.startsWith(x)))))

function did(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = DID.exec(n)
  if (!m) return undefined
  const stem = stemOf(m[1])
  if (stem.length < 3 || lex(db, m[2], now.date).mods.length) return undefined
  const all = openTasksFor(db, m[2], now.date)
  if (!all.length) return undefined
  // The action she named wins ("revisei" → "Revisar…"); a generic "resolvi" names none.
  const generic = GENERIC_DONE.test(stem)
  const byVerb = generic ? all : all.filter((t) => namesOf(t).some((x) => firstWord(x).startsWith(stem)))
  if (!generic && !byVerb.length) return undefined
  // Then the to-do about exactly what she said: "a hospedagem de JNB" is not "hospedagem e safari JNB".
  const said = keyWords(m[2])
  const exact = byVerb.filter((t) => namesOf(t).some((x) => covered(objectOf(x), said)))
  const hits = exact.length ? exact : byVerb
  const finish = (t: Task) => ({ done: `“${t.title}” feito ✓`, run: () => runLogged(() => updateUndoable('tasks', t.id, { status: 'done', completedAt: nowISO() } as Partial<Task>), [eventDraft(now, { kind: 'done', title: `Feito: ${t.title}`, area: 'rotina', ref: { type: 'task', id: t.id } })]) })
  if (hits.length > 1) return { area: AREA, text: 'Qual delas?', options: hits.slice(0, 5).map((t) => ({ label: t.title, act: finish(t) })) }
  const t = hits[0]
  const still = all.filter((x) => x.id !== t.id)
  const a = finish(t)
  return { area: 'feito', text: a.done, sub: still.length ? `Segue aberta: ${still.map((x) => `“${x.title}”`).join(', ')}.` : undefined, ref: { type: 'task', id: t.id }, action: { mode: 'direct', run: a.run } }
}

// ─── "o B.O. ainda está pendente" → nothing changes, just where it stands ─────

const PENDING = /^(?:o\s+|a\s+)?(.+?)\s+(?:ainda\s+)?(?:esta|ta|segue|continua)\s+(?:pendente|em aberto|aberto|aberta)$/

function pending(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = PENDING.exec(n)
  if (!m) return undefined
  const tasks = openTasksFor(db, m[1], now.date)
  if (tasks.length !== 1) return undefined
  const t = tasks[0]
  const due = t.dueDate ?? t.date
  const where = due && due < now.date ? `atrasado desde ${formatDayMonth(due)}` : due === now.date ? 'é pra hoje' : due ? `pra ${dayLabel(due, now.date)}` : 'sem dia'
  return { area: AREA, text: `Combinado: “${t.title}” segue pendente — ${where}.`, sub: 'Não mudei nada: fica no seu dia até você marcar feito.', ref: { type: 'task', id: t.id }, provenance: 'fact' }
}

export const backlogHandler: Handler = {
  id: 'backlog',
  run(input) {
    return put(input) ?? stays(input) ?? done(input) ?? did(input) ?? pending(input)
  },
}
