import type { DateKey, DB, Project } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { activeProjects, isTaskOpen, projectTasks, waitingFor } from '@/data/selectors'
import { diffDays, toDateKey } from '@/lib/date'
import { routeAction, sheetAction } from '@/features/search/actions'
import { tokenize } from '@/features/search/engine'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { dayLabel, listJoin, plural, sinceLabel, taskItem } from './common'

const WAITING_WORDS = ['esperando', 'aguardando', 'waiting', 'depende*', 'retorno', 'resposta', 'devendo']
const LAGGING_WORDS = ['tras', 'parado', 'parados', 'esquecido*', 'carinho', 'devagar', 'atencao', 'largado', 'abandonado']

/** Last sign of life of a project: its own update or any of its tasks/milestones/meetings. */
export function lastActivity(db: DB, p: Project): DateKey {
  const stamps = [
    p.updatedAt,
    ...db.tasks.filter((t) => t.projectId === p.id).map((t) => t.updatedAt),
    ...db.milestones.filter((m) => m.projectId === p.id).map((m) => m.updatedAt),
    ...db.meetings.filter((m) => m.projectId === p.id).map((m) => m.updatedAt),
  ]
  const latest = stamps.sort().at(-1)!
  return toDateKey(new Date(latest))
}

export interface ProjectCare {
  project: Project
  idleDays: number
  deadlineIn?: number
  hasNextStep: boolean
  reasons: string[]
  weight: number
}

/** Projects that might need some love: long without news, or a deadline coming without a next step. */
export function projectsNeedingCare(db: DB, today: DateKey): ProjectCare[] {
  return activeProjects(db)
    .filter((p) => p.status === 'ativo' || p.status === 'planejando')
    .map((p) => {
      const idleDays = diffDays(lastActivity(db, p), today)
      const deadline = p.nextDelivery?.date ?? p.deadline
      const deadlineIn = deadline ? diffDays(today, deadline) : undefined
      const openTasks = projectTasks(db, p.id).filter((t) => isTaskOpen(t) && t.status !== 'waiting')
      const hasNextStep = !!p.nextAction || openTasks.length > 0
      const reasons: string[] = []
      let weight = 0
      if (idleDays >= 10) {
        reasons.push(`sem novidades há ${idleDays} dias`)
        weight += idleDays
      }
      if (deadlineIn != null && deadlineIn >= 0 && deadlineIn <= 21 && !hasNextStep) {
        reasons.push(`prazo ${deadlineIn === 0 ? 'hoje' : `em ${deadlineIn} dias`} sem próxima ação definida`)
        weight += 30 - deadlineIn
      } else if (!hasNextStep && weight > 0) {
        reasons.push('sem próxima ação definida')
        weight += 5
      }
      return { project: p, idleDays, deadlineIn, hasNextStep, reasons, weight }
    })
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight)
}

function lagging({ db, today }: AgentContext): AnswerBlock[] {
  const care = projectsNeedingCare(db, today)
  if (!care.length)
    return [{ kind: 'headline', text: 'Todos os projetos estão andando ✨ Nenhum parece esquecido agora.' }]
  const [first] = care
  return [
    {
      kind: 'headline',
      text: `${first.project.emoji} ${first.project.name} talvez precise de um carinho 💛 — ${listJoin(first.reasons)}.`,
    },
    {
      kind: 'list',
      title: care.length > 1 ? 'Projetos pedindo um carinho' : 'Projeto pedindo um carinho',
      emoji: '💛',
      items: care.slice(0, 4).map((c) => ({
        id: `project:${c.project.id}`,
        emoji: c.project.emoji,
        title: c.project.name,
        subtitle: c.reasons.join(' · '),
        action: routeAction(ROUTES.project(c.project.id)),
      })),
    },
    { kind: 'text', text: 'Um passo pequeno já destrava: que tal definir a próxima ação de cada um?' },
  ]
}

/** "O que estou esperando da <pessoa>?" — waiting-for whose "who" names that person; else her projects' waiting list. */
function waitingFromPerson({ db, today, q }: AgentContext): AnswerBlock[] {
  const person = q.people[0]
  const first = tokenize(person.name)[0] ?? ''
  const fromPerson = waitingFor(db).filter((t) => tokenize(t.waiting?.who ?? '').includes(first))
  const projects = db.projects.filter((p) => person.projectIds.includes(p.id))
  if (fromPerson.length) {
    const oldest = fromPerson[0]
    return [
      {
        kind: 'headline',
        text: `Esperando ${person.name}: ${plural(fromPerson.length, 'coisa', 'coisas')} — ${oldest.title} (${sinceLabel(oldest.waiting?.since, today)}).`,
      },
      { kind: 'list', title: `Esperando ${person.name}`, emoji: '⏳', items: fromPerson.map((t) => taskItem(db, t, today)) },
      ...(oldest.waiting && diffDays(oldest.waiting.since, today) >= 7
        ? [{ kind: 'text', text: 'Já faz uns dias — uma mensagem curta de follow-up resolve.' } as AnswerBlock]
        : []),
    ]
  }
  const projWaiting = waitingFor(db).filter((t) => !!t.projectId && person.projectIds.includes(t.projectId))
  if (projWaiting.length)
    return [
      {
        kind: 'headline',
        text: `Nada no nome de ${person.name}, mas no ${listJoin(projects.map((p) => p.name))} você espera ${plural(projWaiting.length, 'coisa', 'coisas')}.`,
      },
      { kind: 'list', title: 'Esperando alguém', emoji: '⏳', items: projWaiting.map((t) => taskItem(db, t, today)) },
    ]
  return [{ kind: 'headline', text: `Você não está esperando nada de ${person.name} agora 🙌` }]
}

function waiting(ctx: AgentContext): AnswerBlock[] {
  const { db, today, q } = ctx
  if (q.people.length && !q.projects.length) return waitingFromPerson(ctx)
  const scope = q.projects.map((p) => p.id)
  const inScope = (pid?: string) => !scope.length || (!!pid && scope.includes(pid))
  const tasks = waitingFor(db).filter((t) => inScope(t.projectId))
  const inbox = db.workInbox.filter((i) => i.status === 'waiting' && inScope(i.projectId))
  const name = q.projects.length ? listJoin(q.projects.map((p) => p.name)) : undefined
  const total = tasks.length + inbox.length
  if (!total) return [{ kind: 'headline', text: name ? `Nada pendente de ninguém no ${name} 🙌` : 'Você não está esperando ninguém agora 🙌' }]
  const oldest = tasks[0]
  const items: AnswerItem[] = [
    ...tasks.map((t) => taskItem(db, t, today)),
    ...inbox.map((i) => ({
      id: `inbox:${i.id}`,
      emoji: '📥',
      title: i.subject,
      subtitle: [i.sender, 'work inbox'].filter(Boolean).join(' · '),
      action: sheetAction('workInboxItem', { id: i.id }),
    })),
  ]
  const oldestText = oldest?.waiting ? ` — a mais antiga ${sinceLabel(oldest.waiting.since, today)} (${oldest.title})` : ''
  return [
    { kind: 'headline', text: `${name ? `Do ${name} você` : 'Você'} está esperando ${plural(total, 'coisa', 'coisas')}${oldestText}.` },
    { kind: 'list', title: 'Esperando alguém', emoji: '⏳', items },
    ...(oldest?.waiting && diffDays(oldest.waiting.since, today) >= 7
      ? [{ kind: 'text', text: 'Talvez valha um follow-up rápido na mais antiga — uma mensagem curta resolve.' } as AnswerBlock]
      : []),
  ]
}

function projectStatus({ db, today, q }: AgentContext): AnswerBlock[] {
  const blocks: AnswerBlock[] = []
  const p = q.projects[0]
  const open = projectTasks(db, p.id).filter((t) => isTaskOpen(t))
  const doing = open.filter((t) => t.status !== 'waiting')
  const wait = open.filter((t) => t.status === 'waiting')
  const milestone = db.milestones
    .filter((m) => m.projectId === p.id && !m.done)
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))[0]
  const next = p.nextAction ? `Próximo passo: ${p.nextAction}.` : 'Ainda sem próximo passo definido.'
  blocks.push({ kind: 'headline', text: `${p.emoji} ${p.name}: ${plural(doing.length, 'tarefa aberta', 'tarefas abertas')}, ${plural(wait.length, 'esperando alguém', 'esperando alguém')}. ${next}` })
  if (milestone) blocks.push({ kind: 'stat', label: 'Próximo marco', value: milestone.title, hint: milestone.date ? dayLabel(milestone.date, today) : undefined, action: routeAction(ROUTES.project(p.id)) })
  if (doing.length) blocks.push({ kind: 'list', title: 'Tarefas abertas', emoji: '✓', items: doing.slice(0, 5).map((t) => taskItem(db, t, today)), more: { label: 'Abrir projeto', action: routeAction(ROUTES.project(p.id)) } })
  if (wait.length) blocks.push({ kind: 'list', title: 'Esperando', emoji: '⏳', items: wait.map((t) => taskItem(db, t, today)) })
  return blocks
}

function overview({ db, today }: AgentContext): AnswerBlock[] {
  const needsMe = db.tasks.filter((t) => isTaskOpen(t) && t.needsMe)
  const wait = waitingFor(db).filter((t) => t.context === 'trabalho' || !!t.projectId)
  const fresh = db.workInbox.filter((i) => i.status === 'novo')
  const parts = [
    needsMe.length && plural(needsMe.length, 'coisa precisa de você', 'coisas precisam de você'),
    wait.length && `você espera ${plural(wait.length, 'retorno', 'retornos')}`,
    fresh.length && plural(fresh.length, 'item novo no work inbox', 'itens novos no work inbox'),
  ].filter(Boolean) as string[]
  const blocks: AnswerBlock[] = [{ kind: 'headline', text: parts.length ? `No trabalho: ${listJoin(parts)}.` : 'Trabalho em dia por aqui ✨' }]
  if (needsMe.length) blocks.push({ kind: 'list', title: 'Precisa de você', emoji: '🙋‍♀️', items: needsMe.map((t) => taskItem(db, t, today)) })
  if (wait.length) blocks.push({ kind: 'list', title: 'Esperando alguém', emoji: '⏳', items: wait.map((t) => taskItem(db, t, today)) })
  if (fresh.length)
    blocks.push({
      kind: 'list',
      title: 'Work inbox',
      emoji: '📥',
      items: fresh.map((i) => ({ id: `inbox:${i.id}`, emoji: '📥', title: i.subject, subtitle: i.sender, action: sheetAction('workInboxItem', { id: i.id }) })),
      more: { label: 'Abrir work inbox', action: routeAction(ROUTES.workInbox) },
    })
  return blocks
}

export const WorkAgent: Agent = {
  id: 'work',
  name: 'Trabalho',
  emoji: '💼',
  match(q) {
    if (has(q, ...LAGGING_WORDS) && has(q, 'projeto*', 'trabalho')) return 0.95
    if (has(q, ...WAITING_WORDS)) return q.projects.length || q.people.length ? 0.95 : 0.8
    // "Quando consigo encaixar yoga?" names a modality that is also a word of a project name.
    // "pendente antes da África?" also names the trip's content project: the trip wins.
    if (q.projects.length && q.trips.length && q.projects.every((p) => !!p.tripId && q.trips.some((t) => t.id === p.tripId))) return 0.6
    if (q.projects.length) return q.modalities.length && !has(q, 'projeto*', 'trabalho', 'tarefa*', 'cliente*', 'app') ? 0.6 : 0.85
    if (has(q, 'projeto*', 'trabalho', 'work', 'precisa de mim', 'inbox', 'cliente*', 'entrega*')) return 0.75
    if (has(q, ...LAGGING_WORDS)) return 0.6
    return 0
  },
  answer(ctx) {
    const { q } = ctx
    if (has(q, ...LAGGING_WORDS)) return lagging(ctx)
    if (has(q, ...WAITING_WORDS)) return waiting(ctx)
    if (q.projects.length) return projectStatus(ctx)
    return overview(ctx)
  },
}
