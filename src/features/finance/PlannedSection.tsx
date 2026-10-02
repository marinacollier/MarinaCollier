import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { actions } from '@/data/store'
import type { DateKey, Expense, FinancialCategory, ID } from '@/data/types'
import { Button, Card, EmptyState, MoneyInput, SectionTitle, SwipeRow } from '@/components/ui'
import { haptic } from '@/lib/haptics'
import { formatBRL } from '@/lib/money'
import { plannedPurchases } from './selectors'
import { ExpenseLine } from './parts'

function markBought(e: Expense, today: DateKey, amountCents: number) {
  const before = { status: e.status, date: e.date, planned: e.planned, amountCents: e.amountCents }
  actions.update('expenses', e.id, { status: 'paid', date: today, planned: true, amountCents })
  haptic('success')
  toast('Comprado ✓ foi pro histórico como planejada', {
    action: { label: 'Desfazer', run: () => actions.update('expenses', e.id, before) },
  })
}

export function PlannedSection({ expenses, categories, today }: { expenses: Expense[]; categories: FinancialCategory[]; today: DateKey }) {
  const list = useMemo(() => plannedPurchases(expenses), [expenses])
  const [asking, setAsking] = useState<ID | undefined>()
  const [amount, setAmount] = useState<number | undefined>()
  const estimated = list.reduce((s, e) => s + e.amountCents, 0)
  const add = () => openSheet('expense', { defaults: { status: 'planned_purchase' } })

  return (
    <>
      <SectionTitle
        action={
          <button type="button" onClick={add} className="text-[13px] text-accent font-medium h-8 px-1">
            + adicionar
          </button>
        }
      >
        Compras planejadas
      </SectionTitle>
      {list.length === 0 ? (
        <Card>
          <EmptyState
            compact
            emoji="🛍️"
            title="Lista vazia, cabeça leve"
            text="Quando surgir algo que você quer comprar, anota aqui e decide com calma."
            action={
              <Button variant="soft" size="sm" onClick={add}>
                + compra planejada
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="card overflow-hidden divide-y divide-line/70">
            {list.map((e) => {
              const cat = categories.find((c) => c.id === e.categoryId)
              const open = asking === e.id
              return (
                <div key={e.id}>
                  <SwipeRow className="rounded-none" onDelete={() => removeWithUndo('expenses', e.id, 'Saiu da lista')}>
                    <ExpenseLine
                      expense={e}
                      category={cat}
                      subtitle={e.amountCents ? `cerca de ${formatBRL(e.amountCents)}` : (cat?.name ?? 'sem valor ainda')}
                      onPress={() => openSheet('expense', { id: e.id })}
                      trailing={
                        <button
                          type="button"
                          onClick={() => {
                            if (e.amountCents > 0) markBought(e, today, e.amountCents)
                            else {
                              setAmount(undefined)
                              setAsking(open ? undefined : e.id)
                            }
                          }}
                          className="shrink-0 inline-flex items-center h-10 px-3.5 rounded-full bg-sage-soft text-sage text-[13px] font-medium active:scale-95 transition"
                        >
                          comprei ✓
                        </button>
                      }
                    />
                  </SwipeRow>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-3 pt-1 bg-surface">
                          <div className="text-[13px] text-ink-2 mb-1.5">Quanto ficou?</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <MoneyInput valueCents={amount} onChange={setAmount} autoFocus />
                            </div>
                            <Button
                              className="shrink-0"
                              variant="primary"
                              disabled={!amount}
                              onClick={() => {
                                if (!amount) return
                                markBought(e, today, amount)
                                setAsking(undefined)
                              }}
                            >
                              Pronto
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
          {estimated > 0 && (
            <p className="text-[12.5px] text-muted px-1 mt-2">
              estimativa da lista: {formatBRL(estimated)}
            </p>
          )}
        </>
      )}
    </>
  )
}
