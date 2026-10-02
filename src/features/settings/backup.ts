/**
 * Backup format + validation. Pure: no DOM, no store.
 * File shape: { app: 'marina-os', schemaVersion, exportedAt, db }.
 */
import { SCHEMA_VERSION, emptyDB } from '@/data/defaults'
import type { CollectionKey, DB } from '@/data/types'
import { todayKey } from '@/lib/date'

export const BACKUP_APP = 'marina-os'

export interface BackupFile {
  app: typeof BACKUP_APP
  schemaVersion: number
  exportedAt: string
  db: DB
}

export function makeBackup(db: DB, now: Date = new Date()): BackupFile {
  return { app: BACKUP_APP, schemaVersion: db.schemaVersion ?? SCHEMA_VERSION, exportedAt: now.toISOString(), db }
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
}

export type BackupValidation = BackupPreview | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Checks a parsed JSON value. Accepts the backup wrapper or a bare DB object (older exports).
 * Never throws.
 */
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

  return {
    ok: true,
    db: dbRaw as unknown as DB,
    schemaVersion: version,
    exportedAt,
    upgraded: version < SCHEMA_VERSION,
    counts: counts.filter((c) => c.count > 0),
    total: counts.reduce((s, c) => s + c.count, 0),
  }
}
