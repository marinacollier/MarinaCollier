import type { DB, Trip, TripItem } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { isTaskOpen, nextTrip, upcomingTrips } from '@/data/selectors'
import { countdownLabel } from '@/lib/date'
import { normalize } from '@/lib/text'
import { routeAction, sheetAction } from '@/features/search/actions'
import { tokenize } from '@/features/search/engine'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, AnswerItem } from '../types'
import { capitalize, plural, taskItem } from './common'

const OPEN: TripItem['status'][] = ['a_confirmar', 'a_fazer']
const DOC_SECTIONS: TripItem['section'][] = ['documento', 'antes_de_ir']

/** Brain dump groups belong to a trip when they share its name/place words ("África do Sul"). */
function belongsToTrip(group: string | undefined, trip: Trip): boolean {
  if (!group) return false
  const g = normalize(group)
  if (g === normalize(trip.name)) return true
  const words = tokenize(`${trip.name} ${trip.place ?? ''}`).filter((w) => w.length >= 4)
  return words.some((w) => tokenize(group).includes(w))
}

export function tripOpenItems(db: DB, trip: Trip) {
  const items = db.tripItems.filter((i) => i.tripId === trip.id && OPEN.includes(i.status)).sort((a, b) => a.order - b.order)
  return {
    docs: items.filter((i) => DOC_SECTIONS.includes(i.section)),
    toConfirm: items.filter((i) => !DOC_SECTIONS.includes(i.section) && i.status === 'a_confirmar'),
    toDo: items.filter((i) => !DOC_SECTIONS.includes(i.section) && i.status === 'a_fazer'),
    tasks: db.tasks.filter((t) => t.tripId === trip.id && isTaskOpen(t)),
    dump: db.brainDump.filter((b) => b.status === 'inbox' && belongsToTrip(b.group, trip)),
  }
}

function itemRow(i: TripItem, trip: Trip): AnswerItem {
  return {
    id: `tripItem:${i.id}`,
    emoji: i.section === 'documento' ? '🛂' : i.section === 'antes_de_ir' ? '📌' : trip.flag,
    title: i.title,
    subtitle: [i.group, i.status === 'a_confirmar' ? 'a confirmar' : 'a fazer'].filter(Boolean).join(' · '),
    action: sheetAction('tripItem', { id: i.id, tripId: trip.id }),
  }
}

function pending(ctx: AgentContext, trip: Trip): AnswerBlock[] {
  const { db, today } = ctx
  const o = tripOpenItems(db, trip)
  const total = o.docs.length + o.toConfirm.length + o.toDo.length + o.tasks.length + o.dump.length
  const when = trip.startDate ? countdownLabel(trip.startDate, today) : trip.dateLabel ? `previsto para ${trip.dateLabel}` : 'sem data ainda'
  const lead = `${trip.flag} ${trip.name} — ${when}`
  if (!total)
    return [{ kind: 'headline', text: `${lead}. Tudo resolvido por aqui, é só aproveitar ✨` }, { kind: 'list', title: trip.name, emoji: trip.flag, items: [{ id: 'trip', emoji: trip.flag, title: 'Abrir viagem', action: routeAction(ROUTES.trip(trip.id)) }] }]

  const blocks: AnswerBlock[] = [
    {
      kind: 'headline',
      text: `${lead}: ${plural(total, 'coisa em aberto', 'coisas em aberto')}.${o.docs.length ? ' Comece pelos documentos 🛂' : ''}`,
    },
  ]
  if (o.docs.length) blocks.push({ kind: 'list', title: 'Documentos e antes de ir', emoji: '🛂', items: o.docs.map((i) => itemRow(i, trip)) })
  if (o.toConfirm.length) blocks.push({ kind: 'list', title: 'A confirmar', emoji: '❓', items: o.toConfirm.map((i) => itemRow(i, trip)) })
  if (o.toDo.length) blocks.push({ kind: 'list', title: 'A fazer', emoji: '🧳', items: o.toDo.map((i) => itemRow(i, trip)) })
  if (o.tasks.length) blocks.push({ kind: 'list', title: 'Tarefas da viagem', emoji: '✓', items: o.tasks.map((t) => taskItem(db, t, today)) })
  if (o.dump.length)
    blocks.push({
      kind: 'list',
      title: 'No brain dump',
      emoji: '🧠',
      items: o.dump.map((b) => ({ id: `dump:${b.id}`, emoji: '🧠', title: b.text, subtitle: b.group, action: sheetAction('brainDumpTriage', { id: b.id }) })),
    })
  const last = blocks[blocks.length - 1]
  if (last.kind === 'list') last.more = { label: `Abrir ${trip.name}`, action: routeAction(ROUTES.trip(trip.id)) }
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
        const open = o.docs.length + o.toConfirm.length + o.toDo.length + o.tasks.length
        return {
          id: `trip:${t.id}`,
          emoji: t.flag,
          title: t.name,
          subtitle: [t.startDate ? capitalize(countdownLabel(t.startDate, today)) : t.dateLabel, open ? `${open} em aberto` : 'tudo certo'].filter(Boolean).join(' · '),
          action: routeAction(ROUTES.trip(t.id)),
        }
      }),
    },
  ]
}

export const TravelAgent: Agent = {
  id: 'travel',
  name: 'Viagens',
  emoji: '✈️',
  match(q) {
    // "Quanto gastei na viagem?" is a money question about a trip.
    if (has(q, 'gast*', 'despesa*', 'paguei', 'custou')) return q.trips.length ? 0.55 : 0.3
    if (q.trips.length && has(q, 'antes', 'pendente*', 'falta*', 'resolver', 'aberto', 'confirmar')) return 0.97
    if (q.trips.length) return 0.9
    if (has(q, 'viajar', 'viagem', 'viagens', 'mala', 'passaporte', 'visto', 'embarque')) return 0.9
    return 0
  },
  answer(ctx) {
    const { db, today, q } = ctx
    const named = [...q.trips].sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'))[0]
    const pendingAsk = has(q, 'antes', 'pendente*', 'falta*', 'resolver', 'aberto', 'confirmar', 'preciso', 'documento*', 'mala')
    if (named) return pending(ctx, named)
    if (pendingAsk || has(q, 'proxima')) {
      const trip = nextTrip(db, today)
      if (trip) return pending(ctx, trip)
    }
    return overview(ctx)
  },
}
