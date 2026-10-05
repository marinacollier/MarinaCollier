/**
 * Brain Dump as Lumos behaviour — she says it, Lumos files it where it belongs (direct + Desfazer):
 *   "preciso lembrar de comprar ração da Luna" → Vida real · Luna · comprar (a task, no invented date)
 *   "ideia de reels correndo na África"        → Creator idea in the series linked to that trip
 *   "preciso comprar protetor"                 → Vida real · compras
 *   "preciso resolver X do FashionFinder"      → task in that project
 *   "anota: …" / a loose thought               → Inbox, to look at later
 * Everything is matched by DATA (pets, trips, projects in the DB), never by hardcoded names.
 * Sentences with a day or time ("me lembra de levar o shaker amanhã às 7h") stay with the day planner.
 */
import { nextOrder } from '@/data/store'
import type { DB, LifeAdminCategory, Project, Task, Trip } from '@/data/types'
import { normalize } from '@/lib/text'
import { uid } from '@/lib/id'
import { parseQuestion } from '../../parse'
import { createUndoable, eventDraft, runLogged } from '../log'
import { policyFor } from '../policy'
import { cap, stripLead } from '../text'
import type { Handler, HandlerInput, LumosReply } from '../types'

const LEAD = /^(?:(?:eu\s+)?(?:preciso|tenho que|tenho de)\s+(?:lembrar\s+(?:de\s+)?)?|(?:me\s+)?lembra(?:r)?\s+(?:de\s+)?|nao\s+(?:posso\s+)?esquecer\s+(?:de\s+)?|lembrete\s*:?\s*)/
const IDEA = /^(?:(?:tive\s+(?:uma\s+)?)?ideia|idea|pensei\s+(?:em|num|numa))\s*(?:de|pra|para|:)?\s*/
const NOTE = /^(?:anota(?:\s+ai)?|guarda(?:\s+isso)?|brain ?dump|pensamento)\s*(?:que|:)?\s*/
const HAS_WHEN = /\b(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|\b\d{1,2}(:\d{2}|h\d{0,2})\b/
const CONTENT = /\b(reels?|video|videos|post|posts|conteudo|tiktok|stories|story|youtube|vlog|carrossel|ugc)\b/
const BUY = /\b(comprar|compra|repor)\b/

const FORMAT: Record<string, string> = { reel: 'Reels', reels: 'Reels', video: 'Vídeo', videos: 'Vídeo', post: 'Post', posts: 'Post', tiktok: 'TikTok', stories: 'Stories', story: 'Stories', youtube: 'YouTube', vlog: 'Vlog', carrossel: 'Carrossel' }

function petIn(db: DB, n: string) {
  return db.pets.find((p) => p.name.trim().length >= 2 && new RegExp(`\\b${normalize(p.name)}\\b`).test(n))
}

/** A creator project for the idea: the series of the trip she mentioned, else the main creator front. */
function creatorProject(db: DB, trip: Trip | undefined): Project | undefined {
  const creators = db.projects.filter((p) => p.kind === 'creator' && p.status !== 'concluido').sort((a, b) => a.order - b.order)
  if (trip) {
    const series = creators.find((p) => p.tripId === trip.id)
    if (series) return series
  }
  return creators.find((p) => !p.tripId) ?? creators[0]
}

/** "correndo" → "corrida" when the project has that category (by shared stem). */
function categoryOf(p: Project | undefined, n: string): string | undefined {
  const cats = p?.categories ?? []
  const words = n.split(/[^a-z0-9]+/).filter((w) => w.length >= 4)
  return cats.find((c) => {
    const stem = normalize(c).slice(0, 4)
    return stem.length >= 4 && words.some((w) => w.startsWith(stem))
  })
}

function capture(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  const isIdea = IDEA.test(n)
  const isNote = NOTE.test(n)
  const isTodo = LEAD.test(n)
  if (!isIdea && !isNote && !isTodo) return undefined
  if (isTodo && HAS_WHEN.test(n)) return undefined
  const lead = isIdea ? IDEA : isNote ? NOTE : LEAD
  const body = stripLead(text, lead).replace(/[.!]+$/, '').trim()
  if (!body) return undefined
  const bn = normalize(body)
  const q = parseQuestion(db, body)
  const trip = q.trips[0]

  // 1. Content idea → Creator.
  if (isIdea && CONTENT.test(bn)) {
    const project = creatorProject(db, trip)
    const fmtWord = CONTENT.exec(bn)?.[1] ?? ''
    const format = FORMAT[fmtWord]
    const title = cap(body.replace(/^(?:de|pra|para)\s+/i, ''))
    const category = categoryOf(project, bn)
    const order = db.contentItems.reduce((m, c) => Math.max(m, c.order), -1) + 1
    const id = uid()
    const where = project ? `${project.emoji} ${project.name}` : 'Creator'
    return {
      area: 'creator',
      text: `Ideia guardada em ${where} ✓`,
      lines: [{ text: title, emoji: '💡', sub: [format, category, trip ? `ligada a ${trip.name}` : undefined].filter(Boolean).join(' · ') || undefined }],
      ref: { type: 'content', id },
      action: {
        mode: policyFor('capture'),
        run: () =>
          runLogged(() => createUndoable('contentItems', { id, title, stage: 'ideia', format, category, projectId: project?.id, links: [], order }).undo, [
            eventDraft(now, { kind: 'created', title: `Ideia: ${title}`, area: 'uso_app', ref: { type: 'content', id } }),
          ]),
      },
    }
  }

  // 2. Loose thought / idea → Inbox.
  if (isIdea || isNote) {
    const id = uid()
    return {
      area: 'inbox',
      text: 'Guardei no Inbox ✓ Fica lá até você querer olhar.',
      lines: [{ text: cap(body), emoji: '💭' }],
      ref: { type: 'brainDump', id },
      action: {
        mode: policyFor('capture'),
        run: () =>
          runLogged(() => createUndoable('brainDump', { id, text: cap(body), status: 'inbox', group: trip?.name }).undo, [eventDraft(now, { kind: 'created', title: `Inbox: ${cap(body)}`, area: 'uso_app', ref: { type: 'brainDump', id } })]),
      },
    }
  }

  // 3. Something to do → the right place.
  const pet = petIn(db, bn)
  const project = q.projects[0]
  const buy = BUY.test(bn)
  const title = cap(body)
  const base: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = { title, status: 'todo', bucket: 'semana', order: nextOrder(db.tasks) }
  let task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>
  let where: string
  if (pet) {
    task = { ...base, context: 'vida_real', lifeAdminCategory: 'luna' satisfies LifeAdminCategory, adminKind: buy ? 'comprar' : 'resolver', area: 'pessoal' }
    where = `Vida real · ${pet.name} · ${buy ? 'comprar' : 'resolver'}`
  } else if (project) {
    task = { ...base, context: project.kind === 'creator' ? 'conteudo' : 'trabalho', projectId: project.id, area: 'profissional' }
    where = `${project.emoji} ${project.name}`
  } else if (trip) {
    task = { ...base, context: 'viagem', tripId: trip.id, area: 'viagem' }
    where = `${trip.flag} ${trip.name}`
  } else if (buy) {
    task = { ...base, context: 'vida_real', lifeAdminCategory: 'compras', adminKind: 'comprar', area: 'pessoal' }
    where = 'Vida real · compras'
  } else {
    task = { ...base, context: 'geral' }
    where = 'suas tarefas da semana'
  }
  const id = uid()
  return {
    area: 'anotado',
    text: `Anotado em ${where} ✓`,
    sub: 'Sem data — quando quiser um dia, é só dizer.',
    lines: [{ text: title, emoji: pet ? '🐾' : buy ? '🛒' : '✓' }],
    ref: { type: 'task', id },
    action: {
      mode: policyFor('capture'),
      run: () => runLogged(() => createUndoable('tasks', { ...task, id }).undo, [eventDraft(now, { kind: 'created', title: `Anotou: ${title}`, area: pet ? 'luna' : project ? 'trabalho' : trip ? 'viagens' : 'casa', ref: { type: 'task', id } })]),
    },
  }
}

export const captureHandler: Handler = { id: 'capture', run: capture }
