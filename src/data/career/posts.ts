/**
 * LinkedIn posts — Modo A. The app never calls LinkedIn (no API, no scraping, no logged-in automation):
 * Marina drafts here, approves the exact text, copies it, publishes it herself and pastes the URL back.
 *
 * Approval gate: approving stores the normalized text + its SHA-256. Any later edit to the body drops the
 * post back to "rascunho". Only an approved, unchanged text can be copied for publishing.
 */
import { actions, getDB } from '../store'
import { logCareerActivity } from './activities'
import type { DateKey, ExecPost, ExecPostMetric, ExecPostStatus, ID } from '../types'
import { nowISO } from '@/lib/id'

export type Undo = () => void

/** LinkedIn's limit for a post's text. */
export const POST_CHAR_LIMIT = 3000
/** Roughly what shows before "…ver mais" (varies by device — always labelled as approximate). */
export const SEE_MORE_APPROX = 210

export const POST_STATUS_LABEL: Record<ExecPostStatus, string> = {
  ideia: 'ideia',
  rascunho: 'rascunho',
  revisao: 'em revisão',
  aprovado: 'aprovado',
  publicado: 'publicado',
  arquivado: 'arquivado',
}

/** Same text for approval purposes: unified line breaks, no trailing spaces, trimmed. */
export function normalizeBody(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim()
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Blocked terms present in the text (case- and accent-insensitive, whole words). */
export function blockedTermsIn(body: string, terms: string[]): string[] {
  const text = fold(body)
  return terms
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(fold(t))}(?![\\p{L}\\p{N}])`, 'u').test(text))
}

/** What still stops a draft from going to review. Empty = ready. */
export function reviewBlockers(p: Pick<ExecPost, 'body' | 'checks'>, blockedTerms: string[]): string[] {
  const out: string[] = []
  const body = normalizeBody(p.body)
  if (!body) out.push('o texto está vazio')
  if (body.length > POST_CHAR_LIMIT) out.push(`passa de ${POST_CHAR_LIMIT.toLocaleString('pt-BR')} caracteres`)
  for (const t of blockedTermsIn(body, blockedTerms)) out.push(`contém termo bloqueado: “${t}”`)
  if (!p.checks.ndaOk) out.push('falta confirmar: sem cliente nem dado confidencial')
  if (!p.checks.claimsVerified) out.push('falta confirmar: cargos e números citados são reais')
  return out
}

/** Approval still matches the current text. */
export const approvalIntact = (p: ExecPost): boolean => !!p.approval && normalizeBody(p.body) === p.approval.bodySnapshot

/** Only an approved, unchanged text can be copied for publishing. */
export const canCopy = (p: ExecPost): boolean => p.status === 'aprovado' && approvalIntact(p)

export type ParsedPostUrl = { ok: true; url: string; urn?: string } | { ok: false; reason: string }

/**
 * Accepts the URL of a post or article on linkedin.com:
 *   /feed/update/urn:li:activity:123…   /posts/slug-activity-123…-xyz   /pulse/slug (article)
 */
export function parsePostUrl(raw: string): ParsedPostUrl {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'não parece um link' }
  }
  if (!/^(?:[a-z]{2,3}\.|www\.)?linkedin\.com$/i.test(u.hostname)) return { ok: false, reason: 'precisa ser um link do linkedin.com' }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'não parece um link' }
  const path = decodeURIComponent(u.pathname)
  const url = `https://www.linkedin.com${u.pathname.replace(/\/+$/, '')}`
  const feed = path.match(/^\/feed\/update\/(urn:li:(?:activity|share|ugcPost):\d+)/i)
  if (feed) return { ok: true, url, urn: feed[1] }
  const post = path.match(/^\/posts\/[^/]*?-(activity|share|ugcPost)-(\d+)(?:-[^/]*)?\/?$/i)
  if (post) return { ok: true, url, urn: `urn:li:${post[1]}:${post[2]}` }
  if (/^\/pulse\/[^/]+/i.test(path)) return { ok: true, url }
  if (/^\/in\//i.test(path)) return { ok: false, reason: 'esse é o link do perfil — abra o post e copie o link dele' }
  return { ok: false, reason: 'não reconheci como link de post (use “Copiar link para o post”)' }
}

const byId = (id: ID) => getDB().execPosts.find((p) => p.id === id)

export function createPost(fields: Partial<Omit<ExecPost, 'id' | 'createdAt' | 'updatedAt'>> & { title: string }): { post: ExecPost; undo: Undo } {
  const db = getDB()
  const post = actions.create('execPosts', {
    status: fields.body?.trim() ? 'rascunho' : 'ideia',
    body: '',
    language: 'en',
    checks: { ndaOk: false, claimsVerified: false },
    order: db.execPosts.length,
    ...fields,
  })
  return { post, undo: () => void actions.remove('execPosts', post.id) }
}

/**
 * Saves edits. If the body no longer matches the approved text, approval is dropped and the post goes back
 * to "rascunho" (also out of "revisao", since she'd be reviewing a different text).
 */
export function savePost(id: ID, patch: Partial<Pick<ExecPost, 'title' | 'body' | 'language' | 'pillar' | 'plannedDate' | 'checks' | 'notes' | 'sourceWinIds'>>): { invalidated: boolean; undo: Undo } {
  const before = byId(id)
  if (!before) return { invalidated: false, undo: () => {} }
  const next = { ...before, ...patch }
  const bodyChanged = patch.body !== undefined && normalizeBody(patch.body) !== normalizeBody(before.body)
  let status = next.status
  let approval = next.approval
  let invalidated = false
  if (bodyChanged && (before.status === 'aprovado' || before.status === 'revisao')) {
    invalidated = before.status === 'aprovado'
    status = 'rascunho'
    approval = undefined
  }
  if (status === 'ideia' && normalizeBody(next.body)) status = 'rascunho'
  if (before.status === 'publicado') {
    // A published post keeps its history; body edits are notes about what went out, not a new approval.
    status = 'publicado'
    approval = before.approval
    invalidated = false
  }
  actions.update('execPosts', id, { ...patch, status, approval })
  return { invalidated, undo: () => actions.update('execPosts', id, before) }
}

export function sendToReview(id: ID, blockedTerms: string[]): { ok: boolean; blockers: string[]; undo: Undo } {
  const p = byId(id)
  if (!p) return { ok: false, blockers: ['post não encontrado'], undo: () => {} }
  const blockers = reviewBlockers(p, blockedTerms)
  if (blockers.length || (p.status !== 'rascunho' && p.status !== 'ideia')) return { ok: false, blockers, undo: () => {} }
  actions.update('execPosts', id, { status: 'revisao' })
  return { ok: true, blockers: [], undo: () => actions.update('execPosts', id, { status: p.status }) }
}

/** Marina's approval of the exact text on screen. Re-checks the blockers: approval never skips them. */
export async function approvePost(id: ID, blockedTerms: string[]): Promise<{ ok: boolean; blockers: string[]; undo: Undo }> {
  const p = byId(id)
  if (!p || p.status !== 'revisao') return { ok: false, blockers: ['só um post em revisão pode ser aprovado'], undo: () => {} }
  const blockers = reviewBlockers(p, blockedTerms)
  if (blockers.length) return { ok: false, blockers, undo: () => {} }
  const bodySnapshot = normalizeBody(p.body)
  const bodyHash = await sha256Hex(bodySnapshot)
  // The text may have changed while hashing.
  const now = byId(id)
  if (!now || normalizeBody(now.body) !== bodySnapshot || now.status !== 'revisao') return { ok: false, blockers: ['o texto mudou durante a aprovação — aprova de novo'], undo: () => {} }
  actions.update('execPosts', id, { status: 'aprovado', approval: { approvedAt: nowISO(), bodyHash, bodySnapshot } })
  return { ok: true, blockers: [], undo: () => actions.update('execPosts', id, { status: p.status, approval: p.approval }) }
}

/** Back to drafting (e.g. she wants to change something after approving). */
export function reopenDraft(id: ID): Undo {
  const p = byId(id)
  if (!p || p.status === 'publicado') return () => {}
  actions.update('execPosts', id, { status: 'rascunho', approval: undefined })
  return () => actions.update('execPosts', id, { status: p.status, approval: p.approval })
}

/** The exact text to paste on LinkedIn, or undefined when the gate is closed. */
export const textToPublish = (p: ExecPost): string | undefined => (canCopy(p) ? p.approval!.bodySnapshot : undefined)

/**
 * She published it and pasted the URL. Counts as one "Conteúdo profissional" on the career week (same quota the
 * planner uses), so the 2 posts/week line stays honest without a parallel counter.
 */
export function markPublished(id: ID, input: { url: string; date: DateKey; matchesApproved: boolean; finalBody?: string }): { ok: true; undo: Undo } | { ok: false; reason: string } {
  const p = byId(id)
  if (!p) return { ok: false, reason: 'post não encontrado' }
  if (p.status !== 'aprovado' || !approvalIntact(p)) return { ok: false, reason: 'só um texto aprovado (e não editado depois) pode ser registrado como publicado' }
  const parsed = parsePostUrl(input.url)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  const dup = getDB().execPosts.find((x) => x.id !== id && x.publication?.url === parsed.url)
  if (dup) return { ok: false, reason: `esse link já está registrado em “${dup.title}”` }
  const finalBody = input.matchesApproved ? undefined : input.finalBody?.trim() || undefined
  actions.update('execPosts', id, {
    status: 'publicado',
    publication: { publishedOn: input.date, url: parsed.url, urn: parsed.urn, matchesApproved: input.matchesApproved, finalBody },
  })
  const career = logCareerActivity('post', input.date, { note: p.title })
  return {
    ok: true,
    undo: () => {
      career?.undo()
      actions.update('execPosts', id, { status: p.status, publication: p.publication })
    },
  }
}

/** Adds (or replaces, same day + source) a reading of the post's analytics. */
export function addMetric(id: ID, m: ExecPostMetric): Undo {
  const p = byId(id)
  if (!p) return () => {}
  const others = (p.metrics ?? []).filter((x) => !(x.capturedOn === m.capturedOn && x.source === m.source))
  actions.update('execPosts', id, { metrics: [...others, m].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn)) })
  return () => actions.update('execPosts', id, { metrics: p.metrics })
}

export function archivePost(id: ID): Undo {
  const p = byId(id)
  if (!p || p.status === 'publicado') return () => {}
  actions.update('execPosts', id, { status: 'arquivado' })
  return () => actions.update('execPosts', id, { status: p.status })
}

const STATUS_ORDER: ExecPostStatus[] = ['aprovado', 'revisao', 'rascunho', 'ideia', 'publicado', 'arquivado']

/** Posts grouped for the page: what needs her first, then the record. */
export function postGroups(posts: ExecPost[]): { status: ExecPostStatus; posts: ExecPost[] }[] {
  return STATUS_ORDER.map((status) => ({
    status,
    posts: posts
      .filter((p) => p.status === status)
      .sort((a, b) =>
        status === 'publicado'
          ? (b.publication?.publishedOn ?? '').localeCompare(a.publication?.publishedOn ?? '')
          : (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999') || a.order - b.order,
      ),
  })).filter((g) => g.posts.length)
}

/** Latest reading per post + simple engagement rate (reactions + comments + reposts) / impressions. */
export function latestMetric(p: ExecPost): (ExecPostMetric & { engagementRate?: number }) | undefined {
  const m = p.metrics?.[p.metrics.length - 1]
  if (!m) return undefined
  const eng = (m.reactions ?? 0) + (m.comments ?? 0) + (m.reposts ?? 0)
  return { ...m, engagementRate: m.impressions ? eng / m.impressions : undefined }
}
