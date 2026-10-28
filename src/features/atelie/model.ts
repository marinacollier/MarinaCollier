/**
 * Ateliê Literário — pure reads (no store, no React): labels, versions, search/filters, objective stats, the map.
 * Everything here is computed from what she wrote or tagged. No scores, no invented text.
 */
import type { DateKey, DB, ID, LiteraryOrigin, LiteraryProvenance, LiteraryStatus, LiteraryVersion, LiteraryWork } from '@/data/types'
import { addDays, startOfWeek, toDateKey } from '@/lib/date'
import { normalize } from '@/lib/text'

export const ATELIE_TITLE = 'Ateliê Literário'
export const ATELIE_SUBTITLE = 'Um lugar para tudo aquilo que ainda procura palavras.'

export const STATUS_LABEL: Record<LiteraryStatus, string> = {
  ideia: 'Ideia',
  rascunho: 'Rascunho',
  lapidacao: 'Em lapidação',
  final_aprovada: 'Versão final aprovada',
  publicado: 'Publicado',
  arquivado: 'Arquivado',
}
export const STATUS_ORDER: LiteraryStatus[] = ['ideia', 'rascunho', 'lapidacao', 'final_aprovada', 'publicado', 'arquivado']

/** Never "aprovada": a version identified outside the app, approval still to be checked by her. */
export const PROVENANCE_LABEL: Record<LiteraryProvenance, string> = {
  versao_anterior: 'Versão anterior identificada — confirmar',
  versao_final_anterior: 'Versão final anterior identificada — verificar aprovação',
  versao_trabalhada: 'Versão trabalhada identificada — confirmar texto final',
}

export const ORIGIN_LABEL: Record<LiteraryOrigin, string> = {
  livre: 'Texto livre',
  fragmento: 'Fragmento',
  imagem: 'Imagem ou objeto',
  experiencia: 'Experiência',
  tema: 'Tema',
  exercicio: 'Exercício',
  acervo: 'Acervo',
}

// ─── Text helpers ───────────────────────────────────────────────────────────

export function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

/** Text without trailing spaces per line and without extra blank lines at the ends (for copy/export). */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

// ─── Versions ───────────────────────────────────────────────────────────────

/** Oldest first (version 1, 2, 3…). Versions are append-only, so ties in time keep the order they were made. */
export function versionsOf(db: Pick<DB, 'literaryVersions'>, workId: ID): LiteraryVersion[] {
  return (db.literaryVersions ?? []).filter((v) => v.workId === workId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function latestVersion(db: Pick<DB, 'literaryVersions'>, workId: ID): LiteraryVersion | undefined {
  return versionsOf(db, workId).at(-1)
}

export function versionNumber(db: Pick<DB, 'literaryVersions'>, v: LiteraryVersion): number {
  return versionsOf(db, v.workId).findIndex((x) => x.id === v.id) + 1
}

export function workOf(db: Pick<DB, 'literaryWorks'>, id: ID): LiteraryWork | undefined {
  return (db.literaryWorks ?? []).find((w) => w.id === id)
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** What to show for "quando foi escrita": her label first, then the known day/month. */
export function workDateLabel(w: LiteraryWork): string {
  if (w.dateLabel) return w.dateLabel
  if (w.date) return w.date.split('-').reverse().join('/')
  if (w.month) {
    const [y, m] = w.month.split('-')
    return `${MONTHS_SHORT[Number(m) - 1]}/${y}`
  }
  // Started in the app without a date: the day it was created.
  return toDateKey(new Date(w.createdAt)).split('-').reverse().join('/')
}

/**
 * Sort key for the writing date: exact day, else first day of the month. A date she marked as unknown
 * ("data a confirmar") sorts last; a piece started in the app without a date uses the day it was created.
 */
export function workDateKey(w: LiteraryWork): string {
  if (w.date) return w.date
  if (w.month) return `${w.month}-01`
  return w.dateLabel ? '' : toDateKey(new Date(w.createdAt))
}

export function lastEdited(db: Pick<DB, 'literaryVersions'>, w: LiteraryWork): string {
  const v = latestVersion(db, w.id)
  return [w.lastEditedAt, v?.updatedAt, w.updatedAt].filter(Boolean).sort().at(-1) ?? w.createdAt
}

// ─── Library: search, filters, sort ─────────────────────────────────────────

export interface LibraryFilters {
  query?: string
  status?: LiteraryStatus
  genre?: string
  theme?: string
  collectionId?: ID
  /** Archived works are hidden unless the status filter asks for them. */
  includeArchived?: boolean
}

export type LibrarySort = 'data' | 'editada' | 'status' | 'titulo'

function haystack(db: Pick<DB, 'literaryVersions'>, w: LiteraryWork): string {
  const body = latestVersion(db, w.id)?.body ?? ''
  return normalize(
    [w.title, w.subtitle, w.genre, ...w.themes, ...w.symbols, ...w.excerpts, w.concept, w.centralImage, w.creationContext, w.authorNotes, body].filter(Boolean).join(' \n '),
  )
}

export function filterWorks(db: Pick<DB, 'literaryWorks' | 'literaryVersions'>, f: LibraryFilters = {}, sort: LibrarySort = 'data'): LiteraryWork[] {
  const tokens = normalize(f.query ?? '')
    .split(/\s+/)
    .filter(Boolean)
  const theme = f.theme ? normalize(f.theme) : undefined
  const list = (db.literaryWorks ?? []).filter((w) => {
    if (f.status ? w.status !== f.status : w.status === 'arquivado' && !f.includeArchived) return false
    if (f.genre && w.genre !== f.genre) return false
    if (theme && !w.themes.some((t) => normalize(t) === theme) && !w.symbols.some((t) => normalize(t) === theme)) return false
    if (f.collectionId && !w.collectionIds.includes(f.collectionId)) return false
    if (tokens.length) {
      const h = haystack(db, w)
      if (!tokens.every((t) => h.includes(t))) return false
    }
    return true
  })
  const byTitle = (a: LiteraryWork, b: LiteraryWork) => a.title.localeCompare(b.title, 'pt-BR')
  const cmp: Record<LibrarySort, (a: LiteraryWork, b: LiteraryWork) => number> = {
    data: (a, b) => workDateKey(b).localeCompare(workDateKey(a)) || byTitle(a, b),
    editada: (a, b) => lastEdited(db, b).localeCompare(lastEdited(db, a)) || byTitle(a, b),
    status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byTitle(a, b),
    titulo: byTitle,
  }
  return [...list].sort(cmp[sort])
}

export function genresOf(db: Pick<DB, 'literaryWorks'>): string[] {
  return [...new Set((db.literaryWorks ?? []).map((w) => w.genre).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Tag → number of works (themes or symbols), most used first. */
export function tagCounts(works: LiteraryWork[], kind: 'themes' | 'symbols'): { tag: string; count: number; workIds: ID[] }[] {
  const map = new Map<string, { tag: string; workIds: ID[] }>()
  for (const w of works) {
    for (const raw of new Set(w[kind].map((t) => t.trim()).filter(Boolean))) {
      const key = normalize(raw)
      const e = map.get(key) ?? { tag: raw, workIds: [] }
      e.workIds.push(w.id)
      map.set(key, e)
    }
  }
  return [...map.values()].map((e) => ({ ...e, count: e.workIds.length })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pt-BR'))
}

// ─── Visão geral ────────────────────────────────────────────────────────────

export interface Overview {
  total: number
  featured?: LiteraryWork
  lastEdited?: LiteraryWork
  inLapidacao: LiteraryWork[]
  pending: number
}

export function overview(db: Pick<DB, 'literaryWorks' | 'literaryVersions'>): Overview {
  const active = (db.literaryWorks ?? []).filter((w) => w.status !== 'arquivado')
  const withText = active.filter((w) => latestVersion(db, w.id))
  const byEdit = [...withText].sort((a, b) => lastEdited(db, b).localeCompare(lastEdited(db, a)))
  const inLapidacao = active.filter((w) => w.status === 'lapidacao').sort((a, b) => lastEdited(db, b).localeCompare(lastEdited(db, a)))
  // Featured: the one she's working on most recently with text; else the newest piece she registered.
  const featured = byEdit[0] ?? [...active].sort((a, b) => workDateKey(b).localeCompare(workDateKey(a)))[0]
  return { total: active.length, featured, lastEdited: byEdit[0], inLapidacao, pending: active.filter((w) => w.textPending).length }
}

/** One development point to try (rotates by day; dismissed points never come back). Optional — never a task. */
export function developmentSuggestion(db: Pick<DB, 'literaryProfile'>, today: DateKey): string | undefined {
  const p = (db.literaryProfile ?? [])[0]
  if (!p) return undefined
  const dismissed = new Set(p.dismissedTips ?? [])
  const open = p.developmentPoints.filter((d) => !dismissed.has(d))
  if (!open.length) return undefined
  const day = Math.floor(new Date(`${today}T12:00:00Z`).getTime() / 86_400_000)
  return open[day % open.length]
}

// ─── Evolução autoral (objective, from real data) ───────────────────────────

export interface Evolution {
  total: number
  byStatus: { status: LiteraryStatus; count: number }[]
  concluded: number
  published: number
  genres: { genre: string; count: number }[]
  themes: { tag: string; count: number }[]
  symbols: { tag: string; count: number }[]
  /** Versions created per week, last `weeks` weeks (oldest first). */
  perWeek: { weekStart: DateKey; count: number }[]
  /** Works with at least one version: how many versions each. */
  revisions: { workId: ID; title: string; versions: number }[]
  /** Days from first version to the approved version (only works approved in the app). */
  toApproval: { workId: ID; title: string; days: number }[]
  versionsTotal: number
}

export function evolution(db: Pick<DB, 'literaryWorks' | 'literaryVersions'>, today: DateKey, weeks = 8): Evolution {
  const works = db.literaryWorks ?? []
  const versions = db.literaryVersions ?? []
  const byStatus = STATUS_ORDER.map((status) => ({ status, count: works.filter((w) => w.status === status).length })).filter((x) => x.count > 0)
  const genres = new Map<string, number>()
  for (const w of works) if (w.genre) genres.set(w.genre, (genres.get(w.genre) ?? 0) + 1)
  const thisWeek = startOfWeek(today)
  const perWeek = Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(thisWeek, -7 * (weeks - 1 - i))
    const end = addDays(weekStart, 7)
    const count = versions.filter((v) => {
      const d = toDateKey(new Date(v.createdAt))
      return d >= weekStart && d < end
    }).length
    return { weekStart, count }
  })
  const revisions = works
    .map((w) => ({ workId: w.id, title: w.title, versions: versions.filter((v) => v.workId === w.id).length }))
    .filter((r) => r.versions > 0)
    .sort((a, b) => b.versions - a.versions)
  const toApproval = works.flatMap((w) => {
    const approved = w.approvedVersionId ? versions.find((v) => v.id === w.approvedVersionId) : undefined
    const first = versionsOf(db, w.id)[0]
    if (!approved?.approvedAt || !first) return []
    const days = Math.max(0, Math.round((new Date(approved.approvedAt).getTime() - new Date(first.createdAt).getTime()) / 86_400_000))
    return [{ workId: w.id, title: w.title, days }]
  })
  return {
    total: works.length,
    byStatus,
    concluded: works.filter((w) => w.status === 'final_aprovada' || w.status === 'publicado').length,
    published: works.filter((w) => w.status === 'publicado').length,
    genres: [...genres].map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre, 'pt-BR')),
    themes: tagCounts(works, 'themes').map(({ tag, count }) => ({ tag, count })),
    symbols: tagCounts(works, 'symbols').map(({ tag, count }) => ({ tag, count })),
    perWeek,
    revisions,
    toApproval,
    versionsTotal: versions.length,
  }
}

// ─── Mapa da escrita (deterministic) ────────────────────────────────────────

/** A theme/symbol in ≥ this many works is flagged "muito presente". */
export const VERY_PRESENT = 3

export interface MapNode {
  tag: string
  kind: 'tema' | 'símbolo'
  works: LiteraryWork[]
  veryPresent: boolean
}

export function writingMap(db: Pick<DB, 'literaryWorks'>): MapNode[] {
  const works = (db.literaryWorks ?? []).filter((w) => w.status !== 'arquivado')
  const byId = new Map(works.map((w) => [w.id, w]))
  const nodes = (kind: 'themes' | 'symbols', label: MapNode['kind']) =>
    tagCounts(works, kind).map((t) => ({ tag: t.tag, kind: label, works: t.workIds.map((id) => byId.get(id)!).filter(Boolean), veryPresent: t.count >= VERY_PRESENT }))
  return [...nodes('symbols', 'símbolo'), ...nodes('themes', 'tema')].sort((a, b) => b.works.length - a.works.length || a.tag.localeCompare(b.tag, 'pt-BR'))
}

/** Works that share at least one theme or symbol with this one (with what they share). */
export function relatedWorks(db: Pick<DB, 'literaryWorks'>, workId: ID): { work: LiteraryWork; shared: string[] }[] {
  const works = db.literaryWorks ?? []
  const me = works.find((w) => w.id === workId)
  if (!me) return []
  const mine = new Map([...me.themes, ...me.symbols].map((t) => [normalize(t), t]))
  return works
    .filter((w) => w.id !== workId)
    .map((w) => ({ work: w, shared: [...new Set([...w.themes, ...w.symbols].map(normalize))].filter((t) => mine.has(t)).map((t) => mine.get(t)!) }))
    .filter((r) => r.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length)
}

/** "a, b, c" → ['a','b','c'] (trimmed, no empties, no duplicates). */
export function parseTags(text: string): string[] {
  const out: string[] = []
  for (const t of text.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) if (!out.some((o) => normalize(o) === normalize(t))) out.push(t)
  return out
}
