import { useMemo, useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { actions, useDB } from '@/data/store'
import type { DateKey, Expense, ID, NewItem, PaymentMethod } from '@/data/types'
import {
  ChipSelect,
  DateInput,
  Field,
  MoneyInput,
  MoreOptions,
  Select,
  SheetLayout,
  TextArea,
  TextInput,
  TitleInput,
} from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import {
  CAT_COMPRAS,
  CAT_OUTROS,
  categoriesByUsage,
  lastPaymentMethod,
  PAYMENT_LABEL,
  PAYMENT_METHODS,
} from './selectors'

type PlannedChoice = 'sim' | 'nao'

/** Gasto em < 10 segundos: valor, toque na categoria, salvar. Também edita compras planejadas. */
export default function ExpenseSheet({ id, defaults }: SheetProps<'expense'>) {
  const expenses = useDB((db) => db.expenses)
  const categories = useDB((db) => db.financialCategories)
  const trips = useDB((db) => db.trips)
  const accounts = useDB((db) => db.financialAccounts)
  const today = useToday()

  const existing = useMemo(() => (id ? expenses.find((e) => e.id === id) : undefined), [id, expenses])
  const initial: Partial<Expense> = existing ?? defaults ?? {}
  const isPlannedMode = (existing?.status ?? defaults?.status) === 'planned_purchase'

  const [amount, setAmount] = useState<number | undefined>(initial.amountCents || undefined)
  const [title, setTitle] = useState(initial.title ?? '')
  const [categoryId, setCategoryId] = useState<ID | undefined>(initial.categoryId)
  const [payment, setPayment] = useState<PaymentMethod | undefined>(
    () => initial.payment ?? (existing ? undefined : (lastPaymentMethod(expenses) ?? undefined)),
  )
  const [planned, setPlanned] = useState<PlannedChoice | undefined>(
    initial.planned === true ? 'sim' : initial.planned === false ? 'nao' : undefined,
  )
  const [date, setDate] = useState<DateKey | undefined>(initial.date ?? today)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [tripId, setTripId] = useState<ID | undefined>(initial.tripId)
  const [accountId, setAccountId] = useState<ID | undefined>(initial.accountId)

  const orderedCats = useMemo(() => {
    const list = categoriesByUsage(categories, expenses)
    // keep an archived category visible when editing something that uses it
    const current = categories.find((c) => c.id === categoryId)
    return current && current.archived ? [current, ...list] : list
  }, [categories, expenses, categoryId])

  const [allCats, setAllCats] = useState(false)
  const CAT_PREVIEW = 7
  const shownCats = useMemo(() => {
    if (allCats || orderedCats.length <= CAT_PREVIEW + 1) return orderedCats
    const top = orderedCats.slice(0, CAT_PREVIEW)
    const sel = orderedCats.find((c) => c.id === categoryId)
    return sel && !top.includes(sel) ? [...top.slice(0, CAT_PREVIEW - 1), sel] : top
  }, [allCats, orderedCats, categoryId])
  const hasMoreCats = shownCats.length < orderedCats.length

  const activeAccounts = accounts.filter((a) => !a.archived)
  const tripOptions = useMemo(
    () => [...trips].sort((a, b) => a.order - b.order).map((t) => ({ value: t.id, label: `${t.flag} ${t.name}` })),
    [trips],
  )

  const canSave = isPlannedMode ? title.trim().length > 0 : !!amount && amount > 0

  function fallbackCategory(): ID {
    if (categoryId) return categoryId
    const preferred = isPlannedMode ? CAT_COMPRAS : CAT_OUTROS
    return categories.some((c) => c.id === preferred) ? preferred : (categories.find((c) => !c.archived)?.id ?? CAT_OUTROS)
  }

  function save() {
    if (!canSave) return
    const catId = fallbackCategory()
    const catName = categories.find((c) => c.id === catId)?.name ?? 'Gasto'
    const base = {
      title: title.trim() || catName,
      amountCents: amount ?? 0,
      categoryId: catId,
      notes: notes.trim() || undefined,
      tripId,
    }
    if (isPlannedMode) {
      const data = { ...base, status: 'planned_purchase' as const }
      if (existing) actions.update('expenses', existing.id, data)
      else actions.create('expenses', { ...defaults, ...data, origin: 'manual' } as NewItem<'expenses'>)
      haptic('light')
      toast(existing ? 'Compra atualizada ✓' : 'Na lista ✓')
      closeSheet()
      return
    }
    const data = {
      ...base,
      status: 'paid' as const,
      date: date ?? today,
      payment,
      planned: planned === 'sim' ? true : planned === 'nao' ? false : undefined,
      accountId,
    }
    if (existing) actions.update('expenses', existing.id, data)
    else actions.create('expenses', { ...defaults, ...data, origin: 'manual' } as NewItem<'expenses'>)
    haptic('success')
    toast(existing ? 'Atualizado ✓' : 'Anotado ✓')
    closeSheet()
  }

  function remove() {
    if (!existing) return
    closeSheet()
    removeWithUndo('expenses', existing.id, isPlannedMode ? 'Compra removida' : 'Gasto apagado')
  }

  const categoryGrid = (
    <div>
      <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Categoria</div>
      <div className="grid grid-cols-4 gap-2">
        {shownCats.map((c) => {
          const on = c.id === categoryId
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                haptic('light')
                setCategoryId(on ? undefined : c.id)
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 min-h-[54px] rounded-2xl border px-1 py-1.5 transition active:scale-[0.97]',
                on ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2',
              )}
            >
              <span className="text-[20px] leading-none" aria-hidden>
                {c.emoji}
              </span>
              <span className="text-[11.5px] leading-tight text-center w-full truncate">{c.name}</span>
            </button>
          )
        })}
        {hasMoreCats && (
          <button
            type="button"
            onClick={() => setAllCats(true)}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[54px] rounded-2xl border border-dashed border-line px-1 py-1.5 text-muted active:scale-[0.97] transition"
          >
            <span className="text-[17px] leading-none">⋯</span>
            <span className="text-[11.5px] leading-tight">mais {orderedCats.length - shownCats.length}</span>
          </button>
        )}
      </div>
    </div>
  )

  if (isPlannedMode) {
    return (
      <SheetLayout
        title="Compra planejada"
        eyebrow="lista de compras"
        onClose={closeSheet}
        onDelete={existing ? remove : undefined}
        primary={{ label: existing ? 'Salvar' : 'Adicionar à lista', onClick: save, disabled: !canSave }}
      >
        <TitleInput
          autoFocus={!existing}
          placeholder="O que você quer comprar?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <Field label="Valor estimado" hint="opcional — dá pra preencher na hora de comprar">
          <MoneyInput valueCents={amount} onChange={setAmount} />
        </Field>
        {categoryGrid}
        <MoreOptions>
          <Field label="Observação">
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="link, tamanho, loja..." />
          </Field>
          {tripOptions.length > 0 && (
            <Field label="Viagem">
              <Select value={tripId} onChange={setTripId} options={tripOptions} placeholder="Nenhuma" />
            </Field>
          )}
        </MoreOptions>
      </SheetLayout>
    )
  }

  return (
    <SheetLayout
      title={existing ? 'Editar gasto' : 'Novo gasto'}
      onClose={closeSheet}
      onDelete={existing ? remove : undefined}
      primary={{ label: existing ? 'Salvar' : 'Anotar', onClick: save, disabled: !canSave }}
    >
      <MoneyInput large autoFocus={!existing} valueCents={amount} onChange={setAmount} />
      <TextInput
        placeholder="Nome (opcional) — ex.: padaria"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        enterKeyHint="done"
      />
      {categoryGrid}
      <div>
        <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Forma de pagamento</div>
        <ChipSelect
          value={payment}
          onChange={setPayment}
          clearable
          wrap={false}
          options={PAYMENT_METHODS.map((p) => ({ value: p, label: PAYMENT_LABEL[p] }))}
        />
      </div>
      <div>
        <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">
          Era planejada? <span className="font-normal text-muted">(se quiser)</span>
        </div>
        <ChipSelect
          value={planned}
          onChange={setPlanned}
          clearable
          options={[
            { value: 'sim', label: '🗓️ planejada' },
            { value: 'nao', label: '⚡ do momento' },
          ]}
        />
      </div>
      <MoreOptions>
        <Field label="Data">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Observação">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="algum detalhe?" />
        </Field>
        {tripOptions.length > 0 && (
          <Field label="Viagem">
            <Select value={tripId} onChange={setTripId} options={tripOptions} placeholder="Nenhuma" />
          </Field>
        )}
        {activeAccounts.length > 0 && (
          <Field label="Conta / cartão">
            <Select
              value={accountId}
              onChange={setAccountId}
              options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Nenhuma"
            />
          </Field>
        )}
      </MoreOptions>
    </SheetLayout>
  )
}
