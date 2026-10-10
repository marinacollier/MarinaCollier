/**
 * Backup format + validation. Pure: no DOM, no store.
 * File shape (format 2): { app: 'marina-os', format, schemaVersion, seedVersion, exportedAt, counts, checksum, db }.
 * Restore REPLACES the database (never merges), so nothing gets duplicated; duplicate ids inside the
 * file itself are collapsed (latest updatedAt wins). The checksum catches files edited or truncated by hand.
 */
import { SCHEMA_VERSION, emptyDB } from '@/data/defaults'
import type { CollectionKey, DB } from '@/data/types'
import { todayKey } from '@/lib/date'

export const BACKUP_APP = 'marina-os'

/** Version of the file wrapper itself (independent of the DB schema). */
export const BACKUP_FORMAT = 2

export interface BackupFile {
  app: typeof BACKUP_APP
  format?: number
  schemaVersion: number
  seedVersion?: number
  exportedAt: string
  /** Items per collection at export time (shown before restoring; also a sanity check). */
  counts?: Partial<Record<CollectionKey, number>>
  /** FNV-1a of JSON.stringify(db). Optional so older backups still restore. */
  checksum?: string
  db: DB
}

/** Small, dependency-free FNV-1a (32-bit) — integrity, not security. */
export function checksumOf(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function makeBackup(db: DB, now: Date = new Date()): BackupFile {
  const counts: BackupFile['counts'] = {}
  for (const key of COLLECTION_KEYS) counts[key] = (db[key] as unknown[] | undefined)?.length ?? 0
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schemaVersion: db.schemaVersion ?? SCHEMA_VERSION,
    seedVersion: db.profile?.seedVersion,
    exportedAt: now.toISOString(),
    counts,
    checksum: checksumOf(JSON.stringify(db)),
    db,
  }
}

export function backupFilename(now: Date = new Date()): string {
  return `marina-os-backup-${todayKey(now)}.json`
}

/** Every array collection of the DB, in a stable order. */
export const COLLECTION_KEYS: CollectionKey[] = (Object.keys(emptyDB()) as (keyof DB)[]).filter((k) =>
  Array.isArray(emptyDB()[k]),
) as CollectionKey[]

export const COLLECTION_LABELS: Partial<Record<CollectionKey, string>> = {
  tasks: 'Tarefas',
  backlogItems: 'Backlog (do briefing)',
  importBatches: 'Importações do briefing',
  occurrences: 'Check-ins de rotinas',
  priorities: 'Prioridades do dia',
  routines: 'Rotinas',
  routineItems: 'Itens de rotina',
  calendarSources: 'Calendários',
  events: 'Compromissos',
  workouts: 'Treinos',
  workoutGoals: 'Objetivos esportivos',
  meals: 'Refeições',
  mealTemplates: 'Refeições favoritas',
  checkins: 'Check-ins do dia',
  expenses: 'Gastos',
  financialAccounts: 'Contas',
  financialCategories: 'Categorias de gastos',
  goals: 'Metas',
  projects: 'Projetos',
  milestones: 'Marcos de projeto',
  wins: 'Wins',
  workInbox: 'Inbox do trabalho',
  meetings: 'Reuniões',
  studyTracks: 'Trilhas de estudo',
  studyItems: 'Estudos',
  books: 'Livros',
  trips: 'Viagens',
  tripItems: 'Itens de viagem',
  contentItems: 'Conteúdos',
  partnerships: 'Parcerias',
  notes: 'Notas e ideias',
  brainDump: 'Brain dump',
  pets: 'Pets',
  petTasks: 'Cuidados da Luna',
  weeklyReviews: 'Revisões da semana',
  monthlyReviews: 'Meu mês',
  integrations: 'Integrações',
  constraints: 'Regras de planejamento',
  weekTemplate: 'Modelo da semana',
  conflictAcks: 'Conflitos decididos',
  weekPlans: 'Semanas montadas',
  nutritionStrategies: 'Estratégias nutricionais',
  nutritionDayPlans: 'Planos alimentares',
  bodyComposition: 'Composição corporal',
  scheduleOverrides: 'Ajustes de horário do dia',
  foods: 'Meus alimentos',
  mealAdjustments: 'Ajustes de refeição',
  mealPrepPlans: 'Meal prep da semana',
  pantry: 'Em casa (despensa e preparados)',
  memory: 'O que a Lumos sabe sobre mim',
  lifeLog: 'Linha da vida (acontecimentos)',
  attentionAcks: 'Decisões resolvidas',
  contracts: 'Contratos',
  opportunities: 'Oportunidades',
  contacts: 'Contatos profissionais',
}

export interface BackupPreview {
  ok: true
  db: DB
  schemaVersion: number
  exportedAt?: string
  /** Older schema: will be upgraded on import. */
  upgraded: boolean
  counts: { key: CollectionKey; label: string; count: number }[]
  total: number
  /** Same id twice inside the file (collapsed, latest wins). */
  duplicatesRemoved: number
  /** Links pointing at something that isn't in the file (restored anyway; shown so nothing is silent). */
  warnings: string[]
}

export type BackupValidation = BackupPreview | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Checks a parsed JSON value. Accepts the backup wrapper or a bare DB object (older exports).
 * Never throws.
 */
/** From the file's text: a truncated or non-JSON file gets a clear message instead of a parser error. */
export function parseBackupText(text: string): BackupValidation {
  if (!text.trim()) return { ok: false, error: 'O arquivo está vazio.' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return {
      ok: false,
      error: text.trimStart().startsWith('{') ? 'Esse backup está incompleto (o arquivo foi cortado). Usa o arquivo original, sem editar.' : 'Esse arquivo não é um backup do MARINA OS (precisa ser o .json exportado aqui).',
    }
  }
  return validateBackup(raw)
}

export function validateBackup(raw: unknown): BackupValidation {
  if (!isObj(raw)) return { ok: false, error: 'Esse arquivo não parece um backup do MARINA OS.' }

  let dbRaw: unknown
  let exportedAt: string | undefined
  let declaredVersion: unknown
  if ('db' in raw || 'app' in raw) {
    if (raw.app !== BACKUP_APP) return { ok: false, error: 'Esse arquivo é de outro app, não do MARINA OS.' }
    dbRaw = raw.db
    exportedAt = typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined
    declaredVersion = raw.schemaVersion
  } else {
    dbRaw = raw
  }
  if (!isObj(dbRaw)) return { ok: false, error: 'O backup está sem os dados. Confere se é o arquivo certo?' }
  if (isObj(raw) && typeof raw.checksum === 'string' && checksumOf(JSON.stringify(dbRaw)) !== raw.checksum)
    return { ok: false, error: 'Esse backup foi alterado ou está incompleto (a verificação não bate). Usa o arquivo original.' }
  if (!isObj(dbRaw.profile)) return { ok: false, error: 'O backup está sem o perfil. Confere se é o arquivo certo?' }

  const version = Number(declaredVersion ?? dbRaw.schemaVersion ?? 0)
  if (!Number.isFinite(version) || version < 0) return { ok: false, error: 'Versão do backup não reconhecida.' }
  if (version > SCHEMA_VERSION)
    return { ok: false, error: 'Esse backup veio de uma versão mais nova do app. Atualiza o app e tenta de novo.' }

  const counts: BackupPreview['counts'] = []
  let found = 0
  for (const key of COLLECTION_KEYS) {
    const v = dbRaw[key]
    if (v === undefined) continue
    if (!Array.isArray(v)) return { ok: false, error: `"${COLLECTION_LABELS[key] ?? key}" está corrompido no arquivo.` }
    if (v.some((it) => !isObj(it) || typeof it.id !== 'string'))
      return { ok: false, error: `Alguns itens de "${COLLECTION_LABELS[key] ?? key}" estão sem identificação.` }
    found++
    counts.push({ key, label: COLLECTION_LABELS[key] ?? key, count: v.length })
  }
  if (found === 0) return { ok: false, error: 'Não achei nenhuma lista de dados nesse arquivo.' }

  const { db, removed } = dedupeById(dbRaw as unknown as DB)
  return {
    ok: true,
    db,
    schemaVersion: version,
    exportedAt,
    upgraded: version < SCHEMA_VERSION,
    counts: counts.filter((c) => c.count > 0),
    total: counts.reduce((s, c) => s + c.count, 0),
    duplicatesRemoved: removed,
    warnings: relationWarnings(db),
  }
}

/** Collapses repeated ids inside each collection (keeps the most recently updated copy). */
export function dedupeById(db: DB): { db: DB; removed: number } {
  let removed = 0
  const out = { ...db } as unknown as Record<string, unknown>
  for (const key of COLLECTION_KEYS) {
    const list = (db as unknown as Record<string, unknown>)[key]
    if (!Array.isArray(list)) continue
    const byId = new Map<string, { id: string; updatedAt?: string }>()
    for (const it of list as { id: string; updatedAt?: string }[]) {
      const prev = byId.get(it.id)
      if (prev) removed++
      if (!prev || (it.updatedAt ?? '') >= (prev.updatedAt ?? '')) byId.set(it.id, it)
    }
    if (byId.size !== list.length) out[key] = list.filter((it: { id: string }, i: number, arr: { id: string }[]) => byId.get(it.id) === it && arr.indexOf(it) === i)
  }
  return { db: out as unknown as DB, removed }
}

/** The relations that matter most: children whose parent isn't in the file. */
export function relationWarnings(db: DB): string[] {
  const ids = (list: { id: string }[] | undefined) => new Set((list ?? []).map((x) => x.id))
  const checks: [string, number][] = []
  const routines = ids(db.routines)
  checks.push(['itens de rotina sem rotina', (db.routineItems ?? []).filter((i) => !routines.has(i.routineId)).length])
  const trips = ids(db.trips)
  checks.push(['itens de viagem sem viagem', (db.tripItems ?? []).filter((i) => !trips.has(i.tripId)).length])
  const projects = ids(db.projects)
  checks.push(['marcos sem projeto', (db.milestones ?? []).filter((m) => !projects.has(m.projectId)).length])
  const parents: Record<string, Set<string>> = { task: ids(db.tasks), routineItem: ids(db.routineItems), petTask: ids(db.petTasks) }
  checks.push(['registros de “feito” sem o item', (db.occurrences ?? []).filter((o) => !parents[o.parentType]?.has(o.parentId)).length])
  const contracts = ids(db.contracts)
  checks.push(['recebimentos sem contrato', (db.expenses ?? []).filter((e) => e.contractId && !contracts.has(e.contractId)).length])
  const contacts = ids(db.contacts)
  checks.push(['vagas apontando pra contato que não existe', (db.opportunities ?? []).filter((o) => (o.contactIds ?? []).some((c) => !contacts.has(c))).length])
  checks.push(['sessões de carreira sem a meta', (db.tasks ?? []).filter((t) => t.careerParentId && !parents.task.has(t.careerParentId)).length])
  return checks.filter(([, n]) => n > 0).map(([what, n]) => `${n} ${what}`)
}
