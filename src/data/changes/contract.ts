/**
 * marina-os/changes@1 — ONE contract for everything that comes into the app from outside (ChatGPT, a
 * script, a hand-written file). Pure: read + validate, nothing written here.
 *
 * {
 *   "schemaVersion": "marina-os/changes@1",
 *   "generatedAt": "2026-10-15T09:00:00-03:00",
 *   "source": "ChatGPT",
 *   "changes": [
 *     { "op": "complete", "type": "task", "id": "…", "baseVersion": "2026-10-14T…" },
 *     { "op": "create", "type": "plannedWorkout", "sourceKey": "plano-semana-42-corrida-ter", "fields": { "date": "2026-10-20", "modality": "corrida" } }
 *   ]
 * }
 *
 * Types are kept distinct (a planned workout is not a to-do, an expected revenue is not an expense).
 */
import { isDateKey } from '@/lib/date'

export const CHANGES_SCHEMA = 'marina-os/changes@1'
export const MAX_CHANGES = 200

export const CHANGE_OPS = ['create', 'update', 'complete', 'move', 'archive', 'delete'] as const
export type ChangeOp = (typeof CHANGE_OPS)[number]

export const CHANGE_TYPES = [
  'task',
  'backlog',
  'waiting',
  'recurring',
  'plannedWorkout',
  'completedWorkout',
  'plannedMeal',
  'consumedMeal',
  'expectedRevenue',
  'receivedRevenue',
  'expense',
  'ugcProspect',
  'ugcDeal',
  'project',
  'routine',
] as const
export type ChangeType = (typeof CHANGE_TYPES)[number]
/** Accepted spellings of a type (habit = an item of a routine). */
const TYPE_ALIASES: Record<string, ChangeType> = { habit: 'routine', routineItem: 'routine' }

export type Fields = Record<string, unknown>

export interface Change {
  op: ChangeOp
  /** Kept as sent when unknown, so the preview can say "não suportado ainda". */
  type: ChangeType | string
  id?: string
  sourceKey?: string
  externalRef?: string
  match?: { title?: string; project?: string; date?: string }
  fields: Fields
  /** The record's `version` (updatedAt) the sender saw. */
  baseVersion?: string
}

export interface ChangesDoc {
  schemaVersion: typeof CHANGES_SCHEMA
  generatedAt: string
  source: string
  changes: Change[]
}

/** One problem in the file. `index` = the change it belongs to (undefined = the whole file). */
export interface ValidationIssue {
  index?: number
  message: string
}

export type ParseResult = { ok: true; doc: ChangesDoc; issues: ValidationIssue[]; invalid: Map<number, string[]> } | { ok: false; error: string }

const MAX_STR = 2000
const MAX_KEY = 200
const MAX_ARRAY = 50

/** The first balanced `{…}` of a text that parses (a pasted reply may carry prose or ```json fences). */
export function extractJSON(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* look inside */
  }
  for (let i = trimmed.indexOf('{'); i >= 0; i = trimmed.indexOf('{', i + 1)) {
    let depth = 0
    let str = false
    for (let j = i; j < trimmed.length; j++) {
      const c = trimmed[j]
      if (str) {
        if (c === '\\') j++
        else if (c === '"') str = false
      } else if (c === '"') str = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        try {
          return JSON.parse(trimmed.slice(i, j + 1))
        } catch {
          break
        }
      }
    }
  }
  return undefined
}

export function looksLikeChanges(text: string): boolean {
  return /marina-os\/changes@/.test(text)
}

const isISO = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v))

/** Size/shape checks of one value inside `fields` (deep). */
function checkValue(v: unknown, path: string, out: string[], depth = 0): void {
  if (depth > 4) return void out.push(`${path}: aninhado demais`)
  if (typeof v === 'string' && v.length > MAX_STR) out.push(`${path}: texto longo demais (máx. ${MAX_STR})`)
  else if (typeof v === 'number' && !Number.isFinite(v)) out.push(`${path}: número inválido`)
  else if (Array.isArray(v)) {
    if (v.length > MAX_ARRAY) out.push(`${path}: lista longa demais (máx. ${MAX_ARRAY})`)
    v.forEach((x, i) => checkValue(x, `${path}[${i}]`, out, depth + 1))
  } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) checkValue(x, `${path}.${k}`, out, depth + 1)
}

/**
 * Parse + validate. A broken file (not JSON, wrong schema, too many changes) fails as a whole; a broken
 * change is kept with its problems (`invalid`) so the preview shows it as "inválido" instead of dropping it.
 */
export function parseChanges(input: string | unknown): ParseResult {
  const raw = typeof input === 'string' ? extractJSON(input) : input
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Não achei um JSON válido nesse texto.' }
  const o = raw as Record<string, unknown>
  if (o.schemaVersion !== CHANGES_SCHEMA) return { ok: false, error: `Esse JSON não é ${CHANGES_SCHEMA} (schemaVersion: ${JSON.stringify(o.schemaVersion ?? null)}).` }
  if (!Array.isArray(o.changes)) return { ok: false, error: 'Falta a lista "changes".' }
  if (o.changes.length > MAX_CHANGES) return { ok: false, error: `São ${o.changes.length} mudanças — o máximo por arquivo é ${MAX_CHANGES}. Divide em partes.` }
  const issues: ValidationIssue[] = []
  const generatedAt = isISO(o.generatedAt) ? o.generatedAt : undefined
  if (!generatedAt) issues.push({ message: 'generatedAt ausente ou inválido — conflitos são checados pela versão de cada registro (baseVersion).' })
  const source = typeof o.source === 'string' && o.source.trim() ? o.source.trim().slice(0, 80) : 'Arquivo de mudanças'
  const invalid = new Map<number, string[]>()
  const changes: Change[] = o.changes.map((c, index): Change => {
    const problems: string[] = []
    const r = (c && typeof c === 'object' && !Array.isArray(c) ? c : {}) as Record<string, unknown>
    if (r !== c) problems.push('não é um objeto')
    const op = CHANGE_OPS.includes(r.op as ChangeOp) ? (r.op as ChangeOp) : undefined
    if (!op) problems.push(`op ${JSON.stringify(r.op ?? null)} inválida (use ${CHANGE_OPS.join(', ')})`)
    const rawType = typeof r.type === 'string' ? r.type.trim() : ''
    if (!rawType) problems.push('type ausente')
    const type = TYPE_ALIASES[rawType] ?? rawType
    const str = (k: string, max = MAX_KEY) => {
      const v = r[k]
      if (v === undefined || v === null) return undefined
      if (typeof v !== 'string' || !v.trim()) return void problems.push(`${k} precisa ser texto`)
      if (v.length > max) return void problems.push(`${k} longo demais`)
      return v.trim()
    }
    const id = str('id')
    const sourceKey = str('sourceKey')
    const externalRef = str('externalRef')
    const baseVersion = str('baseVersion')
    if (baseVersion && !isISO(baseVersion)) problems.push('baseVersion precisa ser data/hora ISO (o "version" que o app exportou)')
    let match: Change['match']
    if (r.match !== undefined) {
      const m = r.match as Record<string, unknown>
      if (!m || typeof m !== 'object' || Array.isArray(m)) problems.push('match precisa ser um objeto')
      else {
        match = {
          title: typeof m.title === 'string' ? m.title.trim().slice(0, 300) : undefined,
          project: typeof m.project === 'string' ? m.project.trim().slice(0, 120) : undefined,
          date: isDateKey(m.date) ? m.date : undefined,
        }
        if (m.date !== undefined && !isDateKey(m.date)) problems.push('match.date precisa ser AAAA-MM-DD')
      }
    }
    const f = r.fields ?? {}
    if (!f || typeof f !== 'object' || Array.isArray(f)) problems.push('fields precisa ser um objeto')
    const fields = (f && typeof f === 'object' && !Array.isArray(f) ? f : {}) as Fields
    if (Object.keys(fields).length > 40) problems.push('fields com campos demais')
    checkValue(fields, 'fields', problems)
    if (op && op !== 'create' && !id && !sourceKey && !externalRef && !match?.title && !fields.title && !fields.name && !fields.brand)
      problems.push('sem id, sourceKey, externalRef nem match — não sei qual registro é')
    if (problems.length) invalid.set(index, problems)
    return { op: op ?? 'update', type, id, sourceKey, externalRef, match, fields, baseVersion }
  })
  return { ok: true, doc: { schemaVersion: CHANGES_SCHEMA, generatedAt: generatedAt ?? '', source, changes }, issues, invalid }
}

/** Compact JSON schema of the contract (goes into the ChatGPT instructions). */
export const CHANGES_JSON_SCHEMA = {
  type: 'object',
  required: ['schemaVersion', 'generatedAt', 'source', 'changes'],
  properties: {
    schemaVersion: { const: CHANGES_SCHEMA },
    generatedAt: { type: 'string', format: 'date-time' },
    source: { type: 'string' },
    changes: {
      type: 'array',
      maxItems: MAX_CHANGES,
      items: {
        type: 'object',
        required: ['op', 'type'],
        properties: {
          op: { enum: [...CHANGE_OPS] },
          type: { enum: [...CHANGE_TYPES] },
          id: { type: 'string', description: 'id exato do contexto (para mudar algo que já existe)' },
          sourceKey: { type: 'string', description: 'chave estável sua para itens novos (repetir = não duplica)' },
          baseVersion: { type: 'string', description: 'o "version" do registro no contexto' },
          match: { type: 'object', properties: { title: { type: 'string' }, project: { type: 'string' }, date: { type: 'string', format: 'date' } } },
          fields: { type: 'object', description: 'só os campos que mudam (datas AAAA-MM-DD, horas HH:MM, dinheiro em centavos: amountCents)' },
        },
      },
    },
  },
} as const
