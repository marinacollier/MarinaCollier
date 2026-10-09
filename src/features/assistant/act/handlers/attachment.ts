/**
 * What Lumos does with a print/photo/PDF that is NOT an event (events go to the calendar handler).
 * Generic by category — no per-app rules:
 *   task / work  → a to-do (or Waiting For when someone owes her something), dated only if the print says so
 *   book         → the library, "quero ler"
 *   shopping     → Vida real · compras, one item each
 *   travel, food, unknown → says what it read and asks what to do (nothing written on a guess)
 * Written straight away only when her sentence asks ("salva", "anota", "adiciona"); otherwise a confirm.
 */
import { nextOrder } from '@/data/store'
import type { Task } from '@/data/types'
import { formatDayMonth } from '@/lib/date'
import { uid } from '@/lib/id'
import { all, createUndoable, eventDraft, runLogged } from '../log'
import type { Handler, HandlerInput, LumosReply } from '../types'

const SAVE = /\b(salva|salve|guarda|guarde|anota|anote|adiciona|adicione|coloca|coloque|bota|cria|crie|registra|registre)\b/

function attachment(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, attachment: a } = input
  if (!a || (a.category === 'event' && a.event)) return undefined
  const explicit = SAVE.test(n)
  const read = a.summary ? `Li: ${a.summary}.` : 'Li o arquivo.'
  const where = a.kind === 'pdf' ? 'do PDF' : 'do print'
  const mode = explicit ? ('direct' as const) : ('confirm' as const)

  if ((a.category === 'task' || a.category === 'work') && a.task?.title) {
    const t = a.task
    const id = uid()
    const waiting = !!t.who
    const data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = waiting
      ? { title: t.title, status: 'waiting', waiting: { who: t.who!, since: now.date, followUpOn: t.due }, context: a.category === 'work' ? 'trabalho' : 'geral', order: nextOrder(db.tasks) }
      : { title: t.title, status: 'todo', date: t.due, bucket: t.due ? undefined : 'semana', context: a.category === 'work' ? 'trabalho' : 'geral', order: nextOrder(db.tasks) }
    const label = waiting ? `Esperando ${t.who}: ${t.title}` : t.title
    return {
      area: waiting ? 'esperando' : 'tarefas',
      text: explicit ? `${label} ✓${t.due ? ` · ${formatDayMonth(t.due)}` : ''}` : `${read} Anoto${waiting ? ' em Esperando' : ''}?`,
      lines: explicit ? undefined : [{ text: label, emoji: waiting ? '⏳' : '✓', sub: t.due ? `${waiting ? 'retorno' : 'prazo'} ${formatDayMonth(t.due)}` : 'sem data no print' }],
      provenance: 'inference',
      ref: { type: 'task', id },
      action: { mode, label: 'Anotar', done: `${label} ✓`, run: () => runLogged(() => createUndoable('tasks', { ...data, id }).undo, [eventDraft(now, { kind: 'created', title: `${label} (${where})`, area: 'trabalho', ref: { type: 'task', id } })]) },
    }
  }

  if (a.category === 'book' && a.book?.title) {
    const b = a.book
    const same = db.books.find((x) => x.title.trim().toLowerCase() === b.title.trim().toLowerCase())
    if (same) return { area: 'livros', text: `“${same.title}” já está na sua biblioteca ✓`, ref: { type: 'book', id: same.id } }
    const id = uid()
    return {
      area: 'livros',
      text: explicit ? `“${b.title}” na sua lista de quero ler ✓` : `${read} Coloco em “quero ler”?`,
      lines: explicit ? undefined : [{ text: b.title, emoji: '📚', sub: b.author ?? undefined }],
      provenance: 'inference',
      action: { mode, label: 'Quero ler', done: `“${b.title}” em quero ler ✓`, run: () => runLogged(() => createUndoable('books', { id, title: b.title, author: b.author ?? undefined, status: 'quero', progress: 0, quotes: [], order: db.books.length }).undo, [eventDraft(now, { kind: 'created', title: `Livro: ${b.title}`, area: 'leitura', ref: { type: 'book', id } })]) },
    }
  }

  if (a.category === 'shopping' && a.items?.length) {
    const items = a.items.slice(0, 12)
    return {
      area: 'compras',
      text: explicit ? `${items.length} ${items.length === 1 ? 'item' : 'itens'} na lista de compras ✓` : `${read} Coloco na lista de compras?`,
      lines: items.map((t) => ({ text: t, emoji: '🛒' })),
      provenance: 'inference',
      action: {
        mode,
        label: 'Colocar na lista',
        done: `${items.length} ${items.length === 1 ? 'item' : 'itens'} na lista ✓`,
        run: () =>
          all(
            items.map((title, i) =>
              runLogged(() => createUndoable('tasks', { title: `Comprar ${title}`, status: 'todo', bucket: 'semana', context: 'vida_real', lifeAdminCategory: 'compras', adminKind: 'comprar', order: nextOrder(db.tasks) + i }).undo, [
                eventDraft(now, { kind: 'created', title: `Compras: ${title}`, area: 'casa' }),
              ]),
            ),
          ),
      },
    }
  }

  // Travel, food, or not sure: say what was read, ask — nothing written on a guess.
  const ideas: Record<string, { label: string; prefill: string }[]> = {
    travel: [
      { label: 'Colocar na agenda', prefill: 'coloca na agenda ' },
      { label: 'Anotar na viagem', prefill: 'anota na viagem: ' },
    ],
    food: [{ label: 'Registrar o que comi', prefill: 'comi ' }],
  }
  return {
    area: 'arquivo',
    text: read,
    sub: a.category === 'unknown' ? 'Não consegui entender com segurança o que fazer com isso — me diz?' : 'O que eu faço com isso?',
    lines: a.text ? [{ text: a.text.slice(0, 280), emoji: '📎' }] : undefined,
    provenance: 'inference',
    options: [...(ideas[a.category] ?? []), { label: 'Guardar no Inbox', prefill: `anota: ${a.summary ?? a.name}` }],
  }
}

export const attachmentHandler: Handler = { id: 'attachment', run: attachment }
