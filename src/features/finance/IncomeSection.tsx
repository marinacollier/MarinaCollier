/**
 * Recebimentos do mês — gross billing from contracts + extras. Previsto / recebido / atrasado / cancelado.
 * Never net, never taxes; nothing turns "recebido" on its own.
 */
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import { monthIncome, type ReceivableStatus } from '@/data/finance/receivables'
import { Card, SectionTitle } from '@/components/ui'
import { addDays, monthKey } from '@/lib/date'
import { formatBRL } from '@/lib/money'
import { cn } from '@/lib/cn'

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const monthLabel = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1]

export const STATUS_LABEL: Record<ReceivableStatus, string> = { expected: 'previsto', received: 'recebido', overdue: 'atrasado', cancelled: 'cancelado' }
const STATUS_TONE: Record<ReceivableStatus, string> = {
  expected: 'bg-surface-2 text-ink-2',
  received: 'bg-sage-soft text-sage',
  overdue: 'bg-sand-soft text-sand',
  cancelled: 'bg-surface-2 text-muted line-through',
}

const shift = (period: string, n: number) => monthKey(addDays(`${period}-15`, n * 30))

export function IncomeSection({ today }: { today: string }) {
  const db = useDB()
  const contracts = db.contracts
  const [period, setPeriod] = useState(monthKey(today))
  const month = useMemo(() => monthIncome(db, period, today), [db, period, today])
  if (!contracts.length && !month.items.length) return null

  return (
    <section aria-label="Recebimentos">
      <SectionTitle
        action={
          <button type="button" onClick={() => openSheet('receivable', { extra: true, date: period === monthKey(today) ? today : `${period}-01` })} className="h-9 inline-flex items-center gap-1 text-[13px] text-accent">
            <Plus size={15} /> receita extra
          </button>
        }
      >
        Recebimentos
      </SectionTitle>
      <Card className="p-4">
        <div className="flex items-center justify-between -mx-1">
          <button type="button" aria-label="Mês anterior" onClick={() => setPeriod(shift(period, -1))} className="h-10 w-10 inline-flex items-center justify-center text-muted">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <div className="font-display text-[19px] first-letter:uppercase">{monthLabel(period)}</div>
            <div className="text-[12px] text-muted">faturamento bruto · antes de impostos</div>
          </div>
          <button type="button" aria-label="Próximo mês" onClick={() => setPeriod(shift(period, 1))} className="h-10 w-10 inline-flex items-center justify-center text-muted">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <div className="eyebrow">Previsto no mês</div>
            <div className="font-display text-[22px] tabular-nums mt-0.5">{formatBRL(month.grossCents)}</div>
          </div>
          <div>
            <div className="eyebrow">Recebido</div>
            <div className="font-display text-[22px] tabular-nums mt-0.5">{formatBRL(month.receivedCents)}</div>
          </div>
        </div>
        {month.overdueCents > 0 && <p className="mt-2 text-[13px] text-sand">Atrasado: {formatBRL(month.overdueCents)} — marca quando cair.</p>}

        <ul className="mt-3 divide-y divide-line/70">
          {month.items.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => openSheet('receivable', { id: e.id })} className="w-full flex items-center gap-3 py-3 text-left active:opacity-70">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] truncate">{e.title}</div>
                  <div className="text-[12.5px] text-muted">
                    {e.effective === 'received' && e.receivedAt
                      ? `recebido ${e.receivedAt.slice(8, 10)}/${e.receivedAt.slice(5, 7)}`
                      : `dia ${(e.expectedDate ?? e.date ?? '').slice(8, 10)}`}
                    {!e.contractId ? ' · extra' : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[15px] tabular-nums">{formatBRL(e.effective === 'received' ? (e.receivedAmountCents ?? e.amountCents) : (e.expectedAmountCents ?? e.amountCents))}</div>
                  <span className={cn('inline-flex h-5 px-2 rounded-full text-[11.5px] items-center', STATUS_TONE[e.effective])}>{STATUS_LABEL[e.effective]}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {contracts.length > 0 && (
          <div className="mt-2 pt-3 border-t border-line/70">
            <div className="eyebrow mb-1">Contratos</div>
            {contracts.map((c) => (
              <button key={c.id} type="button" onClick={() => openSheet('contract', { id: c.id })} className="w-full flex items-center justify-between gap-3 py-2 text-left active:opacity-70">
                <span className="text-[14px] truncate">{c.client}</span>
                <span className="text-[12.5px] text-muted shrink-0">
                  {formatBRL(c.amountCents)}/mês · dia {c.paymentDay}
                  {c.status !== 'ativo' ? ` · ${c.status}` : ''}
                </span>
              </button>
            ))}
            <button type="button" onClick={() => openSheet('contract', {})} className="mt-1 h-10 inline-flex items-center gap-1 text-[13px] text-accent">
              <Plus size={15} /> novo contrato
            </button>
          </div>
        )}
      </Card>
    </section>
  )
}
