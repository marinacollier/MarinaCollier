/**
 * The booking at a glance, on top of the item sheet: operator, when, where, reference, total · paid · balance,
 * confirmation and payment status, transport, cancellation, next action, last update and the source.
 * Read-only, from what is stored; what is missing reads "não informado" (never guessed).
 */
import type { Trip, TripItem } from '@/data/types'
import { cn } from '@/lib/cn'
import { formatShortDate } from '@/lib/date'
import { PAYMENT_META } from '../selectors'
import { BOOKING_STATUS_META, bookingStatusOf } from './command'
import { formatMoney } from './logic'
import { itemMoney } from './panel'

const updatedLabel = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d)
}

export function BookingDetails({ trip, item }: { trip: Trip; item: TripItem }) {
  const m = itemMoney(item, trip.expedition?.currency ?? 'BRL')
  const money = (c?: number) => (c == null ? undefined : formatMoney(c, m.currency))
  const s = bookingStatusOf(item)
  const when = item.date
    ? `${formatShortDate(item.date)}${item.endDate && item.endDate !== item.date ? `–${formatShortDate(item.endDate)}` : ''}${item.time ? ` · ${item.time}` : ''}${item.endTime ? `–${item.endTime}` : ''}`
    : undefined
  const rows: [string, string | undefined, boolean?][] = [
    ['Operador', item.supplier],
    ['Data/hora', when],
    ['Local', item.address ?? item.group],
    ['Referência', item.confirmationCode],
    ['Valor total', money(m.total)],
    ['Valor pago', item.paidCents != null ? money(m.paid) : undefined],
    ['Saldo', m.balance != null ? money(m.balance) : undefined, (m.balance ?? 0) > 0],
    ['Status de confirmação', BOOKING_STATUS_META[s].label],
    ['Status de pagamento', item.paymentStatus ? PAYMENT_META[item.paymentStatus].label : undefined],
    ['Transporte', item.route ?? item.pickup],
    ['Cancelamento', item.cancellationPolicy],
    ['Próxima ação', item.nextAction],
    ['Última atualização', updatedLabel(item.updatedAt)],
    ['Fonte', item.source],
  ]
  return (
    <section aria-label="Resumo da reserva" className="rounded-2xl bg-surface-2/70 px-3.5 py-3">
      <div className="eyebrow mb-2">resumo da reserva</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {rows.map(([k, v, warn]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className={cn('min-w-0 break-words', v ? 'text-ink' : 'text-muted italic', warn && 'font-semibold text-[color-mix(in_oklab,var(--accent)_72%,var(--ink))]')}>{v ?? 'não informado'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
