/**
 * Message Strategy Engine — it thinks before anything is written:
 *   WHO IS THIS BRAND? · WHO IS MARINA FOR THIS BRAND? · WHAT IS THE STRONGEST INTERSECTION?
 * Pure (no writes, no network). Input: CreatorProfile + Brand + Opportunity + relationship + channel +
 * recent messages. Output: what to talk about (1–2 contexts, never all), what to avoid, the angle, the TRUE
 * brand fact (with its source) or a clear "missing", how to speak about the relationship (never invented),
 * the channel's shape, and what the last messages already used (to vary).
 */
import type { Brand, BrandFact, CreatorProfile, DB, UgcChannel, UgcOpportunity } from '../types'
import { addDays, formatDayMonth } from '@/lib/date'
import { normalize } from '@/lib/text'
import { CREATOR_PROFILE } from './model'

// ─── Relevance by category ──────────────────────────────────────────────────

interface Fit {
  /** Her contexts, strongest first. Only things she actually lives (from CreatorProfile). */
  talk: string[]
  avoid: string[]
  /** How the angle reads for this kind of brand (no invented facts — about her real routine). */
  angle: (talk: string[], trip?: string) => string
  /** The trip is a strong, true context for this kind of brand. */
  trip?: boolean
}

const FITS: [RegExp, Fit][] = [
  [/outdoor|aventura|trek|trilha|camping|montanha|mochila|bota/, { talk: ['trekking', 'viagens e experiências outdoor', 'bike', 'corrida'], avoid: ['IA', 'tecnologia', 'escritório', 'musculação'], trip: true, angle: (t, trip) => (trip ? `conteúdo de ${t[0]} gravado ${trip}` : `conteúdo real de ${t[0]} e aventura`) }],
  [/suplement|nutri|proteina|whey|recovery|recupera|hidrat|isoton|vitamina/, { talk: ['rotina real de treino', 'triathlon', 'corrida', 'musculação'], avoid: ['trekking', 'viagens', 'IA', 'tecnologia'], angle: () => 'conteúdo de recovery e rotina de treino de triathlon, do jeito que acontece de verdade' }],
  [/fintech|banco|pagament|cartao|cambio|conta global|investiment|financ/, { talk: ['viagens', 'tecnologia', 'IA'], avoid: ['musculação', 'rotina real de treino', 'academia', 'suplementos'], trip: true, angle: (_t, trip) => (trip ? `conteúdo sobre viajar e se virar com pagamentos fora do país, gravado ${trip}` : 'conteúdo sobre tecnologia e finanças no dia a dia de quem viaja a trabalho') }],
  [/moda esport|vestuario|roupa|tenis|calcado|activewear|legging|running apparel|moda/, { talk: ['corrida', 'lifestyle ativo', 'rotina real de treino'], avoid: ['IA', 'finanças', 'tecnologia'], angle: () => 'conteúdo de looks pra corrida e treino no dia a dia' }],
  [/\bbike|ciclis|bicicleta|gravel|pedal/, { talk: ['bike', 'triathlon', 'viagens e experiências outdoor'], avoid: ['IA', 'finanças', 'escritório'], angle: () => 'conteúdo de pedal de verdade, nos treinos de triathlon' }],
  [/natacao|nado|swim|surf|praia|oculos de natacao|neoprene/, { talk: ['natação', 'surf', 'triathlon'], avoid: ['IA', 'finanças', 'escritório'], angle: (t) => `conteúdo de ${t[0]} na rotina de triathlon` }],
  [/corrida|running|run\b|maratona/, { talk: ['corrida', 'triathlon', 'rotina real de treino'], avoid: ['IA', 'finanças'], angle: () => 'conteúdo de corrida na rotina real de treino' }],
  [/yoga|meditac|bem-estar|wellness|mindful/, { talk: ['yoga', 'rotina real de treino', 'lifestyle ativo'], avoid: ['IA', 'finanças'], angle: () => 'conteúdo de yoga como parte de uma rotina ativa' }],
  [/\bpet\b|cachorro|\bcao|racao|petshop|dog/, { talk: ['Luna (cachorro)', 'lifestyle ativo'], avoid: ['IA', 'finanças', 'musculação'], angle: () => 'conteúdo da rotina ativa com a Luna' }],
  [/cafe|coffee|cafeteria/, { talk: ['café', 'rotina real de treino'], avoid: ['finanças', 'musculação'], angle: () => 'conteúdo do café na rotina de quem treina cedo' }],
  [/viage|turism|hotel|hostel|mala|bagagem|passagem|airline|aerea|seguro viagem/, { talk: ['viagens', 'viagens e experiências outdoor'], avoid: ['musculação', 'IA', 'escritório'], trip: true, angle: (_t, trip) => (trip ? `conteúdo da viagem ${trip}` : 'conteúdo de viagem com experiências reais') }],
  [/\btech|tecnolog|software|\bapp\b|aplicativo|\bia\b|inteligencia artificial|produtiv|saas/, { talk: ['tecnologia', 'IA'], avoid: ['musculação', 'suplementos', 'trekking'], angle: () => 'conteúdo de tecnologia e IA aplicadas na rotina de verdade' }],
]

const asText = (b: Brand) => normalize([b.category, b.subcategory, ...(b.products ?? []), ...(b.tags ?? [])].filter(Boolean).join(' '))

/** The next trip, said as she would ("na África do Sul em novembro") — only when it's real and close. */
export function tripContext(db: Pick<DB, 'trips'>, today: string): string | undefined {
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  const t = (db.trips ?? [])
    .filter((x) => x.startDate && x.startDate >= today && x.startDate <= addDays(today, 150) && x.status !== 'concluida')
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!))[0]
  if (!t) return undefined
  const where = /africa/.test(normalize(t.name)) ? 'na África do Sul' : `em ${t.name.replace(/\s*\d{4}$/, '')}`
  return `${where} em ${MONTHS[Number(t.startDate!.slice(5, 7)) - 1]}`
}

// ─── Relationship (never invented) ──────────────────────────────────────────

export interface RelationshipRule {
  known: boolean
  /** How the message may speak about it. */
  say: string
  /** Claims the message must not contain (checked on every text). */
  forbidden: RegExp[]
}

// (no trailing \b after accented letters: JS \b is ASCII-only)
const FAKE_EXPERIENCE = [/\buso h[aá]\s/i, /\bsempre fui f[aã]/i, /\bj[aá] faz parte da minha rotina/i, /\bh[aá] (anos|meses)/i, /\bsou f[aã] de carteirinha/i, /\bj[aá] us(o|ei|amos)\b/i, /\bsou cliente\b/i]

export function relationshipRule(b: Brand): RelationshipRule {
  const how = b.howDiscovered?.trim()
  if (b.alreadyCustomer) {
    const p = b.productsUsed?.length ? ` (${b.productsUsed.slice(0, 2).join(', ')})` : ''
    // she said so — but never a duration or "sempre"
    return { known: true, say: `já é cliente${p}`, forbidden: [/\bh[aá] (anos|meses)/i, /\bsempre fui\b/i, /\bdesde sempre\b/i] }
  }
  if (b.alreadyUsedProduct) {
    const p = b.productsUsed?.length ? ` ${b.productsUsed[0]}` : ''
    return { known: true, say: `já usou${p}`, forbidden: [/\bh[aá] (anos|meses)/i, /\bsempre fui\b/i, /\bsou cliente\b/i] }
  }
  const known = b.alreadyUsedProduct === false || b.alreadyCustomer === false
  return { known, say: how ? `conheceu ${how} — nunca usou` : 'conhece a marca, nunca usou — “conheci recentemente” / “tenho acompanhado”', forbidden: FAKE_EXPERIENCE }
}

// ─── Channels ───────────────────────────────────────────────────────────────

export interface ChannelSpec {
  min: number
  max: number
  subject: boolean
  links: boolean
  greeting: boolean
  tone: string
}

export const CHANNEL_SPEC: Record<UgcChannel, ChannelSpec> = {
  dm: { min: 30, max: 80, subject: false, links: false, greeting: true, tone: 'curta e natural; primeira mensagem sem cara de proposta' },
  email: { min: 80, max: 170, subject: true, links: true, greeting: true, tone: 'estruturada: assunto + corpo, portfólio e Instagram no fim' },
  formulario: { min: 40, max: 130, subject: false, links: true, greeting: false, tone: 'direta, sem introdução desnecessária' },
  linkedin: { min: 35, max: 100, subject: false, links: false, greeting: true, tone: 'profissional e enxuta' },
  whatsapp: { min: 20, max: 70, subject: false, links: false, greeting: true, tone: 'conversacional, nada de e-mail formal' },
}

/** Agency / robot / flattery phrases she never wants to send. */
export const CLICHES = [
  'seria uma honra',
  'sou apaixonada pela missao',
  'apaixonada pela marca',
  'juntos podemos criar algo incrivel',
  'criar algo incrivel juntos',
  'sinergia',
  'parceria de sucesso',
  'amo a marca de voces',
  'amo muito a marca',
  'espero que esteja tudo bem',
  'venho por meio desta',
  'gostaria de apresentar',
  'oportunidade unica',
  'agregar valor',
]

// ─── The strategy ───────────────────────────────────────────────────────────

export interface MessageStrategy {
  brand: Brand
  channel: UgcChannel
  spec: ChannelSpec
  /** 1–2 contexts of hers — the strongest intersection, never a list of everything. */
  talk: string[]
  avoid: string[]
  angle: string
  /** A TRUE detail of the brand with its source, or undefined (then nothing is praised). */
  fact?: BrandFact
  relationship: RelationshipRule
  contact?: string
  /** What's missing to do it well — one question first when the relationship is unknown. */
  missing: ('relação' | 'categoria' | 'fato')[]
  warnings: string[]
  /** Openings / closings already used recently (the writer must not repeat them). */
  recentOpenings: string[]
  recentClosings: string[]
  creator: CreatorProfile
  trip?: string
}

const firstWords = (t: string, n = 5) => normalize(t).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, n).join(' ')
const lastSentence = (t: string) => {
  const parts = t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s && !/^(um abraço|abraços|abs|marina|@|marinacollier)/i.test(s))
  return normalize(parts.at(-1) ?? '')
}

/** The texts she produced recently (sent first, then approved, then generated). */
export function recentTexts(db: Pick<DB, 'ugcMessages' | 'ugcInteractions'>, limit = 20): string[] {
  const fromMessages = [...(db.ugcMessages ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((m) => m.sentText ?? m.approvedText ?? m.generatedText ?? '')
  const fromContacts = [...(db.ugcInteractions ?? [])].filter((i) => i.direction === 'out' && i.content).sort((a, b) => b.sentAt.localeCompare(a.sentAt)).map((i) => i.content!)
  return [...new Set([...fromMessages, ...fromContacts].filter(Boolean))].slice(0, limit)
}

export function buildStrategy(db: DB, brandId: string, channel: UgcChannel, today: string, opportunity?: UgcOpportunity): MessageStrategy | undefined {
  const brand = db.brands.find((b) => b.id === brandId)
  if (!brand) return undefined
  const creator = db.profile.creator ?? CREATOR_PROFILE
  const text = asText(brand)
  const fit = FITS.find(([re]) => re.test(text))?.[1]
  const missing: MessageStrategy['missing'] = []
  const warnings: string[] = []
  const trip = fit?.trip ? tripContext(db, today) : undefined
  const mine = new Set(creator.contexts.map(normalize))
  // only contexts she actually has (CreatorProfile), strongest first, at most 2
  let talk = (fit?.talk ?? []).filter((c) => mine.has(normalize(c)))
  if (trip && fit?.trip) talk = [talk[0], `viagem ${trip}`].filter(Boolean) as string[]
  talk = talk.slice(0, 2)
  const avoid = [...new Set([...(fit?.avoid ?? []), ...(brand.avoidTopics ?? [])])]
  if (!fit) {
    missing.push('categoria')
    warnings.push('Sem a categoria da marca, eu não sei qual parte da sua rotina conecta — me diga a categoria.')
  }
  const facts = (brand.personalizationFacts ?? []).filter((f) => f.text.trim())
  const fact = facts.find((f) => f.verified) ?? facts[0]
  if (!fact) {
    missing.push('fato')
    warnings.push('Falta um detalhe específico da marca para personalizar melhor.')
  }
  const relationship = relationshipRule(brand)
  if (brand.alreadyCustomer === undefined && brand.alreadyUsedProduct === undefined) missing.unshift('relação')
  const angle = opportunity?.pitchAngle ?? (fit ? fit.angle(talk.length ? talk : fit.talk, trip) : 'conteúdo UGC real, do jeito que eu vivo')
  const recent = recentTexts(db)
  return {
    brand,
    channel,
    spec: CHANNEL_SPEC[channel],
    talk,
    avoid,
    angle,
    fact,
    relationship,
    contact: brand.knownContacts?.[0]?.name,
    missing,
    warnings,
    recentOpenings: recent.map((t) => firstWords(t)),
    // closings are short questions — only the last few must differ
    recentClosings: recent.slice(0, 6).map(lastSentence),
    creator,
    trip,
  }
}

// ─── Checks on any text (local draft or written by Claude) ──────────────────

export interface TextCheck {
  ok: boolean
  issues: string[]
  words: number
}

const words = (t: string) => normalize(t).split(/[^a-z0-9]+/).filter(Boolean)
const grams = (t: string) => {
  const w = words(t)
  return new Set(w.slice(0, -2).map((_, i) => `${w[i]} ${w[i + 1]} ${w[i + 2]}`))
}
export function similarity(a: string, b: string): number {
  const A = grams(a)
  const B = grams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / Math.min(A.size, B.size)
}

/** Everything the rules forbid, in her words. Used before ANY text is shown. */
export function checkText(s: MessageStrategy, text: string, subject?: string): TextCheck {
  const issues: string[] = []
  const n = normalize(text)
  const w = words(text).length
  for (const c of CLICHES) if (n.includes(c)) issues.push(`clichê: “${c}”`)
  for (const re of s.relationship.forbidden) if (re.test(text)) issues.push('afirma uma experiência que não está registrada')
  for (const a of s.avoid) {
    const k = normalize(a)
    if (k.length >= 3 && new RegExp(`\\b${k}\\b`).test(n)) issues.push(`fala de “${a}” (evitar pra essa marca)`)
  }
  if (w > s.spec.max * 1.25) issues.push(`longa demais pra ${s.channel} (${w} palavras)`)
  if (s.spec.subject && !subject?.trim()) issues.push('e-mail sem assunto')
  if (!s.spec.links && /https?:\/\/|\.app\b|\.com\b/.test(n) && s.channel === 'dm') issues.push('link na primeira DM')
  const open = firstWords(text)
  if (open && s.recentOpenings.includes(open)) issues.push('mesma abertura de uma mensagem recente')
  const close = lastSentence(text)
  if (close && s.recentClosings.includes(close)) issues.push('mesmo fechamento de uma mensagem recente')
  if ((text.match(/\p{Extended_Pictographic}/gu) ?? []).length > 1) issues.push('emoji demais')
  return { ok: !issues.length, issues, words: w }
}

/** Highest overlap with her recent messages (0–1). */
export function maxSimilarity(db: Pick<DB, 'ugcMessages' | 'ugcInteractions'>, text: string): number {
  return recentTexts(db).reduce((m, t) => Math.max(m, similarity(text, t)), 0)
}

export const describeFact = (f: BrandFact) => `${f.text} (${f.source === 'marina' ? 'você anotou' : f.source}${f.capturedAt ? ` · ${formatDayMonth(f.capturedAt.slice(0, 10))}` : ''})`
