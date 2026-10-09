/**
 * Pagamentos do mês — her recurring payments as a checklist (Aluguel, Cartão C6, Plano de saúde…).
 * A check = paid in this period (month, or this week for the weekly ones). No value is assumed; the due
 * day is optional and hers to set — once set, the payment also shows on Hoje that day.
 */
import { useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { Card, SectionTitle } from '@/components/ui'
import { billPeriod, billRows, type BillRow } from '@/data/finance/bills'
import { actions, getDB, persist, useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'

export function toggleBill(categoryId: string, date: DateKey): boolean | undefined {
  const c = getDB().financialCategories.find((x) => x.id === categoryId)
  if (!c?.bill) return undefined
  const period = billPeriod(c, date)
  const done = actions.toggleOccurrence('bill', c.id, period)
  if (done) {
    const occ = getDB().occurrences.find((o) => o.parentType === 'bill' && o.parentId === c.id && o.date === period)
    if (occ) actions.update('occurrences', occ.id, { completedAt: nowISO() })
  }
  haptic(done ? 'success' : 'light')
  void persist()
  toast(done ? `${c.name}: pago ✓` : `${c.name}: desmarcado`, {
    action: {
      label: 'Desfazer',
      run: () => {
        actions.toggleOccurrence('bill', c.id, period)
        void persist()
      },
    },
  })
  return done
}

function setDueDay(categoryId: string, day: number | undefined) {
  const c = getDB().financialCategories.find((x) => x.id === categoryId)
  if (!c?.bill) return
  actions.update('financialCategories', c.id, { bill: { ...c.bill, dueDay: day } })
  void persist()
}

function BillLine({ row, today }: { row: BillRow; today: DateKey }) {
  const c = row.category
  const weekly = c.bill.every === 'semana'
  const sub = weekly ? 'semanal · esta semana' : row.dueDate ? `${row.overdue ? 'venceu' : 'vence'} dia ${Number(row.dueDate.slice(8))}` : undefined
  return (
    <div className="flex items-center gap-1 pl-2 pr-3 min-h-[52px]">
      <button
        type="button"
        aria-label={row.paid ? `Desmarcar ${c.name}` : `Paguei: ${c.name}`}
        aria-pressed={row.paid}
        onClick={() => toggleBill(c.id, today)}
        className="h-11 w-10 shrink-0 inline-flex items-center justify-center active:scale-90 transition"
      >
        <span className={cn('h-[22px] w-[22px] rounded-full border-[1.5px] inline-flex items-center justify-center transition-colors', row.paid ? 'bg-sage border-sage text-bg' : 'border-ink/30')}>
          {row.paid && <Check size={13} strokeWidth={3} />}
        </span>
      </button>
      <span className="w-6 text-center shrink-0" aria-hidden>
        {c.emoji}
      </span>
      <div className="min-w-0 flex-1 py-2">
        <div className={cn('text-[15px] leading-snug truncate', row.paid && 'line-through text-muted')}>{c.name}</div>
        {sub && <div className={cn('text-[12.5px]', row.overdue ? 'text-accent' : 'text-muted')}>{sub}</div>}
      </div>
      {!weekly && (
        <select
          aria-label={`Dia de vencimento de ${c.name}`}
          value={c.bill.dueDay ?? ''}
          onChange={(e) => setDueDay(c.id, e.target.value ? Number(e.target.value) : undefined)}
          className="h-9 rounded-full bg-surface-2 px-3 text-[13px] text-ink-2 shrink-0 appearance-none text-center"
        >
          <option value="">dia</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              dia {d}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function BillsSection({ today }: { today: DateKey }) {
  const categories = useDB((db) => db.financialCategories)
  const occurrences = useDB((db) => db.occurrences)
  const rows = useMemo(() => billRows(getDB(), today), [categories, occurrences, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const [showPaid, setShowPaid] = useState(false)
  if (!rows.length) return null
  const open = rows.filter((r) => !r.paid)
  const paid = rows.filter((r) => r.paid)
  return (
    <>
      <SectionTitle>Pagamentos do mês</SectionTitle>
      <Card className="p-0 overflow-hidden">
        <div className="px-4 pt-3 pb-2 text-[13px] text-muted">
          {paid.length} de {rows.length} pagos{open.length ? '' : ' — tudo em dia ✨'} · sem valores, só o check
        </div>
        <div className="divide-y divide-line/70">
          {open.map((r) => (
            <BillLine key={r.category.id} row={r} today={today} />
          ))}
        </div>
        {paid.length > 0 && (
          <>
            <button type="button" onClick={() => setShowPaid((v) => !v)} aria-expanded={showPaid} className="w-full flex items-center justify-between px-4 h-11 border-t border-line/70 text-[13.5px] text-ink-2">
              <span>Pagos · {paid.length}</span>
              <ChevronDown size={16} className={cn('transition-transform', showPaid && 'rotate-180')} />
            </button>
            {showPaid && (
              <div className="divide-y divide-line/70 border-t border-line/70">
                {paid.map((r) => (
                  <BillLine key={r.category.id} row={r} today={today} />
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </>
  )
}
