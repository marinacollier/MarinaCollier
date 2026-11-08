/**
 * Viagem · <trip>: the month's trip statement lines in their own currency (ZAR). Kept apart from the BRL
 * totals above — a BRL equivalent only with a documented conversion, and it is never added to them.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Card, SectionTitle } from '@/components/ui'
import { useDB } from '@/data/store'
import { formatBRL } from '@/lib/money'
import { CATEGORY_META } from '@/features/travel/expedition/command'
import { formatMoney } from '@/features/travel/expedition/logic'
import { fxRateLabel, tripMonthSpend } from './trip-month'

export function TripMonthSection({ today }: { today: string }) {
  const trips = useDB((db) => db.trips)
  const expenses = useDB((db) => db.expenses)
  const places = useDB((db) => db.places)
  const rows = useMemo(() => tripMonthSpend(trips, expenses, today, places), [trips, expenses, today, places])
  if (!rows.length) return null

  return (
    <>
      {rows.map((r) => (
        <section key={r.trip.id} aria-label={`Viagem · ${r.label}`}>
          <SectionTitle
            action={
              <Link to={ROUTES.trip(r.trip.id)} className="h-9 inline-flex items-center text-[13px] text-accent">
                ver viagem
              </Link>
            }
          >
            Viagem · {r.label}
          </SectionTitle>
          <Card className="p-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="eyebrow">Gasto no mês · {r.currency}</div>
                <div className="font-display text-[26px] leading-tight tabular-nums mt-0.5">{formatMoney(r.cents, r.currency)}</div>
              </div>
              <div className="text-right text-[12.5px] text-muted shrink-0">
                {r.count} {r.count === 1 ? 'lançamento' : 'lançamentos'}
              </div>
            </div>
            {r.brl ? (
              <p className="text-[13px] text-ink-2 mt-1.5">
                ≈ {formatBRL(r.brl.cents)} <span className="text-muted">· {fxRateLabel(r.brl.rate)}</span>
              </p>
            ) : (
              <p className="text-[12.5px] text-muted mt-1.5">Sem conversão documentada — o valor em reais não é estimado.</p>
            )}
            <ul className="mt-3 pt-3 border-t border-line/70 space-y-1.5">
              {r.byCategory.map((c) => (
                <li key={c.category} className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="text-ink-2 truncate">
                    {CATEGORY_META[c.category].label}
                    <span className="text-muted text-[12px]"> · {c.count}</span>
                  </span>
                  <span className="tabular-nums shrink-0">{formatMoney(c.cents, r.currency)}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-muted mt-3">Em {r.currency}, fora dos totais em reais acima — sem contagem dupla.</p>
          </Card>
        </section>
      ))}
    </>
  )
}
