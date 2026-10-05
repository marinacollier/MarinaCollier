/**
 * NeedsAttention — ONE queue with only what really needs Marina: real conflicts, relevant ambiguities
 * (things still 'a confirmar' with a near date), decisions (patterns ready to confirm, meal suggestions,
 * possible duplicates) and waiting-for items due for a follow-up. Usually short or empty.
 * Anything Lumos can solve on its own never shows up here. Keys are stable; acks hide them.
 */
import type { AttentionAck, DateKey, DB } from '../types'
import { conflictsBetween } from '../planning'
import { eventsFor, upcomingTrips } from '../selectors'
import { actions } from '../store'
import { addDays, diffDays } from '@/lib/date'
import { capitalize, dayLabel, tripOpenItems } from './context'
import type { AttentionItem, Now, Undo } from './types'

const NEAR_DAYS = 7
const TRIP_DECISION_DAYS = 21

/** Is this key hidden by an ack (resolved / dismissed, or snoozed until a date not reached yet)? */
export function isAcked(db: DB, key: string, today: DateKey): boolean {
  return (db.attentionAcks ?? []).some((a) => a.key === key && (a.how !== 'snoozed' || !a.until || a.until > today))
}

export function needsAttention(db: DB, now: Now): AttentionItem[] {
  const today = now.date
  const until = addDays(today, NEAR_DAYS - 1)
  const out: AttentionItem[] = []

  // 1. Real conflicts (warnings only; already-answered ConflictAcks are filtered by planning).
  for (const c of conflictsBetween(db, today, until)) {
    if (c.severity !== 'warn') continue
    const workout = c.refs.find((r) => r.type === 'workout')
    out.push({
      key: `conflict:${c.key}`,
      kind: 'conflict',
      title: `${capitalize(dayLabel(c.date, today))}: ${c.title.toLowerCase()}`,
      detail: c.message,
      options: [
        { label: 'Mantém assim', ask: `mantém ${dayLabel(c.date, today)} como está` },
        ...(workout ? [{ label: 'Acha outro horário', ask: `acha outro horário pro ${workout.title.replace(/^\p{Extended_Pictographic}\s*/u, '')} de ${dayLabel(c.date, today)}` }] : []),
      ],
      provenance: 'inference',
      ref: workout ? { type: 'workout', id: workout.id } : c.refs[0] ? { type: c.refs[0].type, id: c.refs[0].id } : undefined,
    })
  }

  // 2. Ambiguities: still 'a confirmar' with a near date.
  for (let d = today; d <= until; d = addDays(d, 1)) {
    for (const e of eventsFor(db, d)) {
      if (e.planType !== 'a_confirmar') continue
      out.push({
        key: `confirm:event:${e.id}:${d}`,
        kind: 'ambiguity',
        title: `${e.title} ${dayLabel(d, today)} — vai acontecer?`,
        options: [
          { label: 'Confirmado', ask: `confirma ${e.title} ${dayLabel(d, today)}` },
          { label: 'Não vai rolar', ask: `cancela ${e.title} ${dayLabel(d, today)}` },
        ],
        provenance: 'fact',
        ref: { type: 'event', id: e.id },
      })
    }
  }
  for (const w of db.workouts) {
    if (w.planType !== 'a_confirmar' || w.status !== 'planejado' || w.date < today || w.date > until) continue
    out.push({ key: `confirm:workout:${w.id}`, kind: 'ambiguity', title: `${w.title ?? 'Treino'} ${dayLabel(w.date, today)} — confirmado?`, provenance: 'fact', ref: { type: 'workout', id: w.id } })
  }
  for (const t of db.tasks) {
    const when = t.date ?? t.dueDate
    if (t.status !== 'review' || !when || when > until) continue
    out.push({
      key: `review:task:${t.id}`,
      kind: 'ambiguity',
      title: t.title,
      detail: when < today ? 'ficou de antes — ainda faz sentido?' : `${dayLabel(when, today)} — ainda a confirmar`,
      options: [
        { label: 'Segue', ask: `confirma ${t.title}` },
        { label: 'Tira', ask: `tira ${t.title}` },
      ],
      provenance: 'fact',
      ref: { type: 'task', id: t.id },
    })
  }

  // Trips: decisions that are close (dated items soon, or bookings/documents when the trip is near). One item per trip.
  for (const trip of upcomingTrips(db, today)) {
    if (!trip.startDate || trip.startDate < today) continue
    const daysLeft = diffDays(today, trip.startDate)
    const open = tripOpenItems(db, trip, today).filter((i) => (i.date && diffDays(today, i.date) <= 14) || (daysLeft <= TRIP_DECISION_DAYS && ['voo', 'hospedagem', 'documento', 'antes_de_ir', 'reserva'].includes(i.section)))
    if (!open.length) continue
    out.push({
      key: `trip:${trip.id}:${trip.startDate}`,
      kind: 'decision',
      title: `${trip.name}: ${open.length === 1 ? '1 coisa pra decidir' : `${open.length} coisas pra decidir`} antes de ir`,
      detail: open
        .slice(0, 3)
        .map((i) => i.title)
        .join(' · '),
      options: [{ label: 'Ver o que falta', ask: `o que falta pra ${trip.name}?` }],
      provenance: 'fact',
      ref: { type: 'trip', id: trip.id },
    })
  }

  // 3. Decisions: patterns ready to confirm (evidence ≥ 3, never asked), meal suggestions waiting, possible duplicates.
  for (const m of db.memory ?? []) {
    if (m.status !== 'observed' || (m.evidence ?? 0) < 3 || m.askedAt) continue
    out.push({
      key: `pattern:${m.id}`,
      kind: 'confirm_pattern',
      title: `${m.text}. Quer que eu considere isso como preferência?`,
      options: [
        { label: 'Sim', ask: `sim, considera "${m.text}" como preferência` },
        { label: 'Não', ask: `não, "${m.text}" não é preferência` },
      ],
      provenance: 'inference',
      ref: { type: 'memory', id: m.id },
    })
  }
  const proposed = (db.mealAdjustments ?? []).filter((a) => a.status === 'proposed' && a.date === today)
  if (proposed.length)
    out.push({
      key: `meals:${today}:${proposed.map((a) => a.id).sort().join('+')}`,
      kind: 'decision',
      title: proposed.length === 1 ? 'Uma sugestão pra próxima refeição' : `${proposed.length} sugestões pras próximas refeições`,
      detail: proposed[0].reason,
      options: [
        { label: 'Aplica', ask: 'aplica a sugestão das refeições' },
        { label: 'Mantém o plano', ask: 'mantém o plano das refeições' },
      ],
      provenance: 'suggestion',
    })
  const dup = db.expenses.filter((e) => e.possibleDuplicateOf)
  if (dup.length)
    out.push({
      key: `dup:${dup.map((e) => e.id).sort().join('+')}`,
      kind: 'decision',
      title: dup.length === 1 ? `Gasto talvez duplicado: ${dup[0].title}` : `${dup.length} gastos talvez duplicados`,
      provenance: 'integration',
      ref: { type: 'expense', id: dup[0].id },
    })

  // 4. Waiting for someone, follow-up due.
  for (const t of db.tasks) {
    if (t.status !== 'waiting' || !t.waiting?.followUpOn || t.waiting.followUpOn > today) continue
    out.push({
      key: `waiting:${t.id}:${t.waiting.followUpOn}`,
      kind: 'waiting_reply',
      title: `Esperando ${t.waiting.who}: ${t.title}`,
      detail: `desde ${t.waiting.since.slice(8, 10)}/${t.waiting.since.slice(5, 7)}`,
      options: [
        { label: 'Respondeu', ask: `${t.waiting.who} me respondeu` },
        { label: 'Cobrar depois', ask: `lembra de cobrar ${t.waiting.who} semana que vem` },
      ],
      provenance: 'fact',
      ref: { type: 'task', id: t.id },
    })
  }

  const seen = new Set<string>()
  return out.filter((i) => !isAcked(db, i.key, today) && !seen.has(i.key) && !!seen.add(i.key))
}

/** Marina answered / dismissed / snoozed an item. Undoable. */
export function ackAttention(key: string, how: AttentionAck['how'] = 'resolved', until?: DateKey): Undo {
  const ack = actions.create('attentionAcks', { key, how, ...(until ? { until } : {}) })
  return () => void actions.remove('attentionAcks', ack.id)
}
