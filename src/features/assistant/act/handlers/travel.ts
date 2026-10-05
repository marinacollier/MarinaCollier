/**
 * Travel mode — "o que falta pra África?": only REAL pending things (reservations, tickets, documents,
 * purchases, packing, activities to book, payments pending, open trip tasks). Ideas and confirmed /
 * done items stay out. "Você tem três coisas ainda abertas para a África."
 */
import { ROUTES } from '@/app/routes'
import { nextTrip } from '@/data/selectors'
import type { DB, Trip, TripItem, TripSection } from '@/data/types'
import { diffDays, formatDayMonth } from '@/lib/date'
import { plural } from '../../agents/common'
import { parseQuestion } from '../../parse'
import type { Handler, HandlerInput, LumosReply, ReplySection } from '../types'

const SECTION: Record<TripSection, { label: string; emoji: string; order: number }> = {
  documento: { label: 'Documentos', emoji: '🛂', order: 0 },
  voo: { label: 'Voos', emoji: '✈️', order: 1 },
  hospedagem: { label: 'Hospedagem', emoji: '🏠', order: 2 },
  transporte: { label: 'Transporte', emoji: '🚗', order: 3 },
  reserva: { label: 'Reservas', emoji: '📌', order: 4 },
  roteiro: { label: 'Roteiro', emoji: '🗺️', order: 5 },
  esporte: { label: 'Esporte', emoji: '🏄‍♀️', order: 6 },
  antes_de_ir: { label: 'Antes de ir', emoji: '✅', order: 7 },
  comprar: { label: 'Comprar', emoji: '🛍️', order: 8 },
  mala: { label: 'Mala', emoji: '🧳', order: 9 },
  comida: { label: 'Comida', emoji: '🍽️', order: 10 },
  quero_ir: { label: 'Quero ir', emoji: '✨', order: 11 },
}

/** Sections where an open item is a real pending thing (not a wish). */
const PENDING_SECTIONS = new Set<TripSection>(['documento', 'voo', 'hospedagem', 'transporte', 'reserva', 'esporte', 'antes_de_ir', 'comprar', 'mala', 'roteiro'])

export function isPending(it: TripItem): boolean {
  if (it.status === 'cancelado' || it.status === 'feito') return it.paymentStatus === 'pendente' && it.status !== 'cancelado'
  if (it.status === 'confirmado') return it.paymentStatus === 'pendente'
  if (!PENDING_SECTIONS.has(it.section)) return false
  // "roteiro" ideas count only when there is something to book/decide with a date.
  if (it.section === 'roteiro') return !!it.date && (it.status === 'a_fazer' || it.paymentStatus === 'a_confirmar' || it.paymentStatus === 'pendente')
  return true
}

const ASK = /\bo que (?:ainda )?falta\b|\bfalta o que\b|\bpendencias d[ao] viagem\b/

function tripOf(db: DB, input: HandlerInput): Trip | undefined {
  const q = parseQuestion(db, input.text)
  return q.trips[0] ?? (/\bviag|viajar\b/.test(input.n) ? nextTrip(db, input.now.date) : undefined)
}

function travel(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!ASK.test(n)) return undefined
  if (/\b(semana|feira|compras|livro)\b/.test(n)) return undefined
  const trip = tripOf(db, input)
  if (!trip) return undefined
  const items = db.tripItems.filter((i) => i.tripId === trip.id && isPending(i))
  const tasks = db.tasks.filter((t) => t.tripId === trip.id && t.status !== 'done' && t.status !== 'archived')
  const total = items.length + tasks.length
  const days = trip.startDate ? diffDays(now.date, trip.startDate) : undefined
  const when = days !== undefined && days >= 0 ? (days === 0 ? ' — é hoje!' : days === 1 ? ' — é amanhã!' : ` — faltam ${days} dias`) : ''
  const place = trip.name
  if (!total) return { area: 'viagem', text: `Nada aberto pra ${place}${when} ✨ Tudo que está lá ou já foi resolvido ou é só ideia.`, link: { label: `Abrir ${trip.name}`, to: ROUTES.trip(trip.id) } }
  const bySection = new Map<TripSection, TripItem[]>()
  for (const it of items) bySection.set(it.section, [...(bySection.get(it.section) ?? []), it])
  const sections: ReplySection[] = [...bySection.entries()]
    .sort((a, b) => SECTION[a[0]].order - SECTION[b[0]].order)
    .map(([s, list]) => ({
      title: `${SECTION[s].emoji} ${SECTION[s].label}`,
      lines: list
        .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
        .map((it) => ({
          text: it.group ? `${it.title} · ${it.group}` : it.title,
          sub: [it.date ? formatDayMonth(it.date) : undefined, it.status === 'a_confirmar' ? 'a confirmar' : undefined, it.paymentStatus === 'pendente' ? 'pagamento pendente' : it.paymentStatus === 'a_confirmar' ? 'pagamento a confirmar' : undefined].filter(Boolean).join(' · ') || undefined,
        })),
    }))
  if (tasks.length) sections.push({ title: '✓ Tarefas', lines: tasks.map((t) => ({ text: t.title, sub: t.status === 'review' ? 'a confirmar' : undefined })) })
  return {
    area: 'viagem',
    text: `Você tem ${plural(total, 'coisa ainda aberta', 'coisas ainda abertas')} pra ${place}${when}.`,
    sections,
    link: { label: `Abrir ${trip.name}`, to: ROUTES.trip(trip.id) },
  }
}

export const travelHandler: Handler = { id: 'travel', run: travel }
