import type { Book, StudyItem } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { readingNow } from '@/data/selectors'
import { routeAction, sheetAction } from '@/features/search/actions'
import { findTrack } from '@/features/search/engine'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { plural } from './common'

const BOOK_WORDS = ['livro*', 'ler', 'leitura*', 'lendo', 'li']
const QUEUE_WORDS = ['fila', 'proximo*', 'quero', 'lista', 'depois', 'coloquei', 'separei', 'vou ler']
const STUDY_WORDS = ['estud*', 'curso*', 'aprender', 'aprendendo', 'trilha*', 'aula*', 'certifica*']

function bookRow(b: Book): AnswerItem {
  return {
    id: `book:${b.id}`,
    emoji: b.status === 'lendo' ? '📖' : b.status === 'proximo' ? '⏭️' : '🔖',
    title: b.title,
    subtitle: [b.author, b.status === 'lendo' && b.progress ? `${b.progress}%` : undefined].filter(Boolean).join(' · ') || undefined,
    action: routeAction(ROUTES.book(b.id)),
  }
}

function books({ db, q }: AgentContext): AnswerBlock[] {
  const byOrder = (a: Book, b: Book) => a.order - b.order
  const next = db.books.filter((b) => b.status === 'proximo').sort(byOrder)
  const want = db.books.filter((b) => b.status === 'quero').sort(byOrder)
  const reading = readingNow(db)
  const queue = has(q, ...QUEUE_WORDS)
  const blocks: AnswerBlock[] = []
  if (queue) {
    if (!next.length && !want.length)
      return [
        { kind: 'headline', text: 'A fila está vazia — que tal anotar o próximo livro? 📚' },
        { kind: 'list', title: 'Livros', emoji: '📚', items: [{ id: 'add', emoji: '➕', title: 'Adicionar livro', action: sheetAction('book', { status: 'quero' }) }] },
      ]
    const first = next[0] ?? want[0]
    blocks.push({
      kind: 'headline',
      text: `Na fila: ${plural(next.length, 'próximo', 'próximos')} e ${plural(want.length, 'que você quer ler', 'que você quer ler')}. O próximo da vez é “${first.title}”.`,
    })
    if (next.length) blocks.push({ kind: 'list', title: 'Próximos', emoji: '⏭️', items: next.map(bookRow) })
    if (want.length) blocks.push({ kind: 'list', title: 'Quero ler', emoji: '🔖', items: want.map(bookRow), more: { label: 'Abrir Livros', action: routeAction(ROUTES.books) } })
    return blocks
  }
  blocks.push({
    kind: 'headline',
    text: reading.length ? `Você está lendo ${reading.map((b) => `“${b.title}”`).join(' e ')}${next[0] ? ` — e o próximo é “${next[0].title}”` : ''}.` : 'Nenhum livro em leitura agora. Quer puxar um da fila?',
  })
  if (reading.length) blocks.push({ kind: 'list', title: 'Lendo agora', emoji: '📖', items: reading.map(bookRow) })
  if (next.length) blocks.push({ kind: 'list', title: 'Próximos', emoji: '⏭️', items: next.map(bookRow), more: { label: 'Abrir Livros', action: routeAction(ROUTES.books) } })
  return blocks
}

function studyRow(s: StudyItem): AnswerItem {
  return {
    id: `study:${s.id}`,
    emoji: s.status === 'estudando' ? '📗' : '⏭️',
    title: s.title,
    subtitle: [s.status === 'estudando' ? 'estudando' : s.status === 'proximo' ? 'próximo' : s.status, s.nextContent].filter(Boolean).join(' · '),
    action: sheetAction('study', { id: s.id }),
  }
}

function study({ db, q }: AgentContext): AnswerBlock[] {
  const track = q.tokens.map((t) => findTrack(db, [t])).find(Boolean)
  const scope = (s: StudyItem) => !track || s.trackId === track.id
  const now = db.studyItems.filter((s) => s.status === 'estudando' && scope(s)).sort((a, b) => a.order - b.order)
  const next = db.studyItems.filter((s) => s.status === 'proximo' && scope(s)).sort((a, b) => a.order - b.order)
  const where = track ? ` em ${track.emoji} ${track.name}` : ''
  const blocks: AnswerBlock[] = [
    {
      kind: 'headline',
      text: now.length
        ? `${where ? `Em ${track!.name}` : 'Agora'} você está estudando ${now.map((s) => `“${s.title}”`).join(' e ')}${next[0] ? `; o próximo é “${next[0].title}”` : ''}.`
        : `Nada em andamento${where} agora.${next[0] ? ` O próximo da fila é “${next[0].title}”.` : ''}`,
    },
  ]
  if (now.length) blocks.push({ kind: 'list', title: 'Estudando', emoji: '📗', items: now.map(studyRow) })
  if (next.length) blocks.push({ kind: 'list', title: 'Próximos', emoji: '⏭️', items: next.map(studyRow), more: { label: 'Abrir Estudos', action: routeAction(ROUTES.study) } })
  return blocks
}

export const LearningAgent: Agent = {
  id: 'learning',
  name: 'Estudos e livros',
  emoji: '📚',
  match(q) {
    if (has(q, ...BOOK_WORDS)) return has(q, ...QUEUE_WORDS) ? 0.95 : 0.85
    if (has(q, ...STUDY_WORDS)) return 0.85
    return 0
  },
  answer(ctx) {
    if (has(ctx.q, ...BOOK_WORDS)) return books(ctx)
    return study(ctx)
  },
}
