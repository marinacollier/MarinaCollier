/**
 * Universal search. Pure function of (db, query, today) — no React, no store.
 *
 * - Accent-insensitive (`normalize`), multi-token AND ("cape town" needs both words somewhere).
 * - Ranking: title/name match > other fields; whole word > word prefix > substring;
 *   things happening soon (or just happened) get a small boost; done/archived things sink.
 * - Smart intents: "gastos <mês|semana|viagem|categoria|viagem>" → money summary,
 *   "livros" → books by status, "estudo <trilha>" → that track's study items.
 */
import type { Book, BookStatus, DateKey, DB, Expense, ID, PlanType, Recurrence, StudyItem, StudyStatus } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { categoryOf, modalityOf, sumCents } from '@/data/selectors'
import { PERIOD_LABEL } from '@/data/planning'
import {
  addDays,
  diffDays,
  endOfMonth,
  endOfWeek,
  formatShortDate,
  MONTHS,
  relativeDay,
  startOfMonth,
  startOfWeek,
  WEEKDAY_LONG,
} from '@/lib/date'
import { formatBRL } from '@/lib/money'
import { normalize } from '@/lib/text'
import { routeAction, sheetAction, type ResultAction } from './actions'

// ─── Public types ───────────────────────────────────────────────────────────

export type SearchDomain =
  | 'task'
  | 'project'
  | 'milestone'
  | 'win'
  | 'workInbox'
  | 'meeting'
  | 'note'
  | 'brainDump'
  | 'study'
  | 'book'
  | 'trip'
  | 'tripItem'
  | 'content'
  | 'partnership'
  | 'expense'
  | 'workout'
  | 'event'
  | 'luna'
  | 'goal'
  | 'routine'
  | 'planning'
  | 'nutrition'

export interface SearchResult {
  /** Unique across domains: `${domain}:${entityId}`. */
  key: string
  domain: SearchDomain
  entityId: ID
  title: string
  subtitle?: string
  emoji?: string
  score: number
  date?: DateKey
  action: ResultAction
}

export interface SearchGroup {
  key: string
  domain: SearchDomain
  label: string
  emoji: string
  results: SearchResult[]
}

export interface MoneySummary {
  title: string
  periodLabel: string
  totalCents: number
  count: number
  topCategories: { name: string; emoji: string; cents: number }[]
  action: ResultAction
}

export interface SearchResponse {
  query: string
  intent?: 'money' | 'books' | 'study'
  summary?: MoneySummary
  groups: SearchGroup[]
  total: number
}

export const DOMAIN_META: Record<SearchDomain, { label: string; emoji: string }> = {
  task: { label: 'Tarefas', emoji: '✓' },
  project: { label: 'Projetos', emoji: '💼' },
  milestone: { label: 'Marcos de projeto', emoji: '🏁' },
  win: { label: 'Wins', emoji: '✨' },
  workInbox: { label: 'Work inbox', emoji: '📥' },
  meeting: { label: 'Reuniões', emoji: '🗣️' },
  note: { label: 'Notas e ideias', emoji: '📝' },
  brainDump: { label: 'Brain dump', emoji: '🧠' },
  study: { label: 'Estudos', emoji: '📚' },
  book: { label: 'Livros', emoji: '📖' },
  trip: { label: 'Viagens', emoji: '✈️' },
  tripItem: { label: 'Itens de viagem', emoji: '🧳' },
  content: { label: 'Conteúdo', emoji: '🎬' },
  partnership: { label: 'Parcerias', emoji: '🤝' },
  expense: { label: 'Gastos', emoji: '💸' },
  workout: { label: 'Treinos', emoji: '🏃‍♀️' },
  event: { label: 'Agenda', emoji: '📅' },
  luna: { label: 'Luna', emoji: '🐾' },
  goal: { label: 'Metas', emoji: '🎯' },
  routine: { label: 'Rotinas', emoji: '☀️' },
  planning: { label: 'Planejamento', emoji: '🧭' },
  nutrition: { label: 'Nutrição', emoji: '🥗' },
}

/** Words that make a workout findable by the way Marina talks about it. */
export const MODALITY_SYNONYMS: Record<string, string[]> = {
  bike: ['bike', 'bicicleta', 'pedal', 'ciclismo'],
  gravel: ['bike', 'bicicleta', 'pedal', 'ciclismo', 'gravel'],
  speed: ['bike', 'bicicleta', 'pedal', 'ciclismo', 'speed', 'road'],
  corrida: ['corrida', 'correr', 'run', 'running'],
  trail: ['corrida', 'correr', 'run', 'trail', 'trilha'],
  natacao: ['natacao', 'nadar', 'piscina', 'swim'],
  musculacao: ['musculacao', 'academia', 'forca', 'gym', 'peso'],
  yoga: ['yoga'],
  mobilidade: ['mobilidade', 'alongamento'],
  surf: ['surf', 'onda', 'mar'],
  recuperacao: ['recuperacao', 'descanso ativo'],
}

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  lendo: 'Lendo agora',
  proximo: 'Próximos da fila',
  quero: 'Quero ler',
  finalizado: 'Lidos',
}
const BOOK_STATUS_EMOJI: Record<BookStatus, string> = { lendo: '📖', proximo: '⏭️', quero: '🔖', finalizado: '✅' }

export const STUDY_STATUS_LABEL: Record<StudyStatus, string> = {
  estudando: 'estudando',
  proximo: 'próximo',
  backlog: 'backlog',
  pausado: 'pausado',
  finalizado: 'finalizado',
}

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas', 'pra', 'para', 'com', 'um', 'uma'])

/**
 * Common airport codes → how places are written in Marina's data (and back). Generic geography,
 * not personal data: "JNB" finds "Johannesburg", "CPT" finds "Cape Town", "joanesburgo" finds "JNB".
 */
export const PLACE_ALIASES: Record<string, string[]> = {
  jnb: ['johannesburg', 'joanesburgo', 'or tambo'],
  cpt: ['cape town', 'cidade do cabo'],
  dur: ['durban'],
  gru: ['guarulhos', 'sao paulo'],
  cgh: ['congonhas', 'sao paulo'],
  vcp: ['viracopos', 'campinas'],
  gig: ['galeao', 'rio de janeiro'],
  sdu: ['santos dumont', 'rio de janeiro'],
  rec: ['recife'],
  ssa: ['salvador'],
  ios: ['ilheus', 'itacare'],
  fln: ['florianopolis'],
  bsb: ['brasilia'],
  cnf: ['confins', 'belo horizonte'],
  poa: ['porto alegre'],
  cwb: ['curitiba'],
  lis: ['lisboa', 'lisbon'],
  opo: ['porto'],
  mad: ['madrid'],
  bcn: ['barcelona'],
  cdg: ['paris'],
  lhr: ['londres', 'london', 'heathrow'],
  jfk: ['nova york', 'new york'],
  mia: ['miami'],
  eze: ['buenos aires'],
  scl: ['santiago'],
  dxb: ['dubai'],
  doh: ['doha'],
}

/** Other ways of writing the same query token (airport code ↔ city). */
export function tokenAliases(token: string): string[] {
  const direct = PLACE_ALIASES[token]
  if (direct) return direct
  const out: string[] = []
  if (token.length < 4) return out
  for (const [code, names] of Object.entries(PLACE_ALIASES)) {
    if (names.includes(token)) out.push(code, ...names.filter((n) => n !== token))
  }
  return out
}

// ─── Tokenizing / matching ──────────────────────────────────────────────────

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Query tokens without filler words (unless the query is only filler). */
export function queryTokens(query: string): string[] {
  const all = tokenize(query)
  const meaningful = all.filter((t) => !STOPWORDS.has(t))
  return meaningful.length ? meaningful : all
}

interface Field {
  norm: string
  words: string[]
}

function field(...parts: (string | undefined | null | false)[]): Field {
  const norm = normalize(parts.filter(Boolean).join(' · '))
  return { norm, words: norm.split(/[^a-z0-9]+/).filter(Boolean) }
}

/** 0 when the token isn't in the field. Short tokens (≤2) only match word starts ("ia" ≠ "dia"). */
function tokenScore(f: Field, token: string, primary: boolean): number {
  if (f.words.includes(token)) return primary ? 12 : 5
  if (f.words.some((w) => w.startsWith(token))) return primary ? 10 : 4
  if (token.length > 2 && f.norm.includes(token)) return primary ? 6 : 2
  return 0
}

/** Like tokenScore, but also tries the token's aliases (airport codes, city names). Alias hits score a bit lower. */
function tokenScoreAliased(f: Field, token: string, primary: boolean): number {
  let best = tokenScore(f, token, primary)
  if (best >= (primary ? 12 : 5)) return best
  for (const alias of tokenAliases(token)) {
    const s = alias.includes(' ')
      ? ` ${f.words.join(' ')} `.includes(` ${alias} `)
        ? primary
          ? 12
          : 5
        : 0
      : f.words.includes(alias)
        ? primary
          ? 12
          : 5
        : 0
    best = Math.max(best, s ? s - 1 : 0)
  }
  return best
}

// ─── Documents ──────────────────────────────────────────────────────────────

interface Doc {
  domain: SearchDomain
  id: ID
  title: string
  subtitle?: string
  emoji?: string
  primary: Field
  secondary: Field
  date?: DateKey
  inactive?: boolean
  action: ResultAction
}

const TASK_CONTEXT_WORDS: Record<string, string> = {
  trabalho: 'trabalho work',
  vida_real: 'vida real',
  luna: 'luna pet',
  viagem: 'viagem',
  conteudo: 'conteudo ugc',
  estudo: 'estudo',
  geral: '',
}

const TRIP_SECTION_LABEL: Record<string, string> = {
  voo: 'voo',
  hospedagem: 'hospedagem',
  transporte: 'transporte',
  reserva: 'reserva',
  roteiro: 'roteiro',
  quero_ir: 'quero ir',
  comida: 'comida',
  esporte: 'esporte',
  mala: 'mala',
  comprar: 'comprar',
  documento: 'documento',
  antes_de_ir: 'antes de ir',
}

const TRIP_ITEM_STATUS: Record<string, string> = {
  a_confirmar: 'a confirmar',
  a_fazer: 'a fazer',
  confirmado: 'confirmado',
  feito: 'feito',
  cancelado: 'cancelado',
}

const CONTENT_STAGE: Record<string, string> = {
  ideia: 'ideia',
  gravar: 'para gravar',
  editando: 'editando',
  pronto: 'pronto',
  publicado: 'publicado',
}

const PLAN_LABEL: Record<PlanType, string> = { fixo: 'fixo', base: 'base', flexivel: 'flexível', a_confirmar: 'a confirmar' }

const NUTRITION_SOURCE: Record<string, string> = { nutricionista: 'nutricionista', usuaria: 'minha', outro_profissional: 'outro profissional' }

/** Plain words for training-type tags ("long-ride" → "pedal bike longo"), so "pedal" finds its strategy. */
const LINK_WORDS: Record<string, string> = {
  ride: 'pedal bike ciclismo',
  pedal: 'pedal bike ciclismo',
  run: 'corrida correr',
  corrida: 'corrida correr',
  long: 'longo longa',
  longo: 'longo longa',
  leg: 'perna pernas',
  swim: 'natacao',
  forca: 'forca musculacao',
}
function linkedTypeWords(tag: string): string {
  return tokenize(tag)
    .map((w) => LINK_WORDS[w] ?? '')
    .join(' ')
}

function recurrenceWords(r: Recurrence): string {
  if (r.kind === 'daily') return 'todo dia'
  if (r.kind === 'weekly') return r.weekdays.map((d) => WEEKDAY_LONG[d]).join(' e ')
  if (r.kind === 'monthly') return r.dayOfMonth === 'last' ? 'último dia do mês' : `todo dia ${r.dayOfMonth}`
  return `a cada ${r.days} dias`
}

function when(date: DateKey | undefined, today: DateKey): string | undefined {
  if (!date) return undefined
  return Math.abs(diffDays(today, date)) < 7 ? relativeDay(date, today) : formatShortDate(date)
}

function join(...parts: (string | undefined | false | null)[]): string | undefined {
  const s = parts.filter(Boolean).join(' · ')
  return s || undefined
}

function buildDocs(db: DB, today: DateKey): Doc[] {
  const docs: Doc[] = []
  const projectName = new Map(db.projects.map((p) => [p.id, p.name]))
  const trips = new Map(db.trips.map((t) => [t.id, t]))
  const tracks = new Map(db.studyTracks.map((t) => [t.id, t]))
  const pets = new Map(db.pets.map((p) => [p.id, p.name]))
  const routines = new Map(db.routines.map((r) => [r.id, r.name]))

  for (const t of db.tasks) {
    if (t.status === 'archived') continue
    const trip = t.tripId ? trips.get(t.tripId) : undefined
    const proj = t.projectId ? projectName.get(t.projectId) : undefined
    docs.push({
      domain: 'task',
      id: t.id,
      title: t.title,
      emoji: t.status === 'waiting' ? '⏳' : t.status === 'done' ? '✅' : t.context === 'luna' ? '🐾' : '✓',
      subtitle: join(
        t.status === 'waiting' ? `esperando ${t.waiting?.who ?? 'alguém'}` : t.status === 'done' ? 'feito' : t.status === 'review' ? 'a confirmar' : undefined,
        when(t.date ?? t.dueDate, today),
        proj,
        trip && `${trip.flag} ${trip.name}`,
        t.group,
      ),
      primary: field(t.title),
      secondary: field(t.notes, t.group, proj, trip?.name, trip?.place, TASK_CONTEXT_WORDS[t.context ?? 'geral'], t.lifeAdminCategory, t.adminKind, t.waiting?.who, t.planType && PLAN_LABEL[t.planType]),
      date: t.date ?? t.dueDate,
      inactive: t.status === 'done',
      action: sheetAction('task', { id: t.id }),
    })
  }

  for (const p of db.projects) {
    docs.push({
      domain: 'project',
      id: p.id,
      title: p.name,
      emoji: p.emoji,
      subtitle: p.nextAction ? `Próximo: ${p.nextAction}` : (p.role ?? p.description),
      primary: field(p.name),
      secondary: field(
        p.role,
        p.description,
        p.objective,
        p.nextAction,
        p.notes,
        p.people.map((x) => `${x.name} ${x.role ?? ''}`).join(' '),
        p.sections?.join(' '),
        p.categories?.join(' '),
        p.kind === 'creator' && 'ugc conteudo creator',
      ),
      date: p.nextDelivery?.date ?? p.deadline,
      inactive: p.status === 'concluido',
      action: routeAction(ROUTES.project(p.id)),
    })
  }

  for (const m of db.milestones) {
    const proj = projectName.get(m.projectId)
    docs.push({
      domain: 'milestone',
      id: m.id,
      title: m.title,
      emoji: m.done ? '✅' : '🏁',
      subtitle: join(proj, m.group, when(m.date, today)),
      primary: field(m.title),
      secondary: field(proj, m.group, m.status === 'roadmap' ? 'roadmap' : m.status === 'em_andamento' ? 'em andamento' : undefined),
      date: m.date,
      inactive: m.done,
      action: routeAction(ROUTES.project(m.projectId)),
    })
  }

  for (const w of db.wins) {
    const proj = w.projectId ? projectName.get(w.projectId) : undefined
    docs.push({
      domain: 'win',
      id: w.id,
      title: w.title,
      emoji: '✨',
      subtitle: join(proj, formatShortDate(w.date)),
      primary: field(w.title),
      secondary: field(w.description, w.impact, proj, w.kind),
      date: w.date,
      action: sheetAction('win', { id: w.id }),
    })
  }

  for (const i of db.workInbox) {
    const proj = i.projectId ? projectName.get(i.projectId) : undefined
    docs.push({
      domain: 'workInbox',
      id: i.id,
      title: i.subject,
      emoji: i.status === 'waiting' ? '⏳' : '📥',
      subtitle: join(i.sender, i.status === 'waiting' ? 'esperando' : undefined, proj),
      primary: field(i.subject),
      secondary: field(i.sender, i.summary, proj, i.kind),
      date: i.dueDate,
      inactive: i.status === 'resolvido' || i.status === 'ignorado',
      action: sheetAction('workInboxItem', { id: i.id }),
    })
  }

  for (const m of db.meetings) {
    const proj = m.projectId ? projectName.get(m.projectId) : undefined
    docs.push({
      domain: 'meeting',
      id: m.id,
      title: m.title,
      emoji: '🗣️',
      subtitle: join(when(m.date, today), m.startTime, proj),
      primary: field(m.title),
      secondary: field(m.notes, m.decisions.join(' '), m.actionItems.map((a) => a.text).join(' '), proj),
      date: m.date,
      action: sheetAction('meeting', { id: m.id }),
    })
  }

  for (const n of db.notes) {
    const title = n.title || n.body.split('\n')[0].slice(0, 80)
    const proj = n.projectId ? projectName.get(n.projectId) : undefined
    const trip = n.tripId ? trips.get(n.tripId)?.name : undefined
    docs.push({
      domain: 'note',
      id: n.id,
      title,
      emoji: n.kind === 'ideia' ? '💡' : '📝',
      subtitle: join(n.kind === 'ideia' ? 'ideia' : 'nota', proj, trip),
      primary: field(title),
      secondary: field(n.body, n.tags.join(' '), proj, trip),
      action: sheetAction('note', { id: n.id }),
    })
  }

  for (const b of db.brainDump) {
    docs.push({
      domain: 'brainDump',
      id: b.id,
      title: b.text,
      emoji: '🧠',
      subtitle: join(b.group, b.status === 'inbox' ? 'esperando um destino' : b.status === 'processado' ? 'organizado' : 'arquivado'),
      primary: field(b.text),
      secondary: field(b.group),
      inactive: b.status === 'arquivado',
      action: b.status === 'inbox' ? sheetAction('brainDumpTriage', { id: b.id }) : routeAction(ROUTES.inbox),
    })
  }

  for (const tr of db.studyTracks) {
    docs.push({
      domain: 'study',
      id: tr.id,
      title: tr.name,
      emoji: tr.emoji,
      subtitle: join('Trilha de estudo', tr.formats?.slice(0, 3).join(', ')),
      primary: field(tr.name),
      secondary: field('trilha estudo', tr.formats?.join(' '), tr.notes, tr.status),
      inactive: tr.archived,
      action: routeAction(ROUTES.study),
    })
  }

  for (const s of db.studyItems) {
    const track = s.trackId ? tracks.get(s.trackId) : undefined
    docs.push({
      domain: 'study',
      id: s.id,
      title: s.title,
      emoji: track?.emoji ?? '📚',
      subtitle: join(track?.name, STUDY_STATUS_LABEL[s.status], s.source),
      primary: field(s.title),
      secondary: field(track?.name, s.source, s.notes, s.nextContent, s.kind),
      inactive: s.status === 'finalizado',
      action: sheetAction('study', { id: s.id }),
    })
  }

  for (const b of db.books) {
    docs.push({
      domain: 'book',
      id: b.id,
      title: b.title,
      emoji: BOOK_STATUS_EMOJI[b.status],
      subtitle: join(b.author, BOOK_STATUS_LABEL[b.status].toLowerCase()),
      primary: field(b.title),
      secondary: field(b.author, b.category, b.notes),
      action: routeAction(ROUTES.book(b.id)),
    })
  }

  for (const t of db.trips) {
    docs.push({
      domain: 'trip',
      id: t.id,
      title: t.name,
      emoji: t.flag,
      subtitle: join(t.place, t.startDate ? formatShortDate(t.startDate) : t.dateLabel),
      primary: field(t.name, t.place),
      secondary: field(t.summary, t.interests.join(' '), t.dateLabel, t.companions, t.notes),
      date: t.startDate,
      inactive: t.status === 'concluida',
      action: routeAction(ROUTES.trip(t.id)),
    })
  }

  for (const i of db.tripItems) {
    const trip = trips.get(i.tripId)
    docs.push({
      domain: 'tripItem',
      id: i.id,
      title: i.title,
      emoji: trip?.flag ?? '🧳',
      subtitle: join(trip?.name, i.group, i.status === 'a_confirmar' ? 'revisar' : TRIP_ITEM_STATUS[i.status]),
      primary: field(i.title),
      secondary: field(i.group, i.notes, trip?.name, TRIP_SECTION_LABEL[i.section], TRIP_ITEM_STATUS[i.status]),
      date: i.date,
      inactive: i.status === 'cancelado',
      action: sheetAction('tripItem', { id: i.id, tripId: i.tripId }),
    })
  }

  for (const c of db.contentItems) {
    docs.push({
      domain: 'content',
      id: c.id,
      title: c.title,
      emoji: '🎬',
      subtitle: join(CONTENT_STAGE[c.stage], c.platform, c.format),
      primary: field(c.title),
      secondary: field(c.hook, c.platform, c.format, c.category, c.cta, c.projectId && projectName.get(c.projectId), 'ugc conteudo'),
      date: c.deadline ?? c.publishedAt,
      action: sheetAction('content', { id: c.id }),
    })
  }

  for (const p of db.partnerships) {
    docs.push({
      domain: 'partnership',
      id: p.id,
      title: p.brand,
      emoji: '🤝',
      subtitle: join(p.format, p.stage.replace(/_/g, ' ')),
      primary: field(p.brand),
      secondary: field(p.format, p.briefing, p.deliverables, p.notes, p.contact, 'ugc parceria publi'),
      date: p.deadline,
      inactive: p.stage === 'finalizado',
      action: sheetAction('partnership', { id: p.id }),
    })
  }

  for (const e of db.expenses) {
    const cat = categoryOf(db, e.categoryId)
    const trip = e.tripId ? trips.get(e.tripId)?.name : undefined
    docs.push({
      domain: 'expense',
      id: e.id,
      title: e.title,
      emoji: cat?.emoji ?? '💸',
      subtitle: join(formatBRL(e.amountCents), cat?.name, e.status === 'planned_purchase' ? 'compra planejada' : when(e.date, today)),
      primary: field(e.title),
      secondary: field(cat?.name, e.notes, trip, e.status === 'planned_purchase' && 'compra planejada'),
      date: e.date,
      action: sheetAction('expense', { id: e.id }),
    })
  }

  for (const w of db.workouts) {
    const m = modalityOf(db, w.modality)
    const title = w.title || m.label
    docs.push({
      domain: 'workout',
      id: w.id,
      title,
      emoji: m.emoji,
      subtitle: join(w.title ? m.label : undefined, when(w.date, today), w.status === 'planejado' ? 'planejado' : w.status),
      primary: field(title),
      secondary: field(m.label, w.modality, (MODALITY_SYNONYMS[w.modality] ?? []).join(' '), w.goal, w.notes, w.planType && PLAN_LABEL[w.planType], w.period && PERIOD_LABEL[w.period]),
      date: w.date,
      action: sheetAction('workout', { id: w.id }),
    })
  }

  for (const e of db.events) {
    docs.push({
      domain: 'event',
      id: e.id,
      title: e.title,
      emoji: '📅',
      subtitle: join(
        e.recurrence ? recurrenceWords(e.recurrence) : when(e.date, today),
        e.allDay ? 'dia todo' : (e.startTime ?? (e.period && PERIOD_LABEL[e.period])),
        e.category ?? e.location,
      ),
      primary: field(e.title),
      secondary: field(e.location, e.notes, e.category, e.kind, e.planType && PLAN_LABEL[e.planType], e.period && PERIOD_LABEL[e.period], e.template?.join(' ')),
      date: e.date,
      action: sheetAction('event', { id: e.id }),
    })
  }

  for (const p of db.pets) {
    docs.push({
      domain: 'luna',
      id: p.id,
      title: p.name,
      emoji: '🐾',
      subtitle: join(p.species, p.breed),
      primary: field(p.name),
      secondary: field(p.species, p.breed, p.notes, 'pet'),
      action: routeAction(ROUTES.luna),
    })
  }

  for (const t of db.petTasks) {
    const pet = pets.get(t.petId)
    docs.push({
      domain: 'luna',
      id: t.id,
      title: t.title,
      emoji: '🐾',
      subtitle: join(pet, t.dueDate && when(t.dueDate, today)),
      primary: field(t.title),
      secondary: field(pet, t.category, t.notes),
      date: t.dueDate,
      inactive: !t.active,
      action: sheetAction('petTask', { id: t.id }),
    })
  }

  for (const g of db.goals) {
    docs.push({
      domain: 'goal',
      id: g.id,
      title: g.title,
      emoji: '🎯',
      subtitle: join(g.level === 'dia' ? 'meta do dia' : g.level === 'semana' ? 'meta da semana' : 'meta maior', g.deadline && formatShortDate(g.deadline)),
      primary: field(g.title),
      secondary: field(g.notes, g.category),
      date: g.deadline,
      inactive: g.status === 'feita',
      action: sheetAction('goal', { id: g.id }),
    })
  }

  for (const r of db.routineItems) {
    const routine = routines.get(r.routineId)
    docs.push({
      domain: 'routine',
      id: r.id,
      title: r.title,
      emoji: r.emoji ?? '☀️',
      subtitle: routine,
      primary: field(r.title),
      secondary: field(routine, r.steps?.join(' '), r.hint, r.essentialLabel),
      inactive: !r.active,
      action: sheetAction('routineEditor', { routineId: r.routineId }),
    })
  }

  for (const g of db.workoutGoals) {
    const m = g.modality ? modalityOf(db, g.modality) : undefined
    docs.push({
      domain: 'goal',
      id: g.id,
      title: g.title,
      emoji: m?.emoji ?? '🎯',
      subtitle: join('objetivo de treino', g.planType && PLAN_LABEL[g.planType], g.deadline && formatShortDate(g.deadline)),
      primary: field(g.title),
      secondary: field(m?.label, g.modality, g.modality && (MODALITY_SYNONYMS[g.modality] ?? []).join(' '), g.notes, g.preparation),
      date: g.deadline,
      inactive: g.status !== 'ativa',
      action: sheetAction('workoutGoal', { id: g.id }),
    })
  }

  for (const s of db.nutritionStrategies) {
    const linked = s.linkedWorkoutTypes.map((t) => `${t} ${linkedTypeWords(t)}`).join(' ')
    docs.push({
      domain: 'nutrition',
      id: s.id,
      title: s.name,
      emoji: '⛽',
      subtitle: join('Estratégia de treino', s.sourceName ?? NUTRITION_SOURCE[s.source]),
      primary: field(s.name),
      secondary: field(
        linked,
        s.previousDayInstructions,
        s.preWorkoutInstructions && `pre treino ${s.preWorkoutInstructions}`,
        s.duringWorkoutInstructions && `intra durante ${s.duringWorkoutInstructions}`,
        s.postWorkoutInstructions && `pos treino ${s.postWorkoutInstructions}`,
        s.timing,
        s.notes,
        'nutricao estrategia',
      ),
      action: sheetAction('nutritionStrategy', { id: s.id }),
    })
  }

  for (const p of db.nutritionDayPlans) {
    const foods = p.meals.flatMap((m) => m.items.flatMap((f) => [f.food, ...(f.substitutions ?? [])]))
    docs.push({
      domain: 'nutrition',
      id: p.id,
      title: p.name,
      emoji: '🥗',
      subtitle: join('Plano do dia', p.meals.map((m) => m.name).slice(0, 3).join(', ')),
      primary: field(p.name),
      secondary: field(
        p.meals.map((m) => `${m.name} ${m.notes ?? ''}`).join(' '),
        foods.join(' '),
        linkedTypeWords(p.dayType.replace('_', '-')),
        p.dayType.replace('_', ' '),
        p.notes,
        'nutricao plano refeicao',
      ),
      inactive: !p.active,
      action: routeAction(ROUTES.nutrition),
    })
  }

  for (const c of db.constraints) {
    const proj = c.projectId ? projectName.get(c.projectId) : undefined
    const mods = (c.modalities ?? []).map((id) => modalityOf(db, id))
    docs.push({
      domain: 'planning',
      id: c.id,
      title: c.name,
      emoji: c.kind === 'max_checkins_per_day' ? '🎟️' : '⏱️',
      subtitle: join('Regra de planejamento', mods.length ? mods.map((m) => m.label).join(', ') : proj),
      primary: field(c.name),
      secondary: field(c.notes, proj, mods.map((m) => `${m.label} ${m.id}`).join(' '), 'regra check-in limite'),
      inactive: !c.active,
      action: routeAction(c.projectId ? ROUTES.project(c.projectId) : ROUTES.weekPlanner),
    })
  }

  for (const t of db.weekTemplate) {
    const mods = t.modalities.map((id) => modalityOf(db, id))
    const what =
      t.choice === 'rest'
        ? (t.title ?? 'Descanso')
        : (t.title ?? mods.map((m) => `${m.emoji} ${m.label}`).join(t.choice === 'one_of' ? ' ou ' : ', '))
    const day = WEEKDAY_LONG[t.weekday]
    const title = `${day[0].toUpperCase()}${day.slice(1)} · ${what}`
    docs.push({
      domain: 'planning',
      id: t.id,
      title,
      emoji: mods[0]?.emoji ?? '🌿',
      subtitle: join('Semana base', t.time ?? (t.period && PERIOD_LABEL[t.period]), PLAN_LABEL[t.planType], t.notes),
      primary: field(title),
      secondary: field(
        mods.map((m) => `${m.label} ${(MODALITY_SYNONYMS[m.id] ?? []).join(' ')}`).join(' '),
        t.notes,
        PLAN_LABEL[t.planType],
        'semana base template treino',
      ),
      inactive: !t.active,
      action: routeAction(ROUTES.weekPlanner),
    })
  }

  return docs
}

function scoreDoc(doc: Doc, tokens: string[], phrase: string, today: DateKey): number {
  let s = 0
  for (const t of tokens) {
    const p = tokenScoreAliased(doc.primary, t, true)
    if (p) {
      s += p
      continue
    }
    const sec = tokenScoreAliased(doc.secondary, t, false)
    if (!sec) return 0
    s += sec
  }
  const compact = phrase.replace(/\s+/g, '')
  const primaryCompact = doc.primary.norm.replace(/[^a-z0-9]/g, '')
  if (doc.primary.norm === phrase || primaryCompact === compact) s += 20
  else if (doc.primary.norm.startsWith(phrase)) s += 8
  else if (tokens.length > 1 && doc.primary.norm.includes(phrase)) s += 5
  if (doc.date) {
    const d = diffDays(today, doc.date)
    if (d >= 0 && d <= 14) s += 3
    else if (d < 0 && d >= -7) s += 2
    else if (d > 14 && d <= 60) s += 1
  }
  if (doc.inactive) s -= 3
  return Math.max(1, s)
}

function toResult(doc: Doc, score: number): SearchResult {
  return {
    key: `${doc.domain}:${doc.id}`,
    domain: doc.domain,
    entityId: doc.id,
    title: doc.title,
    subtitle: doc.subtitle,
    emoji: doc.emoji,
    score,
    date: doc.date,
    action: doc.action,
  }
}

function groupResults(results: SearchResult[]): SearchGroup[] {
  const map = new Map<SearchDomain, SearchResult[]>()
  for (const r of results) {
    const list = map.get(r.domain) ?? []
    list.push(r)
    map.set(r.domain, list)
  }
  return [...map.entries()]
    .map(([domain, list]) => ({
      key: domain,
      domain,
      ...DOMAIN_META[domain],
      results: list.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => b.results[0].score - a.results[0].score || b.results.length - a.results.length)
}

/** Plain ranked search over every domain (no intents). */
export function searchAll(db: DB, query: string, today: DateKey): SearchResult[] {
  const tokens = queryTokens(query)
  if (!tokens.length) return []
  const phrase = tokens.join(' ')
  const out: SearchResult[] = []
  for (const doc of buildDocs(db, today)) {
    const s = scoreDoc(doc, tokens, phrase, today)
    if (s > 0) out.push(toResult(doc, s))
  }
  return out.sort((a, b) => b.score - a.score)
}

// ─── Smart intents ──────────────────────────────────────────────────────────

const MONEY_WORDS = new Set(['gasto', 'gastos', 'gastei', 'despesa', 'despesas'])
const MONEY_FILLER = new Set([
  ...STOPWORDS,
  'essa', 'esse', 'este', 'esta', 'minha', 'minhas', 'meu', 'meus', 'que', 'quanto', 'quantos', 'foi', 'total', 'com',
])
const MONTHS_NORM = MONTHS.map((m) => normalize(m))
const TRAVEL_WORDS = new Set(['viagem', 'viagens', 'viajar', 'trip'])

interface MoneyQuery {
  from?: DateKey
  to?: DateKey
  periodLabel?: string
  categoryIds: Set<ID>
  categoryLabel: string[]
  travel: boolean
  tripIds: Set<ID>
  text: string[]
}

/** Most recent occurrence of month `m` (0-11) not after today's month, unless a year is given. */
function monthRange(m: number, today: DateKey, year?: number) {
  const [ty, tm] = today.split('-').map(Number)
  const y = year ?? (m + 1 <= tm ? ty : ty - 1)
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { from, to: endOfMonth(from), label: `em ${MONTHS[m]}${year || y !== ty ? ` de ${y}` : ''}` }
}

export function parseMoneyQuery(db: DB, tokens: string[], today: DateKey): MoneyQuery | null {
  if (!tokens.length || !MONEY_WORDS.has(tokens[0])) return null
  const q: MoneyQuery = { categoryIds: new Set(), categoryLabel: [], travel: false, tripIds: new Set(), text: [] }
  const rest = tokens.slice(1).filter((t) => !MONEY_FILLER.has(t))
  const year = rest.find((t) => /^20\d\d$/.test(t))
  for (const t of rest) {
    if (t === year) continue
    const mi = MONTHS_NORM.findIndex((m) => m === t || (t.length >= 3 && m.startsWith(t)))
    if (mi >= 0) {
      const r = monthRange(mi, today, year ? Number(year) : undefined)
      Object.assign(q, { from: r.from, to: r.to, periodLabel: r.label })
      continue
    }
    if (t === 'hoje') {
      Object.assign(q, { from: today, to: today, periodLabel: 'hoje' })
      continue
    }
    if (t === 'ontem') {
      const y = addDays(today, -1)
      Object.assign(q, { from: y, to: y, periodLabel: 'ontem' })
      continue
    }
    if (t === 'semana') {
      Object.assign(q, { from: startOfWeek(today), to: endOfWeek(today), periodLabel: 'essa semana' })
      continue
    }
    if (t === 'mes') {
      Object.assign(q, { from: startOfMonth(today), to: endOfMonth(today), periodLabel: 'este mês' })
      continue
    }
    if (t === 'ano') {
      Object.assign(q, { from: today.slice(0, 4) + '-01-01', to: today.slice(0, 4) + '-12-31', periodLabel: 'este ano' })
      continue
    }
    if (TRAVEL_WORDS.has(t)) {
      q.travel = true
      q.categoryLabel.push('Viagem')
      continue
    }
    const cat = db.financialCategories.find((c) => {
      const words = tokenize(c.name)
      return words.includes(t) || (t.length >= 4 && words.some((w) => w.startsWith(t)))
    })
    if (cat) {
      q.categoryIds.add(cat.id)
      q.categoryLabel.push(cat.name)
      continue
    }
    const trip = db.trips.find((tr) => tokenize(`${tr.name} ${tr.place ?? ''}`).some((w) => w === t || (t.length >= 4 && w.startsWith(t))))
    if (trip) {
      q.tripIds.add(trip.id)
      q.categoryLabel.push(trip.name)
      continue
    }
    q.text.push(t)
  }
  const filtered = q.travel || q.categoryIds.size > 0 || q.tripIds.size > 0 || q.text.length > 0
  if (!q.from && !filtered) Object.assign(q, { from: startOfMonth(today), to: endOfMonth(today), periodLabel: 'este mês' })
  return q
}

export function moneyMatches(db: DB, q: MoneyQuery): Expense[] {
  return db.expenses
    .filter((e) => e.status === 'paid' && !!e.date)
    .filter((e) => (!q.from || e.date! >= q.from) && (!q.to || e.date! <= q.to))
    .filter((e) => {
      const anyFilter = q.travel || q.categoryIds.size > 0 || q.tripIds.size > 0
      if (!anyFilter) return true
      if (q.travel && (e.categoryId === 'cat-viagem' || !!e.tripId || normalize(categoryOf(db, e.categoryId)?.name ?? '') === 'viagem')) return true
      if (q.categoryIds.has(e.categoryId)) return true
      if (e.tripId && q.tripIds.has(e.tripId)) return true
      return false
    })
    .filter((e) => {
      if (!q.text.length) return true
      const f = field(e.title, e.notes, categoryOf(db, e.categoryId)?.name)
      return q.text.every((t) => tokenScore(f, t, true) > 0)
    })
    .sort((a, b) => b.date!.localeCompare(a.date!))
}

export function topCategories(db: DB, list: Expense[], n = 3) {
  const by = new Map<ID, number>()
  for (const e of list) by.set(e.categoryId, (by.get(e.categoryId) ?? 0) + e.amountCents)
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, cents]) => {
      const c = categoryOf(db, id)
      return { name: c?.name ?? 'Outros', emoji: c?.emoji ?? '•', cents }
    })
}

function moneySearch(db: DB, query: string, tokens: string[], today: DateKey): SearchResponse | null {
  const q = parseMoneyQuery(db, tokens, today)
  if (!q) return null
  const list = moneyMatches(db, q)
  const what = q.categoryLabel.length ? q.categoryLabel.join(' + ') : q.text.length ? `“${q.text.join(' ')}”` : ''
  const summary: MoneySummary = {
    title: what ? `Gastos · ${what}` : 'Gastos',
    periodLabel: q.periodLabel ?? 'no total',
    totalCents: sumCents(list),
    count: list.length,
    topCategories: topCategories(db, list),
    action: routeAction(ROUTES.money),
  }
  const docs = buildDocs(db, today).filter((d) => d.domain === 'expense')
  const byId = new Map(docs.map((d) => [d.id, d]))
  const results = list.map((e, i) => toResult(byId.get(e.id)!, 100 - i))
  return {
    query,
    intent: 'money',
    summary,
    groups: results.length ? [{ key: 'expense', domain: 'expense', ...DOMAIN_META.expense, results }] : [],
    total: results.length,
  }
}

const BOOK_WORDS = new Set(['livro', 'livros', 'leitura', 'leituras', 'biblioteca', 'estante'])
const BOOK_ORDER: BookStatus[] = ['lendo', 'proximo', 'quero', 'finalizado']

function booksSearch(db: DB, query: string, tokens: string[], today: DateKey): SearchResponse | null {
  if (!tokens.length || !tokens.every((t) => BOOK_WORDS.has(t) || t === 'meus')) return null
  const docs = new Map(buildDocs(db, today).filter((d) => d.domain === 'book').map((d) => [d.id, d]))
  const groups: SearchGroup[] = []
  for (const status of BOOK_ORDER) {
    const books: Book[] = db.books.filter((b) => b.status === status).sort((a, b) => a.order - b.order)
    if (!books.length) continue
    groups.push({
      key: `book:${status}`,
      domain: 'book',
      label: BOOK_STATUS_LABEL[status],
      emoji: BOOK_STATUS_EMOJI[status],
      results: books.map((b, i) => toResult(docs.get(b.id)!, 100 - i)),
    })
  }
  return { query, intent: 'books', groups, total: db.books.length }
}

const STUDY_WORDS = new Set(['estudo', 'estudos', 'estudar', 'estudando', 'trilha', 'curso', 'cursos'])
const STUDY_ORDER: StudyStatus[] = ['estudando', 'proximo', 'backlog', 'pausado', 'finalizado']

/** Track names match by word, by prefix or by acronym ("ia" → "Inteligência Artificial"). */
export function findTrack(db: DB, tokens: string[]) {
  if (!tokens.length) return undefined
  const joined = tokens.join(' ')
  return db.studyTracks.find((tr) => {
    const words = tokenize(tr.name)
    const acronym = words.map((w) => w[0]).join('')
    if (normalize(tr.name) === joined || acronym === tokens.join('')) return true
    return tokens.every((t) => words.some((w) => w === t || (t.length >= 3 && w.startsWith(t))))
  })
}

function studySearch(db: DB, query: string, tokens: string[], today: DateKey): SearchResponse | null {
  if (tokens.length < 2 || !STUDY_WORDS.has(tokens[0])) return null
  const track = findTrack(db, tokens.slice(1))
  if (!track) return null
  const docs = new Map(buildDocs(db, today).filter((d) => d.domain === 'study').map((d) => [d.id, d]))
  const items: StudyItem[] = db.studyItems
    .filter((s) => s.trackId === track.id)
    .sort((a, b) => STUDY_ORDER.indexOf(a.status) - STUDY_ORDER.indexOf(b.status) || a.order - b.order)
  const results = [toResult(docs.get(track.id)!, 200), ...items.map((s, i) => toResult(docs.get(s.id)!, 100 - i))]
  return {
    query,
    intent: 'study',
    groups: [{ key: `study:${track.id}`, domain: 'study', label: `Estudo · ${track.name}`, emoji: track.emoji, results }],
    total: results.length,
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function search(db: DB, query: string, today: DateKey): SearchResponse {
  const trimmed = query.trim()
  const tokens = tokenize(trimmed)
  if (!tokens.length) return { query: trimmed, groups: [], total: 0 }
  const smart = moneySearch(db, trimmed, tokens, today) ?? booksSearch(db, trimmed, tokens, today) ?? studySearch(db, trimmed, tokens, today)
  if (smart) return smart
  const results = searchAll(db, trimmed, today)
  return { query: trimmed, groups: groupResults(results), total: results.length }
}

/** Best results across groups, for compact lists (command palette, Mari fallback). */
export function topResults(res: SearchResponse, n: number): SearchResult[] {
  return res.groups
    .flatMap((g) => g.results)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}
