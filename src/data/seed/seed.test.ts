import { describe, expect, it } from 'vitest'
import { ENTITY_COLLECTION, type CollectionKey, type DB } from '../types'
import { buildSeed, LIFE_SEED_VERSION } from '.'
import { applyLifeSeed, isSeedRecordId } from './migrate'
import { MEMORY_SEED } from './memory'

const T = '2026-10-02'
const COLLECTIONS = (db: DB) => (Object.keys(db) as (keyof DB)[]).filter((k) => Array.isArray(db[k])) as CollectionKey[]

/** Every text field a person would read on a seeded record. */
function texts(db: DB): string[] {
  const out: string[] = []
  for (const k of COLLECTIONS(db)) {
    for (const r of db[k] as unknown as Record<string, unknown>[]) {
      for (const f of ['title', 'name', 'text', 'description', 'summary', 'notes']) if (typeof r[f] === 'string') out.push(r[f] as string)
    }
  }
  return out
}

describe('life seed v6 — real life only', () => {
  const db = buildSeed(T)

  it('is version 8 (contracts + career North Star and activities)', () => {
    expect(LIFE_SEED_VERSION).toBe(8)
    expect(db.profile.seedVersion).toBe(8)
  })

  it('no generic / example records anywhere', () => {
    const generic = /\b(exemplo|example|lorem|ipsum|placeholder)\b|Projeto [A-Z0-9]\b|Curso \d|Livro \d|Ler livro|Fazer exerc[ií]cio|Temas de IA para aprofundar|Liderança — o que quero desenvolver/i
    const hits = texts(db).filter((t) => generic.test(t))
    expect(hits).toEqual([])
  })

  it('every record (except default categories / integrations) has a stable seed id', () => {
    const again = buildSeed(T)
    for (const k of COLLECTIONS(db)) {
      if (k === 'financialCategories' || k === 'integrations') continue
      const ids = (db[k] as { id: string }[]).map((r) => r.id)
      expect(ids.every(isSeedRecordId), k).toBe(true)
      expect((again[k] as { id: string }[]).map((r) => r.id), k).toEqual(ids)
    }
  })

  it('Continuous Discovery Habits is being read, at chapter 10', () => {
    const reading = db.books.filter((b) => b.status === 'lendo')
    expect(reading.map((b) => [b.title, b.author, b.currentChapter])).toEqual([['Continuous Discovery Habits', 'Teresa Torres', 'Chapter 10 — Testing Assumptions']])
  })

  it('references (newsletters, temas) are never tasks', () => {
    const refTitles = new Set(db.studyItems.filter((i) => i.reference).map((i) => i.title.toLowerCase()))
    expect(refTitles.size).toBeGreaterThanOrEqual(3)
    expect(db.tasks.some((t) => refTitles.has(t.title.toLowerCase()) || /newsletter|product talk|lenny|pragmatic/i.test(t.title))).toBe(false)
  })

  it('the English class is not invented: no timed English event in the seed', () => {
    expect(db.events.some((e) => /ingl[eê]s|cambly|english/i.test(e.title))).toBe(false)
  })
})

describe('Lumos memory seed', () => {
  const db = buildSeed(T)

  it('every item has a unique key, an area and a kind; confirmed, from the seed', () => {
    expect(db.memory.length).toBe(MEMORY_SEED.length)
    const keys = db.memory.map((m) => m.key)
    expect(keys.every(Boolean)).toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
    expect(db.memory.every((m) => m.area && m.kind && m.text.trim().length > 5)).toBe(true)
    expect(db.memory.every((m) => m.status === 'confirmed' && m.source === 'seed')).toBe(true)
    expect(db.memory.every((m) => m.id === `seed:memory:${m.key!.replace(/[^a-z0-9]+/g, '-')}`)).toBe(true)
  })

  it('separates facts, preferences and current state (history starts empty — nothing was given)', () => {
    const kinds = new Set(db.memory.map((m) => m.kind))
    expect([...kinds].sort()).toEqual(['fact', 'preference', 'state'])
    const byKey = new Map(db.memory.map((m) => [m.key, m]))
    expect(byKey.get('home.city')?.text).toMatch(/São Paulo/)
    expect(byKey.get('luna.breed')?.text).toMatch(/Border Collie/)
    expect(byKey.get('book.current')).toMatchObject({ kind: 'state', area: 'leitura' })
    expect(byKey.get('food.no.compensation')?.kind).toBe('preference')
    expect(byKey.get('work.presencial')?.text).toMatch(/Interlagos/)
    expect(byKey.get('trip.next')?.text).toMatch(/22\/10 → 16\/11/)
  })

  it('refs point at records that exist in the seed', () => {
    for (const m of db.memory) {
      if (!m.ref) continue
      const list = db[ENTITY_COLLECTION[m.ref.type]] as { id: string }[]
      expect(list.some((r) => r.id === m.ref!.id), m.key).toBe(true)
    }
  })

  it('reaches an existing v5 install through the migration', () => {
    const old = buildSeed(T)
    old.profile.seedVersion = 5
    old.memory = []
    expect(applyLifeSeed(old, T).memory.length).toBe(MEMORY_SEED.length)
  })
})

describe('migration retires generic seed records the life seed dropped', () => {
  it('untouched dropped seed records go; edited ones, her own records and past seed workouts stay', () => {
    const old = buildSeed(T)
    old.profile.seedVersion = 5
    const stamp = '2026-10-01T10:00:00.000Z'
    const edited = '2026-10-02T09:00:00.000Z'
    old.studyItems.push(
      { id: 'seed:learning:temas-ia', title: 'Temas de IA para aprofundar', kind: 'tema', status: 'backlog', progress: 0, order: 9, createdAt: stamp, updatedAt: stamp },
      { id: 'seed:learning:pos-disciplina-atual', title: 'Pós — Estatística', kind: 'curso', status: 'estudando', progress: 20, order: 9, createdAt: stamp, updatedAt: edited },
      { id: 'mine-1', title: 'Curso dela', kind: 'curso', status: 'backlog', progress: 0, order: 9, createdAt: stamp, updatedAt: stamp },
    )
    const pastWorkout = { ...old.workouts[0], id: 'seed:body:w-2026-09-25-natacao', date: '2026-09-25', createdAt: stamp, updatedAt: stamp }
    old.workouts.push(pastWorkout)
    const next = applyLifeSeed(old, T)
    const ids = next.studyItems.map((i) => i.id)
    expect(ids).not.toContain('seed:learning:temas-ia')
    expect(ids).toContain('seed:learning:pos-disciplina-atual')
    expect(ids).toContain('mine-1')
    expect(next.workouts.some((w) => w.id === pastWorkout.id)).toBe(true)
  })
})

describe('migration does not duplicate what Marina already has', () => {
  it('her own copy of the book (any id) and a memory key Lumos already learned are kept, not duplicated', () => {
    const old = buildSeed(T)
    old.profile.seedVersion = 5
    const ts = '2026-10-01T10:00:00.000Z'
    old.books = [{ id: 'mine-cdh', title: 'continuous discovery habits', status: 'lendo', progress: 40, quotes: [], order: 0, createdAt: ts, updatedAt: ts }]
    old.memory = [{ id: 'mem-1', key: 'yoga.weekday', kind: 'state', area: 'esportes', text: 'Yoga na quinta agora.', status: 'confirmed', source: 'marina', createdAt: ts, updatedAt: ts }]
    const next = applyLifeSeed(old, T)
    expect(next.books.map((b) => b.id)).toEqual(['mine-cdh'])
    expect(next.memory.filter((m) => m.key === 'yoga.weekday').map((m) => m.text)).toEqual(['Yoga na quinta agora.'])
    expect(next.memory.length).toBe(MEMORY_SEED.length)
  })
})
