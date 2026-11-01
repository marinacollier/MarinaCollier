/**
 * The Expedição's operations by conversation (brief operacional 01/11) — deterministic, read-only, from her data:
 *   "qual minha programação de hoje?"  → agenda with times, address, links, checklist, today's spend + mandatory blocks
 *   "atualiza o roteiro"               → only reorganizes what is stored (nothing created/booked), with conflicts
 *   "o que falta reservar?"            → by urgency P0→P2: link, value, deadline, dependencies (planned ≠ reserved)
 *   "gerar checklist de amanhã"        → clothes/equipment, documents, food/water, transport, departure, bookings
 *   "fechamento financeiro"            → paid · committed · estimated · remaining vs budget · risk · savings
 * Nothing is written and nothing is invented: what is missing is said as missing.
 */
import { ROUTES } from '@/app/routes'
import type { Now } from '@/data/intel'
import type { DateKey, DB, Trip, TripItem } from '@/data/types'
import { addDays, formatDayMonth, minutesToHM } from '@/lib/date'
import { BOOKING_STATUS_META, bookingStatusOf } from '@/features/travel/expedition/command'
import { blockWhen, dailyPlan } from '@/features/travel/expedition/daily'
import { checklistOf, classOn, findConflicts, formatMoney, isActive, itemsOnDay, localNow } from '@/features/travel/expedition/logic'
import { RISK_LABEL, daySpend, financialClose, toBook, tomorrowChecklist } from '@/features/travel/expedition/ops'
import type { Handler, HandlerInput, LumosReply, ReplyLine, ReplySection } from '../types'

const AREA = 'viagem'

const AGENDA = /\b(?:qual|quais|como|me (?:da|passa|manda|mostra))\b.*\bprogramac(?:ao|oes)\b|\bminha programacao\b|\bprogramacao (?:de |pra |para )?(?:hoje|amanha|do dia)\b/
const REPLAN = /\b(?:atualiza|atualizar|reorganiza|reorganizar|refaz|refazer|reordena)\b.*\broteiro\b/
const TO_BOOK = /\b(?:o que|oque|quais?|que)\b.*\bfalta(?:m)? (?:reservar|fechar|contratar)\b|\bfalta reservar\b|\bpendencias? de reserva\b|\bo que (?:ainda )?(?:nao )?(?:esta|ta) reservado\b/
const CHECKLIST = /\bchecklist\b.*\bamanha\b|\b(?:gera|gerar|monta|montar|faz|fazer)\b.*\bchecklist\b/
const FINANCE = /\bfechamento (?:financeiro|da viagem|dos gastos)\b|\bfecha(?:r|mento)? (?:as )?contas da viagem\b|\bbalanco (?:financeiro|da viagem)\b/

/** The expedition trip of the trip's local day, and that local day/clock. */
function tripNow(db: DB, now: Now): { trip: Trip; date: DateKey; minutes: number } | undefined {
  for (const t of db.trips) {
    if (!t.expedition || !t.startDate || !t.endDate) continue
    const at = now.iso ? new Date(now.iso) : new Date(`${now.date}T${minutesToHM(now.minutes)}:00-03:00`)
    const local = localNow(t.expedition.timeZone, at)
    if (t.startDate <= local.date && local.date <= t.endDate) return { trip: t, date: local.date, minutes: local.minutes }
  }
  return undefined
}

const dm = (d: DateKey) => formatDayMonth(d)
const statusLabel = (i: TripItem) => BOOKING_STATUS_META[bookingStatusOf(i)].label

// ─── programação de hoje ───────────────────────────────────────────────────

function agenda(db: DB, trip: Trip, date: DateKey, label: string): LumosReply {
  const items = db.tripItems.filter((i) => i.tripId === trip.id)
  const day = itemsOnDay(items.filter(isActive), date).filter((i) => i.section !== 'hospedagem' || i.date === date)
  const block = classOn(trip.expedition, date)
  const absent = day.some((i) => i.schoolImpact === 'dia')
  const lines: ReplyLine[] = []
  if (block) lines.push({ emoji: '🏫', text: absent ? `Sem aula (ausência planejada)` : `Aula ${block.start}–${block.end}`, sub: trip.expedition?.school?.name })
  for (const i of day) {
    const at = i.date === date ? i.leaveTime ?? i.time : undefined
    const sub = [at ? (i.leaveTime && i.time && i.leaveTime !== i.time ? `Sair ${i.leaveTime} · começa ${i.time}` : `Às ${at}`) : 'Sem horário', statusLabel(i), i.address, i.url].filter(Boolean).join(' · ')
    lines.push({ emoji: i.section === 'hospedagem' ? '🛏️' : i.section === 'voo' ? '✈️' : '📍', text: i.title, sub })
  }
  const sections: ReplySection[] = []
  const plan = dailyPlan(trip, items, db.workouts, db.occurrences, date)
  if (plan) {
    sections.push({
      title: 'Blocos obrigatórios',
      lines: plan.blocks.filter((b) => b.core).map((b) => ({ emoji: b.done ? '✓' : b.emoji, text: b.title, sub: [blockWhen(b), b.sub].filter(Boolean).join(' · ') })),
    })
  }
  const checks = day.filter((i) => i.date === date && i.checklistKind && i.status !== 'feito')
  if (checks.length) sections.push({ title: 'Checklist', lines: checks.flatMap((i) => checklistOf(i).filter((c) => !c.done).map((c) => ({ emoji: '☐', text: c.text, sub: i.title }))) })
  const spend = daySpend(trip, items, db.expenses, date)
  const cur = trip.expedition?.currency ?? 'BRL'
  sections.push({ title: 'Gasto do dia', lines: [{ emoji: '💸', text: spend ? formatMoney(spend.cents, cur) : 'Nada registrado ainda', sub: spend?.source === 'extrato' ? 'Pelo extrato' : undefined }] })
  const timed = day.filter((i) => i.date === date && (i.leaveTime ?? i.time)).length
  return {
    area: AREA,
    text: `${label} (${dm(date)}): ${block && !absent ? 'aula e ' : ''}${day.length ? `${day.length} ${day.length === 1 ? 'item' : 'itens'} no roteiro${timed < day.length ? ` (${day.length - timed} sem horário)` : ''}` : 'nada no roteiro'}${plan ? ', mais os 3 blocos obrigatórios' : ''}.`,
    lines,
    sections,
    ref: { type: 'trip', id: trip.id },
    link: { label: 'Abrir briefing do dia', to: `${ROUTES.trip(trip.id)}?s=briefing` },
  }
}

// ─── atualiza o roteiro ────────────────────────────────────────────────────

function replan(db: DB, trip: Trip, date: DateKey): LumosReply {
  const items = db.tripItems.filter((i) => i.tripId === trip.id)
  const end = trip.endDate ?? date
  const conflicts = findConflicts(trip, items, db.workouts).filter((c) => c.date >= date)
  const sections: ReplySection[] = []
  for (let d = date; d <= end && sections.length < 3; d = addDays(d, 1)) {
    const day = itemsOnDay(items.filter(isActive), d).filter((i) => i.date === d && i.section !== 'hospedagem' && i.status !== 'feito')
    const block = classOn(trip.expedition, d)
    const lines: ReplyLine[] = []
    if (block && !day.some((i) => i.schoolImpact === 'dia')) lines.push({ emoji: '🏫', text: `Aula ${block.start}–${block.end}` })
    for (const i of day) lines.push({ emoji: '📍', text: `${i.leaveTime ?? i.time ?? 'sem horário'} · ${i.title}`, sub: statusLabel(i) })
    if (!lines.length) lines.push({ emoji: '🌿', text: 'Livre' })
    sections.push({ title: d === date ? `Hoje · ${dm(d)}` : dm(d), lines })
  }
  if (conflicts.length) sections.unshift({ title: 'Conflitos de horário', lines: conflicts.map((c) => ({ emoji: '⚠️', text: c.text, sub: dm(c.date) })) })
  const undated = items.filter((i) => isActive(i) && !i.date && !i.optional && i.status !== 'feito' && ['roteiro', 'reserva', 'esporte', 'quero_ir'].includes(i.section)).length
  return {
    area: AREA,
    text: `Reorganizei o que já está salvo, por dia e horário — nada foi criado, mudado ou reservado.${conflicts.length ? ` ${conflicts.length === 1 ? 'Há 1 conflito' : `Há ${conflicts.length} conflitos`} para você decidir.` : ' Sem conflito de horário daqui pra frente.'}`,
    sub: undated ? `${undated} ${undated === 1 ? 'item' : 'itens'} sem data ficam fora do calendário até você marcar.` : undefined,
    sections,
    ref: { type: 'trip', id: trip.id },
    link: { label: 'Abrir calendário', to: `${ROUTES.trip(trip.id)}?s=dias` },
  }
}

// ─── o que falta reservar? ─────────────────────────────────────────────────

function missingBookings(db: DB, trip: Trip, date: DateKey): LumosReply {
  const { rows, noProof } = toBook(trip, db.tripItems, date)
  const sections: ReplySection[] = []
  for (const p of ['P0', 'P1', 'P2', undefined] as const) {
    const list = rows.filter((r) => r.item.priority === p)
    if (!list.length) continue
    sections.push({
      title: p ?? 'Sem prioridade',
      lines: list.map((r) => ({
        emoji: r.overdue ? '⏰' : '🎟️',
        text: `${r.item.title} — ${BOOKING_STATUS_META[r.status].label}`,
        sub: [
          r.item.date ? `para ${dm(r.item.date)}` : undefined,
          r.deadline ? `${r.overdue ? 'prazo vencido' : 'resolver até'} ${dm(r.deadline)}` : 'sem prazo',
          r.value ? `${r.value.kind} ${formatMoney(r.value.cents, r.value.currency)}` : 'sem valor',
          r.dependsOn.length ? `depende: ${r.dependsOn.join('; ')}` : undefined,
          r.item.url,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    })
  }
  if (noProof.length) sections.push({ title: 'Sem comprovante (não conta como reservado)', lines: noProof.map((i) => ({ emoji: '📎', text: i.title, sub: 'Anexe voucher, código ou a confirmação do fornecedor.' })) })
  const p0 = rows.filter((r) => r.item.priority === 'P0').length
  return {
    area: AREA,
    text: rows.length ? `Faltam ${rows.length} ${rows.length === 1 ? 'reserva' : 'reservas'}${p0 ? `, ${p0} P0` : ''}. Planejado não é reservado: aqui só entra o que ainda precisa de você.` : 'Nada pendente de reserva daqui pra frente.',
    sections,
    ref: { type: 'trip', id: trip.id },
    link: { label: 'Abrir reservas', to: `${ROUTES.trip(trip.id)}?s=reservas` },
  }
}

// ─── checklist de amanhã ───────────────────────────────────────────────────

function checklist(db: DB, trip: Trip, date: DateKey): LumosReply {
  const c = tomorrowChecklist(trip, db.tripItems, db.workouts, db.occurrences, date)
  const sec = (title: string, xs: string[], emoji: string): ReplySection[] => (xs.length ? [{ title, lines: xs.map((text) => ({ emoji, text })) }] : [])
  return {
    area: AREA,
    text: `Checklist de amanhã (${dm(c.date)}): ${c.departure ? `saída ${c.departure.at} para ${c.departure.title}${c.departure.wake ? `, acordar ${c.departure.wake}` : ''}` : 'sem horário de saída registrado'}.`,
    sub: c.empty ? 'Nada marcado no roteiro de amanhã — só o básico e os blocos do dia.' : undefined,
    sections: [
      ...sec('Roupas e equipamentos', c.gear, '🎒'),
      ...sec('Documentos', c.documents, '🛂'),
      ...sec('Comida e água', c.food, '💧'),
      ...sec('Transporte', c.transport, '🚕'),
      ...sec('Reservas', c.bookings, '🎟️'),
      ...sec('Blocos obrigatórios', c.blocks, '⏱️'),
    ],
    ref: { type: 'trip', id: trip.id },
    link: { label: 'Abrir revisão da noite', to: `${ROUTES.trip(trip.id)}?s=briefing` },
  }
}

// ─── fechamento financeiro ─────────────────────────────────────────────────

function finance(db: DB, trip: Trip): LumosReply {
  const f = financialClose(trip, db.tripItems, db.expenses)
  const m = (c: number) => formatMoney(c, f.currency)
  const lines: ReplyLine[] = [
    { emoji: '✅', text: `Pago até agora: ${m(f.paid)}`, sub: `Extrato ${m(f.paidLedger)} + itens pagos fora dos dias do extrato ${m(f.paidItems)}` },
    { emoji: '🔒', text: `Comprometido (reservado, não pago): ${m(f.committed)}`, sub: f.committedLines.map((l) => l.item.title).join(', ') || undefined },
    { emoji: '📝', text: `Estimado (planejado/cotado): ${m(f.estimated)}`, sub: f.estimatedLines.map((l) => `${l.item.title} (${l.kind})`).join(', ') || undefined },
    { emoji: '🧮', text: `Projetado: ${m(f.projected)}`, sub: `Com a margem de ${f.marginPct}%: ${m(f.projectedWithMargin)}` },
  ]
  if (f.budget) {
    const ref = `Orçamento original ${formatMoney(f.budget.cents, f.currency)} — referência, não saldo disponível`
    lines.push(f.budget.remaining != null ? { emoji: '💰', text: `Sobra depois do projetado: ${m(f.budget.remaining)}`, sub: `${ref}. Depois só do pago: ${m(f.budget.remainingAfterPaid!)}.` } : { emoji: '💰', text: 'Sem cotação para comparar com o orçamento em reais', sub: `${ref}. Defina a cotação na viagem.` })
  }
  const missing = f.withoutValue.length ? `${f.withoutValue.length} itens ainda sem valor — o total sobe quando entrarem.` : undefined
  // Without a rate the budget line above already says it can't compare.
  if (f.risk !== 'sem_cotacao') lines.push({ emoji: f.risk === 'alto' ? '🚨' : f.risk === 'atencao' ? '⚠️' : 'ℹ️', text: RISK_LABEL[f.risk], sub: missing })
  else if (missing) lines.push({ emoji: 'ℹ️', text: missing })
  for (const u of f.unconverted) lines.push({ emoji: '💱', text: `${formatMoney(u.cents, u.currency as typeof f.currency)} no extrato sem cotação`, sub: 'Fora da conta até ter cotação.' })
  return {
    area: AREA,
    text: `Fechamento da ${trip.name}: ${m(f.paid)} pago, ${m(f.committed)} comprometido e ${m(f.estimated)} estimado.`,
    sub: 'Só entra o que está registrado; nos dias do extrato, só o extrato conta (sem contagem dupla).',
    lines,
    sections: [{ title: 'Onde economizar (sem cortar o essencial)', lines: f.savings.map((text) => ({ emoji: '•', text })) }],
    ref: { type: 'trip', id: trip.id },
    link: { label: 'Abrir reservas e pagamentos', to: `${ROUTES.trip(trip.id)}?s=reservas` },
  }
}

function tripOps(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const which = AGENDA.test(n) ? 'agenda' : TO_BOOK.test(n) ? 'book' : CHECKLIST.test(n) ? 'checklist' : FINANCE.test(n) ? 'finance' : REPLAN.test(n) ? 'replan' : undefined
  if (!which) return undefined
  const t = tripNow(db, now)
  if (!t) return undefined
  switch (which) {
    case 'agenda': {
      const tomorrow = /\bamanha\b/.test(n)
      return agenda(db, t.trip, tomorrow ? addDays(t.date, 1) : t.date, tomorrow ? 'Amanhã' : 'Hoje')
    }
    case 'replan':
      return replan(db, t.trip, t.date)
    case 'book':
      return missingBookings(db, t.trip, t.date)
    case 'checklist':
      return checklist(db, t.trip, t.date)
    case 'finance':
      return finance(db, t.trip)
  }
}

export const tripOpsHandler: Handler = { id: 'trip-ops', run: tripOps }
