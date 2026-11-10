/**
 * Radar de vagas — the job-market newsletters she builds in ChatGPT, pasted into the app, read WITHOUT AI.
 *
 * Storage (reuses `studyItems`, no new collection): one StudyItem per paste
 *   { kind: 'newsletter', reference: true, status: 'finalizado', progress: 0, tags: ['radar-vagas'],
 *     title: 'Newsletter de vagas · DD/MM/AAAA', source: 'ChatGPT · newsletter de vagas',
 *     notes: <texto colado, cru>, finishedAt: <data da newsletter, AAAA-MM-DD> }
 * `reference` + 'finalizado' keep it out of queues, "Conteúdos salvos" and the engine's free picks.
 *
 * Extraction is a fixed dictionary of skills (pt/en synonyms). A paste is split into items (paragraphs /
 * bullet lines ≈ one vaga each); a skill counts once per item. Identical pastes are deduped by a hash of the
 * normalized text. `marketBoost(db)` turns the counts into a modest score bonus the Learning Engine uses to
 * RE-RANK existing options (never to create one). Pure; the write lives in radar-ops.ts.
 */
import type { DateKey, DB, StudyItem } from '@/data/types'
import { normalize } from '@/lib/text'
import { domainLabel, TRACK_EN, TRACK_ES, trackName } from './engine/model'

export const RADAR_TAG = 'radar-vagas'
export const RADAR_SOURCE = 'ChatGPT · newsletter de vagas'

export interface MarketSkill {
  id: string
  label: string
  patterns: RegExp[]
  /** Study tracks that ARE this skill (a language track is "material" for the language). */
  tracks?: string[]
}

/** Patterns run on `normalize`d text (lowercase, no accents). */
export const MARKET_SKILLS: MarketSkill[] = [
  { id: 'llm', label: 'LLM / IA generativa', patterns: [/\bllms?\b/, /\bia generativa\b/, /\bgenerative ai\b/, /\bgen ?ai\b/, /\blarge language models?\b/, /\bmodelos? de linguagem\b/] },
  { id: 'agentes_ia', label: 'Agentes de IA', patterns: [/\bagentes? de ia\b/, /\bai agents?\b/, /\bagentic\b/, /\bagentes? (autonomos|inteligentes)\b/] },
  { id: 'rag', label: 'RAG', patterns: [/\brag\b/, /\bretrieval[- ]augmented\b/] },
  { id: 'prompt', label: 'Prompt engineering', patterns: [/\bprompt engineering\b/, /\bengenharia de prompts?\b/, /\bprompts?\b/] },
  { id: 'discovery', label: 'Product discovery', patterns: [/\bproduct discovery\b/, /\bdiscovery\b/, /\bdescoberta de produto\b/] },
  { id: 'metricas', label: 'Métricas / analytics', patterns: [/\bmetricas?\b/, /\banalytics\b/, /\bmetrics\b/, /\bkpis?\b/] },
  { id: 'sql', label: 'SQL', patterns: [/\bsql\b/] },
  { id: 'python', label: 'Python', patterns: [/\bpython\b/] },
  { id: 'experimentacao', label: 'Experimentação / A-B', patterns: [/\ba\/b\b/, /\ba-b test/, /\bab tests?\b/, /\bab testing\b/, /\bexperimentacao\b/, /\bexperimentation\b/, /\bexperimentos?\b/] },
  { id: 'roadmap', label: 'Roadmap / estratégia', patterns: [/\broadmaps?\b/, /\bestrategia de produto\b/, /\bproduct strategy\b/, /\bvisao estrategica\b/, /\bstrategic\b/] },
  { id: 'stakeholders', label: 'Stakeholder management', patterns: [/\bstakeholders?\b/, /\bpartes interessadas\b/] },
  { id: 'b2b_saas', label: 'B2B SaaS', patterns: [/\bb2b\b/, /\bsaas\b/] },
  { id: 'fintech', label: 'Fintech', patterns: [/\bfintechs?\b/, /\bmeios de pagamento\b/, /\bpayments\b/] },
  { id: 'ingles', label: 'Inglês fluente / C1', patterns: [/\bingles\b/, /\benglish\b/, /\bc1\b/], tracks: [TRACK_EN] },
  { id: 'espanhol', label: 'Espanhol', patterns: [/\bespanhol\b/, /\bspanish\b/, /\bespanol\b/], tracks: [TRACK_ES] },
  { id: 'lideranca', label: 'Liderança', patterns: [/\blideranca\b/, /\bleadership\b/, /\bgestao de (pessoas|times?|equipes?)\b/, /\bpeople management\b/] },
  { id: 'ux_research', label: 'UX research', patterns: [/\bux research\b/, /\buser research\b/, /\bpesquisa (com|de) usuarios?\b/, /\bpesquisa ux\b/] },
  { id: 'figma', label: 'Figma', patterns: [/\bfigma\b/] },
  { id: 'data_driven', label: 'Data-driven', patterns: [/\bdata[- ]driven\b/, /\borientad[oa]s? (a|por) dados\b/, /\bbaseadas? em dados\b/] },
  { id: 'okr', label: 'OKR', patterns: [/\bokrs?\b/] },
]

const SKILL_BY_ID = new Map(MARKET_SKILLS.map((s) => [s.id, s]))
export const skillLabelOf = (id: string) => SKILL_BY_ID.get(id)?.label ?? id

// ─── Pastes ─────────────────────────────────────────────────────────────────

export const isRadarItem = (i: Pick<StudyItem, 'tags'>) => !!i.tags?.includes(RADAR_TAG)

export function radarItems(db: Pick<DB, 'studyItems'>): StudyItem[] {
  return db.studyItems.filter(isRadarItem).sort((a, b) => radarDate(b).localeCompare(radarDate(a)))
}

export const radarDate = (i: Pick<StudyItem, 'finishedAt' | 'createdAt'>): DateKey => i.finishedAt ?? i.createdAt.slice(0, 10)

const canonical = (text: string) => normalize(text).replace(/\s+/g, ' ').trim()

/** FNV-1a (32 bits) of the normalized text — two pastes with the same words are the same paste. */
export function pasteHash(text: string): string {
  let h = 0x811c9dc5
  for (const ch of canonical(text)) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Items of a paste (≈ one vaga each): blank lines and bullet/numbered lines start a new item. */
export function splitItems(text: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  const flush = () => {
    const t = cur.join(' ').trim()
    if (t) out.push(t)
    cur = []
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    if (/^([-*•·▪–]|\d{1,2}[.)])\s+/.test(line)) flush()
    cur.push(line)
  }
  flush()
  return out
}

export function skillsIn(text: string): string[] {
  const t = normalize(text)
  return MARKET_SKILLS.filter((s) => s.patterns.some((p) => p.test(t))).map((s) => s.id)
}

/** Skill → items (vagas) of this paste that mention it. */
export function extractSkills(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of splitItems(text)) for (const id of skillsIn(item)) out[id] = (out[id] ?? 0) + 1
  return out
}

export interface HotSkill {
  id: string
  label: string
  /** Items (vagas) that mention it, across all pastes. */
  count: number
  /** Pastes (newsletters) that mention it. */
  pastes: number
  lastSeen: DateKey
}

/** Every skill seen in the pastes (identical pastes count once), most mentioned first. */
export function skillCounts(db: Pick<DB, 'studyItems'>): HotSkill[] {
  const seen = new Set<string>()
  const acc = new Map<string, HotSkill>()
  for (const p of [...radarItems(db)].reverse()) {
    const text = p.notes ?? ''
    const h = pasteHash(text)
    if (!text.trim() || seen.has(h)) continue
    seen.add(h)
    const date = radarDate(p)
    for (const [id, n] of Object.entries(extractSkills(text))) {
      const s = acc.get(id) ?? { id, label: skillLabelOf(id), count: 0, pastes: 0, lastSeen: date }
      s.count += n
      s.pastes += 1
      if (date > s.lastSeen) s.lastSeen = date
      acc.set(id, s)
    }
  }
  return [...acc.values()].sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen) || a.id.localeCompare(b.id))
}

export const hotSkills = (db: Pick<DB, 'studyItems'>, n = 8): HotSkill[] => skillCounts(db).slice(0, n)

// ─── Calibration ────────────────────────────────────────────────────────────

/** Score bonus per skill (0–10, grows with mentions): a modest nudge, never more than a real deadline. */
export function marketBoost(db: Pick<DB, 'studyItems'>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of skillCounts(db)) out[s.id] = Math.min(10, 2 + 2 * s.count)
  return out
}

/** Skills an option is about: its title, what it contributes to, its subject, and the resource behind it. */
export function optionSkills(
  db: Pick<DB, 'studyItems' | 'studyTracks' | 'profile'>,
  o: { key: string; title: string; domain?: string; trackId?: string; contributesTo?: string[] },
): string[] {
  const id = /^study:(?:item|free):(.+)$/.exec(o.key)?.[1]
  const item = id ? db.studyItems.find((i) => i.id === id) : undefined
  const text = [o.title, ...(o.contributesTo ?? []), o.domain ? domainLabel(db, o.domain) : '', trackName(db, o.trackId), item?.title, item?.nextContent, ...(item?.tags ?? [])]
    .filter(Boolean)
    .join(' · ')
  const ids = new Set(skillsIn(text))
  for (const s of MARKET_SKILLS) if (o.trackId && s.tracks?.includes(o.trackId)) ids.add(s.id)
  return [...ids]
}

/** Adds the market bonus to options that match a hot skill (same options, new order). Mutates scores/reasons. */
export function applyMarketBoost<T extends { key: string; title: string; score: number; reasons: string[]; domain?: string; trackId?: string; contributesTo?: string[] }>(
  db: Pick<DB, 'studyItems' | 'studyTracks' | 'profile'>,
  options: T[],
): T[] {
  const boost = marketBoost(db)
  if (!Object.keys(boost).length) return options
  const counts = new Map(skillCounts(db).map((s) => [s.id, s]))
  for (const o of options) {
    const best = optionSkills(db, o)
      .filter((id) => boost[id])
      .sort((a, b) => boost[b] - boost[a] || a.localeCompare(b))[0]
    if (!best) continue
    const n = counts.get(best)!.count
    o.score = Math.max(0, Math.min(100, Math.round(o.score + boost[best])))
    o.reasons.push(`Aparece em ${n} ${n === 1 ? 'vaga' : 'vagas'} das newsletters (${skillLabelOf(best)}).`)
  }
  return options
}

/** Hot skills with no study material of hers (items, books, tracks) mentioning them. No task is created. */
export function marketGaps(db: Pick<DB, 'studyItems' | 'studyTracks' | 'books'>, n = 8): HotSkill[] {
  const material = [
    ...db.studyItems.filter((i) => !isRadarItem(i)).map((i) => [i.title, i.nextContent, i.notes, ...(i.tags ?? [])].filter(Boolean).join(' · ')),
    ...db.books.map((b) => b.title),
    ...db.studyTracks.map((t) => t.name),
  ]
  const covered = new Set(material.flatMap(skillsIn))
  const trackIds = new Set(db.studyTracks.map((t) => t.id))
  for (const s of MARKET_SKILLS) if (s.tracks?.some((t) => trackIds.has(t))) covered.add(s.id)
  return hotSkills(db, n).filter((s) => !covered.has(s.id))
}
