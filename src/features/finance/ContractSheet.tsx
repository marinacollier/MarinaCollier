/** Recurring contract: client, gross monthly value, payment day, status. Edits flow into months still "previsto". */
import { useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { actions, getDB, useDB } from '@/data/store'
import { ensureReceivables, updateContract } from '@/data/finance/receivables'
import type { FinancialContract } from '@/data/types'
import { DateInput, Field, MoneyInput, MoreOptions, NumberInput, Segmented, SheetLayout, TextArea, TitleInput } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { LockGate } from '@/components/layout/LockGate'
import { haptic } from '@/lib/haptics'

export default function ContractSheetGuarded(props: Parameters<typeof ContractSheet>[0]) {
  return (
    <LockGate area="dinheiro" compact>
      <ContractSheet {...props} />
    </LockGate>
  )
}

function ContractSheet({ id }: SheetProps<'contract'>) {
  const today = useToday()
  const existing = useDB((db) => db.contracts.find((c) => c.id === id))
  const [client, setClient] = useState(existing?.client ?? '')
  const [amount, setAmount] = useState<number | undefined>(existing?.amountCents)
  const [day, setDay] = useState<number | undefined>(existing?.paymentDay ?? 10)
  const [status, setStatus] = useState<FinancialContract['status']>(existing?.status ?? 'ativo')
  const [startDate, setStart] = useState(existing?.startDate)
  const [endDate, setEnd] = useState(existing?.endDate)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const valid = client.trim() && amount && day && day >= 1 && day <= 31

  const save = () => {
    if (!valid) return
    const patch = { client: client.trim(), amountCents: amount!, paymentDay: Math.round(day!), status, startDate, endDate, notes: notes || undefined }
    if (existing) {
      const undo = updateContract(existing.id, patch, today)
      toast('Contrato atualizado ✓ Meses ainda previstos seguem o novo valor.', { action: { label: 'Desfazer', run: undo } })
    } else {
      const c = actions.create('contracts', { ...patch, currency: 'BRL', recurrence: 'mensal', kind: 'pj', aliases: [client.trim().toLowerCase()] })
      ensureReceivables(today)
      toast('Contrato criado ✓', { action: { label: 'Desfazer', run: () => {
        for (const e of getDB().expenses.filter((x) => x.contractId === c.id && x.status === 'expected')) actions.remove('expenses', e.id)
        actions.remove('contracts', c.id)
      } } })
    }
    haptic('success')
    closeSheet()
  }

  return (
    <SheetLayout
      title={existing ? existing.client : 'Novo contrato'}
      eyebrow="recorrente · mensal"
      onClose={closeSheet}
      onDelete={existing ? () => { removeWithUndo('contracts', existing.id, 'Contrato apagado'); closeSheet() } : undefined}
      primary={{ label: existing ? 'Salvar' : 'Criar contrato', onClick: save, disabled: !valid }}
    >
      <TitleInput autoFocus={!existing} placeholder="Cliente" value={client} onChange={(e) => setClient(e.target.value)} />
      <Field label="Valor bruto por mês" hint="como está no contrato — sem descontar impostos">
        <MoneyInput valueCents={amount} onChange={setAmount} />
      </Field>
      <Field label="Dia previsto do pagamento">
        <NumberInput value={day} onChange={setDay} min={1} max={31} />
      </Field>
      <Field label="Situação">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'ativo', label: 'ativo' }, { value: 'pausado', label: 'pausado' }, { value: 'encerrado', label: 'encerrado' }]} />
      </Field>
      <MoreOptions>
        <Field label="Início">
          <DateInput value={startDate} onChange={setStart} />
        </Field>
        <Field label="Fim">
          <DateInput value={endDate} onChange={setEnd} />
        </Field>
        <Field label="Observação">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
