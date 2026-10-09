/**
 * To-dos by conversation — the same records the Home shows (no copies):
 *   "passa LinkedIn pra amanhã"           → the task's day moves (out of today, into tomorrow)
 *   "essa task do Santander já fiz"       → that project's open task of the day is done (asks when 2+)
 *   "não vou fazer inglês hoje"           → a placed session / recurring task is cancelled for that day;
 *   "amanhã não tenho inglês"               a one-off task asks: pra amanhã? tirar de hoje?
 * Trainings are left to the training planner (any modality in the sentence → not here).
 */
import { dayItems, type ActionItem } from '@/data/agenda/items'
import { CAREER_META, weekProgress } from '@/data/career/activities'
import { isCareerQuota, isTaskOpen } from '@/data/selectors'
import type { DateKey, DB, Project, Task } from '@/data/types'
import { formatDayMonth, relativeDay } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { lex } from '../../adjust/lexicon'
import { all, eventDraft, runLogged, updateUndoable } from '../log'
import { policyFor } from '../policy'
import { dayIn, keyWords, norm } from '../text'
import type { Handler, HandlerInput, LumosReply, Undo } from '../types'
import { applyOps } from '@/data/schedule'

const AREA = 'tarefas'
const GENERIC = new Set(['tarefa', 'task', 'coisa', 'minha', 'meu', 'fazer', 'hoje', 'amanha'])

/** Tasks whose title contains every key word she said ("LinkedIn" → "Atualizar LinkedIn"). */
function findTasks(list: Task[], phrase: string): Task[] {
  const kw = keyWords(phrase).filter((w) => !GENERIC.has(w))
  if (!kw.length) return []
  const exact = list.filter((t) => norm(t.title) === norm(phrase))
  if (exact.length) return exact
  return list.filter((t) => {
    const words = new Set(norm(t.title).split(/[^a-z0-9]+/))
    return kw.every((w) => words.has(w) || [...words].some((x) => x.length >= 5 && (x.startsWith(w) || w.startsWith(x))))
  })
}

const openTasks = (db: DB) => db.tasks.filter((t) => isTaskOpen(t) && t.status !== 'waiting' && !isCareerQuota(t))
const dayLabel = (d: DateKey, today: DateKey) => `${relativeDay(d, today)}${relativeDay(d, today).match(/^\d/) ? '' : ` (${formatDayMonth(d)})`}`

function projectNamed(db: DB, phrase: string): Project | undefined {
  const n = norm(phrase).replace(/\s+/g, '')
  return db.projects.find((p) => norm(p.name).replace(/\s+/g, '') === n) ?? db.projects.find((p) => n.length >= 4 && norm(p.name).replace(/\s+/g, '').includes(n))
}

function done(t: Task, now: HandlerInput['now']): Undo {
  return runLogged(() => updateUndoable('tasks', t.id, { status: 'done', completedAt: nowISO() } as Partial<Task>), [eventDraft(now, { kind: 'done', title: `Feito: ${t.title}`, area: t.context === 'trabalho' ? 'trabalho' : 'rotina', ref: { type: 'task', id: t.id } })])
}

function moveTo(t: Task, date: DateKey, now: HandlerInput['now']): Undo {
  return runLogged(() => updateUndoable('tasks', t.id, { date, bucket: undefined } as Partial<Task>), [eventDraft(now, { kind: 'moved', title: `${t.title} → ${formatDayMonth(date)}`, area: t.context === 'trabalho' ? 'trabalho' : 'rotina', ref: { type: 'task', id: t.id } })])
}

// ─── passa X pra amanhã ─────────────────────────────────────────────────────

const MOVE = /^(?:passa|passar|joga|jogar|empurra|empurrar|move|mover|muda|mudar|adia|adiar|transfere|transferir|deixa|deixar)\s+(?:a\s+|o\s+|minha\s+|meu\s+|a\s+tarefa\s+(?:de\s+)?|a\s+task\s+(?:de\s+)?)?(.+?)\s+(?:pra|para|pro)\s+(.+)$/

function move(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = MOVE.exec(n)
  if (!m) return undefined
  const date = dayIn(m[2], now.date)
  if (!date || /\d/.test(m[2].replace(/\bdia\s+\d+/, ''))) return undefined // "pras sete" is a time: the planner's
  if (lex(db, m[1], now.date).mods.length) return undefined
  const hits = findTasks(openTasks(db), m[1])
  if (!hits.length) return undefined
  if (hits.length > 1)
    return { area: AREA, text: 'Qual delas?', options: hits.slice(0, 5).map((t) => ({ label: t.title, act: { done: `“${t.title}” vai pra ${dayLabel(date, now.date)} ✓`, run: () => moveTo(t, date, now) } })) }
  const t = hits[0]
  if (t.date === date) return { area: AREA, text: `“${t.title}” já está pra ${dayLabel(date, now.date)} ✓` }
  return {
    area: AREA,
    text: `“${t.title}” vai pra ${dayLabel(date, now.date)} ✓`,
    sub: t.date === now.date ? 'Saiu de hoje.' : undefined,
    ref: { type: 'task', id: t.id },
    action: { mode: policyFor('complete_task'), run: () => moveTo(t, date, now) },
  }
}

// ─── essa task do Santander já fiz ──────────────────────────────────────────

const PROJECT_DONE = /^(?:essa\s+|a\s+|aquela\s+)?(?:task|tarefa)\s+d[oa]\s+(.+?)\s+(?:eu\s+)?(?:ja\s+)?(?:fiz|terminei|conclui|acabei|ta feita|esta feita)$|^(?:ja\s+)?(?:fiz|terminei|conclui|acabei)\s+(?:a|essa|aquela)\s+(?:task|tarefa)\s+d[oa]\s+(.+)$/

function projectDone(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = PROJECT_DONE.exec(n)
  if (!m) return undefined
  const p = projectNamed(db, m[1] ?? m[2])
  if (!p) return undefined
  const today = dayItems(db, now.date, now.date).filter((i) => i.refType === 'task' && i.status === 'pending').map((i) => i.refId)
  const open = openTasks(db).filter((t) => t.projectId === p.id)
  const ofToday = open.filter((t) => today.includes(t.id))
  const list = ofToday.length ? ofToday : open.filter((t) => !t.date || t.date <= now.date)
  if (!list.length) return { area: AREA, text: `Não tem tarefa do ${p.name} aberta pra hoje.` }
  if (list.length > 1) return { area: AREA, text: `Qual do ${p.name}?`, options: list.slice(0, 5).map((t) => ({ label: t.title, act: { done: `“${t.title}” feito ✓`, run: () => done(t, now) } })) }
  const t = list[0]
  return { area: 'feito', text: `“${t.title}” feito ✓`, ref: { type: 'task', id: t.id }, action: { mode: policyFor('complete_task'), run: () => done(t, now) } }
}

// ─── não vou fazer X hoje · amanhã não tenho X ──────────────────────────────

const NOT_DOING = /^(?:(hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\s+)?nao\s+(?:vou\s+(?:fazer|conseguir fazer|ter)|tenho|vai ter|rola|vai rolar)\s+(?:o\s+|a\s+|meu\s+|minha\s+)?(.+?)(?:\s+(hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo))?$/
const KIND_WORDS: [RegExp, keyof typeof CAREER_META][] = [
  [/\bingles\b/, 'ingles_exec'],
  [/\bnetworking\b/, 'networking'],
  [/\bpost(s)?\b|\blinkedin\b/, 'post'],
  [/\blideranca\b/, 'lideranca'],
]

function cancelFor(item: ActionItem, date: DateKey, now: HandlerInput['now']): Undo {
  return runLogged(
    () => applyOps([{ op: 'override', date, ref: { type: 'task', id: item.refId }, patch: { cancelled: true, reason: 'Marina: não vai rolar' }, by: 'lumos' }]),
    [eventDraft(now, { kind: 'cancelled', title: `${item.title}: não vai rolar (${formatDayMonth(date)})`, area: 'rotina', ref: { type: 'task', id: item.refId } })],
  )
}

function notDoing(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = NOT_DOING.exec(n)
  if (!m) return undefined
  const phrase = m[2]
  if (lex(db, phrase, now.date).mods.length || /\b(nadar|correr|pedalar|treinar|treino)\b/.test(phrase)) return undefined
  const date = dayIn(m[1] ?? m[3] ?? 'hoje', now.date) ?? now.date
  const items = dayItems(db, date, now.date).filter((i) => i.refType === 'task' && i.status === 'pending')
  const byId = new Map(db.tasks.map((t) => [t.id, t]))
  const kind = KIND_WORDS.find(([re]) => re.test(phrase))?.[1]
  const hits = items.filter((i) => {
    const t = byId.get(i.refId)
    if (!t) return false
    if (kind && t.careerKind === kind) return true
    return findTasks([t], phrase).length > 0
  })
  const when = relativeDay(date, now.date)
  if (!hits.length) {
    if (kind) {
      const p = weekProgress(db, now.date).find((x) => x.kind === kind)
      return { area: 'carreira', text: `${CAREER_META[kind].label} não estava no seu dia ${when} — nada pra cancelar.${p ? ` Segue como meta da semana (${p.done}/${p.target}${p.unit === 'min' ? ' min' : ''}).` : ''}` }
    }
    return undefined
  }
  const t = byId.get(hits[0].refId)!
  // A session placed by the planner, or a recurring task: cancel that day only.
  if (hits.length > 1 && !kind) return { area: AREA, text: 'Qual delas?', options: hits.slice(0, 5).map((i) => ({ label: i.title, act: { done: `${i.title}: fora de ${when} ✓`, run: () => cancelFor(i, date, now) } })) }
  if (t.careerParentId || t.recurrence || kind)
    return {
      area: kind ? 'carreira' : AREA,
      text: `${hits.length > 1 ? hits.map((h) => h.title).join(' e ') : hits[0].title}: fora de ${when} ✓`,
      sub: kind ? 'Continua como meta flexível da semana.' : undefined,
      ref: { type: 'task', id: t.id },
      action: { mode: policyFor('personal_schedule'), run: () => all(hits.map((h) => cancelFor(h, date, now))) },
    }
  // A one-off task: where should it go?
  return {
    area: AREA,
    text: `Tiro “${t.title}” de ${when}. Pra onde vai?`,
    options: [
      { label: 'Pra amanhã', act: { done: `“${t.title}” vai pra amanhã ✓`, run: () => moveTo(t, dayIn('amanha', date)!, now) } },
      { label: 'Sem dia (fica na lista)', act: { done: `“${t.title}” ficou sem dia ✓`, run: () => runLogged(() => updateUndoable('tasks', t.id, { date: undefined, bucket: 'semana' } as Partial<Task>), [eventDraft(now, { kind: 'moved', title: `${t.title}: sem dia`, area: 'rotina', ref: { type: 'task', id: t.id } })]) } },
    ],
  }
}

export const tasksHandler: Handler = {
  id: 'tasks',
  run(input) {
    return projectDone(input) ?? move(input) ?? notDoing(input)
  },
}
