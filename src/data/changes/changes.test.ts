/**
 * Central Universal (marina-os/changes@1): preview writes nothing; create/update/complete/move; idempotent;
 * conflicts; fields preserved; delete only with her yes; locked areas refused; B.O. stages reconciled;
 * ambiguous → review; undo; ChatGPT round trip; survives reopening the app and a backup round trip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actions, detachStorage, flushNow, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { undoBatch } from '../briefing/apply'
import { lockSession, unlockSession } from '@/app/lock-store'
import { makeBackup, parseBackupText, type BackupPreview } from '@/features/settings/backup'
import { restoreBackup } from '@/features/settings/backup-io'
import { listSnapshots, restoreSnapshot } from '../snapshots'
import { CHANGES_SCHEMA, parseChanges, type Change, type ChangesDoc } from './contract'
import { countPlan, planChanges, planLine } from './plan'
import { applyChangesPlan, importChanges } from './apply'
import { buildContext, CONTEXT_SCHEMA } from './context'

const TODAY = '2026-10-15'
let device: ReturnType<typeof createMemoryAdapter>

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T12:00:00-03:00`))
  device = createMemoryAdapter()
  await hydrate(device)
  lockSession()
})
afterEach(() => {
  detachStorage()
  vi.useRealTimers()
})

const later = (min: number) => vi.setSystemTime(new Date(Date.now() + min * 60_000))
const doc = (changes: Partial<Change>[], extra: Partial<ChangesDoc> = {}): ChangesDoc => {
  const r = parseChanges({ schemaVersion: CHANGES_SCHEMA, generatedAt: new Date().toISOString(), source: 'ChatGPT', changes, ...extra })
  if (!r.ok) throw new Error(r.error)
  return r.doc
}
const run = (d: ChangesDoc, opts: Parameters<typeof importChanges>[1] = {}) => importChanges(d, { today: TODAY, ...opts })
const task = (title: string) => getDB().tasks.find((t) => t.title === title)

describe('contract', () => {
  it('reads JSON pasted with prose/fences and refuses other schemas or huge files', () => {
    const text = 'Aqui está:\n```json\n' + JSON.stringify({ schemaVersion: CHANGES_SCHEMA, generatedAt: '2026-10-15T09:00:00-03:00', source: 'ChatGPT', changes: [] }) + '\n```'
    expect(parseChanges(text).ok).toBe(true)
    expect(parseChanges('{"schemaVersion":"x","changes":[]}')).toMatchObject({ ok: false })
    expect(parseChanges({ schemaVersion: CHANGES_SCHEMA, generatedAt: '2026-10-15T09:00:00Z', changes: Array.from({ length: 201 }, () => ({ op: 'create', type: 'task', fields: { title: 'x' } })) })).toMatchObject({ ok: false })
  })

  it('a broken change is kept as "inválido" (never dropped silently); unknown types are "não suportado ainda"', () => {
    const r = parseChanges({ schemaVersion: CHANGES_SCHEMA, generatedAt: '2026-10-15T09:00:00Z', source: 'x', changes: [{ op: 'explode', type: 'task' }, { op: 'create', type: 'book', fields: { title: 'Duna' } }, { op: 'create', type: 'task', fields: { title: 'x', date: '15/10' } }] })
    if (!r.ok) throw new Error()
    const plan = planChanges(getDB(), r.doc, { today: TODAY }, r.invalid)
    expect(plan.items.map((i) => i.action)).toEqual(['invalid', 'unsupported', 'invalid'])
    expect(plan.items[1].reason).toMatch(/não suportado ainda/)
    expect(plan.items[2].reason).toMatch(/AAAA-MM-DD/)
  })
})

describe('pipeline', () => {
  it('preview writes nothing (memory and device untouched)', async () => {
    await flushNow()
    const before = getDB()
    const stored = JSON.stringify(device.data)
    const t = getDB().tasks.find((x) => x.status === 'todo' && !x.recurrence)!
    const plan = planChanges(getDB(), doc([{ op: 'create', type: 'task', fields: { title: 'Nova', date: TODAY } }, { op: 'complete', type: 'task', id: t.id }, { op: 'delete', type: 'task', id: t.id }]), { today: TODAY })
    expect(countPlan(plan)).toMatchObject({ create: 1, update: 1, delete: 1 })
    expect(planLine(plan)).toMatch(/^1 novo · 1 atualização · 0 já existentes · 0 conflitos · 1 exclusão/)
    expect(getDB()).toBe(before)
    await flushNow()
    expect(JSON.stringify(device.data)).toBe(stored)
  })

  it('create / update / complete / move go through and keep the types distinct', async () => {
    const t = getDB().tasks.find((x) => x.status === 'todo' && !x.recurrence && x.date)!
    const w = getDB().workouts.find((x) => x.status === 'planejado')!
    later(1)
    const r = await run(
      doc([
        { op: 'create', type: 'task', sourceKey: 'k1', fields: { title: 'Ligar pro banco', date: '2026-10-16', priority: 'P1', project: 'Santander' } },
        { op: 'create', type: 'plannedWorkout', sourceKey: 'k2', fields: { date: '2026-10-20', modality: 'Corrida', title: 'Rodagem leve', plannedDurationMin: 40 } },
        { op: 'create', type: 'backlog', sourceKey: 'k3', fields: { title: 'Renovar passaporte', from: '2026-11-01' } },
        { op: 'create', type: 'expectedRevenue', sourceKey: 'k4', fields: { title: 'Freela landing', amount: 1500, date: '2026-10-30' } },
        { op: 'update', type: 'task', id: t.id, fields: { notes: 'pauta enviada' } },
        { op: 'move', type: 'task', id: t.id, fields: { date: '2026-10-17' } },
        { op: 'complete', type: 'plannedWorkout', id: w.id, fields: { durationMin: 50 } },
      ]),
    )
    expect(r.written).toBe(7)
    const db = getDB()
    expect(task('Ligar pro banco')).toMatchObject({ date: '2026-10-16', priority: 'alta', status: 'todo', projectId: 'proj-santander', source: { type: 'changes', sourceKey: 'sk:k1' } })
    expect(db.workouts.find((x) => x.title === 'Rodagem leve')).toMatchObject({ modality: 'corrida', status: 'planejado', plannedDurationMin: 40 })
    expect(db.tasks.some((x) => x.title === 'Rodagem leve' || x.title === 'Renovar passaporte')).toBe(false)
    expect(db.backlogItems.find((b) => b.title === 'Renovar passaporte')).toMatchObject({ kind: 'scheduled', status: 'open', window: { from: '2026-11-01' } })
    expect(db.expenses.find((e) => e.title === 'Freela landing')).toMatchObject({ type: 'income', status: 'expected', expectedAmountCents: 150000, expectedDate: '2026-10-30' })
    expect(db.tasks.find((x) => x.id === t.id)).toMatchObject({ notes: 'pauta enviada', date: '2026-10-17', title: t.title })
    expect(db.workouts.find((x) => x.id === w.id)).toMatchObject({ status: 'feito', durationMin: 50 })
    expect(db.importBatches.at(-1)).toMatchObject({ kind: 'changes', source: 'ChatGPT' })
    // Saved on the device before success.
    expect((device.data as typeof db).tasks.some((x) => x.title === 'Ligar pro banco')).toBe(true)
  })

  it('the same JSON 10 times changes nothing after the first (with and without keys)', async () => {
    const d = doc([
      { op: 'create', type: 'task', fields: { title: 'Sem chave nenhuma', date: '2026-10-16' } },
      { op: 'create', type: 'task', sourceKey: 'com-chave', fields: { title: 'Com chave' } },
      { op: 'create', type: 'plannedMeal', fields: { date: '2026-10-16', slot: 'jantar', description: 'Salmão e arroz' } },
      { op: 'create', type: 'ugcProspect', fields: { name: 'Marca Nova Teste' } },
      { op: 'complete', type: 'task', match: { title: 'Revisar épicos de layout' } },
    ])
    await run(d)
    const once = JSON.stringify({ ...getDB(), importBatches: [] })
    for (let i = 0; i < 10; i++) {
      later(1)
      const r = await run(d)
      expect(r.written).toBe(0)
      expect(countPlan(r.plan)).toMatchObject({ create: 0, update: 0 })
    }
    expect(JSON.stringify({ ...getDB(), importBatches: [] })).toBe(once)
    expect(getDB().tasks.filter((t) => t.title === 'Sem chave nenhuma')).toHaveLength(1)
    expect(getDB().brands.filter((b) => b.name === 'Marca Nova Teste')).toHaveLength(1)
    expect(getDB().importBatches.filter((b) => b.kind === 'changes')).toHaveLength(1)
  })

  it('a record she edited after the file\'s version is a conflict: hers stays unless she picks the file', async () => {
    const t = getDB().tasks.find((x) => x.status === 'todo' && !x.recurrence)!
    const ctx = buildContext(getDB(), { modules: ['tasks'], today: TODAY })
    const version = (ctx.json.modules as Record<string, { id: string; version: string }[]>).tasks.find((x) => x.id === t.id)!.version
    later(5)
    actions.update('tasks', t.id, { title: 'Meu título novo' })
    later(5)
    const d = doc([{ op: 'update', type: 'task', id: t.id, baseVersion: version, fields: { title: 'Título do ChatGPT' } }])
    const r = await run(d)
    expect(r.plan.items[0].action).toBe('conflict')
    expect(r.written).toBe(0)
    expect(getDB().tasks.find((x) => x.id === t.id)?.title).toBe('Meu título novo')
    const forced = await run(d, { confirmed: [0] })
    expect(forced.written).toBe(1)
    expect(getDB().tasks.find((x) => x.id === t.id)?.title).toBe('Título do ChatGPT')
  })

  it('fields not sent are preserved', async () => {
    const t = getDB().tasks.find((x) => x.status === 'todo' && !x.recurrence && x.notes && x.priority)!
    later(1)
    await run(doc([{ op: 'update', type: 'task', id: t.id, fields: { dueDate: '2026-10-31' } }]))
    const after = getDB().tasks.find((x) => x.id === t.id)!
    const { updatedAt: _a, dueDate: _d, ...rest } = after
    const { updatedAt: _b, dueDate: _e, ...was } = t
    expect(rest).toEqual(was)
    expect(after.dueDate).toBe('2026-10-31')
  })

  it('never reopens done, never resurrects archived, refuses status via update', async () => {
    const [a, b] = getDB().tasks.filter((x) => x.status === 'todo' && !x.recurrence)
    actions.update('tasks', a.id, { status: 'done' })
    actions.update('tasks', b.id, { status: 'archived' })
    later(1)
    const r = await run(doc([{ op: 'update', type: 'task', id: a.id, fields: { status: 'todo' } }, { op: 'move', type: 'task', id: b.id, fields: { date: TODAY } }, { op: 'create', type: 'task', fields: { title: b.title } }, { op: 'update', type: 'expense', match: { title: 'x', date: TODAY }, fields: { status: 'paid' } }]))
    expect(r.plan.items.map((i) => i.action)).toEqual(['refused', 'refused', 'unchanged', 'invalid'])
    expect(getDB().tasks.find((x) => x.id === a.id)?.status).toBe('done')
    expect(getDB().tasks.find((x) => x.id === b.id)?.status).toBe('archived')
    expect(getDB().tasks.filter((x) => x.title === b.title)).toHaveLength(1)
  })

  it('delete only with her explicit yes for that item (default off)', async () => {
    const t = getDB().tasks.find((x) => x.status === 'todo' && !x.recurrence)!
    later(1)
    const d = doc([{ op: 'delete', type: 'task', id: t.id }])
    const r = await run(d)
    expect(r.plan.items[0]).toMatchObject({ action: 'delete', needsConfirm: true, confirmed: false })
    expect(r.written).toBe(0)
    expect(getDB().tasks.some((x) => x.id === t.id)).toBe(true)
    const yes = await run(d, { confirmed: [0] })
    expect(yes.written).toBe(1)
    expect(getDB().tasks.some((x) => x.id === t.id)).toBe(false)
    // Undo brings it back exactly.
    undoBatch(yes.batchId!)
    expect(getDB().tasks.find((x) => x.id === t.id)?.title).toBe(t.title)
  })

  it('a locked area is refused until unlocked', async () => {
    actions.setProfile({ privacyLock: { enabled: true, areas: ['dinheiro'], pinHash: 'x', pinSalt: 'y', relockMinutes: 5 } })
    lockSession()
    later(1)
    const d = doc([{ op: 'create', type: 'expense', fields: { title: 'Padaria', amountCents: 1890, date: TODAY, category: 'Mercado' } }])
    const r = await run(d)
    expect(r.plan.items[0]).toMatchObject({ action: 'blocked', lock: 'dinheiro' })
    expect(getDB().expenses.some((e) => e.title === 'Padaria')).toBe(false)
    unlockSession()
    const ok = await run(d)
    expect(ok.written).toBe(1)
    expect(getDB().expenses.find((e) => e.title === 'Padaria')).toMatchObject({ amountCents: 1890, categoryId: 'cat-mercado', status: 'paid' })
    lockSession()
  })

  it('B.O. 10/11/12: abrir → verificar → regularizar are ONE obligation', async () => {
    const bo = getDB().tasks.find((t) => t.title === 'Abrir B.O de pedágio')!
    later(1)
    const r = await run(
      doc([
        { op: 'create', type: 'task', fields: { title: 'Verificar B.O. de pedágio', date: '2026-10-11' } },
        { op: 'create', type: 'task', fields: { title: 'Regularizar B.O. de pedágio', date: '2026-10-12', doneCriteria: 'multa paga' } },
        { op: 'complete', type: 'task', match: { title: 'Regularizar B.O. de pedágio' } },
      ]),
    )
    expect(r.plan.items.map((i) => i.targetId)).toEqual([bo.id, bo.id, bo.id])
    expect(getDB().tasks.filter((t) => /B\.?O\.? de ped/.test(t.title))).toHaveLength(1)
    expect(getDB().tasks.find((t) => t.id === bo.id)).toMatchObject({ status: 'done', date: '2026-10-10', doneCriteria: 'B.O aberto e comprovante salvo.' })
  })

  it('ambiguous → "precisa de revisão" with vincular / criar novo / ignorar', async () => {
    actions.create('tasks', { title: 'Pagar IPVA', status: 'todo', date: '2026-10-16', order: 1 })
    actions.create('tasks', { title: 'Pagar IPVA', status: 'todo', date: '2026-10-20', order: 2 })
    later(1)
    const d = doc([{ op: 'complete', type: 'task', match: { title: 'Pagar IPVA' } }])
    const plan = planChanges(getDB(), d, { today: TODAY })
    expect(plan.items[0].action).toBe('review')
    expect(plan.items[0].candidates).toHaveLength(2)
    const pick = plan.items[0].candidates![1].id
    expect(planChanges(getDB(), d, { today: TODAY, choices: { 0: 'ignore' } }).items[0].action).toBe('unchanged')
    const r = await run(d, { choices: { 0: pick } })
    expect(r.written).toBe(1)
    expect(getDB().tasks.find((t) => t.id === pick)?.status).toBe('done')
    expect(getDB().tasks.filter((t) => t.title === 'Pagar IPVA' && t.status === 'todo')).toHaveLength(1)
    // A match on the date settles it without asking.
    expect(planChanges(getDB(), doc([{ op: 'move', type: 'task', match: { title: 'Pagar IPVA', date: '2026-10-16' }, fields: { date: '2026-10-18' } }]), { today: TODAY }).items[0].action).toBe('move')
  })

  it('undo restores everything the import wrote (domain-op side effects included), and a snapshot was taken', async () => {
    const before = JSON.stringify({ ...getDB(), importBatches: [] })
    const t = getDB().tasks.find((x) => x.status === 'todo' && !x.recurrence)!
    later(1)
    const r = await run(doc([{ op: 'create', type: 'receivedRevenue', fields: { title: 'Freela X', amountCents: 50000, date: TODAY } }, { op: 'complete', type: 'task', id: t.id }, { op: 'create', type: 'ugcProspect', fields: { name: 'Marca Desfeita' } }]))
    expect(r.written).toBe(3)
    expect(r.snapshot?.reason).toMatch(/antes de importar/)
    later(1)
    const u = undoBatch(r.batchId!)
    expect(u.keptEdited).toEqual([])
    const after = getDB()
    expect(after.expenses.some((e) => e.title === 'Freela X')).toBe(false)
    expect(after.brands.some((b) => b.name === 'Marca Desfeita')).toBe(false)
    expect(after.tasks.find((x) => x.id === t.id)?.status).toBe('todo')
    const strip = (s: string) => JSON.parse(s, (k, v) => (k === 'updatedAt' ? undefined : v))
    expect(strip(JSON.stringify({ ...after, importBatches: [] }))).toEqual(strip(before))
    // The snapshot restores the pre-import state too.
    const snaps = await listSnapshots()
    expect(snaps[0].id).toBe(r.snapshot!.id)
    await restoreSnapshot(snaps[0].id)
    expect(getDB().tasks.find((x) => x.id === t.id)?.status).toBe('todo')
  })

  it('reopening the app (hydrate) and a backup round trip keep what was imported', async () => {
    later(1)
    await run(doc([{ op: 'create', type: 'task', sourceKey: 'persist', fields: { title: 'Persistida', date: TODAY } }, { op: 'create', type: 'completedWorkout', fields: { date: TODAY, modality: 'natacao', durationMin: 45 } }]))
    await hydrate(device)
    expect(task('Persistida')).toBeTruthy()
    expect(getDB().workouts.filter((w) => w.date === TODAY && w.modality === 'natacao')).toEqual([expect.objectContaining({ status: 'feito', durationMin: 45 })])
    const text = JSON.stringify(makeBackup(getDB()))
    const fresh = createMemoryAdapter()
    await hydrate(fresh)
    const p = parseBackupText(text)
    expect(p.ok).toBe(true)
    await restoreBackup(p as BackupPreview)
    await hydrate(fresh)
    expect(task('Persistida')).toBeTruthy()
    // Identity survives too: the same file again is a no-op on the restored device.
    later(1)
    expect((await run(doc([{ op: 'create', type: 'task', sourceKey: 'persist', fields: { title: 'Persistida', date: TODAY } }]))).written).toBe(0)
  })
})

describe('ChatGPT context (marina-os/context@1)', () => {
  it('excludes sensitive fields by default; toggles bring them; locked modules stay out', () => {
    actions.create('tasks', { title: 'Com nota', notes: 'segredo', status: 'todo', order: 1 })
    const ctx = buildContext(getDB(), { modules: ['tasks', 'ugc', 'revenue', 'meals'], today: TODAY })
    expect(ctx.json.schemaVersion).toBe(CONTEXT_SCHEMA)
    expect(ctx.text).not.toContain('segredo')
    expect(ctx.text).not.toMatch(/"amountCents"|"estimatedValueCents"|"description"|"website"/)
    expect(ctx.json.instructions).toMatch(/SOMENTE com um JSON marina-os\/changes@1/)
    const all = buildContext(getDB(), { modules: ['tasks', 'revenue'], include: ['notes', 'money'], today: TODAY })
    expect(all.text).toContain('segredo')
    expect(all.text).toContain('"amountCents"')
    const locked = buildContext(getDB(), { modules: ['tasks', 'revenue'], today: TODAY, isLocked: (a) => a === 'dinheiro' })
    expect(locked.counts.revenue).toBeUndefined()
  })

  it('round trip: export → ChatGPT edits using the ids → import → expected state', async () => {
    const ctx = buildContext(getDB(), { modules: ['tasks', 'workouts', 'projects'], today: TODAY })
    const mods = JSON.parse(ctx.text).modules as Record<string, { id: string; version: string; title?: string; status?: string; date?: string }[]>
    const [a, b] = mods.tasks.filter((t) => t.status === 'todo')
    const w = mods.workouts.find((x) => x.status === 'planejado')!
    later(10)
    // What ChatGPT answers (it only knows the context).
    const reply = JSON.stringify({
      schemaVersion: CHANGES_SCHEMA,
      generatedAt: new Date().toISOString(),
      source: 'ChatGPT',
      changes: [
        { op: 'complete', type: 'task', id: a.id, baseVersion: a.version },
        { op: 'move', type: 'task', id: b.id, baseVersion: b.version, fields: { date: '2026-10-19' } },
        { op: 'move', type: 'plannedWorkout', id: w.id, baseVersion: w.version, fields: { date: '2026-10-21', time: '06:00' } },
        { op: 'create', type: 'task', sourceKey: 'chatgpt-2026-10-15-orcamento', fields: { title: 'Revisar orçamento do mês', date: '2026-10-16', priority: 'media' } },
      ],
    })
    const parsed = parseChanges('```json\n' + reply + '\n```')
    if (!parsed.ok) throw new Error(parsed.error)
    const r = await run(parsed.doc)
    expect(r.written).toBe(4)
    const db = getDB()
    expect(db.tasks.find((t) => t.id === a.id)?.status).toBe('done')
    expect(db.tasks.find((t) => t.id === b.id)?.date).toBe('2026-10-19')
    expect(db.workouts.find((x) => x.id === w.id)).toMatchObject({ date: '2026-10-21', time: '06:00', status: 'planejado' })
    expect(task('Revisar orçamento do mês')).toMatchObject({ date: '2026-10-16', priority: 'media' })
    // Sent again: nothing changes.
    later(1)
    const again = parseChanges(reply)
    if (!again.ok) throw new Error(again.error)
    expect((await run(again.doc)).written).toBe(0)
  })

  it('applyChangesPlan writes nothing for a plan with only unchanged/refused items', () => {
    const plan = planChanges(getDB(), doc([{ op: 'update', type: 'task', id: 'nao-existe', fields: { title: 'x' } }]), { today: TODAY })
    const before = getDB()
    expect(applyChangesPlan(plan)).toMatchObject({ written: 0 })
    expect(getDB()).toBe(before)
  })
})
