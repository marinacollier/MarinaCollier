/**
 * Meu Universo · Beauty & Fragrance by conversation (deterministic, no AI):
 *   "Testei um perfume hoje na África do Sul e amei. Custa 600 rands." → which one? (never invented)
 *   "Era o Yardley Gorgeous in Cashmere" / "testei o X …"             → diary entry + opinion, price, country, date;
 *        owned ONLY when she says comprei / tenho / ganhei
 *   "Quais perfumes eu tenho para usar à noite?"                       → owned perfumes whose usual occasions match
 *   "Qual perfume uso hoje?"                                           → the recommender (owned only)
 *   "Que maquiagem combina com o estilo que gosto?"                    → her registered style, not generic advice
 */
import { ROUTES } from '@/app/routes'
import type { Now } from '@/data/intel'
import type { DB, NewItem, UniverseCategory, UniverseItem, UniverseOccasion, UniverseOpinion } from '@/data/types'
import {
  collection,
  isOwned,
  isWished,
  itemTitle,
  money,
  OCCASION_LABEL,
  OPINION_LABEL,
  ownedFor,
  recommend,
  type Intensity,
  type Setting,
  type TempBand,
  type TimeOfDay,
  type WearInput,
  type WearOccasion,
} from '@/data/universe/model'
import { addDays } from '@/lib/date'
import { uid } from '@/lib/id'
import { parseBRL } from '@/lib/money'
import { listJoin } from '../../agents/common'
import { all, createUndoable, eventDraft, runLogged, updateUndoable } from '../log'
import { policyFor } from '../policy'
import { cap, norm } from '../text'
import type { Handler, HandlerInput, LumosReply, Undo } from '../types'

const AREA = 'meu universo'
const LINK = { label: 'Abrir Meu Universo', to: `${ROUTES.universe}` }

// ─── Reading the sentence ───────────────────────────────────────────────────

const SCENT_WORD = /\b(perfumes?|fragrancias?|colonias?|body splash|body mist|splash|hidratante|oleo corporal|eau de parfum|edp|edt)\b/
const TEST_VERB = /\b(testei|experimentei|provei|conheci|comprei|ganhei|senti)\b/
const BOUGHT = /\b(comprei|ganhei|levei|tenho)\b/
const NOT_BOUGHT = /\bnao (comprei|levei|tenho)\b/

function opinionIn(n: string): UniverseOpinion | undefined {
  if (/\b(nao gostei|odiei|detestei|nao curti)\b/.test(n)) return 'nao_gostei'
  if (/\b(amei|adorei|apaixonei|apaixonada)\b/.test(n)) return 'amei'
  if (/\b(gostei|curti)\b/.test(n)) return 'gostei'
  if (/\b(indiferente|achei ok|achei normal|mais ou menos)\b/.test(n)) return 'indiferente'
  return undefined
}

const CURRENCY_WORDS: [RegExp, string][] = [
  [/^(rands?|zar|r)$/, 'ZAR'],
  [/^(reais|real|r\$|brl)$/, 'BRL'],
  [/^(dolares?|usd|us\$|\$)$/, 'USD'],
  [/^(euros?|eur|€)$/, 'EUR'],
  [/^(libras?|gbp|£)$/, 'GBP'],
]
const currencyOf = (w: string) => CURRENCY_WORDS.find(([re]) => re.test(w))?.[1]

/** Price only with an explicit currency ("600 rands", "R$ 350", "ZAR 600"). */
function priceIn(n: string): { cents: number; currency: string } | undefined {
  const after = /(\d[\d.,]*)\s*(rands?|zar|reais|real|dolares?|usd|euros?|eur|libras?|gbp)\b/.exec(n)
  if (after) {
    const cents = parseBRL(after[1])
    const currency = currencyOf(after[2])
    if (cents && currency) return { cents, currency }
  }
  const before = /(r\$|us\$|€|£|\bzar|\busd|\beur|\bbrl)\s*(\d[\d.,]*)/.exec(n)
  if (before) {
    const cents = parseBRL(before[2])
    const currency = currencyOf(before[1].trim())
    if (cents && currency) return { cents, currency }
  }
  return undefined
}

const PLACES: [RegExp, { city?: string; country: string }][] = [
  [/\b(cape town|cidade do cabo)\b/, { city: 'Cape Town', country: 'África do Sul' }],
  [/\b(joanesburgo|johannesburg|joburg)\b/, { city: 'Joanesburgo', country: 'África do Sul' }],
  [/\bafrica do sul\b/, { country: 'África do Sul' }],
  [/\b(sao paulo)\b/, { city: 'São Paulo', country: 'Brasil' }],
  [/\bbrasil\b/, { country: 'Brasil' }],
  [/\bportugal|lisboa\b/, { country: 'Portugal' }],
  [/\b(paris|franca)\b/, { country: 'França' }],
  [/\b(estados unidos|eua|nova york)\b/, { country: 'Estados Unidos' }],
]
const placeIn = (n: string) => PLACES.find(([re]) => re.test(n))?.[1]

const sizeIn = (n: string) => {
  const m = /(\d{1,4})\s*ml\b/.exec(n)
  return m ? Number(m[1]) : undefined
}

function categoryIn(n: string): UniverseCategory {
  if (/\b(body splash|body mist|splash)\b/.test(n)) return 'body_splash'
  if (/\bhidratante\b/.test(n)) return 'hidratante'
  if (/\boleo corporal\b/.test(n)) return 'oleo_corporal'
  return 'perfume'
}

/** A library item named in full ("yardley gorgeous in cashmere", "gorgeous in cashmere", "libre intense"). Longest wins. */
function namedItem(db: DB, n: string): UniverseItem | undefined {
  const hits: { item: UniverseItem; len: number }[] = []
  for (const i of db.universeItems ?? []) {
    for (const label of [itemTitle(i), [i.brand, i.name].filter(Boolean).join(' '), i.name]) {
      const k = norm(label)
      if (k.length >= 4 && new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(n)) hits.push({ item: i, len: k.length })
    }
  }
  return hits.sort((a, b) => b.len - a.len || a.item.order - b.item.order)[0]?.item
}

const NAME_LEAD =
  /\b(?:testei|experimentei|provei|conheci|comprei|ganhei|senti)(?:\s+(?:hoje|ontem|agora))?(?:\s+(?:o|a|um|uma))?(?:\s+(?:perfume|fragrancia|colonia|body splash|body mist|hidratante))?(?=\s|$)/
const NAME_STOP = /\s+(?:hoje|ontem|agora|aqui|na|no|em|numa|num|e|que|custa|custou|por|de manha|a noite)\b|[,.;!?]/
const GENERIC = /^(?:perfume|fragrancia|colonia|body splash|body mist|hidratante|splash|novo|nova|diferente|incrivel|delicioso|lindo|maravilhoso|esse|essa|ele|ela|isso)?$/

/** The product name she typed (her spelling), or undefined when she didn't name it. */
function typedName(text: string, n: string): string | undefined {
  const m = NAME_LEAD.exec(n)
  if (!m) return undefined
  const restStart = m.index + m[0].length
  const rest = n.slice(restStart)
  const lead = rest.length - rest.trimStart().length
  const body = rest.trimStart()
  const padded = ` ${body}`
  const cut = padded.search(NAME_STOP)
  const raw = (cut >= 0 ? padded.slice(0, cut) : padded).trim()
  if (!raw || GENERIC.test(raw) || raw.split(' ').length > 7) return undefined
  const from = restStart + lead
  const original = text.normalize('NFC').trim().slice(from, from + raw.length).trim()
  return cap(original || raw)
}

function splitBrand(db: DB, name: string): { brand?: string; name: string } {
  const brands = [...new Set((db.universeItems ?? []).map((i) => i.brand).filter((b): b is string => !!b))].sort((a, b) => b.length - a.length)
  const nn = norm(name)
  for (const b of brands) {
    const nb = norm(b)
    if (nn.startsWith(`${nb} `)) return { brand: b, name: name.slice(b.length).trim() }
  }
  return { name }
}

// ─── "testei / comprei um perfume…" ────────────────────────────────────────

interface Pending {
  opinion?: UniverseOpinion
  price?: { cents: number; currency: string }
  sizeMl?: number
  place?: { city?: string; country: string }
  date: string
  bought: boolean
  category: UniverseCategory
}

function readExperience(n: string, now: Now): Pending {
  return {
    opinion: opinionIn(n),
    price: priceIn(n),
    sizeMl: sizeIn(n),
    place: placeIn(n),
    date: /\bontem\b/.test(n) ? addDays(now.date, -1) : now.date,
    bought: BOUGHT.test(n) && !NOT_BOUGHT.test(n),
    category: categoryIn(n),
  }
}

function describe(p: Pending): string {
  const bits: string[] = []
  if (p.opinion) bits.push(OPINION_LABEL[p.opinion].toLowerCase())
  if (p.price) bits.push(money(p.price.cents, p.price.currency))
  if (p.place) bits.push(p.place.city ? `${p.place.city}, ${p.place.country}` : p.place.country)
  return bits.join(' · ')
}

function record(db: DB, p: Pending, now: Now, target: { item: UniverseItem } | { brand?: string; name: string }): LumosReply {
  const existing = 'item' in target ? target.item : undefined
  const itemId = existing?.id ?? uid()
  const title = existing ? itemTitle(existing) : [('brand' in target && target.brand) || '', 'name' in target ? target.name : ''].filter(Boolean).join(' ')
  const log: NewItem<'scentLogs'> = {
    itemId,
    date: p.date,
    status: p.bought ? 'comprado' : 'testado',
    source: 'lumos',
    confirmed: true,
  }
  if (p.opinion) log.verdict = p.opinion
  if (p.price) {
    log.priceCents = p.price.cents
    log.currency = p.price.currency
  }
  if (p.sizeMl) log.sizeMl = p.sizeMl
  if (p.place?.city) log.city = p.place.city
  if (p.place) log.country = p.place.country
  const logId = uid()

  let patch: Partial<UniverseItem> | undefined
  let fresh: NewItem<'universeItems'> | undefined
  if (existing) {
    patch = {}
    if (p.opinion) patch.opinion = p.opinion
    if (p.bought && !isOwned(existing)) {
      patch.ownership = 'tenho'
      patch.acquiredOn = p.date
    } else if (!p.bought && isWished(existing)) patch.ownership = 'testado'
    if (p.price && !existing.priceCents) {
      patch.priceCents = p.price.cents
      patch.currency = p.price.currency
    }
    if (p.sizeMl && !existing.sizeMl) patch.sizeMl = p.sizeMl
    if (p.place && !existing.country) {
      patch.country = p.place.country
      if (p.place.city) patch.city = p.place.city
    }
    if (!existing.experiencedOn) patch.experiencedOn = p.date
  } else {
    const t = target as { brand?: string; name: string }
    fresh = {
      id: itemId,
      category: p.category,
      name: t.name,
      ownership: p.bought ? 'tenho' : 'testado',
      experiencedOn: p.date,
      source: 'lumos',
      confirmed: false,
      needsConfirmation: ['notas', ...(t.brand ? [] : ['marca']), 'versao'],
      notesSource: 'a_confirmar',
      order: (db.universeItems ?? []).reduce((m, i) => Math.max(m, i.order), -1) + 1,
    }
    if (t.brand) fresh.brand = t.brand
    if (p.opinion) fresh.opinion = p.opinion
    if (p.bought) fresh.acquiredOn = p.date
    if (p.price) {
      fresh.priceCents = p.price.cents
      fresh.currency = p.price.currency
    }
    if (p.sizeMl) fresh.sizeMl = p.sizeMl
    if (p.place) {
      fresh.country = p.place.country
      if (p.place.city) fresh.city = p.place.city
    }
  }

  const ownedNow = existing ? isOwned(existing) || p.bought : p.bought
  const where = existing
    ? isOwned(existing)
      ? 'Ele já está na sua coleção.'
      : p.bought
        ? 'Entrou na sua coleção.'
        : 'Ficou como testado — não coloquei na sua coleção, porque você não disse que comprou.'
    : ownedNow
      ? 'Entrou na sua coleção. Notas e versão ficam “a confirmar” — não vou inventar.'
      : 'Ficou como testado (fora da sua coleção, porque você não disse que comprou). Notas ficam “a confirmar”.'
  const detail = describe(p)
  return {
    area: AREA,
    text: `Anotei no seu diário olfativo: ${title}${detail ? ` — ${detail}` : ''} ✓`,
    sub: where,
    ref: { type: 'universeItem', id: itemId },
    options: ownedNow ? undefined : [{ label: 'Comprei', ask: `comprei o ${title}` }],
    link: LINK,
    action: {
      mode: policyFor('memory'),
      run: () =>
        runLogged(
          () => {
            const undos: Undo[] = []
            if (fresh) undos.push(createUndoable('universeItems', fresh).undo)
            else if (patch && Object.keys(patch).length) undos.push(updateUndoable('universeItems', itemId, patch))
            undos.push(createUndoable('scentLogs', { ...log, id: logId }).undo)
            return all(undos)
          },
          [eventDraft(now, { kind: 'logged', title: `${p.bought ? 'Comprou' : 'Testou'} ${title}${p.opinion ? ` (${OPINION_LABEL[p.opinion].toLowerCase()})` : ''}`, ref: { type: 'scentLog', id: logId } })],
        ),
    },
  }
}

function experience(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text, ctx } = input
  // Follow-up to "qual perfume era?": "era o Yardley Gorgeous in Cashmere".
  if (ctx.lastRef?.type === 'scentPending') {
    const m = /^(?:era|foi|e|o nome e)\s+(?:o|a)\s+(.+)$/.exec(n) ?? /^(?:era|foi|chama|se chama|o nome e|nome)\s*[:-]?\s+(.+)$/.exec(n)
    if (m) {
      let pending: Pending | undefined
      try {
        pending = JSON.parse(ctx.lastRef.id) as Pending
      } catch {
        pending = undefined
      }
      if (pending) {
        const item = namedItem(db, n)
        if (item) return record(db, pending, now, { item })
        const start = n.length - m[1].length
        const name = cap(text.normalize('NFC').trim().replace(/[.!?]+$/, '').slice(start).trim() || m[1])
        return record(db, pending, now, splitBrand(db, name))
      }
    }
  }
  if (!TEST_VERB.test(n)) return undefined
  const item = namedItem(db, n)
  if (!item && !SCENT_WORD.test(n)) return undefined
  const p = readExperience(n, now)
  if (item) return record(db, p, now, { item })
  const name = typedName(text, n)
  if (name) return record(db, p, now, splitBrand(db, name))
  const detail = describe(p)
  return {
    area: AREA,
    text: `${p.opinion === 'amei' ? 'Que bom que você amou! ' : ''}Qual ${p.category === 'perfume' ? 'perfume' : 'produto'} era?`,
    sub: `Me diz o nome que eu guardo no seu diário olfativo${detail ? ` (${detail})` : ''}. Não vou chutar qual foi.`,
    options: [{ label: 'Dizer o nome', prefill: 'Era o ' }],
    ref: { type: 'scentPending', id: JSON.stringify(p) },
  }
}

// ─── "quais perfumes eu tenho para…" ────────────────────────────────────────

function occasionTags(n: string): UniverseOccasion[] {
  const tags: UniverseOccasion[] = []
  if (/\bnoite|jantar\b/.test(n)) tags.push('noite')
  if (/\b(de|durante o) dia\b|\bmanha\b|\btarde\b/.test(n)) tags.push('dia')
  if (/\btrabalh|escritorio|reuni/.test(n)) tags.push('trabalho', 'reuniao')
  if (/\bencontro|date\b|romance|romantic/.test(n)) tags.push('encontro', 'romance')
  if (/\bfrio\b/.test(n)) tags.push('frio')
  if (/\bcalor|quente\b/.test(n)) tags.push('calor')
  if (/\bpraia\b/.test(n)) tags.push('praia')
  if (/\bviage/.test(n)) tags.push('viagem')
  if (/\blazer|fim de semana\b/.test(n)) tags.push('lazer')
  if (/\bfesta|social|evento\b/.test(n)) tags.push('social', 'elegante')
  return tags
}

const MINE_Q = /\b(quais|que|qual)\b.*\b(perfumes?|fragrancias?)\b.*\b(eu tenho|tenho|meus|minhas)\b|\bmeus perfumes\b/

function mine(input: HandlerInput): LumosReply | undefined {
  const { db, n } = input
  if (!MINE_Q.test(n)) return undefined
  if (/\b(uso|usar|passo|passar)\s+hoje\b/.test(n) && !/\btenho\b/.test(n)) return undefined
  const tags = occasionTags(n)
  const list = tags.length ? ownedFor(db, tags) : collection(db, ['perfume'])
  const label = tags.length ? listJoin([...new Set(tags.filter((t) => !['reuniao', 'romance', 'elegante'].includes(t)))].map((t) => OCCASION_LABEL[t].toLowerCase())) : ''
  if (!list.length) {
    return {
      area: AREA,
      text: tags.length ? `Entre os perfumes que são seus, nenhum está marcado para ${label}.` : 'Ainda não tem perfume marcado como seu.',
      sub: 'Só conto o que está na sua coleção (desejos e testados ficam de fora).',
      link: LINK,
    }
  }
  return {
    area: AREA,
    text: tags.length ? `Seus perfumes para ${label}: ${list.length}.` : `Você tem ${list.length} ${list.length === 1 ? 'perfume' : 'perfumes'} na coleção.`,
    sub: 'Só os que são seus — pelos usos que você mesma registrou.',
    lines: list.map((i) => ({ text: itemTitle(i), sub: i.occasionText, emoji: i.opinion === 'amei' ? '♡' : '·' })),
    link: LINK,
  }
}

// ─── "qual perfume uso hoje?" ───────────────────────────────────────────────

const WEAR_Q = /\b(qual|que)\s+(perfume|fragrancia)\b.*\b(uso|usar|passo|passar|vou usar|coloco)\b|\bperfume (?:pra|para) (?:hoje|agora|hoje a noite)\b|\b(o que|que) (?:eu )?(?:uso|passo) de perfume\b/

export function wearInputFrom(n: string, now: Now): { input: WearInput; timeFromClock: boolean } {
  const input: WearInput = {}
  let timeFromClock = false
  if (/\bnoite|jantar\b/.test(n)) input.time = 'noite' as TimeOfDay
  else if (/\bmanha|tarde|de dia\b/.test(n)) input.time = 'dia'
  else {
    input.time = now.minutes >= 18 * 60 ? 'noite' : 'dia'
    timeFromClock = true
  }
  if (/\bfrio|gelad/.test(n)) input.temp = 'frio' as TempBand
  else if (/\bcalor|quente\b/.test(n)) input.temp = 'calor'
  else if (/\bameno|agradavel\b/.test(n)) input.temp = 'ameno'
  const occ: [RegExp, WearOccasion][] = [
    [/\btrabalh|escritorio|reuni/, 'trabalho'],
    [/\bencontro|date\b|romant/, 'encontro'],
    [/\bpraia\b/, 'praia'],
    [/\bviage|voo\b/, 'viagem'],
    [/\bfesta|evento|social|casamento\b/, 'social'],
    [/\blazer|passeio|fim de semana\b/, 'lazer'],
  ]
  input.occasion = occ.find(([re]) => re.test(n))?.[1]
  if (/\bescritorio|reuni|fechado|cinema|restaurante\b/.test(n)) input.setting = 'fechado' as Setting
  else if (/\bao ar livre|praia|parque|aberto\b/.test(n)) input.setting = 'aberto'
  if (/\bsuave|leve|discret/.test(n)) input.intensity = 'suave' as Intensity
  else if (/\bmarcante|presenca|intens|sensual\b/.test(n)) input.intensity = 'marcante'
  return { input, timeFromClock }
}

function wear(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!WEAR_Q.test(n)) return undefined
  const { input: wi, timeFromClock } = wearInputFrom(n, now)
  const pick = recommend(db, wi)
  if (!pick.main) {
    return { area: AREA, text: 'Ainda não tem perfume marcado como seu para eu sugerir.', sub: 'Só recomendo o que você tem — desejos ficam na wishlist.', link: LINK }
  }
  const m = pick.main
  const lines = [
    ...(pick.application ? [{ text: pick.application, emoji: '💧' }] : []),
    ...(pick.fresher ? [{ text: `Mais fresco: ${itemTitle(pick.fresher)}`, sub: pick.fresher.occasionText, emoji: '🌿' }] : []),
    ...(pick.sensual ? [{ text: `Mais sensual: ${itemTitle(pick.sensual)}`, sub: pick.sensual.occasionText, emoji: '🌙' }] : []),
    ...(pick.companion ? [{ text: `Combina com: ${itemTitle(pick.companion.item)}`, sub: pick.companion.why, emoji: '✨' }] : []),
  ]
  const asked = [timeFromClock ? `${wi.time === 'noite' ? 'noite' : 'dia'} (pelo horário)` : wi.time, wi.occasion, wi.temp].filter(Boolean).join(' · ')
  const options = wi.temp
    ? undefined
    : [
        { label: 'Está frio', ask: `qual perfume uso hoje? ${wi.time === 'noite' ? 'à noite, ' : ''}está frio${wi.occasion ? `, ${wi.occasion}` : ''}` },
        { label: 'Está calor', ask: `qual perfume uso hoje? ${wi.time === 'noite' ? 'à noite, ' : ''}está calor${wi.occasion ? `, ${wi.occasion}` : ''}` },
      ]
  return {
    area: AREA,
    text: `Hoje: ${itemTitle(m.item)}.`,
    sub: m.reasons.length ? `${cap(listJoin(m.reasons))}.${asked ? ` (${asked})` : ''}` : `Da sua coleção, é o que mais se encaixa${asked ? ` em ${asked}` : ''}.`,
    lines,
    options,
    provenance: 'suggestion',
    ref: { type: 'universeItem', id: m.item.id },
    link: { label: 'Ver opções', to: `${ROUTES.universe}?aba=hoje` },
  }
}

// ─── maquiagem ──────────────────────────────────────────────────────────────

const MAKEUP_Q = /\bmaquiagem\b.*\b(combina|estilo|gosto|uso|usar|passo)\b/

function makeup(input: HandlerInput): LumosReply | undefined {
  const { db, n } = input
  if (!MAKEUP_Q.test(n)) return undefined
  const style = db.profile.scentProfile?.makeupStyle
  const owned = collection(db, ['maquiagem'])
  if (!style && !owned.length) return { area: AREA, text: 'Você ainda não registrou seu estilo de maquiagem.', sub: 'Dá para escrever em Meu Universo → DNA.', link: LINK }
  return {
    area: AREA,
    text: style ? `O estilo que você registrou: ${style.replace(/\.$/, '')}.` : 'Você não registrou um estilo, mas tem estas maquiagens:',
    sub: owned.length ? 'Da sua coleção, o que você tem:' : 'Ainda não tem maquiagem cadastrada na coleção — quando tiver, eu escolho a partir dela.',
    lines: owned.map((i) => ({ text: itemTitle(i), sub: i.description })),
    link: LINK,
  }
}

export const universeHandler: Handler = {
  id: 'universe',
  run(input) {
    return experience(input) ?? wear(input) ?? mine(input) ?? makeup(input)
  },
}

