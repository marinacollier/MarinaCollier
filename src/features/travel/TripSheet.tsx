import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { ROUTES } from '@/app/routes'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { Tone, Trip } from '@/data/types'
import {
  ChipSelect,
  DateInput,
  Field,
  MoneyInput,
  MoreOptions,
  Segmented,
  SheetLayout,
  TextArea,
  TextInput,
  TitleInput,
  TONE,
  TONES,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { TRIP_STATUS_LABEL } from './selectors'

const STATUS_OPTIONS = (Object.keys(TRIP_STATUS_LABEL) as Trip['status'][]).map((value) => ({ value, label: TRIP_STATUS_LABEL[value] }))

type DateMode = 'datas' | 'rotulo'

/** Deletes the trip and its items together; "Desfazer" brings everything back. */
function deleteTripWithUndo(trip: Trip) {
  const items = getDB().tripItems.filter((i) => i.tripId === trip.id)
  actions.remove('trips', trip.id)
  for (const i of items) actions.remove('tripItems', i.id)
  toast(`${trip.name} apagada`, {
    action: {
      label: 'Desfazer',
      run: () => {
        actions.restore('trips', trip)
        for (const i of items) actions.restore('tripItems', i)
      },
    },
  })
}

export default function TripSheet({ id }: SheetProps<'trip'>) {
  const nav = useNavigate()
  const trips = useDB((db) => db.trips)
  const existing = useMemo(() => (id ? trips.find((t) => t.id === id) : undefined), [trips, id])

  const [name, setName] = useState(existing?.name ?? '')
  const [flag, setFlag] = useState(existing?.flag ?? '✈️')
  const [place, setPlace] = useState(existing?.place ?? '')
  const [mode, setMode] = useState<DateMode>(existing && !existing.startDate && existing.dateLabel ? 'rotulo' : 'datas')
  const [startDate, setStartDate] = useState(existing?.startDate)
  const [endDate, setEndDate] = useState(existing?.endDate)
  const [dateLabel, setDateLabel] = useState(existing?.dateLabel ?? '')
  const [datesConfirmed, setDatesConfirmed] = useState(existing?.datesConfirmed ?? false)
  const [summary, setSummary] = useState(existing?.summary ?? '')
  const [interests, setInterests] = useState<string[]>(existing?.interests ?? [])
  const [interestText, setInterestText] = useState('')
  const [companions, setCompanions] = useState(existing?.companions ?? '')
  const [budgetCents, setBudgetCents] = useState(existing?.budgetCents)
  const [tone, setTone] = useState<Tone>(existing?.tone ?? TONES[trips.length % 5])
  const [status, setStatus] = useState<Trip['status']>(existing?.status ?? 'planejando')

  const addInterest = () => {
    const parts = interestText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !interests.includes(s))
    if (parts.length) setInterests([...interests, ...parts])
    setInterestText('')
  }

  const save = () => {
    const title = name.trim()
    if (!title) return
    const pendingInterests = interestText.trim() ? [...interests, ...interestText.split(',').map((s) => s.trim()).filter(Boolean)] : interests
    const patch = {
      name: title,
      flag: flag.trim() || '✈️',
      place: place.trim() || undefined,
      startDate: mode === 'datas' ? startDate : undefined,
      endDate: mode === 'datas' && startDate && endDate && endDate >= startDate ? endDate : undefined,
      dateLabel: mode === 'rotulo' ? dateLabel.trim() || undefined : existing?.dateLabel,
      datesConfirmed: mode === 'datas' && !!startDate ? datesConfirmed : false,
      summary: summary.trim() || undefined,
      interests: [...new Set(pendingInterests)],
      companions: companions.trim() || undefined,
      budgetCents,
      tone,
      status,
    } satisfies Partial<Trip>
    if (existing) {
      actions.update('trips', existing.id, patch)
      toast('Viagem atualizada ✈️')
      closeSheet()
    } else {
      const t = actions.create('trips', { ...patch, links: [], order: nextOrder(getDB().trips) })
      toast('Nova viagem no mapa ✨', { tone: 'win' })
      closeSheet()
      nav(ROUTES.trip(t.id))
    }
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'editar viagem' : 'nova viagem'}
      title={existing ? existing.name : 'Pra onde? ✈️'}
      onClose={closeSheet}
      primary={{ label: existing ? 'Salvar' : 'Criar viagem', onClick: save, disabled: !name.trim() }}
      onDelete={
        existing
          ? () => {
              closeSheet()
              nav(ROUTES.trips)
              deleteTripWithUndo(existing)
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <input
          aria-label="Bandeira (emoji)"
          value={flag}
          onChange={(e) => setFlag(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="h-14 w-14 shrink-0 rounded-2xl bg-surface-2 text-center text-[28px] outline-none"
        />
        <TitleInput autoFocus={!existing} placeholder="Nome da viagem" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>

      <Field label="Lugar">
        <TextInput placeholder="Cidade, região, país…" value={place} onChange={(e) => setPlace(e.target.value)} />
      </Field>

      <div className="space-y-3">
        <Segmented<DateMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'datas', label: 'Tenho as datas' },
            { value: 'rotulo', label: 'Ainda flexível' },
          ]}
        />
        {mode === 'datas' ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Ida">
                <DateInput value={startDate} onChange={setStartDate} />
              </Field>
              <Field label="Volta">
                <DateInput value={endDate} min={startDate} onChange={setEndDate} />
              </Field>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={datesConfirmed}
              onClick={() => setDatesConfirmed((v) => !v)}
              className="w-full flex items-center justify-between gap-3 min-h-11 px-0.5 text-left"
            >
              <span>
                <span className="block text-[14.5px]">Datas confirmadas</span>
                <span className="block text-[12px] text-muted">{datesConfirmed ? 'passagem/reserva garantida' : 'ainda pode mudar — fica “a confirmar”'}</span>
              </span>
              <span className={cn('relative h-7 w-12 rounded-full transition-colors shrink-0', datesConfirmed ? 'bg-sage' : 'bg-line')}>
                <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition-all', datesConfirmed ? 'left-[22px]' : 'left-0.5')} />
              </span>
            </button>
          </>
        ) : (
          <Field label="Quando, mais ou menos" hint="Ex.: “out/nov 2026”, “Réveillon”, “algum feriado”">
            <TextInput placeholder="out/nov 2026" value={dateLabel} onChange={(e) => setDateLabel(e.target.value)} />
          </Field>
        )}
      </div>

      <MoreOptions defaultOpen={!!existing}>
        <Field label="Resumo">
          <TextArea rows={2} placeholder="A viagem em uma frase" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>

        <Field label="Interesses">
          <div className="space-y-2">
            {interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {interests.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setInterests(interests.filter((x) => x !== i))}
                    className="inline-flex items-center gap-1 h-8 pl-3 pr-2 rounded-full bg-surface-2 text-[13px] text-ink-2"
                    aria-label={`Remover ${i}`}
                  >
                    {i}
                    <X size={13} className="text-muted" />
                  </button>
                ))}
              </div>
            )}
            <TextInput
              placeholder="surf, trilha, vinícolas… (Enter)"
              value={interestText}
              onChange={(e) => setInterestText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addInterest()
                }
              }}
              onBlur={addInterest}
            />
          </div>
        </Field>

        <Field label="Companhia">
          <TextInput placeholder="solo, amigas, família…" value={companions} onChange={(e) => setCompanions(e.target.value)} />
        </Field>

        <Field label="Orçamento" hint="Opcional — os gastos com essa viagem somam sozinhos.">
          <MoneyInput valueCents={budgetCents} onChange={setBudgetCents} />
        </Field>

        <Field label="Cor do cartão-postal">
          <div className="flex gap-2.5">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={t}
                aria-pressed={tone === t}
                onClick={() => setTone(t)}
                className={cn('h-11 w-11 rounded-full flex items-center justify-center border-2 transition', tone === t ? 'border-ink' : 'border-transparent')}
              >
                <span className={cn('h-8 w-8 rounded-full', TONE[t].dot)} />
              </button>
            ))}
          </div>
        </Field>

        <Field label="Status">
          <ChipSelect value={status} onChange={(v) => v && setStatus(v)} options={STATUS_OPTIONS} />
        </Field>
      </MoreOptions>
    </SheetLayout>
  )
}
