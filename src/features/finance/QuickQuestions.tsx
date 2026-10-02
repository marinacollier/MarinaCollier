import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { DateKey, Expense, FinancialCategory, Trip } from '@/data/types'
import { Card, Chip, SectionTitle } from '@/components/ui'
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from '@/lib/date'
import { formatBRL } from '@/lib/money'
import { categoryBreakdown, paidBetween, sportSpend, total, tripSpend } from './selectors'

type Q = 'semana' | 'esporte' | 'viagem'

const QUESTIONS: { id: Q; label: string }[] = [
  { id: 'semana', label: 'Onde meu dinheiro foi essa semana?' },
  { id: 'esporte', label: 'Quanto gastei em esporte?' },
  { id: 'viagem', label: 'Quanto gastei com viagem?' },
]

function Line({ left, right, muted }: { left: React.ReactNode; right: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${muted ? 'text-muted' : ''}`}>
      <span className="min-w-0 truncate text-[14.5px]">{left}</span>
      <span className="font-display text-[16px] tabular-nums shrink-0">{right}</span>
    </div>
  )
}

export function QuickQuestions({
  expenses,
  categories,
  trips,
  today,
}: {
  expenses: Expense[]
  categories: FinancialCategory[]
  trips: Trip[]
  today: DateKey
}) {
  const [q, setQ] = useState<Q | undefined>()

  const answer = useMemo(() => {
    if (q === 'semana') {
      const list = paidBetween(expenses, startOfWeek(today), endOfWeek(today))
      const rows = categoryBreakdown(list, categories).slice(0, 4)
      const sum = total(list)
      if (!sum) return <p className="text-[14.5px] text-ink-2">Nenhum gasto anotado nessa semana ainda. Semana leve ✨</p>
      return (
        <>
          <p className="text-[14.5px] text-ink-2 mb-2">
            {formatBRL(sum)} na semana. A maior parte foi pra <strong className="font-semibold">{rows[0].category?.name ?? 'outros'}</strong>.
          </p>
          {rows.map((r) => (
            <Line key={r.categoryId} left={`${r.category?.emoji ?? '•'} ${r.category?.name ?? 'Sem categoria'}`} right={formatBRL(r.cents)} />
          ))}
        </>
      )
    }
    if (q === 'esporte') {
      const month = sportSpend(expenses, categories, { from: startOfMonth(today), to: endOfMonth(today) })
      const year = sportSpend(expenses, categories, { from: today.slice(0, 4) + '-01-01', to: today.slice(0, 4) + '-12-31' })
      if (!year) return <p className="text-[14.5px] text-ink-2">Nada anotado na categoria Esporte esse ano. Quando tiver inscrição, tênis ou bike, aparece aqui 🏃‍♀️</p>
      return (
        <>
          <Line left="🏃‍♀️ Este mês" right={formatBRL(month)} />
          <Line left={`No ano de ${today.slice(0, 4)}`} right={formatBRL(year)} muted />
        </>
      )
    }
    if (q === 'viagem') {
      const r = tripSpend(expenses, trips, categories)
      if (!r.byTrip.length && !r.unlinked.cents)
        return <p className="text-[14.5px] text-ink-2">Ainda não há gastos ligados a viagens. Dica: no gasto, em “mais opções”, dá pra escolher a viagem ✈️</p>
      return (
        <>
          {r.byTrip.map((t, i) => (
            <Line key={t.trip?.id ?? i} left={t.trip ? `${t.trip.flag} ${t.trip.name}` : '✈️ Outra viagem'} right={formatBRL(t.cents)} />
          ))}
          {r.unlinked.cents > 0 && <Line left="✈️ Categoria Viagem, sem viagem ligada" right={formatBRL(r.unlinked.cents)} muted />}
        </>
      )
    }
    return null
  }, [q, expenses, categories, trips, today])

  return (
    <>
      <SectionTitle>Perguntas rápidas</SectionTitle>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
        {QUESTIONS.map((x) => (
          <Chip key={x.id} selected={q === x.id} onClick={() => setQ(q === x.id ? undefined : x.id)}>
            {x.label}
          </Chip>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {q && (
          <motion.div key={q} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="mt-3">
            <Card>{answer}</Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
