import { useMemo, useState } from 'react'
import { Plus, Search, Star, X } from 'lucide-react'
import { useDB, actions } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { Button, Chip, IconButton, Page, PageHeader, SectionTitle, Segmented } from '@/components/ui'
import type { Place } from '@/data/types'
import { BR_UFS, countryName, flagOf, ufInfo } from '@/data/places/catalog'
import {
  brStates,
  byOrder,
  countries,
  isKnown,
  isLocal,
  PLACE_KIND_LABEL,
  placeCounts,
  placeKey,
  placeOfferKey,
  placeOffers,
  wishes,
  type AreaInfo,
} from '@/data/places/model'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { BrazilGrid } from './BrazilGrid'

type Scope = 'todos' | 'brasil' | 'mundo'

interface Group {
  key: string
  title: string
  leading: string
  info: AreaInfo
  items: Place[]
  onHeader: () => void
}

const edit = (p: Place) => openSheet('place', { id: p.id })

function Stat({ value, total, label }: { value: number; total?: number; label: string }) {
  return (
    <div className="flex-1 min-w-0 text-center px-1">
      <div className="font-display text-[34px] leading-none tracking-tight">
        {value}
        {total !== undefined && <span className="text-muted text-[17px]">/{total}</span>}
      </div>
      <div className="text-[12px] text-muted mt-1.5 leading-tight">{label}</div>
    </div>
  )
}

function areaSub(info: AreaInfo): string {
  if (info.status === 'moro') return 'moro aqui'
  if (info.record && isKnown(info.record)) return info.record.firstVisit ? `desde ${info.record.firstVisit}` : 'conheço'
  return info.via.length ? `por ${info.via.map((p) => p.name).join(', ')}` : 'conheço'
}

function PlaceRow({ p }: { p: Place }) {
  return (
    <button type="button" onClick={() => edit(p)} className="w-full flex items-center gap-3 min-h-[48px] py-2 pl-11 pr-4 text-left active:bg-surface-2 transition-colors">
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-snug truncate">
          {p.name}
          {p.favorite && <Star size={12} className="inline ml-1.5 -mt-0.5 text-sand fill-current" aria-label="favorito" />}
        </span>
        <span className="block text-[12.5px] text-muted truncate">
          {[PLACE_KIND_LABEL[p.kind], p.status === 'moro' ? 'moro aqui' : undefined, p.firstVisit, p.notes].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  )
}

function GroupCard({ g }: { g: Group }) {
  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={g.onHeader} className="w-full flex items-center gap-3 min-h-[56px] px-4 text-left active:bg-surface-2 transition-colors">
        <span className="w-7 text-center text-[20px] leading-none shrink-0" aria-hidden>
          {g.leading}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display text-[18px] leading-tight truncate">{g.title}</span>
          <span className="block text-[12.5px] text-muted truncate">{areaSub(g.info)}</span>
        </span>
        {g.info.status === 'moro' && <span className="text-[11px] uppercase tracking-wider text-accent shrink-0">casa</span>}
      </button>
      {g.items.length > 0 && (
        <div className="divide-y divide-line/60 border-t border-line/60">
          {g.items.map((p) => (
            <PlaceRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlacesPage() {
  const places = useDB((db) => db.places)
  const trips = useDB((db) => db.trips)
  const acks = useDB((db) => db.attentionAcks)
  const today = useToday()
  const nav = useNavigate()
  const [scope, setScope] = useState<Scope>('todos')
  const [uf, setUf] = useState<string>()
  const [query, setQuery] = useState('')

  const counts = useMemo(() => placeCounts(places), [places])
  const offers = useMemo(() => placeOffers({ trips, places, attentionAcks: acks }, today), [trips, places, acks, today])
  const states = useMemo(() => brStates(places), [places])
  const nations = useMemo(() => countries(places), [places])

  const q = placeKey(query)
  const hit = (s: string) => !q || placeKey(s).includes(q)

  const brGroups = useMemo<Group[]>(() => {
    const out: Group[] = []
    for (const u of [...BR_UFS].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) {
      const info = states.get(u.uf)
      if (!info || info.status === 'quero_ir') continue
      const items = places.filter((p) => p.country === 'BR' && p.uf === u.uf && isLocal(p) && isKnown(p)).sort(byOrder)
      out.push({
        key: u.uf,
        title: u.name,
        leading: u.uf,
        info,
        items,
        onHeader: () => (info.record ? edit(info.record) : openSheet('place', { defaults: { name: u.name, kind: 'estado', country: 'BR', uf: u.uf, status: 'visitei' } })),
      })
    }
    return out
  }, [places, states])

  const worldGroups = useMemo<Group[]>(() => {
    const out: Group[] = []
    for (const [code, info] of nations) {
      if (code === 'BR' || info.status === 'quero_ir') continue
      const items = places.filter((p) => p.country === code && p.kind !== 'pais' && isKnown(p)).sort(byOrder)
      const name = info.record?.name ?? countryName(code)
      out.push({
        key: code,
        title: name,
        leading: flagOf(code),
        info,
        items,
        onHeader: () => (info.record ? edit(info.record) : openSheet('place', { defaults: { name, kind: 'pais', country: code, status: 'visitei' } })),
      })
    }
    return out.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
  }, [places, nations])

  const filterGroup = (g: Group): Group | undefined => {
    if (uf && g.key !== uf) return undefined
    if (!q || hit(g.title)) return g
    const items = g.items.filter((p) => hit(p.name))
    return items.length ? { ...g, items } : undefined
  }
  const shownBR = scope === 'mundo' ? [] : brGroups.map(filterGroup).filter((g): g is Group => !!g)
  const shownWorld = scope === 'brasil' || uf ? [] : worldGroups.map(filterGroup).filter((g): g is Group => !!g)
  const knownCountries = [...nations.entries()].filter(([, a]) => a.status !== 'quero_ir')
  const allWishes = useMemo(() => wishes({ trips, places }, today), [trips, places, today])
  const wishList = allWishes
    .filter((w) => (scope === 'brasil' ? w.country === 'BR' : scope === 'mundo' ? w.country !== 'BR' : true))
    .filter((w) => !uf || w.uf === uf)
    .filter((w) => hit(w.name))
  const filtering = !!q || !!uf || scope !== 'todos'

  return (
    <Page>
      <PageHeader
        back
        backTo={ROUTES.trips}
        title="Lugares que conheci"
        subtitle="Brasil e mundo afora — conhecer o mundo 🌍"
        actions={
          <IconButton label="Novo lugar" onClick={() => openSheet('place', {})}>
            <Plus size={22} />
          </IconButton>
        }
      />

      <section aria-label="Resumo" className="card py-5 flex items-start divide-x divide-line/70">
        <Stat value={counts.countries} label={counts.countries === 1 ? 'país' : 'países'} />
        <Stat value={counts.brStates} total={counts.brStatesTotal} label="estados do Brasil" />
        <Stat value={counts.local} label="cidades e lugares" />
      </section>

      {offers.length > 0 && (
        <section aria-label="Viagens que terminaram" className="mt-4 space-y-2.5">
          {offers.map((o) => (
            <div key={o.trip.id} className="card p-4">
              <div className="eyebrow">viagem que terminou</div>
              <p className="text-[15px] mt-1">
                {o.trip.flag} {o.trip.name} acabou. Guardar <span className="font-medium">{o.name}</span> nos seus lugares?
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => openSheet('place', { defaults: { name: o.name, kind: o.kind, country: o.country ?? 'BR', uf: o.uf, status: 'visitei' }, fromTripId: o.trip.id })}
                >
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => actions.create('attentionAcks', { key: placeOfferKey(o.trip.id), how: 'dismissed' })}>
                  Agora não
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      <SectionTitle>Brasil</SectionTitle>
      <div className="card p-4 pb-3.5">
        <BrazilGrid
          places={places}
          selected={uf}
          onTile={(code, known) => {
            if (known || states.get(code)) setUf((cur) => (cur === code ? undefined : code))
            else openSheet('place', { defaults: { name: ufInfo(code)?.name, kind: 'estado', country: 'BR', uf: code, status: 'visitei' } })
          }}
        />
        <p className="text-center text-[12px] text-muted mt-2.5">Toque num estado pra filtrar · num vazio pra registrar</p>
      </div>

      {knownCountries.length > 0 && (
        <>
          <SectionTitle>Países</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {knownCountries.map(([code, a]) => (
              <button
                key={code}
                type="button"
                onClick={() => (a.record ? edit(a.record) : setScope(code === 'BR' ? 'brasil' : 'mundo'))}
                className="inline-flex items-center gap-2 h-10 pl-3 pr-3.5 rounded-full bg-surface border border-line text-[14px] active:scale-[0.98] transition"
              >
                <span className="text-[18px] leading-none" aria-hidden>
                  {flagOf(code)}
                </span>
                {a.record?.name ?? countryName(code)}
                {a.status === 'moro' && <span className="text-[11px] text-muted">· casa</span>}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-7 space-y-2.5">
        <Segmented<Scope>
          value={scope}
          onChange={(v) => {
            setScope(v)
            if (v === 'mundo') setUf(undefined)
          }}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'brasil', label: 'Brasil' },
            { value: 'mundo', label: 'Mundo' },
          ]}
        />
        <div className="flex items-center gap-2">
          <label className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar lugar…" aria-label="Procurar lugar" className="input pl-9 min-h-11" />
          </label>
          {uf && (
            <Chip selected onClick={() => setUf(undefined)}>
              {uf} <X size={13} />
            </Chip>
          )}
        </div>
      </div>

      {shownBR.length > 0 && (
        <>
          <SectionTitle>Pelo Brasil</SectionTitle>
          <div className="space-y-2.5">
            {shownBR.map((g) => (
              <GroupCard key={g.key} g={g} />
            ))}
          </div>
        </>
      )}

      {shownWorld.length > 0 && (
        <>
          <SectionTitle>Mundo afora</SectionTitle>
          <div className="space-y-2.5">
            {shownWorld.map((g) => (
              <GroupCard key={g.key} g={g} />
            ))}
          </div>
        </>
      )}

      {filtering && !shownBR.length && !shownWorld.length && !wishList.length && <p className="text-center text-[14px] text-muted mt-8">Nada por aqui com esse filtro.</p>}

      <SectionTitle>Quero conhecer</SectionTitle>
      {wishList.length ? (
        <div className="card overflow-hidden divide-y divide-line/60">
          {wishList.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => (w.place ? edit(w.place) : w.trip ? nav(ROUTES.trip(w.trip.id)) : undefined)}
              className="w-full flex items-center gap-3 min-h-[52px] px-4 text-left active:bg-surface-2 transition-colors"
            >
              <span className="text-[20px] leading-none w-7 text-center" aria-hidden>
                {w.country ? flagOf(w.country) : w.trip?.flag || '✨'}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] truncate">{w.name}</span>
                <span className="block text-[12.5px] text-muted truncate">
                  {[
                    w.place ? PLACE_KIND_LABEL[w.kind] : undefined,
                    w.country && w.country !== 'BR' && w.kind !== 'pais' ? countryName(w.country) : w.uf,
                    w.trip ? (w.trip.status === 'sonhando' ? 'sonho de viagem 💭' : 'viagem em planejamento') : undefined,
                    w.place?.notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => openSheet('place', { defaults: { status: 'quero_ir' } })}
          className={cn('w-full card border-dashed p-4 flex items-center gap-3 text-left active:scale-[0.99] transition')}
        >
          <span className="text-2xl" aria-hidden>
            🧭
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[17px]">Algum lugar te chamando?</span>
            <span className="block text-[13px] text-muted">Guarda aqui — não conta nos lugares que você conhece.</span>
          </span>
        </button>
      )}

      <div className="mt-8 flex justify-center">
        <Button variant="soft" icon={<Plus size={17} />} onClick={() => openSheet('place', {})}>
          Novo lugar
        </Button>
      </div>
    </Page>
  )
}
