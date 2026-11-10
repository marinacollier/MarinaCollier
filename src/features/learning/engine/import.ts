/**
 * Bringing study history in — never automatically, always with a preview.
 *
 * 1. JSON import (sessions + review cards from another app/notebook). Schema:
 *
 *    {
 *      "sessions": [{
 *        "id": "ext-2026-11-09-1",          // required, stable: the same id never comes in twice
 *        "date": "2026-11-09", "minutes": 60, // required
 *        "domain": "idiomas",               // required unless trackId is given (then derived)
 *        "trackId": "track-ingles",         // optional
 *        "title"?, "startTime"?, "relatedDomains"?: [], "skills"?: [], "topics"?: [], "tags"?: [],
 *        "resourceType"?, "contentLanguage"?, "learningMode"?, "tool"?, "relatedProjectId"?,
 *        "status"?, "context"?, "evidence"?, "notes"?, "learned"?, "linkedEventId"?,
 *        "minutesUnknown"?: true,           // real session, net duration not confirmed → minutes 0 (may be omitted)
 *        "origin"?: "escola" | "independente" | "reuniao" | "conversa" | "mensagem" | "outro",
 *        "assisted"?: true, "content"?: [{ "area": "grammar", "title": "...", "items": ["..."] }]
 *      }],
 *      "cards": [{                          // also accepted as "errors"
 *        "id": "ext-err-1",                 // required, stable
 *        "front": "...", "back": "...",     // required (also accepted: "original" / "correction")
 *        "kind"?: "erro" | "conceito", "domain"?, "trackId"?, "explanation"?, "category"?,
 *        "sessionId"?, "count"?: 1, "firstSeen"?: "YYYY-MM-DD"
 *      }]
 *    }
 *
 *    Records whose id already exists are skipped (dedupe by id). Invalid rows are listed, never guessed.
 *
 * 2. "Importar como erros": the topics written in a study item (e.g. 'marina:inv:ingles-pratica-erros')
 *    become review cards with stable ids — one tap, idempotent.
 */
import type { DateKey, DB, LearningError, LearningMode, LearningResourceType, LearningTool, NewItem, StudyContent, StudyContentArea, StudyItem, StudySession, StudySessionOrigin, StudySessionStatus } from '@/data/types'
import { isDateKey } from '@/lib/date'
import { normalize } from '@/lib/text'
import { domainOfTrackId, LANG_DOMAIN, TRACK_EN } from './model'
import { newCardFields } from './srs'

export interface ImportPreview {
  sessions: NewItem<'studySessions'>[]
  cards: NewItem<'learningErrors'>[]
  skipped: { id: string; reason: string }[]
  invalid: string[]
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const strs = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : undefined)

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as T
}

const ORIGINS: StudySessionOrigin[] = ['escola', 'independente', 'reuniao', 'conversa', 'mensagem', 'outro']
const AREAS: StudyContentArea[] = ['reading', 'speaking', 'listening', 'writing', 'grammar', 'vocabulary', 'pronunciation']

function contentOf(v: unknown): StudyContent[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v
    .map((c: Record<string, unknown>) => ({ area: c?.area as StudyContentArea, title: str(c?.title) ?? '', items: strs(c?.items) ?? [] }))
    .filter((c) => AREAS.includes(c.area) && (c.title || c.items.length))
  return out.length ? out : undefined
}

export function previewImport(db: DB, raw: string, today: DateKey): ImportPreview {
  const out: ImportPreview = { sessions: [], cards: [], skipped: [], invalid: [] }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    out.invalid.push('O texto não é um JSON válido.')
    return out
  }
  const o = (data ?? {}) as Record<string, unknown>
  const haveS = new Set((db.studySessions ?? []).map((s) => s.id))
  const haveC = new Set((db.learningErrors ?? []).map((c) => c.id))
  const rows = Array.isArray(o.sessions) ? o.sessions : []
  rows.forEach((r: Record<string, unknown>, i) => {
    const id = str(r?.id)
    const date = str(r?.date)
    const minutesUnknown = r?.minutesUnknown === true
    const minutes = minutesUnknown ? 0 : typeof r?.minutes === 'number' ? Math.round(r.minutes) : NaN
    const trackId = str(r?.trackId)
    const domain = str(r?.domain) ?? (trackId ? domainOfTrackId(db, trackId) : undefined)
    if (!id || !date || !isDateKey(date) || !(minutes > 0 || minutesUnknown) || !domain) {
      out.invalid.push(`Sessão ${i + 1}: precisa de id, date (AAAA-MM-DD), minutes > 0 (ou minutesUnknown) e domain (ou trackId).`)
      return
    }
    if (haveS.has(id) || out.sessions.some((s) => s.id === id)) {
      out.skipped.push({ id, reason: 'já existe' })
      return
    }
    out.sessions.push(
      clean({
        id,
        date,
        minutes,
        domain,
        trackId,
        title: str(r.title),
        startTime: str(r.startTime),
        relatedDomains: strs(r.relatedDomains),
        skills: strs(r.skills),
        topics: strs(r.topics),
        tags: strs(r.tags),
        resourceType: str(r.resourceType) as LearningResourceType | undefined,
        contentLanguage: str(r.contentLanguage),
        learningMode: str(r.learningMode) as LearningMode | undefined,
        tool: str(r.tool) as LearningTool | undefined,
        relatedProjectId: str(r.relatedProjectId),
        status: str(r.status) as StudySessionStatus | undefined,
        context: str(r.context),
        evidence: str(r.evidence),
        notes: str(r.notes),
        learned: str(r.learned),
        linkedEventId: str(r.linkedEventId),
        minutesUnknown: minutesUnknown || undefined,
        origin: ORIGINS.includes(r.origin as StudySessionOrigin) ? (r.origin as StudySessionOrigin) : undefined,
        assisted: r.assisted === true || undefined,
        content: contentOf(r.content),
        source: 'importado' as const,
      }) as NewItem<'studySessions'>,
    )
  })
  const cards = Array.isArray(o.cards) ? o.cards : Array.isArray(o.errors) ? o.errors : []
  cards.forEach((r: Record<string, unknown>, i) => {
    const id = str(r?.id)
    const front = str(r?.front) ?? str(r?.original)
    const back = str(r?.back) ?? str(r?.correction)
    if (!id || !front || !back) {
      out.invalid.push(`Cartão ${i + 1}: precisa de id, front e back.`)
      return
    }
    if (haveC.has(id) || out.cards.some((c) => c.id === id)) {
      out.skipped.push({ id, reason: 'já existe' })
      return
    }
    const first = str(r.firstSeen)
    const trackId = str(r.trackId)
    const base = newCardFields(first && isDateKey(first) ? first : today)
    out.cards.push(
      clean({
        ...base,
        count: typeof r.count === 'number' && r.count > 0 ? Math.round(r.count) : 1,
        id,
        front,
        back,
        kind: r.kind === 'conceito' ? ('conceito' as const) : ('erro' as const),
        domain: str(r.domain) ?? (trackId ? domainOfTrackId(db, trackId) : undefined),
        trackId,
        explanation: str(r.explanation),
        category: str(r.category),
        sessionId: str(r.sessionId),
        source: 'importado',
      }) as NewItem<'learningErrors'>,
    )
  })
  return out
}

// ─── "Importar como erros" from a study item's text ─────────────────────────

export const ERRORS_ITEM_ID = 'marina:inv:ingles-pratica-erros'

/** Known English error topics: how to recognise them in her text + a short, general correction. */
const TOPICS: { slug: string; match: RegExp; back: string; category: string }[] = [
  { slug: 'do-does-be', match: /do\s*\/?\s*does.*\bbe\b|do\/does vs be/i, back: 'Com verbo "to be" não se usa do/does: "Is she ready?" (não "Does she is…"); com outros verbos: "Does she work?"', category: 'verbos auxiliares' },
  { slug: 'terceira-pessoa', match: /3[ªa]?\s*pessoa|third person|terceira pessoa/i, back: 'He/she/it no presente leva -s: "she works", "it goes".', category: 'verbos' },
  { slug: 'going-to', match: /going to/i, back: '"I\'m going to + verbo" (com be): "I\'m going to travel".', category: 'futuro' },
  { slug: 'can-sem-to', match: /\bcan\b.*\bto\b|can sem to/i, back: 'Depois de can, verbo sem "to": "I can swim".', category: 'modais' },
  { slug: 'know-now', match: /know\s*\/?\s*now/i, back: 'know /noʊ/ = saber, conhecer · now /naʊ/ = agora.', category: 'pronúncia' },
  { slug: 'good-well', match: /good\s*\/?\s*well/i, back: 'good = adjetivo ("a good job") · well = advérbio ("I did it well").', category: 'adjetivo × advérbio' },
  { slug: 'artigos-plurais', match: /artigos?|plura/i, back: 'Revisar a/an/the e plurais (-s, -es, irregulares).', category: 'artigos e plurais' },
  { slug: 'preposicoes', match: /preposi/i, back: 'Revisar in/on/at (tempo e lugar) e preposições depois de verbos.', category: 'preposições' },
  { slug: 'word-stress', match: /word stress|acento/i, back: 'Marcar a sílaba tônica ao aprender a palavra (PHOtograph, phoTOgraphy).', category: 'pronúncia' },
  { slug: 'though-through', match: /though|through|thought|bought/i, back: 'though /ðoʊ/ (embora) · through /θruː/ (através) · thought /θɔːt/ (pensou) · bought /bɔːt/ (comprou).', category: 'pronúncia' },
]

export const topicCardId = (itemId: string, slug: string) => `${itemId}:card:${slug}`

/** Split the item's text into topic lines (bullets, numbers, semicolons, new lines). */
function lines(text: string): string[] {
  return text
    .split(/\n|;|•|(?:^|\s)\d+[.)]\s/)
    .map((l) => l.replace(/^[\s\-–*·]+/, '').trim())
    .filter((l) => l.length > 2)
}

const slugOf = (t: string) => normalize(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/** Cards that "importar como erros" would create now (already-imported ids left out). */
export function errorTopicsFrom(db: DB, item: Pick<StudyItem, 'id' | 'title' | 'notes' | 'nextContent' | 'trackId'>, today: DateKey): NewItem<'learningErrors'>[] {
  const text = [item.notes, item.nextContent].filter(Boolean).join('\n')
  const have = new Set((db.learningErrors ?? []).map((c) => c.id))
  const out: NewItem<'learningErrors'>[] = []
  const seen = new Set<string>()
  for (const line of lines(text)) {
    const topic = TOPICS.find((t) => t.match.test(line))
    const slug = topic?.slug ?? slugOf(line)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    const id = topicCardId(item.id, slug)
    if (have.has(id)) continue
    out.push({
      ...newCardFields(today),
      id,
      kind: 'erro',
      domain: LANG_DOMAIN,
      trackId: item.trackId ?? TRACK_EN,
      front: line,
      back: topic?.back ?? 'a completar (escreva a forma certa)',
      category: topic?.category ?? 'outros',
      source: `estudo: ${item.title}`,
    })
  }
  return out
}

export type { LearningError, StudySession }
