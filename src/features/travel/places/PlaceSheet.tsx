import { useMemo, useState } from 'react'
import { closeSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import type { SheetProps } from '@/app/sheet-types'
import { actions, getDB, nextOrder, useDB } from '@/data/store'
import type { Place, PlaceKind, PlaceStatus } from '@/data/types'
import { allCountries, BR_UFS, flagOf } from '@/data/places/catalog'
import { PLACE_KIND_LABEL } from '@/data/places/model'
import { ChipSelect, Field, MultiChipSelect, Segmented, Select, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { cn } from '@/lib/cn'

const STATUS_OPTIONS: { value: PlaceStatus; label: string }[] = [
  { value: 'visitei', label: 'Visitei' },
  { value: 'moro', label: 'Moro aqui' },
  { value: 'quero_ir', label: 'Quero conhecer' },
]

const KIND_OPTIONS = (Object.keys(PLACE_KIND_LABEL) as PlaceKind[]).map((value) => ({ value, label: PLACE_KIND_LABEL[value] }))
const UF_OPTIONS = BR_UFS.map((u) => ({ value: u.uf, label: `${u.name} · ${u.uf}` })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

/** The broader place it sits in, among her records (city → its state → its country). */
function parentFor(places: Place[], self: string | undefined, kind: PlaceKind, country: string, uf: string | undefined): string | undefined {
  if (kind === 'pais') return undefined
  const others = places.filter((p) => p.id !== self)
  const state = country === 'BR' && uf && kind !== 'estado' ? others.find((p) => p.kind === 'estado' && p.uf === uf) : undefined
  return (state ?? others.find((p) => p.kind === 'pais' && p.country === country))?.id
}

export default function PlaceSheet({ id, defaults, fromTripId }: SheetProps<'place'>) {
  const places = useDB((db) => db.places)
  const trips = useDB((db) => db.trips)
  const existing = useMemo(() => (id ? places.find((p) => p.id === id) : undefined), [places, id])
  const start = existing ?? defaults

  const [name, setName] = useState(start?.name ?? '')
  const [status, setStatus] = useState<PlaceStatus>(start?.status ?? 'visitei')
  const [kind, setKind] = useState<PlaceKind>(start?.kind ?? 'cidade')
  const [country, setCountry] = useState(start?.country ?? 'BR')
  const [uf, setUf] = useState<string | undefined>(start?.uf)
  const [firstVisit, setFirstVisit] = useState(start?.firstVisit ?? '')
  const [tripIds, setTripIds] = useState<string[]>(start?.tripIds ?? (fromTripId ? [fromTripId] : []))
  const [favorite, setFavorite] = useState(!!start?.favorite)
  const [notes, setNotes] = useState(start?.notes ?? '')

  const countryOptions = useMemo(() => allCountries().map((c) => ({ value: c.code, label: `${flagOf(c.code)} ${c.name}` })), [])
  const showUf = country === 'BR' && kind !== 'pais'
  const tripOptions = useMemo(() => [...trips].sort((a, b) => a.order - b.order).map((t) => ({ value: t.id, label: `${t.flag} ${t.name}` })), [trips])

  const save = () => {
    const title = name.trim()
    if (!title) return
    const db = getDB()
    const fixedUf = showUf ? uf : undefined
    const patch = {
      name: title,
      status,
      kind,
      country,
      uf: fixedUf,
      parentId: parentFor(db.places, existing?.id, kind, country, fixedUf),
      firstVisit: firstVisit.trim() || undefined,
      tripIds: tripIds.length ? tripIds : undefined,
      favorite: favorite || undefined,
      notes: notes.trim() || undefined,
    } satisfies Partial<Place>
    if (existing) {
      actions.update('places', existing.id, patch)
      toast('Lugar atualizado 🌍')
    } else {
      actions.create('places', { ...patch, source: 'marina', order: nextOrder(db.places) })
      toast(status === 'quero_ir' ? `${title} no Quero conhecer ✨` : `${title} nos seus lugares 🌍`, { tone: 'win' })
    }
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'editar lugar' : fromTripId ? 'da sua viagem' : 'novo lugar'}
      title={existing ? existing.name : 'Onde você esteve? 🌍'}
      onClose={closeSheet}
      primary={{ label: existing ? 'Salvar' : 'Guardar lugar', onClick: save, disabled: !name.trim() }}
      onDelete={
        existing
          ? () => {
              closeSheet()
              removeWithUndo('places', existing.id, `${existing.name} saiu dos seus lugares`)
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <span className="h-14 w-14 shrink-0 rounded-2xl bg-surface-2 flex items-center justify-center text-[28px]" aria-hidden>
          {flagOf(country)}
        </span>
        <TitleInput autoFocus={!existing} placeholder="Cidade, estado, país…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>

      <Segmented<PlaceStatus> value={status} onChange={setStatus} options={STATUS_OPTIONS} />

      <Field label="É um(a)…">
        <ChipSelect value={kind} onChange={(v) => v && setKind(v)} options={KIND_OPTIONS} />
      </Field>

      <div className={cn('grid gap-2.5', showUf ? 'grid-cols-2' : 'grid-cols-1')}>
        <Field label="País">
          <Select value={country} onChange={(v) => v && setCountry(v)} options={countryOptions} />
        </Field>
        {showUf && (
          <Field label="Estado">
            <Select value={uf} onChange={setUf} options={UF_OPTIONS} placeholder="—" />
          </Field>
        )}
      </div>

      <Field label="Primeira vez" hint="Do jeito que você lembrar: “2019”, “jul/2023”, “criança”. Pode deixar em branco.">
        <TextInput placeholder="quando foi?" value={firstVisit} onChange={(e) => setFirstVisit(e.target.value)} />
      </Field>

      {tripOptions.length > 0 && (
        <Field label="Viagens">
          <MultiChipSelect value={tripIds} onChange={setTripIds} options={tripOptions} />
        </Field>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={favorite}
        onClick={() => setFavorite((v) => !v)}
        className="w-full flex items-center justify-between gap-3 min-h-11 px-0.5 text-left"
      >
        <span className="text-[14.5px]">Um dos meus lugares favoritos 💛</span>
        <span className={cn('relative h-7 w-12 rounded-full transition-colors shrink-0', favorite ? 'bg-sage' : 'bg-line')}>
          <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition-all', favorite ? 'left-[22px]' : 'left-0.5')} />
        </span>
      </button>

      <Field label="Notas">
        <TextArea rows={2} placeholder="O que ficou na memória…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </SheetLayout>
  )
}
