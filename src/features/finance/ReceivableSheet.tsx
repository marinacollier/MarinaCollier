/** One month's receivable (or an extra income): recebi · ainda não · cancelar este mês · ajustar valor/data. */
import { useMemo, useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { useDB } from '@/data/store'
import { addExtraIncome, cancelReceivable, markExpected, markReceived, receivableStatus, receivablesFor, updateReceivable } from '@/data/finance/receivables'
import { Button, DateInput, Field, MoneyInput, SheetLayout, TextArea, TitleInput } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { monthKey } from '@/lib/date'
import { formatBRL } from '@/lib/money'
import { haptic } from '@/lib/haptics'
import { STATUS_LABEL, monthLabel } from './IncomeSection'

export default function ReceivableSheet({ id, extra, date }: SheetProps<'receivable'>) {
  const db = useDB()
  const today = useToday()
  const rec = useMemo(() => {
    if (!id) return undefined
    const stored = db.expenses.find((e) => e.id === id)
    if (stored) return stored
    const period = /-(\d{4}-\d{2})$/.exec(id)?.[1]
    return period ? receivablesFor(db, period).find((e) => e.id === id) : undefined
  }, [db, id])

  const [title, setTitle] = useState(rec?.title ?? '')
  const [amount, setAmount] = useState<number | undefined>(rec ? (rec.status === 'received' ? rec.receivedAmountCents : rec.expectedAmountCents) ?? rec.amountCents : undefined)
  // Receiving defaults to today (never a future date); a received one shows when it actually came in.
  const [when, setWhen] = useState<string | undefined>(rec ? (rec.status === 'received' ? rec.receivedAt?.slice(0, 10) : today) : (date ?? today))
  const [notes, setNotes] = useState(rec?.notes ?? '')

  const done = (msg: string, undo: () => void) => {
    haptic('success')
    toast(msg, { action: { label: 'Desfazer', run: undo } })
    closeSheet()
  }

  // New extra income.
  if (!rec || extra) {
    return (
      <SheetLayout
        title="Receita extra"
        eyebrow="fora dos contratos"
        onClose={closeSheet}
        primary={{
          label: 'Salvar',
          disabled: !title.trim() || !amount || !when,
          onClick: () => {
            const received = (when ?? today) <= today
            const { undo } = addExtraIncome({ title: title.trim(), amountCents: amount!, date: when ?? today, received, notes: notes || undefined })
            done(received ? 'Receita anotada como recebida ✓' : 'Receita anotada como prevista ✓', undo)
          },
        }}
      >
        <TitleInput autoFocus placeholder="De onde veio? (projeto, freela…)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Field label="Valor bruto">
          <MoneyInput valueCents={amount} onChange={setAmount} />
        </Field>
        <Field label="Data" hint="até hoje = recebida · depois de hoje = prevista">
          <DateInput value={when} onChange={setWhen} />
        </Field>
        <Field label="Observação">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </SheetLayout>
    )
  }

  const status = receivableStatus(rec, today)
  const isReceived = rec.status === 'received'
  return (
    <SheetLayout
      title={rec.title}
      eyebrow={`${monthLabel(rec.period ?? monthKey(rec.expectedDate ?? today))} · ${STATUS_LABEL[status]}`}
      onClose={closeSheet}
      primary={
        isReceived
          ? { label: 'Salvar', onClick: () => done('Ajustado ✓', updateReceivable(rec.id, { receivedAmountCents: amount, receivedAt: when ? `${when}T12:00:00.000-03:00` : rec.receivedAt, notes: notes || undefined })) }
          : { label: `Recebi ${amount ? formatBRL(amount) : ''}`.trim(), disabled: !amount, onClick: () => done(`${rec.title} recebido ✓`, markReceived(rec.id, { amountCents: amount, at: when && when !== today ? `${when}T12:00:00.000-03:00` : undefined })) }
      }
    >
      <p className="text-[13px] text-muted -mt-1">Faturamento bruto, antes de impostos. Nada é marcado como recebido sozinho.</p>
      <Field label={isReceived ? 'Valor recebido' : 'Valor previsto deste mês'} hint={isReceived ? undefined : 'mudar aqui vale só pra este mês'}>
        <MoneyInput valueCents={amount} onChange={setAmount} />
      </Field>
      <Field label={isReceived ? 'Recebido em' : 'Recebi em'} hint={isReceived ? undefined : `previsto: dia ${(rec.expectedDate ?? '').slice(8, 10)}`}>
        <DateInput value={when} onChange={setWhen} />
      </Field>
      <Field label="Observação">
        <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        {!isReceived && amount !== (rec.expectedAmountCents ?? rec.amountCents) && (
          <Button variant="soft" onClick={() => done('Valor do mês ajustado ✓', updateReceivable(rec.id, { expectedAmountCents: amount, notes: notes || undefined }))}>
            Só ajustar o previsto
          </Button>
        )}
        {isReceived && (
          <Button variant="soft" onClick={() => done('Voltou pra previsto', markExpected(rec.id))}>
            Ainda não caiu
          </Button>
        )}
        {rec.status !== 'cancelled' && (
          <Button variant="ghost" onClick={() => done('Cancelado este mês', cancelReceivable(rec.id))}>
            Cancelar este mês
          </Button>
        )}
        {rec.status === 'cancelled' && (
          <Button variant="soft" onClick={() => done('Voltou pra previsto', markExpected(rec.id))}>
            Reativar
          </Button>
        )}
      </div>
    </SheetLayout>
  )
}
