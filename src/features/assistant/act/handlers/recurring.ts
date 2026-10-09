/**
 * Ending something that repeats — "exclui a recorrência de cerâmica", "não faço mais cerâmica",
 * "tira cerâmica de vez", "cancela todas as cerâmicas".
 *   recurring event  → the series ends today (past ones stay in the history; `until` = yesterday)
 *   recurring task   → archived (Desfazer brings it back)
 * What Lumos remembered about it ("Cerâmica segunda e quinta à noite") is archived too, so she never
 * brings it up again. Always a confirm: it is a lasting change.
 */
import { getDB } from '@/data/store'
import type { CalendarEvent, Task } from '@/data/types'
import { addDays, WEEKDAY_LONG } from '@/lib/date'
import { all, eventDraft, runLogged, updateUndoable } from '../log'
import { keyWords, norm } from '../text'
import type { Handler, HandlerInput, LumosReply, Undo } from '../types'

const VERB = '(?:exclui|excluir|exclua|apaga|apagar|apague|remove|remover|tira|tirar|tire|cancela|cancelar|cancele|para|parar|encerra|encerrar|deleta|deletar)'
const POLITE = '(?:(?:pfv|por favor|pode|voce pode)\\s+)*'
const SERIES = '(?:(?:a\\s+|as\\s+)?(?:recorrencia|repeticao|serie)\\s+(?:de|da|do|das|dos)\\s+|todas?\\s+(?:as\\s+)?(?:aulas?\\s+)?(?:de|da|do)?\\s*)'
const STOP: RegExp[] = [
  // exclui (pfv) a recorrência de X · cancela todas as X
  new RegExp(`^${POLITE}${VERB}\\s+${POLITE}${SERIES}(.+?)$`),
  // tira X de vez / pra sempre / da agenda de vez
  new RegExp(`^${POLITE}${VERB}\\s+${POLITE}(?:a\\s+|o\\s+)?(.+?)\\s+(?:da agenda\\s+)?(?:de vez|pra sempre|para sempre)$`),
  // não faço mais X · parei de fazer X · não vou mais (fazer) X
  /^(?:eu\s+)?(?:nao\s+(?:faco|vou fazer|vou|tenho|frequento)\s+mais|parei\s+(?:de\s+(?:fazer|ir\s+(?:na|no|pra|para)?)?\s*)?)\s*(?:a\s+|o\s+)?(.+?)$/,
]

/** Recurring things whose title matches every key word she said. */
function matches(title: string, phrase: string): boolean {
  const kw = keyWords(phrase).filter((w) => !['aula', 'aulas', 'recorrencia', 'mais', 'fazer'].includes(w))
  if (!kw.length) return false
  const words = norm(title).split(/[^a-z0-9]+/)
  return kw.every((w) => words.some((x) => x === w || (x.length >= 4 && (x.startsWith(w) || w.startsWith(x)))))
}

const daysOf = (e: CalendarEvent) => (e.recurrence?.kind === 'weekly' ? e.recurrence.weekdays.map((d) => WEEKDAY_LONG[d].toLowerCase().replace(/-feira$/, '')).join(' e ') : e.recurrence?.kind === 'daily' ? 'todo dia' : 'recorrente')

function stopEvent(e: CalendarEvent, today: string): Undo {
  // Starts today or later → no history to keep: the series simply never happens.
  return updateUndoable('events', e.id, e.date >= today ? { until: addDays(e.date, -1) } : { until: addDays(today, -1) })
}

function recurring(input: HandlerInput): LumosReply | undefined {
  const { db, now } = input
  const n = input.n.replace(/[!.,;]+/g, ' ').replace(/\s+/g, ' ').trim()
  let phrase: string | undefined
  for (const re of STOP) {
    const m = re.exec(n)
    if (m) {
      phrase = m[1].replace(/\s+(?:nao faco mais|parei|nao vou mais).*$/, '').trim()
      break
    }
  }
  if (!phrase) return undefined
  const today = now.date
  const events = db.events.filter((e) => e.recurrence && (!e.until || e.until >= today) && matches(e.title, phrase))
  const tasks = db.tasks.filter((t): t is Task => !!t.recurrence && t.status !== 'archived' && matches(t.title, phrase))
  if (!events.length && !tasks.length) return undefined
  const memories = (db.memory ?? []).filter((m) => m.status !== 'archived' && [...events, ...tasks].some((x) => matches(m.text, x.title)))
  const name = (events[0] ?? tasks[0]).title
  const lines = [
    ...events.map((e) => ({ text: e.title, emoji: e.kind === 'criatividade' ? '🏺' : '📅', sub: `${daysOf(e)} · sai da agenda a partir de hoje` })),
    ...tasks.map((t) => ({ text: t.title, emoji: '🔁', sub: 'tarefa recorrente · sai da lista' })),
  ]
  return {
    area: 'agenda',
    text: `Encerrar “${name}” de vez?`,
    sub: `Some da agenda daqui pra frente — o que já aconteceu fica no histórico.${memories.length ? ' E eu esqueço que era um hábito seu.' : ''}`,
    lines,
    provenance: 'user',
    ref: events[0] ? { type: 'event', id: events[0].id } : { type: 'task', id: tasks[0].id },
    action: {
      mode: 'confirm',
      label: 'Encerrar',
      done: `“${name}” encerrada ✓ — não aparece mais`,
      run: () =>
        runLogged(
          () =>
            all([
              ...events.map((e) => stopEvent(getDB().events.find((x) => x.id === e.id) ?? e, today)),
              ...tasks.map((t) => updateUndoable('tasks', t.id, { status: 'archived' } as Partial<Task>)),
              ...memories.map((m) => updateUndoable('memory', m.id, { status: 'archived' })),
            ]),
          [eventDraft(now, { kind: 'cancelled', title: `${name}: recorrência encerrada`, area: 'rotina', ref: events[0] ? { type: 'event', id: events[0].id } : { type: 'task', id: tasks[0].id } })],
        ),
    },
  }
}

export const recurringHandler: Handler = { id: 'recurring', run: recurring }
