import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { TripItem } from '@/data/types'
import { PaymentPill, ReviewItems } from './TripItems'

const now = '2026-10-02T12:00:00.000Z'
let n = 0
function item(p: Partial<TripItem>): TripItem {
  return { id: `i${n++}`, createdAt: now, updatedAt: now, tripId: 't', section: 'reserva', title: 'x', status: 'a_confirmar', order: n, ...p }
}

afterEach(cleanup)

describe('PaymentPill', () => {
  it('shows its own label for each payment status', () => {
    render(
      <>
        <PaymentPill status="a_confirmar" />
        <PaymentPill status="pendente" />
        <PaymentPill status="pago" />
        <PaymentPill status="nao_se_aplica" />
      </>,
    )
    for (const l of ['A confirmar', 'Pendente', 'Pago', 'N/A']) expect(screen.getByLabelText(`Pagamento: ${l}`)).toBeTruthy()
  })
})

function Harness({ items }: { items: TripItem[] }) {
  const [g, setG] = useState<string | undefined>()
  return <ReviewItems items={items} group={g} onGroup={setG} />
}

describe('Revisar view', () => {
  const items = [
    item({ title: 'Safari', group: 'Safari', section: 'roteiro', date: '2026-11-14', endDate: '2026-11-15', paymentStatus: 'a_confirmar' }),
    item({ title: 'Hospedagem Cape Town', group: 'Accommodation', section: 'hospedagem' }),
    item({ title: 'Seguro', group: 'Documents', section: 'documento' }),
    item({ title: 'Já resolvido', group: 'Documents', status: 'confirmado' }),
  ]

  it('lists only a_confirmar items with "Revisar" wording and a separate payment pill', () => {
    render(<Harness items={items} />)
    expect(screen.queryByText('Já resolvido')).toBeNull()
    expect(screen.getAllByRole('button', { name: /Status: Revisar/ })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /Pagamento: A confirmar/ })).toHaveLength(1)
    expect(screen.getByText(/14 → 15 de nov\./)).toBeTruthy()
  })

  it('filters by sub-area chip', () => {
    render(<Harness items={items} />)
    fireEvent.click(screen.getByRole('button', { name: /^Documents/ }))
    expect(screen.getByText('Seguro')).toBeTruthy()
    expect(screen.queryByText('Hospedagem Cape Town')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tudo' }))
    expect(screen.getByText('Hospedagem Cape Town')).toBeTruthy()
  })
})
