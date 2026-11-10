/**
 * A day's itinerary said in one message, on a trip day:
 *   "Domingo 15/11 - Apartheid Museum pela manhã, Almoço em Soweto, Mandela house a tarde.
 *    Ingresso de Mandela é no local, os outros dois são de graça."
 * → one planned trip item per stop, in that order, with the part of the day she said (no invented time) and
 *   what she said about tickets (paid at the door = no value, no expense; free = nothing to pay).
 * Never a workout, never a booking, never a cost she did not give. Stops already on that day are not duplicated.
 */
import type { DateKey, DB, Trip, TripItem } from '@/data/types'
import { formatDayMonth } from '@/lib/date'
import { normalize } from '@/lib/text'
import { createUndoable, eventDraft, runLogged } from '../log'
import { policyFor } from '../policy'
import { dayIn } from '../text'
import type { Handler, HandlerInput, LumosReply, ReplyLine, Undo } from '../types'

type Part = 'manha' | 'almoco' | 'tarde' | 'noite'
const PART_LABEL: Record<Part, string> = { manha: 'Manhã', almoco: 'Almoço', tarde: 'Tarde', noite: 'Noite' }

/** Words that make a stop a place/visit (not a workout, not a task). */
const PLACE = /\b(museu|museum|house|casa|almoco|almocar|jantar|jantei|cafe|tour|visita|visitar|passeio|parque|park|praia|beach|mercado|market|igreja|catedral|church|cathedral|galeria|gallery|monumento|memorial|bairro|centro|restaurante|vinicola|ingresso|show|feira|mirante|hill|square|street|rua)\b/
const COST = /\b(ingresso|ingressos|entrada|pago|paga|pagar|pagamento|gratis|gratuito|gratuita|de graca|free|custa|custo|valor)\b/
const FREE = /\b(gratis|gratuito|gratuita|gratuitos|de graca|free|sem custo)\b/
const AT_DOOR = /\b(no local|na hora|na porta|na entrada|pago la|pagar la|compra la)\b/
const OTHERS = /\b(os outros|as outras|outros|outras|resto|demais)\b/

const B = '(?<![\\p{L}])'
const E = '(?![\\p{L}])'
const PART_RE: [RegExp, Part][] = [
  [new RegExp(`${B}(?:(?:pela|de|na|a|à)\\s+)?manh[aã]${E}`, 'iu'), 'manha'],
  [new RegExp(`${B}(?:(?:pela|de|na|a|à)\\s+)?tarde${E}`, 'iu'), 'tarde'],
  [new RegExp(`${B}(?:(?:pela|de|na|a|à)\\s+)?noite${E}`, 'iu'), 'noite'],
]

/** "15/11" (or "15/11/2026") → date in the year of `today`; else hoje/amanhã/weekday. */
export function itineraryDate(n: string, today: DateKey): DateKey | undefined {
  const m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(n)
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : today.slice(0, 4)
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return dayIn(n, today)
}

function tripOn(db: DB, date: DateKey): Trip | undefined {
  return db.trips.find((t) => t.startDate && t.endDate && t.startDate <= date && date <= t.endDate)
}

export interface Stop {
  title: string
  part?: Part
  cost?: 'free' | 'door'
}

const LEAD = /^\s*(?:(?:no|na|o|a)\s+)?(?:domingo|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|hoje|amanh[aã])?(?:[-\s]*feira)?\s*(?:,?\s*(?:dia\s+)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)?\s*[-–—:,]?\s*/i

/** Her message → ordered stops (titles keep her spelling). Pure. */
export function parseItinerary(text: string): Stop[] {
  const body = text.replace(LEAD, '')
  const sentences = body.split(/(?<=[.!?;\n])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
  const stops: Stop[] = []
  const costSentences: string[] = []
  for (const s of sentences) {
    if (COST.test(normalize(s)) && !PLACE.test(normalize(s).replace(/\bingressos?\b/g, ''))) {
      costSentences.push(s)
      continue
    }
    for (const raw of s.split(/\s*,\s*|\s+(?:e depois|depois|e então|e entao|e)\s+(?=[A-ZÀ-Ú]|almo|jant|caf)/)) {
      let seg = raw.replace(/[.!?;]+$/, '').trim()
      if (!seg) continue
      let part: Part | undefined
      for (const [re, p] of PART_RE) {
        if (re.test(seg)) {
          part = p
          seg = seg.replace(re, '').replace(/\s{2,}/g, ' ').trim()
          break
        }
      }
      const n = normalize(seg)
      if (!part && /^almo/.test(n)) part = 'almoco'
      if (!part && /^jant/.test(n)) part = 'noite'
      seg = seg.replace(/^(?:e|depois|ir (?:ao|à|a|no|na)|visitar|conhecer)\s+/i, '').replace(/\s+(?:e|,)$/, '').trim()
      if (seg.length < 3) continue
      stops.push({ title: seg[0].toUpperCase() + seg.slice(1), part })
    }
  }
  // What she said about tickets.
  for (const s of costSentences) {
    for (const clause of s.split(/\s*,\s*|\s+e\s+|\s*;\s*/)) {
      const n = normalize(clause)
      const free = FREE.test(n)
      const door = AT_DOOR.test(n) || (/\b(pago|paga|pagar)\b/.test(n) && !free)
      if (!free && !door) continue
      const kind: Stop['cost'] = free ? 'free' : 'door'
      const named = stops.filter((st) => normalize(st.title).split(/[^a-z0-9]+/).some((w) => w.length >= 4 && n.includes(w)))
      if (named.length) named.forEach((st) => (st.cost = kind))
      else if (OTHERS.test(n)) stops.filter((st) => !st.cost).forEach((st) => (st.cost = kind))
    }
  }
  return stops
}

/** Looks like an itinerary: a day, at least two stops and at least one of them a place/meal. */
function looksLike(n: string): boolean {
  if (!/\b\d{1,2}\/\d{1,2}\b|\b(domingo|segunda|terca|quarta|quinta|sexta|sabado|amanha)\b/.test(n)) return false
  if (!PLACE.test(n)) return false
  // A form ("Evento: … Data: … Horário: …") or a stated time is one event, handled by the calendar.
  if (/(^|\n)\s*(evento|data|horario|local|titulo)\s*:/.test(n) || /\b\d{1,2}h\d{0,2}\b|\b\d{1,2}:\d{2}\b/.test(n)) return false
  // Training sentences stay with the training planner.
  if (/\b(treino|treinar|corrida|correr|pedal|nadar|natacao|musculacao|yoga|surf)\b/.test(n)) return false
  return (n.match(/,/g)?.length ?? 0) >= 1 || /\b(depois|e depois)\b/.test(n)
}

function run({ db, text, n, now }: HandlerInput): LumosReply | undefined {
  if (!looksLike(n)) return undefined
  const date = itineraryDate(n, now.date)
  if (!date) return undefined
  const trip = tripOn(db, date)
  if (!trip) return undefined
  const stops = parseItinerary(text)
  if (stops.length < 2) return undefined

  const sameDay = db.tripItems.filter((i) => i.tripId === trip.id && i.date === date && i.status !== 'cancelado')
  const words = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4)
  const existing = (st: Stop) => sameDay.find((i) => words(i.title).some((w) => words(st.title).includes(w)))
  const order0 = Math.max(0, ...db.tripItems.filter((i) => i.tripId === trip.id).map((i) => i.order ?? 0)) + 1

  const lines: ReplyLine[] = []
  const creates: Partial<TripItem>[] = []
  stops.forEach((st, k) => {
    const had = existing(st)
    if (had) {
      lines.push({ emoji: '·', text: `${had.title} já estava no dia — não dupliquei` })
      return
    }
    const when = st.part ? `${PART_LABEL[st.part]} — horário a definir.` : 'Horário a definir.'
    const cost = st.cost === 'free' ? 'Gratuito (informado por você).' : st.cost === 'door' ? 'Ingresso pago no local — valor não informado (não vira despesa até você pagar).' : ''
    const meal = st.part === 'almoco' || /^(almo|jant)/.test(normalize(st.title))
    creates.push({
      tripId: trip.id,
      section: 'roteiro',
      title: st.title,
      status: 'a_fazer',
      bookingStatus: 'planejado',
      date,
      flexible: true,
      order: order0 + k,
      notes: [when, cost].filter(Boolean).join(' '),
      paymentStatus: st.cost === 'free' ? 'nao_se_aplica' : st.cost === 'door' ? 'pendente' : 'a_confirmar',
      source: `Você, ${formatDayMonth(now.date)} (conversa com a Lumos)`,
      ...(meal ? { category: 'alimentacao' as const } : {}),
    })
    lines.push({ emoji: meal ? '🍽' : '📍', text: `${st.part ? `${PART_LABEL[st.part]} · ` : ''}${st.title}`, sub: [cost, 'planejado — nada reservado'].filter(Boolean).join(' · ') })
  })
  if (!creates.length) return { area: 'viagem', text: `Esse roteiro de ${formatDayMonth(date)} já estava todo no app.`, lines, ref: { type: 'trip', id: trip.id } }

  const runAll = (): Undo =>
    runLogged(() => {
      const undos = creates.map((c) => createUndoable('tripItems', c as never).undo)
      return () => undos.reverse().forEach((u) => u())
    }, [eventDraft(now, { kind: 'changed', title: `Roteiro de ${formatDayMonth(date)}: ${creates.map((c) => c.title).join(', ')}`, area: 'viagens', date })])

  return {
    area: 'viagem',
    text: `Roteiro de ${formatDayMonth(date)} montado ✓`,
    sub: 'Na ordem que você disse, sem horário inventado. Nada foi reservado nem lançado como gasto.',
    lines,
    ref: { type: 'trip', id: trip.id },
    action: { mode: policyFor('personal_schedule'), run: runAll },
  }
}

export const itineraryHandler: Handler = { id: 'itinerary', run }
