/**
 * Work mode, in conversation (no five dashboards):
 *   "me atualiza de trabalho"           → one line per active project + Waiting For count
 *   "Fran me respondeu"                 → the Waiting For with Fran is resolved (direct + Desfazer);
 *                                         asks what's next only when it matters
 *   "próximo passo do FashionFinder: …" → the project's next action
 *   "nota no FashionFinder: …"          → logged in the project's changelog
 */
import { ROUTES } from '@/app/routes'
import { activeProjects, isTaskOpen, waitingFor } from '@/data/selectors'
import type { DB, Project, Task } from '@/data/types'
import { diffDays, formatDayMonth } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { normalize } from '@/lib/text'
import { plural, sinceLabel } from '../../agents/common'
import { eventDraft, runLogged, updateUndoable } from '../log'
import { policyFor } from '../policy'
import { cap, matchTitle, norm, stripLead } from '../text'
import type { Handler, HandlerInput, LumosReply, ReplyLine } from '../types'

const AREA = 'trabalho'

// ─── "me atualiza de trabalho" ──────────────────────────────────────────────

const UPDATE = /\b(me atualiza|atualiza(?:cao)?|resumo|status|como (?:esta|ta|anda)(?:m)?)\b.*\b(trabalho|projetos?)\b|\bcomo (?:esta|ta) o trabalho\b/

export function projectLine(db: DB, p: Project, today: string): ReplyLine {
  const open = db.tasks.filter((t) => t.projectId === p.id && isTaskOpen(t) && t.status !== 'waiting')
  const needsMe = open.filter((t) => t.needsMe).length
  const waiting = db.tasks.filter((t) => t.projectId === p.id && t.status === 'waiting').length
  const due = p.nextDelivery?.date ?? p.deadline
  const bits: string[] = []
  if (p.nextDelivery) bits.push(`próxima entrega: ${p.nextDelivery.title}${p.nextDelivery.date ? ` (${formatDayMonth(p.nextDelivery.date)})` : ''}`)
  else if (due && due >= today) bits.push(`prazo ${formatDayMonth(due)} — em ${diffDays(today, due)} dias`)
  if (needsMe) bits.push(`${plural(needsMe, 'coisa precisa', 'coisas precisam')} de você`)
  if (open.length) bits.push(plural(open.length, 'frente aberta', 'frentes abertas'))
  if (waiting) bits.push(`${waiting} esperando alguém`)
  if (p.nextAction) bits.push(`próximo passo: ${p.nextAction}`)
  return { text: `${p.name}`, emoji: p.emoji, sub: bits.length ? cap(bits.join(' · ')) : 'Sem pendências registradas por aqui.' }
}

function update(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!UPDATE.test(n)) return undefined
  const projects = activeProjects(db).filter((p) => p.status === 'ativo').sort((a, b) => a.order - b.order)
  if (!projects.length) return { area: AREA, text: 'Nenhum projeto ativo registrado agora.', link: { label: 'Abrir Trabalho', to: ROUTES.work } }
  const waits = waitingFor(db)
  const needs = db.tasks.filter((t) => isTaskOpen(t) && t.needsMe)
  const soonest = projects
    .map((p) => ({ p, due: p.nextDelivery?.date ?? p.deadline }))
    .filter((x) => x.due && x.due >= now.date)
    .sort((a, b) => a.due!.localeCompare(b.due!))[0]
  const head = needs.length
    ? `${plural(needs.length, 'coisa do trabalho precisa', 'coisas do trabalho precisam')} de você`
    : soonest
      ? `${soonest.p.name} tem o prazo mais perto (${formatDayMonth(soonest.due!)})`
      : 'Nada pegando fogo'
  return {
    area: AREA,
    text: `${plural(projects.length, 'frente ativa', 'frentes ativas')} — ${head}.`,
    lines: projects.map((p) => projectLine(db, p, now.date)),
    sections: waits.length
      ? [{ title: `⏳ Esperando (${waits.length})`, lines: waits.slice(0, 4).map((t) => ({ text: t.title, sub: [t.waiting?.who, sinceLabel(t.waiting?.since, now.date)].filter(Boolean).join(' · ') })) }]
      : undefined,
    options: waits.length ? [{ label: 'O que estou esperando?', ask: 'O que estou esperando?' }] : undefined,
    link: { label: 'Abrir Trabalho', to: ROUTES.work },
  }
}

// ─── "Fran me respondeu" ────────────────────────────────────────────────────

const REPLIED = /^(?:a |o )?(.+?)\s+(?:me\s+|ja\s+)?(?:respondeu|retornou|deu retorno|mandou|devolveu|aprovou)\b(?:\s+(?:sobre|do|da|o|a)\s+(.+))?$/
const ARRIVED = /^(?:chegou|veio)\s+(?:a\s+)?(?:resposta|retorno)\s+d[aoe]\s+(.+?)(?:\s+sobre\s+(.+))?$/

function people(db: DB): { name: string; projectIds: string[] }[] {
  const out = new Map<string, { name: string; projectIds: string[] }>()
  for (const p of db.projects) for (const person of p.people) {
    const k = normalize(person.name)
    const e = out.get(k) ?? { name: person.name, projectIds: [] }
    e.projectIds.push(p.id)
    out.set(k, e)
  }
  for (const t of db.tasks) if (t.status === 'waiting' && t.waiting?.who && !out.has(normalize(t.waiting.who))) out.set(normalize(t.waiting.who), { name: t.waiting.who, projectIds: t.projectId ? [t.projectId] : [] })
  return [...out.values()]
}

function firstWord(s: string): string {
  return normalize(s).split(/\s+/)[0] ?? ''
}

function replied(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = REPLIED.exec(n) ?? ARRIVED.exec(n)
  if (!m) return undefined
  const who = m[1].replace(/^(a|o)\s+/, '').trim()
  if (!who || who.split(' ').length > 3) return undefined
  const about = m[2]
  const matchWho = (name?: string) => !!name && (normalize(name) === who || firstWord(name) === firstWord(who))
  const known = people(db).find((p) => matchWho(p.name))
  let waits = db.tasks.filter((t) => t.status === 'waiting' && matchWho(t.waiting?.who))
  if (!waits.length && !known) return undefined
  if (about && waits.length > 1) {
    const hit = matchTitle(waits, norm(about))
    if (hit) waits = [hit]
  }
  const name = known?.name ?? waits[0]?.waiting?.who ?? cap(who)
  if (!waits.length) {
    const project = known?.projectIds.length === 1 ? db.projects.find((p) => p.id === known.projectIds[0]) : undefined
    return {
      area: AREA,
      text: `Não tinha nada esperando ${name}.${project ? ` Quer que eu anote a resposta no ${project.name}?` : ''}`,
      options: project ? [{ label: `Anotar no ${project.name}`, prefill: `nota no ${project.name}: ` }] : undefined,
    }
  }
  if (waits.length > 1) {
    return {
      area: AREA,
      text: `${name} respondeu sobre o quê?`,
      options: waits.map((t) => ({ label: t.title, ask: `${name} respondeu sobre ${t.title}` })),
    }
  }
  const t = waits[0]
  const project = t.projectId ? db.projects.find((p) => p.id === t.projectId) : undefined
  const ask = project && !project.nextAction
  return {
    area: AREA,
    text: `Anotei: ${name} respondeu sobre “${t.title}” ✓ Saiu do Esperando.`,
    sub: ask ? `Virou algum próximo passo no ${project!.name}?` : undefined,
    ref: { type: 'task', id: t.id },
    options: ask ? [{ label: 'Tem próximo passo', prefill: `próximo passo do ${project!.name}: ` }] : undefined,
    action: {
      mode: policyFor('resolve_waiting'),
      run: () =>
        runLogged(() => updateUndoable('tasks', t.id, { status: 'done', completedAt: nowISO() } as Partial<Task>), [
          eventDraft(now, { kind: 'resolved', title: `${name} respondeu: ${t.title}`, area: 'trabalho', ref: { type: 'task', id: t.id } }),
        ]),
    },
  }
}

// ─── próximo passo / nota no projeto ────────────────────────────────────────

const NEXT = /^(?:o\s+)?proximo passo\s+(?:do|da|no|na|de|pro|pra)\s+(.+?)\s*[:\-—]\s*/
const PNOTE = /^(?:nota|anota|registra)\s+(?:no|na|do|da|pro|pra)\s+(.+?)\s*[:\-—]\s*/

function projectNamed(db: DB, s: string): Project | undefined {
  const n = norm(s)
  return db.projects.find((p) => norm(p.name) === n) ?? db.projects.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name)))
}

function nextStep(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  const m = NEXT.exec(n) ?? PNOTE.exec(n)
  if (!m) return undefined
  const p = projectNamed(db, m[1])
  if (!p) return undefined
  const body = stripLead(text, NEXT.test(n) ? NEXT : PNOTE)
  if (!body) return { area: AREA, text: `Me diz o texto pro ${p.name} 🙂`, options: [{ label: 'Escrever', prefill: input.text.trim() + ' ' }] }
  if (NEXT.test(n)) {
    return {
      area: AREA,
      text: `Próximo passo do ${p.name}: ${body} ✓`,
      action: { mode: policyFor('complete_task'), run: () => runLogged(() => updateUndoable('projects', p.id, { nextAction: body }), [eventDraft(now, { kind: 'changed', title: `${p.name}: próximo passo — ${body}`, area: 'trabalho', ref: { type: 'project', id: p.id } })]) },
    }
  }
  return {
    area: AREA,
    text: `Anotei no ${p.name} ✓`,
    lines: [{ text: body, emoji: '📝' }],
    action: {
      mode: policyFor('complete_task'),
      run: () =>
        runLogged(() => updateUndoable('projects', p.id, { changelog: [...p.changelog, { date: now.date, text: body }] }), [
          eventDraft(now, { kind: 'logged', title: `${p.name}: ${body}`, area: 'trabalho', ref: { type: 'project', id: p.id } }),
        ]),
    },
  }
}

export const workHandler: Handler = {
  id: 'work',
  run(input) {
    return nextStep(input) ?? update(input) ?? replied(input)
  },
}
