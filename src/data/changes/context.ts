/**
 * "Copiar contexto para ChatGPT": a JSON of what she chose to share (marina-os/context@1), with the ids and
 * versions ChatGPT must use to answer in marina-os/changes@1. Pure; nothing leaves the device unless she
 * pastes it somewhere.
 *
 * Sensitive fields are OUT by default (money amounts, health/clinical, contacts, notes) and each can be
 * turned on. Modules of a locked area (privacy lock) are not exported while locked.
 */
import type { DB, LockArea } from '../types'
import { addDays, monthKey, todayKey, TIMEZONE } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { nextPeriod, receivablesFor } from '../finance/receivables'
import { isLive } from '../ugc/model'
import { CHANGES_JSON_SCHEMA, CHANGES_SCHEMA, type ChangeType } from './contract'
import { TYPE_DEFS, type Rec } from './types'

export const CONTEXT_SCHEMA = 'marina-os/context@1'

export type ContextModule = 'tasks' | 'waiting' | 'backlog' | 'projects' | 'workouts' | 'meals' | 'revenue' | 'expenses' | 'ugc' | 'routines'
export type SensitiveKind = 'money' | 'health' | 'contacts' | 'notes'

export const CONTEXT_MODULES: { id: ContextModule; label: string; lock?: LockArea; on: boolean }[] = [
  { id: 'tasks', label: 'Tarefas (abertas + feitas nos últimos 7 dias)', on: true },
  { id: 'waiting', label: 'Aguardando retorno', on: true },
  { id: 'backlog', label: 'Backlog (intenções futuras)', on: true },
  { id: 'projects', label: 'Projetos ativos', on: true },
  { id: 'workouts', label: 'Treinos (−7 a +14 dias)', on: true },
  { id: 'meals', label: 'Refeições (−2 a +7 dias)', on: false },
  { id: 'routines', label: 'Hábitos / rotina', on: false },
  { id: 'ugc', label: 'UGC (marcas e negociações vivas)', on: true },
  { id: 'revenue', label: 'Receitas (mês atual e próximo)', lock: 'dinheiro', on: false },
  { id: 'expenses', label: 'Gastos (últimos 30 dias)', lock: 'dinheiro', on: false },
]

export const SENSITIVE: { id: SensitiveKind; label: string; fields: string[] }[] = [
  { id: 'money', label: 'Valores em dinheiro', fields: ['amountCents', 'estimatedValueCents', 'agreedValueCents'] },
  { id: 'health', label: 'Saúde (como foi o treino, o que comeu)', fields: ['feeling', 'description'] },
  { id: 'contacts', label: 'Contatos das marcas (site, perfil) — e-mails e telefones nunca saem', fields: ['website', 'instagram'] },
  { id: 'notes', label: 'Notas e observações', fields: ['notes', 'doneCriteria', 'proposedDeliverables', 'objective', 'description'] },
]

export interface ContextOptions {
  modules: ContextModule[]
  /** Sensitive kinds she turned ON (default: none). */
  include?: SensitiveKind[]
  today?: string
  isLocked?: (a: LockArea) => boolean
}

const LIMIT = 150

function rows(db: DB, m: ContextModule, today: string): { type: ChangeType; rec: Rec }[] {
  const t = (type: ChangeType, list: unknown[]) => list.slice(0, LIMIT).map((rec) => ({ type, rec: rec as Rec }))
  switch (m) {
    case 'tasks':
      return t('task', db.tasks.filter((x) => !x.recurrence && x.status !== 'waiting' && !x.waiting && x.status !== 'archived' && (x.status !== 'done' || (x.completedAt ?? '') >= addDays(today, -7))))
    case 'waiting':
      return t('waiting', db.tasks.filter((x) => x.status === 'waiting'))
    case 'backlog':
      return t('backlog', db.backlogItems.filter((x) => x.kind === 'scheduled' && x.status === 'open'))
    case 'projects':
      return t('project', db.projects.filter((x) => x.status !== 'concluido'))
    case 'workouts':
      return db.workouts.filter((w) => w.date >= addDays(today, -7) && w.date <= addDays(today, 14)).slice(0, LIMIT).map((rec) => ({ type: rec.status === 'feito' || rec.status === 'adaptado' ? ('completedWorkout' as const) : ('plannedWorkout' as const), rec: rec as unknown as Rec }))
    case 'meals':
      return db.meals.filter((x) => x.date >= addDays(today, -2) && x.date <= addDays(today, 7)).slice(0, LIMIT).map((rec) => ({ type: rec.done ? ('consumedMeal' as const) : ('plannedMeal' as const), rec: rec as unknown as Rec }))
    case 'revenue': {
      const p = monthKey(today)
      return [...receivablesFor(db, p), ...receivablesFor(db, nextPeriod(p))].map((rec) => ({ type: rec.status === 'received' ? ('receivedRevenue' as const) : ('expectedRevenue' as const), rec: rec as unknown as Rec }))
    }
    case 'expenses':
      return t('expense', db.expenses.filter((e) => e.type !== 'income' && (e.date ?? '') >= addDays(today, -30)))
    case 'ugc': {
      const deals = db.ugcOpportunities.filter((o) => isLive(db, o))
      const brands = new Set(deals.map((d) => d.brandId))
      return [...t('ugcProspect', db.brands.filter((b) => !b.archived && (brands.has(b.id) || b.crm?.paidProspect))), ...t('ugcDeal', deals)]
    }
    case 'routines':
      return t('routine', db.routineItems.filter((r) => r.active))
  }
}

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)))

export interface BuiltContext {
  json: Record<string, unknown>
  text: string
  counts: Partial<Record<ContextModule, number>>
  excludedFields: string[]
}

export function buildContext(db: DB, opts: ContextOptions): BuiltContext {
  const today = opts.today ?? todayKey()
  const include = new Set(opts.include ?? [])
  const drop = new Set(SENSITIVE.filter((s) => !include.has(s.id)).flatMap((s) => s.fields))
  // "description" is a health field for meals, a note for projects: kept unless BOTH say no.
  const keepDescription = (type: ChangeType) => (type === 'plannedMeal' || type === 'consumedMeal' ? include.has('health') : include.has('notes'))
  const modules: Record<string, unknown[]> = {}
  const counts: BuiltContext['counts'] = {}
  for (const m of opts.modules) {
    const lock = CONTEXT_MODULES.find((x) => x.id === m)?.lock
    if (lock && opts.isLocked?.(lock)) continue
    const out = rows(db, m, today).map(({ type, rec }) => {
      const read = TYPE_DEFS[type]!.read(rec, db)
      const fields = Object.fromEntries(Object.entries(read).filter(([k]) => (k === 'description' ? keepDescription(type) : !drop.has(k))))
      return clean({ id: rec.id, type, version: rec.updatedAt, ...fields })
    })
    modules[m] = out
    counts[m] = out.length
  }
  const json = {
    schemaVersion: CONTEXT_SCHEMA,
    generatedAt: nowISO(),
    timezone: TIMEZONE,
    today,
    modules,
    excluded: SENSITIVE.filter((s) => !include.has(s.id)).map((s) => s.label),
    instructions: chatgptInstructions(),
  }
  return { json, text: JSON.stringify(json, null, 2), counts, excludedFields: [...drop] }
}

/** Editable fields per type (from the importer itself, so the instructions never drift from what it accepts). */
function fieldList(): string {
  return Object.entries(TYPE_DEFS)
    .map(([type, def]) => `${type}: ${Object.keys(def!.fields).join(', ')}`)
    .join('\n')
}

/** Short pt-BR prompt: answer ONLY with marina-os/changes@1 using the ids given. */
export function chatgptInstructions(): string {
  return [
    `Você está ajudando a Marina a organizar o app MARINA OS. Responda SOMENTE com um JSON ${CHANGES_SCHEMA} (sem texto antes ou depois, sem markdown).`,
    'Regras:',
    '- Para mudar algo que já existe: use o "id" exato do contexto e "baseVersion" = o "version" daquele registro. Nunca invente ids.',
    '- Para criar algo novo: op "create", sem id, com um "sourceKey" estável e único (ex.: "chatgpt-2026-10-15-treino-ter"). Repetir o mesmo sourceKey não duplica.',
    '- Mande em "fields" só o que muda. Datas AAAA-MM-DD, horas HH:MM, dinheiro em centavos (amountCents). Fuso: America/Sao_Paulo.',
    '- ops: create, update, complete (concluir), move (mudar dia/hora/etapa), archive. "delete" só se a Marina pedir explicitamente.',
    '- Mantenha os tipos separados: treino planejado ≠ tarefa; receita prevista ≠ gasto; backlog ≠ tarefa do dia.',
    '- Tipo "recurring" só vincula algo que já existe; não crie recorrências.',
    '- Na dúvida sobre qual registro é, use "match": {"title","project","date"} — o app pergunta à Marina.',
    `- "generatedAt": agora em ISO 8601; "source": "ChatGPT".`,
    'Campos por tipo:',
    fieldList(),
    'Schema:',
    JSON.stringify(CHANGES_JSON_SCHEMA),
    `Exemplo: {"schemaVersion":"${CHANGES_SCHEMA}","generatedAt":"2026-10-15T09:00:00-03:00","source":"ChatGPT","changes":[{"op":"move","type":"task","id":"<id do contexto>","baseVersion":"<version>","fields":{"date":"2026-10-16"}}]}`,
  ].join('\n')
}
