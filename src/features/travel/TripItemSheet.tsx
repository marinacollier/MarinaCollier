import { useMemo, useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { TripItem, TripSection } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { DateInput, Field, MoneyInput, MoreOptions, Select, SheetLayout, TextArea, TextInput, TimeInput, TitleInput } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  PAYABLE_SECTIONS,
  PAYMENT_META,
  PAYMENT_ORDER,
  STATUS_META,
  STATUS_ORDER,
  SECTION_OPTIONS,
  defaultStatusFor,
  groupsOfTrip,
  itemsOfTrip,
  sortUpcoming,
  type ItemStatus,
  type PaymentStatus,
} from './selectors'

export default function TripItemSheet({ id, tripId, section: sectionProp, group: groupProp }: SheetProps<'tripItem'>) {
  const trips = useDB((db) => db.trips)
  const allItems = useDB((db) => db.tripItems)
  const today = useToday()
  const existing = useMemo(() => (id ? allItems.find((i) => i.id === id) : undefined), [allItems, id])

  const [trip, setTrip] = useState<string | undefined>(existing?.tripId ?? tripId ?? sortUpcoming(trips, today)[0]?.id ?? trips[0]?.id)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [section, setSection] = useState<TripSection>(existing?.section ?? sectionProp ?? 'quero_ir')
  const [group, setGroup] = useState(existing?.group ?? groupProp ?? '')
  const [status, setStatus] = useState<ItemStatus>(existing?.status ?? defaultStatusFor(sectionProp ?? 'quero_ir'))
  const [statusTouched, setStatusTouched] = useState(!!existing)
  const [date, setDate] = useState(existing?.date)
  const [time, setTime] = useState(existing?.time)
  const [endDate, setEndDate] = useState(existing?.endDate)
  const [payment, setPayment] = useState<PaymentStatus | undefined>(existing?.paymentStatus)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [amountCents, setAmountCents] = useState(existing?.amountCents)
  const [code, setCode] = useState(existing?.confirmationCode ?? '')

  const groups = useMemo(() => (trip ? groupsOfTrip(itemsOfTrip(allItems, trip)) : []), [allItems, trip])
  const showTripPicker = !existing && !tripId && trips.length > 1

  const save = () => {
    const t = title.trim()
    if (!t || !trip) return
    const u = url.trim()
    const patch = {
      tripId: trip,
      title: t,
      section,
      group: group.trim() || undefined,
      status,
      date,
      time: date ? time : undefined,
      endDate: date && endDate && endDate > date ? endDate : undefined,
      paymentStatus: payment,
      notes: notes.trim() || undefined,
      url: u ? (/^https?:\/\//i.test(u) ? u : `https://${u}`) : undefined,
      amountCents,
      confirmationCode: code.trim() || undefined,
    } satisfies Partial<TripItem>
    if (existing) {
      actions.update('tripItems', existing.id, patch)
      toast('Salvo ✓')
    } else {
      actions.create('tripItems', { ...patch, order: nextOrder(getDB().tripItems.filter((i) => i.tripId === trip)) })
      toast('Adicionado ✓')
    }
    closeSheet()
  }

  if (!trips.length) {
    return (
      <SheetLayout title="Primeiro, uma viagem" onClose={closeSheet}>
        <p className="text-[14px] text-muted">Crie uma viagem para guardar reservas, roteiro e mala dentro dela ✈️</p>
      </SheetLayout>
    )
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'editar item' : 'novo item'}
      onClose={closeSheet}
      primary={{ label: existing ? 'Salvar' : 'Adicionar', onClick: save, disabled: !title.trim() || !trip }}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('tripItems', existing.id, 'Item apagado')
            }
          : undefined
      }
    >
      <TitleInput autoFocus={!existing} placeholder="O quê?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />

      {showTripPicker && (
        <Field label="Viagem">
          <Select value={trip} onChange={setTrip} options={trips.map((t) => ({ value: t.id, label: `${t.flag} ${t.name}` }))} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Seção">
          <Select<TripSection>
            value={section}
            onChange={(v) => {
              if (!v) return
              setSection(v)
              if (!statusTouched) setStatus(defaultStatusFor(v))
            }}
            options={SECTION_OPTIONS}
          />
        </Field>
        <Field label="Grupo">
          <TextInput placeholder="ex.: Cape Town" value={group} onChange={(e) => setGroup(e.target.value)} list="trip-groups" />
          <datalist id="trip-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
      </div>
      {groups.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5 -mt-2">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(group === g ? '' : g)}
              className={cn('h-8 px-3 rounded-full text-[12.5px] shrink-0 border', group === g ? 'bg-ink text-bg border-ink' : 'border-line text-ink-2')}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Status</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s)
                setStatusTouched(true)
              }}
              className={cn('h-9 px-3.5 rounded-full text-[13px] font-semibold border-2 transition', STATUS_META[s].cls, status === s ? 'border-ink' : 'border-transparent opacity-80')}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
        {status === 'a_confirmar' && <p className="text-[12px] text-muted mt-1.5 px-0.5">Fica “a confirmar” até você ter certeza — nada é dado como garantido.</p>}
      </div>

      {(PAYABLE_SECTIONS.includes(section) || payment) && (
        <div>
          <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">Pagamento</div>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={payment === p}
                onClick={() => setPayment(payment === p ? undefined : p)}
                className={cn('h-9 px-3.5 rounded-full text-[13px] font-semibold border-2 transition', PAYMENT_META[p].cls, payment === p ? 'border-ink' : 'border-transparent opacity-80')}
              >
                {PAYMENT_META[p].label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted mt-1.5 px-0.5">{payment ? 'Separado da reserva — só muda quando você mudar.' : 'Opcional. Nada é marcado como pago sozinho.'}</p>
        </div>
      )}

      <MoreOptions defaultOpen={!!(existing && (existing.date || existing.notes || existing.url || existing.amountCents != null || existing.confirmationCode))}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Data">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Hora">
            <TimeInput value={time} onChange={setTime} disabled={!date} />
          </Field>
        </div>
        {date && (
          <Field label="Até (vários dias)">
            <DateInput value={endDate} onChange={setEndDate} min={date} />
          </Field>
        )}
        <Field label="Notas">
          <TextArea rows={3} placeholder="Detalhes, endereço, quem indicou…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Link">
          <TextInput inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Valor">
            <MoneyInput valueCents={amountCents} onChange={setAmountCents} />
          </Field>
          <Field label="Código de confirmação">
            <TextInput placeholder="ABC123" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        </div>
      </MoreOptions>
    </SheetLayout>
  )
}
