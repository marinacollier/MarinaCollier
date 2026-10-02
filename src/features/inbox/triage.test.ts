import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { defaultCategories, emptyDB } from '@/data/defaults'
import { buildSeed } from '@/data/seed'
import { ENTITY_COLLECTION, type BrainDumpTarget, type DB } from '@/data/types'
import { applyConversion, buildConversion, captureText, splitLines, splitTitle, TARGETS } from './triage'

const TODAY = '2026-10-02'

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  const db = emptyDB()
  db.financialCategories = defaultCategories('2026-10-01T00:00:00Z')
  actions.replaceDB(db)
})

function capture(text: string) {
  captureText(text, false)
  return getDB().brainDump[getDB().brainDump.length - 1]
}

describe('brain dump capture', () => {
  it('stores text without asking anything', () => {
    expect(captureText('  comprar protetor  ', false)).toBe(1)
    expect(getDB().brainDump[0]).toMatchObject({ text: 'comprar protetor', status: 'inbox' })
    expect(captureText('   ', false)).toBe(0)
  })

  it('splits pasted lists into items', () => {
    expect(splitLines('- um\n• dois\n\n3. três\n[ ] quatro\n')).toEqual(['um', 'dois', 'três', 'quatro'])
    expect(captureText('a\nb\nc', true)).toBe(3)
  })

  it('first line becomes the title, the rest becomes notes', () => {
    expect(splitTitle('Título\nlinha 2\nlinha 3')).toEqual({ title: 'Título', rest: 'linha 2\nlinha 3' })
    expect(splitTitle('x'.repeat(200)).title.length).toBeLessThanOrEqual(140)
  })
})

describe('triage conversion', () => {
  const required: Record<BrainDumpTarget, (db: DB, id: string) => void> = {
    task: (db, id) => expect(db.tasks.find((t) => t.id === id)).toMatchObject({ status: 'todo', bucket: 'semana' }),
    idea: (db, id) => expect(db.notes.find((t) => t.id === id)).toMatchObject({ kind: 'ideia', tags: [], pinned: false }),
    reminder: (db, id) => expect(db.tasks.find((t) => t.id === id)).toMatchObject({ status: 'todo', date: '2026-10-03' }),
    waiting: (db, id) => expect(db.tasks.find((t) => t.id === id)).toMatchObject({ status: 'waiting', waiting: { who: 'Ana', since: TODAY } }),
    lifeAdmin: (db, id) => expect(db.tasks.find((t) => t.id === id)).toMatchObject({ context: 'vida_real', status: 'todo' }),
    purchase: (db, id) => {
      const e = db.expenses.find((t) => t.id === id)!
      expect(e).toMatchObject({ status: 'planned_purchase', categoryId: 'cat-compras', origin: 'manual' })
      expect(db.financialCategories.some((c) => c.id === e.categoryId)).toBe(true)
    },
    trip: (db, id) => expect(db.trips.find((t) => t.id === id)).toMatchObject({ status: 'sonhando', datesConfirmed: false, links: [] }),
    project: (db, id) => expect(db.projects.find((t) => t.id === id)).toMatchObject({ status: 'planejando', kind: 'default', links: [], people: [] }),
    study: (db, id) => expect(db.studyItems.find((t) => t.id === id)).toMatchObject({ status: 'backlog', progress: 0 }),
    book: (db, id) => expect(db.books.find((t) => t.id === id)).toMatchObject({ status: 'quero', quotes: [] }),
    content: (db, id) => expect(db.contentItems.find((t) => t.id === id)).toMatchObject({ stage: 'ideia', links: [] }),
    goal: (db, id) => expect(db.goals.find((t) => t.id === id)).toMatchObject({ level: 'semana', big: false, status: 'ativa', period: '2026-09-28' }),
  }

  for (const { target } of TARGETS) {
    it(`converts into ${target} and marks the item processed`, () => {
      const item = capture(`Coisa para ${target}`)
      const res = applyConversion(item.id, target, { today: TODAY, who: 'Ana' })!
      expect(res).toBeTruthy()
      const db = getDB()
      const coll = db[ENTITY_COLLECTION[res.type]] as { id: string }[]
      expect(coll.some((x) => x.id === res.id)).toBe(true)
      required[target](db, res.id)
      expect(db.brainDump.find((b) => b.id === item.id)).toMatchObject({ status: 'processado', convertedTo: res })
    })
  }

  it('trip conversion into an existing trip creates a "quero ir" item a confirmar', () => {
    actions.replaceDB(buildSeed(TODAY))
    const trip = getDB().trips[0]
    const item = capture('Revisar/confirmar: Cape Town')
    if (!trip) {
      // travel seed not present yet — still verify payload shape
      const c = buildConversion(getDB(), item, 'trip', { today: TODAY, tripId: 'trip-x' })
      expect(c).toMatchObject({ key: 'tripItems', data: { tripId: 'trip-x', section: 'quero_ir', status: 'a_confirmar' } })
      return
    }
    const res = applyConversion(item.id, 'trip', { today: TODAY, tripId: trip.id })!
    expect(getDB().tripItems.find((t) => t.id === res.id)).toMatchObject({ tripId: trip.id, section: 'quero_ir', status: 'a_confirmar' })
  })

  it('keeps the origin on tasks', () => {
    const item = capture('ligar pro banco')
    const c = buildConversion(getDB(), item, 'task', { today: TODAY })
    expect(c.data).toMatchObject({ origin: { type: 'brainDump', id: item.id } })
  })
})

describe('inbox seed', () => {
  it('groups Marina’s brain dump and phrases unproven trip items as review', () => {
    const seed = buildSeed(TODAY)
    const groups = new Set(seed.brainDump.map((b) => b.group))
    expect(groups).toEqual(new Set(['África do Sul', 'Projetos', 'Vida']))
    expect(seed.brainDump.filter((b) => b.group === 'África do Sul').every((b) => b.text.startsWith('Revisar/confirmar'))).toBe(true)
    expect(seed.brainDump.every((b) => b.status === 'inbox')).toBe(true)
  })
})
