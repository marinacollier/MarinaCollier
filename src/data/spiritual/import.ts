/**
 * Bíblia — "Importar estudo": she pastes a JSON (from Lumos/ChatGPT or her own notes) for ONE session.
 *
 * - parse → validate → find the session (stable id or reference, "Amós 5") → per-field preview
 *   (what is there vs what came in). Nothing is written until she confirms.
 * - Notebook fields she already wrote are marked "seu texto" and unchecked by default.
 * - Study fields go into ONE imported study record per session (updated in place); notebook fields into the
 *   session's current notebook record (the same one autosave writes). The session status never changes.
 * - Every apply is logged (profile.spiritualImports); the same paste twice writes nothing the second time.
 */
import { actions, getDB } from '../store'
import type { BibleStudyContent, DB, ID, SpiritualJournalEntry, SpiritualSession, SpiritualStudy } from '../types'
import { nowISO } from '@/lib/id'

export interface StudyImport {
  sessionId?: string
  reference?: string
  resumo?: string
  contextoHistorico?: string
  contextoTeologico?: string
  perspectivaProgressista?: string
  reflexoes?: { deus?: string; humanidade?: string; pessoal?: string }
  palavraChave?: string
  oracao?: string
  anotacoes?: string
}

type StudyKey = 'explicacao' | 'contextoHistorico' | 'contextoTeologico' | 'olharProgressista'
type JournalKey = 'reflectionGod' | 'reflectionHumanity' | 'personalReflection' | 'keyword' | 'prayer' | 'notes'

export interface FieldSpec {
  /** Stable key of the import field (also what the history records). */
  key: string
  label: string
  target: 'study' | 'journal'
  field: StudyKey | JournalKey
  pick: (d: StudyImport) => string | undefined
}

export const IMPORT_FIELDS: FieldSpec[] = [
  { key: 'resumo', label: 'Resumo', target: 'study', field: 'explicacao', pick: (d) => d.resumo },
  { key: 'contextoHistorico', label: 'Contexto histórico', target: 'study', field: 'contextoHistorico', pick: (d) => d.contextoHistorico },
  { key: 'contextoTeologico', label: 'Contexto teológico', target: 'study', field: 'contextoTeologico', pick: (d) => d.contextoTeologico },
  { key: 'perspectivaProgressista', label: 'Perspectiva progressista', target: 'study', field: 'olharProgressista', pick: (d) => d.perspectivaProgressista },
  { key: 'reflexoes.deus', label: 'O que revela sobre Deus', target: 'journal', field: 'reflectionGod', pick: (d) => d.reflexoes?.deus },
  { key: 'reflexoes.humanidade', label: 'O que revela sobre o ser humano', target: 'journal', field: 'reflectionHumanity', pick: (d) => d.reflexoes?.humanidade },
  { key: 'reflexoes.pessoal', label: 'O que isso desperta em mim', target: 'journal', field: 'personalReflection', pick: (d) => d.reflexoes?.pessoal },
  { key: 'palavraChave', label: 'Palavra-chave', target: 'journal', field: 'keyword', pick: (d) => d.palavraChave },
  { key: 'oracao', label: 'Oração', target: 'journal', field: 'prayer', pick: (d) => d.oracao },
  { key: 'anotacoes', label: 'Anotações', target: 'journal', field: 'notes', pick: (d) => d.anotacoes },
]

const STRING_KEYS = ['sessionId', 'reference', 'resumo', 'contextoHistorico', 'contextoTeologico', 'perspectivaProgressista', 'palavraChave', 'oracao', 'anotacoes'] as const

export type ParseResult = { ok: true; data: StudyImport } | { ok: false; errors: string[] }

/** Accepts the JSON as text (a ```json fence around it is fine). Unknown keys are ignored. */
export function parseStudyImport(text: string): ParseResult {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  if (!raw) return { ok: false, errors: ['Cole o JSON do estudo.'] }
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return { ok: false, errors: ['Não é um JSON válido — confira chaves e aspas.'] }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, errors: ['O JSON precisa ser um objeto { … }.'] }
  const r = v as Record<string, unknown>
  const errors: string[] = []
  const data: StudyImport = {}
  for (const k of STRING_KEYS) {
    if (r[k] === undefined || r[k] === null) continue
    if (typeof r[k] !== 'string') errors.push(`“${k}” precisa ser texto.`)
    else if ((r[k] as string).trim()) data[k] = (r[k] as string).trim()
  }
  if (r.reflexoes !== undefined && r.reflexoes !== null) {
    if (typeof r.reflexoes !== 'object' || Array.isArray(r.reflexoes)) errors.push('“reflexoes” precisa ser { deus, humanidade, pessoal }.')
    else {
      const x = r.reflexoes as Record<string, unknown>
      const out: NonNullable<StudyImport['reflexoes']> = {}
      for (const k of ['deus', 'humanidade', 'pessoal'] as const) {
        if (x[k] === undefined || x[k] === null) continue
        if (typeof x[k] !== 'string') errors.push(`“reflexoes.${k}” precisa ser texto.`)
        else if ((x[k] as string).trim()) out[k] = (x[k] as string).trim()
      }
      if (Object.keys(out).length) data.reflexoes = out
    }
  }
  if (!data.sessionId && !data.reference) errors.push('Informe “reference” (ex.: "Amós 5") ou “sessionId”.')
  if (!IMPORT_FIELDS.some((f) => f.pick(data))) errors.push('Nenhum campo de estudo veio preenchido.')
  return errors.length ? { ok: false, errors } : { ok: true, data }
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** By stable id first, then by reference ("Amós 5" = "amos 5"), in plan order. */
export function findImportSession(db: DB, d: StudyImport, fallbackId?: ID): SpiritualSession | undefined {
  if (d.sessionId) {
    const s = db.spiritualSessions.find((x) => x.id === d.sessionId)
    if (s) return s
  }
  if (d.reference) {
    const ref = norm(d.reference)
    const order = new Map(db.spiritualPlans.map((p) => [p.id, p.sortOrder]))
    return db.spiritualSessions
      .filter((x) => norm(x.scriptureReference) === ref)
      .sort((a, b) => (order.get(a.planId) ?? 0) - (order.get(b.planId) ?? 0) || a.sortOrder - b.sortOrder)[0]
  }
  return fallbackId ? db.spiritualSessions.find((x) => x.id === fallbackId) : undefined
}

export interface FieldPreview {
  key: string
  label: string
  target: 'study' | 'journal'
  existing?: string
  incoming: string
  /** The same text is already there — nothing to do. */
  same: boolean
  /** A notebook field she wrote herself (protected: unchecked by default). */
  mine: boolean
  defaultChecked: boolean
}

export interface ImportPreview {
  session: SpiritualSession
  fields: FieldPreview[]
  hash: string
  /** This exact paste was already imported for this session. */
  alreadyImported: boolean
}

const importedStudy = (db: DB, sessionId: ID): SpiritualStudy | undefined =>
  db.spiritualStudies.filter((s) => s.sessionId === sessionId && s.contentSource === 'importado').sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]

const currentEntry = (db: DB, sessionId: ID): SpiritualJournalEntry | undefined =>
  db.spiritualJournal.filter((j) => j.sessionId === sessionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

function fingerprint(sessionId: ID, d: StudyImport): string {
  const text = sessionId + '|' + IMPORT_FIELDS.map((f) => `${f.key}=${f.pick(d) ?? ''}`).join('|')
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Pure: nothing is written. */
export function previewStudyImport(db: DB, d: StudyImport, fallbackId?: ID): ImportPreview | undefined {
  const session = findImportSession(db, d, fallbackId)
  if (!session) return undefined
  const study = importedStudy(db, session.id)
  const entry = currentEntry(db, session.id)
  const fields: FieldPreview[] = []
  for (const f of IMPORT_FIELDS) {
    const incoming = f.pick(d)
    if (!incoming) continue
    const existingRaw = f.target === 'study' ? study?.content[f.field as StudyKey] : entry?.[f.field as JournalKey]
    const existing = existingRaw?.trim() ? existingRaw.trim() : undefined
    const same = existing === incoming
    const mine = f.target === 'journal' && !!existing && !same
    fields.push({ key: f.key, label: f.label, target: f.target, existing, incoming, same, mine, defaultChecked: !same && !mine })
  }
  const hash = fingerprint(session.id, d)
  const alreadyImported = !!db.profile.spiritualImports?.some((l) => l.hash === hash)
  return { session, fields, hash, alreadyImported }
}

const EMPTY_STUDY: BibleStudyContent = {
  temaCentral: '',
  contextoHistorico: '',
  explicacao: '',
  contextoTeologico: '',
  olharProgressista: '',
  leituraContemplativa: '',
  aplicacaoPessoal: '',
  perguntas: [],
  oracao: '',
  fraseDoDia: '',
}

/**
 * Apply only the checked fields (after she confirms). Re-reads the DB, so a field equal to what's there is
 * skipped (idempotent). Never changes the session status. Returns the field keys actually written.
 */
export function applyStudyImport(d: StudyImport, checked: string[], fallbackId?: ID): string[] {
  const preview = previewStudyImport(getDB(), d, fallbackId)
  if (!preview) return []
  const on = new Set(checked)
  const todo = preview.fields.filter((f) => on.has(f.key) && !f.same)
  if (!todo.length) return []
  const sid = preview.session.id
  const studyPatch: Partial<Record<StudyKey, string>> = {}
  const journalPatch: Partial<Record<JournalKey, string>> = {}
  for (const f of todo) {
    const spec = IMPORT_FIELDS.find((x) => x.key === f.key)!
    if (spec.target === 'study') studyPatch[spec.field as StudyKey] = f.incoming
    else journalPatch[spec.field as JournalKey] = f.incoming
  }
  const db = getDB()
  if (Object.keys(studyPatch).length) {
    const study = importedStudy(db, sid)
    if (study) actions.update('spiritualStudies', study.id, { content: { ...study.content, ...studyPatch }, generatedAt: nowISO() })
    else actions.create('spiritualStudies', { sessionId: sid, content: { ...EMPTY_STUDY, ...studyPatch }, contentSource: 'importado', generatedAt: nowISO() })
  }
  if (Object.keys(journalPatch).length) {
    const entry = currentEntry(db, sid)
    if (entry) actions.update('spiritualJournal', entry.id, journalPatch)
    else actions.create('spiritualJournal', { sessionId: sid, planId: preview.session.planId, reference: preview.session.scriptureReference, ...journalPatch })
  }
  const keys = todo.map((f) => f.key)
  actions.setProfile({
    spiritualImports: [...(getDB().profile.spiritualImports ?? []), { at: nowISO(), sessionId: sid, reference: preview.session.scriptureReference, fields: keys, hash: preview.hash }],
  })
  return keys
}

export const IMPORT_EXAMPLE = `{
  "reference": "Amós 5",
  "resumo": "…",
  "contextoHistorico": "…",
  "contextoTeologico": "…",
  "perspectivaProgressista": "…",
  "reflexoes": { "deus": "…", "humanidade": "…", "pessoal": "…" },
  "palavraChave": "…",
  "oracao": "…",
  "anotacoes": "…"
}`
