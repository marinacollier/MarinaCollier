/**
 * Books by conversation (simplify-spec):
 *   "terminei Continuous Discovery Habits" / "terminei o livro" → Lidos, endDate, "Lendo agora" updates,
 *        "quer guardar uma nota ou já seguimos pro próximo?" with the next book of the queue
 *   "tô na página 190" / "tô no capítulo 11"  → progress of the current book
 *   "coloca Inspired na minha lista"          → Quero ler
 *   "esse livro tá chato, tira da fila"       → out of the queue (undo brings it back)
 *   "o que eu leio depois?"                   → from the queue
 *   "começa Inspired" / "começa o próximo"    → Lendo agora
 *   "nota do livro: …"                        → saved in the book's notes
 */
import { ROUTES } from '@/app/routes'
import type { Now } from '@/data/intel'
import { getDB } from '@/data/store'
import type { Book, DB } from '@/data/types'
import { formatFullDate } from '@/lib/date'
import { uid } from '@/lib/id'
import { listJoin } from '../../agents/common'
import { createUndoable, eventDraft, removeUndoable, runLogged, updateUndoable, all } from '../log'
import { archiveMemory, remember } from '../memory'
import { policyFor } from '../policy'
import { cap, matchTitle, norm, stripLead } from '../text'
import type { Handler, HandlerInput, LumosReply, Undo } from '../types'

const AREA = 'livros'
const byOrder = (a: Book, b: Book) => a.order - b.order

export const reading = (db: DB) => db.books.filter((b) => b.status === 'lendo').sort(byOrder)
export const queue = (db: DB) => [...db.books.filter((b) => b.status === 'proximo').sort(byOrder), ...db.books.filter((b) => b.status === 'quero').sort(byOrder)]

const q = (b: Book) => `“${b.title}”`

/** The book a sentence talks about: by title, then "esse livro" (last one in the conversation), then the single one being read. */
function target(input: HandlerInput, pool: Book[]): Book | 'many' | undefined {
  const byTitle = matchTitle(pool, input.n)
  if (byTitle) return byTitle
  const last = input.ctx.lastRef?.type === 'book' ? pool.find((b) => b.id === input.ctx.lastRef!.id) : undefined
  if (last) return last
  const r = reading(input.db).filter((b) => pool.includes(b))
  if (r.length === 1) return r[0]
  if (r.length > 1) return 'many'
  return undefined
}

function startOps(b: Book, now: Now): Undo {
  const undos = [updateUndoable('books', b.id, { status: 'lendo', startDate: b.startDate ?? now.date, progress: b.progress || 0 })]
  undos.push(remember(now, { key: 'book.current', kind: 'state', area: 'leitura', text: `Lendo ${b.title}${b.author ? ` — ${b.author}` : ''}`, ref: { type: 'book', id: b.id } }))
  return all(undos)
}

// ─── terminei ───────────────────────────────────────────────────────────────

const FINISH = /\b(terminei|acabei|finalizei|conclui|li)\b/

function finish(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!FINISH.test(n)) return undefined
  const open = db.books.filter((b) => b.status !== 'finalizado')
  const byTitle = matchTitle(open, n)
  const saysBook = /\blivro\b/.test(n) || /\bde ler\b/.test(n)
  if (!byTitle && !saysBook) return undefined
  if (/^li\b/.test(n) && !byTitle) return undefined
  const b = byTitle ?? target(input, open)
  if (b === 'many') {
    return {
      area: AREA,
      text: 'Qual deles você terminou?',
      options: reading(db).map((x) => ({ label: x.title, ask: `terminei ${x.title}` })),
    }
  }
  if (!b) {
    return {
      area: AREA,
      text: 'Não tenho nenhum livro marcado como “lendo” agora — qual você terminou?',
      options: [{ label: 'Me conta o título', prefill: 'terminei ' }],
      link: { label: 'Abrir Livros', to: ROUTES.books },
    }
  }
  const next = queue(db).find((x) => x.id !== b.id)
  return {
    area: AREA,
    text: `Fechou ${q(b)} ✓ Marquei como lido hoje${b.author ? ` — ${b.author}` : ''}.`,
    sub: next ? `Quer guardar uma nota ou já seguimos pro próximo? Na fila: ${q(next)}.` : 'Quer guardar uma nota sobre ele?',
    ref: { type: 'book', id: b.id },
    options: [{ label: 'Guardar uma nota', prefill: 'nota do livro: ' }, ...(next ? [{ label: `Começar ${next.title}`, ask: `começa ${next.title}` }] : [{ label: 'O que eu leio depois?', ask: 'o que eu leio depois?' }])],
    action: {
      mode: policyFor('update_book'),
      run: () =>
        runLogged(() => {
          const undos = [updateUndoable('books', b.id, { status: 'finalizado', endDate: now.date, progress: 100 })]
          const current = getDB().memory.find((m) => m.key === 'book.current' && m.status !== 'archived')
          if (current && (current.ref?.id === b.id || norm(current.text).includes(norm(b.title)))) undos.push(archiveMemory(current.id))
          undos.push(remember(now, { key: `book.finished.${b.id}`, kind: 'history', area: 'leitura', text: `Terminou ${b.title} em ${formatFullDate(now.date)}`, ref: { type: 'book', id: b.id } }))
          return all(undos)
        }, [eventDraft(now, { kind: 'finished', title: `Terminou ${b.title}`, area: 'leitura', ref: { type: 'book', id: b.id } })]),
    },
  }
}

// ─── página / capítulo ──────────────────────────────────────────────────────

const PAGE = /\b(?:to|tou|estou|parei|cheguei|li ate|ja to|ja estou)\b.*\b(?:na |no )?(pagina|pag|capitulo|cap)\.?\s*(\d{1,4})\b/

function progress(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = PAGE.exec(n)
  if (!m) return undefined
  const b = target(input, db.books.filter((x) => x.status !== 'finalizado'))
  if (b === 'many') return { area: AREA, text: 'Em qual livro?', options: reading(db).map((x) => ({ label: x.title, ask: `${input.text.replace(/[.!]+$/, '')} em ${x.title}` })) }
  if (!b) return { area: AREA, text: 'Não achei um livro em leitura pra anotar isso — qual é?', link: { label: 'Abrir Livros', to: ROUTES.books } }
  const value = Number(m[2])
  const isPage = m[1].startsWith('pag')
  const patch: Partial<Book> = isPage ? { currentPage: value } : { currentChapter: `Capítulo ${value}` }
  let pct: number | undefined
  if (isPage && b.totalPages && b.totalPages > 0) pct = Math.max(0, Math.min(99, Math.round((value / b.totalPages) * 100)))
  if (pct !== undefined) patch.progress = pct
  if (b.status !== 'lendo') patch.status = 'lendo'
  const where = isPage ? `página ${value}${b.totalPages ? ` de ${b.totalPages}` : ''}` : `capítulo ${value}`
  return {
    area: AREA,
    text: `Anotado: ${q(b)} na ${where}${pct !== undefined ? ` (${pct}%)` : ''} ✓`,
    sub: !isPage || b.totalPages ? undefined : 'Se quiser a porcentagem, me diz quantas páginas ele tem.',
    ref: { type: 'book', id: b.id },
    action: { mode: policyFor('update_book'), run: () => runLogged(() => updateUndoable('books', b.id, patch), [eventDraft(now, { kind: 'changed', title: `${b.title}: ${where}`, area: 'leitura', ref: { type: 'book', id: b.id } })]) },
  }
}

// ─── coloca na lista / quero ler ────────────────────────────────────────────

const ADD = /^(?:coloca|colocar|adiciona|adicionar|bota|botar|poe|inclui|incluir|anota)\s+(?:o livro\s+)?(.+?)\s+(?:na|em)\s+(?:minha\s+)?(?:lista|fila)(?:\s+de\s+(?:leitura|livros))?$/
const WANT = /^(?:quero ler|vou querer ler)\s+(?:o livro\s+)?(.+)$/

function titleFromOriginal(original: string, normalizedTitle: string): string {
  const src = original.normalize('NFC')
  const i = norm(src).indexOf(normalizedTitle)
  const raw = i >= 0 ? src.slice(i, i + normalizedTitle.length) : normalizedTitle
  return cap(raw.replace(/^["“”']|["“”']$/g, ''))
}

function add(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  if (/\b(compras|mercado|supermercado|feira)\b/.test(n)) return undefined
  const m = ADD.exec(n) ?? WANT.exec(n)
  if (!m) return undefined
  const title = titleFromOriginal(text, m[1].replace(/^(o|a)\s+/, ''))
  const existing = db.books.find((b) => norm(b.title) === norm(title))
  if (existing) {
    const where = existing.status === 'finalizado' ? 'já está nos seus lidos' : existing.status === 'lendo' ? 'é o que você está lendo agora' : 'já está na sua fila'
    return { area: AREA, text: `${q(existing)} ${where} 🙂`, ref: { type: 'book', id: existing.id } }
  }
  const order = db.books.reduce((mx, b) => Math.max(mx, b.order), -1) + 1
  const id = uid()
  return {
    area: AREA,
    text: `Coloquei “${title}” no Quero ler ✓`,
    sub: 'Se quiser, me diz o autor depois — não vou inventar.',
    action: {
      mode: policyFor('update_book'),
      run: () =>
        runLogged(() => createUndoable('books', { id, title, status: 'quero', progress: 0, quotes: [], order }).undo, [
          eventDraft(now, { kind: 'created', title: `${title} entrou no Quero ler`, area: 'leitura', ref: { type: 'book', id } }),
        ]),
    },
    ref: { type: 'book', id },
  }
}

// ─── tira da fila ───────────────────────────────────────────────────────────

const DROP = /\b(tira|tirar|remove|remover|desisti|larguei|abandonei)\b|\bta chato\b|\bchato\b/

function drop(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!DROP.test(n)) return undefined
  const talksBook = /\b(livros?|fila|lista de leitura)\b/.test(n) || !!matchTitle(db.books, n)
  if (!talksBook) return undefined
  if (/\b(compras|mercado|feira)\b/.test(n)) return undefined
  const b = target(input, db.books.filter((x) => x.status !== 'finalizado'))
  if (b === 'many') return { area: AREA, text: 'Qual livro sai da fila?', options: reading(db).map((x) => ({ label: x.title, ask: `tira ${x.title} da fila` })) }
  if (!b) return { area: AREA, text: 'Qual livro você quer tirar da fila?', options: queue(db).slice(0, 3).map((x) => ({ label: x.title, ask: `tira ${x.title} da fila` })) }
  const next = b.status === 'lendo' ? queue(db).find((x) => x.id !== b.id) : undefined
  const boring = /chato/.test(n)
  return {
    area: AREA,
    text: `Tirei ${q(b)} da fila ✓${boring ? ' Livro chato não merece seu tempo.' : ''}`,
    sub: next ? `Quer começar ${q(next)}?` : undefined,
    options: next ? [{ label: `Começar ${next.title}`, ask: `começa ${next.title}` }] : undefined,
    action: {
      mode: policyFor('update_book'),
      run: () =>
        runLogged(() => {
          const undos: Undo[] = []
          const current = getDB().memory.find((m) => m.key === 'book.current' && m.status !== 'archived' && m.ref?.id === b.id)
          if (current) undos.push(archiveMemory(current.id))
          undos.push(removeUndoable('books', b.id))
          return all(undos)
        }, [eventDraft(now, { kind: 'changed', title: `Tirou ${b.title} da fila${boring ? ' (tava chato)' : ''}`, area: 'leitura' })]),
    },
  }
}

// ─── o que eu leio depois? / começa X ───────────────────────────────────────

const NEXT_Q = /o que (?:eu )?(?:leio|vou ler|ler) (?:depois|agora|em seguida)|qual (?:o )?proximo livro|proximo livro|o que ler depois/

function whatNext(input: HandlerInput): LumosReply | undefined {
  const { db, n } = input
  if (!NEXT_Q.test(n)) return undefined
  const list = queue(db)
  const now = reading(db)
  if (!list.length) {
    return {
      area: AREA,
      text: now.length ? `Sua fila está vazia — por enquanto é ${listJoin(now.map(q))}.` : 'Sua fila está vazia. Me fala um livro e eu coloco no Quero ler.',
      options: [{ label: 'Colocar um livro na lista', prefill: 'coloca  na minha lista' }],
    }
  }
  const first = list[0]
  return {
    area: AREA,
    text: `Da sua fila, o próximo é ${q(first)}${first.author ? ` — ${first.author}` : ''}.`,
    sub: list.length > 1 ? `Depois: ${listJoin(list.slice(1, 3).map((b) => b.title))}.` : undefined,
    provenance: 'suggestion',
    ref: { type: 'book', id: first.id },
    options: [{ label: `Começar ${first.title}`, ask: `começa ${first.title}` }],
    link: { label: 'Abrir Livros', to: ROUTES.books },
  }
}

const START = /^(?:comeca|comecar|comecei|vou comecar|bora comecar|inicia|iniciei)\s+(?:a ler\s+)?(.+)$/

function start(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = START.exec(n)
  if (!m) return undefined
  const pool = db.books.filter((b) => b.status !== 'lendo' && b.status !== 'finalizado')
  const b = /\bo proximo\b/.test(m[1]) ? queue(db)[0] : matchTitle(pool, m[1])
  if (!b) return undefined
  return {
    area: AREA,
    text: `${q(b)} agora é sua leitura atual ✓ Boa leitura 📖`,
    ref: { type: 'book', id: b.id },
    action: { mode: policyFor('update_book'), run: () => runLogged(() => startOps(b, now), [eventDraft(now, { kind: 'changed', title: `Começou ${b.title}`, area: 'leitura', ref: { type: 'book', id: b.id } })]) },
  }
}

// ─── nota do livro ──────────────────────────────────────────────────────────

const NOTE = /^(?:nota|anota|anotacao)\s+(?:sobre\s+|do\s+|no\s+|pro\s+)?(?:o\s+)?livro\s*[:\-—]?\s*/

function note(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  if (!NOTE.test(n)) return undefined
  const body = stripLead(text, NOTE).replace(/^[:\-—]\s*/, '')
  if (!body) return { area: AREA, text: 'O que você quer guardar sobre o livro?', options: [{ label: 'Escrever a nota', prefill: 'nota do livro: ' }] }
  const last = input.ctx.lastRef?.type === 'book' ? db.books.find((b) => b.id === input.ctx.lastRef!.id) : undefined
  const b = last ?? reading(db)[0] ?? [...db.books].filter((x) => x.status === 'finalizado').sort((a, c) => (c.endDate ?? '').localeCompare(a.endDate ?? ''))[0]
  if (!b) return { area: AREA, text: 'Não achei o livro pra guardar a nota — me diz o título?' }
  const notes = b.notes ? `${b.notes}\n\n${body}` : body
  return {
    area: AREA,
    text: `Guardei sua nota em ${q(b)} ✓`,
    lines: [{ text: body, emoji: '✍️' }],
    ref: { type: 'book', id: b.id },
    action: { mode: policyFor('update_book'), run: () => runLogged(() => updateUndoable('books', b.id, { notes }), [eventDraft(now, { kind: 'logged', title: `Nota sobre ${b.title}`, area: 'leitura', ref: { type: 'book', id: b.id } })]) },
  }
}

export const booksHandler: Handler = {
  id: 'books',
  run(input) {
    return note(input) ?? start(input) ?? finish(input) ?? progress(input) ?? add(input) ?? whatNext(input) ?? drop(input)
  },
}
