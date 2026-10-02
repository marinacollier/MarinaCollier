/**
 * "Captura do jeito que eu falo" (brief §40): natural pt-BR → a suggested structure.
 *
 * Deterministic rules + lookups in Marina's own data (trips, projects' people, pets, modalities,
 * creator categories). No names are hardcoded here. The result is only a SUGGESTION: the UI shows it
 * as a chip ("Parece: 🏃 Corrida · quinta · almoço → criar?") and she can accept, change or ignore it.
 */
import { actions, getDB } from '@/data/store'
import { modalityOf } from '@/data/selectors'
import { PERIOD_LABEL } from '@/data/planning'
import type {
  BrainDumpItem,
  BrainDumpTarget,
  DateKey,
  DayPeriod,
  DB,
  EntityType,
  ID,
  LifeAdminCategory,
  Task,
  TripItem,
  TripSection,
  Weekday,
} from '@/data/types'
import { addDays, WEEKDAY_LONG, weekday } from '@/lib/date'
import { normalize } from '@/lib/text'
import { buildConversion, type Conversion } from './triage'

export type IntentType = BrainDumpTarget | 'workout'

export interface IntentFields {
  date?: DateKey
  weekday?: Weekday
  period?: DayPeriod
  modality?: string
  tripId?: ID
  /** Sub-group inside a trip ("Johannesburg / Safari"). */
  group?: string
  section?: TripSection
  projectId?: ID
  who?: string
  petId?: ID
  lifeAdminCategory?: LifeAdminCategory
  adminKind?: Task['adminKind']
  /** Content category ("bike"). */
  category?: string
}

export interface Intent {
  type: IntentType
  /** 0..1 — how sure the rules are. The UI only suggests from 0.5 up. */
  confidence: number
  fields: IntentFields
  /** Human label: "🏃‍♀️ Corrida · quinta · almoço". */
  label: string
}

export const SUGGEST_MIN_CONFIDENCE = 0.5

// ─── Text helpers ───────────────────────────────────────────────────────────

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Word-boundary match on normalized text. */
function hasWord(text: string, word: string): boolean {
  const w = normalize(word)
  if (!w) return false
  return new RegExp(`(^|[^a-z0-9])${escape(w)}($|[^a-z0-9])`).test(text)
}

const STOP = new Set(['base', 'viagem', 'cidade', 'centro', 'trip', 'sul', 'norte', 'do', 'da', 'de', 'dos', 'das', 'e', 'em', 'the'])

/** Meaningful tokens of a label: whole label + words ≥ 4 chars that aren't generic. */
function tokensOf(label?: string): string[] {
  if (!label) return []
  const parts = label
    .split(/[,·/()|\-–]+/)
    .map((p) => normalize(p))
    .filter(Boolean)
  const words = parts.flatMap((p) => p.split(/\s+/)).filter((w) => w.length >= 4 && !STOP.has(w))
  return [...new Set([...parts.filter((p) => p.length >= 4 && !STOP.has(p)), ...words])]
}

/** A tiny generic alias table: common IATA airport codes → city names. */
export const IATA: Record<string, string> = {
  JNB: 'johannesburg',
  CPT: 'cape town',
  DUR: 'durban',
  REC: 'recife',
  GRU: 'sao paulo',
  CGH: 'sao paulo',
  VCP: 'campinas',
  GIG: 'rio de janeiro',
  SDU: 'rio de janeiro',
  SSA: 'salvador',
  IOS: 'ilheus',
  BSB: 'brasilia',
  FLN: 'florianopolis',
  FOR: 'fortaleza',
  NAT: 'natal',
  MCZ: 'maceio',
  LIS: 'lisboa',
  OPO: 'porto',
  MAD: 'madri',
  BCN: 'barcelona',
  CDG: 'paris',
  LHR: 'londres',
  JFK: 'nova york',
  MIA: 'miami',
  EZE: 'buenos aires',
  SCL: 'santiago',
  LIM: 'lima',
  CUN: 'cancun',
}

/** Words that look like IATA codes in the original text (3 letters, written in caps or alone). */
function airportCities(raw: string): string[] {
  const out: string[] = []
  for (const m of raw.matchAll(/\b([A-Za-z]{3})\b/g)) {
    const code = m[1].toUpperCase()
    // Lowercase 3-letter words are usually Portuguese ("for", "mad"…): only accept them in caps.
    if (IATA[code] && m[1] === code) out.push(IATA[code])
  }
  return out
}

// ─── Dates / periods ────────────────────────────────────────────────────────

const WEEKDAY_WORDS: [RegExp, Weekday][] = [
  [/\bdomingo\b/, 0],
  [/\bsegunda(-feira)?\b/, 1],
  [/\bterca(-feira)?\b/, 2],
  [/\bquarta(-feira)?\b/, 3],
  [/\bquinta(-feira)?\b/, 4],
  [/\bsexta(-feira)?\b/, 5],
  [/\bsabado\b/, 6],
]

function parseDay(text: string, today: DateKey): { date?: DateKey; weekday?: Weekday; word?: string } {
  if (/\bhoje\b/.test(text)) return { date: today, weekday: weekday(today), word: 'hoje' }
  // "de manhã" / "pela manhã" is a period, not "amanhã" (normalized both read "manha").
  if (/\bamanha\b/.test(text.replace(/\b(de|pela|na|a) manha\b/g, ' '))) {
    const d = addDays(today, 1)
    return { date: d, weekday: weekday(d), word: 'amanhã' }
  }
  for (const [re, wd] of WEEKDAY_WORDS) {
    if (re.test(text)) {
      const diff = (wd - weekday(today) + 7) % 7
      return { date: addDays(today, diff), weekday: wd, word: WEEKDAY_LONG[wd] }
    }
  }
  return {}
}

function parsePeriod(text: string): DayPeriod | undefined {
  if (/\balmoco\b/.test(text)) return 'almoco'
  if (/\b(de|pela|na|a) manha\b|\bcedo\b|\bmanhazinha\b/.test(text)) return 'manha'
  if (/\b(de|a|na|pela) tarde\b/.test(text)) return 'tarde'
  if (/\b(de|a|na) noite\b|\bhoje a noite\b/.test(text)) return 'noite'
  return undefined
}

// ─── Modalities ─────────────────────────────────────────────────────────────

/** Generic pt-BR verbs/nouns → modality id (checked against the modalities that exist). */
const MODALITY_WORDS: [RegExp, string][] = [
  [/\btrail\b/, 'trail'],
  [/\bgravel\b/, 'gravel'],
  [/\b(correr|corrida|corro|correndo|corridinha|rodagem)\b/, 'corrida'],
  [/\b(nadar|natacao|nado|nadando|piscina)\b/, 'natacao'],
  [/\b(pedalar|pedal|pedalada|pedalando|bike|bicicleta)\b/, 'bike'],
  [/\byoga\b/, 'yoga'],
  [/\b(musculacao|academia|perna|treino de forca|forca|superiores|inferiores)\b/, 'musculacao'],
  [/\b(surf|surfar|surfando)\b/, 'surf'],
  [/\b(circo|aereos?|tecido acrobatico|lira)\b/, 'circo'],
  [/\b(caminhar|caminhada)\b/, 'caminhada'],
  [/\bmobilidade\b/, 'mobilidade'],
]

function findModality(db: DB, text: string): string | undefined {
  const own = db.profile.modalities.filter((m) => m.active)
  const byLabel = own.find((m) => hasWord(text, m.label))
  if (byLabel) return byLabel.id
  for (const [re, id] of MODALITY_WORDS) {
    if (!re.test(text)) continue
    const known = own.find((m) => m.id === id) ?? (modalityOf(db, id).id === id ? modalityOf(db, id) : undefined)
    if (known) return known.id
  }
  return undefined
}

// ─── Lookups in Marina's data ───────────────────────────────────────────────

interface TripMatch {
  tripId: ID
  group?: string
  strength: number
}

function findTrip(db: DB, text: string, raw: string): TripMatch | undefined {
  const trips = db.trips.filter((t) => t.status !== 'concluida')
  const cities = airportCities(raw)
  let best: TripMatch | undefined
  const consider = (m: TripMatch) => {
    if (!best || m.strength > best.strength) best = m
  }
  for (const trip of trips) {
    const items = db.tripItems.filter((i) => i.tripId === trip.id)
    const groups = [...new Set(items.map((i) => i.group).filter((g): g is string => !!g))]
    // 1. a sub-group named in the text (or its city via airport code)
    for (const g of groups) {
      for (const tok of tokensOf(g)) {
        if (hasWord(text, tok) || cities.some((c) => c === tok || c.includes(tok) || tok.includes(c))) consider({ tripId: trip.id, group: g, strength: 3 })
      }
    }
    // 2. the trip itself (name / place)
    for (const tok of [...tokensOf(trip.name), ...tokensOf(trip.place)]) {
      if (hasWord(text, tok)) consider({ tripId: trip.id, strength: 2 })
      if (cities.some((c) => c === tok || tok.includes(c))) {
        // airport city inside the trip's place: try to find the item group mentioning it
        const g = groups.find((x) => normalize(x).includes(cities.find((c) => tok.includes(c) || c === tok)!))
        consider({ tripId: trip.id, group: g, strength: g ? 3 : 2 })
      }
    }
    // 3. an item title mentioning the airport city ("Voo JNB → GRU", "Hotel Johannesburg")
    for (const it of items) {
      const title = normalize(it.title)
      if (cities.some((c) => hasWord(title, c))) consider({ tripId: trip.id, group: it.group, strength: 2.5 })
    }
  }
  return best
}

const SECTION_WORDS: [RegExp, TripSection][] = [
  [/\b(hotel|hospedagem|airbnb|hostel|pousada|acomodacao)\b/, 'hospedagem'],
  [/\b(voo|passagem|aeroporto)\b/, 'voo'],
  [/\b(transfer|uber|carro|transporte|aluguel de carro)\b/, 'transporte'],
  [/\b(mala|levar|packing)\b/, 'mala'],
  [/\b(documento|passaporte|visto|seguro|vacina)\b/, 'documento'],
  [/\b(reserva|reservar)\b/, 'reserva'],
  [/\b(restaurante|comer|vinicola)\b/, 'comida'],
]

function findPersonProject(db: DB, raw: string): { who: string; projectId?: ID } | undefined {
  const text = normalize(raw)
  for (const p of db.projects.filter((x) => x.status !== 'concluido')) {
    for (const person of p.people) {
      const first = person.name.trim().split(/\s+/)[0]
      if (first && first.length >= 2 && (hasWord(text, person.name) || hasWord(text, first))) return { who: person.name, projectId: p.id }
    }
  }
  return undefined
}

function findProjectByName(db: DB, text: string) {
  return db.projects.filter((p) => p.status !== 'concluido').find((p) => {
    const n = normalize(p.name)
    return n.length >= 3 && (hasWord(text, n) || hasWord(text, n.replace(/\s+/g, '')))
  })
}

/** Capitalized word that looks like a name ("Fran tá me devendo…", "retorno da Ana"). */
function guessName(raw: string): string | undefined {
  const after = raw.match(/\b(?:d[aoe]|com|pra|para)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+)/)
  if (after) return after[1]
  const first = raw.trim().match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+)\b/)
  const COMMON = /^(Preciso|Esperando|Aguardando|Ficou|Lembrar|Ver|Falar|Comprar|Hoje|Amanhã|Tá|Ta|Está|Esta|Eu|O|A|Os|As)$/
  if (first && !COMMON.test(first[1])) return first[1]
  return undefined
}

// ─── The parser ─────────────────────────────────────────────────────────────

const CONTENT_RE = /\b(ideias?|roteiro|gravar)\s+(de\s+|pra\s+|para\s+|um\s+|uma\s+)?(reels?|conteudo|post|posts|video|videos|story|stories|tiktok|youtube|carrossel|vlog)\b/
const CONTENT_RE2 = /\b(reels?|stories|tiktok|carrossel|vlog)\b/
const WAITING_RE = /\b(me devendo|esta devendo|ta devendo|esperando (o |a )?(retorno|resposta)|aguardando (o |a )?(retorno|resposta)|fic(ou|a) de me (mandar|responder|retornar|enviar)|nao me respondeu|sem retorno)\b/
const BOOK_RE = /\blivros?\b/
const PURCHASE_RE = /\b(comprar|compra|comprinhas)\b/
const STUDY_RE = /\b(estudar|curso|aula|aprender)\b/
const REMINDER_RE = /\b(lembrar|lembrete|me lembra)\b/
const WANT_RE = /\b(quero|vou|bora|preciso|planejar|treinar|treino|fazer)\b/

export function parseIntent(db: DB, raw: string, today: DateKey): Intent | undefined {
  const text = normalize(raw)
  if (!text) return undefined

  // 1. Content ideas ("ideia de reels na bike") — before anything sporty.
  if (CONTENT_RE.test(text) || CONTENT_RE2.test(text)) {
    const creator = db.projects.find((p) => p.kind === 'creator' && p.status !== 'concluido')
    const category = creator?.categories?.find((c) => hasWord(text, c))
    return {
      type: 'content',
      confidence: CONTENT_RE.test(text) ? 0.9 : 0.6,
      fields: { projectId: creator?.id, category },
      label: `🎬 Creator · ideias${category ? ` · ${category}` : ''}`,
    }
  }

  // 2. Waiting for someone ("Fran tá me devendo retorno").
  if (WAITING_RE.test(text)) {
    const person = findPersonProject(db, raw)
    const who = person?.who ?? guessName(raw)
    const project = person?.projectId ? db.projects.find((p) => p.id === person.projectId) : findProjectByName(db, text)
    return {
      type: 'waiting',
      confidence: person ? 0.9 : 0.7,
      fields: { who, projectId: project?.id },
      label: project ? `⏳ ${project.name} · Waiting For` : `⏳ Esperando${who ? ` · ${who}` : ''}`,
    }
  }

  const day = parseDay(text, today)
  const period = parsePeriod(text)

  // 3. Training intention ("quinta quero correr no almoço").
  const modality = findProjectByName(db, text) ? undefined : findModality(db, text)
  if (modality && (day.date || period || WANT_RE.test(text))) {
    const m = modalityOf(db, modality)
    const fields: IntentFields = { modality, date: day.date ?? today, weekday: day.weekday, period }
    const parts = [`${m.emoji} ${m.label}`, day.word, period ? PERIOD_LABEL[period] : undefined].filter(Boolean)
    return { type: 'workout', confidence: day.date || period ? 0.85 : 0.6, fields, label: parts.join(' · ') }
  }

  // 4. Books.
  if (BOOK_RE.test(text)) return { type: 'book', confidence: 0.8, fields: {}, label: '📖 Livros · quero ler' }

  // 5. Pets ("comprar coisa da Luna").
  const pet = db.pets.find((p) => hasWord(text, p.name))
  if (pet) {
    const adminKind: Task['adminKind'] = PURCHASE_RE.test(text) ? 'comprar' : /\b(veterinario|vet|banho|vacina|resolver|marcar)\b/.test(text) ? 'resolver' : undefined
    return {
      type: 'lifeAdmin',
      confidence: 0.85,
      fields: { petId: pet.id, lifeAdminCategory: 'luna', adminKind },
      label: `🐾 ${pet.name}${adminKind === 'comprar' ? ' · compras' : adminKind === 'resolver' ? ' · resolver' : ''}`,
    }
  }

  // 6. Trips ("preciso lembrar do hotel de JNB").
  const trip = findTrip(db, text, raw)
  if (trip) {
    const t = db.trips.find((x) => x.id === trip.tripId)!
    const section = SECTION_WORDS.find(([re]) => re.test(text))?.[1]
    const groupShort = trip.group?.split('/')[0].trim()
    return {
      type: 'trip',
      confidence: trip.strength >= 2.5 ? 0.9 : 0.75,
      fields: { tripId: t.id, group: trip.group, section },
      label: `${t.flag} ${t.name}${groupShort ? ` · ${groupShort}` : ''}`,
    }
  }

  // 7. A project mentioned by name → a work task there.
  const project = findProjectByName(db, text)
  if (project) return { type: 'task', confidence: 0.7, fields: { projectId: project.id }, label: `${project.emoji} ${project.name} · tarefa` }

  if (PURCHASE_RE.test(text)) return { type: 'purchase', confidence: 0.7, fields: {}, label: '🛍️ Lista de compras' }
  if (STUDY_RE.test(text)) return { type: 'study', confidence: 0.6, fields: {}, label: '📚 Estudos' }
  if (REMINDER_RE.test(text) && day.date) {
    return { type: 'reminder', confidence: 0.7, fields: { date: day.date, weekday: day.weekday }, label: `⏰ Lembrete · ${day.word}` }
  }
  return undefined
}

export function suggestionFor(db: DB, raw: string, today: DateKey): Intent | undefined {
  const i = parseIntent(db, raw, today)
  return i && i.confidence >= SUGGEST_MIN_CONFIDENCE ? i : undefined
}

// ─── Applying a suggestion ──────────────────────────────────────────────────

function nextOrder(list: { order: number }[]): number {
  return list.reduce((m, it) => Math.max(m, it.order), -1) + 1
}

/** Pure: what the intent would create from a brain dump item. */
export function conversionFromIntent(db: DB, item: BrainDumpItem, intent: Intent, today: DateKey): Conversion {
  const f = intent.fields
  if (intent.type === 'workout') {
    return {
      key: 'workouts',
      type: 'workout',
      data: {
        date: f.date ?? today,
        modality: f.modality ?? 'outro',
        status: 'planejado',
        planType: 'flexivel',
        period: f.period,
        notes: item.text.trim(),
        order: nextOrder(db.workouts.filter((w) => w.date === (f.date ?? today))),
      },
    } as Conversion
  }
  const base = buildConversion(db, item, intent.type, { today, tripId: f.tripId, date: f.date, who: f.who })
  const data = { ...(base.data as Record<string, unknown>) }
  switch (intent.type) {
    case 'trip':
      if (f.tripId) {
        if (f.group) data.group = f.group
        if (f.section) data.section = f.section
        data.order = nextOrder(db.tripItems.filter((t: TripItem) => t.tripId === f.tripId))
      }
      break
    case 'waiting':
      if (f.projectId) {
        data.projectId = f.projectId
        data.context = 'trabalho'
      }
      break
    case 'lifeAdmin':
      if (f.lifeAdminCategory) data.lifeAdminCategory = f.lifeAdminCategory
      if (f.adminKind) data.adminKind = f.adminKind
      if (f.petId) data.context = 'luna'
      break
    case 'content':
      if (f.projectId) data.projectId = f.projectId
      if (f.category) data.category = f.category
      break
    case 'task':
      if (f.projectId) {
        data.projectId = f.projectId
        data.context = 'trabalho'
      }
      break
  }
  return { ...base, data } as Conversion
}

/** Creates the entity from an inbox item and marks it processed. */
export function applyIntent(itemId: ID, intent: Intent, today: DateKey): { id: ID; type: EntityType } | undefined {
  const db = getDB()
  const item = db.brainDump.find((b) => b.id === itemId)
  if (!item) return undefined
  const c = conversionFromIntent(db, item, intent, today)
  const created = actions.create(c.key, c.data as never) as { id: ID }
  actions.update('brainDump', item.id, { status: 'processado', convertedTo: { type: c.type, id: created.id } })
  return { id: created.id, type: c.type }
}

/** One tap from the capture sheet: keep the thought in the inbox log and create the suggested thing. */
export function captureWithIntent(text: string, intent: Intent, today: DateKey): { id: ID; type: EntityType } | undefined {
  const clean = text.trim()
  if (!clean) return undefined
  const item = actions.create('brainDump', { text: clean, status: 'inbox' })
  return applyIntent(item.id, intent, today)
}

export const INTENT_DONE: Record<IntentType, string> = {
  workout: 'Treino planejado ✓ — flexível, dá pra mover',
  task: 'Virou tarefa ✓',
  idea: 'Virou ideia ✓',
  reminder: 'Virou lembrete ✓',
  waiting: 'Foi pro “esperando” ✓',
  lifeAdmin: 'Foi pra vida real ✓',
  purchase: 'Foi pra lista de compras ✓',
  trip: 'Foi pra viagem ✓',
  project: 'Virou projeto ✓',
  study: 'Foi pros estudos ✓',
  book: 'Foi pra lista de livros ✓',
  content: 'Virou ideia de conteúdo ✓',
  goal: 'Virou meta da semana ✓',
}
