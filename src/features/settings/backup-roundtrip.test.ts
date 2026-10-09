/**
 * Backup is only "ready" when a restore brings everything back: create data in every area →
 * export → wipe → import → reload from storage → same data, same relations, nothing duplicated.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, flushNow, getDB, hydrate } from '@/data/store'
import { createMemoryAdapter } from '@/data/storage'
import { buildSeed } from '@/data/seed'
import type { DB } from '@/data/types'
import { checksumOf, makeBackup, validateBackup, type BackupPreview } from './backup'
import { daysSinceBackup, restoreBackup } from './backup-io'

const TODAY = '2026-10-09'

/** Writes something real in each area, through the same actions the UI uses. */
function liveALittle() {
  const task = actions.create('tasks', { title: 'Revisar proposta FashionFinder', status: 'todo', date: TODAY, time: '10:00', order: 1 })
  const recurring = actions.create('tasks', { title: 'Inglês executivo', status: 'todo', recurrence: { kind: 'weekly', weekdays: [1, 3, 5] }, order: 2 })
  actions.toggleOccurrence('task', recurring.id, TODAY)
  const routine = actions.create('routines', { name: 'Rotina de teste', period: 'manha', order: 9, active: true })
  const item = actions.create('routineItems', { routineId: routine.id, title: 'Respirar', recurrence: { kind: 'daily' }, order: 0, active: true, time: '04:45' })
  actions.toggleOccurrence('routineItem', item.id, TODAY)
  const workout = actions.create('workouts', { date: TODAY, time: '06:00', modality: 'corrida', status: 'feito', order: 0, durationMin: 50 })
  actions.create('meals', {
    date: TODAY,
    slot: 'extra',
    description: 'YoPRO',
    done: true,
    tags: ['proteina'],
    consumedAt: `${TODAY}T14:30:00.000-03:00`,
    foods: [{ name: 'YoPRO', qty: 1, confidence: 'label', nutrients: { kcal: 150, protein: 25, carbs: 9, fat: 2 } }],
    workoutId: workout.id,
  })
  const book = getDB().books[0]
  if (book) actions.update('books', book.id, { status: 'finalizado', endDate: TODAY, progress: 100 })
  const goal = actions.create('goals', { level: 'maior', title: 'Head of Product 2027', category: 'profissional', big: true, status: 'ativa', order: 0 })
  actions.create('goals', { level: 'semana', title: 'Q4: 3 conversas de networking', category: 'profissional', big: false, status: 'ativa', parentId: goal.id, order: 1 })
  actions.create('wins', { date: TODAY, title: 'Busca por embeddings no ar', kind: 'entrega', projectId: getDB().projects[0]?.id })
  const cat = getDB().financialCategories[0]
  if (cat) actions.create('expenses', { title: 'Mercado', amountCents: 18990, date: TODAY, categoryId: cat.id, status: 'paid', origin: 'manual' })
  actions.create('pantry', { name: 'frango grelhado', kind: 'preparado', portions: 6, remaining: 6, madeAt: TODAY })
  actions.create('memory', { kind: 'fact', area: 'luna', text: 'Luna é Border Collie', key: 'luna.raca', status: 'confirmed', source: 'marina' })
  actions.create('scheduleOverrides', { date: TODAY, refType: 'routineItem', refId: item.id, time: '05:10', by: 'marina' })
  actions.create('lifeLog', { at: `${TODAY}T15:00:00.000-03:00`, date: TODAY, kind: 'done', title: 'Correu 50 min', by: 'marina', provenance: 'user' })
  return { task, recurring, item, routine, workout, goal }
}

const counts = (db: DB) =>
  Object.fromEntries(Object.entries(db).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]))

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed(TODAY))
})

describe('backup → restore round trip', () => {
  it('everything comes back after wiping the device: tasks, routines, trainings, food, books, career goals, money, relations', async () => {
    const made = liveALittle()
    await flushNow()
    const before = structuredClone(getDB())

    // Export (what goes into the file) — through text, like the real file.
    const text = JSON.stringify(makeBackup(getDB(), new Date(`${TODAY}T18:00:00Z`)), null, 2)

    // Wipe: a brand-new, empty device.
    const device = createMemoryAdapter()
    await hydrate(device)
    expect(getDB().tasks.some((t) => t.id === made.task.id)).toBe(false)

    // Import.
    const preview = validateBackup(JSON.parse(text))
    expect(preview.ok).toBe(true)
    await restoreBackup(preview as BackupPreview)

    // Reopen the app: read back from storage, not from memory.
    await hydrate(device)
    const after = getDB()
    expect(counts(after)).toEqual(counts(before))
    for (const key of ['tasks', 'occurrences', 'routines', 'routineItems', 'workouts', 'meals', 'books', 'goals', 'wins', 'expenses', 'pantry', 'memory', 'scheduleOverrides', 'lifeLog'] as const)
      expect(after[key], key).toEqual(before[key])

    // Relations still point at real records.
    const occ = after.occurrences.find((o) => o.parentType === 'task' && o.parentId === made.recurring.id)
    expect(occ?.date).toBe(TODAY)
    expect(after.routineItems.find((i) => i.id === made.item.id)?.routineId).toBe(made.routine.id)
    expect(after.meals.find((m) => m.description === 'YoPRO')?.workoutId).toBe(made.workout.id)
    expect(after.goals.find((g) => g.parentId === made.goal.id)?.title).toMatch(/networking/)
    expect(after.scheduleOverrides[0].refId).toBe(made.item.id)
  })

  it('restoring the same file twice never duplicates anything', async () => {
    liveALittle()
    const text = JSON.stringify(makeBackup(getDB()))
    const preview = validateBackup(JSON.parse(text)) as BackupPreview
    await restoreBackup(preview)
    const once = counts(getDB())
    await restoreBackup(validateBackup(JSON.parse(text)) as BackupPreview)
    expect(counts(getDB())).toEqual(once)
  })

  it('a file with the same id twice keeps one copy (the newest)', () => {
    const db = getDB()
    const t = db.tasks[0]
    const raw = { ...db, tasks: [...db.tasks, { ...t, title: 'versão nova', updatedAt: '2099-01-01T00:00:00.000Z' }] }
    const preview = validateBackup(raw) as BackupPreview
    expect(preview.ok).toBe(true)
    expect(preview.duplicatesRemoved).toBe(1)
    expect(preview.db.tasks.filter((x) => x.id === t.id)).toHaveLength(1)
    expect(preview.db.tasks.find((x) => x.id === t.id)?.title).toBe('versão nova')
  })

  it('a hand-edited or truncated file is refused with a clear message, and nothing changes', () => {
    const file = makeBackup(getDB())
    const edited = { ...file, db: { ...file.db, tasks: [] } }
    const r = validateBackup(JSON.parse(JSON.stringify(edited)))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/alterado ou está incompleto/)
    expect(() => JSON.parse(JSON.stringify(file).slice(0, 500))).toThrow()
    expect(validateBackup({ app: 'outro' }).ok).toBe(false)
    expect(validateBackup({ app: 'marina-os', schemaVersion: 999, db: file.db }).ok).toBe(false)
  })

  it('the file is versioned and self-describing', () => {
    const file = makeBackup(getDB())
    expect(file).toMatchObject({ app: 'marina-os', format: 2, schemaVersion: getDB().schemaVersion, seedVersion: getDB().profile.seedVersion })
    expect(file.counts?.tasks).toBe(getDB().tasks.length)
    expect(file.checksum).toBe(checksumOf(JSON.stringify(file.db)))
  })

  it('relations that point nowhere are reported, not silently dropped', () => {
    const db = getDB()
    const raw = { ...db, routineItems: [...db.routineItems, { ...db.routineItems[0], id: 'orphan', routineId: 'gone' }] }
    const preview = validateBackup(raw) as BackupPreview
    expect(preview.warnings).toEqual(['1 itens de rotina sem rotina'])
  })

  it('days since backup (Lumos reminder)', () => {
    expect(daysSinceBackup({ lastBackupAt: '2026-09-07T12:00:00Z' }, new Date('2026-10-09T12:00:00Z'))).toBe(32)
    expect(daysSinceBackup({}, new Date())).toBeUndefined()
  })
})
