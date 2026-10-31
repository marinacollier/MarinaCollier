import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { flagOf } from '@/data/places/catalog'
import { countries, placeCounts, placeOffers } from '@/data/places/model'

/** The Trips page entry to "Lugares que conheci": the three numbers + flags, and a nudge when a trip just ended. */
export function PlacesEntry() {
  const places = useDB((db) => db.places)
  const trips = useDB((db) => db.trips)
  const acks = useDB((db) => db.attentionAcks)
  const today = useToday()
  const nav = useNavigate()
  const c = useMemo(() => placeCounts(places), [places])
  const flags = useMemo(() => [...countries(places).entries()].filter(([, a]) => a.status !== 'quero_ir').map(([code]) => flagOf(code)), [places])
  const offers = useMemo(() => placeOffers({ trips, places, attentionAcks: acks }, today).length, [trips, places, acks, today])

  return (
    <button type="button" onClick={() => nav(ROUTES.places)} className="w-full card p-4 text-left active:scale-[0.99] transition">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">lugares que conheci</div>
          <div className="font-display text-[19px] leading-snug mt-1">
            {c.countries} {c.countries === 1 ? 'país' : 'países'} · {c.brStates}/{c.brStatesTotal} estados · {c.local} lugares
          </div>
        </div>
        <ChevronRight size={18} className="text-muted/60 shrink-0" />
      </div>
      {(flags.length > 0 || offers > 0) && (
        <div className="flex items-center justify-between gap-3 mt-2.5">
          <span className="text-[20px] leading-none tracking-[0.15em]" aria-hidden>
            {flags.slice(0, 8).join('')}
          </span>
          {offers > 0 && <span className="text-[12.5px] text-accent shrink-0">{offers === 1 ? '1 viagem pra guardar' : `${offers} viagens pra guardar`}</span>}
        </div>
      )}
    </button>
  )
}
