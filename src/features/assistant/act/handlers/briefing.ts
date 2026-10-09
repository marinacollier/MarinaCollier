/**
 * "Cola o Daily Executive Briefing aqui" — the briefing text with its JSON block ("BLOCO PARA MARINA OS
 * APP") becomes the day's checklist, pulled backlog, waiting-fors and payments with a check.
 * Always a confirm (it is a batch write); one Desfazer undoes the whole import.
 */
import { getDB } from '@/data/store'
import { planBriefing, readBriefing, summarize, type BriefingOp, type BriefingPlan } from '@/data/briefing/import'
import type { Note } from '@/data/types'
import { formatDayMonth } from '@/lib/date'
import { all, createUndoable, eventDraft, runLogged, updateUndoable } from '../log'
import type { Handler, HandlerInput, LumosReply, ReplyLine, Undo } from '../types'

const PRIO: Record<string, string> = { alta: 'P1', media: 'P2', baixa: 'P3' }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function lineOf(op: BriefingOp, projectName: (id?: string) => string | undefined): ReplyLine | undefined {
  if (op.kind === 'task') {
    const t = op.data
    const bits = [t.priority ? PRIO[t.priority] : undefined, t.durationMin ? `${t.durationMin} min` : undefined, projectName(t.projectId), t.date ? formatDayMonth(t.date) : t.dueDate ? `prazo ${formatDayMonth(t.dueDate)}` : undefined]
    return { text: t.status === 'waiting' ? `Esperando ${t.waiting?.who}: ${t.title}` : t.title, emoji: t.status === 'waiting' ? '⏳' : '☐', sub: bits.filter(Boolean).join(' · ') || undefined, isNew: true }
  }
  if (op.kind === 'pull') return { text: op.title, emoji: '↪︎', sub: `já estava no app · vem pra ${formatDayMonth(op.patch.date!)}` }
  return undefined
}

/** Writes the plan; one undo for everything. */
export function applyBriefing(plan: BriefingPlan, narrative: string): Undo {
  const undos: Undo[] = []
  for (const op of plan.ops) {
    if (op.kind === 'project') undos.push(createUndoable('projects', op.data).undo)
    else if (op.kind === 'task') undos.push(createUndoable('tasks', op.data).undo)
    else if (op.kind === 'pull') undos.push(updateUndoable('tasks', op.id, op.patch))
    else if (op.kind === 'category') undos.push(createUndoable('financialCategories', op.data).undo)
    else if (op.kind === 'bill') undos.push(updateUndoable('financialCategories', op.id, { bill: op.bill }))
  }
  // The reading itself (not the JSON) is kept as a note of that day, replaced if pasted again.
  if (narrative.length > 280) {
    const title = `Daily Executive Briefing · ${formatDayMonth(plan.date)}`
    const same = getDB().notes.find((x) => x.title === title)
    const data: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> = { title, body: narrative, kind: 'nota', tags: ['briefing'], pinned: false }
    undos.push(same ? updateUndoable('notes', same.id, { body: narrative }) : createUndoable('notes', data).undo)
  }
  return all(undos)
}

function briefing(input: HandlerInput): LumosReply | undefined {
  const { db, text, now } = input
  const { blocks, narrative } = readBriefing(text)
  if (!blocks.length) return undefined
  const plan = planBriefing(db, blocks)!
  const s = summarize(plan)
  const projectName = (id?: string) => (id ? (db.projects.find((p) => p.id === id)?.name ?? plan.ops.find((o): o is Extract<BriefingOp, { kind: 'project' }> => o.kind === 'project' && o.data.id === id)?.data.name) : undefined)
  const lines = plan.ops.map((o) => lineOf(o, projectName)).filter((l): l is ReplyLine => !!l)
  const counts = [
    s.tasks ? plural(s.tasks, 'tarefa nova', 'tarefas novas') : undefined,
    s.pulled ? plural(s.pulled, 'puxada pro dia', 'puxadas pro dia') : undefined,
    s.waiting ? plural(s.waiting, 'em Esperando', 'em Esperando') : undefined,
    s.bills ? plural(s.bills, 'pagamento com check', 'pagamentos com check') : undefined,
    s.projects ? plural(s.projects, 'frente nova', 'frentes novas') : undefined,
  ].filter(Boolean)
  const keptNote = s.kept ? `${plural(s.kept, 'item já estava', 'itens já estavam')} no app — não dupliquei.` : undefined
  if (!plan.ops.length) {
    return { area: 'briefing', text: `Briefing de ${formatDayMonth(plan.date)}: tudo isso já está no app ✓`, sub: keptNote, provenance: 'user' }
  }
  const newProjects = plan.ops.filter((o): o is Extract<BriefingOp, { kind: 'project' }> => o.kind === 'project').map((o) => o.data.name)
  const bills = plan.ops.filter((o): o is Extract<BriefingOp, { kind: 'category' | 'bill' }> => o.kind === 'category' || o.kind === 'bill').map((o) => (o.kind === 'category' ? o.data.name : o.name))
  return {
    area: 'briefing',
    text: `Briefing de ${formatDayMonth(plan.date)} — coloco no app?`,
    sub: [counts.join(' · '), keptNote].filter(Boolean).join('\n'),
    sections: [
      ...(lines.length ? [{ title: 'Checklist', lines: lines.slice(0, 30) }] : []),
      ...(bills.length ? [{ title: 'Pagamentos (com check, sem valor)', lines: [{ text: bills.join(' · '), emoji: '💳' }] }] : []),
      ...(newProjects.length ? [{ title: 'Frentes novas', lines: newProjects.map((n) => ({ text: n, emoji: '📁', isNew: true })) }] : []),
    ],
    provenance: 'user',
    action: {
      mode: 'confirm',
      label: 'Colocar no app',
      done: `Briefing no app ✓ ${counts.join(' · ')}`,
      run: () => runLogged(() => applyBriefing(plan, narrative), [eventDraft(now, { kind: 'created', title: `Briefing de ${formatDayMonth(plan.date)} importado`, area: 'rotina' })]),
    },
  }
}

export const briefingHandler: Handler = { id: 'briefing', run: briefing }
