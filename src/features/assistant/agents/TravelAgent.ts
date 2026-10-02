import type { DB, Trip, TripItem } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { isTaskOpen, nextTrip, upcomingTrips } from '@/data/selectors'
import { countdownLabel, diffDays } from '@/lib/date'
import { normalize } from '@/lib/text'
import { routeAction, sheetAction } from '@/features/search/actions'
import { tokenize } from '@/features/search/engine'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { capitalize, plural, taskItem } from './common'

const OPEN: TripItem['status'][] = ['a_confirmar', 'a_fazer']

/** Fallback sub-area for items without a group. */
const SECTION_GROUP: Record<TripItem['section'], string> = {
  voo: 'Voos',
  hospedagem: 'Hospedagem',
  transporte: 'Transporte',
  reserva: 'Reservas',
  roteiro: 'Roteiro',
  quero_ir: 'Quero ir',
  comida: 'Comida',
  esporte: 'Esporte',
  mala: 'Mala',
  comprar: 'Comprar',
  documento: 'Documentos',
  antes_de_ir: 'Antes de ir',
}

/** Brain dump groups belong to a trip when they share its name/place words ("África do Sul"). */
function belongsToTrip(group: string | undefined, trip: Trip): boolean {
  if (!group) return false
  const g = normalize(group)
  if (g === normalize(trip.name)) return true
  const words = tokenize(`${trip.name} ${trip.place ?? ''}`).filter((w) => w.length >= 4)
  return words.some((w) => tokenize(group).includes(w))
}

export interface TripGroup {
  name: string
  items: TripItem[]
}

export function tripOpenItems(db: DB, trip: Trip) {
  const items = db.tripItems.filter((i) => i.tripId === trip.id && OPEN.includes(i.status)).sort((a, b) => a.order - b.order)
  const groups = new Map<string, TripItem[]>()
  for (const i of items) {
    const g = i.group?.trim() || SECTION_GROUP[i.section]
    groups.set(g, [...(groups.get(g) ?? []), i])
  }
  return {
    items,
    /** "revisar": not proven yet. */
    review: items.filter((i) => i.status === 'a_confirmar').length,
    groups: [...groups.entries()].map(([name, list]): TripGroup => ({ name, items: list })),
    tasks: db.tasks.filter((t) => t.tripId === trip.id && isTaskOpen(t)),
    dump: db.brainDump.filter((b) => b.status === 'inbox' && belongsToTrip(b.group, trip)),
  }
}

function groupRow(g: TripGroup, trip: Trip): AnswerItem {
  const review = g.items.filter((i) => i.status === 'a_confirmar').length
  const titles = g.items.map((i) => i.title)
  return {
    id: `group:${trip.id}:${g.name}`,
    emoji: '🧳',
    title: g.name,
    subtitle: titles.slice(0, 3).join(' · ') + (titles.length > 3 ? ` +${titles.length - 3}` : ''),
    trailing: review ? `${review} revisar` : `${g.items.length} a fazer`,
    action: g.items.length === 1 ? sheetAction('tripItem', { id: g.items[0].id, tripId: trip.id }) : routeAction(ROUTES.trip(trip.id)),
  }
}

function pending(ctx: AgentContext, trip: Trip): AnswerBlock[] {
  const { db, today } = ctx
  const o = tripOpenItems(db, trip)
  const total = o.items.length + o.tasks.length + o.dump.length
  const when = trip.startDate ? countdownLabel(trip.startDate, today) : trip.dateLabel ? `previsto para ${trip.dateLabel}` : 'sem data ainda'
  const lead = `${trip.flag} ${trip.name} — ${when}`
  const blocks: AnswerBlock[] = []

  if (!total) blocks.push({ kind: 'headline', text: `${lead}. Tudo revisado por aqui, é só aproveitar ✨` })
  else {
    const parts = [
      o.review && `${plural(o.review, 'item pra revisar', 'itens pra revisar')}${o.groups.length > 1 ? ` em ${plural(o.groups.length, 'sub-área', 'sub-áreas')}` : ''}`,
      o.items.length - o.review && plural(o.items.length - o.review, 'a fazer', 'a fazer'),
      o.tasks.length && plural(o.tasks.length, 'tarefa', 'tarefas'),
      o.dump.length && plural(o.dump.length, 'ideia no brain dump', 'ideias no brain dump'),
    ].filter(Boolean) as string[]
    blocks.push({ kind: 'headline', text: `${lead}: ${parts.join(' + ')}.` })
  }

  // Another trip starts before this one: mention it first (it's independent).
  const before = upcomingTrips(db, today).find((t) => t.id !== trip.id && t.startDate && trip.startDate && t.startDate < trip.startDate)
  if (before) {
    const ob = tripOpenItems(db, before)
    const openBefore = ob.items.length + ob.tasks.length
    blocks.push({
      kind: 'text',
      text: `Antes vem ${before.flag} ${before.name} (${countdownLabel(before.startDate!, today)})${openBefore ? `, com ${plural(openBefore, 'coisa', 'coisas')} pra revisar` : ''}.`,
    })
    if (openBefore) blocks.push({ kind: 'suggestions', questions: [`O que falta pra ${before.name}?`] })
  }

  if (o.groups.length) {
    const MAX = 8
    blocks.push({
      kind: 'list',
      title: 'Por sub-área',
      emoji: trip.flag,
      items: o.groups.slice(0, MAX).map((g) => groupRow(g, trip)),
      more: o.groups.length > MAX ? { label: `Ver as outras ${o.groups.length - MAX} sub-áreas`, action: routeAction(ROUTES.trip(trip.id)) } : undefined,
    })
  }
  if (o.tasks.length) blocks.push({ kind: 'list', title: 'Tarefas da viagem', emoji: '✓', items: o.tasks.map((t) => taskItem(db, t, today)) })
  if (o.dump.length)
    blocks.push({
      kind: 'list',
      title: 'No brain dump',
      emoji: '🧠',
      items: o.dump.map((b) => ({ id: `dump:${b.id}`, emoji: '🧠', title: b.text, subtitle: b.group, action: sheetAction('brainDumpTriage', { id: b.id }) })),
    })
  const lastList = [...blocks].reverse().find((b) => b.kind === 'list')
  if (lastList && lastList.kind === 'list') lastList.more ??= { label: `Abrir ${trip.name}`, action: routeAction(ROUTES.trip(trip.id)) }
  else blocks.push({ kind: 'list', title: trip.name, emoji: trip.flag, items: [{ id: 'trip', emoji: trip.flag, title: 'Abrir viagem', action: routeAction(ROUTES.trip(trip.id)) }] })
  return blocks
}

function overview({ db, today }: AgentContext): AnswerBlock[] {
  const trips = upcomingTrips(db, today)
  if (!trips.length) return [{ kind: 'headline', text: 'Nenhuma viagem no radar ainda. Bora sonhar com a próxima? ✈️' }]
  return [
    { kind: 'headline', text: `${plural(trips.length, 'viagem', 'viagens')} no radar. A próxima é ${trips[0].flag} ${trips[0].name}${trips[0].startDate ? ` (${countdownLabel(trips[0].startDate, today)})` : ''}.` },
    {
      kind: 'list',
      title: 'Viagens',
      emoji: '✈️',
      items: trips.map((t) => {
        const o = tripOpenItems(db, t)
        const open = o.items.length + o.tasks.length
        return {
          id: `trip:${t.id}`,
          emoji: t.flag,
          title: t.name,
          subtitle: [t.startDate ? capitalize(countdownLabel(t.startDate, today)) : t.dateLabel, open ? `${open} pra revisar` : 'tudo certo'].filter(Boolean).join(' · '),
          action: routeAction(ROUTES.trip(t.id)),
        }
      }),
    },
  ]
}

/** Upcoming trip within `days` (used by insights). */
export function tripSoon(db: DB, today: string, days: number): Trip | undefined {
  return upcomingTrips(db, today).find((t) => t.startDate && t.startDate >= today && diffDays(today, t.startDate) <= days)
}

export const TravelAgent: Agent = {
  id: 'travel',
  name: 'Viagens',
  emoji: '✈️',
  match(q) {
    // "Quanto gastei na viagem?" is a money question about a trip.
    if (has(q, 'gast*', 'despesa*', 'paguei', 'custou')) return q.trips.length ? 0.55 : 0.3
    if (q.trips.length && has(q, 'antes', 'pendente*', 'falta*', 'resolver', 'aberto', 'confirmar', 'revisar', 'levar')) return 0.97
    if (q.trips.length) return 0.9
    if (has(q, 'viajar', 'viagem', 'viagens', 'mala', 'passaporte', 'visto', 'embarque')) return 0.9
    return 0
  },
  answer(ctx) {
    const { db, today, q } = ctx
    const named = [...q.trips].sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'))[0]
    const pendingAsk = has(q, 'antes', 'pendente*', 'falta*', 'resolver', 'aberto', 'confirmar', 'revisar', 'preciso', 'documento*', 'mala')
    if (named) return pending(ctx, named)
    if (pendingAsk || has(q, 'proxima')) {
      const trip = nextTrip(db, today)
      if (trip) return pending(ctx, trip)
    }
    return overview(ctx)
  },
}
