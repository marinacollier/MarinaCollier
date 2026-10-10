/**
 * "Cola o Daily Executive Briefing aqui" — preview first, in her words (no technical fields):
 *   Daily Briefing · 10 out — 4 tarefas do dia · 3 itens futuros · 2 aguardando retorno · 1 recorrência
 *   Hoje □ … · Próximos … · Waiting For … · Precisa de revisão …
 * Then IMPORTAR (a confirm; one batch) → "Daily Briefing importado ✓" only after the device has it.
 * Desfazer reverts only what is still as this import left it.
 * Also: "o que veio do briefing hoje?" — today's to-dos, what's next and Waiting For, kept apart.
 */
import { applyPlan, undoBatch } from '@/data/briefing/apply'
import { planBriefing, readBriefing, summarize, type PlanEntry, type PlanKind } from '@/data/briefing/import'
import type { DB, ImportBatch } from '@/data/types'
import { formatDayMonth } from '@/lib/date'
import { eventDraft, runLogged } from '../log'
import type { Handler, HandlerInput, LumosReply, ReplyLine, ReplySection } from '../types'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const dayLabel = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`
const EMOJI: Record<PlanKind, string> = { today: '☐', future: '→', waiting: '⏳', recurring: '🔁' }
const TITLES: Record<PlanKind, string> = { today: 'Hoje', future: 'Próximos', waiting: 'Waiting For', recurring: 'Recorrências' }

function sectionsOf(entries: PlanEntry[]): ReplySection[] {
  return (['today', 'future', 'waiting', 'recurring'] as PlanKind[])
    .map((k) => ({ title: TITLES[k], lines: entries.filter((e) => e.kind === k).map((e): ReplyLine => ({ text: e.title, emoji: EMOJI[k], sub: e.sub, isNew: e.how === 'created' })) }))
    .filter((s) => s.lines.length)
}

function briefing(input: HandlerInput): LumosReply | undefined {
  const { db, text, now } = input
  const { blocks, narrative } = readBriefing(text)
  if (!blocks.length) return undefined
  const plan = planBriefing(db, blocks)!
  const s = summarize(plan)
  const head = [
    s.today ? plural(s.today, 'tarefa do dia', 'tarefas do dia') : undefined,
    s.future ? plural(s.future, 'item futuro', 'itens futuros') : undefined,
    s.waiting ? plural(s.waiting, 'aguardando retorno', 'aguardando retorno') : undefined,
    s.recurring ? plural(s.recurring, 'recorrência reconhecida', 'recorrências reconhecidas') : undefined,
    s.bills ? plural(s.bills, 'pagamento com check', 'pagamentos com check') : undefined,
  ].filter(Boolean)
  const review = plan.review.length ? `${plural(plan.review.length, 'item precisa', 'itens precisam')} de revisão` : undefined
  const sections = [...sectionsOf(plan.entries), ...(plan.review.length ? [{ title: 'Precisa de revisão', lines: plan.review.map((r) => ({ text: r.title, emoji: '⚠️', sub: r.reason })) }] : [])]
  if (!plan.ops.length) {
    return { area: 'briefing', text: `Daily Briefing · ${dayLabel(plan.date)}: tudo isso já está no app ✓`, sub: [s.kept ? 'Nada duplicado — o que você marcou ou mudou ficou como estava.' : undefined, review].filter(Boolean).join('\n') || undefined, sections, provenance: 'user' }
  }
  const result = [
    s.created ? plural(s.created, 'tarefa adicionada', 'tarefas adicionadas') : undefined,
    s.pulled ? plural(s.pulled, 'tarefa do backlog veio pra hoje', 'tarefas do backlog vieram pra hoje') : undefined,
    s.backlog ? plural(s.backlog, 'item no backlog', 'itens no backlog') : undefined,
    s.waitingLinked ? plural(s.waitingLinked, 'Waiting For vinculado', 'Waiting For vinculados') : undefined,
    s.recurring ? plural(s.recurring, 'recorrência reconhecida', 'recorrências reconhecidas') : undefined,
    s.projects ? plural(s.projects, 'frente nova', 'frentes novas') : undefined,
    review,
  ].filter(Boolean)
  return {
    area: 'briefing',
    text: `Daily Briefing · ${dayLabel(plan.date)}`,
    sub: [head.join(' · '), review].filter(Boolean).join('\n'),
    sections,
    provenance: 'user',
    action: {
      mode: 'confirm',
      label: 'Importar',
      done: `Daily Briefing importado ✓ ${result.join(' · ')}`,
      run: () =>
        runLogged(
          () => {
            const id = applyPlan(plan, narrative)
            return () => void undoBatch(id)
          },
          [eventDraft(now, { kind: 'created', title: `Daily Briefing de ${formatDayMonth(plan.date)} importado`, area: 'rotina' })],
        ),
    },
  }
}

// ─── "o que veio do briefing hoje?" ─────────────────────────────────────────

const WHAT_CAME = /\b(?:o que|oque|que|quais?)\b.*\b(?:veio|vieram|chegou|trouxe|tem|entrou)\b.*\bbriefing\b|\bbriefing\b.*\b(?:de hoje|hoje|trouxe)\b.*\?|^briefing de hoje$/

function stateOf(db: DB, item: ImportBatch['items'][number], today: string): string | undefined {
  if (item.collection === 'tasks') {
    const t = db.tasks.find((x) => x.id === item.id)
    if (!t) return 'saiu do app'
    if (t.status === 'done') return t.waiting ? 'respondeu ✓' : 'feita ✓'
    if (t.status === 'waiting') return `esperando ${t.waiting?.who ?? ''}`.trim()
    return t.date ? (t.date === today ? 'hoje' : `foi pra ${formatDayMonth(t.date)}`) : undefined
  }
  if (item.collection === 'backlogItems') {
    const b = db.backlogItems.find((x) => x.id === item.id)
    if (!b) return undefined
    if (b.status === 'done') return 'resolvido ✓'
    if (b.status === 'promoted') {
      const t = db.tasks.find((x) => x.id === b.promotedTaskId)
      return t ? `virou tarefa${t.date ? ` · ${formatDayMonth(t.date)}` : ''}${t.status === 'done' ? ' ✓' : ''}` : 'virou tarefa'
    }
    return b.kind === 'recurring' ? b.recognizedAs : (b.window?.label ?? 'sem data')
  }
  return undefined
}

function whatCame(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!WHAT_CAME.test(n)) return undefined
  const batches = db.importBatches.filter((b) => !b.undoneAt).sort((a, b) => b.briefingDate.localeCompare(a.briefingDate) || b.importedAt.localeCompare(a.importedAt))
  const batch = batches.find((b) => b.briefingDate === now.date) ?? batches[0]
  if (!batch) return { area: 'briefing', text: 'Ainda não chegou nenhum briefing aqui.', sub: 'Cola o Daily Executive Briefing (com o bloco JSON) e eu organizo.' }
  const sections = (['today', 'future', 'waiting', 'recurring'] as PlanKind[])
    .map((k) => ({ title: TITLES[k], lines: batch.items.filter((i) => i.kind === k && i.how !== 'ignored').map((i): ReplyLine => ({ text: i.title, emoji: EMOJI[k], sub: stateOf(db, i, now.date) })) }))
    .filter((s) => s.lines.length)
  const count = (k: PlanKind) => batch.items.filter((i) => i.kind === k && i.how !== 'ignored').length
  return {
    area: 'briefing',
    text: `Do briefing de ${dayLabel(batch.briefingDate)}:`,
    sub: [count('today') && plural(count('today'), 'tarefa do dia', 'tarefas do dia'), count('future') && plural(count('future'), 'item futuro', 'itens futuros'), count('waiting') && plural(count('waiting'), 'aguardando retorno', 'aguardando retorno')].filter(Boolean).join(' · '),
    sections,
    provenance: 'fact',
  }
}

export const briefingHandler: Handler = {
  id: 'briefing',
  run(input) {
    return briefing(input) ?? whatCame(input)
  },
}
