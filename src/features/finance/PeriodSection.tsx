import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { DateKey, Expense, FinancialCategory } from '@/data/types'
import { Button, Card, EmptyState, IconButton, Segmented, SectionTitle, SwipeRow, tone } from '@/components/ui'
import { endOfMonth, relativeDay, startOfMonth } from '@/lib/date'
import { formatBRL, formatBRLShort } from '@/lib/money'
import { cn } from '@/lib/cn'
import {
  budgetText,
  categoryBreakdown,
  comparePeriods,
  comparisonText,
  groupByDay,
  isCurrentPeriod,
  paidBetween,
  periodLabel,
  periodRange,
  plannedSplit,
  plannedText,
  shiftPeriod,
  type PeriodKind,
} from './selectors'
import { ExpenseLine } from './parts'

const RECENT_LIMIT = 25

export function PeriodSection({ expenses, categories, today }: { expenses: Expense[]; categories: FinancialCategory[]; today: DateKey }) {
  const [kind, setKind] = useState<PeriodKind>('week')
  const [anchor, setAnchor] = useState<DateKey>(today)
  const [allCats, setAllCats] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const range = periodRange(kind, anchor)
  const isCurrent = isCurrentPeriod(kind, anchor, today)
  const inPeriod = useMemo(() => paidBetween(expenses, range.from, range.to), [expenses, range.from, range.to])
  const periodTotal = inPeriod.reduce((s, e) => s + e.amountCents, 0)
  const comparison = useMemo(() => comparisonText(comparePeriods(expenses, kind, anchor, today)), [expenses, kind, anchor, today])
  const breakdown = useMemo(() => categoryBreakdown(inPeriod, categories), [inPeriod, categories])
  const split = useMemo(() => plannedText(plannedSplit(inPeriod)), [inPeriod])
  const days = useMemo(() => groupByDay(showAll ? inPeriod : inPeriod.slice(0, RECENT_LIMIT)), [inPeriod, showAll])

  // Budgets are monthly: use the month the period ends in (or today's month while it is running).
  const budgetMonth = isCurrent ? today : range.to
  const monthSpend = useMemo(() => {
    const from = startOfMonth(budgetMonth)
    const to = endOfMonth(budgetMonth)
    const map = new Map<string, number>()
    for (const e of paidBetween(expenses, from, to)) map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amountCents)
    return map
  }, [expenses, budgetMonth])

  const hasAny = useMemo(() => expenses.some((e) => e.status === 'paid'), [expenses])
  const max = breakdown[0]?.cents ?? 0
  const visibleCats = allCats ? breakdown : breakdown.slice(0, 5)
  const canGoNext = !isCurrent && range.from <= today

  if (!hasAny) return null

  return (
    <>
      <SectionTitle>Por período</SectionTitle>
      <Card>
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k)
            setAnchor(today)
            setShowAll(false)
          }}
          options={[
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
          ]}
        />
        <div className="flex items-center justify-between mt-3 -mx-2">
          <IconButton label="Período anterior" onClick={() => setAnchor((a) => shiftPeriod(kind, a, -1))}>
            <ChevronLeft size={20} />
          </IconButton>
          <div className="text-center min-w-0">
            <div className="text-[13px] text-muted">{periodLabel(kind, anchor, today)}</div>
            <motion.div key={`${kind}-${range.from}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-display text-[30px] leading-tight tabular-nums">
              {formatBRL(periodTotal)}
            </motion.div>
          </div>
          <IconButton label="Próximo período" onClick={() => setAnchor((a) => shiftPeriod(kind, a, 1))} disabled={!canGoNext} className={cn(!canGoNext && 'opacity-30')}>
            <ChevronRight size={20} />
          </IconButton>
        </div>
        {((comparison && !isCurrent) || split) && (
          <div className="mt-2 space-y-1 text-center text-[13.5px] text-ink-2">
            {comparison && !isCurrent && <p>{comparison}</p>}
            {split && <p className="text-muted">{split}</p>}
          </div>
        )}
      </Card>

      <SectionTitle
        action={
          breakdown.length > 5 ? (
            <button type="button" className="text-[13px] text-muted h-8" onClick={() => setAllCats((v) => !v)}>
              {allCats ? 'menos' : `ver todas (${breakdown.length})`}
            </button>
          ) : undefined
        }
      >
        Principais categorias
      </SectionTitle>
      <Card>
        {breakdown.length === 0 ? (
          <EmptyState compact emoji="🌾" title="Nada por aqui ainda" text="Quando você anotar gastos, as categorias aparecem aqui." />
        ) : (
          <ul className="space-y-4">
            {visibleCats.map((row, i) => {
              const cat = row.category
              const t = tone(cat?.tone)
              const budget = cat?.budgetCents
              const spentMonth = monthSpend.get(row.categoryId) ?? 0
              const fill = budget ? Math.min(1, spentMonth / budget) : max ? row.cents / max : 0
              const note = cat ? budgetText(cat, spentMonth) : undefined
              return (
                <li key={row.categoryId}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[17px] w-6 text-center" aria-hidden>
                      {cat?.emoji ?? '•'}
                    </span>
                    <span className="flex-1 min-w-0 text-[15px] truncate">{cat?.name ?? 'Sem categoria'}</span>
                    <span className="font-display text-[16px] tabular-nums">{formatBRL(row.cents)}</span>
                  </div>
                  <div className={cn('ml-[34px] mt-1.5 rounded-full bg-surface-2 overflow-hidden', budget ? 'h-[3px]' : 'h-2')}>
                    <motion.div
                      className={cn('h-full rounded-full', t.dot)}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(fill * 100, 2)}%` }}
                      transition={{ duration: 0.6, delay: i * 0.04, ease: 'easeOut' }}
                    />
                  </div>
                  {note && <div className="ml-[34px] mt-1 text-[12.5px] text-muted">{note}</div>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <SectionTitle>Compras recentes</SectionTitle>
      {days.length === 0 ? (
        <Card>
          <EmptyState
            compact
            emoji="✨"
            title={isCurrent && kind === 'week' ? 'Semana leve até aqui' : 'Nenhum gasto nesse período'}
            text="Anotou algo? Leva menos de 10 segundos."
            action={
              <Button variant="soft" size="sm" onClick={() => openSheet('expense')}>
                + anotar gasto
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d.date}>
              <div className="flex items-baseline justify-between px-1 mb-1.5">
                <span className="text-[13px] font-medium text-ink-2 first-letter:uppercase">{relativeDay(d.date, today)}</span>
                <span className="text-[12.5px] text-muted tabular-nums">{formatBRLShort(d.cents)}</span>
              </div>
              <div className="card overflow-hidden divide-y divide-line/70">
                {d.items.map((e) => (
                  <SwipeRow key={e.id} className="rounded-none" onDelete={() => removeWithUndo('expenses', e.id, 'Gasto apagado')}>
                    <ExpenseLine expense={e} category={categories.find((c) => c.id === e.categoryId)} onPress={() => openSheet('expense', { id: e.id })} />
                  </SwipeRow>
                ))}
              </div>
            </div>
          ))}
          {!showAll && inPeriod.length > RECENT_LIMIT && (
            <Button variant="ghost" size="sm" block onClick={() => setShowAll(true)}>
              ver todos ({inPeriod.length})
            </Button>
          )}
          <p className="text-center text-[12px] text-muted">arraste pra esquerda pra apagar · toque pra editar</p>
        </div>
      )}
    </>
  )
}
