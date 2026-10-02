/**
 * Brain dump triage: turn a captured thought into a real entity.
 * `buildConversion` is pure (db in, payload out); `applyConversion` writes it.
 */
import { actions, getDB } from '@/data/store'
import type {
  BrainDumpItem,
  BrainDumpTarget,
  CollectionKey,
  DateKey,
  DB,
  EntityType,
  ID,
  NewItem,
} from '@/data/types'
import { addDays, startOfWeek } from '@/lib/date'

export interface TargetMeta {
  target: BrainDumpTarget
  label: string
  emoji: string
  /** Toast after conversion. */
  done: string
  /** Needs an extra answer before converting. */
  needs?: 'trip' | 'date' | 'who'
}

export const TARGETS: TargetMeta[] = [
  { target: 'task', label: 'Tarefa', emoji: '✓', done: 'Virou tarefa ✓' },
  { target: 'idea', label: 'Ideia', emoji: '💡', done: 'Virou ideia ✓' },
  { target: 'reminder', label: 'Lembrete', emoji: '⏰', done: 'Virou lembrete ✓', needs: 'date' },
  { target: 'waiting', label: 'Esperando', emoji: '⏳', done: 'Foi pro “esperando” ✓', needs: 'who' },
  { target: 'lifeAdmin', label: 'Vida real', emoji: '🏡', done: 'Foi pra vida real ✓' },
  { target: 'purchase', label: 'Compra', emoji: '🛍️', done: 'Foi pra lista de compras ✓' },
  { target: 'trip', label: 'Viagem', emoji: '✈️', done: 'Foi pra viagem ✓', needs: 'trip' },
  { target: 'project', label: 'Projeto', emoji: '🗂️', done: 'Virou projeto ✓' },
  { target: 'study', label: 'Estudo', emoji: '📚', done: 'Foi pros estudos ✓' },
  { target: 'book', label: 'Livro', emoji: '📖', done: 'Foi pra lista de livros ✓' },
  { target: 'content', label: 'Conteúdo', emoji: '🎬', done: 'Virou ideia de conteúdo ✓' },
  { target: 'goal', label: 'Meta', emoji: '🎯', done: 'Virou meta da semana ✓' },
]

export function targetMeta(t: BrainDumpTarget): TargetMeta {
  return TARGETS.find((x) => x.target === t)!
}

export interface ConversionOptions {
  today: DateKey
  /** Trip to attach a TripItem to. Without it, a new Trip is created. */
  tripId?: ID
  /** Reminder date (default: tomorrow). */
  date?: DateKey
  /** Waiting for whom. */
  who?: string
}

export interface Conversion<K extends CollectionKey = CollectionKey> {
  key: K
  type: EntityType
  data: NewItem<K>
}

/** First line becomes the title (max 140 chars); the rest goes to notes. */
export function splitTitle(text: string): { title: string; rest?: string } {
  const clean = text.trim()
  const [first, ...more] = clean.split(/\r?\n/)
  let title = first.trim()
  let rest = more.join('\n').trim()
  if (title.length > 140) {
    rest = [title.slice(140), rest].filter(Boolean).join('\n')
    title = title.slice(0, 139).trimEnd() + '…'
  }
  return { title: title || 'Sem título', rest: rest || undefined }
}

function nextOrderOf(list: { order: number }[]): number {
  return list.reduce((m, it) => Math.max(m, it.order), -1) + 1
}

function conv<K extends CollectionKey>(key: K, type: EntityType, data: NewItem<K>): Conversion {
  return { key, type, data } as unknown as Conversion
}

export function buildConversion(db: DB, item: BrainDumpItem, target: BrainDumpTarget, opts: ConversionOptions): Conversion {
  const { title, rest } = splitTitle(item.text)
  const origin = { type: 'brainDump' as const, id: item.id }
  const taskOrder = nextOrderOf(db.tasks)
  switch (target) {
    case 'task':
      return conv('tasks', 'task', { title, notes: rest, status: 'todo', bucket: 'semana', order: taskOrder, origin })
    case 'reminder':
      return conv('tasks', 'task', {
        title,
        notes: rest,
        status: 'todo',
        date: opts.date ?? addDays(opts.today, 1),
        order: taskOrder,
        origin,
      })
    case 'waiting':
      return conv('tasks', 'task', {
        title,
        notes: rest,
        status: 'waiting',
        waiting: { who: opts.who?.trim() || 'alguém', since: opts.today },
        order: taskOrder,
        origin,
      })
    case 'lifeAdmin':
      return conv('tasks', 'task', {
        title,
        notes: rest,
        status: 'todo',
        bucket: 'semana',
        context: 'vida_real',
        lifeAdminCategory: 'outros',
        order: taskOrder,
        origin,
      })
    case 'idea':
      return conv('notes', 'note', { title: rest ? title : undefined, body: rest ?? title, kind: 'ideia', tags: [], pinned: false })
    case 'purchase':
      return conv('expenses', 'expense', {
        title,
        notes: rest,
        amountCents: 0,
        categoryId: 'cat-compras',
        status: 'planned_purchase',
        origin: 'manual',
      })
    case 'trip':
      if (opts.tripId) {
        return conv('tripItems', 'tripItem', {
          tripId: opts.tripId,
          section: 'quero_ir',
          title,
          notes: rest,
          status: 'a_confirmar',
          order: nextOrderOf(db.tripItems.filter((t) => t.tripId === opts.tripId)),
        })
      }
      return conv('trips', 'trip', {
        name: title,
        flag: '✈️',
        notes: rest,
        datesConfirmed: false,
        interests: [],
        tone: 'ocean',
        links: [],
        status: 'sonhando',
        order: nextOrderOf(db.trips),
      })
    case 'project':
      return conv('projects', 'project', {
        name: title,
        description: rest,
        emoji: '✨',
        tone: 'sage',
        status: 'planejando',
        priority: 'media',
        links: [],
        files: [],
        people: [],
        decisions: [],
        changelog: [],
        kind: 'default',
        order: nextOrderOf(db.projects),
      })
    case 'study':
      return conv('studyItems', 'studyItem', { title, notes: rest, kind: 'tema', status: 'backlog', progress: 0, order: nextOrderOf(db.studyItems) })
    case 'book':
      return conv('books', 'book', { title, notes: rest, status: 'quero', progress: 0, quotes: [], order: nextOrderOf(db.books) })
    case 'content':
      return conv('contentItems', 'content', { title, script: rest, stage: 'ideia', links: [], order: nextOrderOf(db.contentItems) })
    case 'goal':
      return conv('goals', 'goal', {
        level: 'semana',
        title,
        notes: rest,
        category: 'pessoal',
        period: startOfWeek(opts.today),
        big: false,
        status: 'ativa',
        order: nextOrderOf(db.goals.filter((g) => g.level === 'semana')),
      })
  }
}

/** Creates the entity and marks the brain dump item as processed. Returns the new entity id. */
export function applyConversion(itemId: ID, target: BrainDumpTarget, opts: ConversionOptions): { id: ID; type: EntityType } | undefined {
  const db = getDB()
  const item = db.brainDump.find((b) => b.id === itemId)
  if (!item) return undefined
  const c = buildConversion(db, item, target, opts)
  const created = actions.create(c.key, c.data as never) as { id: ID }
  actions.update('brainDump', item.id, { status: 'processado', convertedTo: { type: c.type, id: created.id } })
  return { id: created.id, type: c.type }
}

/** Splits pasted text into items: one per non-empty line, list bullets stripped. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–·]|\d+[.)]|\[[ xX]?\])\s+/, '').trim())
    .filter(Boolean)
}

export const CONVERTED_LABEL: Partial<Record<EntityType, string>> = {
  task: 'virou tarefa',
  note: 'virou ideia',
  expense: 'virou compra',
  tripItem: 'foi pra viagem',
  trip: 'virou viagem',
  project: 'virou projeto',
  studyItem: 'foi pros estudos',
  book: 'virou livro',
  content: 'virou conteúdo',
  goal: 'virou meta',
}

/** Capture first, organize later. Nothing to choose, nothing to categorize. Returns how many items were saved. */
export function captureText(text: string, split: boolean): number {
  const items = split ? splitLines(text) : [text.trim()].filter(Boolean)
  if (!items.length) return 0
  actions.createMany(
    'brainDump',
    items.map((t) => ({ text: t, status: 'inbox' as const })),
  )
  return items.length
}
