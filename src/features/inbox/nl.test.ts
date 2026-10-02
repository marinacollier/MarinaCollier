import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { defaultCategories, emptyDB } from '@/data/defaults'
import { buildSeed } from '@/data/seed'
import type { DB } from '@/data/types'
import { captureWithIntent, conversionFromIntent, parseIntent, suggestionFor } from './nl'

const TODAY = '2026-10-02' // sexta
const now = '2026-10-01T12:00:00.000Z'
const stamp = { createdAt: now, updatedAt: now }

/** A small world shaped like Marina's — but the parser only knows it through data. */
function world(): DB {
  const db = emptyDB()
  db.financialCategories = defaultCategories(now)
  db.trips = [
    { id: 'trip-za', ...stamp, name: 'África do Sul', flag: '🇿🇦', place: 'Cape Town (base) · Johannesburg (safari)', startDate: '2026-10-24', endDate: '2026-11-16', datesConfirmed: true, interests: [], tone: 'ocean', links: [], status: 'planejando', order: 0 },
    { id: 'trip-rec', ...stamp, name: 'Recife', flag: '🇧🇷', place: 'Recife, PE', startDate: '2026-10-22', datesConfirmed: true, interests: [], tone: 'sand', links: [], status: 'planejando', order: 1 },
  ]
  db.tripItems = [
    { id: 'ti-1', ...stamp, tripId: 'trip-za', section: 'hospedagem', group: 'Cape Town', title: 'Hospedagem Cape Town', status: 'a_confirmar', order: 0 },
    { id: 'ti-2', ...stamp, tripId: 'trip-za', section: 'reserva', group: 'Johannesburg / Safari', title: 'Safari', status: 'a_confirmar', order: 1 },
  ]
  db.projects = [
    { id: 'p-ff', ...stamp, name: 'FashionFinder', emoji: '👗', tone: 'plum', status: 'ativo', priority: 'alta', links: [], files: [], people: [{ name: 'Fran' }], decisions: [], changelog: [], kind: 'default', order: 0 },
    { id: 'p-ugc', ...stamp, name: 'UGC / Creator', emoji: '📸', tone: 'accent', status: 'ativo', priority: 'media', links: [], files: [], people: [], decisions: [], changelog: [], kind: 'creator', order: 1, categories: ['esporte', 'corrida', 'bike', 'viagem'] },
  ]
  db.pets = [{ id: 'pet-1', ...stamp, name: 'Luna', species: 'cachorro', documents: [] }]
  return db
}

describe('parseIntent — the examples from the brief (§40)', () => {
  const db = world()

  it('"quinta quero correr no almoço" → training intention (Thu, corrida, almoço)', () => {
    const i = parseIntent(db, 'quinta quero correr no almoço', TODAY)!
    expect(i.type).toBe('workout')
    expect(i.fields).toMatchObject({ modality: 'corrida', date: '2026-10-08', weekday: 4, period: 'almoco' })
    expect(i.label).toBe('🏃‍♀️ Corrida · quinta · almoço')
    expect(i.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('"preciso lembrar do hotel de JNB" → trip África / Johannesburg (via airport code)', () => {
    const i = parseIntent(db, 'preciso lembrar do hotel de JNB', TODAY)!
    expect(i.type).toBe('trip')
    expect(i.fields).toMatchObject({ tripId: 'trip-za', group: 'Johannesburg / Safari', section: 'hospedagem' })
    expect(i.label).toBe('🇿🇦 África do Sul · Johannesburg')
  })

  it('"Fran tá me devendo retorno" → FashionFinder / Waiting For', () => {
    const i = parseIntent(db, 'Fran tá me devendo retorno', TODAY)!
    expect(i.type).toBe('waiting')
    expect(i.fields).toMatchObject({ who: 'Fran', projectId: 'p-ff' })
    expect(i.label).toBe('⏳ FashionFinder · Waiting For')
  })

  it('"comprar coisa da Luna" → Luna / compras', () => {
    const i = parseIntent(db, 'comprar coisa da Luna', TODAY)!
    expect(i.type).toBe('lifeAdmin')
    expect(i.fields).toMatchObject({ petId: 'pet-1', adminKind: 'comprar' })
    expect(i.label).toBe('🐾 Luna · compras')
  })

  it('"esse livro parece massa" → Livros / quero ler', () => {
    const i = parseIntent(db, 'esse livro parece massa', TODAY)!
    expect(i.type).toBe('book')
  })

  it('"ideia de reels na bike" → Creator / ideias (not a workout)', () => {
    const i = parseIntent(db, 'ideia de reels na bike', TODAY)!
    expect(i.type).toBe('content')
    expect(i.fields).toMatchObject({ projectId: 'p-ugc', category: 'bike' })
  })
})

describe('parseIntent — more pt-BR', () => {
  const db = world()

  it('resolves trips by name or place, case/accents-insensitive', () => {
    expect(parseIntent(db, 'conferir pendências da africa', TODAY)?.fields.tripId).toBe('trip-za')
    expect(parseIntent(db, 'mala pra recife', TODAY)).toMatchObject({ type: 'trip', fields: { tripId: 'trip-rec', section: 'mala' } })
  })

  it('weekday / period / tomorrow', () => {
    expect(parseIntent(db, 'amanhã de manhã nadar', TODAY)?.fields).toMatchObject({ modality: 'natacao', date: '2026-10-03', period: 'manha' })
    expect(parseIntent(db, 'vou pedalar no sábado', TODAY)?.fields).toMatchObject({ modality: 'bike', date: '2026-10-03', weekday: 6 })
    expect(parseIntent(db, 'sexta yoga à noite', TODAY)?.fields).toMatchObject({ modality: 'yoga', date: TODAY, period: 'noite' })
  })

  it('3-letter lowercase words are not airport codes', () => {
    expect(parseIntent(db, 'ver isso for real', TODAY)).toBeUndefined()
  })

  it('a person not in any project is still a waiting-for', () => {
    expect(parseIntent(db, 'esperando retorno da Ana', TODAY)).toMatchObject({ type: 'waiting', fields: { who: 'Ana' } })
  })

  it('a project named in the text → task in that project', () => {
    expect(parseIntent(db, 'revisar roadmap do fashionfinder', TODAY)).toMatchObject({ type: 'task', fields: { projectId: 'p-ff' } })
  })

  it('nothing confident → no suggestion', () => {
    expect(suggestionFor(db, 'pensar na vida', TODAY)).toBeUndefined()
  })
})

describe('applying a suggestion', () => {
  beforeEach(async () => {
    await hydrate(createMemoryAdapter())
    actions.replaceDB(world())
  })

  it('workout intention becomes a flexible planned workout in the right period', () => {
    const intent = parseIntent(getDB(), 'quinta quero correr no almoço', TODAY)!
    const res = captureWithIntent('quinta quero correr no almoço', intent, TODAY)!
    expect(res.type).toBe('workout')
    const w = getDB().workouts.find((x) => x.id === res.id)!
    expect(w).toMatchObject({ date: '2026-10-08', modality: 'corrida', status: 'planejado', planType: 'flexivel', period: 'almoco' })
    expect(w.time).toBeUndefined()
    const item = getDB().brainDump[0]
    expect(item).toMatchObject({ status: 'processado', convertedTo: { type: 'workout', id: res.id } })
  })

  it('trip suggestion lands in the right group and section, a confirmar', () => {
    const db = getDB()
    const item = actions.create('brainDump', { text: 'preciso lembrar do hotel de JNB', status: 'inbox' })
    const c = conversionFromIntent(db, item, parseIntent(db, item.text, TODAY)!, TODAY)
    expect(c.key).toBe('tripItems')
    expect(c.data).toMatchObject({ tripId: 'trip-za', group: 'Johannesburg / Safari', section: 'hospedagem', status: 'a_confirmar' })
  })

  it('waiting + pet + content carry their links', () => {
    const db = getDB()
    const mk = (text: string) => actions.create('brainDump', { text, status: 'inbox' })
    const w = conversionFromIntent(db, mk('Fran tá me devendo retorno'), parseIntent(db, 'Fran tá me devendo retorno', TODAY)!, TODAY)
    expect(w.data).toMatchObject({ status: 'waiting', projectId: 'p-ff', context: 'trabalho', waiting: { who: 'Fran', since: TODAY } })
    const l = conversionFromIntent(db, mk('comprar coisa da Luna'), parseIntent(db, 'comprar coisa da Luna', TODAY)!, TODAY)
    expect(l.data).toMatchObject({ context: 'luna', adminKind: 'comprar' })
    const c = conversionFromIntent(db, mk('ideia de reels na bike'), parseIntent(db, 'ideia de reels na bike', TODAY)!, TODAY)
    expect(c.data).toMatchObject({ stage: 'ideia', projectId: 'p-ugc', category: 'bike' })
  })

  it('works on the real seed without crashing', () => {
    const seed = buildSeed(TODAY)
    for (const t of ['quinta quero correr no almoço', 'preciso lembrar do hotel de JNB', 'Fran tá me devendo retorno', 'comprar coisa da Luna', 'esse livro parece massa', 'ideia de reels na bike']) {
      expect(parseIntent(seed, t, TODAY)).toBeDefined()
    }
  })
})
