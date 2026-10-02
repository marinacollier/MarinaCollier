import type { PetTask } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { isTaskOpen, petTasksDue } from '@/data/selectors'
import { addDays } from '@/lib/date'
import { routeAction, sheetAction } from '@/features/search/actions'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { dayLabel, listJoin, plural, taskItem } from './common'

const LUNA_WORDS = ['luna', 'pet', 'cachorr*', 'banho', 'veterinari*', 'vet', 'vacina*', 'racao', 'passeio', 'creche']
const ADMIN_WORDS = ['casa', 'carro', 'documento*', 'cnh', 'consulta*', 'burocracia*', 'vida real', 'conserto', 'manutencao', 'assinatura*', 'boleto*', 'renovar']

function lunaBlocks({ db, today }: AgentContext): { blocks: AnswerBlock[]; summary?: string } {
  const pet = db.pets[0]
  if (!pet) return { blocks: [] }
  const doneToday = (p: PetTask) => db.occurrences.some((o) => o.parentType === 'petTask' && o.parentId === p.id && o.date === today)
  const due = petTasksDue(db, today).filter((p) => !doneToday(p))
  const soon = db.petTasks
    .filter((p) => p.active && !p.recurrence && p.dueDate && p.dueDate > today && p.dueDate <= addDays(today, 14))
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
  const tasks = db.tasks.filter((t) => t.context === 'luna' && isTaskOpen(t))
  const items: AnswerItem[] = [
    ...due.map((p) => ({ id: `petTask:${p.id}`, emoji: '🐾', title: p.title, subtitle: 'hoje', action: sheetAction('petTask', { id: p.id }) })),
    ...soon.map((p) => ({ id: `petTask:${p.id}`, emoji: '🗓️', title: p.title, subtitle: dayLabel(p.dueDate!, today), action: sheetAction('petTask', { id: p.id }) })),
    ...tasks.map((t) => taskItem(db, t, today)),
  ]
  if (!items.length) return { blocks: [], summary: `${pet.name} está com tudo em dia 🐾` }
  return {
    summary: due.length ? `${pet.name}: ${listJoin(due.map((p) => p.title.toLowerCase()))} hoje` : `${pet.name}: ${plural(items.length, 'coisinha', 'coisinhas')} pros próximos dias`,
    blocks: [{ kind: 'list', title: pet.name, emoji: '🐾', items, more: { label: `Abrir ${pet.name}`, action: routeAction(ROUTES.luna) } }],
  }
}

function adminBlocks({ db, today }: AgentContext): { blocks: AnswerBlock[]; summary?: string } {
  const open = db.tasks
    .filter((t) => t.context === 'vida_real' && isTaskOpen(t))
    .sort((a, b) => (a.dueDate ?? a.date ?? '9999').localeCompare(b.dueDate ?? b.date ?? '9999'))
  if (!open.length) return { blocks: [], summary: 'Vida real em dia ✨' }
  const waiting = open.filter((t) => t.status === 'waiting')
  const todo = open.filter((t) => t.status !== 'waiting')
  const blocks: AnswerBlock[] = []
  if (todo.length) blocks.push({ kind: 'list', title: 'Vida real', emoji: '🏡', items: todo.slice(0, 6).map((t) => taskItem(db, t, today)), more: { label: 'Abrir Vida real', action: routeAction(ROUTES.lifeAdmin) } })
  if (waiting.length) blocks.push({ kind: 'list', title: 'Esperando alguém', emoji: '⏳', items: waiting.map((t) => taskItem(db, t, today)) })
  return { blocks, summary: `vida real: ${plural(todo.length, 'coisa pra resolver', 'coisas pra resolver')}${waiting.length ? ` e ${waiting.length} esperando` : ''}` }
}

export const LifeAdminAgent: Agent = {
  id: 'lifeAdmin',
  name: 'Vida real',
  emoji: '🏡',
  match(q) {
    if (has(q, ...LUNA_WORDS)) return 0.9
    if (has(q, ...ADMIN_WORDS)) return 0.8
    return 0
  },
  answer(ctx) {
    const luna = has(ctx.q, ...LUNA_WORDS)
    const admin = has(ctx.q, ...ADMIN_WORDS) || !luna
    const parts = [luna ? lunaBlocks(ctx) : undefined, admin ? adminBlocks(ctx) : undefined].filter(Boolean) as ReturnType<typeof lunaBlocks>[]
    const summaries = parts.map((p) => p.summary).filter(Boolean) as string[]
    const headline = summaries.length ? summaries.map((s, i) => (i === 0 ? s[0].toUpperCase() + s.slice(1) : s)).join('; ') + '.' : 'Tudo em dia por aqui ✨'
    return [{ kind: 'headline', text: headline.replace(/([✨🐾])\.$/u, '$1') }, ...parts.flatMap((p) => p.blocks)]
  },
}
