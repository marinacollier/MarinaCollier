/**
 * Conferidor de backup — runs OUTSIDE the app, on a computer, never touches her device.
 *
 *   npx vite-node scripts/verify-backup.ts <backup.json> [outro-backup.json]
 *
 * 1. validates the file (checksum, schema, ids) with the same code the app uses to import;
 * 2. counts records per collection and lists broken links;
 * 3. restores it into an isolated in-memory store (same migrations as the app), reopens it,
 *    and compares every record by id + content (nothing may be lost or changed on the way);
 * 4. shows the trip items' status (to answer "confirmado" vs "a confirmar" with evidence);
 * 5. with two files: what differs between them, record by record (e.g. Claude app vs Safari).
 * Exit code 1 when anything does not match.
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { parseBackupText, COLLECTION_KEYS, type BackupPreview } from '../src/features/settings/backup'
import { actions, detachStorage, flushNow, getDB, hydrate } from '../src/data/store'
import { createMemoryAdapter } from '../src/data/storage'
import type { DB } from '../src/data/types'

type Rec = { id: string; updatedAt?: string; [k: string]: unknown }
const list = (db: DB, k: string) => ((db as unknown as Record<string, Rec[]>)[k] ?? []) as Rec[]
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x))

function load(path: string): BackupPreview {
  const r = parseBackupText(readFileSync(path, 'utf8'))
  if (!r.ok) {
    console.error(`✗ ${path}: ${r.error}`)
    process.exit(1)
  }
  return r
}

async function restoreAndCompare(p: BackupPreview): Promise<string[]> {
  const device = createMemoryAdapter()
  await hydrate(device)
  actions.replaceDB(p.db)
  await flushNow()
  await hydrate(device) // reopen
  const after = getDB()
  detachStorage()
  const problems: string[] = []
  for (const k of COLLECTION_KEYS) {
    const before = new Map(list(p.db, k).map((r) => [r.id, r]))
    const now = new Map(list(after, k).map((r) => [r.id, r]))
    for (const [id, r] of before) {
      const a = now.get(id)
      if (!a) problems.push(`${k}/${id} sumiu na restauração`)
      else if (stable(a) !== stable(r)) problems.push(`${k}/${id} mudou na restauração`)
    }
    const added = [...now.keys()].filter((id) => !before.has(id))
    if (added.length) problems.push(`${k}: ${added.length} registro(s) a mais depois de abrir (migração/seed): ${added.slice(0, 5).join(', ')}`)
  }
  return problems
}

function tripReport(db: DB) {
  for (const t of db.trips ?? []) {
    const items = (db.tripItems ?? []).filter((i) => i.tripId === t.id)
    const by = new Map<string, number>()
    for (const i of items) by.set(String((i as unknown as Rec).status ?? '—'), (by.get(String((i as unknown as Rec).status ?? '—')) ?? 0) + 1)
    console.log(`  ${t.name}: ${items.length} itens · ${[...by].map(([s, n]) => `${s} ${n}`).join(' · ')}`)
  }
}

function diff(a: BackupPreview, b: BackupPreview, la: string, lb: string) {
  console.log(`\nDiferenças ${la} → ${lb}:`)
  let total = 0
  for (const k of COLLECTION_KEYS) {
    const A = new Map(list(a.db, k).map((r) => [r.id, r]))
    const B = new Map(list(b.db, k).map((r) => [r.id, r]))
    const only1 = [...A.keys()].filter((id) => !B.has(id))
    const only2 = [...B.keys()].filter((id) => !A.has(id))
    const changed = [...A.keys()].filter((id) => B.has(id) && stable(A.get(id)) !== stable(B.get(id)))
    if (!only1.length && !only2.length && !changed.length) continue
    total += only1.length + only2.length + changed.length
    console.log(`  ${k}: só em ${la} ${only1.length} · só em ${lb} ${only2.length} · diferentes ${changed.length}`)
    for (const id of changed.slice(0, 5)) {
      const x = A.get(id)!
      const y = B.get(id)!
      const fields = Object.keys({ ...x, ...y }).filter((f) => stable(x[f]) !== stable(y[f]) && f !== 'updatedAt')
      console.log(`    ${id} (${String(x.title ?? x.name ?? '')}): ${fields.map((f) => `${f}: ${stable(x[f])} → ${stable(y[f])}`).join('; ')}`)
    }
  }
  if (!total) console.log('  nenhuma — os dois arquivos têm os mesmos dados')
}

const [fileA, fileB] = process.argv.slice(2)
if (!fileA) {
  console.error('uso: npx vite-node scripts/verify-backup.ts <backup.json> [outro-backup.json]')
  process.exit(2)
}
let failed = false
for (const f of [fileA, fileB].filter(Boolean) as string[]) {
  const p = load(f)
  console.log(`\n✓ ${f} — válido · exportado ${p.exportedAt ?? '?'} · esquema v${p.schemaVersion}${p.upgraded ? ' (será atualizado)' : ''} · ${p.total} registros`)
  for (const c of p.counts) console.log(`  ${c.label}: ${c.count}`)
  if (p.duplicatesRemoved) console.log(`  ⚠︎ ${p.duplicatesRemoved} id(s) repetidos no arquivo`)
  for (const w of p.warnings) console.log(`  ⚠︎ ${w}`)
  console.log('Viagens:')
  tripReport(p.db)
  const problems = await restoreAndCompare(p)
  if (problems.length) {
    failed = true
    console.log(`✗ restauração isolada: ${problems.length} divergência(s)`)
    for (const x of problems.slice(0, 30)) console.log(`  - ${x}`)
  } else console.log('✓ restauração isolada: tudo igual depois de restaurar e reabrir')
}
if (fileB) diff(load(fileA), load(fileB), 'A', 'B')
process.exit(failed ? 1 : 0)
