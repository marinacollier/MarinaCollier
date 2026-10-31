/**
 * Lugares que conheci by conversation:
 *   "já fui pra Maranhão?"            → yes/no from her places (a state/country counts through a place inside it)
 *   "quantos estados conheço?"        → N de 27 (DF included), "quantos países…", "quantas cidades…"
 *   "registra que fui pra Ouro Preto, MG" / "anota que conheci o Panamá" / "…em 2019"
 *                                     → creates the place (or turns a "quero conhecer" into "visitei"); Desfazer
 * A name that is both a state and a city (Rio de Janeiro, São Paulo) and isn't qualified → asks which one.
 * A name it can't place → asks where it is. Nothing is invented (no dates, no country guessed).
 */
import { ROUTES } from '@/app/routes'
import { BR_UFS, countryByName, countryName, isUF, ufInfo, type UF } from '@/data/places/catalog'
import { brStates, countries, findPlaces, isKnown, isLocal, placeCounts, placeKey, wishes } from '@/data/places/model'
import type { DB, NewItem, Place, PlaceKind } from '@/data/types'
import { uid } from '@/lib/id'
import { normalize } from '@/lib/text'
import { listJoin, plural } from '../../agents/common'
import { createUndoable, eventDraft, runLogged, updateUndoable } from '../log'
import { policyFor } from '../policy'
import { cap } from '../text'
import type { Handler, HandlerInput, LumosReply } from '../types'

const AREA = 'lugares'
const LINK = { label: 'Abrir Lugares que conheci', to: ROUTES.places }

// ─── Resolving a name ──────────────────────────────────────────────────────

const ufByKey = (key: string): UF | undefined => BR_UFS.find((u) => placeKey(u.name) === key)
const capitalByKey = (key: string): UF | undefined => BR_UFS.find((u) => placeKey(u.capital) === key)

/** "Ouro Preto, MG" / "Lisboa, Portugal" / "Bonito em Mato Grosso do Sul" → where it sits. */
function whereOf(s: string): { country: string; uf?: string } | undefined {
  const t = s.trim()
  if (isUF(t) && t.length === 2) return { country: 'BR', uf: t.toUpperCase() }
  const st = ufByKey(placeKey(t))
  if (st) return { country: 'BR', uf: st.uf }
  const c = countryByName(t)
  return c ? { country: c } : undefined
}

function guessKind(name: string): PlaceKind {
  const n = normalize(name)
  if (/^ilhas?\b/.test(n)) return 'ilha'
  if (/^parque\b/.test(n)) return 'parque'
  if (/^(chapada|serra|vale|costa|regiao|litoral)\b/.test(n)) return 'regiao'
  return 'cidade'
}

type Target =
  | { type: 'place'; name: string; kind: PlaceKind; country: string; uf?: string; explicit: boolean }
  | { type: 'ambiguous'; name: string; uf: string }
  | { type: 'unknown'; name: string }

/** Her words (original spelling) → what place it is. */
function resolve(raw: string): Target {
  let s = raw.trim().replace(/^(?:o|a|os|as)\s+/i, '')
  let explicit: PlaceKind | undefined
  const kindLead = /^(cidade|capital|estado|pais|ilha|parque|regiao)\s+(?:d[eoa]s?\s+)?/.exec(normalize(s))
  if (kindLead) {
    const k = kindLead[1]
    // cidade/estado/país are qualifiers ("cidade do Rio"); "Ilha Grande" / "Parque…" keep the word in the name.
    if (k === 'cidade' || k === 'capital' || k === 'estado' || k === 'pais') {
      explicit = k === 'capital' ? 'cidade' : k
      s = s.slice(kindLead[0].length)
    } else explicit = k as PlaceKind
  }
  // "X, Y" or "X em Y" → Y is where it sits.
  let where: { country: string; uf?: string } | undefined
  const split = /^(.+?)\s*(?:,|\s-\s|\sem\s|\s\/\s)\s*(.+)$/i.exec(s)
  if (split) {
    const w = whereOf(split[2])
    if (w) {
      s = split[1]
      where = w
    }
  }
  const name = cap(s.trim())
  const key = placeKey(name)
  const kind = explicit
  if (where) return { type: 'place', name, kind: kind ?? guessKind(name), country: where.country, uf: where.uf, explicit: !!kind }
  const country = kind === undefined || kind === 'pais' ? countryByName(name) : undefined
  const state = ufByKey(key)
  const capital = capitalByKey(key)
  if (country && !state) return { type: 'place', name: countryName(country) === country ? name : countryName(country), kind: 'pais', country, explicit: !!kind }
  if (kind === 'estado' && state) return { type: 'place', name: state.name, kind: 'estado', country: 'BR', uf: state.uf, explicit: true }
  if (kind === 'cidade' && capital) return { type: 'place', name: capital.capital, kind: 'cidade', country: 'BR', uf: capital.uf, explicit: true }
  if (state && capital) return { type: 'ambiguous', name: state.name, uf: state.uf }
  if (state) return { type: 'place', name: state.name, kind: 'estado', country: 'BR', uf: state.uf, explicit: !!kind }
  if (capital) return { type: 'place', name: capital.capital, kind: kind ?? 'cidade', country: 'BR', uf: capital.uf, explicit: !!kind }
  return { type: 'unknown', name }
}

/** Existing records for a resolved target (same name; same kind when she said it). */
function existingFor(db: DB, t: Extract<Target, { type: 'place' }>): Place[] {
  return findPlaces(db.places, t.name).filter((p) => (t.explicit || t.kind === 'pais' || t.kind === 'estado' ? p.kind === t.kind : true) && (p.country === t.country || !t.country))
}

/** Her spelling of a fragment matched on the normalized sentence (normalize keeps positions 1:1). */
function originalOf(text: string, frag: string): string {
  const src = text.normalize('NFC')
  const i = normalize(src).indexOf(frag)
  return (i >= 0 ? src.slice(i, i + frag.length) : frag).trim()
}

/** Everyday destinations that are not "places she has been to" (the day/training handlers own these). */
const NOT_A_PLACE = /^(?:a |o |na |no )?(?:academia|aula|escola|faculdade|treino|mercado|supermercado|feira|farmacia|medico|medica|dentista|trabalho|escritorio|reuniao|festa|casa|igreja|banco|shopping|praia|piscina|clinica|consulta|padaria|restaurante|cinema)\b/

// ─── quantos estados / países / lugares ────────────────────────────────────

const COUNT = /\b(quant[oa]s|quais|que)\s+(estados|paises|cidades|lugares)\b/
const COUNT_VERB = /\b(conhec\w*|fui|visitei|estive|ja)\b/

function count(input: HandlerInput): LumosReply | undefined {
  const { db, n } = input
  const m = COUNT.exec(n)
  if (!m || !COUNT_VERB.test(n)) return undefined
  const what = m[2]
  const c = placeCounts(db.places)
  if (what === 'estados') {
    const states = brStates(db.places)
    const known = BR_UFS.filter((u) => states.get(u.uf) && states.get(u.uf)!.status !== 'quero_ir')
    return {
      area: AREA,
      text: `Você conhece ${c.brStates} de ${c.brStatesTotal} estados do Brasil (contando o DF) 🇧🇷`,
      lines: known.map((u) => {
        const a = states.get(u.uf)!
        const via = !a.record || !isKnown(a.record) ? a.via.map((p) => p.name) : []
        return { text: `${u.name} · ${u.uf}`, sub: a.status === 'moro' ? 'moro aqui' : via.length ? `por ${listJoin(via)}` : undefined }
      }),
      link: LINK,
    }
  }
  if (what === 'paises') {
    const cs = [...countries(db.places).entries()].filter(([, a]) => a.status !== 'quero_ir')
    return {
      area: AREA,
      text: `${plural(c.countries, 'país', 'países')} até agora: ${listJoin(cs.map(([code, a]) => a.record?.name ?? countryName(code)))} 🌍`,
      sub: 'Conhecer o mundo ✨',
      link: LINK,
    }
  }
  const local = db.places.filter((p) => isLocal(p) && isKnown(p))
  return {
    area: AREA,
    text: `${plural(c.local, 'cidade ou lugar', 'cidades e lugares')} nos seus lugares.`,
    lines: local.slice(0, 12).map((p) => ({ text: p.name, sub: p.country === 'BR' ? p.uf : countryName(p.country) })),
    link: LINK,
  }
}

// ─── já fui pra X? ─────────────────────────────────────────────────────────

const BEEN = /^(?:eu\s+)?(?:ja\s+)(?:fui|estive|passei)\s+(?:pra|pro|para|pras|pros|a|ao|na|no|nas|nos|em|por)\s+(.+)$/
const KNOW = /^(?:eu\s+)?(?:ja\s+)?conheco\s+(?:o\s+|a\s+)?(.+)$/

function been(input: HandlerInput): LumosReply | undefined {
  const { db, n, text } = input
  const m = BEEN.exec(n) ?? KNOW.exec(n)
  if (!m) return undefined
  const raw = originalOf(text, m[1])
  const t = resolve(raw)
  const isKnowQ = !BEEN.test(n)
  const name = t.name
  const records = findPlaces(db.places, name)
  // Only for things that are places: "conheço alguém…" / "já fui pra academia" belong elsewhere. An unknown
  // name is answered only when it really is a question.
  if (NOT_A_PLACE.test(normalize(raw))) return undefined
  const dreamed = wishes(db, input.now.date).some((w) => placeKey(w.name) === placeKey(name))
  if (t.type === 'unknown' && !records.length && !dreamed && (isKnowQ || !/\?\s*$/.test(text))) return undefined
  const known = records.filter(isKnown)
  if (known.length) {
    const r = known.find((p) => p.status === 'moro') ?? known[0]
    return { area: AREA, text: r.status === 'moro' ? `Você mora em ${r.name} 🏡` : `Sim! ${r.name} está nos seus lugares ✓`, sub: r.firstVisit ? `Primeira vez: ${r.firstVisit}` : r.notes, ref: { type: 'place', id: r.id }, link: LINK }
  }
  const viaArea = (() => {
    if (t.type === 'ambiguous' || (t.type === 'place' && t.kind === 'estado')) {
      const uf = t.type === 'ambiguous' ? t.uf : t.uf!
      const a = brStates(db.places).get(uf)
      if (a && a.status !== 'quero_ir') return { area: ufInfo(uf)!.name, via: a.via }
    }
    if (t.type === 'place' && t.kind === 'pais') {
      const a = countries(db.places).get(t.country)
      if (a && a.status !== 'quero_ir') return { area: a.record?.name ?? countryName(t.country), via: a.via }
    }
    return undefined
  })()
  if (viaArea) return { area: AREA, text: `Sim — ${viaArea.area} conta pelos lugares que você conheceu lá: ${listJoin(viaArea.via.map((p) => p.name))} ✓`, link: LINK }
  const dream = wishes(db, input.now.date).find((w) => !w.place && placeKey(w.name) === placeKey(name))
  if (dream?.trip) return { area: AREA, text: `Ainda não — ${dream.name} está nos seus sonhos de viagem 💭`, options: [{ label: 'Já fui, registra', ask: `registra que fui pra ${dream.name}` }], link: { label: `Abrir ${dream.trip.name}`, to: ROUTES.trip(dream.trip.id) } }
  const wish = records.find((p) => p.status === 'quero_ir')
  if (wish) return { area: AREA, text: `Ainda não — ${wish.name} está no seu Quero conhecer ✨`, options: [{ label: 'Já fui, registra', ask: `registra que fui pra ${wish.name}` }], ref: { type: 'place', id: wish.id }, link: LINK }
  return {
    area: AREA,
    text: `Ainda não tenho ${name} nos seus lugares.`,
    sub: 'Se você já foi, eu registro.',
    options: [{ label: 'Registrar que fui', ask: `registra que fui pra ${raw}` }],
    link: LINK,
  }
}

// ─── registra que fui pra X ────────────────────────────────────────────────

const REGISTER = /^(?:registra|registre|registrar|anota|anote|marca|marque|salva|salve|guarda|guarde|coloca|bota|adiciona)\s+(?:ai\s+|la\s+)?(?:que\s+)?(?:eu\s+)?(?:ja\s+)?(fui|estive|conheci|visitei|passei)\s+(?:pra|pro|para|pras|pros|a|ao|na|no|nas|nos|em|por)?\s*(.+)$/
const REGISTER_LIST = /^(?:registra|anota|coloca|bota|adiciona|salva)\s+(.+?)\s+(?:nos|em|nos meus)\s+(?:meus\s+)?lugares(?: que conheci)?$/
const YEAR = /\s+(?:em\s+)?((?:19|20)\d{2})$/

function register(input: HandlerInput): LumosReply | undefined {
  const { db, n, text, now } = input
  const reg = REGISTER.exec(n)
  const list = reg ? undefined : REGISTER_LIST.exec(n)
  if (!reg && !list) return undefined
  // "conheci a Ana…" is about a person: an unknown name only gets a question after fui/estive/visitei.
  const strict = !!reg && (reg[1] === 'conheci' || reg[1] === 'passei')
  let raw = originalOf(text, reg ? reg[2] : list![1])
  if (NOT_A_PLACE.test(normalize(raw))) return undefined
  let firstVisit: string | undefined
  const y = YEAR.exec(normalize(raw))
  if (y) {
    firstVisit = y[1]
    raw = raw.slice(0, raw.length - y[0].length)
  }
  let t = resolve(raw)
  // A name she already has (Petrolina, Cape Town) is that record, even when the catalog doesn't know it.
  const mine = t.type === 'unknown' ? findPlaces(db.places, t.name)[0] : undefined
  if (mine) t = { type: 'place', name: mine.name, kind: mine.kind, country: mine.country, uf: mine.uf, explicit: false }
  if (t.type === 'unknown' && (strict || !!list)) return undefined
  if (t.type === 'ambiguous') {
    const already = findPlaces(db.places, t.name).filter(isKnown)
    if (already.length) return { area: AREA, text: `${t.name} já está nos seus lugares ✓`, sub: listJoin(already.map((p) => (p.kind === 'estado' ? 'o estado' : 'a cidade'))) + (already.some((p) => p.status === 'moro') ? ' — é onde você mora 🏡' : ''), ref: { type: 'place', id: already[0].id }, link: LINK }
    return {
      area: AREA,
      text: `${t.name}: a cidade ou o estado?`,
      sub: 'Os dois têm o mesmo nome — me diz qual pra eu registrar certo.',
      options: [
        { label: `A cidade`, ask: `registra que fui pra cidade de ${t.name}${firstVisit ? ` em ${firstVisit}` : ''}` },
        { label: `O estado`, ask: `registra que fui pro estado de ${t.name}${firstVisit ? ` em ${firstVisit}` : ''}` },
      ],
    }
  }
  if (t.type === 'unknown') {
    return {
      area: AREA,
      text: `Onde fica ${t.name}?`,
      sub: 'Me diz o estado (se for no Brasil) ou o país — não quero chutar.',
      options: [
        { label: 'No Brasil', prefill: `registra que fui pra ${t.name}, ` },
        { label: 'Fora do Brasil', prefill: `registra que fui pra ${t.name}, ` },
      ],
    }
  }
  const existing = existingFor(db, t)
  const wish = existing.find((p) => p.status === 'quero_ir')
  if (existing.some(isKnown)) {
    const r = existing.find(isKnown)!
    return { area: AREA, text: `${r.name} já está nos seus lugares ✓`, sub: r.status === 'moro' ? 'É onde você mora 🏡' : undefined, ref: { type: 'place', id: r.id }, link: LINK }
  }
  const before = placeCounts(db.places)
  if (wish) {
    const patch: Partial<Place> = { status: 'visitei', ...(firstVisit && !wish.firstVisit ? { firstVisit } : {}) }
    return {
      area: AREA,
      text: `${wish.name} saiu do Quero conhecer e entrou nos seus lugares ✓`,
      sub: deltaLine(before, placeCounts(db.places.map((p) => (p.id === wish.id ? { ...p, ...patch } : p)))),
      ref: { type: 'place', id: wish.id },
      link: LINK,
      action: { mode: policyFor('place_record'), run: () => runLogged(() => updateUndoable('places', wish.id, patch), [eventDraft(now, { kind: 'changed', title: `Conheceu ${wish.name}`, area: 'viagens', ref: { type: 'place', id: wish.id } })]) },
    }
  }
  const parent =
    t.kind === 'pais'
      ? undefined
      : (t.country === 'BR' && t.uf && t.kind !== 'estado' ? db.places.find((p) => p.kind === 'estado' && p.uf === t.uf) : undefined) ?? db.places.find((p) => p.kind === 'pais' && p.country === t.country)
  const id = uid()
  const data: NewItem<'places'> = {
    id,
    name: t.name,
    kind: t.kind,
    country: t.country,
    uf: t.country === 'BR' ? t.uf : undefined,
    parentId: parent?.id,
    status: 'visitei',
    firstVisit,
    source: 'lumos',
    order: db.places.reduce((mx, p) => Math.max(mx, p.order), -1) + 1,
  }
  const after = placeCounts([...db.places, { ...data, id, createdAt: '', updatedAt: '' } as Place])
  const where = t.kind === 'pais' ? 'país' : t.country === 'BR' ? (t.kind === 'estado' ? 'estado' : `${t.kind === 'cidade' ? 'cidade' : 'lugar'} · ${t.uf ?? 'Brasil'}`) : `${countryName(t.country)}`
  return {
    area: AREA,
    text: `Registrei ${t.name} nos seus lugares ✓`,
    sub: [where + (firstVisit ? ` · ${firstVisit}` : ''), deltaLine(before, after)].filter(Boolean).join(' — '),
    ref: { type: 'place', id },
    link: LINK,
    action: {
      mode: policyFor('place_record'),
      run: () => runLogged(() => createUndoable('places', data).undo, [eventDraft(now, { kind: 'created', title: `Conheceu ${t.name}`, area: 'viagens', ref: { type: 'place', id } })]),
    },
  }
}

function deltaLine(before: ReturnType<typeof placeCounts>, after: ReturnType<typeof placeCounts>): string | undefined {
  const parts: string[] = []
  if (after.brStates > before.brStates) parts.push(`agora são ${after.brStates} de ${after.brStatesTotal} estados`)
  if (after.countries > before.countries) parts.push(`agora são ${plural(after.countries, 'país', 'países')}`)
  return parts.length ? cap(listJoin(parts)) : undefined
}

export const placesHandler: Handler = {
  id: 'places',
  run(input) {
    if (!/\b(fui|estive|conhec\w*|visitei|passei|estados|paises|lugares|cidades)\b/.test(input.n)) return undefined
    return register(input) ?? count(input) ?? been(input)
  },
}
