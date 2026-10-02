import { useMemo } from 'react'
import { toast } from '@/app/ui-store'
import { actions } from '@/data/store'
import type { Expense, FinancialCategory } from '@/data/types'
import { Button, Card, SectionTitle } from '@/components/ui'
import { formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { formatBRL } from '@/lib/money'
import { duplicatePairs, type DuplicatePair } from './selectors'
import { CatBadge } from './parts'

function notDuplicates(p: DuplicatePair) {
  actions.update('expenses', p.flagged.id, { possibleDuplicateOf: undefined })
  haptic('light')
  toast('Combinado, ficam as duas ✓')
}

function sameExpense(p: DuplicatePair) {
  const keepFlag = p.keep.possibleDuplicateOf
  if (keepFlag) actions.update('expenses', p.keep.id, { possibleDuplicateOf: undefined })
  const removed = actions.remove('expenses', p.drop.id)
  haptic('light')
  toast('Ficou só uma ✓', {
    action: {
      label: 'Desfazer',
      run: () => {
        if (removed) actions.restore('expenses', removed)
        if (keepFlag) actions.update('expenses', p.keep.id, { possibleDuplicateOf: keepFlag })
      },
    },
  })
}

function Mini({ e, category, label }: { e: Expense; category?: FinancialCategory; label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <CatBadge category={category} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] truncate">{e.title}</div>
        <div className="text-[12px] text-muted truncate">
          {label}
          {e.date ? ` · ${formatShortDate(e.date)}` : ''}
        </div>
      </div>
      <div className="font-display text-[15px] tabular-nums">{formatBRL(e.amountCents)}</div>
    </div>
  )
}

/** "Parece a mesma compra?" — flagged by the Organizze sync. Marina always decides. */
export function DuplicatesSection({ expenses, categories }: { expenses: Expense[]; categories: FinancialCategory[] }) {
  const pairs = useMemo(() => duplicatePairs(expenses), [expenses])
  if (!pairs.length) return null
  const catOf = (e: Expense) => categories.find((c) => c.id === e.categoryId)
  const label = (e: Expense) => (e.origin === 'organizze' ? 'do Organizze' : 'anotado por você')
  return (
    <>
      <SectionTitle>Parece a mesma compra?</SectionTitle>
      <div className="space-y-3">
        {pairs.map((p) => (
          <Card key={p.flagged.id}>
            <p className="text-[13.5px] text-ink-2 mb-1">Essas duas parecem iguais. Você decide:</p>
            <div className="divide-y divide-line/70">
              <Mini e={p.drop} category={catOf(p.drop)} label={label(p.drop)} />
              <Mini e={p.keep} category={catOf(p.keep)} label={label(p.keep)} />
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" className="flex-1 h-11" onClick={() => notDuplicates(p)}>
                São diferentes
              </Button>
              <Button variant="primary" size="sm" className="flex-1 h-11" onClick={() => sameExpense(p)}>
                É a mesma
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
