/**
 * Modo viagem on Home: the expedition day (class, activities, the trip's training, next departure,
 * what she spent in the trip currency) in place of the São Paulo routine. Tap → the trip page.
 */
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { Card } from '@/components/ui'
import { shortDM } from '@/data/travel-mode'
import { formatShortDate } from '@/lib/date'
import { formatMoney } from '@/features/travel/expedition/logic'
import { schoolLine, type TripDay } from '@/features/travel/trip-day'

export function TripDayCard({ day }: { day: TripDay }) {
  const nav = useNavigate()
  const { trip, next, sports, school } = day
  const place = trip.expedition?.weather?.label ?? trip.place?.split(/[·(]/)[0]?.trim() ?? trip.name
  const cls = schoolLine(day)
  const end = trip.endDate ?? trip.startDate
  return (
    <Card onPress={() => nav(ROUTES.trip(trip.id))} aria-label={`Dia da viagem: ${trip.name}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow">
          {trip.flag} modo viagem · dia {day.dayNumber} de {day.totalDays} · {place}
        </div>
        <ChevronRight size={16} className="text-muted shrink-0" aria-hidden />
      </div>
      <ul className="mt-2.5 space-y-1.5 text-[14.5px] text-ink-2">
        {cls && (
          <li className="flex gap-2.5">
            <span aria-hidden className="w-5 shrink-0 text-center">🏫</span>
            <span className={school?.impact === 'dia' ? 'text-muted' : undefined}>{cls}</span>
          </li>
        )}
        {next && (
          <li className="flex gap-2.5">
            <span aria-hidden className="w-5 shrink-0 text-center">🚪</span>
            <span>
              Próxima saída{next.date !== day.date ? ` ${formatShortDate(next.date)}` : ''} <b className="font-sport text-ink">{next.at}</b> · {next.item.title}
            </span>
          </li>
        )}
        {sports.length > 0 && (
          <li className="flex gap-2.5">
            <span aria-hidden className="w-5 shrink-0 text-center">🏄‍♀️</span>
            <span>Treino do dia: {sports.map((s) => s.title).join(' · ')}</span>
          </li>
        )}
        {day.spentCents != null && (
          <li className="flex gap-2.5">
            <span aria-hidden className="w-5 shrink-0 text-center">💸</span>
            <span>Gasto hoje: {formatMoney(day.spentCents, day.currency)}</span>
          </li>
        )}
      </ul>
      {end && <p className="text-[12.5px] text-muted mt-3">Rotina de SP pausada até {shortDM(end)} — volta sozinha depois.</p>}
    </Card>
  )
}
