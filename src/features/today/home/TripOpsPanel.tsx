/**
 * Painel operacional da viagem (only while a trip with an expedition is happening) — on the trip page's Hoje
 * (moved off Home in the clean Home; Home keeps only the top 3 of it in "Precisa de você"). Computed from what is
 * stored — nothing invented: agenda of today + 7 days, the next priority action, payments pending, answers awaited,
 * deliveries, spend (pago · comprometido · estimado), the wallet balance only when she typed it, work/study of the
 * day, conflicts, the countdown to the next flight and the next leg's open items, highlighted until resolved.
 * Every list is capped; tapping a booking opens its sheet, "centro de comando" opens the trip.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronRight, Plane } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { Card } from '@/components/ui'
import type { ActionItem } from '@/data/agenda/items'
import type { DateKey, TripItem } from '@/data/types'
import { addDays, formatShortDate } from '@/lib/date'
import { cn } from '@/lib/cn'
import { BOOKING_STATUS_META, bookingStatusOf, daysLabel } from '@/features/travel/expedition/command'
import { formatMoney } from '@/features/travel/expedition/logic'
import type { TripOpsPanel as Panel } from '@/features/travel/expedition/panel'

const CAP = 5
/** First level (MARINA OS 2.0): only what is urgent; everything else one tap away. */
const URGENT = 3

const dayLabel = (d: DateKey, today: DateKey) => (d === today ? 'hoje' : d === addDays(today, 1) ? 'amanhã' : formatShortDate(d))

function Section({ title, count, children, label }: { title: string; count?: number; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className="pt-3 mt-3 border-t border-line/70 first:border-t-0 first:pt-0 first:mt-0">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="eyebrow">{title}</h3>
        {count != null && count > CAP && <span className="text-[11.5px] text-muted tabular-nums">{CAP} de {count}</span>}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  )
}

function Row({ title, sub, right, onOpen, warn }: { title: string; sub?: string; right?: ReactNode; onOpen?: () => void; warn?: boolean }) {
  const body = (
    <>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] leading-snug">{title}</span>
        {sub && <span className={cn('block text-[12px]', warn ? 'text-[color-mix(in_oklab,var(--sand)_62%,var(--ink))] font-medium' : 'text-muted')}>{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-right">{right}</span>}
    </>
  )
  return (
    <li>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="w-full min-h-11 flex items-center gap-3 text-left py-1 active:opacity-70">
          {body}
        </button>
      ) : (
        <div className="min-h-11 flex items-center gap-3 py-1">{body}</div>
      )}
    </li>
  )
}

const openItem = (i: TripItem) => openSheet('tripItem', { id: i.id })
const statusOf = (i: TripItem) => BOOKING_STATUS_META[bookingStatusOf(i)].label

export function TripOpsPanel({ panel, work, workouts, today, hideMoney, inTrip }: { panel: Panel; work: ActionItem[]; workouts: ActionItem[]; today: DateKey; hideMoney?: boolean; /** Already on the trip page: no link to it. */ inTrip?: boolean }) {
  const nav = useNavigate()
  const { trip, date } = panel
  const cur = panel.finance.currency
  const money = (c: number, currency = cur) => (hideMoney ? '•••' : formatMoney(c, currency))
  const command = `${ROUTES.trip(trip.id)}?s=reservas`
  const place = trip.expedition?.weather?.label ?? trip.place?.split(/[·(]/)[0]?.trim() ?? trip.name
  const agenda = panel.agenda
  const openRow = (i: ActionItem) => openSheet('itemEdit', { item: i, today })
  const [full, setFull] = useState(false)
  // Urgent = due by tomorrow or P0; the rest of the leg waits in the full panel.
  const soon = addDays(date, 1)
  const urgent = panel.leg.items.filter((i) => (i.deadline && i.deadline <= soon) || i.priority === 'P0')
  const legShown = full ? panel.leg.items.slice(0, CAP) : urgent.slice(0, URGENT)
  const legRest = panel.leg.items.length - legShown.length

  return (
    <Card aria-label="Painel operacional da viagem">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">viagem · {place}</div>
          {panel.flight && (
            <p className="text-[15px] font-semibold mt-1 flex items-start gap-1.5">
              <Plane size={15} aria-hidden className="mt-1 shrink-0 text-muted" />
              <span>
              {panel.flight.item.title} {daysLabel(panel.flight.days)}
              {panel.flight.item.time ? <span className="font-normal text-muted"> · {formatShortDate(panel.flight.item.date!)} {panel.flight.item.time}</span> : null}
              </span>
            </p>
          )}
        </div>
      </div>

      {legShown.length > 0 && (
        <section aria-label="Pendências da próxima etapa" className="mt-3 rounded-2xl bg-sand-soft px-3.5 py-3">
          <div className="eyebrow">{full ? 'pendências' : 'urgente'} · {panel.leg.label ?? 'próxima etapa'}</div>
          <ul className="mt-1 space-y-0.5">
            {legShown.map((i) => (
              <Row key={i.id} title={i.title} sub={[i.priority, statusOf(i), i.deadline && `prazo ${formatShortDate(i.deadline)}`, i.nextAction].filter(Boolean).join(' · ')} warn={!!i.deadline && i.deadline <= date} onOpen={() => openItem(i)} />
            ))}
          </ul>
          {full && legRest > 0 && <p className="text-[12px] text-muted mt-1">+{legRest} no centro de comando</p>}
        </section>
      )}

      <div className="mt-3">
        {panel.next && (
          <Section title="próxima ação">
            <Row
              title={panel.next.nextAction!}
              sub={[panel.next.title, panel.next.priority, panel.next.deadline ? `prazo ${formatShortDate(panel.next.deadline)}` : panel.next.date && `para ${formatShortDate(panel.next.date)}`].filter(Boolean).join(' · ')}
              warn={!!panel.next.deadline && panel.next.deadline <= date}
              onOpen={() => openItem(panel.next!)}
            />
          </Section>
        )}

        {full && (
        <>
        <Section title="agenda · hoje e 7 dias" label="Agenda da viagem" count={agenda.length + workouts.length}>
          {workouts.slice(0, 2).map((w) => (
            <Row key={w.key} title={w.title} sub={['hoje', w.start, 'treino'].filter(Boolean).join(' · ')} onOpen={() => openRow(w)} />
          ))}
          {agenda.slice(0, Math.max(0, CAP - Math.min(2, workouts.length))).map((i) => (
            <Row
              key={i.id}
              title={i.title}
              sub={[dayLabel(i.date! < date ? date : i.date!, date), i.leaveTime ?? i.time, statusOf(i)].filter(Boolean).join(' · ')}
              onOpen={() => openItem(i)}
            />
          ))}
          {!agenda.length && !workouts.length && <Row title="Nada marcado nos próximos 7 dias" />}
        </Section>

        {panel.payments.length > 0 && (
          <Section title="pagamento pendente" count={panel.payments.length}>
            {panel.payments.slice(0, CAP).map(({ item, money: m }) => (
              <Row
                key={item.id}
                title={item.title}
                sub={[statusOf(item), item.paidCents != null && `pago ${money(m.paid, m.currency)}`, item.deadline && `prazo ${formatShortDate(item.deadline)}`].filter(Boolean).join(' · ')}
                right={m.balance != null && m.balance > 0 ? <>saldo {money(m.balance, m.currency)}</> : <span className="text-muted font-normal">valor não informado</span>}
                onOpen={() => openItem(item)}
              />
            ))}
          </Section>
        )}

        {panel.awaiting.length > 0 && (
          <Section title="aguardando fornecedor" count={panel.awaiting.length}>
            {panel.awaiting.slice(0, CAP).map((i) => (
              <Row key={i.id} title={i.title} sub={[i.supplier, i.nextAction, i.deadline && `prazo ${formatShortDate(i.deadline)}`].filter(Boolean).join(' · ') || undefined} onOpen={() => openItem(i)} />
            ))}
          </Section>
        )}

        {panel.deliveries.length > 0 && (
          <Section title="entregas em andamento" count={panel.deliveries.length}>
            {panel.deliveries.slice(0, CAP).map((e) => (
              <Row
                key={e.id}
                title={e.title}
                sub={['comprado', e.delivery?.expected ? `previsão ${formatShortDate(e.delivery.expected)}` : 'sem previsão'].join(' · ')}
                warn={!!e.delivery?.expected && e.delivery.expected < today}
                onOpen={() => openSheet('expense', { id: e.id })}
              />
            ))}
          </Section>
        )}

        <Section title={`gastos · ${cur}`} label="Gastos e saldo">
          <li>
            <dl className="grid grid-cols-3 gap-2 py-1 text-[12px]">
              {(
                [
                  ['pago', panel.finance.paid],
                  ['comprometido', panel.finance.committed],
                  ['estimado', panel.finance.estimated],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-[14px] font-semibold tabular-nums">{money(v)}</dd>
                </div>
              ))}
            </dl>
          </li>
          {panel.wallet ? (
            <Row title={`Saldo disponível: ${money(panel.wallet.cents)}`} sub={[panel.wallet.source, `informado em ${formatShortDate(panel.wallet.asOf)}`].filter(Boolean).join(' · ')} onOpen={() => nav(command)} />
          ) : (
            <Row title="Saldo Wise não informado — atualizar" sub="Toque para informar em Reservas e pagamentos" onOpen={() => nav(command)} />
          )}
        </Section>

        {work.length > 0 && (
          <Section title="trabalho e estudo hoje" count={work.length}>
            {work.slice(0, CAP).map((w) => (
              <Row key={w.key} title={w.title} sub={[w.front.label, w.start].filter(Boolean).join(' · ') || undefined} onOpen={() => openRow(w)} />
            ))}
          </Section>
        )}

        </>
        )}

        {panel.conflicts.length > 0 && (
          <Section title="conflitos" count={panel.conflicts.length}>
            {panel.conflicts.slice(0, CAP).map((c) => (
              <Row key={c.key} title={c.text} sub={dayLabel(c.date, date)} warn onOpen={c.items[0] ? () => openItem(c.items[0]) : undefined} right={<AlertTriangle size={15} aria-hidden />} />
            ))}
          </Section>
        )}
      </div>

      <button type="button" onClick={() => setFull((v) => !v)} aria-expanded={full} className="mt-3 w-full min-h-11 flex items-center justify-between text-[13.5px] text-muted border-t border-line/70 pt-2 active:opacity-70">
        {full ? 'Mostrar só o urgente' : `Ver painel completo${legRest > 0 ? ` · +${legRest} pendências` : ''}`}
        <ChevronDown size={16} aria-hidden className={cn('transition-transform', full && 'rotate-180')} />
      </button>
      {!inTrip && <button type="button" onClick={() => nav(ROUTES.trip(trip.id))} className="w-full min-h-11 flex items-center justify-between text-[13.5px] font-semibold text-ink-2 border-t border-line/70 pt-2 active:opacity-70">
        Abrir centro de comando
        <ChevronRight size={16} aria-hidden />
      </button>}
    </Card>
  )
}
